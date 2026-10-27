#!/usr/bin/env node

/*
 * Reissue the semantically wrong SparkFun-shaped Adafruit v4 private pair as
 * a provider-neutral v5 outcome/route request.  Predecessors are read-only;
 * three new 0600 files are created with O_EXCL and a private supersession
 * record.  Destination/contact values are never printed.
 */

import { createHash } from "node:crypto";
import {
  chmodSync, closeSync, constants, fsyncSync, lstatSync, mkdirSync, openSync,
  readFileSync, writeSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  normalizeProviderNeutralRouteQuoteGrantV5,
  normalizeProviderNeutralRouteQuoteInputV5,
  OUTSIDER_PROVIDER_NEUTRAL_ACCEPTANCE_SPEC_SCHEMA_V5,
  OUTSIDER_PROVIDER_NEUTRAL_ROUTE_QUOTE_GRANT_SCHEMA_V5,
  OUTSIDER_PROVIDER_NEUTRAL_ROUTE_QUOTE_INPUT_SCHEMA_V5,
} from "./outsider-adafruit-full-address-shipping-quote-live-runner-v5.mjs";

const PREFIX = "OUTSIDER_ADAFRUIT_PRIVATE_ROUTE_QUOTE_REISSUE_V5_";
const PREDECESSOR_INPUT_SCHEMA
  = "outsider/private-sparkfun-full-address-prepayment-run-request/v1";
const PREDECESSOR_GRANT_SCHEMA
  = "outsider/private-supplier-scoped-shipping-quote-use-grant/v2";
const LINEAGE_SCHEMA
  = "outsider/private-provider-neutral-route-quote-reissue-lineage/v5";
const ORIGIN = "https://www.adafruit.com";
const PURPOSE = "DESTINATION_DELIVERABILITY_AND_ALL_IN_QUOTE_ONLY";
const PROFILE = "USB_A_TO_USB_C_DATA_POWER_5V_MIN_900MM_V1";
const PERMITTED = Object.freeze([
  "CHECKOUT_CONTACT_EMAIL",
  "DESTINATION_FULL_ADDRESS",
  "DESTINATION_PHONE",
]);
const FORBIDDEN = Object.freeze([
  "CROSS_ORIGIN_DISCLOSURE",
  "CROSS_PURPOSE_REUSE",
  "MARKETING_SUBSCRIPTION",
  "ORDER_SUBMISSION",
  "PAYMENT",
  "PII_PUBLIC_PROJECTION",
  "SHIPPING_METHOD_APPLICATION",
]);

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function bytesHash(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function instant(value, code) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value) fail(code);
  return value;
}

function privateCanonical(file, code) {
  if (typeof file !== "string" || file === "") fail(`${code}_REQUIRED`);
  const absolute = path.resolve(file);
  const info = lstatSync(absolute);
  if (!info.isFile() || info.isSymbolicLink()
    || (info.mode & 0o777) !== 0o600 || info.size < 3
    || info.size > 64 * 1024) fail(`${code}_NOT_PRIVATE`);
  const bytes = readFileSync(absolute);
  if (bytes.at(-1) !== 0x0a) fail(`${code}_PARTIAL`);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch { fail(`${code}_JSON_INVALID`); }
  if (`${canonicalizeStrict(value)}\n` !== bytes.toString("utf8")) {
    fail(`${code}_NOT_CANONICAL`);
  }
  return Object.freeze({ absolute, bytes, bytesHash: bytesHash(bytes), value });
}

function ensurePrivateParent(file) {
  const directory = path.dirname(path.resolve(file));
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const info = lstatSync(directory);
  if (!info.isDirectory() || info.isSymbolicLink()
    || (info.mode & 0o777) !== 0o700) fail("OUTPUT_DIRECTORY_NOT_PRIVATE");
  return directory;
}

function writeAll(descriptor, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    offset += writeSync(descriptor, bytes, offset, bytes.length - offset);
  }
}

