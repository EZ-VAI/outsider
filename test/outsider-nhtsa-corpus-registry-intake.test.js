import assert from "node:assert/strict";
import {
  createHash, generateKeyPairSync, sign as cryptoSign,
} from "node:crypto";
import { once } from "node:events";
import {
  copyFileSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  DurableStage1CurateCorpusRegistry,
  corpusRegistryKeyId,
  createCorpusArtifactSet,
  verifyCorpusArtifactSet,
} from "../src/outsider-corpus-registry.js";
import {
  NHTSA_SGO_CORPUS_SOURCE_KIND,
  NHTSA_SGO_STAGE1_FROZEN_SCOPE,
  buildNhtsaSgoIncidentCorpusArtifactSetFromSource,
  verifyNhtsaSgoIncidentCorpusRegistrySource,
} from "../src/outsider-nhtsa-corpus-registry-intake.js";
import {
  NHTSA_SGO_FROZEN_SOURCE_20260820,
  adaptNhtsaSgoAdsCsv,
} from "../src/outsider-public-risk-source-adapters.js";

const CSV = path.resolve("artifacts/stage2-source-20260820/nhtsa-sgo-ads-20260820.csv");
const DICTIONARY = path.resolve(
  "artifacts/stage2-source-20260820/nhtsa-sgo-data-dictionary-20260820.pdf",
);
const CLI = path.resolve("scripts/stage1-curate-corpus-registry.mjs");
const T0 = "2036-01-01T00:00:00.000Z";
const T1 = "2036-01-01T00:00:01.000Z";
const T2 = "2036-01-01T00:00:02.000Z";

