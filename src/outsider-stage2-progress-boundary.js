/*
 * Cycle-free Stage 2 typed-pricing progress boundary.
 *
 * Keep this leaf free of current-chain, math, flywheel, and readiness imports.
 * Both the progress projection and the readiness description consume the same
 * fixed zero-authority vocabulary without creating a circular trust graph.
 */

export const STAGE2_PROGRESS_PROJECTION_SCHEMA
  = "outsider/stage2-typed-pricing-progress/v1";
export const STAGE2_TARGET_PRICE_STATE = "NULL_NOT_ZERO";

const ObjectFreeze = Object.freeze;
const ObjectIsFrozen = Object.isFrozen;
const ObjectValues = Object.values;

function deepFreeze(value) {
  if (!value || typeof value !== "object" || ObjectIsFrozen(value)) return value;
  for (const child of ObjectValues(value)) deepFreeze(child);
  return ObjectFreeze(value);
}

const STAGE2_PROGRESS_BOUNDARY_DESCRIPTION = deepFreeze({
  schema: STAGE2_PROGRESS_PROJECTION_SCHEMA,
  referenceSemantics: "NON_EVIDENTIARY_CODE_REFERENCE_ONLY",
  rmaReceiptHashDisclosedHere: false,
  sourceArtifactsReverified: false,
  currentChainEstablished: false,
  temporalAuthenticityEstablished: false,
  temporalQuarantineReferenceOnly: true,
  closureCredit: false,
  sourceDomainHistoricalLossCostIndication: "NONZERO",
  targetTechnicalPremium: null,
  targetQuotedPrice: null,
  pricePermission: false,
  trainingPermission: false,
  targetPriceState: STAGE2_TARGET_PRICE_STATE,
  readyToPriceTargetDomain: false,
  readyToBearResponsibility: false,
  stage3QuoteInput: false,
  rmaAndCasNumericAmountsPooled: false,
  operationalAuthorityGranted: false,
});

export function describeStage2ProgressProjectionBoundary() {
  return STAGE2_PROGRESS_BOUNDARY_DESCRIPTION;
}
