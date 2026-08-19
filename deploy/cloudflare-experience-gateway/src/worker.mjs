import { DurableObject } from "cloudflare:workers";
import { createPrivateKey, createPublicKey } from "node:crypto";
import {
  CONTRIBUTION_POLICY_VERSION, CONTRIBUTION_PURPOSES,
  contributionDigest, contributionKeyId, createContributionChallenge,
  createContributionReceipt, createContributionRevocationReceipt,
  verifyContributionEnvelope, verifyContributionRevocation,
} from "../../../src/outsider-experience-contribution.js";

const HASH = /^sha256:[a-f0-9]{64}$/;
const GENESIS = contributionDigest("outsider/contribution-registry/genesis/v1");
const JSON_HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
  "referrer-policy": "no-referrer",
});

function json(status, value, extra = {}) {
  return new Response(`${JSON.stringify(value)}\n`, {
    status, headers: { ...JSON_HEADERS, ...extra },
  });
}

function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

async function bodyJson(request, maxBytes) {
  const type = request.headers.get("content-type")?.split(";", 1)[0]?.trim();
  if (type !== "application/json") throw new Error("CONTRIBUTION_CONTENT_TYPE_INVALID");
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error("CONTRIBUTION_BODY_TOO_LARGE");
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.length || bytes.byteLength > maxBytes) {
    throw new Error("CONTRIBUTION_BODY_TOO_LARGE");
  }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new Error("CONTRIBUTION_BODY_INVALID_JSON"); }
}

function serverPublicKey(privateKeyPem) {
  return createPublicKey(createPrivateKey(privateKeyPem))
    .export({ type: "spki", format: "pem" }).toString();
}

function publicAudience(request, env) {
  const configured = String(env.PUBLIC_AUDIENCE ?? "").trim().replace(/\/$/, "");
  return configured || new URL(request.url).origin;
}

function acceptedInstrumentHashes(env) {
  const values = String(env.ACCEPTED_INSTRUMENT_HASHES ?? "")
    .split(",").map((value) => value.trim()).filter(Boolean);
  if (values.some((value) => !HASH.test(value))) {
    throw new Error("CONTRIBUTION_INSTRUMENT_ALLOWLIST_INVALID");
  }
  return new Set(values);
}

function one(sql, query, ...bindings) {
  return sql.exec(query, ...bindings).toArray()[0] ?? null;
}

function errorResponse(error) {
  const code = String(error?.message ?? error).split(":", 1)[0];
  const status = code === "CONTRIBUTION_ROUTE_NOT_FOUND" ? 404
    : code === "CONTRIBUTION_BODY_TOO_LARGE" ? 413
      : code.includes("RATE_LIMIT") ? 429
        : code.includes("REVOKED") || code.includes("ALREADY_USED") ? 409 : 400;
  return json(status, { ok: false, error: code });
}

function receiptReasons(recognized) {
  const reasons = ["PENDING_CURATE_REVIEW", "CORRELATION_NOT_YET_DISCOUNTED",
    "OWNER_CONFIRMATION_ABSENT", "EXTERNAL_ADJUDICATION_ABSENT"];
  if (!recognized) reasons.push("INSTRUMENT_NOT_IN_SERVER_ALLOWLIST");
  return reasons;
}

