/*
 * Institutional capital, custody, solvency, reserve, claims, and review
 * evidence lane.
 *
 * This is a source-domain evidence adapter.  It reconstructs descriptive
 * diagnostics from frozen official bytes and maps them to the readiness gap
 * ledger with zero closure credit.  Public records about a bank receiver, a
 * public-funds collateral program, a reporting insurer, or an actuarial
 * standard can never manufacture Outsider's own issuer, capital, custody,
 * pricing, guarantee, adjudication, settlement, payment, or closure authority.
 */

import { createHash } from "node:crypto";
import {
  closeSync, constants, fstatSync, openSync, readFileSync, readdirSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";
import {
  createReadinessGapLedger,
  verifyReadinessGapLedger,
} from "./outsider-readiness-gap-ledger.js";

export const INSTITUTIONAL_CAPITAL_CLAIMS_SCHEMA
  = "outsider/institutional-capital-claims-evidence/v1";
export const INSTITUTIONAL_CAPITAL_CLAIMS_FROZEN_AT
  = "2026-08-21T10:30:00.000Z";
export const INSTITUTIONAL_CAPITAL_CLAIMS_DEFAULT_GENERATED_AT
  = "2026-08-28T05:40:00.000Z";
export const INSTITUTIONAL_CAPITAL_CLAIMS_LEDGER_HASH
  = "sha256:817c6141f2048b9e3957cf52c96fb053c22d1e9bf9a4edb3c885ea7415f77349";
export const INSTITUTIONAL_CAPITAL_CLAIMS_LEDGER_GAP_COUNT = 69;

const HASH = /^sha256:[a-f0-9]{64}$/;
const RATIO = /^-?(?:0|[1-9]\d*)\.\d{8}$/;
const PERCENT = /^(?:0|[1-9]\d{0,2})\.\d{3}$/;

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function exactKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function sha256Bytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function domainHash(domain, value) {
  return sha256Bytes(`${domain}\0${canonicalizeStrict(value)}`);
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function canonicalTime(value, code) {
  if (typeof value !== "string" || value.length > 40
    || !Number.isFinite(Date.parse(value))) throw new Error(`${code}_INVALID`);
  const normalized = new Date(value).toISOString();
  if (normalized !== value) throw new Error(`${code}_NOT_CANONICAL`);
  return normalized;
}

export const INSTITUTIONAL_CAPITAL_CLAIMS_SOURCE_PINS = deepFreeze([
  {
    path: "fdic-failures.json", kind: "FDIC_BANKFIND_FAILURES_API_JSON",
    sourceGroup: "FDIC_BANK_FAILURES_1934_2026",
    url: "https://api.fdic.gov/banks/failures?limit=10000&sort_by=FAILDATE&sort_order=ASC&fields=NAME,CERT,FIN,CITYST,FAILDATE,FAILYR,SAVR,RESTYPE,RESTYPE1,QBFDEP,QBFASSET,COST,PSTALP,BIDNAME,BIDCITY,BIDSTATE",
    sizeBytes: 1_349_551,
    sha256: "sha256:4f1efa1011326cf6d5dacc2b407d4a20a42c603ec79cb02a62ba26d1ff73fb3f",
  },
  {
    path: "fdic-failures-swagger.yaml", kind: "FDIC_BANKFIND_API_SPECIFICATION_YAML",
    sourceGroup: "FDIC_BANK_FAILURES_1934_2026",
    url: "https://api.fdic.gov/banks/docs/swagger.yaml", sizeBytes: 34_749,
    sha256: "sha256:854500ae68d77185a12fc9260e0bbc0194e3848df0e54086f828656ea508852b",
  },
  {
    path: "fdic-failure-properties.yaml", kind: "FDIC_FAILURE_FIELD_DICTIONARY_YAML",
    sourceGroup: "FDIC_BANK_FAILURES_1934_2026",
    url: "https://api.fdic.gov/banks/docs/failure_properties.yaml", sizeBytes: 14_728,
    sha256: "sha256:7e3137fb6fc93dd49371b4d032f48fad403efd3d9a7f5cc8ca5480c00807364c",
  },
  {
    path: "fdic-dividends.html", kind: "FDIC_RECEIVERSHIP_DIVIDEND_POLICY_HTML",
    sourceGroup: "FDIC_RECEIVERSHIP_DIVIDENDS_POST_1999",
    url: "https://closedbanks.fdic.gov/dividends/", sizeBytes: 12_976,
    sha256: "sha256:e63c280e548aba441a332221bfcb4ccf4e57db5afd1941a54912430ba43173d4",
  },
  {
    path: "fdic-dividends.json", kind: "FDIC_RECEIVERSHIP_DIVIDEND_EVENTS_JSON",
    sourceGroup: "FDIC_RECEIVERSHIP_DIVIDENDS_POST_1999",
    url: "https://closedbanks.fdic.gov/dividends/search/All", sizeBytes: 930_766,
    sha256: "sha256:21f79ac746296613a8c0df48993c7be2f692feb117c21ba44b464f9cb9ce6206",
  },
  {
    path: "fdic-dividends-repeat.json",
    kind: "FDIC_RECEIVERSHIP_DIVIDEND_EVENTS_REPEAT_FETCH_JSON",
    sourceGroup: "FDIC_RECEIVERSHIP_DIVIDENDS_POST_1999",
    url: "https://closedbanks.fdic.gov/dividends/search/All", sizeBytes: 930_766,
    sha256: "sha256:00198c08f3c3b0a59151683ffb7786a50d2bc4de1d651dbc7cdfd8c0125d2c45",
  },
  {
    path: "fdic-dividends-app.js", kind: "FDIC_RECEIVERSHIP_DIVIDEND_ENDPOINT_CLIENT_JS",
    sourceGroup: "FDIC_RECEIVERSHIP_DIVIDENDS_POST_1999",
    url: "https://dpsx.fdic.gov/scripts/divfunds/divscripts.min.js", sizeBytes: 4_724,
    sha256: "sha256:1ffb80fec775d4a2b50c4f4a3841d788931673de198d2fff453db4e0b15dc76f",
  },
  {
    path: "treasury-tcmm.html", kind: "US_TREASURY_COLLATERAL_CUSTODY_PROGRAM_HTML",
    sourceGroup: "TREASURY_TCMM_COLLATERAL_CUSTODY_RULES",
    url: "https://fiscal.treasury.gov/payments-to-government/treasury-collateral-management-monitoring-tcmm",
    sizeBytes: 118_700,
    sha256: "sha256:2095ed9a9ad42c360328d2b844363651040d3a77b2812ed32cd041dcae29e4ba",
  },
  {
    path: "rli-edgar-index.json", kind: "SEC_EDGAR_FILING_DIRECTORY_JSON",
    sourceGroup: "SEC_RLI_2025_10K",
    url: "https://www.sec.gov/Archives/edgar/data/84246/000110465926018013/index.json",
    sizeBytes: 11_754,
    sha256: "sha256:97c2b2a6731abd7fb5b416a94d8a9e204cba13560511fe824564054a36d8148b",
  },
  {
    path: "rli-2025-10k.html", kind: "SEC_EDGAR_INLINE_XBRL_10K_HTML",
    sourceGroup: "SEC_RLI_2025_10K",
    url: "https://www.sec.gov/Archives/edgar/data/84246/000110465926018013/rli-20251231x10k.htm",
    sizeBytes: 8_558_265,
    sha256: "sha256:a01661c1abfb9880fe8a6452a5e17d1cf407ba2bff5ed44cdf4c5aee4ee1e853",
  },
  {
    path: "asop-23-data-quality.html", kind: "ASB_ADOPTED_STANDARD_HTML",
    sourceGroup: "ASB_ASOP_23",
    url: "https://www.actuarialstandardsboard.org/asops/data-quality/",
    sizeBytes: 115_940,
    sha256: "sha256:fa25a7aab95bcd5eec55db5c57197db5788cbd6f35edb8ada3be0f4059d0fb32",
  },
  {
    path: "asop-36-reserve-opinion.html", kind: "ASB_ADOPTED_STANDARD_HTML",
    sourceGroup: "ASB_ASOP_36",
    url: "https://www.actuarialstandardsboard.org/asops/asop-no-36-statements-of-actuarial-opinion-regarding-property-casualty-loss-loss-adjustment-expense-or-other-reserves/",
    sizeBytes: 141_053,
    sha256: "sha256:a5f2fa8807fa1083d484336683b42f1eaa3cf123f035504d52a319595a81bddd",
  },
  {
    path: "asop-53-future-costs.html", kind: "ASB_ADOPTED_STANDARD_HTML",
    sourceGroup: "ASB_ASOP_53",
    url: "https://www.actuarialstandardsboard.org/asops/estimating-future-costs-prospective-propertycasualty-risk-transfer-risk-retention/",
    sizeBytes: 108_333,
    sha256: "sha256:b97c0cd7ec5fccb4c3dda86908a65ec21d8839c4e01d7c1af3414c9eab594a5f",
  },
  {
    path: "asop-55-capital-adequacy.html", kind: "ASB_ADOPTED_STANDARD_HTML",
    sourceGroup: "ASB_ASOP_55",
    url: "https://www.actuarialstandardsboard.org/asops/capital-adequacy-assessment/",
    sizeBytes: 133_774,
    sha256: "sha256:8c5df1297e90b32974ba5aac6c501b03d88263d605279fb92ca83a2d220cf89c",
  },
]);

const SOURCE_GROUPS = deepFreeze([
  "FDIC_BANK_FAILURES_1934_2026",
  "FDIC_RECEIVERSHIP_DIVIDENDS_POST_1999",
  "TREASURY_TCMM_COLLATERAL_CUSTODY_RULES",
  "SEC_RLI_2025_10K",
  "ASB_ASOP_23",
  "ASB_ASOP_36",
  "ASB_ASOP_53",
  "ASB_ASOP_55",
]);

export const INSTITUTIONAL_CAPITAL_CLAIMS_MEASUREMENT_DICTIONARY = deepFreeze({
  schema: "outsider/institutional-capital-claims-measurement-dictionary/v1",
  version: "1.0.0",
  arithmetic: "INTEGER_COUNTS_BIGINT_MONEY_AND_HALF_UP_FIXED_DECIMALS",
  entries: [
    { measurementId: "FDIC_FAILURE_ENDPOINT_ACCOUNTING", sourceDomain: "US_BANK_RESOLUTION",
      equation: "PUBLISHED_ROWS_EQUALS_META_TOTAL_EQUALS_TOTALS_COUNT",
      denominator: "PINNED_ENDPOINT_SNAPSHOT", interpretation: "NOT_ALL_ACTIVE_BANKS" },
    { measurementId: "FDIC_FAILURE_RESOLUTION_CLASS", sourceDomain: "US_BANK_RESOLUTION",
      equation: "COUNT_BY_RESTYPE_AND_RESTYPE1_WITHOUT_COLLAPSING_CODES",
      denominator: "4115_FAILURE_OR_ASSISTANCE_ROWS", interpretation: "NOT_CAUSAL" },
    { measurementId: "FDIC_PRE_FAILURE_DEPOSITS", sourceDomain: "US_BANK_RESOLUTION",
      equation: "QBFDEP_AS_DOCUMENTED", denominator: "ROW_WITH_FIELD_PRESENT",
      interpretation: "THOUSANDS_USD_LAST_REPORT_CAVEAT" },
    { measurementId: "FDIC_PRE_FAILURE_ASSETS", sourceDomain: "US_BANK_RESOLUTION",
      equation: "QBFASSET_AS_DOCUMENTED", denominator: "ROW_WITH_FIELD_PRESENT",
      interpretation: "THOUSANDS_USD_EXCLUDES_OFF_BALANCE_SHEET" },
    { measurementId: "FDIC_ESTIMATED_DIF_RESOLUTION_LOSS", sourceDomain: "US_BANK_RESOLUTION",
      equation: "COST_AS_DOCUMENTED", denominator: "ROW_WITH_COST_PRESENT",
      interpretation: "REVISED_ESTIMATE_NOT_CLAIM_PAYMENT_OR_RESERVE" },
    { measurementId: "FDIC_COST_TO_DEPOSIT_RATIO", sourceDomain: "US_BANK_RESOLUTION",
      equation: "ROW_COST_DIVIDED_BY_POSITIVE_QBFDEP_ROUNDED_TO_8_DECIMALS",
      denominator: "COST_PRESENT_AND_POSITIVE_DEPOSIT", interpretation: "FAILED_INSTITUTIONS_ONLY" },
    { measurementId: "FDIC_COST_TO_ASSET_RATIO", sourceDomain: "US_BANK_RESOLUTION",
      equation: "ROW_COST_DIVIDED_BY_POSITIVE_QBFASSET_ROUNDED_TO_8_DECIMALS",
      denominator: "COST_PRESENT_AND_POSITIVE_ASSET", interpretation: "FAILED_INSTITUTIONS_ONLY" },
    { measurementId: "FDIC_DIVIDEND_EVENT", sourceDomain: "US_BANK_RECEIVERSHIP",
      equation: "ONE_PUBLISHED_ENDPOINT_ROW", denominator: "PINNED_POST_1999_LIST",
      interpretation: "EVENT_NOT_INDIVIDUAL_CLAIM_OR_BANK_TRANSFER_RECEIPT" },
    { measurementId: "FDIC_DIVIDEND_EVENT_PERCENT", sourceDomain: "US_BANK_RECEIVERSHIP",
      equation: "PAID_PERCENT", denominator: "CLAIM_PRIORITY_WITHIN_FUND",
      interpretation: "MARGINAL_PERCENT_NOT_DOLLARS" },
    { measurementId: "FDIC_DIVIDEND_CUMULATIVE_PERCENT", sourceDomain: "US_BANK_RECEIVERSHIP",
      equation: "TOTAL_PAID", denominator: "SAME_FUND_AND_NORMALIZED_PRIORITY_ONLY",
      interpretation: "NEVER_SUM_ACROSS_FUNDS_OR_PRIORITIES" },
    { measurementId: "FDIC_DIVIDEND_LATENCY", sourceDomain: "US_BANK_RECEIVERSHIP",
      equation: "PAY_DATE_MINUS_CLOSED_DATE_IN_UTC_DAYS",
      denominator: "DISTINCT_ROWS_WITH_VALID_DATES", interpretation: "NOT_HARM_RECOVERY_TIME" },
    { measurementId: "FDIC_FINAL_DIVIDEND_BOUNDARY", sourceDomain: "US_BANK_RECEIVERSHIP",
      equation: "COUNT_FINAL_ROWS_BY_TOTAL_PAID_BELOW_OR_EQUAL_100_PERCENT",
      denominator: "DIV_TYPE_FINAL", interpretation: "FINAL_EVENT_NOT_FULL_RECOVERY_OR_REALITY_RESTORATION" },
    { measurementId: "SEC_GROSS_CLAIM_LIABILITY", sourceDomain: "SELECTED_PUBLIC_INSURER_FILING",
      equation: "INLINE_XBRL_GROSS_LIABILITY_CURRENT_CONSOLIDATED_CONTEXT",
      denominator: "RLI_2025_10K", interpretation: "ISSUER_REPORTED_NOT_OUTSIDER_RESERVE" },
    { measurementId: "SEC_REINSURANCE_RECOVERABLE", sourceDomain: "SELECTED_PUBLIC_INSURER_FILING",
      equation: "INLINE_XBRL_RECOVERABLE_CURRENT_CONSOLIDATED_CONTEXT",
      denominator: "RLI_2025_10K", interpretation: "COUNTERPARTY_RECOVERABLE_NOT_CASH" },
    { measurementId: "SEC_NET_UNPAID_CLAIM_LIABILITY", sourceDomain: "SELECTED_PUBLIC_INSURER_FILING",
      equation: "GROSS_MINUS_RECOVERABLE_EQUALS_NET",
      denominator: "SAME_CURRENT_CONSOLIDATED_CONTEXT", interpretation: "GAAP_FILING_SCOPE_ONLY" },
    { measurementId: "SEC_STATUTORY_CAPITAL_AND_REQUIRED_RBC", sourceDomain: "SELECTED_PUBLIC_INSURER_FILING",
      equation: "SEPARATELY_EXTRACT_EXACT_SUBSIDIARY_SURPLUS_AND_PRINCIPAL_COMPANY_AUTHORIZED_CONTROL_LEVEL",
      denominator: "ENTITY_SCOPE_SPECIFIC", interpretation: "NO_CROSS_ENTITY_RATIO" },
    { measurementId: "SEC_RESTRICTED_REGULATORY_DEPOSIT", sourceDomain: "SELECTED_PUBLIC_INSURER_FILING",
      equation: "INLINE_XBRL_RESTRICTED_INVESTMENTS_CURRENT_CONSOLIDATED_CONTEXT",
      denominator: "RLI_2025_10K", interpretation: "REAL_RESTRICTION_NOT_OUTSIDER_CUSTODY" },
    { measurementId: "TREASURY_COLLATERAL_CUSTODY_STRUCTURE", sourceDomain: "US_PUBLIC_FUNDS_COLLATERAL",
      equation: "PIN_RULE_ROLE_AND_CUSTODY_STATEMENTS", denominator: "TCMM_PROGRAM_PAGE",
      interpretation: "STRUCTURAL_ONLY_NO_TRANSACTION_RECEIPT" },
    { measurementId: "ASOP_PROFESSIONAL_REVIEW_STRUCTURE", sourceDomain: "US_ACTUARIAL_PRACTICE",
      equation: "PIN_ADOPTED_STATUS_EFFECTIVE_DATE_AND_REQUIRED_TOPICS",
      denominator: "ASOP_23_36_53_55", interpretation: "STANDARD_IS_NOT_AN_OUTSIDER_REVIEW" },
  ],
});

export const INSTITUTIONAL_CAPITAL_CLAIMS_QUALITY_GATE = deepFreeze({
  schema: "outsider/source-quality-gate/v1",
  version: "1.0.0",
  dimensions: ["reality", "completeness", "measurement", "selectionBias",
    "correlation", "revision", "independentReview", "rights", "sourceReplay"],
  publisherIdentityUsedAsQualityScore: false,
  assessments: [
    {
      sourceId: "FDIC_BANK_FAILURES_1934_2026",
      sourcePaths: ["fdic-failures.json", "fdic-failures-swagger.yaml",
        "fdic-failure-properties.yaml"],
      reality: "OBSERVED_REGULATORY_FAILURE_AND_ASSISTANCE_RECORDS",
      completeness: "PINNED_ENDPOINT_ROWS_ACCOUNTED_BUT_NO_ACTIVE_BANK_DENOMINATOR",
      measurement: "FIELD_DICTIONARY_PINNED_UNITS_AND_CAVEATS_PRESERVED",
      selectionBias: "ONLY_FAILED_OR_ASSISTED_INSTITUTIONS_AND_HISTORICAL_PROGRAM_CHANGES",
      correlation: "TIME_GEOGRAPHY_AND_RESOLUTION_DEPENDENCE_NOT_IDENTIFIED_AS_IID",
      revision: "COST_IS_REVISED_ESTIMATE_AND_ENDPOINT_INDEX_IS_MUTABLE",
      independentReview: "REGULATOR_PUBLISHED_NOT_INDEPENDENT_AUDIT_OF_EACH_ROW",
      rights: "PUBLIC_ACCESS_OBSERVED_REUSE_TRAINING_COMMERCIAL_RIGHTS_NOT_CONCLUDED",
      sourceReplay: "EXACT_RAW_BYTES_AND_DOCUMENTED_SCHEMA_REQUIRED",
      admissionDecision: "ADMIT_REAL_SOURCE_DOMAIN_DESCRIPTIVE",
    },
    {
      sourceId: "FDIC_RECEIVERSHIP_DIVIDENDS_POST_1999",
      sourcePaths: ["fdic-dividends.html", "fdic-dividends.json",
        "fdic-dividends-repeat.json", "fdic-dividends-app.js"],
      reality: "OBSERVED_RECEIVERSHIP_DIVIDEND_EVENTS",
      completeness: "PAGE_LIMITS_LIST_TO_FAILURES_SINCE_1999_NO_CLAIM_DENOMINATOR",
      measurement: "POLICY_DEFINES_EVENT_TYPES_AND_PERCENT_FIELDS_NOT_DOLLARS",
      selectionBias: "PROVEN_CLAIMANT_RECEIVERSHIPS_ONLY_NO_DENIED_CLAIM_POPULATION",
      correlation: "REPEATED_EVENTS_NESTED_WITHIN_FUND_AND_PRIORITY",
      revision: "TWO_FETCHES_SAME_EVENT_MULTISET_DIFFERENT_RAW_ORDER_AND_CUMULATIVE_REVISIONS_PRESENT",
      independentReview: "RECEIVER_PUBLISHED_NOT_INDEPENDENT_PAYMENT_RECEIPT_AUDIT",
      rights: "PUBLIC_ACCESS_OBSERVED_REUSE_TRAINING_COMMERCIAL_RIGHTS_NOT_CONCLUDED",
      sourceReplay: "BOTH_EXACT_RAW_RESPONSES_AND_POLICY_PAGE_REQUIRED",
      admissionDecision: "ADMIT_REAL_PAYMENT_LIFECYCLE_DESCRIPTIVE",
    },
    {
      sourceId: "TREASURY_TCMM_COLLATERAL_CUSTODY_RULES",
      sourcePaths: ["treasury-tcmm.html"],
      reality: "OPERATING_GOVERNMENT_PROGRAM_DESCRIPTION",
      completeness: "RULE_AND_ROLE_PAGE_WITHOUT_TRANSACTION_POPULATION",
      measurement: "COLLATERAL_VALUATION_AND_CUSTODY_ROLES_DESCRIBED_NO_AMOUNTS_EXTRACTED",
      selectionBias: "PUBLIC_FUNDS_AND_INDIVIDUAL_SURETY_CONTEXTS_ONLY",
      correlation: "NOT_APPLICABLE_TO_STRUCTURAL_EVIDENCE",
      revision: "LIVE_PROGRAM_PAGE_CAN_CHANGE",
      independentReview: "PROGRAM_OPERATOR_STATEMENT_NOT_INDEPENDENT_AUDIT",
      rights: "PUBLIC_ACCESS_OBSERVED_REUSE_TRAINING_COMMERCIAL_RIGHTS_NOT_CONCLUDED",
      sourceReplay: "EXACT_RAW_PAGE_REQUIRED",
      admissionDecision: "STRUCTURAL_GOVERNANCE_ONLY",
    },
    {
      sourceId: "SEC_RLI_2025_10K", sourcePaths: ["rli-edgar-index.json", "rli-2025-10k.html"],
      reality: "REAL_ISSUER_REPORTED_2025_FINANCIAL_AND_REGULATORY_DISCLOSURES",
      completeness: "ONE_SELECTED_PUBLIC_INSURER_NOT_INSURER_POPULATION",
      measurement: "INLINE_XBRL_CONCEPT_CONTEXT_UNIT_AND_SCALE_REPLAYED",
      selectionBias: "SINGLE_PUBLIC_PROPERTY_CASUALTY_GROUP_SELECTED_FOR_MEASUREMENT_STRUCTURE",
      correlation: "FACTS_SHARE_ONE_REPORTING_GROUP_AND_ACCOUNTING_PERIOD",
      revision: "FILING_CAN_BE_AMENDED_OR_RESTATED_AND_ACCOUNTING_BASES_DIFFER",
      independentReview: "AUDITOR_REPORT_PRESENT_BUT FACT_LEVEL_AUDIT_SCOPE_NOT_INDEPENDENTLY_MAPPED",
      rights: "PUBLIC_ACCESS_OBSERVED_REUSE_TRAINING_COMMERCIAL_RIGHTS_NOT_CONCLUDED",
      sourceReplay: "EXACT_EDGAR_INDEX_AND_INLINE_XBRL_BYTES_REQUIRED",
      admissionDecision: "ADMIT_REAL_ISSUER_DISCLOSURE_DESCRIPTIVE",
    },
    ...[23, 36, 53, 55].map((number) => ({
      sourceId: `ASB_ASOP_${number}`,
      sourcePaths: [{ 23: "asop-23-data-quality.html", 36: "asop-36-reserve-opinion.html",
        53: "asop-53-future-costs.html", 55: "asop-55-capital-adequacy.html" }[number]],
      reality: "ADOPTED_PROFESSIONAL_STANDARD",
      completeness: "NAMED_STANDARD_ONLY_NOT_COMPLETE_LAW_REGULATION_OR_ASSIGNMENT_FILE",
      measurement: "STATUS_EFFECTIVE_DATE_SCOPE_AND_REQUIRED_TOPICS_PINNED",
      selectionBias: "US_ACTUARIAL_PRACTICE_SCOPE_ONLY",
      correlation: "NOT_EMPIRICAL_OUTCOME_DATA",
      revision: "STANDARD_CAN_BE_REVISED_OR_SUPERSEDED",
      independentReview: "DEFINES_PRACTICE_EXPECTATIONS_BUT PERFORMS_NO_OUTSIDER_REVIEW",
      rights: "PUBLIC_ACCESS_OBSERVED_REUSE_TRAINING_COMMERCIAL_RIGHTS_NOT_CONCLUDED",
      sourceReplay: "EXACT_RAW_STANDARD_PAGE_REQUIRED",
      admissionDecision: "STRUCTURAL_PROFESSIONAL_STANDARD_ONLY",
    })),
  ],
});

const RIGHTS_BOUNDARY = deepFreeze({
  publicAccessObserved: true,
  governmentOrInstitutionalPublicationObserved: true,
  copyrightOwnershipDetermined: false,
  rawRedistributionAuthorized: false,
  commercialReuseAuthorized: false,
  trainingLegalConclusion: false,
  TRAIN: false,
  artifactContainsRawSourceRows: false,
  artifactContainsSourceDomainAggregatesAndPinnedFactProjectionsOnly: true,
});

const AUTHORITY_BOUNDARY = deepFreeze({
  mode: "none",
  OutsiderIssuer: false,
  OutsiderCapital: false,
  OutsiderCustody: false,
  OutsiderReserve: false,
  OutsiderPrice: false,
  OutsiderGuarantee: false,
  OutsiderSettlement: false,
  OutsiderClaimsAuthority: false,
  OutsiderAppealAuthority: false,
  OutsiderClosureAuthority: false,
  movesFunds: false,
  createsCoverage: false,
  closesReadinessGap: false,
  productionReady: false,
});

const OUTPUT_BOUNDARY = deepFreeze({
  sourceDomainDiagnosticsOnly: true,
  noCrossDomainDollarPooling: true,
  noBankToInsuranceOrAgentCapitalTransfer: true,
  noSelectedInsurerToOutsiderCapitalTransfer: true,
  noPublicCustodyRuleToOutsiderCustodyTransfer: true,
  noStandardToCompletedIndependentReviewTransfer: true,
  noFinalDividendToFullRecoveryOrRestorationTransfer: true,
  noFailureFrequencyEstimate: true,
  noTargetFrequencySeverityPriceGuaranteeSettlementOrCapitalModel: true,
  productionReady: false,
});

const GAP_SOURCE_ILLUMINATION = deepFreeze({
  S2_ADJUDICATED_ECONOMIC_LOSS_SEVERITY: {
    sourceIds: ["FDIC_BANK_FAILURES_1934_2026", "FDIC_RECEIVERSHIP_DIVIDENDS_POST_1999"],
    illumination: "REAL_RESOLUTION_ESTIMATED_LOSS_AND_PAYMENT_PERCENT_STRUCTURE_NOT_ADJUDICATED_AGENT_ECONOMIC_LOSS",
  },
  S2_EXTERNAL_HOLDOUT_AND_CORRELATION_VALIDATION: {
    sourceIds: ["FDIC_BANK_FAILURES_1934_2026", "FDIC_RECEIVERSHIP_DIVIDENDS_POST_1999", "SEC_RLI_2025_10K"],
    illumination: "NESTING_TIME_SELECTION_AND_SINGLE_ISSUER_DEPENDENCE_BOUNDARIES_ONLY",
  },
  S2_PROSPECTIVE_PREACTION_FACTOR_STREAM: {
    sourceIds: ["ASB_ASOP_23", "ASB_ASOP_53"],
    illumination: "DATA_AND_FUTURE_COST_PRACTICE_REQUIREMENTS_ONLY_NO_STREAM",
  },
  S2_INDEPENDENT_ACTUARIAL_REVIEW: {
    sourceIds: ["ASB_ASOP_23", "ASB_ASOP_36", "ASB_ASOP_53", "ASB_ASOP_55"],
    illumination: "REVIEW_STANDARD_STRUCTURE_ONLY_NO_REVIEWER_OR_OPINION_FOR_OUTSIDER",
  },
  S2_EXTERNAL_ADJUDICATION_FRAUD_TRUST: {
    sourceIds: ["FDIC_RECEIVERSHIP_DIVIDENDS_POST_1999"],
    illumination: "PROVEN_CLAIMANT_AND_PRIORITY_STRUCTURE_ONLY_NO_FRAUD_OR_APPEAL_FILES",
  },
  S2_LEGAL_PRODUCT_CLASSIFICATION: {
    sourceIds: ["ASB_ASOP_53"],
    illumination: "RISK_TRANSFER_FUTURE_COST_SCOPE_IS_NOT_LEGAL_PRODUCT_CLASSIFICATION",
  },
  S3_REAL_FUNDED_SHADOW_PILOT: {
    sourceIds: ["SEC_RLI_2025_10K", "FDIC_RECEIVERSHIP_DIVIDENDS_POST_1999"],
    illumination: "REAL_INSURER_RESOURCES_AND_REAL_RECEIVERSHIP_PAYMENTS_AS_ANALOGS_ONLY",
  },
  S3_GATE_BYPASS_REVOCATION_FAILURE_EVIDENCE: {
    sourceIds: ["FDIC_BANK_FAILURES_1934_2026"],
    illumination: "REAL_INSTITUTION_FAILURE_AND_RESOLUTION_CLASSES_NOT_OUTSIDER_GATE_FAILURES",
  },
  S3_STANDING_ISSUER_AND_LEGAL_AUTHORITY: {
    sourceIds: ["SEC_RLI_2025_10K"],
    illumination: "REAL_REPORTING_INSURER_EXISTS_BUT CONFERS_NO_OUTSIDER_STANDING",
  },
  S3_CAPITAL_CUSTODY_POLICY_COUNTERPARTIES: {
    sourceIds: ["SEC_RLI_2025_10K", "TREASURY_TCMM_COLLATERAL_CUSTODY_RULES",
      "FDIC_BANK_FAILURES_1934_2026"],
    illumination: "REAL_CAPITAL_RESTRICTED_DEPOSIT_COLLATERAL_CUSTODY_AND_RESOLUTION_STRUCTURES_WITHOUT_OUTSIDER_COUNTERPARTIES",
  },
  S3_AFFECTED_PARTY_STANDING_POLICY_TERMS: {
    sourceIds: ["FDIC_RECEIVERSHIP_DIVIDENDS_POST_1999"],
    illumination: "CLAIMANT_PRIORITY_STRUCTURE_ONLY_NOT_OUTSIDER_POLICY_TERMS",
  },
  S4_REAL_EXECUTION_LOSS_CLAIM: {
    sourceIds: ["FDIC_RECEIVERSHIP_DIVIDENDS_POST_1999"],
    illumination: "REAL_RECEIVERSHIP_DIVIDEND_EVENTS_NOT_OUTSIDER_COVERED_EXECUTION_CLAIMS",
  },
  S4_FINAL_ADJUDICATION_APPEAL_EVIDENCE: {
    sourceIds: ["FDIC_RECEIVERSHIP_DIVIDENDS_POST_1999"],
    illumination: "FINAL_DIVIDEND_IS_LAST_DISTRIBUTION_NOT_APPEAL_FINALITY",
  },
  S4_PAYMENT_AND_RECOVERY_EVIDENCE: {
    sourceIds: ["FDIC_RECEIVERSHIP_DIVIDENDS_POST_1999"],
    illumination: "REAL_PARTIAL_AND_FINAL_PAYMENT_LIFECYCLE_WITHOUT_INDIVIDUAL_RECEIPTS_OR_HARM_RECOVERY",
  },
  S4_LONGITUDINAL_CONSEQUENCE_MATURITY: {
    sourceIds: ["FDIC_RECEIVERSHIP_DIVIDENDS_POST_1999"],
    illumination: "MULTIYEAR_PAYMENT_LATENCY_ONLY_NOT_CONSEQUENCE_MATURITY",
  },
  S4_INDEPENDENT_CLAIMS_ADJUDICATOR: {
    sourceIds: ["FDIC_RECEIVERSHIP_DIVIDENDS_POST_1999"],
    illumination: "RECEIVER_PROVEN_CLAIM_STRUCTURE_NOT_AN_OUTSIDER_ADJUDICATOR",
  },
  S4_CUSTODIAN_PAYMENT_RAIL: {
    sourceIds: ["TREASURY_TCMM_COLLATERAL_CUSTODY_RULES", "FDIC_RECEIVERSHIP_DIVIDENDS_POST_1999"],
    illumination: "CUSTODY_ROLE_AND_PAYMENT_EVENTS_WITHOUT_AN_OUTSIDER_RAIL_OR_TRANSFER_RECEIPT",
  },
  S4_CLOSURE_REOPENING_AUTHORITY: {
    sourceIds: ["FDIC_RECEIVERSHIP_DIVIDENDS_POST_1999"],
    illumination: "FINAL_EVENT_BOUNDARY_DOES_NOT_ESTABLISH_CLOSURE_REOPENING_AUTHORITY",
  },
  S4_AFFECTED_PARTY_CHALLENGE_INSTITUTION: {
    sourceIds: ["FDIC_RECEIVERSHIP_DIVIDENDS_POST_1999"],
    illumination: "CLAIMANT_CLASSIFICATION_WITHOUT_CHALLENGE_OR_APPEAL_RECORDS",
  },
});

export const INSTITUTIONAL_CAPITAL_CLAIMS_MINIMUM_EXTERNAL_BUNDLES = deepFreeze([
  { bundleId: "WORKER_PLATFORM_AND_MULTI_ENVIRONMENT_CONTROL",
    gapIds: ["S05_CURRENT_ARTIFACT_R1_R5_CONFORMANCE",
      "S05_EXTERNAL_USER_REPOSITORIES_AND_SECOND_MACHINES",
      "S05_CORRECTION_EFFECT_AND_FALSE_INTERRUPTION_RATES",
      "S05_CODEX_NATIVE_ITEM_BINDING_AND_CORRECTION_DELIVERY",
      "S05_OTHER_WORKER_NATIVE_CONTROL_SURFACES"],
    requiredExternalClosure: "NATIVE_PLATFORM_CAPABILITIES_AND_REAL_MULTI_MACHINE_USER_EVIDENCE" },
  { bundleId: "CONTRIBUTION_RIGHTS_TIME_AND_PROSPECTIVE_WORLD_EVIDENCE",
    gapIds: ["S1_REAL_CONTRIBUTED_RUNS", "S1_THIRD_PARTY_CHAIN_VERIFICATION",
      "S1_EXTERNALLY_GOVERNED_TRUST_TIME_RIGHTS_REGISTRY",
      "S15_REAL_PROSPECTIVE_DEVICE_CONTROLS",
      "S15_INDEPENDENT_OUTCOME_SENSING_AND_PLATFORM_PARAMETERS",
      "S15_DATASET_AND_EXPERIENCE_RIGHTS_EVIDENCE", "S15_DEVICE_ACQUISITION_ROOT",
      "S15_OWNER_AFFECTED_PARTY_EXPERIMENT_GOVERNANCE", "S15_RIGHTS_REUSE_GOVERNANCE",
      "S15_REAL_CAUSAL_JUDGE_SURVIVAL_EVIDENCE"],
    requiredExternalClosure: "CONSENTED_RUNS_DEVICE_ROOTS_RIGHTS_GOVERNANCE_AND_INDEPENDENT_OUTCOMES" },
  { bundleId: "EXTERNAL_PRICE_EVIDENCE",
    gapIds: ["S2_COMPLETE_ZERO_LOSS_EXPOSURE_WINDOWS",
      "S2_ADJUDICATED_ECONOMIC_LOSS_SEVERITY",
      "S2_EXTERNAL_HOLDOUT_AND_CORRELATION_VALIDATION",
      "S2_PROSPECTIVE_PREACTION_FACTOR_STREAM"],
    requiredExternalClosure: "TARGET_DOMAIN_EXPOSURE_LOSS_HOLDOUT_DEPENDENCE_AND_PROSPECTIVE_FACTORS" },
  { bundleId: "PROFESSIONAL_AND_LEGAL_PRODUCT_REVIEW",
    gapIds: ["S2_INDEPENDENT_ACTUARIAL_REVIEW", "S2_EXTERNAL_ADJUDICATION_FRAUD_TRUST",
      "S2_LEGAL_PRODUCT_CLASSIFICATION"],
    requiredExternalClosure: "NAMED_INDEPENDENT_ACTUARY_COUNSEL_AND_ADJUDICATION_FRAUD_INSTITUTION_BOUND_TO_EXACT_PRODUCT" },
  { bundleId: "ISSUER_OWNER_AND_AFFECTED_PARTY_POLICY",
    gapIds: ["S3_STANDING_ISSUER_AND_LEGAL_AUTHORITY", "S3_RESOURCE_OWNER_ADOPTION",
      "S3_AFFECTED_PARTY_STANDING_POLICY_TERMS"],
    requiredExternalClosure: "AUTHORIZED_ISSUER_OWNER_ADOPTION_AND_BINDING_AFFECTED_PARTY_STANDING" },
  { bundleId: "FUNDED_CAPITAL_CUSTODY_AND_FAILURE_PILOT",
    gapIds: ["S3_REAL_FUNDED_SHADOW_PILOT", "S3_GATE_BYPASS_REVOCATION_FAILURE_EVIDENCE",
      "S3_CAPITAL_CUSTODY_POLICY_COUNTERPARTIES"],
    requiredExternalClosure: "FUNDED_RESERVE_CUSTODY_CONTRACT_NAMED_COUNTERPARTIES_AND_REAL_FAILURE_EXERCISE" },
  { bundleId: "CLAIM_ADJUDICATION_APPEAL_AND_CHALLENGE",
    gapIds: ["S4_REAL_EXECUTION_LOSS_CLAIM", "S4_FINAL_ADJUDICATION_APPEAL_EVIDENCE",
      "S4_INDEPENDENT_CLAIMS_ADJUDICATOR", "S4_CLOSURE_REOPENING_AUTHORITY",
      "S4_AFFECTED_PARTY_CHALLENGE_INSTITUTION"],
    requiredExternalClosure: "REAL_COVERED_CLAIM_INDEPENDENT_ADJUDICATION_APPEAL_CHALLENGE_AND_REOPENING" },
  { bundleId: "PAYMENT_RECOVERY_LONGITUDINAL_AND_RAIL",
    gapIds: ["S4_PAYMENT_AND_RECOVERY_EVIDENCE", "S4_LONGITUDINAL_CONSEQUENCE_MATURITY",
      "S4_CUSTODIAN_PAYMENT_RAIL"],
    requiredExternalClosure: "AUTHORIZED_RAIL_TRANSFER_RECEIPTS_RECOVERY_EVIDENCE_AND_LONG_TERM_CONSEQUENCE_OBSERVATION" },
].map((bundle) => ({ ...bundle, cannotBeClosedByThisArtifact: true })));

const RESEARCHED_NOT_ADMITTED = deepFreeze([
  { sourceId: "NAIC_FINANCIAL_DATA_REPOSITORY_BULK",
    url: "https://content.naic.org/industry/financial-data-repository",
    disposition: "NOT_ACQUIRED_REQUIRES_PAID_LICENSE_OR_INSTITUTIONAL_ACCESS",
    usefulFor: "MULTI_INSURER_STATUTORY_CAPITAL_RESERVE_AND_SOLVENCY_COHORT" },
  { sourceId: "NAIC_RECEIVERSHIP_UNIFORM_DATA_STANDARDS",
    url: "https://content.naic.org/committees/e/receivership-insolvency-tf",
    disposition: "STRUCTURAL_SCHEMA_ONLY_NO_PUBLIC_CLAIM_ROW_COHORT_ADMITTED",
    usefulFor: "CLAIM_NOTES_PAYMENT_HISTORY_FINANCIAL_AND_CLOSING_REPORT_SCHEMAS" },
  { sourceId: "NCIGF_ASSESSMENT_LIABILITY_REPORT",
    url: "https://www.ncigf.org/assessment-liability-information",
    disposition: "NOT_ADMITTED_PUBLISHER_EXPLICITLY_DISCLAIMS_INDEPENDENT_VERIFICATION_AND_REUSE_RIGHTS_NOT_CLEARED",
    usefulFor: "GUARANTY_FUND_CAPACITY_ASSESSMENTS_REFUNDS_AND_FIVE_YEAR_HISTORY" },
  { sourceId: "CALIFORNIA_DOI_SERFF_PUBLIC_RATE_FILINGS",
    url: "https://www.insurance.ca.gov/0250-insurers/0800-rate-filings/0050-viewing-room/",
    disposition: "NOT_ADMITTED_NO_DETERMINISTIC_UNBIASED_COHORT_SELECTED_AND_INTERACTIVE_TERMS_REQUIRED",
    usefulFor: "REAL_RATE_REVIEW_EXPERIENCE_PREMIUM_CLAIMS_AND_ACTUARIAL_CERTIFICATION" },
  { sourceId: "CFPB_CONSUMER_COMPLAINT_DATABASE",
    url: "https://www.consumerfinance.gov/data-research/consumer-complaints/",
    disposition: "NOT_ADMITTED_COMPLAINTS_NOT_STATISTICAL_SAMPLE_OR_ADJUDICATED_CLAIMS",
    usefulFor: "COMPANY_RESPONSE_AND_REMEDY_PROCESS_DESCRIPTIVE_EVIDENCE" },
  { sourceId: "FEMA_CBCA_ARBITRATIONS",
    url: "https://www.fema.gov/flood-insurance/rules-legislation/appeals",
    disposition: "ROUTED_TO_SEPARATE_FEMA_NFIP_REAL_CASE_LANE_TO_AVOID_DUPLICATION",
    usefulFor: "INDEPENDENT_ARBITRATION_DECISIONS" },
]);

const EXPECTED_SOURCE_FILES = Object.freeze([
  "acquisition.json", ...INSTITUTIONAL_CAPITAL_CLAIMS_SOURCE_PINS.map((pin) => pin.path),
].sort());

function stablePinnedBytes(file, pin) {
  let descriptor = null;
  try {
    descriptor = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size !== BigInt(pin.sizeBytes)
      || before.size > 16_000_000n) throw new Error(`SOURCE_FILE_INVALID:${pin.path}`);
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
      || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs
      || BigInt(bytes.length) !== after.size || sha256Bytes(bytes) !== pin.sha256) {
      throw new Error(`SOURCE_FILE_CHANGED_OR_MISMATCHED:${pin.path}`);
    }
    return bytes;
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
}

function sourceManifestProjection() {
  const objects = INSTITUTIONAL_CAPITAL_CLAIMS_SOURCE_PINS.map((pin) => ({
    path: pin.path, kind: pin.kind, sourceGroup: pin.sourceGroup,
    url: pin.url, sizeBytes: pin.sizeBytes, sha256: pin.sha256,
  }));
  return {
    frozenAt: INSTITUTIONAL_CAPITAL_CLAIMS_FROZEN_AT,
    sourceObjects: objects,
    sourceGroups: [...SOURCE_GROUPS],
    sourceBytes: objects.reduce((sum, object) => sum + object.sizeBytes, 0),
    sourceSetHash: domainHash("outsider:institutional-capital-claims-source-set:v1", objects),
    constructionMode: "RAW_FROZEN_BYTES_REBUILT_INSIDE_BUILDER",
    acceptsCallerSourceResult: false,
    acceptsCallerVerificationResult: false,
    acceptsCallerAdmissionCallback: false,
    sourceArtifactsReverifiedInsideBuilder: true,
  };
}

function validateAcquisitionManifest(bytes) {
  let manifest;
  try { manifest = JSON.parse(bytes.toString("utf8")); } catch {
    throw new Error("ACQUISITION_MANIFEST_JSON_INVALID");
  }
  const keys = ["schema", "frozenAt", "acquiredAt", "transportAttested",
    "acquisitionMode", "objects"];
  if (!exactKeys(manifest, keys)
    || manifest.schema !== "outsider/institutional-capital-claims-acquisition/v1"
    || manifest.frozenAt !== INSTITUTIONAL_CAPITAL_CLAIMS_FROZEN_AT
    || manifest.acquiredAt !== "SELF_ASSERTED_LOCAL_TIME"
    || manifest.transportAttested !== false
    || !new Set(["LIVE_FETCH_EXACT_BYTE_PIN",
      "LOCAL_IMPORT_OF_PREVIOUSLY_FETCHED_EXACT_BYTE_PIN"]).has(manifest.acquisitionMode)
    || !Array.isArray(manifest.objects)
    || manifest.objects.length !== INSTITUTIONAL_CAPITAL_CLAIMS_SOURCE_PINS.length) {
    throw new Error("ACQUISITION_MANIFEST_SCHEMA_INVALID");
  }
  manifest.objects.forEach((object, index) => {
    const pin = INSTITUTIONAL_CAPITAL_CLAIMS_SOURCE_PINS[index];
    if (!exactKeys(object, ["path", "url", "finalUrl", "sizeBytes", "sha256", "contentType"])
      || object.path !== pin.path || object.url !== pin.url
      || object.sizeBytes !== pin.sizeBytes || object.sha256 !== pin.sha256
      || typeof object.finalUrl !== "string" || !object.finalUrl.startsWith("https://")
      || typeof object.contentType !== "string") {
      throw new Error(`ACQUISITION_MANIFEST_OBJECT_INVALID:${pin.path}`);
    }
  });
}

function readFrozenSources(input) {
  if (!exactKeys(input, ["sourceDirectory"]) || typeof input.sourceDirectory !== "string") {
    throw new Error("SOURCE_INPUT_SCHEMA_INVALID");
  }
  const sourceDirectory = path.resolve(input.sourceDirectory);
  if (sourceDirectory === path.parse(sourceDirectory).root) {
    throw new Error("SOURCE_DIRECTORY_TOO_BROAD");
  }
  const actual = readdirSync(sourceDirectory).sort();
  if (canonicalizeStrict(actual) !== canonicalizeStrict(EXPECTED_SOURCE_FILES)) {
    throw new Error("SOURCE_DIRECTORY_FILE_SET_INVALID");
  }
  const bytes = Object.fromEntries(INSTITUTIONAL_CAPITAL_CLAIMS_SOURCE_PINS.map((pin) => (
    [pin.path, stablePinnedBytes(path.join(sourceDirectory, pin.path), pin)]
  )));
  validateAcquisitionManifest(readFileSync(path.join(sourceDirectory, "acquisition.json")));
  return bytes;
}

function parseJson(bytes, code) {
  try { return JSON.parse(bytes.toString("utf8")); } catch {
    throw new Error(`${code}_JSON_INVALID`);
  }
}

function countBy(rows, getter) {
  const counts = new Map();
  for (const row of rows) {
    const key = String(getter(row));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts].sort(([left], [right]) => left.localeCompare(right)));
}

