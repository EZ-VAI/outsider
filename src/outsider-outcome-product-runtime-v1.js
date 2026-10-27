/*
 * The smallest real Outsider product surface:
 *
 *   say one goal -> receive one executable proposal -> confirm once -> run
 *
 * Goal interpretation is injected so the product is not tied to one model or
 * vertical.  The only accepted compiler output is a verified OutcomeProgram;
 * the durable orchestrator owns discovery, formation, execution and recovery.
 */

import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";
import { verifyOutcomeProgramV1 } from "./outsider-outcome-program-v1.js";

const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const HASH = /^sha256:[a-f0-9]{64}$/u;

function fail(code) {
  const error = new TypeError(`OUTSIDER_OUTCOME_PRODUCT_RUNTIME_V1_${code}`);
  error.outsiderCode = code;
  throw error;
}

function digest(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function requestFile(directory, requestId) {
  return path.join(directory,
    `${createHash("sha256").update(requestId).digest("hex")}.request.json`);
}

function confirmationFile(directory, requestId) {
  return path.join(directory,
    `${createHash("sha256").update(requestId).digest("hex")}.confirmation.json`);
}

function writeOnce(file, value) {
  const bytes = Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
  let descriptor;
  try {
    descriptor = openSync(file, "wx", 0o600);
    writeSync(descriptor, bytes);
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function readRecord(file, code) {
  if (!existsSync(file)) fail(code);
  const bytes = readFileSync(file);
  if (bytes.length < 3 || !bytes.subarray(bytes.length - 1).equals(
    Buffer.from("\n"))) fail("PRIVATE_RECORD_PARTIAL");
  try { return JSON.parse(bytes.toString("utf8")); } catch {
    fail("PRIVATE_RECORD_INVALID");
  }
}

function normalizedRequest(input, clock) {
  if (!input || typeof input !== "object"
    || typeof input.requestId !== "string" || !REQUEST_ID.test(input.requestId)
    || typeof input.goal !== "string" || input.goal.trim().length < 1
    || Buffer.byteLength(input.goal, "utf8") > 32_768
    || typeof input.completionDeadline !== "string"
    || !Number.isFinite(Date.parse(input.completionDeadline))) {
    fail("REQUEST_INVALID");
  }
  const requestedAt = clock();
  if (!Number.isFinite(Date.parse(requestedAt))
    || new Date(requestedAt).toISOString() !== requestedAt
    || Date.parse(input.completionDeadline) <= Date.parse(requestedAt)) {
    fail("REQUEST_TIME_INVALID");
  }
  const budget = input.budget ?? { currency: "USD", maximumAmountMinor: "0" };
  if (!/^[A-Z]{3}$/u.test(budget.currency)
    || !/^(?:0|[1-9]\d{0,30})$/u.test(budget.maximumAmountMinor)) {
    fail("REQUEST_BUDGET_INVALID");
  }
  return {
    requestId: input.requestId,
    goal: input.goal.trim(),
    completionDeadline: new Date(input.completionDeadline).toISOString(),
    budget: {
      currency: budget.currency,
      maximumAmountMinor: budget.maximumAmountMinor,
    },
    context: JSON.parse(canonicalizeStrict(input.context ?? {})),
    requestedAt,
  };
}

function publicProposal(record) {
  const program = record.program;
  return Object.freeze({
    requestId: record.request.requestId,
    proposalId: record.proposalId,
    programId: program.programId,
    programHash: program.programHash,
    outcome: program.outcome,
    formationDeadline: program.formationDeadline,
    completionDeadline: program.completionDeadline,
    resourceRoles: program.requirements.map((requirement) => ({
      requirementId: requirement.requirementId,
      role: requirement.role,
      capability: requirement.capability,
    })),
    confirmationRequired: true,
    nextAction: "CONFIRM_ONCE",
    outsiderStaffTouchLimit: 0,
  });
}

export function createOutsiderOutcomeProductRuntimeV1(options) {
  if (!options || typeof options.directory !== "string"
    || typeof options.compileGoal !== "function"
    || !options.orchestrator || typeof options.orchestrator.run !== "function"
    || typeof options.orchestrator.resume !== "function") fail("OPTIONS_INVALID");
  const directory = path.resolve(options.directory);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const clock = options.clock ?? (() => new Date().toISOString());

  async function requestOutcome(input) {
    const request = normalizedRequest(input, clock);
    const file = requestFile(directory, request.requestId);
    if (existsSync(file)) {
      const existing = readRecord(file, "REQUEST_NOT_FOUND");
      if (existing.goalHash !== digest(request.goal)
        || existing.request.completionDeadline !== request.completionDeadline
        || canonicalizeStrict(existing.request.budget)
          !== canonicalizeStrict(request.budget)) fail("REQUEST_ID_REUSED");
      return publicProposal(existing);
    }
    const program = verifyOutcomeProgramV1(await options.compileGoal({
      goal: request.goal,
      completionDeadline: request.completionDeadline,
      budget: request.budget,
      context: request.context,
      requestedAt: request.requestedAt,
      requestId: request.requestId,
    }));
    if (program.orderId !== request.requestId
      || program.outcome.budget.currency !== request.budget.currency
      || program.outcome.budget.maximumAmountMinor
        !== request.budget.maximumAmountMinor
      || program.completionDeadline !== request.completionDeadline) {
      fail("COMPILED_PROGRAM_REQUEST_MISMATCH");
    }
    const proposalId = `proposal_${createHash("sha256")
      .update(`${request.requestId}\0${program.programHash}`)
      .digest("hex").slice(0, 40)}`;
    const record = {
      schema: "outsider/private-outcome-request/v1",
      proposalId,
      goalHash: digest(request.goal),
      request,
      program,
    };
    writeOnce(file, record);
    return publicProposal(record);
  }

  async function confirmOutcome(input, runOptions = {}) {
    if (!input || typeof input.requestId !== "string"
      || !REQUEST_ID.test(input.requestId)
      || typeof input.programHash !== "string" || !HASH.test(input.programHash)) {
      fail("CONFIRMATION_INVALID");
    }
    const record = readRecord(requestFile(directory, input.requestId),
      "REQUEST_NOT_FOUND");
    if (record.program.programHash !== input.programHash) {
      fail("CONFIRMATION_PROGRAM_MISMATCH");
    }
    const file = confirmationFile(directory, input.requestId);
    if (!existsSync(file)) {
      writeOnce(file, {
        schema: "outsider/outcome-confirmation/v1",
        requestId: input.requestId,
        proposalId: record.proposalId,
        programHash: input.programHash,
        confirmedAt: clock(),
      });
    } else {
      const existing = readRecord(file, "CONFIRMATION_NOT_FOUND");
      if (existing.programHash !== input.programHash
        || existing.proposalId !== record.proposalId) {
        fail("CONFIRMATION_REPLAY_MISMATCH");
      }
    }
    return options.orchestrator.run(record.program, runOptions);
  }

  return Object.freeze({
    requestOutcome,
    confirmOutcome,
    proposal(requestId) {
      if (typeof requestId !== "string" || !REQUEST_ID.test(requestId)) {
        fail("REQUEST_ID_INVALID");
      }
      return publicProposal(readRecord(requestFile(directory, requestId),
        "REQUEST_NOT_FOUND"));
    },
    resumeConfirmed(requestId, runOptions = {}) {
      const record = readRecord(requestFile(directory, requestId),
        "REQUEST_NOT_FOUND");
      const confirmation = readRecord(confirmationFile(directory, requestId),
        "CONFIRMATION_NOT_FOUND");
      if (confirmation.programHash !== record.program.programHash) {
        fail("CONFIRMATION_REPLAY_MISMATCH");
      }
      return options.orchestrator.resume(record.program.programId, runOptions);
    },
  });
}

