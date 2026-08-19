import { randomUUID } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

export const SYSTEM_HELPER_LABEL = "ai.outsider.stage05";
export const SYSTEM_HELPER_PROTOCOL = 1;

const DEFAULT_SYSTEM_PATH = "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin";

export function systemHelperPath(nodeExecutable, inheritedPath = process.env.PATH) {
  const entries = [path.dirname(path.resolve(nodeExecutable)),
    ...String(inheritedPath ?? "").split(path.delimiter),
    ...DEFAULT_SYSTEM_PATH.split(path.delimiter)]
    .map((entry) => entry.trim()).filter(Boolean);
  return [...new Set(entries)].join(path.delimiter);
}

const xml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&apos;");

export function systemHelperPaths({ home, version, uid = process.getuid?.() ?? 0 } = {}) {
  const root = path.join(home, ".outsider", "system-helper");
  const releaseRoot = path.join(root, "releases", String(version));
  return {
    root,
    releaseRoot,
    entry: path.join(releaseRoot, "bin", "outsider-attached-daemon.mjs"),
    attachedRoot: path.join(home, ".outsider", "attached"),
    tokenFile: path.join(root, "token"),
    stdoutFile: path.join(root, "helper.stdout.log"),
    stderrFile: path.join(root, "helper.stderr.log"),
    plistFile: path.join(home, "Library", "LaunchAgents", `${SYSTEM_HELPER_LABEL}.plist`),
    socketPath: path.join("/tmp", `outsider-attached-system-${uid}.sock`),
  };
}

export function stageSystemHelperRuntime({ sourceRoot, targetRoot }) {
  mkdirSync(path.join(targetRoot, "bin"), { recursive: true, mode: 0o700 });
  cpSync(path.join(sourceRoot, "src"), path.join(targetRoot, "src"), { recursive: true });
  for (const entry of ["outsider-attached-daemon.mjs", "outsider-controller-host.mjs",
    "outsider-hook.mjs"]) {
    cpSync(path.join(sourceRoot, "bin", entry), path.join(targetRoot, "bin", entry));
  }
  const sourcePackage = JSON.parse(readFileSync(path.join(sourceRoot, "package.json"), "utf8"));
  writeFileSync(path.join(targetRoot, "package.json"), `${JSON.stringify({
    name: sourcePackage.name,
    version: sourcePackage.version,
    private: true,
    type: "module",
    engines: sourcePackage.engines,
  }, null, 2)}\n`, { mode: 0o600 });
  return { version: sourcePackage.version, entry: path.join(targetRoot, "bin",
    "outsider-attached-daemon.mjs") };
}

export function systemHelperPlist({ nodeExecutable, entry, workingDirectory, attachedRoot,
  socketPath, token, stdoutFile, stderrFile, environmentPath } = {}) {
  const args = [nodeExecutable, entry].map((value) => `      <string>${xml(value)}</string>`).join("\n");
  const env = {
    OUTSIDER_ATTACHED_ROOT: attachedRoot,
    OUTSIDER_ATTACHED_SOCKET: socketPath,
    OUTSIDER_ATTACHED_TOKEN: token,
    OUTSIDER_DAEMON_TRANSPORT: "system-helper",
    /* launchd's default PATH is /usr/bin:/bin:/usr/sbin:/sbin. On machines
       where Node/npm live in /usr/local/bin or /opt/homebrew/bin, an acceptance
       command discovered as `npm test` therefore exists in the user's terminal
       and disappears inside the helper. Capture the installer's executable
       search path, while always retaining the Node directory and system paths. */
    PATH: systemHelperPath(nodeExecutable, environmentPath),
  };
  const environment = Object.entries(env).map(([key, value]) =>
    `      <key>${xml(key)}</key>\n      <string>${xml(value)}</string>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${SYSTEM_HELPER_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${args}
  </array>
  <key>WorkingDirectory</key><string>${xml(workingDirectory)}</string>
  <key>EnvironmentVariables</key>
  <dict>
${environment}
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ProcessType</key><string>Interactive</string>
  <key>StandardOutPath</key><string>${xml(stdoutFile)}</string>
  <key>StandardErrorPath</key><string>${xml(stderrFile)}</string>
</dict>
</plist>
`;
}

const runLaunchctl = (args, run) => run("/bin/launchctl", args, {
  encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 20_000,
});

export function installSystemHelper({ sourceRoot, home, nodeExecutable = process.execPath,
  uid = process.getuid?.() ?? 0, run = spawnSync, register = true } = {}) {
  const sourcePackage = JSON.parse(readFileSync(path.join(sourceRoot, "package.json"), "utf8"));
  const target = systemHelperPaths({ home, version: sourcePackage.version, uid });
  mkdirSync(target.root, { recursive: true, mode: 0o700 });
  mkdirSync(path.dirname(target.plistFile), { recursive: true });
  stageSystemHelperRuntime({ sourceRoot, targetRoot: target.releaseRoot });
  const token = existsSync(target.tokenFile)
    ? readFileSync(target.tokenFile, "utf8").trim() : randomUUID();
  if (!token) throw new Error("SYSTEM_HELPER_TOKEN_EMPTY");
  writeFileSync(target.tokenFile, `${token}\n`, { mode: 0o600 });
  const plist = systemHelperPlist({
    nodeExecutable,
    entry: target.entry,
    workingDirectory: target.releaseRoot,
    attachedRoot: target.attachedRoot,
    socketPath: target.socketPath,
    token,
    stdoutFile: target.stdoutFile,
    stderrFile: target.stderrFile,
    environmentPath: process.env.PATH,
  });
  const temporary = `${target.plistFile}.${process.pid}.tmp`;
  writeFileSync(temporary, plist, { mode: 0o600 });
  renameSync(temporary, target.plistFile);
  if (!register) {
    return { ...target, version: sourcePackage.version, label: SYSTEM_HELPER_LABEL,
      protocolVersion: SYSTEM_HELPER_PROTOCOL, registered: false };
  }
  const domain = `gui/${uid}`;
  runLaunchctl(["bootout", domain, target.plistFile], run);
  const boot = runLaunchctl(["bootstrap", domain, target.plistFile], run);
  if (boot.error || boot.status !== 0) {
    throw new Error(`SYSTEM_HELPER_BOOTSTRAP_FAILED:${boot.error?.message
      ?? String(boot.stderr ?? boot.stdout ?? `exit ${boot.status}`).trim()}`);
  }
  const kick = runLaunchctl(["kickstart", "-k", `${domain}/${SYSTEM_HELPER_LABEL}`], run);
  if (kick.error || kick.status !== 0) {
    throw new Error(`SYSTEM_HELPER_KICKSTART_FAILED:${kick.error?.message
      ?? String(kick.stderr ?? kick.stdout ?? `exit ${kick.status}`).trim()}`);
  }
  return { ...target, version: sourcePackage.version, label: SYSTEM_HELPER_LABEL,
    protocolVersion: SYSTEM_HELPER_PROTOCOL, registered: true };
}