function parseUsDate(value, code) {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value ?? "");
  if (!match) throw new Error(`${code}_INVALID`);
  const [, monthText, dayText, yearText] = match;
  const month = Number(monthText);
  const day = Number(dayText);
  const year = Number(yearText);
  const time = Date.UTC(year, month - 1, day);
  const date = new Date(time);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day) throw new Error(`${code}_INVALID`);
  return { time, year };
}

function scaledRatio(numerator, denominator, places = 8) {
  const leftInput = BigInt(numerator);
  const rightInput = BigInt(denominator);
  if (rightInput <= 0n) throw new Error("RATIO_DENOMINATOR_INVALID");
  const negative = leftInput < 0n;
  const left = negative ? -leftInput : leftInput;
  const scale = 10n ** BigInt(places);
  const magnitude = (left * scale * 2n + rightInput) / (2n * rightInput);
  return negative ? -magnitude : magnitude;
}

function formatScaled(value, places = 8) {
  const scale = 10n ** BigInt(places);
  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  const whole = magnitude / scale;
  const fraction = String(magnitude % scale).padStart(places, "0");
  return `${negative && magnitude !== 0n ? "-" : ""}${whole}.${fraction}`;
}

function nearestRank(sorted, probability) {
  if (sorted.length === 0) return null;
  const index = Math.max(0, Math.ceil(probability * sorted.length) - 1);
  return sorted[index];
}

