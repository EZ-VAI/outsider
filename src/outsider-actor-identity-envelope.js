/*
 * Actor identity envelope -- source-replayed, HOLD-only identity graph.
 *
 * There is no natural "agent individual" here.  This artifact keeps the
 * accountable principal, stable deployment lineage, exact deployment build,
 * model references, ephemeral runtime, optional embodiment, delegation, and
 * execution identity separate.  It proves only that a caller-pinned source was
 * replayed consistently.  A hash, signature reference, lifecycle declaration,
 * network locator, or model name can never mint identity continuity, credit,
 * incident attribution, authority, or an executable action.
 */

import { createHash } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";
import {
  delegationRadiusLeq,
  verifyDelegationRadius,
} from "./outsider-delegation-radius.js";

const ArrayConstructor = Array;
const ArrayIsArray = Array.isArray;
const ArrayPrototype = Array.prototype;
const ObjectPrototype = Object.prototype;
const ObjectCreate = Object.create;
const ObjectDefineProperty = Object.defineProperty;
const ObjectFreeze = Object.freeze;
const ObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const ObjectGetPrototypeOf = Object.getPrototypeOf;
const ObjectHasOwn = Object.hasOwn;
const ObjectIsFrozen = Object.isFrozen;
const ReflectOwnKeys = Reflect.ownKeys;
const NumberIsFinite = Number.isFinite;
const DateConstructor = Date;
const DateParse = Date.parse;
const StringConstructor = String;
const ErrorConstructor = Error;
const TypeErrorConstructor = TypeError;
const RegExpTest = Function.prototype.call.bind(RegExp.prototype.test);
const ArraySort = Function.prototype.call.bind(Array.prototype.sort);
const DateToISOString = Function.prototype.call.bind(Date.prototype.toISOString);
const CryptoHashPrototype = ObjectGetPrototypeOf(createHash("sha256"));
const CryptoHashUpdate = Function.prototype.call.bind(CryptoHashPrototype.update);
const CryptoHashDigest = Function.prototype.call.bind(CryptoHashPrototype.digest);

export const ACTOR_IDENTITY_ENVELOPE_SCHEMAS = ObjectFreeze({
  source: "outsider/actor-identity-envelope-source/v1",
  envelope: "outsider/actor-identity-envelope/v1",
  verification: "outsider/actor-identity-envelope-verification/v1",
  deploymentRevision: "outsider/actor-deployment-revision/v1",
  embodimentRevision: "outsider/actor-embodiment-revision/v1",
  delegationEdge: "outsider/actor-delegation-edge/v1",
  lifecycleEdge: "outsider/actor-lifecycle-edge/v1",
});

export const ACTOR_IDENTITY_ASSURANCE_CLASSES = ObjectFreeze([
  "NONE",
  "SELF_DECLARED_REFERENCE",
  "OPERATOR_SIGNED_REFERENCE",
  "SOURCE_REPLAYED_REFERENCE",
  "WORKLOAD_ATTESTATION_REFERENCE",
  "HARDWARE_ATTESTATION_REFERENCE",
  "EXTERNAL_ANCHOR_REFERENCE",
  "LEGAL_BINDING_REFERENCE",
]);

export const ACTOR_IDENTITY_LIFECYCLE_KINDS = ObjectFreeze([
  "REVISION",
  "FORK",
  "MERGE",
  "KEY_ROTATION",
  "CONTROL_TRANSFER",
  "RETIRE",
]);

export const ACTOR_IDENTITY_NO_AUTHORITY = deepFreeze({
  principalIdentityEstablished: false,
  legalPrincipalBindingEstablished: false,
  deploymentIdentityEstablished: false,
  deploymentContinuityEstablished: false,
  runtimeIdentityEstablished: false,
  modelIdentityEstablished: false,
  modelAttributionEstablished: false,
  embodimentIdentityEstablished: false,
  delegationAuthorityEstablished: false,
  historyContinuityEstablished: false,
  historyInheritanceEstablished: false,
  creditAttributionEstablished: false,
  incidentAttributionEstablished: false,
  causalAttributionEstablished: false,
  externalAuthorityEstablished: false,
  actionReady: false,
  executable: false,
  callerPositiveBooleanAccepted: false,
  selfSignatureAcceptedAsIdentity: false,
  hashOnlyProofAcceptedAsIdentity: false,
  networkLocatorAcceptedAsIdentity: false,
  modelNameAcceptedAsIdentity: false,
});

const HASH = /^sha256:[a-f0-9]{64}$/u;
const CANONICAL_UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const MAX_MODELS = 128;
const MAX_ROOTS = 1024;
const MAX_EDGES = 1024;
const MODEL_ROUTE_TRANSPARENCY = ObjectFreeze([
  "EXACT_ARTIFACT_BOUND",
  "PROVIDER_REVISION_ATTESTED_REFERENCE",
  "OPAQUE",
  "UNKNOWN",
]);
const FINE_TUNE_STATES = ObjectFreeze([
  "NOT_DECLARED",
  "DECLARED_NOT_FINE_TUNED",
  "PROVENANCE_REFERENCE_PRESENT",
  "UNKNOWN",
]);
const MEMORY_STATE_MODES = ObjectFreeze(["BOUND", "OPAQUE"]);
const DELEGATION_ENDPOINT_KINDS = ObjectFreeze([
  "PRINCIPAL_EPOCH",
  "ACCOUNTABLE_DEPLOYMENT",
  "RUNTIME_INSTANCE",
]);
const CREDIT_AGGREGATION_POLICY
  = "TYPED_CONTEXTUAL_FACTS_ONLY_NO_GLOBAL_SCALAR_SCORE_NO_IMPLICIT_INHERITANCE";

function fail(code) {
  throw new TypeErrorConstructor(`ACTOR_IDENTITY_ENVELOPE_${code}`);
}

function append(array, value) {
  ObjectDefineProperty(array, StringConstructor(array.length), {
    value, writable: true, enumerable: true, configurable: true,
  });
  return array;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || ObjectIsFrozen(value)) return value;
  const keys = ReflectOwnKeys(value);
  for (let index = 0; index < keys.length; index += 1) {
    const descriptor = ObjectGetOwnPropertyDescriptor(value, keys[index]);
    if (descriptor && ObjectHasOwn(descriptor, "value")) deepFreeze(descriptor.value);
  }
  return ObjectFreeze(value);
}

function cloneCanonicalValue(value) {
  if (!value || typeof value !== "object") return value;
  if (ArrayIsArray(value)) {
    const output = new ArrayConstructor();
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = ObjectGetOwnPropertyDescriptor(value, StringConstructor(index));
      append(output, cloneCanonicalValue(descriptor.value));
    }
    return output;
  }
  const prototype = ObjectGetPrototypeOf(value);
  const output = ObjectCreate(prototype === null ? null : ObjectPrototype);
  const keys = ReflectOwnKeys(value);
  for (let index = 0; index < keys.length; index += 1) {
    const descriptor = ObjectGetOwnPropertyDescriptor(value, keys[index]);
    ObjectDefineProperty(output, keys[index], {
      value: cloneCanonicalValue(descriptor.value),
      writable: true, enumerable: true, configurable: true,
    });
  }
  return output;
}

function cloneCanonical(value) {
  canonicalizeStrict(value);
  return cloneCanonicalValue(value);
}