function keys() {
  return generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

function hash(value) {
  return `sha256:${createHash("sha256").update(String(value)).digest("hex")}`;
}

function domainHash(domain, value) {
  return `sha256:${createHash("sha256").update(`${domain}\0${canonicalizeStrict(value)}`)
    .digest("hex")}`;
}

function artifactInput(artifact, overrides = {}) {
  return {
    artifactSetId: overrides.artifactSetId ?? artifact.artifactSetId,
    stage: overrides.stage ?? artifact.stage,
    stream: overrides.stream ?? artifact.stream,
    createdAt: overrides.createdAt ?? artifact.createdAt,
    instrument: structuredClone(overrides.instrument ?? artifact.instrument),
    datasetIds: structuredClone(overrides.datasetIds ?? artifact.datasetIds),
    licenseIds: structuredClone(overrides.licenseIds ?? artifact.licenseIds),
    rightsBasis: structuredClone(overrides.rightsBasis ?? artifact.rightsBasis),
    sourceProof: structuredClone(overrides.sourceProof ?? artifact.sourceProof),
    units: structuredClone(overrides.units ?? artifact.units),
    retention: structuredClone(overrides.retention ?? artifact.retention),
  };
}

function resealMutatedArtifact(artifact, pair, mutate) {
  const copy = structuredClone(artifact);
  mutate(copy);
  delete copy.artifactSetHash;
  delete copy.signature;
  const artifactSetHash = domainHash(copy.schema, copy);
  return {
    ...copy,
    artifactSetHash,
    signature: {
      algorithm: "Ed25519",
      keyId: corpusRegistryKeyId(pair.publicKey),
      publicKeyPem: pair.publicKey,
      value: cryptoSign(null, Buffer.from(artifactSetHash), pair.privateKey).toString("base64"),
    },
  };
}

function newRegistry(root, pair, id) {
  return new DurableStage1CurateCorpusRegistry({
    directory: path.join(root, id), privateKeyPem: pair.privateKey,
    registryId: id, createdAt: T0,
  });
}

function build(pair, overrides = {}) {
  return buildNhtsaSgoIncidentCorpusArtifactSetFromSource({
    csvPath: overrides.csvPath ?? CSV,
    dataDictionaryPath: overrides.dataDictionaryPath ?? DICTIONARY,
    privateKeyPem: pair.privateKey,
    createdAt: overrides.createdAt ?? T0,
    artifactSetId: overrides.artifactSetId ?? "nhtsa-test",
  });
}

test("frozen NHTSA reports enter CURATE as one source-replayable descriptive D2 group",
  { timeout: 30_000 }, () => {
    const root = mkdtempSync(path.join(tmpdir(), "outsider-nhtsa-registry-"));
    const pair = keys();
    try {
      const artifact = build(pair);
      assert.equal(verifyCorpusArtifactSet(artifact).ok, true);
      assert.equal(artifact.stage, "CURATE");
      assert.equal(artifact.stream, "BACKWARD_EXPERIENCE_EVIDENCE");
      assert.equal(artifact.sourceProof.sourceKind, NHTSA_SGO_CORPUS_SOURCE_KIND);
      assert.deepEqual(artifact.datasetIds, ["NHTSA_SGO_ADS_CRASH_REPORTS"]);
      assert.deepEqual(artifact.licenseIds, []);
      assert.equal(artifact.rightsBasis.class, "RIGHTS_UNRESOLVED_PUBLIC_ACCESS_ONLY");
      assert.equal(artifact.rightsBasis.registryGrantsRights, false);
      assert.deepEqual(artifact.counts,
        { candidates: 1_324, uniqueIdentities: 1_324, exactDuplicates: 0 });
      assert.equal(new Set(artifact.units.map((unit) => unit.datasetRoot)).size, 1);

      const csvBytes = readFileSync(CSV);
      const quarantine = adaptNhtsaSgoAdsCsv(csvBytes, {
        sourceObjectHash: NHTSA_SGO_FROZEN_SOURCE_20260820.sourceObjectHash,
        dataDictionaryHash: NHTSA_SGO_FROZEN_SOURCE_20260820.dataDictionaryHash,
        generatedAt: T0,
      });
      const reports = new Map(quarantine.reports.map((report) => [report.reportIdHash, report]));
      for (const unit of artifact.units) {
        const report = reports.get(unit.identityHash);
        assert.ok(report);
        assert.equal(unit.recordHash, report.projectionHash);
        assert.ok(unit.correlationRoots.includes(report.reportingEntityHash));
        assert.equal(unit.correlationRoots.length, 3);
      }
      assert.equal(new Set(quarantine.reports.map((report) => report.reportingEntityHash)).size, 16);

      const registry = newRegistry(root, pair, "real-nhtsa");
      registry.appendArtifactSet(artifact, { recordedAt: T1 });
      const ordinary = registry.verify({ now: T2 });
      assert.equal(ordinary.ok, true, ordinary.error);
      assert.equal(ordinary.counts.activeArtifactSets, 1);
      assert.equal(ordinary.counts.candidates, 1_324);
      assert.equal(ordinary.counts.d2Groups, 1);
      assert.equal(ordinary.sourceArtifactsReverified, false);
      assert.equal(ordinary.fullSourceArtifactSetsReverified, 0);

      const replay = verifyNhtsaSgoIncidentCorpusRegistrySource({
        directory: path.join(root, "real-nhtsa"), csvPath: CSV,
        dataDictionaryPath: DICTIONARY, now: T2,
      });
      assert.equal(replay.ok, true, replay.error);
      assert.equal(replay.sourceArtifactsReverified, true);
      assert.equal(replay.canonicalBodyExact, true);
      assert.deepEqual(replay.counts, {
        rawReportVersions: 1_365, latestReportIdentities: 1_324,
        supersededOrDuplicateVersions: 41, reportingEntities: 16,
        incidentTaxonomyRows: 1_324, independentIncidentEvents: 0,
        exposureDenominatorRows: 0, monetaryLossRows: 0, modelRows: 0,
      });
      assert.deepEqual(replay.ontologyReference.permittedUses, ["DESCRIPTIVE"]);
      assert.equal(replay.rightsStatus, "NOT_ESTABLISHED_PUBLIC_ACCESS_ONLY");
      assert.equal(replay.boundary.causalExperienceUnits, 0);
      assert.equal(replay.boundary.admittedLossRows, 0);
      assert.equal(replay.boundary.admittedExposureRows, 0);
      assert.equal(replay.boundary.modelRows, 0);
      assert.equal(replay.boundary.automaticTraining, false);
      assert.equal(replay.boundary.permitsPrice, false);
      assert.equal(replay.boundary.rightsEstablished, false);

      const stored = readFileSync(path.join(root, "real-nhtsa", "artifact-sets",
        `${artifact.artifactSetHash.slice(7)}.json`), "utf8");
      for (const forbidden of ["VIN", "Narrative", "Latitude", "Longitude",
        "Incident Address", "Observed Economic Loss"]) assert.equal(stored.includes(forbidden), false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

test("exact CSV and dictionary pins reject same-size tamper, truncation, and symlink substitution",
  { timeout: 30_000 }, () => {
    const root = mkdtempSync(path.join(tmpdir(), "outsider-nhtsa-pins-"));
    const pair = keys();
    try {
      const csv = path.join(root, "nhtsa.csv");
      const dictionary = path.join(root, "dictionary.pdf");
      copyFileSync(CSV, csv);
      copyFileSync(DICTIONARY, dictionary);

      const sameSizeCsv = readFileSync(csv);
      sameSizeCsv[10_000] ^= 1;
      writeFileSync(csv, sameSizeCsv);
      assert.throws(() => build(pair, { csvPath: csv, dataDictionaryPath: dictionary }),
        /NHTSA_CORPUS_INTAKE_SOURCE_FILE_HASH_INVALID:csv/);
      copyFileSync(CSV, csv);

      const sameSizeDictionary = readFileSync(dictionary);
      sameSizeDictionary[10_000] ^= 1;
      writeFileSync(dictionary, sameSizeDictionary);
      assert.throws(() => build(pair, { csvPath: csv, dataDictionaryPath: dictionary }),
        /NHTSA_CORPUS_INTAKE_SOURCE_FILE_HASH_INVALID:data-dictionary/);

      writeFileSync(dictionary, readFileSync(DICTIONARY).subarray(0, 100_000));
      assert.throws(() => build(pair, { csvPath: csv, dataDictionaryPath: dictionary }),
        /NHTSA_CORPUS_INTAKE_SOURCE_FILE_SIZE_INVALID:data-dictionary/);

      rmSync(dictionary);
      symlinkSync(DICTIONARY, dictionary);
      assert.throws(() => build(pair, { csvPath: csv, dataDictionaryPath: dictionary }),
        /NHTSA_CORPUS_INTAKE_SOURCE_FILE_INVALID:data-dictionary/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

test("source relabel and rights promotion remain operator claims until dedicated replay",
  { timeout: 60_000 }, () => {
    const root = mkdtempSync(path.join(tmpdir(), "outsider-nhtsa-claims-"));
    const pair = keys();
    try {
      const artifact = build(pair);
      const relabeledProof = structuredClone(artifact.sourceProof);
      relabeledProof.sourceKind = "RELABELLED_NHTSA_INCIDENT_SOURCE";
      const relabeled = createCorpusArtifactSet(artifactInput(artifact, {
        artifactSetId: "nhtsa-relabeled", sourceProof: relabeledProof,
      }), { privateKeyPem: pair.privateKey });
      const relabeledRegistry = newRegistry(root, pair, "relabeled");
      relabeledRegistry.appendArtifactSet(relabeled, { recordedAt: T1 });
      assert.equal(relabeledRegistry.verify({ now: T2 }).sourceArtifactsReverified, false);
      const relabelReplay = verifyNhtsaSgoIncidentCorpusRegistrySource({
        directory: path.join(root, "relabeled"), csvPath: CSV,
        dataDictionaryPath: DICTIONARY, now: T2,
      });
      assert.equal(relabelReplay.ok, false);
      assert.match(relabelReplay.error, /NHTSA_CORPUS_INTAKE_CLAIM_COUNT:0/);

      const rightsPromoted = createCorpusArtifactSet(artifactInput(artifact, {
        artifactSetId: "nhtsa-false-rights",
        licenseIds: ["CC-BY-4.0"],
        rightsBasis: { class: "PUBLIC_DATASET_LICENSE_DECLARATIONS",
          sourceCommitmentHashes: artifact.rightsBasis.sourceCommitmentHashes,
          registryGrantsRights: false },
      }), { privateKeyPem: pair.privateKey });
      assert.equal(verifyCorpusArtifactSet(rightsPromoted).ok, true,
        "generic verification only authenticates the operator-signed claim");
      const rightsRegistry = newRegistry(root, pair, "false-rights");
      rightsRegistry.appendArtifactSet(rightsPromoted, { recordedAt: T1 });
      const ordinary = rightsRegistry.verify({ now: T2 });
      assert.equal(ordinary.ok, true);
      assert.equal(ordinary.sourceArtifactsReverified, false);
      const rightsReplay = verifyNhtsaSgoIncidentCorpusRegistrySource({
        directory: path.join(root, "false-rights"), csvPath: CSV,
        dataDictionaryPath: DICTIONARY, now: T2,
      });
      assert.equal(rightsReplay.ok, false);
      assert.match(rightsReplay.error, /NHTSA_CORPUS_INTAKE_CLAIM_BOUNDARY_INVALID/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

test("re-sealed loss or training promotions and duplicated/conflicting report units fail closed",
  { timeout: 60_000 }, () => {
    const root = mkdtempSync(path.join(tmpdir(), "outsider-nhtsa-promotions-"));
    const pair = keys();
    try {
      const artifact = build(pair);
      for (const mutate of [
        (value) => { value.boundary.lossEvidenceUnits = 1; value.boundary.economicLossRows = 1; },
        (value) => { value.boundary.automaticTraining = true; },
        (value) => { value.boundary.causalExperienceUnits = 1; value.boundary.pricingEligible = true; },
      ]) {
        const promoted = resealMutatedArtifact(artifact, pair, mutate);
        assert.equal(verifyCorpusArtifactSet(promoted).ok, false);
      }

      const duplicated = createCorpusArtifactSet(artifactInput(artifact, {
        artifactSetId: "nhtsa-duplicated-row",
        units: [...artifact.units, structuredClone(artifact.units[0])],
      }), { privateKeyPem: pair.privateKey });
      assert.equal(duplicated.counts.exactDuplicates, 1);
      const duplicateRegistry = newRegistry(root, pair, "duplicate");
      duplicateRegistry.appendArtifactSet(duplicated, { recordedAt: T1 });
      const duplicateReplay = verifyNhtsaSgoIncidentCorpusRegistrySource({
        directory: path.join(root, "duplicate"), csvPath: CSV,
        dataDictionaryPath: DICTIONARY, now: T2,
      });
      assert.equal(duplicateReplay.ok, false);
      assert.match(duplicateReplay.error, /NHTSA_CORPUS_INTAKE_CLAIM_BOUNDARY_INVALID/);

      const conflictingUnits = [...artifact.units, { ...artifact.units[0],
        recordHash: hash("different-latest-version-projection") }];
      assert.throws(() => createCorpusArtifactSet(artifactInput(artifact, {
        artifactSetId: "nhtsa-intra-set-conflict", units: conflictingUnits,
      }), { privateKeyPem: pair.privateKey }), /CORPUS_REGISTRY_INTRA_SET_IDENTITY_CONFLICT/);

      const conflictRegistry = newRegistry(root, pair, "cross-batch-conflict");
      conflictRegistry.appendArtifactSet(artifact, { recordedAt: T1 });
      const conflictingBatch = createCorpusArtifactSet(artifactInput(artifact, {
        artifactSetId: "nhtsa-cross-batch-conflict", createdAt: T2,
        units: [{ ...artifact.units[0], recordHash: hash("conflicting-projection") }],
      }), { privateKeyPem: pair.privateKey });
      assert.throws(() => conflictRegistry.appendArtifactSet(conflictingBatch,
        { recordedAt: "2036-01-01T00:00:03.000Z" }),
      /CORPUS_REGISTRY_CROSS_BATCH_IDENTITY_CONFLICT/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

test("open-descriptor source snapshot detects an in-build same-size TOCTOU mutation",
  { timeout: 30_000 }, async () => {
    const root = mkdtempSync(path.join(tmpdir(), "outsider-nhtsa-toctou-"));
    const pair = keys();
    const csv = path.join(root, "nhtsa.csv");
    const dictionary = path.join(root, "dictionary.pdf");
    copyFileSync(CSV, csv);
    copyFileSync(DICTIONARY, dictionary);
    try {
      const script = [
        "const fs=require('node:fs')",
        `const file=${JSON.stringify(csv)}`,
        "setTimeout(()=>{const fd=fs.openSync(file,'r+');const b=Buffer.alloc(1);"
          + "fs.readSync(fd,b,0,1,20000);b[0]^=1;fs.writeSync(fd,b,0,1,20000);"
          + "fs.fsyncSync(fd);fs.closeSync(fd)},100)",
      ].join(";");
      const mutator = spawn(process.execPath, ["-e", script], { stdio: "ignore" });
      let caught = null;
      try { build(pair, { csvPath: csv, dataDictionaryPath: dictionary }); }
      catch (error) { caught = error; }
      await once(mutator, "exit");
      assert.ok(caught instanceof Error);
      assert.match(caught.message,
        /NHTSA_CORPUS_INTAKE_SOURCE_FILE_(CHANGED_DURING_BUILD|CHANGED_DURING_READ|HASH_INVALID):csv/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

test("CLI ingests into a new registry and keeps ordinary verify separate from source replay",
  { timeout: 60_000 }, () => {
    const root = mkdtempSync(path.join(tmpdir(), "outsider-nhtsa-cli-"));
    const registry = path.join(root, "registry");
    const keyFile = path.join(root, "private.pem");
    const pair = keys();
    writeFileSync(keyFile, pair.privateKey, { mode: 0o600 });
    const run = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
    try {
      let result = run(["init", "--dir", registry, "--signing-key", keyFile,
        "--registry-id", "nhtsa-cli", "--at", T0]);
      assert.equal(result.status, 0, result.stderr);
      result = run(["ingest-nhtsa-sgo-incidents", "--dir", registry,
        "--signing-key", keyFile, "--csv", CSV, "--data-dictionary", DICTIONARY,
        "--at", T1]);
      assert.equal(result.status, 0, result.stderr);
      const ingested = JSON.parse(result.stdout);
      assert.equal(ingested.candidates, 1_324);
      assert.equal(ingested.rawReportVersions, 1_365);
      assert.equal(ingested.supersededOrDuplicateVersions, 41);
      assert.equal(ingested.rightsBasis.class, "RIGHTS_UNRESOLVED_PUBLIC_ACCESS_ONLY");
      assert.equal(ingested.boundary.automaticTraining, false);

      result = run(["verify", "--dir", registry, "--now", T2]);
      assert.equal(result.status, 0, result.stderr);
      const ordinary = JSON.parse(result.stdout);
      assert.equal(ordinary.sourceArtifactsReverified, false);
      assert.equal(ordinary.fullSourceArtifactSetsReverified, 0);

      result = run(["verify-nhtsa-sgo-incident-source", "--dir", registry,
        "--csv", CSV, "--data-dictionary", DICTIONARY, "--now", T2]);
      assert.equal(result.status, 0, result.stderr);
      const replay = JSON.parse(result.stdout);
      assert.equal(replay.sourceArtifactsReverified, true);
      assert.equal(replay.counts.latestReportIdentities,
        NHTSA_SGO_STAGE1_FROZEN_SCOPE.counts.latestReportIdentities);
      assert.equal(replay.counts.modelRows, 0);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