function ratioDistribution(rows, denominatorField) {
  const values = rows.filter((row) => Number.isSafeInteger(row.COST)
    && Number.isSafeInteger(row[denominatorField]) && row[denominatorField] > 0)
    .map((row) => scaledRatio(row.COST, row[denominatorField]))
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  return {
    eligibleRows: values.length,
    perRowRounding: "HALF_UP_FIXED_8_DECIMALS_BEFORE_NEAREST_RANK",
    minimum: formatScaled(values[0]),
    p50NearestRank: formatScaled(nearestRank(values, 0.50)),
    p90NearestRank: formatScaled(nearestRank(values, 0.90)),
    p95NearestRank: formatScaled(nearestRank(values, 0.95)),
    p99NearestRank: formatScaled(nearestRank(values, 0.99)),
    maximum: formatScaled(values.at(-1)),
    negativeEstimateRows: values.filter((value) => value < 0n).length,
    overOneRows: values.filter((value) => value > 100_000_000n).length,
  };
}

function requireTextMarker(text, marker, code) {
  if (!text.includes(marker)) throw new Error(`${code}_MARKER_MISSING`);
}

function failuresDiagnostics(bytes, swaggerBytes, propertyBytes) {
  const source = parseJson(bytes, "FDIC_FAILURES");
  const swagger = swaggerBytes.toString("utf8");
  const properties = propertyBytes.toString("utf8");
  for (const marker of ["/failures:",
    "Get detail on historical bank failures from 1934 to present.",
    "application/json"]) requireTextMarker(swagger, marker, "FDIC_SWAGGER");
  for (const marker of ["QBFDEP:", "QBFASSET:", "COST:", "estimated loss",
    "Thousands of US Dollars", "RESTYPE1:"]) {
    requireTextMarker(properties, marker, "FDIC_FAILURE_PROPERTIES");
  }
  if (!exactKeys(source, ["meta", "data", "totals"])
    || source.meta?.total !== 4115 || source.totals?.count !== 4115
    || !Array.isArray(source.data) || source.data.length !== 4115
    || source.meta?.index?.name !== "failures_1779890467665"
    || source.meta?.index?.createTimestamp !== "2026-05-27T14:01:07Z") {
    throw new Error("FDIC_FAILURES_ENVELOPE_INVALID");
  }
  const expectedFields = ["BIDCITY", "BIDNAME", "BIDSTATE", "CERT", "CITYST", "COST",
    "FAILDATE", "FAILYR", "FIN", "ID", "NAME", "PSTALP", "QBFASSET", "QBFDEP",
    "RESTYPE", "RESTYPE1", "SAVR"].sort();
  const rows = [];
  const ids = new Set();
  let priorTime = -Infinity;
  for (const wrapped of source.data) {
    if (!exactKeys(wrapped, ["data", "score"]) || wrapped.score !== 1
      || canonicalizeStrict(Object.keys(wrapped.data).sort())
        !== canonicalizeStrict(expectedFields)) throw new Error("FDIC_FAILURE_ROW_SCHEMA_INVALID");
    const row = wrapped.data;
    if (typeof row.ID !== "string" || ids.has(row.ID)) throw new Error("FDIC_FAILURE_ID_INVALID");
    ids.add(row.ID);
    const parsedDate = parseUsDate(row.FAILDATE, "FDIC_FAILURE_DATE");
    if (String(parsedDate.year) !== row.FAILYR || parsedDate.time < priorTime) {
      throw new Error("FDIC_FAILURE_DATE_ORDER_INVALID");
    }
    priorTime = parsedDate.time;
    for (const field of ["QBFDEP", "QBFASSET", "COST", "CERT"]) {
      if (row[field] !== null && !Number.isSafeInteger(row[field])) {
        throw new Error(`FDIC_FAILURE_NUMERIC_INVALID:${field}`);
      }
    }
    rows.push(row);
  }
  const costPresent = rows.filter((row) => row.COST !== null);
  const before1986 = rows.filter((row) => Number(row.FAILYR) < 1986);
  const since1986 = rows.filter((row) => Number(row.FAILYR) >= 1986);
  return {
    sourceDomain: "US_BANK_RESOLUTION",
    endpointAccounting: {
      publishedRows: rows.length, metaTotal: source.meta.total,
      totalsCount: source.totals.count, uniqueRowIds: ids.size,
      indexName: source.meta.index.name,
      indexCreateTimestamp: source.meta.index.createTimestamp,
      firstFailureDate: rows[0].FAILDATE, lastFailureDate: rows.at(-1).FAILDATE,
      rowOrder: "FAILDATE_ASCENDING_WITH_SOURCE_ORDER_WITHIN_DATE",
    },
    selectionBoundary: {
      failedOrAssistedInstitutionsOnly: true,
      activeInstitutionExposureDenominatorObserved: false,
      failureFrequencyEligible: false,
      bankToInsuranceOrAiAgentTransferEligible: false,
      causalEffectEstimated: false,
    },
    resolutionCounts: {
      byRestype: countBy(rows, (row) => row.RESTYPE),
      byRestype1: countBy(rows, (row) => row.RESTYPE1),
      byInsurerProgramCode: countBy(rows, (row) => row.SAVR),
      byFailureYear: countBy(rows, (row) => row.FAILYR),
    },
    missingnessAndRevision: {
      depositMissingRows: rows.filter((row) => row.QBFDEP === null).length,
      depositZeroRows: rows.filter((row) => row.QBFDEP === 0).length,
      assetMissingRows: rows.filter((row) => row.QBFASSET === null).length,
      costMissingRows: rows.length - costPresent.length,
      costNegativeRows: costPresent.filter((row) => row.COST < 0).length,
      costZeroRows: costPresent.filter((row) => row.COST === 0).length,
      costPositiveRows: costPresent.filter((row) => row.COST > 0).length,
      pre1986Rows: before1986.length,
      pre1986CostMissingRows: before1986.filter((row) => row.COST === null).length,
      since1986Rows: since1986.length,
      since1986CostMissingRows: since1986.filter((row) => row.COST === null).length,
      costIsEstimatedDifLossSubjectToRevision: true,
      costIsClaimPayment: false,
      costIsInsuranceReserve: false,
      amountsUnit: "THOUSANDS_USD_AS_DOCUMENTED_BY_FDIC",
    },
    ratioDiagnostics: {
      costToPreFailureDeposits: ratioDistribution(rows, "QBFDEP"),
      costToPreFailureAssets: ratioDistribution(rows, "QBFASSET"),
      ratiosPooledAcrossProgramsOrYears: false,
      ratiosUsedAsOutsiderCapitalOrSeverityPrior: false,
    },
  };
}