function writeOnce(file, value) {
  const absolute = path.resolve(file ?? "");
  const directory = ensurePrivateParent(absolute);
  const bytes = Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
  let descriptor;
  try {
    descriptor = openSync(absolute, constants.O_WRONLY | constants.O_CREAT
      | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    writeAll(descriptor, bytes);
    fsyncSync(descriptor);
  } finally { if (descriptor !== undefined) closeSync(descriptor); }
  chmodSync(absolute, 0o600);
  let directoryDescriptor;
  try { directoryDescriptor = openSync(directory, "r");
    fsyncSync(directoryDescriptor); }
  finally { if (directoryDescriptor !== undefined) closeSync(directoryDescriptor); }
  return Object.freeze({ absolute, bytes, bytesHash: bytesHash(bytes) });
}

function previousInput(value) {
  if (value?.schema !== PREDECESSOR_INPUT_SCHEMA
    || value.schemaVersion !== "1.0.0"
    || value.paymentAuthorized !== false || value.orderAuthorized !== false
    || value?.budget?.currency !== "USD"
    || typeof value?.budget?.maximumAmountMinor !== "string"
    || !Array.isArray(value?.destination?.streetLines)) {
    fail("PREDECESSOR_INPUT_INVALID");
  }
  return value;
}

function previousGrant(value, inputHash) {
  if (value?.schema !== PREDECESSOR_GRANT_SCHEMA
    || value.schemaVersion !== "2.0.0"
    || value.supplierOrigin !== ORIGIN
    || value.purpose !== "SHIPPING_DELIVERABILITY_AND_TOTAL_QUOTE_ONLY"
    || value.inputBytesHash !== inputHash
    || !Array.isArray(value.permittedDisclosures)
    || !Array.isArray(value.forbiddenActions)
    || !value.forbiddenActions.includes("PAYMENT")
    || !value.forbiddenActions.includes("ORDER_SUBMISSION")) {
    fail("PREDECESSOR_GRANT_BINDING_INVALID");
  }
  return value;
}

function exactArgument(value, expression, code) {
  if (typeof value !== "string" || !expression.test(value)) fail(code);
  return value;
}

export function reissueAdafruitPrivateRouteQuoteV5(options = {}) {
  const priorInputRecord = privateCanonical(options.predecessorInputFile,
    "PREDECESSOR_INPUT");
  const priorGrantRecord = privateCanonical(options.predecessorGrantFile,
    "PREDECESSOR_GRANT");
  const priorInput = previousInput(priorInputRecord.value);
  previousGrant(priorGrantRecord.value, priorInputRecord.bytesHash);
  const authorizedAt = instant(options.authorizedAt, "AUTHORIZED_AT_INVALID");
  const expiresAt = instant(options.expiresAt, "EXPIRES_AT_INVALID");
  if (Date.parse(authorizedAt) >= Date.parse(expiresAt)
    || Date.parse(expiresAt) >= Date.parse(priorInput.completionDeadline)) {
    fail("DESCENDANT_INTERVAL_INVALID");
  }
  const nativeResourceId = exactArgument(options.nativeResourceId,
    /^[1-9]\d{0,9}$/u, "NATIVE_RESOURCE_ID_INVALID");
  if (options.acceptanceProfile !== PROFILE) {
    fail("ACCEPTANCE_PROFILE_INVALID");
  }
  const routeRole = exactArgument(options.routeRole, /^(?:PRIMARY|RECOVERY)$/u,
    "ROUTE_ROLE_INVALID");
  const countryId = exactArgument(options.providerCountryId, /^[1-9]\d{0,9}$/u,
    "PROVIDER_COUNTRY_ID_INVALID");
  const regionId = exactArgument(options.providerRegionId, /^[1-9]\d{0,9}$/u,
    "PROVIDER_REGION_ID_INVALID");
  const inputValue = {
    schema: OUTSIDER_PROVIDER_NEUTRAL_ROUTE_QUOTE_INPUT_SCHEMA_V5,
    schemaVersion: "5.0.0",
    outcome: {
      acceptanceSpec: {
        schema: OUTSIDER_PROVIDER_NEUTRAL_ACCEPTANCE_SPEC_SCHEMA_V5,
        schemaVersion: "5.0.0",
        connectorFrom: "USB_TYPE_A",
        connectorTo: "USB_TYPE_C",
        minimumLengthMillimeters: 900,
        dataTransferRequired: true,
        powerTransferRequired: true,
        requiredNominalVoltageVolts: 5,
      },
      budget: { ...priorInput.budget },
      completionDeadline: priorInput.completionDeadline,
    },
    selectedRoute: {
      routeRole,
      sellerOrigin: ORIGIN,
      interfaceFamily: "BUYER_NATIVE_GUEST_CHECKOUT",
      nativeResourceId,
      quantity: 1,
    },
    destination: {
      firstName: priorInput.destination.firstName,
      lastName: priorInput.destination.lastName,
      email: priorInput.destination.email,
      telephone: priorInput.destination.telephone,
      countryCode: priorInput.destination.countryCode,
      region: priorInput.destination.region,
      city: priorInput.destination.city,
      postalCode: priorInput.destination.postalCode,
      streetLines: [...priorInput.destination.streetLines],
      providerAddressBinding: { countryId, regionId },
    },
    formationExpiresAt: expiresAt,
    authorizations: { payment: false, order: false, marketing: false },
  };
  normalizeProviderNeutralRouteQuoteInputV5(inputValue);
  const input = writeOnce(options.outputInputFile, inputValue);
  const grantValue = {
    schema: OUTSIDER_PROVIDER_NEUTRAL_ROUTE_QUOTE_GRANT_SCHEMA_V5,
    schemaVersion: "5.0.0",
    supplierOrigin: ORIGIN,
    purpose: PURPOSE,
    permittedDisclosures: [...PERMITTED],
    forbiddenActions: [...FORBIDDEN],
    inputBytesHash: input.bytesHash,
    authorizedAt,
    expiresAt,
    oneUse: true,
  };
  normalizeProviderNeutralRouteQuoteGrantV5(grantValue, input.bytesHash);
  const grant = writeOnce(options.outputGrantFile, grantValue);
  const lineage = writeOnce(options.outputLineageFile, {
    schema: LINEAGE_SCHEMA,
    schemaVersion: "5.0.0",
    reissuedAt: authorizedAt,
    reason: "REPLACE_WRONG_PROVIDER_SHAPED_INPUT_WITH_PROVIDER_NEUTRAL_ROUTE_BINDING",
    predecessor: {
      inputSchema: PREDECESSOR_INPUT_SCHEMA,
      inputBytesHash: priorInputRecord.bytesHash,
      grantSchema: PREDECESSOR_GRANT_SCHEMA,
      grantBytesHash: priorGrantRecord.bytesHash,
      semanticDisposition: "REJECTED_FOR_ADAFRUIT_EXECUTION",
    },
    descendant: {
      inputSchema: OUTSIDER_PROVIDER_NEUTRAL_ROUTE_QUOTE_INPUT_SCHEMA_V5,
      inputBytesHash: input.bytesHash,
      grantSchema: OUTSIDER_PROVIDER_NEUTRAL_ROUTE_QUOTE_GRANT_SCHEMA_V5,
      grantBytesHash: grant.bytesHash,
    },
    sellerOrigin: ORIGIN,
    purpose: PURPOSE,
    nativeResourceId,
    acceptanceProfile: PROFILE,
    expiresAt,
    frozenPredecessorsOverwritten: false,
    rawPrivateInputProjected: false,
  });
  return Object.freeze({ input, grant, lineage, expiresAt,
    frozenPredecessorsOverwritten: false, privateValuesPrinted: false });
}

function parseCli(argv) {
  if (argv.includes("--help") || argv.includes("-h")) return { help: true };
  const names = new Set(["--predecessor-input", "--predecessor-grant",
    "--output-input", "--output-grant", "--output-lineage",
    "--authorized-at", "--expires-at", "--native-resource-id",
    "--route-role", "--provider-country-id", "--provider-region-id",
    "--acceptance-profile"]);
  const result = { help: false };
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!names.has(name) || value === undefined || value.startsWith("--")) {
      fail("ARGUMENT_INVALID");
    }
    result[name.slice(2).replaceAll("-", "_")] = value;
  }
  if ([...names].some((name) => result[name.slice(2).replaceAll("-", "_")]
    === undefined)) fail("ARGUMENT_MISSING");
  return result;
}

