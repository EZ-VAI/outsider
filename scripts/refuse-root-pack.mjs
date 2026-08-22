#!/usr/bin/env node

import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
if (pkg.private !== true) throw new Error("ROOT_RESEARCH_WORKSPACE_MUST_REMAIN_PRIVATE");
process.stderr.write("ROOT_RESEARCH_WORKSPACE_NOT_PACKABLE: use npm run release:build; "
  + "it stages the machine-reviewed public Stage 0.5 allowlist.\n");
process.exitCode = 1;