function parsePercent(value, code) {
  const match = /^(\d{1,3})\.(\d{3})%$/.exec(value ?? "");
  if (!match) throw new Error(`${code}_INVALID`);
  const scaled = BigInt(match[1]) * 1000n + BigInt(match[2]);
  if (scaled < 0n || scaled > 100_000n) throw new Error(`${code}_RANGE_INVALID`);
  return scaled;
}

function formatMilliPercent(value) {
  return `${value / 1000n}.${String(value % 1000n).padStart(3, "0")}`;
}

function normalizedPriority(value) {
  if (value === "DEPOSITOR" || value === "DEPOSITORS") return "DEPOSITOR";
  if (["GEN TRADE CREDITOR", "GENERAL TRADE CREDIT",
    "GENERAL TRADE CREDITOR"].includes(value)) return "GENERAL_TRADE_CREDITOR";
  return "UNRECOGNIZED";
}

function eventFingerprint(row) {
  return domainHash("outsider:fdic-dividend-published-row:v1", row);
}

function multisetProjection(rows) {
  const counts = new Map();
  for (const row of rows) {
    const fingerprint = eventFingerprint(row);
    counts.set(fingerprint, (counts.get(fingerprint) ?? 0) + 1);
  }
  return [...counts].sort(([left], [right]) => left.localeCompare(right));
}

