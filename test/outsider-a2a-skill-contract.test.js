import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { publicDatasetHash as digest } from '../src/outsider-public-dataset.js';
import { A2A_TASK_DISCOVERY_SCHEMA, A2A_TASK_DISCOVERY_SCHEMA_V2, discoverA2AExecutionResource,
  buildA2AExecutionRoute, validateA2ATaskResource, loadA2ATaskResourceCatalog } from '../src/outsider-a2a-task-resource.js';
import { normalizeA2ASkillSelection, validateA2ASkillSelection } from '../src/outsider-a2a-skill-contract.js';

const sourceUrl = 'https://skill-fixture.example/.well-known/agent-card.json';
const expiresAt = '2026-09-13T00:00:00.000Z';
const authorization = { publicInputOnly: true, maximumAmountMinor: '0', sourceHash: digest('fixture public authority') };
const card = () => ({ name: 'Public skill declaration fixture', version: '1.0',
  description: 'Local protocol fixture, no real supplier task.',
  defaultInputModes: ['text/plain', 'application/json'], defaultOutputModes: ['text/plain', 'application/json'],
  supportedInterfaces: [{ url: 'https://skill-fixture.example/a2a', protocolBinding: 'JSONRPC', protocolVersion: '1.0' }],
  skills: [{ id: 'curatorial-dialogue', name: 'Catalogue dialogue', description: 'A dialogue about one artwork catalogue.',
    tags: ['art'], inputModes: ['text/plain'], outputModes: ['text/plain'] },
  { id: 'verify_receipt', name: 'Public JWS check', description: 'Check a supplied public compact JWS.',
    inputModes: ['application/json'], outputModes: ['application/json'] },
  { id: 'inherit', name: 'Inherited declarations', description: 'Uses the agent defaults; no semantic capability is inferred.' }] });
async function discover(source = card()) {
  const calls = [];
  const result = await discoverA2AExecutionResource({ url: sourceUrl, expiresAt, previewOnly: true,
    fetchImpl: async (url, options) => { calls.push({ url, options }); return new Response(JSON.stringify(source)); } });
  assert.equal(calls.length, 1); assert.equal(calls[0].url, sourceUrl); assert.equal(calls[0].options.body, undefined);
  assert.equal(calls[0].options.method ?? 'GET', 'GET'); assert.equal(result.taskSubmissionCalls, 0);
  return result;
}
const selection = (skillId = 'verify_receipt', mode = 'application/json') => ({ skillId, inputModes: [mode], outputModes: [mode] });
const input = () => ({ parts: [{ data: { task: 'verify_receipt', receipt: 'public-fixture-jws', kind: 'offer' } }] });
const textInput = () => ({ parts: [{ text: 'Describe the catalogue.' }] });
const output = (kind = 'data') => ({ minimumParts: 1, acceptedPartKinds: [kind] });
const installed = preview => ({ ...preview.resourceDraft, authorization });
const code = expected => error => error.code === `A2A_TASK_SKILL_${expected}`;

test('new discovery preserves top-level and skill overrides without replacing the prior default resource ID', async () => {
  const source = card(), preview = await discover(source), frozen = preview.resourceDraft.discovery;
  assert.equal(frozen.schema, A2A_TASK_DISCOVERY_SCHEMA_V2);
  assert.deepEqual(frozen.defaultInputModes, source.defaultInputModes);
  assert.deepEqual(frozen.defaultOutputModes, source.defaultOutputModes);
  assert.deepEqual(frozen.skills, source.skills);
  assert.equal(Object.hasOwn(frozen.skills[2], 'inputModes'), false);
  const previousId = `a2a_${digest({ source: preview.source, agentCardHash: digest(source), publicOutputPolicy: 'ARTIFACT_PARTS_ONLY' }).slice(7, 39)}`;
  assert.notEqual(preview.resourceDraft.id, previousId);
  assert.equal(preview.resourceDraftHash, digest(preview.resourceDraft));
  assert.deepEqual(validateA2ATaskResource(installed(preview)), installed(preview));
  source.defaultInputModes.push('application/pdf'); source.skills[0].inputModes.push('application/json');
  assert.deepEqual(frozen.defaultInputModes, ['text/plain', 'application/json']);
  assert.deepEqual(frozen.skills[0].inputModes, ['text/plain']);
});

