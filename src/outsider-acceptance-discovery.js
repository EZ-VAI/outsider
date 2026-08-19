import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function readJson(file) {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; }
}

function result(command, source, confidence = "high") {
  return { command, source, confidence, discovered: true };
}

/**
 * Discover an acceptance command without asking the worker or interpreting its
 * narration.  The order is deliberately conservative: an explicit Outsider
 * config wins, then a repository-owned test script, then ecosystem defaults.
 * We never invent a green command merely so attached mode can call itself
 * controlled.
 */
export function discoverAcceptance(cwd) {
  const root = path.resolve(cwd || process.cwd());
  const outsider = readJson(path.join(root, ".outsider.json"));
  if (typeof outsider?.acceptance === "string" && outsider.acceptance.trim()) {
    return result(outsider.acceptance.trim(), ".outsider.json#acceptance", "explicit");
  }

  const pkg = readJson(path.join(root, "package.json"));
  const scripts = pkg?.scripts && typeof pkg.scripts === "object" ? pkg.scripts : {};
  if (typeof scripts.test === "string"
    && scripts.test.trim()
    && !/no test specified/i.test(scripts.test)) {
    return result("npm test", "package.json#scripts.test");
  }
  for (const name of ["check", "verify", "ci"]) {
    if (typeof scripts[name] === "string" && scripts[name].trim()) {
      return result(`npm run ${name}`, `package.json#scripts.${name}`, "medium");
    }
  }

  if (existsSync(path.join(root, "pyproject.toml"))
    || existsSync(path.join(root, "pytest.ini"))
    || existsSync(path.join(root, "setup.cfg"))) {
    return result("python -m pytest", "python-project", "medium");
  }
  if (existsSync(path.join(root, "Cargo.toml"))) return result("cargo test", "Cargo.toml");
  if (existsSync(path.join(root, "go.mod"))) return result("go test ./...", "go.mod");
  if (existsSync(path.join(root, "Makefile"))) {
    try {
      if (/^test\s*:/m.test(readFileSync(path.join(root, "Makefile"), "utf8"))) {
        return result("make test", "Makefile#test", "medium");
      }
    } catch { /* unreadable is not discoverable */ }
  }
  return { command: null, source: null, confidence: "none", discovered: false,
    reason: "NO_REPOSITORY_OWNED_ACCEPTANCE" };
}