export class ExperienceRegistry extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS challenges (
        nonce TEXT PRIMARY KEY,
        challenge_id TEXT NOT NULL UNIQUE,
        challenge_hash TEXT NOT NULL UNIQUE,
        device_key_id TEXT NOT NULL,
        record_hash TEXT NOT NULL,
        issued_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used_at TEXT,
        envelope_hash TEXT,
        challenge_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS challenges_device_time
        ON challenges(device_key_id, issued_at);
      CREATE TABLE IF NOT EXISTS contributions (
        record_hash TEXT PRIMARY KEY,
        envelope_hash TEXT NOT NULL UNIQUE,
        contributor_key_id TEXT NOT NULL,
        consent_hash TEXT NOT NULL,
        received_at TEXT NOT NULL,
        retention_until TEXT NOT NULL,
        evidence_level TEXT NOT NULL,
        receipt_hash TEXT NOT NULL UNIQUE,
        envelope_json TEXT,
        receipt_json TEXT,
        purged_at TEXT
      );
      CREATE INDEX IF NOT EXISTS contributions_contributor
        ON contributions(contributor_key_id);
      CREATE TABLE IF NOT EXISTS registry_entries (
        ordinal INTEGER PRIMARY KEY,
        entry_hash TEXT NOT NULL UNIQUE,
        previous_entry_hash TEXT NOT NULL,
        record_hash TEXT NOT NULL UNIQUE,
        envelope_hash TEXT NOT NULL,
        receipt_hash TEXT NOT NULL,
        contributor_key_id TEXT NOT NULL,
        consent_hash TEXT NOT NULL,
        received_at TEXT NOT NULL,
        evidence_level TEXT NOT NULL,
        disposition TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS blocked_contributors (
        contributor_key_id TEXT PRIMARY KEY,
        consent_hash TEXT NOT NULL,
        revocation_hash TEXT NOT NULL UNIQUE,
        blocked_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS revocations (
        revocation_hash TEXT PRIMARY KEY,
        contributor_key_id TEXT NOT NULL,
        consent_hash TEXT NOT NULL,
        requested_at TEXT NOT NULL,
        processed_at TEXT NOT NULL,
        deleted_contributions INTEGER NOT NULL,
        acknowledgment_hash TEXT NOT NULL UNIQUE,
        acknowledgment_json TEXT NOT NULL
      );
    `);
  }

  info(request) {
    const publicKeyPem = serverPublicKey(this.env.SERVER_PRIVATE_KEY_PEM);
    return {
      schema: "outsider/experience-contribution-server/v1",
      registryId: this.env.REGISTRY_ID,
      audience: publicAudience(request, this.env),
      serverKeyId: contributionKeyId(publicKeyPem),
      serverPublicKeyPem: publicKeyPem,
      policyVersion: CONTRIBUTION_POLICY_VERSION,
      acceptedPurposes: CONTRIBUTION_PURPOSES,
      defaultDisposition: "QUARANTINED",
      retentionEnforced: true,
      signedRevocationSupported: true,
      permitsPricing: false,
      permitsGuarantee: false,
      permitsSettlement: false,
    };
  }

  async challenge(request) {
    const input = await bodyJson(request, 4096);
    if (!exactKeys(input, ["deviceKeyId", "experienceRecordHash"])
      || !HASH.test(String(input.deviceKeyId ?? ""))
      || !HASH.test(String(input.experienceRecordHash ?? ""))) {
      throw new Error("CONTRIBUTION_CHALLENGE_INPUT_INVALID");
    }
    if (one(this.sql, "SELECT contributor_key_id FROM blocked_contributors WHERE contributor_key_id = ?",
      input.deviceKeyId)) throw new Error("CONTRIBUTION_CONTRIBUTOR_REVOKED");
    const cutoff = new Date(Date.now() - 60_000).toISOString();
    const recent = one(this.sql, `SELECT COUNT(*) AS count FROM challenges
      WHERE device_key_id = ? AND issued_at >= ?`, input.deviceKeyId, cutoff);
    if (Number(recent?.count ?? 0) >= 12) throw new Error("CONTRIBUTION_DEVICE_RATE_LIMITED");
    const challenge = createContributionChallenge({ deviceKeyId: input.deviceKeyId,
      experienceRecordHash: input.experienceRecordHash,
      audience: publicAudience(request, this.env),
      privateKeyPem: this.env.SERVER_PRIVATE_KEY_PEM });
    this.sql.exec(`INSERT INTO challenges
      (nonce, challenge_id, challenge_hash, device_key_id, record_hash, issued_at,
       expires_at, challenge_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    challenge.nonce, challenge.challengeId, challenge.challengeHash,
    challenge.deviceKeyId, challenge.experienceRecordHash, challenge.issuedAt,
    challenge.expiresAt, JSON.stringify(challenge));
    return json(200, challenge);
  }

  async ingest(request) {
    const envelope = await bodyJson(request, 2 * 1024 * 1024);
    const nonce = String(envelope?.challenge?.nonce ?? "");
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(nonce)) {
      throw new Error("CONTRIBUTION_NONCE_INVALID");
    }
    const row = one(this.sql, "SELECT * FROM challenges WHERE nonce = ?", nonce);
    if (!row) throw new Error("CONTRIBUTION_CHALLENGE_NOT_FOUND");
    if (row.used_at != null) throw new Error("CONTRIBUTION_CHALLENGE_ALREADY_USED");
    if (one(this.sql, "SELECT contributor_key_id FROM blocked_contributors WHERE contributor_key_id = ?",
      envelope?.device?.keyId ?? "")) throw new Error("CONTRIBUTION_CONTRIBUTOR_REVOKED");
    const challenge = JSON.parse(row.challenge_json);
    const receivedAt = new Date().toISOString();
    const checked = verifyContributionEnvelope(envelope, { challenge,
      serverPublicKeyPem: serverPublicKey(this.env.SERVER_PRIVATE_KEY_PEM),
      expectedAudience: publicAudience(request, this.env), now: receivedAt });
    if (!checked.ok) throw new Error(`CONTRIBUTION_INGRESS_INVALID:${checked.error}`);
    const existing = one(this.sql,
      "SELECT receipt_json, purged_at FROM contributions WHERE record_hash = ?",
      envelope.contributionRecord.recordHash);
    if (existing) {
      if (existing.receipt_json == null) {
        throw new Error("CONTRIBUTION_DUPLICATE_PAYLOAD_PURGED");
      }
      this.sql.exec(`UPDATE challenges SET used_at = ?, envelope_hash = ?
        WHERE nonce = ? AND used_at IS NULL`, receivedAt, envelope.envelopeHash, nonce);
      return json(200, { appended: false, duplicate: true,
        receipt: JSON.parse(existing.receipt_json) });
    }
    const instrumentHash = envelope.contributionRecord.instrument.controllerImplementationHash;
    const recognized = acceptedInstrumentHashes(this.env).has(instrumentHash);
    const evidenceLevel = recognized
      ? "L2_RECOGNIZED_INSTRUMENT_SELF_ATTESTED"
      : "L1_UNRECOGNIZED_INSTRUMENT_SELF_ATTESTED";
    const retentionUntil = new Date(Date.parse(receivedAt)
      + Number(envelope.consent.retentionDays) * 86_400_000).toISOString();
    const receipt = createContributionReceipt({ envelope, evidenceLevel,
      reasons: receiptReasons(recognized), receivedAt, retentionUntil,
      privateKeyPem: this.env.SERVER_PRIVATE_KEY_PEM,
      registryId: this.env.REGISTRY_ID });
    const tail = one(this.sql,
      "SELECT ordinal, entry_hash FROM registry_entries ORDER BY ordinal DESC LIMIT 1");
    const entryBody = {
      ordinal: Number(tail?.ordinal ?? 0) + 1,
      recordHash: envelope.contributionRecord.recordHash,
      envelopeHash: envelope.envelopeHash,
      receiptHash: receipt.receiptHash,
      contributorKeyId: envelope.device.keyId,
      consentHash: envelope.consent.consentHash,
      receivedAt, evidenceLevel, disposition: "QUARANTINED",
      previousEntryHash: tail?.entry_hash ?? GENESIS,
    };
    const entryHash = contributionDigest(entryBody);
    this.ctx.storage.transactionSync(() => {
      const used = this.sql.exec(`UPDATE challenges SET used_at = ?, envelope_hash = ?
        WHERE nonce = ? AND used_at IS NULL`, receivedAt, envelope.envelopeHash, nonce);
      if (used.rowsWritten !== 1) throw new Error("CONTRIBUTION_CHALLENGE_ALREADY_USED");
      this.sql.exec(`INSERT INTO contributions
        (record_hash, envelope_hash, contributor_key_id, consent_hash, received_at,
         retention_until, evidence_level, receipt_hash, envelope_json, receipt_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      envelope.contributionRecord.recordHash, envelope.envelopeHash, envelope.device.keyId,
      envelope.consent.consentHash, receivedAt, retentionUntil, evidenceLevel,
      receipt.receiptHash, JSON.stringify(envelope), JSON.stringify(receipt));
      this.sql.exec(`INSERT INTO registry_entries
        (ordinal, entry_hash, previous_entry_hash, record_hash, envelope_hash, receipt_hash,
         contributor_key_id, consent_hash, received_at, evidence_level, disposition)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'QUARANTINED')`,
      entryBody.ordinal, entryHash, entryBody.previousEntryHash, entryBody.recordHash,
      entryBody.envelopeHash, entryBody.receiptHash, entryBody.contributorKeyId,
      entryBody.consentHash, entryBody.receivedAt, entryBody.evidenceLevel);
    });
    return json(200, { appended: true, duplicate: false, receipt });
  }

  async revoke(request) {
    const revocation = await bodyJson(request, 64 * 1024);
    const checked = verifyContributionRevocation(revocation);
    if (!checked.ok) throw new Error(`CONTRIBUTION_REVOCATION_INVALID:${checked.error}`);
    const prior = one(this.sql,
      "SELECT acknowledgment_json FROM revocations WHERE revocation_hash = ?",
      revocation.revocationHash);
    if (prior) return json(200, JSON.parse(prior.acknowledgment_json));
    const processedAt = new Date().toISOString();
    const affected = one(this.sql, `SELECT COUNT(*) AS count FROM contributions
      WHERE contributor_key_id = ? AND purged_at IS NULL`, revocation.contributorKeyId);
    const deletedContributions = Number(affected?.count ?? 0);
    const acknowledgment = createContributionRevocationReceipt({ revocation,
      deletedContributions, privateKeyPem: this.env.SERVER_PRIVATE_KEY_PEM,
      registryId: this.env.REGISTRY_ID, processedAt });
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(`UPDATE contributions SET envelope_json = NULL, receipt_json = NULL,
        purged_at = ? WHERE contributor_key_id = ? AND purged_at IS NULL`,
      processedAt, revocation.contributorKeyId);
      this.sql.exec("DELETE FROM challenges WHERE device_key_id = ?",
        revocation.contributorKeyId);
      this.sql.exec(`INSERT OR REPLACE INTO blocked_contributors
        (contributor_key_id, consent_hash, revocation_hash, blocked_at)
        VALUES (?, ?, ?, ?)`, revocation.contributorKeyId, revocation.consentHash,
      revocation.revocationHash, processedAt);
      this.sql.exec(`INSERT INTO revocations
        (revocation_hash, contributor_key_id, consent_hash, requested_at, processed_at,
         deleted_contributions, acknowledgment_hash, acknowledgment_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, revocation.revocationHash,
      revocation.contributorKeyId, revocation.consentHash, revocation.requestedAt,
      processedAt, deletedContributions, acknowledgment.acknowledgmentHash,
      JSON.stringify(acknowledgment));
    });
    return json(200, acknowledgment);
  }

  purgeExpired() {
    const now = new Date().toISOString();
    const purged = this.sql.exec(`UPDATE contributions
      SET envelope_json = NULL, receipt_json = NULL, purged_at = ?
      WHERE purged_at IS NULL AND retention_until <= ?`, now, now);
    this.sql.exec("DELETE FROM challenges WHERE expires_at < ?", now);
    return { ok: true, purged: purged.rowsWritten, at: now };
  }

  async fetch(request) {
    try {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/v1/contributions/info") {
        return json(200, this.info(request));
      }
      if (request.method === "GET" && url.pathname === "/healthz") {
        return json(200, { ok: true, mode: "QUARANTINE_ONLY",
          registryId: this.env.REGISTRY_ID });
      }
      if (request.method === "POST" && url.pathname === "/v1/contributions/challenge") {
        return await this.challenge(request);
      }
      if (request.method === "POST" && url.pathname === "/v1/contributions") {
        return await this.ingest(request);
      }
      if (request.method === "POST" && url.pathname === "/v1/contributions/revocations") {
        return await this.revoke(request);
      }
      if (request.method === "POST" && url.pathname === "/internal/purge") {
        return json(200, this.purgeExpired());
      }
      throw new Error("CONTRIBUTION_ROUTE_NOT_FOUND");
    } catch (error) { return errorResponse(error); }
  }
}

async function route(request, env) {
  const url = new URL(request.url);
  const allowed = new Set(["/healthz", "/v1/contributions/info",
    "/v1/contributions/challenge", "/v1/contributions",
    "/v1/contributions/revocations"]);
  if (!allowed.has(url.pathname)) return errorResponse(new Error("CONTRIBUTION_ROUTE_NOT_FOUND"));
  if (request.method === "POST") {
    const rateKey = `${url.pathname}:${request.headers.get("cf-connecting-ip") ?? "unknown"}`;
    const limited = await env.PUBLIC_RATE_LIMITER.limit({ key: rateKey });
    if (!limited.success) return errorResponse(new Error("CONTRIBUTION_PUBLIC_RATE_LIMITED"));
  }
  const id = env.REGISTRY.idFromName("global-v1");
  return env.REGISTRY.get(id).fetch(request);
}

export default {
  fetch: route,
  async scheduled(_controller, env) {
    const id = env.REGISTRY.idFromName("global-v1");
    await env.REGISTRY.get(id).fetch("https://internal.invalid/internal/purge", {
      method: "POST",
    });
  },
};