function cliOptions(value) {
  return {
    predecessorInputFile: value.predecessor_input,
    predecessorGrantFile: value.predecessor_grant,
    outputInputFile: value.output_input,
    outputGrantFile: value.output_grant,
    outputLineageFile: value.output_lineage,
    authorizedAt: value.authorized_at,
    expiresAt: value.expires_at,
    nativeResourceId: value.native_resource_id,
    routeRole: value.route_role,
    providerCountryId: value.provider_country_id,
    providerRegionId: value.provider_region_id,
    acceptanceProfile: value.acceptance_profile,
  };
}

function main(argv) {
  const args = parseCli(argv);
  if (args.help) {
    process.stdout.write([
      "Usage:",
      "  node scripts/outsider-adafruit-private-route-quote-reissue-v5.mjs \\",
      "    --predecessor-input MODE_0600_V4_INPUT --predecessor-grant MODE_0600_V4_GRANT \\",
      "    --output-input NEW_FILE --output-grant NEW_FILE --output-lineage NEW_FILE \\",
      "    --authorized-at ISO --expires-at ISO --native-resource-id 4474 \\",
      "    --route-role RECOVERY --provider-country-id 223 --provider-region-id 32 \\",
      `    --acceptance-profile ${PROFILE}`,
      "",
    ].join("\n"));
    return;
  }
  const result = reissueAdafruitPrivateRouteQuoteV5(cliOptions(args));
  process.stdout.write(`${canonicalizeStrict({
    schema: LINEAGE_SCHEMA,
    inputFile: result.input.absolute,
    grantFile: result.grant.absolute,
    lineageFile: result.lineage.absolute,
    inputBytes: result.input.bytes.length,
    inputBytesHash: result.input.bytesHash,
    grantBytes: result.grant.bytes.length,
    grantBytesHash: result.grant.bytesHash,
    lineageBytes: result.lineage.bytes.length,
    lineageBytesHash: result.lineage.bytesHash,
    expiresAt: result.expiresAt,
    fileMode: "0600",
    frozenPredecessorsOverwritten: false,
    privateValuesPrinted: false,
  })}\n`);
}

if (process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); }
  catch (error) {
    process.stderr.write(`${String(error?.message ?? error)}\n`);
    process.exitCode = 1;
  }
}
