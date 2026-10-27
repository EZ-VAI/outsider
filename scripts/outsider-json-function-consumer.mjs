#!/usr/bin/env node
/* Ordinary consumer: the only routing input is Outsider's delivered descriptor.
 * No provider setup, task owner credential, model call or local computation. */
import { readFileSync } from "node:fs";
import { createOutsiderJsonFunctionClient } from "../src/outsider-json-function-client.js";
const [descriptorFile, inputFile] = process.argv.slice(2);
if (!descriptorFile || !inputFile) throw new Error("Usage: node scripts/outsider-json-function-consumer.mjs delivery.json input.json");
const started = Date.now();
const descriptor = JSON.parse(readFileSync(descriptorFile, "utf8")), input = JSON.parse(readFileSync(inputFile, "utf8"));
const result = await createOutsiderJsonFunctionClient(descriptor).invoke(input);
console.log(JSON.stringify({ ...result, elapsedMs: Date.now() - started, modelCalls: 0, ownerCredentialUsed: false }));
