#!/usr/bin/env node
import { existsSync, mkdirSync, openSync, readFileSync, linkSync, writeFileSync,
  closeSync, rmSync } from "node:fs";
import path from "node:path";
import {
  buildShadowEvidenceBook, verifyShadowEvidenceBook,
} from "../src/outsider-shadow-evidence-book.js";

function parse(argv) {
  const output = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--") || argv[index + 1] == null) continue;
    output[value.slice(2)] = argv[++index];
  }
  return output;
}

function readJson(file) {
  return JSON.parse(readFileSync(path.resolve(file), "utf8"));
}

function atomicNewJson(file, value) {
  const target = path.resolve(file);
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  if (existsSync(target)) throw new Error("SHADOW_EVIDENCE_BOOK_OUTPUT_EXISTS");
  const temporary = `${target}.tmp-${process.pid}`;
  let descriptor = null;
  try {
    descriptor = openSync(temporary, "wx", 0o600);
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`);
    closeSync(descriptor);
    descriptor = null;
    try { linkSync(temporary, target); }
    catch (error) {
      if (error?.code === "EEXIST") throw new Error("SHADOW_EVIDENCE_BOOK_OUTPUT_EXISTS");
      throw error;
    }
    rmSync(temporary);
  } catch (error) {
    if (descriptor !== null) closeSync(descriptor);
    rmSync(temporary, { force: true });
    throw error;
  }
  return target;
}

const args = parse(process.argv.slice(2));
for (const required of ["registry", "checkpoint", "clearances", "episodes", "out"]) {
  if (!args[required]) {
    throw new Error(`USAGE: --registry <json> --checkpoint <json> --clearances <json-array> `
      + `--episodes <json-array> --out <json> [--generated-at <ISO>]`);
  }
}

const evidenceRegistry = readJson(args.registry);
const curateCheckpoint = readJson(args.checkpoint);
const curateClearances = readJson(args.clearances);
const curateEpisodes = readJson(args.episodes);
const generatedAt = args["generated-at"] ?? new Date().toISOString();
const book = buildShadowEvidenceBook({ evidenceRegistry, curateCheckpoint, curateClearances,
  curateEpisodes, generatedAt });
const checked = verifyShadowEvidenceBook(book, { evidenceRegistry, curateCheckpoint,
  curateClearances, curateEpisodes, now: generatedAt });
if (!checked.ok || checked.sourceArtifactsReverified !== true
  || checked.curateDerivationsReverified !== true) {
  throw new Error(`SHADOW_EVIDENCE_BOOK_BUILD_VERIFY_FAILED:${checked.error ?? "UNBOUND"}`);
}
const output = atomicNewJson(args.out, book);
process.stdout.write(`${JSON.stringify({ ok: true, output, bookHash: book.bookHash,
  stage1UniqueRuns: book.streams.supervisedActions.uniqueRuns,
  stage15HistoricalEpisodes: book.streams.physicalExperience.historicalEpisodes,
  causalExperienceUnits: 0, decision: book.modelEntrance.decision,
  automaticTraining: false, price: null, capital: null, coverage: null })}\n`);