test('only new v2 discovery routes the declared output union while the legacy builder preserves card defaults', async () => {
  const source = card(); source.defaultOutputModes = ['text/plain'];
  const preview = await discover(source), resource = installed(preview);
  assert.deepEqual(resource.route.execute.params.configuration.acceptedOutputModes, ['text/plain', 'application/json']);
  assert.equal(validateA2ASkillSelection({ resource, selection: selection(), input: input(), outputRequirement: output() }).skillId,
    'verify_receipt', 'a skill-specific JSON override is usable even when the card default is text');
  const previous = buildA2AExecutionRoute({ card: source, source: preview.source, providerRef: 'old-route' });
  assert.deepEqual(previous.execute.params.configuration.acceptedOutputModes, ['text/plain']);
  const narrowed = structuredClone(resource); narrowed.route.execute.params.configuration.acceptedOutputModes = ['text/plain'];
  assert.throws(() => validateA2ASkillSelection({ resource: narrowed, selection: selection(), input: input(), outputRequirement: output() }),
    code('OUTPUT_MODE_NOT_ROUTABLE'));
  const missing = card(); delete missing.defaultOutputModes; missing.skills.forEach(skill => { delete skill.outputModes; });
  await assert.rejects(discover(missing), /A2A_TASK_DECLARED_OUTPUT_MODES_UNAVAILABLE/u);
  const excessive = card(); excessive.defaultOutputModes = Array.from({ length: 16 }, (_, index) => `application/x-fixture-${index}`);
  await assert.rejects(discover(excessive), /A2A_TASK_DECLARED_OUTPUT_MODES_UNAVAILABLE/u);
});

