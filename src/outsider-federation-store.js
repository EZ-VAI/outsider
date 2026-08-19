/* Durable, transport-neutral registry for verified Global Outsider packets. */

import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync,
  writeFileSync } from "node:fs";
import path from "node:path";
import { canonicalizeStrict, sha256 } from "./canonical.js";
import { createFederatedSupervisionRecord, FEDERATION_SCHEMAS,
  GlobalOutsiderRegistry, verifyFederatedEvidencePacket,
  verifyFederationTrustStore } from "./outsider-federation.js";

const HASH = /^sha256:[a-f0-9]{64}$/;
const REGISTRY_FILE = "federation-registry.json";
const TRUST_FILE = "federation-trust-store.json";

function addressed(body) {
  canonicalizeStrict(body);
  return Object.freeze({ ...body, recordHash: sha256(body) });
}

function atomicJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  if (existsSync(file) && lstatSync(file).isSymbolicLink()) {
    throw new Error("FEDERATION_STORE_SYMLINK_REFUSED");
  }
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, file);
}

function readJson(file) {
  if (lstatSync(file).isSymbolicLink()) throw new Error("FEDERATION_STORE_SYMLINK_REFUSED");
  return JSON.parse(readFileSync(file, "utf8"));
}

function packetFile(directory, hash) {
  if (!HASH.test(String(hash ?? ""))) throw new Error("FEDERATION_STORE_HASH_INVALID");
  return path.join(directory, "packets", `${hash.slice("sha256:".length)}.json`);
}

function supervisionFile(directory, hash) {
  if (!HASH.test(String(hash ?? ""))) throw new Error("FEDERATION_STORE_HASH_INVALID");
  return path.join(directory, "supervision", `${hash.slice("sha256:".length)}.json`);
}

function registryRecord(registry, trustStore, registryId) {
  const checked = registry.verify();
  if (!checked.ok) throw new Error("FEDERATION_STORE_REGISTRY_INVALID");
  return addressed({ schema: FEDERATION_SCHEMAS.registry, registryId,
    trustStoreHash: trustStore.recordHash, entries: registry.entries,
    head: registry.head, packetCount: registry.entries.length,
    institutionalIndependence: "NOT_ESTABLISHED_BY_KEYS_OR_CONFIGURATION",
    authority: { federationAuthority: "none", executionAuthority: false,
      permitsPricing: false, permitsSettlement: false, movesFunds: false } });
}

export class DurableGlobalOutsiderRegistry {
  constructor({ directory, trustStore, registryId = "global-outsider" } = {}) {
    if (!directory || typeof directory !== "string") {
      throw new Error("FEDERATION_STORE_DIRECTORY_REQUIRED");
    }
    if (!verifyFederationTrustStore(trustStore).ok) {
      throw new Error("FEDERATION_STORE_TRUST_INVALID");
    }
    this.directory = path.resolve(directory);
    this.trustStore = trustStore;
    this.registryId = registryId;
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    mkdirSync(path.join(this.directory, "packets"), { recursive: true, mode: 0o700 });
    mkdirSync(path.join(this.directory, "supervision"), { recursive: true, mode: 0o700 });
    const trustFile = path.join(this.directory, TRUST_FILE);
    if (existsSync(trustFile)) {
      const diskTrust = readJson(trustFile);
      if (diskTrust.recordHash !== trustStore.recordHash
        || !verifyFederationTrustStore(diskTrust).ok) {
        throw new Error("FEDERATION_STORE_TRUST_DRIFT");
      }
    } else atomicJson(trustFile, trustStore);
    this.registry = new GlobalOutsiderRegistry({ trustStore, registryId });
    const registryFile = path.join(this.directory, REGISTRY_FILE);
    if (existsSync(registryFile)) this.#restore(readJson(registryFile));
    else atomicJson(registryFile, registryRecord(this.registry, trustStore, registryId));
  }

  #restore(record) {
    const { recordHash, ...body } = record ?? {};
    if (record?.schema !== FEDERATION_SCHEMAS.registry
      || recordHash !== sha256(body) || record.registryId !== this.registryId
      || record.trustStoreHash !== this.trustStore.recordHash
      || !Array.isArray(record.entries) || record.packetCount !== record.entries.length) {
      throw new Error("FEDERATION_STORE_LEDGER_INVALID");
    }
    for (const expected of record.entries) {
      const file = packetFile(this.directory, expected.packetHash);
      if (!existsSync(file)) throw new Error("FEDERATION_STORE_PACKET_MISSING");
      const packet = readJson(file);
      if (packet.recordHash !== expected.packetHash
        || !verifyFederatedEvidencePacket(packet, this.trustStore).ok) {
        throw new Error("FEDERATION_STORE_PACKET_INVALID");
      }
      const appended = this.registry.append(packet);
      const actual = this.registry.entries.at(-1);
      if (!appended.appended || canonicalizeStrict(actual) !== canonicalizeStrict(expected)) {
        throw new Error("FEDERATION_STORE_CHAIN_INVALID");
      }
    }
    if (this.registry.head !== record.head) throw new Error("FEDERATION_STORE_HEAD_INVALID");
  }

  append(packet) {
    const checked = verifyFederatedEvidencePacket(packet, this.trustStore);
    if (!checked.ok) {
      throw new Error(`FEDERATION_STORE_PACKET_INVALID:${checked.failures.join("|")}`);
    }
    const result = this.registry.append(packet);
    if (!result.appended) return result;
    const supervision = createFederatedSupervisionRecord(packet, this.trustStore);
    atomicJson(packetFile(this.directory, packet.recordHash), packet);
    atomicJson(supervisionFile(this.directory, packet.recordHash), supervision);
    atomicJson(path.join(this.directory, REGISTRY_FILE),
      registryRecord(this.registry, this.trustStore, this.registryId));
    return Object.freeze({ ...result, packetHash: packet.recordHash,
      supervisionHash: supervision.recordHash });
  }

  packetForTenant(recordHash, tenantHash) {
    const allowed = this.registry.packetForTenant(recordHash, tenantHash);
    if (!allowed) return null;
    const packet = readJson(packetFile(this.directory, recordHash));
    return verifyFederatedEvidencePacket(packet, this.trustStore).ok ? packet : null;
  }

  supervision(recordHash) {
    const file = supervisionFile(this.directory, recordHash);
    if (!existsSync(file)) return null;
    const record = readJson(file), { recordHash: actual, ...body } = record;
    return actual === sha256(body) && record.packetHash === recordHash ? record : null;
  }

  verify() {
    try {
      const ledger = readJson(path.join(this.directory, REGISTRY_FILE));
      const restored = new DurableGlobalOutsiderRegistry({ directory: this.directory,
        trustStore: this.trustStore, registryId: this.registryId });
      return Object.freeze({ ok: restored.registry.verify().ok,
        entries: ledger.entries.length, head: ledger.head,
        recordHash: ledger.recordHash, failures: [] });
    } catch (error) {
      return Object.freeze({ ok: false, entries: 0, head: null, recordHash: null,
        failures: [error?.message ?? String(error)] });
    }
  }

  summary() {
    const verified = this.verify();
    return Object.freeze({ schema: "outsider/global-registry-status/v1",
      registryId: this.registryId, directory: this.directory,
      trustStoreHash: this.trustStore.recordHash, ...verified,
      institutionalIndependence: "NOT_ESTABLISHED_BY_KEYS_OR_CONFIGURATION",
      authority: "none", permitsPricing: false, movesFunds: false });
  }
}

export function openFederationRegistry(options) {
  return new DurableGlobalOutsiderRegistry(options);
}