function dividendsDiagnostics(primaryBytes, repeatBytes, pageBytes, appBytes) {
  const primary = parseJson(primaryBytes, "FDIC_DIVIDENDS_PRIMARY");
  const repeat = parseJson(repeatBytes, "FDIC_DIVIDENDS_REPEAT");
  if (!exactKeys(primary, ["data"]) || !exactKeys(repeat, ["data"])
    || !Array.isArray(primary.data) || !Array.isArray(repeat.data)
    || primary.data.length !== 2385 || repeat.data.length !== 2385) {
    throw new Error("FDIC_DIVIDENDS_ENVELOPE_INVALID");
  }
  const page = pageBytes.toString("utf8");
  const app = appBytes.toString("utf8");
  for (const marker of ["proven claimants", "distributions of cash", "Priority of Dividends",
    "Types of Dividends", "quarterly reviews", "less than $25.00",
    "failed since September 1, 1999"]) requireTextMarker(page, marker, "FDIC_DIVIDENDS_PAGE");
  requireTextMarker(app, "/dividends/search/All", "FDIC_DIVIDENDS_APP");
  const expectedFields = ["closed_date", "div_type", "fdic_addr_1", "fdic_addr_2", "fund",
    "inst_name", "paid_percent", "pay_date", "priority", "total_paid", "web_page"].sort();
  for (const row of [...primary.data, ...repeat.data]) {
    if (canonicalizeStrict(Object.keys(row).sort()) !== canonicalizeStrict(expectedFields)) {
      throw new Error("FDIC_DIVIDEND_ROW_SCHEMA_INVALID");
    }
  }
  const primaryMultiset = multisetProjection(primary.data);
  const repeatMultiset = multisetProjection(repeat.data);
  if (canonicalizeStrict(primaryMultiset) !== canonicalizeStrict(repeatMultiset)) {
    throw new Error("FDIC_DIVIDEND_REPEAT_CONTENT_CHANGED");
  }
  if (canonicalizeStrict(primary.data) === canonicalizeStrict(repeat.data)) {
    throw new Error("FDIC_DIVIDEND_REPEAT_ORDER_PROBE_NOT_OBSERVED");
  }
  const seen = new Set();
  const distinctRows = [];
  let duplicateExtraRows = 0;
  for (const row of primary.data) {
    const fingerprint = eventFingerprint(row);
    if (seen.has(fingerprint)) duplicateExtraRows += 1;
    else { seen.add(fingerprint); distinctRows.push(row); }
  }
  const latency = [];
  const groupRows = new Map();
  let unrecognizedPriorityRows = 0;
  let unrecognizedDividendTypeRows = 0;
  for (const [ordinal, row] of distinctRows.entries()) {
    const closed = parseUsDate(row.closed_date, "FDIC_DIVIDEND_CLOSED_DATE");
    const paid = parseUsDate(row.pay_date, "FDIC_DIVIDEND_PAY_DATE");
    const days = (paid.time - closed.time) / 86_400_000;
    if (!Number.isSafeInteger(days) || days < 0) throw new Error("FDIC_DIVIDEND_LATENCY_INVALID");
    latency.push(days);
    parsePercent(row.paid_percent, "FDIC_DIVIDEND_PAID_PERCENT");
    parsePercent(row.total_paid, "FDIC_DIVIDEND_TOTAL_PERCENT");
    const priority = normalizedPriority(row.priority);
    if (priority === "UNRECOGNIZED") unrecognizedPriorityRows += 1;
    if (!["FINAL", "TRADITIONAL", "TRAD-NONCASH", "ADVANCED", "ADVANCE"]
      .includes(row.div_type)) unrecognizedDividendTypeRows += 1;
    const key = `${row.fund.trim()}\0${priority}`;
    if (!groupRows.has(key)) groupRows.set(key, []);
    groupRows.get(key).push({ row, ordinal, paidTime: paid.time,
      cumulative: parsePercent(row.total_paid, "FDIC_DIVIDEND_TOTAL_PERCENT") });
  }
  let groupsWithDownwardCumulativeRevision = 0;
  let downwardRevisionEvents = 0;
  let groupsWithFinalEvent = 0;
  let finalGroupsBelow100 = 0;
  let finalGroupsAt100 = 0;
  for (const events of groupRows.values()) {
    events.sort((left, right) => left.paidTime - right.paidTime || left.ordinal - right.ordinal);
    let previous = null;
    let groupDownward = false;
    for (const event of events) {
      if (previous !== null && event.cumulative < previous) {
        downwardRevisionEvents += 1;
        groupDownward = true;
      }
      previous = event.cumulative;
    }
    if (groupDownward) groupsWithDownwardCumulativeRevision += 1;
    const finals = events.filter((event) => event.row.div_type === "FINAL");
    if (finals.length > 0) {
      groupsWithFinalEvent += 1;
      const lastFinal = finals.at(-1).cumulative;
      if (lastFinal < 100_000n) finalGroupsBelow100 += 1;
      else if (lastFinal === 100_000n) finalGroupsAt100 += 1;
    }
  }
  latency.sort((left, right) => left - right);
  const finalPercentages = primary.data.filter((row) => row.div_type === "FINAL")
    .map((row) => parsePercent(row.total_paid, "FDIC_DIVIDEND_FINAL_PERCENT"))
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  const fundNames = new Map();
  for (const row of primary.data) {
    const fund = row.fund.trim();
    if (!fundNames.has(fund)) fundNames.set(fund, new Set());
    fundNames.get(fund).add(row.inst_name);
  }
  return {
    sourceDomain: "US_BANK_RECEIVERSHIP",
    endpointAccounting: {
      publishedRows: primary.data.length,
      repeatPublishedRows: repeat.data.length,
      exactSameEventMultisetAcrossTwoFetches: true,
      exactRawOrderSameAcrossTwoFetches: false,
      distinctPublishedRows: distinctRows.length,
      exactDuplicateExtraRows: duplicateExtraRows,
      normalizedFunds: fundNames.size,
      publishedInstitutionNameStrings: new Set(primary.data.map((row) => row.inst_name)).size,
      fundsWithMultipleInstitutionNameStrings:
        [...fundNames.values()].filter((names) => names.size > 1).length,
      rowsWithFundWhitespace: primary.data.filter((row) => row.fund !== row.fund.trim()).length,
    },
    categoryAccounting: {
      rawDividendTypeCounts: countBy(primary.data, (row) => row.div_type),
      rawPriorityCounts: countBy(primary.data, (row) => row.priority),
      normalizedPriorityCounts: countBy(primary.data, (row) => normalizedPriority(row.priority)),
      unrecognizedPriorityRows,
      unrecognizedDividendTypeRows,
      categoriesSilentlyDropped: false,
      anomalousRowsUsedForTargetModel: false,
    },
    groupedCumulativeDiagnostics: {
      groupingKey: "TRIMMED_FUND_PLUS_NORMALIZED_PRIORITY",
      groups: groupRows.size,
      groupsWithDownwardCumulativeRevision,
      downwardCumulativeRevisionEvents: downwardRevisionEvents,
      percentagesSummedAcrossFunds: false,
      percentagesSummedAcrossPriorities: false,
      duplicateRowsRemovedOnlyFor_SEQUENCE_AND_LATENCY_DIAGNOSTICS: true,
    },
    closureToPaymentLatencyDays: {
      eligibleDistinctRows: latency.length,
      quantileDefinition: "NEAREST_RANK_ON_DISTINCT_PUBLISHED_EVENT_ROWS",
      minimum: latency[0], p50: nearestRank(latency, 0.50), p90: nearestRank(latency, 0.90),
      p95: nearestRank(latency, 0.95), p99: nearestRank(latency, 0.99), maximum: latency.at(-1),
      zeroDayRows: latency.filter((value) => value === 0).length,
      isHarmRecoveryTime: false,
    },
    finalDividendDiagnostics: {
      finalEventRows: finalPercentages.length,
      finalEventRowsBelow100Percent: finalPercentages.filter((value) => value < 100_000n).length,
      finalEventRowsAt100Percent: finalPercentages.filter((value) => value === 100_000n).length,
      minimumTotalPaidPercent: formatMilliPercent(finalPercentages[0]),
      p50TotalPaidPercent: formatMilliPercent(nearestRank(finalPercentages, 0.50)),
      p90TotalPaidPercent: formatMilliPercent(nearestRank(finalPercentages, 0.90)),
      maximumTotalPaidPercent: formatMilliPercent(finalPercentages.at(-1)),
      groupsWithFinalEvent, finalGroupsBelow100, finalGroupsAt100,
      finalMeansLastDividendEvent: true,
      finalMeansFullClaimRecovery: false,
      finalMeansRealityRestored: false,
    },
    evidenceBoundary: {
      claimAndProvenClaimantDefinitionsPinned: true,
      dividendAsCashDistributionDefinitionPinned: true,
      statutoryPriorityOrderPinned: true,
      quarterlyAvailabilityReviewPinned: true,
      individualClaimIdentityObserved: false,
      individualClaimAmountObserved: false,
      deniedClaimPopulationObserved: false,
      bankTransferReceiptObserved: false,
      appealOrFraudCaseFileObserved: false,
      outsiderClaimOrPaymentObserved: false,
    },
  };
}

