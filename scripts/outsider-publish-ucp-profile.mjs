// One-time platform protocol publication; no buyer identity or credentials in
// the public artifact. Never replace a pre-existing profile at this path.
import path from 'node:path';
import { readFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { writePrivateExecutionRecordOnce as writeOnce } from '../src/outsider-user-held-durable-execution-v2.js';
const [credentialsFile, outputDirectory] = process.argv.slice(2);
if (!path.isAbsolute(credentialsFile ?? '') || !path.isAbsolute(outputDirectory ?? '')) throw new Error('ABSOLUTE_PATHS_REQUIRED');
const token = JSON.parse(readFileSync(credentialsFile)).githubReleaseAsset.contentsWriteApiToken;
const bytes = readFileSync(new URL('../public/outsider-ucp-profile-2026-08-25.json', import.meta.url));
const file = 'protocols/outsider-ucp-profile-2026-08-25.json';
const url = `https://api.github.com/repos/EZ-VAI/outsider/contents/${file}`;
const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
const current = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
if (current.status !== 404) throw new Error(`PROFILE_TARGET_ALREADY_PRESENT_OR_UNAVAILABLE_${current.status}`);
const r = await fetch(url, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'Publish Outsider anonymous UCP cart negotiation profile', content: bytes.toString('base64') }),
  signal: AbortSignal.timeout(20000) });
if (r.status !== 201) throw new Error(`PROFILE_PUBLICATION_HTTP_${r.status}`);
const body = await r.json();
const profileUrl = `https://raw.githubusercontent.com/EZ-VAI/outsider/${body.commit.sha}/${file}`;
const check = await fetch(profileUrl, { signal: AbortSignal.timeout(20000) });
const observed = Buffer.from(await check.arrayBuffer());
if (check.status !== 200 || !observed.equals(bytes)) throw new Error('PROFILE_PUBLICATION_READBACK_MISMATCH');
mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
const result = { profileUrl, commit: body.commit.sha, bytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'), readbackMatched: true, paymentAuthority: false };
writeOnce(path.join(outputDirectory, 'ucp-profile-publication.json'), result);
console.log(JSON.stringify(result));