function exactObject(value, expectedKeys, code) {
  canonicalizeStrict(value);
  if (!value || typeof value !== "object" || ArrayIsArray(value)) {
    fail(`${code}_PLAIN_DATA_OBJECT_REQUIRED`);
  }
  const prototype = ObjectGetPrototypeOf(value);
  if (prototype !== ObjectPrototype && prototype !== null) {
    fail(`${code}_PLAIN_DATA_OBJECT_REQUIRED`);
  }
  const actual = ReflectOwnKeys(value);
  if (actual.length !== expectedKeys.length) fail(`${code}_FIELDS_INVALID`);
  for (let index = 0; index < actual.length; index += 1) {
    let found = false;
    for (let expectedIndex = 0; expectedIndex < expectedKeys.length; expectedIndex += 1) {
      if (actual[index] === expectedKeys[expectedIndex]) {
        found = true;
        break;
      }
    }
    if (!found) fail(`${code}_FIELDS_INVALID`);
    const descriptor = ObjectGetOwnPropertyDescriptor(value, actual[index]);
    if (!descriptor || !ObjectHasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_DATA_FIELDS_REQUIRED`);
  }
  return value;
}

function denseArray(value, code, maximum, { nonempty = false } = {}) {
  canonicalizeStrict(value);
  if (!ArrayIsArray(value) || ObjectGetPrototypeOf(value) !== ArrayPrototype
    || value.length > maximum || (nonempty && value.length === 0)) {
    fail(`${code}_DENSE_ARRAY_REQUIRED`);
  }
  return value;
}

function digest(domain, value) {
  const state = createHash("sha256");
  CryptoHashUpdate(state, `${domain}\0${canonicalizeStrict(value)}`, "utf8");
  return `sha256:${CryptoHashDigest(state, "hex")}`;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function hash(value, code) {
  if (typeof value !== "string" || !RegExpTest(HASH, value)) fail(`${code}_INVALID`);
  return value;
}

function nullableHash(value, code) {
  return value === null ? null : hash(value, code);
}

function iso(value, code) {
  if (typeof value !== "string" || !RegExpTest(CANONICAL_UTC_INSTANT, value)
    || !NumberIsFinite(DateParse(value))
    || DateToISOString(new DateConstructor(value)) !== value) fail(`${code}_INVALID`);
  return value;
}

function oneOf(value, allowed, code) {
  for (let index = 0; index < allowed.length; index += 1) {
    if (value === allowed[index]) return value;
  }
  fail(`${code}_INVALID`);
}

function contains(values, candidate) {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === candidate) return true;
  }
  return false;
}

function normalizeHashSet(value, code, { nonempty = false, maximum = MAX_ROOTS } = {}) {
  denseArray(value, code, maximum, { nonempty });
  const result = new ArrayConstructor();
  for (let index = 0; index < value.length; index += 1) {
    append(result, hash(value[index], `${code}_HASH`));
  }
  ArraySort(result);
  for (let index = 1; index < result.length; index += 1) {
    if (result[index] === result[index - 1]) fail(`${code}_DUPLICATE`);
  }
  return result;
}

function normalizeAssurance(value, code) {
  exactObject(value, ["class", "evidenceRefHash"], `${code}_ASSURANCE`);
  const assuranceClass = oneOf(value.class, ACTOR_IDENTITY_ASSURANCE_CLASSES,
    `${code}_ASSURANCE_CLASS`);
  const evidenceRefHash = nullableHash(value.evidenceRefHash,
    `${code}_ASSURANCE_EVIDENCE_REF_HASH`);
  if ((assuranceClass === "NONE") !== (evidenceRefHash === null)) {
    fail(`${code}_ASSURANCE_REFERENCE_STATE_INVALID`);
  }
  return {
    class: assuranceClass,
    evidenceRefHash,
    effectiveAssurance: "UNVERIFIED_REFERENCE_ONLY",
    externallyEstablished: false,
  };
}

function assuranceInput(value) {
  return { class: value.class, evidenceRefHash: value.evidenceRefHash };
}

function normalizeBindings(value) {
  exactObject(value, ["claimWayWorld", "run"], "BINDINGS");
  exactObject(value.claimWayWorld, ["claimHash", "wayHash", "worldHash"],
    "CLAIM_WAY_WORLD");
  exactObject(value.run, ["episodeHash", "attemptHash", "censusHash", "observedAt"],
    "RUN");
  return {
    claimWayWorld: {
      claimHash: hash(value.claimWayWorld.claimHash, "CLAIM_HASH"),
      wayHash: hash(value.claimWayWorld.wayHash, "WAY_HASH"),
      worldHash: hash(value.claimWayWorld.worldHash, "WORLD_HASH"),
    },
    run: {
      episodeHash: hash(value.run.episodeHash, "EPISODE_HASH"),
      attemptHash: hash(value.run.attemptHash, "ATTEMPT_HASH"),
      censusHash: hash(value.run.censusHash, "CENSUS_HASH"),
      observedAt: iso(value.run.observedAt, "RUN_OBSERVED_AT"),
    },
  };
}

function normalizePrincipalEpoch(value) {
  exactObject(value, ["principalRefHash", "epochRefHash", "trustDomainRefHash",
    "controllerKeyRefHash", "credentialRefHash", "validFrom", "validUntil",
    "assurance"], "PRINCIPAL_EPOCH");
  const validFrom = iso(value.validFrom, "PRINCIPAL_VALID_FROM");
  const validUntil = iso(value.validUntil, "PRINCIPAL_VALID_UNTIL");
  if (DateParse(validUntil) <= DateParse(validFrom)) fail("PRINCIPAL_VALIDITY_EMPTY");
  const assurance = normalizeAssurance(value.assurance, "PRINCIPAL");
  const projection = {
    principalRefHash: hash(value.principalRefHash, "PRINCIPAL_REF_HASH"),
    epochRefHash: hash(value.epochRefHash, "PRINCIPAL_EPOCH_REF_HASH"),
    trustDomainRefHash: hash(value.trustDomainRefHash, "TRUST_DOMAIN_REF_HASH"),
    controllerKeyRefHash: hash(value.controllerKeyRefHash, "CONTROLLER_KEY_REF_HASH"),
    credentialRefHash: nullableHash(value.credentialRefHash,
      "PRINCIPAL_CREDENTIAL_REF_HASH"),
    validFrom,
    validUntil,
    assurance,
  };
  return {
    ...projection,
    principalEpochProjectionHash: digest(
      "outsider/actor-principal-epoch-projection/v1", projection),
    networkLocatorAcceptedAsIdentity: false,
    legalIdentityEstablished: false,
  };
}

function principalInput(value) {
  return {
    principalRefHash: value.principalRefHash,
    epochRefHash: value.epochRefHash,
    trustDomainRefHash: value.trustDomainRefHash,
    controllerKeyRefHash: value.controllerKeyRefHash,
    credentialRefHash: value.credentialRefHash,
    validFrom: value.validFrom,
    validUntil: value.validUntil,
    assurance: assuranceInput(value.assurance),
  };
}

function normalizeDeploymentLineage(value, principal) {
  exactObject(value, ["deploymentLineageRefHash", "issuerPrincipalRefHash",
    "lineageDeclarationRefHash", "assurance"], "DEPLOYMENT_LINEAGE");
  const issuer = hash(value.issuerPrincipalRefHash, "LINEAGE_ISSUER_PRINCIPAL_REF_HASH");
  if (issuer !== principal.principalRefHash) fail("LINEAGE_PRINCIPAL_BINDING_MISMATCH");
  const projection = {
    deploymentLineageRefHash: hash(value.deploymentLineageRefHash,
      "DEPLOYMENT_LINEAGE_REF_HASH"),
    issuerPrincipalRefHash: issuer,
    lineageDeclarationRefHash: hash(value.lineageDeclarationRefHash,
      "LINEAGE_DECLARATION_REF_HASH"),
    assurance: normalizeAssurance(value.assurance, "DEPLOYMENT_LINEAGE"),
  };
  return {
    ...projection,
    deploymentLineageProjectionHash: digest(
      "outsider/actor-deployment-lineage-projection/v1", projection),
    continuityEstablished: false,
    historyInheritanceEstablished: false,
  };
}

function lineageInput(value) {
  return {
    deploymentLineageRefHash: value.deploymentLineageRefHash,
    issuerPrincipalRefHash: value.issuerPrincipalRefHash,
    lineageDeclarationRefHash: value.lineageDeclarationRefHash,
    assurance: assuranceInput(value.assurance),
  };
}

function normalizeModelArtifact(value) {
  exactObject(value, ["modelArtifactRefHash", "providerRevisionRefHash",
    "artifactRootHash", "baseModelRefHash", "tokenizerRootHash",
    "quantizationRootHash", "fineTuneState", "fineTuneProvenanceRefHash",
    "assurance"], "MODEL_ARTIFACT");
  const fineTuneState = oneOf(value.fineTuneState, FINE_TUNE_STATES,
    "MODEL_FINE_TUNE_STATE");
  const provenance = nullableHash(value.fineTuneProvenanceRefHash,
    "MODEL_FINE_TUNE_PROVENANCE_REF_HASH");
  if ((fineTuneState === "PROVENANCE_REFERENCE_PRESENT") !== (provenance !== null)) {
    fail("MODEL_FINE_TUNE_PROVENANCE_STATE_INVALID");
  }
  return {
    modelArtifactRefHash: hash(value.modelArtifactRefHash, "MODEL_ARTIFACT_REF_HASH"),
    providerRevisionRefHash: hash(value.providerRevisionRefHash,
      "MODEL_PROVIDER_REVISION_REF_HASH"),
    artifactRootHash: nullableHash(value.artifactRootHash, "MODEL_ARTIFACT_ROOT_HASH"),
    baseModelRefHash: nullableHash(value.baseModelRefHash, "MODEL_BASE_REF_HASH"),
    tokenizerRootHash: nullableHash(value.tokenizerRootHash, "MODEL_TOKENIZER_ROOT_HASH"),
    quantizationRootHash: nullableHash(value.quantizationRootHash,
      "MODEL_QUANTIZATION_ROOT_HASH"),
    fineTuneState,
    fineTuneProvenanceRefHash: provenance,
    assurance: normalizeAssurance(value.assurance, "MODEL_ARTIFACT"),
    modelIdentityEstablished: false,
    fineTuneHistoryEstablished: false,
  };
}

function modelArtifactInput(value) {
  return {
    modelArtifactRefHash: value.modelArtifactRefHash,
    providerRevisionRefHash: value.providerRevisionRefHash,
    artifactRootHash: value.artifactRootHash,
    baseModelRefHash: value.baseModelRefHash,
    tokenizerRootHash: value.tokenizerRootHash,
    quantizationRootHash: value.quantizationRootHash,
    fineTuneState: value.fineTuneState,
    fineTuneProvenanceRefHash: value.fineTuneProvenanceRefHash,
    assurance: assuranceInput(value.assurance),
  };
}

function normalizeModelArtifacts(value) {
  denseArray(value, "MODEL_ARTIFACTS", MAX_MODELS, { nonempty: true });
  const result = new ArrayConstructor();
  for (let index = 0; index < value.length; index += 1) {
    append(result, normalizeModelArtifact(value[index]));
  }
  ArraySort(result, (left, right) => left.modelArtifactRefHash < right.modelArtifactRefHash
    ? -1 : left.modelArtifactRefHash > right.modelArtifactRefHash ? 1 : 0);
  for (let index = 1; index < result.length; index += 1) {
    if (result[index].modelArtifactRefHash === result[index - 1].modelArtifactRefHash) {
      fail("MODEL_ARTIFACT_REF_DUPLICATE");
    }
  }
  return result;
}

function modelRefHashes(models) {
  const result = new ArrayConstructor();
  for (let index = 0; index < models.length; index += 1) {
    append(result, models[index].modelArtifactRefHash);
  }
  return result;
}

function normalizeModelRoute(value, models) {
  exactObject(value, ["transparency", "routePolicyHash",
    "selectedModelArtifactRefHashes", "routeEvidenceRefHash", "assurance"],
  "MODEL_ROUTE");
  const transparency = oneOf(value.transparency, MODEL_ROUTE_TRANSPARENCY,
    "MODEL_ROUTE_TRANSPARENCY");
  const selected = normalizeHashSet(value.selectedModelArtifactRefHashes,
    "SELECTED_MODEL_ARTIFACT_REFS", { maximum: MAX_MODELS });
  const routePolicyHash = nullableHash(value.routePolicyHash, "MODEL_ROUTE_POLICY_HASH");
  const routeEvidenceRefHash = nullableHash(value.routeEvidenceRefHash,
    "MODEL_ROUTE_EVIDENCE_REF_HASH");
  const available = modelRefHashes(models);
  for (let index = 0; index < selected.length; index += 1) {
    if (!contains(available, selected[index])) fail("MODEL_ROUTE_SELECTION_UNKNOWN");
  }
  if (transparency === "EXACT_ARTIFACT_BOUND") {
    if (selected.length === 0 || routePolicyHash === null || routeEvidenceRefHash === null) {
      fail("EXACT_MODEL_ROUTE_BINDING_INCOMPLETE");
    }
    for (let index = 0; index < selected.length; index += 1) {
      for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
        if (models[modelIndex].modelArtifactRefHash === selected[index]
          && models[modelIndex].artifactRootHash === null) {
          fail("EXACT_MODEL_ROUTE_ARTIFACT_ROOT_REQUIRED");
        }
      }
    }
  }
  if ((transparency === "OPAQUE" || transparency === "UNKNOWN")
    && selected.length !== 0) fail("OPAQUE_MODEL_ROUTE_CANNOT_SELECT_ARTIFACT");
  if (transparency === "PROVIDER_REVISION_ATTESTED_REFERENCE"
    && (selected.length === 0 || routeEvidenceRefHash === null)) {
    fail("PROVIDER_MODEL_ROUTE_REFERENCE_INCOMPLETE");
  }
  const modelArtifactProjectionHashes = new ArrayConstructor();
  for (let index = 0; index < models.length; index += 1) {
    append(modelArtifactProjectionHashes, digest(
      "outsider/actor-model-artifact-projection/v1", models[index]));
  }
  ArraySort(modelArtifactProjectionHashes);
  const body = {
    transparency,
    routePolicyHash,
    selectedModelArtifactRefHashes: selected,
    routeEvidenceRefHash,
    modelArtifactProjectionHashes,
    assurance: normalizeAssurance(value.assurance, "MODEL_ROUTE"),
    modelAttributionEstablished: false,
    causalAttributionEstablished: false,
  };
  return { ...body, modelRouteProjectionHash: digest(
    "outsider/actor-model-route-projection/v1", body) };
}

function modelRouteInput(value) {
  return {
    transparency: value.transparency,
    routePolicyHash: value.routePolicyHash,
    selectedModelArtifactRefHashes: value.selectedModelArtifactRefHashes,
    routeEvidenceRefHash: value.routeEvidenceRefHash,
    assurance: assuranceInput(value.assurance),
  };
}

function normalizeDeploymentRevision(value, lineage, models) {
  exactObject(value, ["deploymentLineageRefHash", "wayHash", "runtimeClosureHash",
    "configClosureHash", "memoryPolicyHash", "controllerImplementationHash",
    "adapterHash", "providerRootHash", "topologyHash", "modelArtifactRefHashes",
    "dataRootHashes", "toolchainRootHashes", "assurance"], "DEPLOYMENT_REVISION");
  const lineageRef = hash(value.deploymentLineageRefHash,
    "REVISION_DEPLOYMENT_LINEAGE_REF_HASH");
  if (lineageRef !== lineage.deploymentLineageRefHash) {
    fail("REVISION_LINEAGE_BINDING_MISMATCH");
  }
  const refs = normalizeHashSet(value.modelArtifactRefHashes,
    "REVISION_MODEL_ARTIFACT_REFS", { nonempty: true, maximum: MAX_MODELS });
  if (!same(refs, modelRefHashes(models))) fail("REVISION_MODEL_ARTIFACT_SET_MISMATCH");
  const body = {
    schema: ACTOR_IDENTITY_ENVELOPE_SCHEMAS.deploymentRevision,
    deploymentLineageRefHash: lineageRef,
    deploymentLineageProjectionHash: lineage.deploymentLineageProjectionHash,
    wayHash: hash(value.wayHash, "REVISION_WAY_HASH"),
    runtimeClosureHash: hash(value.runtimeClosureHash, "RUNTIME_CLOSURE_HASH"),
    configClosureHash: hash(value.configClosureHash, "CONFIG_CLOSURE_HASH"),
    memoryPolicyHash: hash(value.memoryPolicyHash, "MEMORY_POLICY_HASH"),
    controllerImplementationHash: hash(value.controllerImplementationHash,
      "CONTROLLER_IMPLEMENTATION_HASH"),
    adapterHash: hash(value.adapterHash, "ADAPTER_HASH"),
    providerRootHash: hash(value.providerRootHash, "PROVIDER_ROOT_HASH"),
    topologyHash: hash(value.topologyHash, "TOPOLOGY_HASH"),
    modelArtifactRefHashes: refs,
    dataRootHashes: normalizeHashSet(value.dataRootHashes, "DATA_ROOTS"),
    toolchainRootHashes: normalizeHashSet(value.toolchainRootHashes, "TOOLCHAIN_ROOTS"),
    assurance: normalizeAssurance(value.assurance, "DEPLOYMENT_REVISION"),
    exactBuildClosureExternallyEstablished: false,
    deploymentContinuityEstablished: false,
  };
  return { ...body, deploymentRevisionHash: digest(
    ACTOR_IDENTITY_ENVELOPE_SCHEMAS.deploymentRevision, body) };
}

function deploymentRevisionInput(value) {
  return {
    deploymentLineageRefHash: value.deploymentLineageRefHash,
    wayHash: value.wayHash,
    runtimeClosureHash: value.runtimeClosureHash,
    configClosureHash: value.configClosureHash,
    memoryPolicyHash: value.memoryPolicyHash,
    controllerImplementationHash: value.controllerImplementationHash,
    adapterHash: value.adapterHash,
    providerRootHash: value.providerRootHash,
    topologyHash: value.topologyHash,
    modelArtifactRefHashes: value.modelArtifactRefHashes,
    dataRootHashes: value.dataRootHashes,
    toolchainRootHashes: value.toolchainRootHashes,
    assurance: assuranceInput(value.assurance),
  };
}

function normalizeRuntimeInstance(value, deployment, principal) {
  exactObject(value, ["runtimeInstanceRefHash", "instanceKeyRefHash", "bootEpochRefHash",
    "loadedWayHash", "loadedDeploymentRevisionHash", "workloadAttestationRefHash", "memoryStateMode",
    "memoryStateCommitmentHash", "validFrom", "validUntil", "assurance"],
  "RUNTIME_INSTANCE");
  const loadedWayHash = hash(value.loadedWayHash, "RUNTIME_LOADED_WAY_HASH");
  if (loadedWayHash !== deployment.wayHash) fail("RUNTIME_WAY_BINDING_MISMATCH");
  const loadedDeploymentRevisionHash = hash(value.loadedDeploymentRevisionHash,
    "RUNTIME_LOADED_DEPLOYMENT_REVISION_HASH");
  if (loadedDeploymentRevisionHash !== deployment.deploymentRevisionHash) {
    fail("RUNTIME_DEPLOYMENT_REVISION_BINDING_MISMATCH");
  }
  const validFrom = iso(value.validFrom, "RUNTIME_VALID_FROM");
  const validUntil = iso(value.validUntil, "RUNTIME_VALID_UNTIL");
  if (DateParse(validUntil) <= DateParse(validFrom)
    || DateParse(validFrom) < DateParse(principal.validFrom)
    || DateParse(validUntil) > DateParse(principal.validUntil)) {
    fail("RUNTIME_VALIDITY_OUTSIDE_PRINCIPAL_EPOCH");
  }
  const memoryStateMode = oneOf(value.memoryStateMode, MEMORY_STATE_MODES,
    "RUNTIME_MEMORY_STATE_MODE");
  const memoryStateCommitmentHash = nullableHash(value.memoryStateCommitmentHash,
    "RUNTIME_MEMORY_STATE_COMMITMENT_HASH");
  if ((memoryStateMode === "BOUND") !== (memoryStateCommitmentHash !== null)) {
    fail("RUNTIME_MEMORY_STATE_BINDING_INVALID");
  }
  const body = {
    runtimeInstanceRefHash: hash(value.runtimeInstanceRefHash,
      "RUNTIME_INSTANCE_REF_HASH"),
    instanceKeyRefHash: hash(value.instanceKeyRefHash, "RUNTIME_INSTANCE_KEY_REF_HASH"),
    bootEpochRefHash: hash(value.bootEpochRefHash, "RUNTIME_BOOT_EPOCH_REF_HASH"),
    loadedWayHash,
    loadedDeploymentRevisionHash,
    workloadAttestationRefHash: nullableHash(value.workloadAttestationRefHash,
      "WORKLOAD_ATTESTATION_REF_HASH"),
    memoryStateMode,
    memoryStateCommitmentHash,
    validFrom,
    validUntil,
    assurance: normalizeAssurance(value.assurance, "RUNTIME_INSTANCE"),
    runtimeIdentityEstablished: false,
  };
  return { ...body, runtimeInstanceHash: digest(
    "outsider/actor-runtime-instance/v1", body) };
}

function runtimeInput(value) {
  return {
    runtimeInstanceRefHash: value.runtimeInstanceRefHash,
    instanceKeyRefHash: value.instanceKeyRefHash,
    bootEpochRefHash: value.bootEpochRefHash,
    loadedWayHash: value.loadedWayHash,
    loadedDeploymentRevisionHash: value.loadedDeploymentRevisionHash,
    workloadAttestationRefHash: value.workloadAttestationRefHash,
    memoryStateMode: value.memoryStateMode,
    memoryStateCommitmentHash: value.memoryStateCommitmentHash,
    validFrom: value.validFrom,
    validUntil: value.validUntil,
    assurance: assuranceInput(value.assurance),
  };
}

function normalizeEmbodimentRevision(value, deployment) {
  if (value === null) return null;
  exactObject(value, ["deviceLineageRefHash", "hardwareArtifactRootHash",
    "firmwareRootHash", "calibrationRootHash", "controllerImplementationHash",
    "hardwareAttestationRefHash", "assurance"], "EMBODIMENT_REVISION");
  const controller = hash(value.controllerImplementationHash,
    "EMBODIMENT_CONTROLLER_IMPLEMENTATION_HASH");
  if (controller !== deployment.controllerImplementationHash) {
    fail("EMBODIMENT_CONTROLLER_BINDING_MISMATCH");
  }
  const body = {
    schema: ACTOR_IDENTITY_ENVELOPE_SCHEMAS.embodimentRevision,
    deviceLineageRefHash: hash(value.deviceLineageRefHash, "DEVICE_LINEAGE_REF_HASH"),
    hardwareArtifactRootHash: hash(value.hardwareArtifactRootHash,
      "HARDWARE_ARTIFACT_ROOT_HASH"),
    firmwareRootHash: hash(value.firmwareRootHash, "FIRMWARE_ROOT_HASH"),
    calibrationRootHash: hash(value.calibrationRootHash, "CALIBRATION_ROOT_HASH"),
    controllerImplementationHash: controller,
    hardwareAttestationRefHash: nullableHash(value.hardwareAttestationRefHash,
      "HARDWARE_ATTESTATION_REF_HASH"),
    assurance: normalizeAssurance(value.assurance, "EMBODIMENT_REVISION"),
    embodimentIdentityEstablished: false,
  };
  return { ...body, embodimentRevisionHash: digest(
    ACTOR_IDENTITY_ENVELOPE_SCHEMAS.embodimentRevision, body) };
}

function embodimentInput(value) {
  if (value === null) return null;
  return {
    deviceLineageRefHash: value.deviceLineageRefHash,
    hardwareArtifactRootHash: value.hardwareArtifactRootHash,
    firmwareRootHash: value.firmwareRootHash,
    calibrationRootHash: value.calibrationRootHash,
    controllerImplementationHash: value.controllerImplementationHash,
    hardwareAttestationRefHash: value.hardwareAttestationRefHash,
    assurance: assuranceInput(value.assurance),
  };
}

function checkedRadius(value, code) {
  canonicalizeStrict(value);
  const expectedRadiusHash = hash(value?.radiusHash, `${code}_RADIUS_HASH`);
  const checked = verifyDelegationRadius(value, { expectedRadiusHash });
  if (!checked.ok || checked.empty || checked.externalAuthorityVerified !== false
    || checked.executable !== false) fail(`${code}_RADIUS_INVALID`);
  return cloneCanonical(value);
}

function normalizeDelegationEndpoint(value, position) {
  exactObject(value, ["kind", "refHash"], `DELEGATION_${position}_ENDPOINT`);
  const kind = oneOf(value.kind, DELEGATION_ENDPOINT_KINDS,
    `DELEGATION_${position}_ENDPOINT_KIND`);
  if ((position === "PARENT" && kind === "RUNTIME_INSTANCE")
    || (position === "CHILD" && kind === "PRINCIPAL_EPOCH")) {
    fail(`DELEGATION_${position}_ENDPOINT_DIRECTION_INVALID`);
  }
  return {
    kind,
    refHash: hash(value.refHash, `DELEGATION_${position}_ENDPOINT_REF_HASH`),
  };
}

function delegationEndpointMatchesCurrent(endpoint, identityRefs) {
  if (endpoint.kind === "PRINCIPAL_EPOCH") {
    return endpoint.refHash === identityRefs.principalEpochProjectionHash;
  }
  if (endpoint.kind === "ACCOUNTABLE_DEPLOYMENT") {
    return endpoint.refHash === identityRefs.actorSubjectHash;
  }
  return endpoint.refHash === identityRefs.runtimeInstanceHash;
}

function assertDelegationRadiusValidAt(radius, observedAt) {
  const observedAtMs = DateParse(observedAt);
  if (observedAtMs < DateParse(radius.validity.validFrom)
    || observedAtMs >= DateParse(radius.validity.validUntil)) {
    fail("DELEGATION_RADIUS_NOT_VALID_AT_RUN_OBSERVED_AT");
  }
}

function normalizeDelegationEdge(value, identityRefs, observedAt) {
  exactObject(value, ["parent", "child", "parentRadius", "childRadius",
    "delegationEvidenceRefHash", "assurance"], "DELEGATION_EDGE");
  const parent = normalizeDelegationEndpoint(value.parent, "PARENT");
  const child = normalizeDelegationEndpoint(value.child, "CHILD");
  if (parent.kind === child.kind && parent.refHash === child.refHash) {
    fail("DELEGATION_SELF_EDGE_INVALID");
  }
  if (!delegationEndpointMatchesCurrent(parent, identityRefs)
    && !delegationEndpointMatchesCurrent(child, identityRefs)) {
    fail("DELEGATION_EDGE_DOES_NOT_BIND_CURRENT_ACTOR");
  }
  const parentRadius = checkedRadius(value.parentRadius, "DELEGATION_PARENT");
  const childRadius = checkedRadius(value.childRadius, "DELEGATION_CHILD");
  assertDelegationRadiusValidAt(parentRadius, observedAt);
  assertDelegationRadiusValidAt(childRadius, observedAt);
  if (!delegationRadiusLeq({ candidate: childRadius, ceiling: parentRadius })) {
    fail("DELEGATION_CHILD_RADIUS_EXPANDS_PARENT");
  }
  const body = {
    schema: ACTOR_IDENTITY_ENVELOPE_SCHEMAS.delegationEdge,
    parent,
    child,
    parentRadius,
    childRadius,
    parentRadiusHash: parentRadius.radiusHash,
    childRadiusHash: childRadius.radiusHash,
    delegationEvidenceRefHash: hash(value.delegationEvidenceRefHash,
      "DELEGATION_EVIDENCE_REF_HASH"),
    assurance: normalizeAssurance(value.assurance, "DELEGATION_EDGE"),
    structuralContractionVerified: true,
    continuityEstablished: false,
    delegationAuthorityEstablished: false,
  };
  return { ...body, delegationEdgeHash: digest(
    ACTOR_IDENTITY_ENVELOPE_SCHEMAS.delegationEdge, body) };
}

function delegationEdgeInput(value) {
  return {
    parent: value.parent,
    child: value.child,
    parentRadius: value.parentRadius,
    childRadius: value.childRadius,
    delegationEvidenceRefHash: value.delegationEvidenceRefHash,
    assurance: assuranceInput(value.assurance),
  };
}

function normalizeDelegationEdges(value, identityRefs, observedAt) {
  denseArray(value, "DELEGATION_EDGES", MAX_EDGES);
  const result = new ArrayConstructor();
  for (let index = 0; index < value.length; index += 1) {
    append(result, normalizeDelegationEdge(value[index], identityRefs, observedAt));
  }
  ArraySort(result, (left, right) => left.delegationEdgeHash < right.delegationEdgeHash
    ? -1 : left.delegationEdgeHash > right.delegationEdgeHash ? 1 : 0);
  for (let index = 1; index < result.length; index += 1) {
    if (result[index].delegationEdgeHash === result[index - 1].delegationEdgeHash) {
      fail("DELEGATION_EDGE_DUPLICATE");
    }
  }
  return result;
}

function normalizeLifecycleEdge(value) {
  exactObject(value, ["kind", "predecessorRefHashes", "successorRefHashes",
    "declarationEvidenceRefHash", "declaredAt", "assurance"], "LIFECYCLE_EDGE");
  const kind = oneOf(value.kind, ACTOR_IDENTITY_LIFECYCLE_KINDS,
    "LIFECYCLE_KIND");
  const predecessors = normalizeHashSet(value.predecessorRefHashes,
    "LIFECYCLE_PREDECESSORS", { nonempty: true, maximum: MAX_EDGES });
  const successors = normalizeHashSet(value.successorRefHashes,
    "LIFECYCLE_SUCCESSORS", { maximum: MAX_EDGES });
  if ((kind === "FORK" && (predecessors.length !== 1 || successors.length < 2))
    || (kind === "MERGE" && (predecessors.length < 2 || successors.length !== 1))
    || (kind === "RETIRE" && (predecessors.length !== 1 || successors.length !== 0))
    || ((kind === "REVISION" || kind === "KEY_ROTATION" || kind === "CONTROL_TRANSFER")
      && (predecessors.length !== 1 || successors.length !== 1))) {
    fail("LIFECYCLE_CARDINALITY_INVALID");
  }
  for (let index = 0; index < predecessors.length; index += 1) {
    if (contains(successors, predecessors[index])) fail("LIFECYCLE_SELF_TRANSITION_INVALID");
  }
  const body = {
    schema: ACTOR_IDENTITY_ENVELOPE_SCHEMAS.lifecycleEdge,
    kind,
    predecessorRefHashes: predecessors,
    successorRefHashes: successors,
    declarationEvidenceRefHash: hash(value.declarationEvidenceRefHash,
      "LIFECYCLE_DECLARATION_EVIDENCE_REF_HASH"),
    declaredAt: iso(value.declaredAt, "LIFECYCLE_DECLARED_AT"),
    assurance: normalizeAssurance(value.assurance, "LIFECYCLE_EDGE"),
    declarationShapeConsistent: true,
    continuityEstablished: false,
    historyInheritanceEstablished: false,
  };
  return { ...body, lifecycleEdgeHash: digest(
    ACTOR_IDENTITY_ENVELOPE_SCHEMAS.lifecycleEdge, body) };
}

function lifecycleEdgeInput(value) {
  return {
    kind: value.kind,
    predecessorRefHashes: value.predecessorRefHashes,
    successorRefHashes: value.successorRefHashes,
    declarationEvidenceRefHash: value.declarationEvidenceRefHash,
    declaredAt: value.declaredAt,
    assurance: assuranceInput(value.assurance),
  };
}

function normalizeLifecycleEdges(value) {
  denseArray(value, "LIFECYCLE_EDGES", MAX_EDGES);
  const result = new ArrayConstructor();
  for (let index = 0; index < value.length; index += 1) {
    append(result, normalizeLifecycleEdge(value[index]));
  }
  ArraySort(result, (left, right) => left.lifecycleEdgeHash < right.lifecycleEdgeHash
    ? -1 : left.lifecycleEdgeHash > right.lifecycleEdgeHash ? 1 : 0);
  for (let index = 1; index < result.length; index += 1) {
    if (result[index].lifecycleEdgeHash === result[index - 1].lifecycleEdgeHash) {
      fail("LIFECYCLE_EDGE_DUPLICATE");
    }
  }
  return result;
}

function arrayInputs(values, converter) {
  const result = new ArrayConstructor();
  for (let index = 0; index < values.length; index += 1) {
    append(result, converter(values[index]));
  }
  return result;
}

function actorSubjectHash(principal, lineage, revision, modelRoute) {
  return digest("outsider/actor-subject/v1", {
    principalEpochProjectionHash: principal.principalEpochProjectionHash,
    deploymentLineageProjectionHash: lineage.deploymentLineageProjectionHash,
    deploymentRevisionHash: revision.deploymentRevisionHash,
    modelRoutePolicyHash: modelRoute.routePolicyHash,
    modelRouteProjectionHash: modelRoute.modelRouteProjectionHash,
  });
}

function attemptActorSubjectHash(subjectHash, bindings, modelRoute, runtime,
  embodiment, delegationEdges) {
  const delegationEdgeHashes = new ArrayConstructor();
  for (let index = 0; index < delegationEdges.length; index += 1) {
    append(delegationEdgeHashes, delegationEdges[index].delegationEdgeHash);
  }
  ArraySort(delegationEdgeHashes);
  return digest("outsider/attempt-actor-subject/v1", {
    actorSubjectHash: subjectHash,
    modelRouteProjectionHash: modelRoute.modelRouteProjectionHash,
    runtimeInstanceHash: runtime.runtimeInstanceHash,
    memoryStateMode: runtime.memoryStateMode,
    memoryStateCommitmentHash: runtime.memoryStateCommitmentHash,
    embodimentRevisionHash: embodiment === null ? null : embodiment.embodimentRevisionHash,
    delegationEdgeHashes,
    bindings,
  });
}

function makeSource(input) {
  const bindings = normalizeBindings(input.bindings);
  const principalEpoch = normalizePrincipalEpoch(input.principalEpoch);
  const deploymentLineage = normalizeDeploymentLineage(input.deploymentLineage,
    principalEpoch);
  const modelArtifacts = normalizeModelArtifacts(input.modelArtifacts);
  const deploymentRevision = normalizeDeploymentRevision(input.deploymentRevision,
    deploymentLineage, modelArtifacts);
  if (deploymentRevision.wayHash !== bindings.claimWayWorld.wayHash) {
    fail("BINDINGS_DEPLOYMENT_WAY_MISMATCH");
  }
  const modelRoute = normalizeModelRoute(input.modelRoute, modelArtifacts);
  const runtimeInstance = normalizeRuntimeInstance(input.runtimeInstance,
    deploymentRevision, principalEpoch);
  const observedAt = DateParse(bindings.run.observedAt);
  if (observedAt < DateParse(principalEpoch.validFrom)
    || observedAt >= DateParse(principalEpoch.validUntil)) {
    fail("RUN_OBSERVED_AT_OUTSIDE_PRINCIPAL_EPOCH");
  }
  if (observedAt < DateParse(runtimeInstance.validFrom)
    || observedAt >= DateParse(runtimeInstance.validUntil)) {
    fail("RUN_OBSERVED_AT_OUTSIDE_RUNTIME_INSTANCE");
  }
  const subjectHash = actorSubjectHash(principalEpoch, deploymentLineage,
    deploymentRevision, modelRoute);
  const embodimentRevision = normalizeEmbodimentRevision(input.embodimentRevision,
    deploymentRevision);
  const delegationEdges = normalizeDelegationEdges(input.delegationEdges, {
    principalEpochProjectionHash: principalEpoch.principalEpochProjectionHash,
    actorSubjectHash: subjectHash,
    runtimeInstanceHash: runtimeInstance.runtimeInstanceHash,
  }, bindings.run.observedAt);
  const lifecycleEdges = normalizeLifecycleEdges(input.lifecycleEdges);
  const attemptSubjectHash = attemptActorSubjectHash(subjectHash, bindings, modelRoute,
    runtimeInstance, embodimentRevision, delegationEdges);
  const body = {
    schema: ACTOR_IDENTITY_ENVELOPE_SCHEMAS.source,
    schemaVersion: "1.0.0",
    sourceClass: "IDENTITY_REFERENCE_GRAPH_HOLD_ONLY",
    principalEpochProjectionHash: principalEpoch.principalEpochProjectionHash,
    deploymentLineageProjectionHash:
      deploymentLineage.deploymentLineageProjectionHash,
    actorSubjectHash: subjectHash,
    attemptActorSubjectHash: attemptSubjectHash,
    subjectAggregationPolicy:
      "ACTOR_SUBJECT_HASH_FOR_ACCOUNT_ATTEMPT_ACTOR_SUBJECT_HASH_FOR_EXECUTION",
    creditAggregationPolicy: CREDIT_AGGREGATION_POLICY,
    bindings,
    principalEpoch,
    deploymentLineage,
    deploymentRevision,
    modelArtifacts,
    modelRoute,
    runtimeInstance,
    embodimentRevision,
    delegationEdges,
    lifecycleEdges,
    sourceBoundary: ACTOR_IDENTITY_NO_AUTHORITY,
  };
  return deepFreeze({ ...body, sourceHash: digest(
    ACTOR_IDENTITY_ENVELOPE_SCHEMAS.source, body) });
}

export function createActorIdentityEnvelopeSource(input = {}) {
  canonicalizeStrict(input);
  exactObject(input, ["bindings", "principalEpoch", "deploymentLineage",
    "deploymentRevision", "modelArtifacts", "modelRoute", "runtimeInstance",
    "embodimentRevision", "delegationEdges", "lifecycleEdges"], "SOURCE_INPUT");
  return makeSource(input);
}

function sourceInput(value) {
  return {
    bindings: value.bindings,
    principalEpoch: principalInput(value.principalEpoch),
    deploymentLineage: lineageInput(value.deploymentLineage),
    deploymentRevision: deploymentRevisionInput(value.deploymentRevision),
    modelArtifacts: arrayInputs(value.modelArtifacts, modelArtifactInput),
    modelRoute: modelRouteInput(value.modelRoute),
    runtimeInstance: runtimeInput(value.runtimeInstance),
    embodimentRevision: embodimentInput(value.embodimentRevision),
    delegationEdges: arrayInputs(value.delegationEdges, delegationEdgeInput),
    lifecycleEdges: arrayInputs(value.lifecycleEdges, lifecycleEdgeInput),
  };
}

function exactSource(value) {
  canonicalizeStrict(value);
  exactObject(value, ["schema", "schemaVersion", "sourceClass",
    "principalEpochProjectionHash", "deploymentLineageProjectionHash",
    "actorSubjectHash", "attemptActorSubjectHash", "subjectAggregationPolicy",
    "creditAggregationPolicy", "bindings",
    "principalEpoch", "deploymentLineage", "deploymentRevision", "modelArtifacts",
    "modelRoute", "runtimeInstance", "embodimentRevision", "delegationEdges",
    "lifecycleEdges", "sourceBoundary", "sourceHash"], "SOURCE");
  if (value.schema !== ACTOR_IDENTITY_ENVELOPE_SCHEMAS.source
    || value.schemaVersion !== "1.0.0"
    || value.sourceClass !== "IDENTITY_REFERENCE_GRAPH_HOLD_ONLY"
    || value.subjectAggregationPolicy
      !== "ACTOR_SUBJECT_HASH_FOR_ACCOUNT_ATTEMPT_ACTOR_SUBJECT_HASH_FOR_EXECUTION"
    || value.creditAggregationPolicy !== CREDIT_AGGREGATION_POLICY
    || !same(value.sourceBoundary, ACTOR_IDENTITY_NO_AUTHORITY)) fail("SOURCE_STATE_INVALID");
  hash(value.principalEpochProjectionHash, "PRINCIPAL_EPOCH_PROJECTION_HASH");
  hash(value.deploymentLineageProjectionHash,
    "DEPLOYMENT_LINEAGE_PROJECTION_HASH");
  hash(value.actorSubjectHash, "ACTOR_SUBJECT_HASH");
  hash(value.attemptActorSubjectHash, "ATTEMPT_ACTOR_SUBJECT_HASH");
  hash(value.sourceHash, "SOURCE_HASH");
  return value;
}

function replaySource(value, expectedSourceHash) {
  exactSource(value);
  const rebuilt = createActorIdentityEnvelopeSource(sourceInput(value));
  if (!same(value, rebuilt)) fail("SOURCE_DERIVATION_INVALID");
  if (rebuilt.sourceHash !== hash(expectedSourceHash, "EXPECTED_SOURCE_HASH")) {
    fail("EXPECTED_SOURCE_HASH_MISMATCH");
  }
  return rebuilt;
}

function modelAttributionStatus(source) {
  if (source.modelRoute.transparency === "OPAQUE"
    || source.modelRoute.transparency === "UNKNOWN") return "ABSTAIN_ROUTE_UNOBSERVED";
  for (let index = 0; index < source.modelArtifacts.length; index += 1) {
    if (source.modelArtifacts[index].fineTuneState === "UNKNOWN"
      || source.modelArtifacts[index].fineTuneState === "NOT_DECLARED") {
      return "ABSTAIN_FINE_TUNE_LINEAGE_UNKNOWN";
    }
  }
  return "COMPONENT_REFERENCE_ONLY_NO_CREDIT_INCIDENT_OR_CAUSAL_ATTRIBUTION";
}

function gapReasons(source) {
  const result = new ArrayConstructor();
  append(result, "ACTOR_IDENTITY_REFERENCES_NOT_EXTERNALLY_VERIFIED");
  append(result, "CREDIT_INCIDENT_AND_CAUSAL_ATTRIBUTION_NOT_ESTABLISHED");
  append(result, "DEPLOYMENT_AND_HISTORY_CONTINUITY_NOT_ESTABLISHED");
  append(result, "IDENTITY_DOES_NOT_ESTABLISH_AUTHORITY");
  append(result, "LEGAL_PRINCIPAL_BINDING_NOT_ESTABLISHED");
  append(result, "WORKLOAD_IDENTITY_NOT_EXTERNALLY_ATTESTED");
  if (source.modelRoute.transparency === "OPAQUE") append(result, "MODEL_ROUTE_OPAQUE");
  if (source.modelRoute.transparency === "UNKNOWN") append(result, "MODEL_ROUTE_UNKNOWN");
  let fineTuneUnknown = false;
  let artifactUnknown = false;
  for (let index = 0; index < source.modelArtifacts.length; index += 1) {
    if (source.modelArtifacts[index].fineTuneState === "UNKNOWN"
      || source.modelArtifacts[index].fineTuneState === "NOT_DECLARED") fineTuneUnknown = true;
    if (source.modelArtifacts[index].artifactRootHash === null) artifactUnknown = true;
  }
  if (fineTuneUnknown) append(result, "MODEL_FINE_TUNE_PROVENANCE_UNKNOWN");
  if (artifactUnknown) append(result, "MODEL_ARTIFACT_BYTES_UNAVAILABLE");
  if (source.runtimeInstance.memoryStateMode === "OPAQUE") {
    append(result, "RUNTIME_MEMORY_STATE_OPAQUE");
  }
  if (source.lifecycleEdges.length > 0) {
    append(result, "LIFECYCLE_DECLARATIONS_DO_NOT_ESTABLISH_CONTINUITY");
  }
  if (source.delegationEdges.length > 0) {
    append(result, "DELEGATION_CONTRACTION_DOES_NOT_ESTABLISH_DELEGATION_AUTHORITY");
  }
  let physicalActuationReferenced = false;
  for (let edgeIndex = 0; edgeIndex < source.delegationEdges.length; edgeIndex += 1) {
    const edge = source.delegationEdges[edgeIndex];
    const radii = [edge.parentRadius, edge.childRadius];
    for (let radiusIndex = 0; radiusIndex < radii.length; radiusIndex += 1) {
      for (let cellIndex = 0; cellIndex < radii[radiusIndex].cells.length;
        cellIndex += 1) {
        const cell = radii[radiusIndex].cells[cellIndex];
        if (cell.atom === "PHYSICAL_ACTUATE" && cell.budget.limit !== "0") {
          physicalActuationReferenced = true;
        }
      }
    }
  }
  if (physicalActuationReferenced && source.embodimentRevision === null) {
    append(result, "PHYSICAL_ACTUATION_WITHOUT_BOUND_EMBODIMENT_OR_REMOTE_TARGET");
  }
  ArraySort(result);
  return result;
}

function buildFromSource(source) {
  const body = {
    schema: ACTOR_IDENTITY_ENVELOPE_SCHEMAS.envelope,
    schemaVersion: "1.0.0",
    envelopeClass: "SOURCE_REPLAYED_IDENTITY_REFERENCE_GRAPH_HOLD_ONLY",
    sourceHash: source.sourceHash,
    principalEpochProjectionHash: source.principalEpochProjectionHash,
    deploymentLineageProjectionHash: source.deploymentLineageProjectionHash,
    actorSubjectHash: source.actorSubjectHash,
    attemptActorSubjectHash: source.attemptActorSubjectHash,
    subjectAggregationPolicy: source.subjectAggregationPolicy,
    creditAggregationPolicy: source.creditAggregationPolicy,
    bindings: source.bindings,
    principalEpoch: source.principalEpoch,
    deploymentLineage: source.deploymentLineage,
    deploymentRevision: source.deploymentRevision,
    modelArtifacts: source.modelArtifacts,
    modelRoute: source.modelRoute,
    runtimeInstance: source.runtimeInstance,
    embodimentRevision: source.embodimentRevision,
    delegationEdges: source.delegationEdges,
    lifecycleEdges: source.lifecycleEdges,
    modelAttributionStatus: modelAttributionStatus(source),
    gapReasons: gapReasons(source),
    sourceReplayComplete: true,
    identityProofState: "REFERENCE_GRAPH_REPLAYED_EXTERNAL_ASSURANCE_UNVERIFIED",
    identityContinuityEstablished: false,
    historyInheritanceEstablished: false,
    modelAttributionEstablished: false,
    creditAttributionEstablished: false,
    incidentAttributionEstablished: false,
    causalAttributionEstablished: false,
    externalAuthorityEstablished: false,
    decisionState: "HOLD",
    actionReady: false,
    executable: false,
    causalExperienceUnits: 0,
    authority: ACTOR_IDENTITY_NO_AUTHORITY,
  };
  return deepFreeze({ ...body, actorIdentityEnvelopeHash: digest(
    ACTOR_IDENTITY_ENVELOPE_SCHEMAS.envelope, body) });
}

export function buildActorIdentityEnvelope(source) {
  canonicalizeStrict(source);
  exactSource(source);
  return buildFromSource(replaySource(source, source.sourceHash));
}

function exactEnvelope(value) {
  canonicalizeStrict(value);
  exactObject(value, ["schema", "schemaVersion", "envelopeClass", "sourceHash",
    "principalEpochProjectionHash", "deploymentLineageProjectionHash",
    "actorSubjectHash", "attemptActorSubjectHash", "subjectAggregationPolicy",
    "creditAggregationPolicy",
    "bindings", "principalEpoch", "deploymentLineage", "deploymentRevision",
    "modelArtifacts", "modelRoute", "runtimeInstance", "embodimentRevision",
    "delegationEdges", "lifecycleEdges", "modelAttributionStatus", "gapReasons",
    "sourceReplayComplete", "identityProofState", "identityContinuityEstablished",
    "historyInheritanceEstablished", "modelAttributionEstablished",
    "creditAttributionEstablished", "incidentAttributionEstablished",
    "causalAttributionEstablished", "externalAuthorityEstablished", "decisionState",
    "actionReady", "executable", "causalExperienceUnits", "authority",
    "actorIdentityEnvelopeHash"], "ENVELOPE");
  if (value.schema !== ACTOR_IDENTITY_ENVELOPE_SCHEMAS.envelope
    || value.schemaVersion !== "1.0.0"
    || value.envelopeClass !== "SOURCE_REPLAYED_IDENTITY_REFERENCE_GRAPH_HOLD_ONLY"
    || value.subjectAggregationPolicy
      !== "ACTOR_SUBJECT_HASH_FOR_ACCOUNT_ATTEMPT_ACTOR_SUBJECT_HASH_FOR_EXECUTION"
    || value.creditAggregationPolicy !== CREDIT_AGGREGATION_POLICY
    || value.sourceReplayComplete !== true
    || value.identityProofState
      !== "REFERENCE_GRAPH_REPLAYED_EXTERNAL_ASSURANCE_UNVERIFIED"
    || value.identityContinuityEstablished !== false
    || value.historyInheritanceEstablished !== false
    || value.modelAttributionEstablished !== false
    || value.creditAttributionEstablished !== false
    || value.incidentAttributionEstablished !== false
    || value.causalAttributionEstablished !== false
    || value.externalAuthorityEstablished !== false
    || value.decisionState !== "HOLD" || value.actionReady !== false
    || value.executable !== false || value.causalExperienceUnits !== 0
    || !same(value.authority, ACTOR_IDENTITY_NO_AUTHORITY)) fail("ENVELOPE_STATE_INVALID");
  hash(value.principalEpochProjectionHash, "PRINCIPAL_EPOCH_PROJECTION_HASH");
  hash(value.deploymentLineageProjectionHash,
    "DEPLOYMENT_LINEAGE_PROJECTION_HASH");
  hash(value.actorSubjectHash, "ACTOR_SUBJECT_HASH");
  hash(value.attemptActorSubjectHash, "ATTEMPT_ACTOR_SUBJECT_HASH");
  hash(value.actorIdentityEnvelopeHash, "ACTOR_IDENTITY_ENVELOPE_HASH");
  return value;
}

function verificationFailure(error) {
  return deepFreeze({
    schema: ACTOR_IDENTITY_ENVELOPE_SCHEMAS.verification,
    ok: false,
    creditAggregationPolicy: CREDIT_AGGREGATION_POLICY,
    sourceReplayComplete: false,
    actorIdentityEnvelopeHash: null,
    identityContinuityEstablished: false,
    historyInheritanceEstablished: false,
    modelAttributionEstablished: false,
    creditAttributionEstablished: false,
    incidentAttributionEstablished: false,
    causalAttributionEstablished: false,
    externalAuthorityEstablished: false,
    decisionState: "HOLD",
    actionReady: false,
    executable: false,
    causalExperienceUnits: 0,
    authority: ACTOR_IDENTITY_NO_AUTHORITY,
    error: error instanceof ErrorConstructor ? error.message : "UNKNOWN_FAILURE",
  });
}

export function verifyActorIdentityEnvelope(record, options = {}) {
  try {
    canonicalizeStrict(record);
    canonicalizeStrict(options);
    exactEnvelope(record);
    exactObject(options, ["source", "expectedSourceHash", "expectedEnvelopeHash"],
      "VERIFY_OPTIONS");
    const source = replaySource(options.source,
      hash(options.expectedSourceHash, "EXPECTED_SOURCE_HASH"));
    const rebuilt = buildFromSource(source);
    if (rebuilt.actorIdentityEnvelopeHash !== hash(options.expectedEnvelopeHash,
      "EXPECTED_ENVELOPE_HASH")) fail("EXPECTED_ENVELOPE_HASH_MISMATCH");
    if (!same(record, rebuilt)) fail("ENVELOPE_SOURCE_REPLAY_MISMATCH");
    return deepFreeze({
      schema: ACTOR_IDENTITY_ENVELOPE_SCHEMAS.verification,
      ok: true,
      sourceReplayComplete: true,
      sourceHash: source.sourceHash,
      principalEpochProjectionHash: rebuilt.principalEpochProjectionHash,
      deploymentLineageProjectionHash: rebuilt.deploymentLineageProjectionHash,
      actorSubjectHash: rebuilt.actorSubjectHash,
      attemptActorSubjectHash: rebuilt.attemptActorSubjectHash,
      subjectAggregationPolicy:
        "ACTOR_SUBJECT_HASH_FOR_ACCOUNT_ATTEMPT_ACTOR_SUBJECT_HASH_FOR_EXECUTION",
      creditAggregationPolicy: CREDIT_AGGREGATION_POLICY,
      actorIdentityEnvelopeHash: rebuilt.actorIdentityEnvelopeHash,
      modelAttributionStatus: rebuilt.modelAttributionStatus,
      gapReasons: rebuilt.gapReasons,
      identityContinuityEstablished: false,
      historyInheritanceEstablished: false,
      modelAttributionEstablished: false,
      creditAttributionEstablished: false,
      incidentAttributionEstablished: false,
      causalAttributionEstablished: false,
      externalAuthorityEstablished: false,
      decisionState: "HOLD",
      actionReady: false,
      executable: false,
      causalExperienceUnits: 0,
      authority: ACTOR_IDENTITY_NO_AUTHORITY,
    });
  } catch (error) {
    return verificationFailure(error);
  }
}