function htmlToText(bytes) {
  return bytes.toString("utf8")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;|&#8217;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;|&#8220;|&#8221;/g, "\"")
    .replace(/\s+/g, " ").trim();
}

function extractAttributes(text) {
  return Object.fromEntries([...text.matchAll(/\s([A-Za-z_:][A-Za-z0-9_.:-]*)="([^"]*)"/g)]
    .map((match) => [match[1], match[2]]));
}

function inlineFacts(html, concept) {
  const facts = [];
  const expression = /<ix:nonFraction\b([^>]*)>([\s\S]*?)<\/ix:nonFraction>/g;
  for (const match of html.matchAll(expression)) {
    const attributes = extractAttributes(match[1]);
    if (attributes.name !== concept) continue;
    const display = match[2].replace(/<[^>]+>/g, "").replace(/&#160;/g, " ").trim();
    facts.push({ attributes, display });
  }
  return facts;
}

function inlineFactUsd(fact, code) {
  if (!/^Unit_Standard_USD_/.test(fact.attributes.unitRef ?? "")
    || fact.attributes.format !== "ixt:num-dot-decimal"
    || !/^-?\d+$/.test(fact.attributes.scale ?? "")) throw new Error(`${code}_ATTRIBUTES_INVALID`);
  const normalized = fact.display.replace(/,/g, "");
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) throw new Error(`${code}_DISPLAY_INVALID`);
  const [whole, fraction = ""] = normalized.split(".");
  const exponent = Number(fact.attributes.scale) - fraction.length;
  if (!Number.isSafeInteger(exponent) || exponent < 0 || exponent > 18) {
    throw new Error(`${code}_SCALE_INVALID`);
  }
  const magnitude = BigInt(`${whole}${fraction}`) * 10n ** BigInt(exponent);
  return fact.attributes.sign === "-" ? -magnitude : magnitude;
}

function selectCurrentFact(html, concept, contextPredicate, expectedUsd, code) {
  const matches = inlineFacts(html, concept).filter((fact) => (
    contextPredicate(fact.attributes.contextRef ?? "")
      && inlineFactUsd(fact, code) === BigInt(expectedUsd)
  ));
  if (matches.length < 1) throw new Error(`${code}_NOT_FOUND`);
  const distinct = new Set(matches.map((fact) => `${fact.attributes.contextRef}\0${inlineFactUsd(fact, code)}`));
  if (distinct.size !== 1) throw new Error(`${code}_AMBIGUOUS`);
  return { valueUsd: String(expectedUsd), inlineFactOccurrences: matches.length,
    xbrlConcept: concept, contextDate: "2025-12-31" };
}

function secDiagnostics(indexBytes, filingBytes) {
  const index = parseJson(indexBytes, "SEC_EDGAR_INDEX");
  const items = index?.directory?.item;
  const filingItem = Array.isArray(items)
    ? items.find((item) => item.name === "rli-20251231x10k.htm") : null;
  if (index?.directory?.name !== "/Archives/edgar/data/84246/000110465926018013"
    || filingItem?.size !== "8558265") throw new Error("SEC_EDGAR_INDEX_INVALID");
  const html = filingBytes.toString("utf8");
  const filingText = htmlToText(filingBytes);
  for (const marker of ["RLI Corp.", "Reports of Independent Registered Public Accounting Firms",
    "authorized control level RBC", "fixed income securities with a carrying value",
    "on deposit with regulatory authorities as required by law"]) {
    requireTextMarker(filingText, marker, "SEC_RLI_10K");
  }
  const base2025 = (context) => /^As_Of_12_31_2025_[A-Za-z0-9_-]+$/.test(context);
  const surplus2025 = (context) => context.startsWith("As_Of_12_31_2025_")
    && context.includes("srt_ConsolidatedEntitiesAxis_srt_SubsidiariesMember");
  const principal2025 = (context) => context.startsWith("As_Of_12_31_2025_")
    && context.includes("dei_LegalEntityAxis_rli_RLIInsuranceCompanyMember");
  const gross = selectCurrentFact(html, "us-gaap:LiabilityForClaimsAndClaimsAdjustmentExpense",
    base2025, 2_886_819_000n, "SEC_GROSS_CLAIMS");
  const recoverable = selectCurrentFact(html,
    "us-gaap:ReinsuranceRecoverableForUnpaidClaimsAndClaimsAdjustments",
    base2025, 746_798_000n, "SEC_REINSURANCE_RECOVERABLE");
  const net = selectCurrentFact(html,
    "us-gaap:LiabilityForUnpaidClaimsAndClaimsAdjustmentExpenseNet",
    base2025, 2_140_021_000n, "SEC_NET_UNPAID_CLAIMS");
  const surplus = selectCurrentFact(html,
    "us-gaap:StatutoryAccountingPracticesStatutoryCapitalAndSurplusBalance",
    surplus2025, 1_846_615_000n, "SEC_STATUTORY_SURPLUS");
  const required = selectCurrentFact(html,
    "us-gaap:StatutoryAccountingPracticesStatutoryCapitalAndSurplusRequired",
    principal2025, 306_000_000n, "SEC_AUTHORIZED_CONTROL_LEVEL");
  const restricted = selectCurrentFact(html, "us-gaap:RestrictedInvestments",
    base2025, 107_000_000n, "SEC_RESTRICTED_INVESTMENTS");
  const reconciliation = BigInt(gross.valueUsd) - BigInt(recoverable.valueUsd)
    - BigInt(net.valueUsd);
  if (reconciliation !== 0n) throw new Error("SEC_RESERVE_RECONCILIATION_INVALID");
  return {
    sourceDomain: "SELECTED_PUBLIC_PROPERTY_CASUALTY_INSURER_FILING",
    filing: {
      registrant: "RLI_CORP", cik: "0000084246", form: "10-K",
      periodEnd: "2025-12-31", accession: "0001104659-26-018013",
      edgarDirectoryPinned: true, inlineXbrlSourcePinned: true,
      independentAuditorReportTextPresent: true,
      individualProjectedFactAuditScopeIndependentlyDetermined: false,
    },
    reserveReconciliation: {
      grossClaimsAndClaimAdjustmentLiability: gross,
      reinsuranceRecoverableForUnpaidClaims: recoverable,
      netUnpaidClaimsAndClaimAdjustmentLiability: net,
      equation: "GROSS_MINUS_REINSURANCE_RECOVERABLE_EQUALS_NET",
      reconciliationDifferenceUsd: reconciliation.toString(),
      reinsuranceRecoverableShareOfGross:
        formatScaled(scaledRatio(recoverable.valueUsd, gross.valueUsd)),
      recoverableIsCashCollected: false,
      reserveIsOutsiderReserve: false,
    },
    statutoryCapital: {
      exactAggregateInsuranceSubsidiaryStatutoryCapitalAndSurplus: surplus,
      principalInsuranceCompanyAuthorizedControlLevelRbc: required,
      exactFactsHaveSameEntityScope: false,
      ratioBetweenExactFactsEligible: false,
      capitalAvailableToOutsider: false,
      solvencyOfOutsiderEstablished: false,
    },
    restrictedRegulatoryDeposit: {
      restrictedInvestments: restricted,
      filingTextDescribesDepositWithRegulatoryAuthoritiesRequiredByLaw: true,
      custodianIdentityInProjectedFactObserved: false,
      transactionReceiptObserved: false,
      outsiderCustodyEstablished: false,
    },
    transferBoundary: {
      selectedIssuerPopulationRepresentative: false,
      accountingBasisTransferAuthorized: false,
      reserveFactorTransferAuthorized: false,
      capitalRatioTransferAuthorized: false,
      custodyAuthorityTransferAuthorized: false,
      priceOrGuaranteeAuthorityTransferAuthorized: false,
    },
  };
}