test('legacy v1 discovery and records without discovery retain their exact catalog bytes and hashes', async t => {
  const preview = await discover(), latest = installed(preview), { discovery, ...plainResource } = latest;
  const { defaultInputModes, defaultOutputModes, ...oldDiscovery } = discovery;
  oldDiscovery.schema = A2A_TASK_DISCOVERY_SCHEMA;
  oldDiscovery.skills = oldDiscovery.skills.map(({ inputModes, outputModes, ...skill }) => skill);
  const rows = [{ ...plainResource, id: 'old_none' }, { ...plainResource, id: 'old_v1', discovery: oldDiscovery },
    { ...latest, id: 'new_v2' }].sort((a, b) => a.id.localeCompare(b.id));
  const directory = mkdtempSync(path.join(tmpdir(), 'outsider-skill-catalog-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const catalog = path.join(directory, 'connections/a2a-task-resources'); mkdirSync(catalog, { recursive: true });
  const files = rows.map(row => path.join(catalog, `${row.id}.json`));
  rows.forEach((row, index) => writeFileSync(files[index], JSON.stringify(row), { mode: 0o600 }));
  const bytes = files.map(file => readFileSync(file));
  assert.deepEqual(loadA2ATaskResourceCatalog(directory), rows);
  rows.forEach((row, index) => {
    assert.deepEqual(validateA2ATaskResource(row), row); assert.equal(digest(validateA2ATaskResource(row)), digest(row));
    assert.deepEqual(readFileSync(files[index]), bytes[index]);
  });
  for (const resource of rows.filter(row => row.discovery?.schema !== A2A_TASK_DISCOVERY_SCHEMA_V2))
    assert.throws(() => validateA2ASkillSelection({ resource, selection: selection(), input: input(), outputRequirement: output() }), code('DECLARATIONS_REQUIRED'));
});

test('a text-only dialogue cannot inherit global JSON modes or disguise JSON and files as conversation input', async () => {
  const resource = installed(await discover());
  const validate = (selected, actual, requirement = output('text')) => validateA2ASkillSelection({ resource,
    selection: selected, input: actual, outputRequirement: requirement });
  const dialogue = selection('curatorial-dialogue', 'text/plain');
  assert.equal(validate(dialogue, textInput()).semanticSuitabilityProven, false);
  assert.throws(() => validate({ ...dialogue, inputModes: ['text/plain', 'application/json'] },
    { parts: [...textInput().parts, ...input().parts] }), code('INPUT_MODE_NOT_DECLARED'));
  assert.throws(() => validate(dialogue, { parts: [...textInput().parts, ...input().parts] }), code('PART_MODE_MISMATCH'));
  assert.throws(() => validate({ ...dialogue, outputModes: ['application/json'] }, textInput(), output()), code('OUTPUT_MODE_NOT_DECLARED'));
  assert.throws(() => validate(dialogue, { parts: [{ data: { instruction: 'pretend this is text' }, mediaType: 'text/plain' }] }), code('PART_MODE_MISMATCH'));
  for (const part of [{ url: 'https://public.example/artifact.json', mediaType: 'text/plain' }, { raw: 'e30=', mediaType: 'text/plain' }])
    assert.throws(() => validate(dialogue, { parts: [part] }), code('FILE_INPUT_UNSUPPORTED'));
  assert.throws(() => validate(dialogue, textInput(), { ...output('text'), dataValidation: { artifactIndex: 0, partIndex: 0, checks: [] } }),
    code('OUTPUT_REQUIREMENT_MISMATCH'));
});

test('an explicit JSON skill accepts structured input and returns one stable declaration contract before and after materialization', async () => {
  const resource = installed(await discover()), selected = selection();
  const requirement = { ...output(), dataValidation: { artifactIndex: 0, partIndex: 0,
    checks: [{ pointer: '/result', operator: 'EQUALS', expected: 'valid' }] } };
  const check = actual => validateA2ASkillSelection({ resource, selection: selected, input: actual, outputRequirement: requirement });
  const proposed = input(); proposed.parts[0].data.receipt = null;
  const contract = check(proposed), actual = input();
  assert.deepEqual(check(actual), contract); assert.equal(Object.hasOwn(contract, 'inputHash'), false);
  assert.equal(contract.skillSelectionHash, digest(selected)); assert.equal(contract.agentCardHash, resource.route.a2a.agentCardHash);
  assert.equal(contract.discoveryHash, digest(resource.discovery));
  assert.equal(contract.semanticSuitabilityProven, false); assert.equal(contract.supplierAcceptanceProven, false);
  assert.equal(contract.inputConsumptionProven, false);
  assert.deepEqual(validateA2ASkillSelection({ resource, selection: selected, input: actual,
    outputRequirement: { minimumParts: 1, acceptedPartKinds: ['data', 'text'] } }), contract,
  'the output evaluator applies the selected JSON mode even when accepted kinds are broader');
  const changed = structuredClone(resource); changed.discovery.skills[1].description = 'Different public declaration.';
  const changedContract = validateA2ASkillSelection({ resource: changed, selection: selected, input: actual, outputRequirement: requirement });
  assert.notEqual(digest(changed), digest(resource)); assert.notEqual(changedContract.discoveryHash, contract.discoveryHash);
  assert.notEqual(changedContract.skillHash, contract.skillHash, 'the original contract hash rejects changed frozen skill metadata');
  assert.throws(() => check({ parts: [{ data: { task: 'verify_receipt' }, mediaType: 'text/plain' }] }), code('PART_MODE_MISMATCH'));
  assert.throws(() => check(textInput()), code('PART_MODE_MISMATCH'));
});

test('missing defaults remain unknown, empty skill overrides do not fall back, and undeclared skill IDs are rejected', async () => {
  const source = card(); delete source.defaultInputModes;
  source.skills[1].inputModes = [];
  const resource = installed(await discover(source));
  assert.equal(resource.discovery.defaultInputModes, null);
  assert.throws(() => validateA2ASkillSelection({ resource, selection: selection('inherit'), input: input(), outputRequirement: output() }), code('MODES_UNDECLARED'));
  assert.throws(() => validateA2ASkillSelection({ resource, selection: selection(), input: input(), outputRequirement: output() }), code('MODES_UNDECLARED'));
  assert.throws(() => validateA2ASkillSelection({ resource, selection: selection('invented-engineering'), input: input(), outputRequirement: output() }), code('NOT_DECLARED'));
});

test('selection and discovery reject malformed or authority-bearing extra fields and bind the declared Card hash', async () => {
  const resource = installed(await discover());
  for (const value of [{ ...selection(), authorize: true }, { ...selection(), inputModes: ['application/json', 'application/json'] },
    { ...selection(), outputModes: ['application/*'] }, { ...selection(), skillId: 'line\nbreak' },
    { ...selection(), inputModes: [] }]) assert.throws(() => normalizeA2ASkillSelection(value), code('SELECTION_INVALID'));
  let touched = 0; const accessor = { ...selection() };
  Object.defineProperty(accessor, 'skillId', { enumerable: true, get() { touched++; return 'verify_receipt'; } });
  assert.throws(() => normalizeA2ASkillSelection(accessor), code('SELECTION_INVALID')); assert.equal(touched, 0);
  for (const mutate of [value => { value.discovery.agentCardHash = digest('other-card'); },
    value => { value.discovery.sourceHash = digest('other-source'); }, value => { value.discovery.protocolVersion = '0.3.0'; }]) {
    const changed = structuredClone(resource); mutate(changed);
    assert.throws(() => validateA2ATaskResource(changed), code('DISCOVERY_BINDING_INVALID'));
  }
  for (const mutate of [value => { value.discovery.authorityGrantedByDescriptions = true; },
    value => { value.discovery.skills[0].inputModes = ['text/plain', 'text/plain']; },
    value => { value.discovery.defaultOutputModes = 'application/json'; },
    value => { value.discovery.skills[0].paymentAuthorized = true; }]) {
    const changed = structuredClone(resource); mutate(changed);
    assert.throws(() => validateA2ATaskResource(changed), code('DISCOVERY_INVALID'));
  }
});