const ASOP_SPECS = deepFreeze([
  { number: 23, path: "asop-23-data-quality.html", title: "Data Quality",
    lastRevised: "December 2016", effectiveDate: "April 30, 2017", documentNumber: "185",
    topics: ["Selection of Data", "Review of Data", "Use of Data",
      "Reliance on Data Supplied by Others", "Communications and Disclosures"] },
  { number: 36, path: "asop-36-reserve-opinion.html",
    title: "Statements of Actuarial Opinion Regarding Property/Casualty Loss, Loss Adjustment Expense, or Other Reserves",
    lastRevised: "March 2024", effectiveDate: "October 01, 2024", documentNumber: "213",
    topics: ["Types of Opinions", "Qualified Opinion", "No Opinion",
      "Material Adverse Deviation", "Adequacy of Assets Supporting Reserves"] },
  { number: 53, path: "asop-53-future-costs.html",
    title: "Estimating Future Costs for Prospective Property/Casualty Risk Transfer and Risk Retention",
    lastRevised: "December 2017", effectiveDate: "August 01, 2018", documentNumber: "190",
    topics: ["Exposure Base", "Use of Historical Data", "Credibility",
      "Treatment of Catastrophes", "Profit and Contingency Provisions and the Cost of Capital"] },
  { number: 55, path: "asop-55-capital-adequacy.html", title: "Capital Adequacy Assessment",
    lastRevised: "June 2019", effectiveDate: "November 01, 2019", documentNumber: "194",
    topics: ["Scenario Tests and Stress Tests", "Incorporating Management Actions",
      "Risk Capital Target or Risk Capital Threshold", "Reliance on Data or Other Information Supplied by Others",
      "Communications and Disclosures"] },
]);

function actuarialStandardsDiagnostics(bytesByPath) {
  const standards = ASOP_SPECS.map((spec) => {
    const text = htmlToText(bytesByPath[spec.path]);
    for (const marker of [spec.title, `Last Revised: ${spec.lastRevised}`,
      `Effective Date: ${spec.effectiveDate}`, `Document Number: ${spec.documentNumber}`,
      "Document Status: Adopted", ...spec.topics]) requireTextMarker(text, marker, `ASOP_${spec.number}`);
    return {
      asopNumber: spec.number, title: spec.title, documentNumber: spec.documentNumber,
      lastRevised: spec.lastRevised, effectiveDate: spec.effectiveDate,
      status: "ADOPTED", requiredTopicsPinned: [...spec.topics],
    };
  });
  return {
    sourceDomain: "US_ACTUARIAL_PROFESSIONAL_PRACTICE",
    standards,
    boundary: {
      standardsAreObservedInstitutionalPracticeRequirements: true,
      standardsAreEmpiricalOutcomeData: false,
      asop23PerformsAuditOfThisArtifact: false,
      asop36IsReserveOpinionForOutsider: false,
      asop53ApprovesFinalOutsiderPrice: false,
      asop55CertifiesOutsiderCapitalAdequacy: false,
      independentActuaryAssignedToOutsider: false,
      professionalReviewOfExactOutsiderModelCompleted: false,
    },
  };
}

function treasuryDiagnostics(bytes) {
  const text = htmlToText(bytes);
  for (const marker of ["31 CFR Part 202", "public money on deposit at financial institutions must be secured through collateral",
    "held in custody by a Federal Reserve Bank", "take possession of the pledged assets",
    "All amounts larger than that must be secured by collateral"]) {
    requireTextMarker(text, marker, "TREASURY_TCMM");
  }
  return {
    sourceDomain: "US_PUBLIC_FUNDS_COLLATERAL",
    observedStructure: {
      publicMoneyCollateralRequirementDescribed: true,
      federalReserveCustodyForIndividualSuretyAssetsDescribed: true,
      tcmmAcceptabilityAndValuationRoleDescribed: true,
      tcmmPossessionRoleDescribed: true,
      depositInsuranceLimitContextDescribed: true,
      rolesSeparatedAcrossDepositoryCustodianProgramAndContractingOfficer: true,
    },
    boundary: {
      transactionPopulationObserved: false,
      pledgedAssetLedgerObserved: false,
      custodianAgreementForOutsiderObserved: false,
      paymentRailObserved: false,
      outsiderCanTakePossession: false,
      outsiderCustodyAuthorityEstablished: false,
    },
  };
}

function buildGapMatrix() {
  const ledger = createReadinessGapLedger();
  const check = verifyReadinessGapLedger(ledger);
  if (!check.ok || ledger.ledgerHash !== INSTITUTIONAL_CAPITAL_CLAIMS_LEDGER_HASH
    || ledger.gaps.length !== INSTITUTIONAL_CAPITAL_CLAIMS_LEDGER_GAP_COUNT) {
    throw new Error("READINESS_LEDGER_PIN_INVALID");
  }
  const rows = ledger.gaps.map((gap) => {
    const mapped = GAP_SOURCE_ILLUMINATION[gap.gapId];
    const internal = gap.category === "INTERNAL_ENGINEERING";
    return {
      gapId: gap.gapId, stage: gap.stage, category: gap.category,
      ledgerStatus: gap.status,
      sourceIds: mapped ? [...mapped.sourceIds] : [],
      illumination: mapped?.illumination ?? (internal
        ? "OUT_OF_SCOPE_ALREADY_SATISFIED_INTERNAL"
        : "NO_ADMITTED_SOURCE_DIRECTLY_MEASURES_OR_CLOSES_THIS_GAP"),
      sourceDomainTransferAuthorized: false,
      closureCredit: false,
      resultingStatus: gap.status,
    };
  });
  return {
    ledgerSchema: ledger.schema, ledgerHash: ledger.ledgerHash,
    ledgerAsOf: ledger.asOf, totalGaps: rows.length,
    internalSatisfied: rows.filter((row) => row.ledgerStatus === "SATISFIED_INTERNAL").length,
    externalBlocked: rows.filter((row) => row.ledgerStatus === "BLOCKED_EXTERNAL").length,
    rows,
    everyRowClosureCreditFalse: rows.every((row) => row.closureCredit === false),
    externalGapsRemainBlocked: rows.filter((row) => row.ledgerStatus === "BLOCKED_EXTERNAL")
      .every((row) => row.resultingStatus === "BLOCKED_EXTERNAL"),
  };
}

function verifyExternalBundleCoverage(matrix) {
  const externalIds = matrix.rows.filter((row) => row.ledgerStatus === "BLOCKED_EXTERNAL")
    .map((row) => row.gapId).sort();
  const bundled = INSTITUTIONAL_CAPITAL_CLAIMS_MINIMUM_EXTERNAL_BUNDLES
    .flatMap((bundle) => bundle.gapIds).sort();
  if (new Set(bundled).size !== bundled.length
    || canonicalizeStrict(externalIds) !== canonicalizeStrict(bundled)) {
    throw new Error("MINIMUM_EXTERNAL_BUNDLE_COVERAGE_INVALID");
  }
}

function buildDiagnostics(bytes) {
  return {
    nonPoolingPolicy: {
      bankResolutionAmountsPooledWithInsuranceAmounts: false,
      selectedInsurerAmountsPooledWithOtherInsurers: false,
      sourceDomainAmountsUsedForAiAgentOrRobotTarget: false,
      percentagesPooledAcrossReceivershipFundOrPriority: false,
      targetTransferFabricated: false,
    },
    fdicFailures: failuresDiagnostics(bytes["fdic-failures.json"],
      bytes["fdic-failures-swagger.yaml"], bytes["fdic-failure-properties.yaml"]),
    fdicReceivershipDividends: dividendsDiagnostics(bytes["fdic-dividends.json"],
      bytes["fdic-dividends-repeat.json"], bytes["fdic-dividends.html"],
      bytes["fdic-dividends-app.js"]),
    secInsurerDisclosure: secDiagnostics(bytes["rli-edgar-index.json"],
      bytes["rli-2025-10k.html"]),
    treasuryCustodyStructure: treasuryDiagnostics(bytes["treasury-tcmm.html"]),
    actuarialStandards: actuarialStandardsDiagnostics(bytes),
  };
}

export function buildInstitutionalCapitalClaimsEvidenceFromSource(input, options = {}) {
  if (!exactKeys(options, Object.hasOwn(options, "generatedAt") ? ["generatedAt"] : [])) {
    throw new Error("BUILD_OPTIONS_SCHEMA_INVALID");
  }
  const generatedAt = canonicalTime(options.generatedAt
    ?? INSTITUTIONAL_CAPITAL_CLAIMS_DEFAULT_GENERATED_AT, "GENERATED_AT");
  const bytes = readFrozenSources(input);
  const diagnostics = buildDiagnostics(bytes);
  const gapSourceMatrix = buildGapMatrix();
  if (Date.parse(generatedAt) < Date.parse(gapSourceMatrix.ledgerAsOf)) {
    throw new Error("GENERATED_AT_PRECEDES_GAP_LEDGER_AS_OF");
  }
  verifyExternalBundleCoverage(gapSourceMatrix);
  const sourceManifest = sourceManifestProjection();
  const body = {
    schema: INSTITUTIONAL_CAPITAL_CLAIMS_SCHEMA,
    schemaVersion: "1.0.0",
    generatedAt,
    adapter: {
      adapterId: "OUTSIDER_INSTITUTIONAL_CAPITAL_CLAIMS_EVIDENCE",
      adapterVersion: "1.0.0",
      specificationHash: domainHash("outsider:institutional-capital-claims-specification:v1", {
        sourcePins: INSTITUTIONAL_CAPITAL_CLAIMS_SOURCE_PINS,
        measurementDictionary: INSTITUTIONAL_CAPITAL_CLAIMS_MEASUREMENT_DICTIONARY,
        qualityGate: INSTITUTIONAL_CAPITAL_CLAIMS_QUALITY_GATE,
        rightsBoundary: RIGHTS_BOUNDARY,
        authorityBoundary: AUTHORITY_BOUNDARY,
        outputBoundary: OUTPUT_BOUNDARY,
      }),
    },
    sourceManifest,
    measurementDictionary: clone(INSTITUTIONAL_CAPITAL_CLAIMS_MEASUREMENT_DICTIONARY),
    qualityGate: clone(INSTITUTIONAL_CAPITAL_CLAIMS_QUALITY_GATE),
    diagnostics,
    diagnosticCommitmentHash: domainHash(
      "outsider:institutional-capital-claims-diagnostics:v1", diagnostics),
    gapSourceMatrix,
    gapSourceMatrixHash: domainHash(
      "outsider:institutional-capital-claims-gap-matrix:v1", gapSourceMatrix),
    researchedNotAdmitted: clone(RESEARCHED_NOT_ADMITTED),
    minimumExternalClosureBundles:
      clone(INSTITUTIONAL_CAPITAL_CLAIMS_MINIMUM_EXTERNAL_BUNDLES),
    rightsBoundary: clone(RIGHTS_BOUNDARY),
    authority: clone(AUTHORITY_BOUNDARY),
    outputBoundary: clone(OUTPUT_BOUNDARY),
  };
  return deepFreeze({ ...body,
    artifactHash: domainHash(INSTITUTIONAL_CAPITAL_CLAIMS_SCHEMA, body) });
}

function sourceManifestValid(manifest) {
  const expected = sourceManifestProjection();
  return canonicalizeStrict(manifest) === canonicalizeStrict(expected);
}

function ratioDistributionEnvelopeValid(value) {
  const keys = ["eligibleRows", "perRowRounding", "minimum", "p50NearestRank",
    "p90NearestRank", "p95NearestRank", "p99NearestRank", "maximum",
    "negativeEstimateRows", "overOneRows"];
  return exactKeys(value, keys) && Number.isSafeInteger(value.eligibleRows)
    && value.eligibleRows > 0
    && ["negativeEstimateRows", "overOneRows"].every((key) => Number.isSafeInteger(value[key])
      && value[key] >= 0 && value[key] <= value.eligibleRows)
    && ["minimum", "p50NearestRank", "p90NearestRank", "p95NearestRank",
      "p99NearestRank", "maximum"].every((key) => RATIO.test(value[key] ?? ""))
    && value.perRowRounding === "HALF_UP_FIXED_8_DECIMALS_BEFORE_NEAREST_RANK";
}

function diagnosticsEnvelopeValid(diagnostics) {
  if (!exactKeys(diagnostics, ["nonPoolingPolicy", "fdicFailures",
    "fdicReceivershipDividends", "secInsurerDisclosure", "treasuryCustodyStructure",
    "actuarialStandards"])) return false;
  const nonPooling = diagnostics.nonPoolingPolicy;
  if (!exactKeys(nonPooling, ["bankResolutionAmountsPooledWithInsuranceAmounts",
    "selectedInsurerAmountsPooledWithOtherInsurers", "sourceDomainAmountsUsedForAiAgentOrRobotTarget",
    "percentagesPooledAcrossReceivershipFundOrPriority", "targetTransferFabricated"])
    || Object.values(nonPooling).some((value) => value !== false)) return false;
  const failures = diagnostics.fdicFailures;
  const dividends = diagnostics.fdicReceivershipDividends;
  const sec = diagnostics.secInsurerDisclosure;
  const treasury = diagnostics.treasuryCustodyStructure;
  const standards = diagnostics.actuarialStandards;
  return failures?.sourceDomain === "US_BANK_RESOLUTION"
    && failures.selectionBoundary?.failureFrequencyEligible === false
    && failures.selectionBoundary?.bankToInsuranceOrAiAgentTransferEligible === false
    && failures.missingnessAndRevision?.costIsClaimPayment === false
    && failures.missingnessAndRevision?.costIsInsuranceReserve === false
    && ratioDistributionEnvelopeValid(failures.ratioDiagnostics?.costToPreFailureDeposits)
    && ratioDistributionEnvelopeValid(failures.ratioDiagnostics?.costToPreFailureAssets)
    && failures.ratioDiagnostics?.ratiosUsedAsOutsiderCapitalOrSeverityPrior === false
    && dividends?.sourceDomain === "US_BANK_RECEIVERSHIP"
    && dividends.endpointAccounting?.exactSameEventMultisetAcrossTwoFetches === true
    && dividends.endpointAccounting?.exactRawOrderSameAcrossTwoFetches === false
    && dividends.groupedCumulativeDiagnostics?.percentagesSummedAcrossFunds === false
    && dividends.groupedCumulativeDiagnostics?.percentagesSummedAcrossPriorities === false
    && PERCENT.test(dividends.finalDividendDiagnostics?.minimumTotalPaidPercent ?? "")
    && PERCENT.test(dividends.finalDividendDiagnostics?.p50TotalPaidPercent ?? "")
    && PERCENT.test(dividends.finalDividendDiagnostics?.p90TotalPaidPercent ?? "")
    && PERCENT.test(dividends.finalDividendDiagnostics?.maximumTotalPaidPercent ?? "")
    && dividends.finalDividendDiagnostics?.finalMeansFullClaimRecovery === false
    && dividends.finalDividendDiagnostics?.finalMeansRealityRestored === false
    && dividends.evidenceBoundary?.outsiderClaimOrPaymentObserved === false
    && sec?.sourceDomain === "SELECTED_PUBLIC_PROPERTY_CASUALTY_INSURER_FILING"
    && sec.reserveReconciliation?.reconciliationDifferenceUsd === "0"
    && RATIO.test(sec.reserveReconciliation?.reinsuranceRecoverableShareOfGross ?? "")
    && sec.reserveReconciliation?.reserveIsOutsiderReserve === false
    && sec.statutoryCapital?.ratioBetweenExactFactsEligible === false
    && sec.statutoryCapital?.capitalAvailableToOutsider === false
    && sec.restrictedRegulatoryDeposit?.outsiderCustodyEstablished === false
    && Object.values(sec.transferBoundary ?? {}).every((value) => value === false)
    && treasury?.sourceDomain === "US_PUBLIC_FUNDS_COLLATERAL"
    && treasury.boundary?.outsiderCustodyAuthorityEstablished === false
    && treasury.boundary?.paymentRailObserved === false
    && standards?.sourceDomain === "US_ACTUARIAL_PROFESSIONAL_PRACTICE"
    && Array.isArray(standards.standards) && standards.standards.length === 4
    && standards.standards.every((standard) => standard.status === "ADOPTED")
    && standards.boundary?.independentActuaryAssignedToOutsider === false
    && standards.boundary?.professionalReviewOfExactOutsiderModelCompleted === false;
}

function gapMatrixValid(matrix) {
  try {
    const expected = buildGapMatrix();
    verifyExternalBundleCoverage(expected);
    return canonicalizeStrict(matrix) === canonicalizeStrict(expected);
  } catch { return false; }
}

function artifactEnvelopeValid(artifact) {
  const keys = ["schema", "schemaVersion", "generatedAt", "adapter", "sourceManifest",
    "measurementDictionary", "qualityGate", "diagnostics", "diagnosticCommitmentHash",
    "gapSourceMatrix", "gapSourceMatrixHash", "researchedNotAdmitted",
    "minimumExternalClosureBundles", "rightsBoundary", "authority", "outputBoundary",
    "artifactHash"];
  return exactKeys(artifact, keys)
    && artifact.schema === INSTITUTIONAL_CAPITAL_CLAIMS_SCHEMA
    && artifact.schemaVersion === "1.0.0"
    && canonicalTime(artifact.generatedAt, "ARTIFACT_GENERATED_AT") === artifact.generatedAt
    && Date.parse(artifact.generatedAt) >= Date.parse(artifact.gapSourceMatrix?.ledgerAsOf)
    && exactKeys(artifact.adapter, ["adapterId", "adapterVersion", "specificationHash"])
    && artifact.adapter.adapterId === "OUTSIDER_INSTITUTIONAL_CAPITAL_CLAIMS_EVIDENCE"
    && artifact.adapter.adapterVersion === "1.0.0"
    && HASH.test(artifact.adapter.specificationHash ?? "")
    && sourceManifestValid(artifact.sourceManifest)
    && canonicalizeStrict(artifact.measurementDictionary)
      === canonicalizeStrict(INSTITUTIONAL_CAPITAL_CLAIMS_MEASUREMENT_DICTIONARY)
    && canonicalizeStrict(artifact.qualityGate)
      === canonicalizeStrict(INSTITUTIONAL_CAPITAL_CLAIMS_QUALITY_GATE)
    && diagnosticsEnvelopeValid(artifact.diagnostics)
    && artifact.diagnosticCommitmentHash === domainHash(
      "outsider:institutional-capital-claims-diagnostics:v1", artifact.diagnostics)
    && gapMatrixValid(artifact.gapSourceMatrix)
    && artifact.gapSourceMatrixHash === domainHash(
      "outsider:institutional-capital-claims-gap-matrix:v1", artifact.gapSourceMatrix)
    && canonicalizeStrict(artifact.researchedNotAdmitted)
      === canonicalizeStrict(RESEARCHED_NOT_ADMITTED)
    && canonicalizeStrict(artifact.minimumExternalClosureBundles)
      === canonicalizeStrict(INSTITUTIONAL_CAPITAL_CLAIMS_MINIMUM_EXTERNAL_BUNDLES)
    && canonicalizeStrict(artifact.rightsBoundary) === canonicalizeStrict(RIGHTS_BOUNDARY)
    && canonicalizeStrict(artifact.authority) === canonicalizeStrict(AUTHORITY_BOUNDARY)
    && canonicalizeStrict(artifact.outputBoundary) === canonicalizeStrict(OUTPUT_BOUNDARY)
    && HASH.test(artifact.artifactHash ?? "");
}

function invalidVerification(failures, artifact = null) {
  return deepFreeze({
    ok: false, failures: [...new Set(failures)], verificationLevel: "INVALID",
    envelopeSchemaVerified: false, envelopeSelfHashVerified: false,
    diagnosticDerivationVerified: false, gapMatrixVerified: false,
    authorityBoundaryVerified: false, inputBytesReproduced: false,
    sourceArtifactsReverified: false, officialFrozenSourcesVerified: false,
    artifactClaimsInternalSourceReplay:
      artifact?.sourceManifest?.sourceArtifactsReverifiedInsideBuilder === true,
    productionReady: false,
  });
}

export function verifyInstitutionalCapitalClaimsEvidence(artifact) {
  const failures = [];
  let envelope = false;
  let selfHash = false;
  try {
    envelope = artifactEnvelopeValid(artifact);
    if (!envelope) failures.push("INSTITUTIONAL_CAPITAL_ARTIFACT_ENVELOPE_INVALID");
    const { artifactHash, ...body } = artifact;
    selfHash = artifactHash === domainHash(INSTITUTIONAL_CAPITAL_CLAIMS_SCHEMA, body);
    if (!selfHash) failures.push("INSTITUTIONAL_CAPITAL_ARTIFACT_SELF_HASH_INVALID");
  } catch (error) {
    failures.push(`INSTITUTIONAL_CAPITAL_ARTIFACT_STRUCTURE_FAILED:${error instanceof Error
      ? error.message : String(error)}`);
  }
  if (failures.length > 0) return invalidVerification(failures, artifact);
  return deepFreeze({
    ok: true, failures: [], verificationLevel: "SELF_SEALED_UNTRUSTED_ENVELOPE",
    envelopeSchemaVerified: envelope, envelopeSelfHashVerified: selfHash,
    diagnosticDerivationVerified: false, gapMatrixVerified: true,
    authorityBoundaryVerified: false, inputBytesReproduced: false,
    sourceArtifactsReverified: false, officialFrozenSourcesVerified: false,
    artifactClaimsInternalSourceReplay: true, productionReady: false,
  });
}

export function verifyInstitutionalCapitalClaimsEvidenceAgainstSource(artifact, input) {
  const standalone = verifyInstitutionalCapitalClaimsEvidence(artifact);
  if (!standalone.ok) return standalone;
  const failures = [];
  try {
    const expected = buildInstitutionalCapitalClaimsEvidenceFromSource(input,
      { generatedAt: artifact.generatedAt });
    if (canonicalizeStrict(expected) !== canonicalizeStrict(artifact)) {
      failures.push("INSTITUTIONAL_CAPITAL_SOURCE_REPLAY_DERIVATION_INVALID");
    }
  } catch (error) {
    failures.push(`INSTITUTIONAL_CAPITAL_SOURCE_REPLAY_FAILED:${error instanceof Error
      ? error.message : String(error)}`);
  }
  if (failures.length > 0) {
    return deepFreeze({ ...invalidVerification(failures, artifact),
      envelopeSchemaVerified: true, envelopeSelfHashVerified: true,
      gapMatrixVerified: true });
  }
  return deepFreeze({
    ok: true, failures: [],
    verificationLevel: "FULL_OFFICIAL_FDIC_TREASURY_SEC_ASB_SOURCE_REPLAYED",
    envelopeSchemaVerified: true, envelopeSelfHashVerified: true,
    diagnosticDerivationVerified: true, gapMatrixVerified: true,
    authorityBoundaryVerified: true, inputBytesReproduced: true,
    sourceArtifactsReverified: true, officialFrozenSourcesVerified: true,
    sourceSetHash: artifact.sourceManifest.sourceSetHash,
    artifactHash: artifact.artifactHash, productionReady: false,
  });
}

export function verifyInstitutionalCapitalClaimsEvidenceCanonicalFile(artifactPath, input) {
  let descriptor = null;
  try {
    if (typeof artifactPath !== "string" || artifactPath.length === 0) {
      throw new Error("CANONICAL_ARTIFACT_PATH_REQUIRED");
    }
    descriptor = openSync(artifactPath,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size <= 0n || before.size > 20_000_000n) {
      throw new Error("CANONICAL_ARTIFACT_FILE_INVALID");
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
      || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs
      || BigInt(bytes.length) !== after.size) {
      throw new Error("CANONICAL_ARTIFACT_CHANGED_DURING_READ");
    }
    let artifact;
    try { artifact = JSON.parse(bytes.toString("utf8")); }
    catch { throw new Error("CANONICAL_ARTIFACT_JSON_INVALID"); }
    const generatedAtMs = Date.parse(artifact.generatedAt);
    const stableFileMtimeMs = Number(before.mtimeNs) / 1_000_000;
    if (!Number.isFinite(generatedAtMs) || generatedAtMs > stableFileMtimeMs) {
      throw new Error("CANONICAL_GENERATED_AT_AFTER_STABLE_FILE_MTIME");
    }
    const verified = verifyInstitutionalCapitalClaimsEvidenceAgainstSource(artifact, input);
    if (!verified.ok || verified.sourceArtifactsReverified !== true) return verified;
    return deepFreeze({
      ...verified,
      verificationLevel:
        "FULL_OFFICIAL_FDIC_TREASURY_SEC_ASB_SOURCE_REPLAYED_CANONICAL_FILE",
      canonicalArtifactStableRead: true,
      canonicalGeneratedAtNoLaterThanStableFileMtime: true,
      canonicalArtifactFileMtime: new Date(stableFileMtimeMs).toISOString(),
    });
  } catch (error) {
    return deepFreeze({
      ...invalidVerification([
        `INSTITUTIONAL_CAPITAL_CANONICAL_FILE_FAILED:${error instanceof Error
          ? error.message : String(error)}`,
      ]),
      canonicalArtifactStableRead: false,
      canonicalGeneratedAtNoLaterThanStableFileMtime: false,
      canonicalArtifactFileMtime: null,
    });
  } finally { if (descriptor !== null) closeSync(descriptor); }
}
