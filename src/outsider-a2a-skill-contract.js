/* A local declaration check, not a provider-side skill invocation protocol.
 * Per-skill modes override Agent Card defaults (A2A 1.0, AgentSkill):
 * https://a2a-protocol.org/v1.0.0/specification/#445-agentskill
 * Descriptions and media types establish neither semantic suitability nor
 * consumption of an attachment. This path supports explicit text/JSON only. */
import { canonicalizeStrict } from './canonical.js';
import { publicDatasetHash as digest } from './outsider-public-dataset.js';
import { validateA2AParts } from './outsider-a2a-protocol.js';

export const A2A_TASK_DISCOVERY_SCHEMA_V2 = 'outsider/a2a-task-resource-discovery/v2';
export const A2A_SELECTED_SKILL_CONTRACT_SCHEMA = 'outsider/a2a-selected-skill-contract/v1';
const MODES = ['text/plain', 'application/json'];
const HASH = /^sha256:[a-f0-9]{64}$/u;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, keys) => object(value) && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const fail = code => { throw Object.assign(new Error(`A2A_TASK_SKILL_${code}`), { code: `A2A_TASK_SKILL_${code}` }); };
function canonical(value, code) {
  try { return canonicalizeStrict(value); } catch { fail(code); }
}
function declaredModes(value) {
  return Array.isArray(value) && value.length <= 16 && new Set(value).size === value.length
    && value.every(mode => typeof mode === 'string' && mode.length > 0 && mode.length <= 100
      && mode.trim() === mode && !/[\u0000-\u001f\u007f]/u.test(mode));
}

// A missing declaration stays unknown. An explicit empty override stays empty;
// neither case inherits a more permissive set from another skill.
export function freezeA2ASkillDiscovery(observed) {
  canonical(observed.card, 'DISCOVERY_INVALID');
  const card = observed.card;
  if (!object(card) || !Array.isArray(card.skills) || card.skills.some(skill => !object(skill))) fail('DISCOVERY_INVALID');
  return {
    schema: A2A_TASK_DISCOVERY_SCHEMA_V2, agentVersion: card.version ?? null,
    sourceHash: observed.source.sourceHash, agentCardHash: digest(card),
    protocolVersion: observed.selectedInterface.protocolVersion,
    defaultInputModes: Object.hasOwn(card, 'defaultInputModes') ? structuredClone(card.defaultInputModes) : null,
    defaultOutputModes: Object.hasOwn(card, 'defaultOutputModes') ? structuredClone(card.defaultOutputModes) : null,
    skills: card.skills.map(skill => ({ id: skill?.id, name: skill?.name, description: skill?.description,
      ...(skill?.tags === undefined ? {} : { tags: structuredClone(skill.tags) }),
      ...(Object.hasOwn(skill, 'inputModes') ? { inputModes: structuredClone(skill.inputModes) } : {}),
      ...(Object.hasOwn(skill, 'outputModes') ? { outputModes: structuredClone(skill.outputModes) } : {}) })),
    descriptionsAreUntrusted: true, authorityGrantedByDescriptions: false,
  };
}

export function validateA2ASkillDiscovery(value, route) {
  canonical(value, 'DISCOVERY_INVALID'); canonical(route, 'DISCOVERY_BINDING_INVALID');
  if (!exact(value, ['schema', 'agentVersion', 'sourceHash', 'agentCardHash', 'protocolVersion',
    'defaultInputModes', 'defaultOutputModes', 'skills', 'descriptionsAreUntrusted', 'authorityGrantedByDescriptions'])
    || value.schema !== A2A_TASK_DISCOVERY_SCHEMA_V2
    || value.agentVersion !== null && (typeof value.agentVersion !== 'string' || value.agentVersion.length > 200)
    || !HASH.test(value.sourceHash ?? '') || !HASH.test(value.agentCardHash ?? '')
    || value.descriptionsAreUntrusted !== true || value.authorityGrantedByDescriptions !== false
    || value.defaultInputModes !== null && !declaredModes(value.defaultInputModes)
    || value.defaultOutputModes !== null && !declaredModes(value.defaultOutputModes)
    || !Array.isArray(value.skills) || value.skills.length > 64
    || new Set(value.skills.map(skill => skill?.id)).size !== value.skills.length) fail('DISCOVERY_INVALID');
  if (value.sourceHash !== route?.sourceHash || value.agentCardHash !== route?.a2a?.agentCardHash
    || value.protocolVersion !== route?.a2a?.protocolVersion) fail('DISCOVERY_BINDING_INVALID');
  for (const skill of value.skills) {
    if (!object(skill) || Object.keys(skill).some(key => !['id', 'name', 'description', 'tags', 'inputModes', 'outputModes'].includes(key))
      || typeof skill.id !== 'string' || !skill.id || skill.id.length > 256 || /[\u0000-\u001f\u007f]/u.test(skill.id)
      || typeof skill.name !== 'string' || !skill.name || skill.name.length > 200
      || typeof skill.description !== 'string' || !skill.description || skill.description.length > 4000
      || skill.tags !== undefined && (!Array.isArray(skill.tags) || skill.tags.length > 32
        || skill.tags.some(tag => typeof tag !== 'string' || tag.length > 100))
      || Object.hasOwn(skill, 'inputModes') && !declaredModes(skill.inputModes)
      || Object.hasOwn(skill, 'outputModes') && !declaredModes(skill.outputModes)) fail('DISCOVERY_INVALID');
  }
  return structuredClone(value);
}

export const A2A_SKILL_SELECTION_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['skillId', 'inputModes', 'outputModes'],
  properties: {
    skillId: { type: 'string', minLength: 1, maxLength: 256 },
    inputModes: { type: 'array', minItems: 1, maxItems: 2, uniqueItems: true, items: { enum: MODES },
      description: 'Every actual input part must match an explicitly selected, skill-declared mode. No file or automatic JSON-to-text conversion.' },
    outputModes: { type: 'array', minItems: 1, maxItems: 2, uniqueItems: true, items: { enum: MODES },
      description: 'Declared acceptable output media types; not evidence of semantic task completion.' },
  },
};

export function normalizeA2ASkillSelection(value) {
  canonical(value, 'SELECTION_INVALID');
  if (!exact(value, ['skillId', 'inputModes', 'outputModes']) || typeof value.skillId !== 'string'
    || !value.skillId || value.skillId.length > 256 || /[\u0000-\u001f\u007f]/u.test(value.skillId)
    || ['inputModes', 'outputModes'].some(key => !declaredModes(value[key]) || !value[key].length
      || value[key].some(mode => !MODES.includes(mode)))) fail('SELECTION_INVALID');
  return structuredClone(value);
}

export function validateA2ASkillSelection({ resource, selection, input, outputRequirement }) {
  const selected = normalizeA2ASkillSelection(selection);
  canonical(resource, 'DISCOVERY_INVALID');
  if (resource?.discovery?.schema !== A2A_TASK_DISCOVERY_SCHEMA_V2) fail('DECLARATIONS_REQUIRED');
  const discovery = validateA2ASkillDiscovery(resource.discovery, resource.route);
  const skill = discovery.skills.find(row => row.id === selected.skillId);
  if (!skill) fail('NOT_DECLARED');
  const inputModes = Object.hasOwn(skill, 'inputModes') ? skill.inputModes : discovery.defaultInputModes;
  const outputModes = Object.hasOwn(skill, 'outputModes') ? skill.outputModes : discovery.defaultOutputModes;
  if (!inputModes?.length || !outputModes?.length) fail('MODES_UNDECLARED');
  if (selected.inputModes.some(mode => !inputModes.includes(mode))) fail('INPUT_MODE_NOT_DECLARED');
  if (selected.outputModes.some(mode => !outputModes.includes(mode))) fail('OUTPUT_MODE_NOT_DECLARED');
  const routeModes = resource.route.execute?.params?.configuration?.acceptedOutputModes;
  if (!Array.isArray(routeModes) || selected.outputModes.some(mode => !routeModes.includes(mode))) fail('OUTPUT_MODE_NOT_ROUTABLE');

  canonical(input, 'INPUT_INVALID');
  if (!exact(input, ['parts'])) fail('INPUT_INVALID');
  try { validateA2AParts(input.parts); } catch { fail('INPUT_INVALID'); }
  for (const part of input.parts) {
    const mode = Object.hasOwn(part, 'text') ? 'text/plain' : Object.hasOwn(part, 'data') ? 'application/json' : null;
    if (!mode) fail('FILE_INPUT_UNSUPPORTED');
    if (!selected.inputModes.includes(mode) || Object.hasOwn(part, 'mediaType') && part.mediaType !== mode)
      fail('PART_MODE_MISMATCH');
  }
  // acceptedPartKinds are alternatives. Require every selected output to be an
  // allowed kind, and JSON whenever a data predicate must be evaluated. The
  // output evaluator separately restricts actual parts to selectedOutputModes.
  canonical(outputRequirement, 'OUTPUT_REQUIREMENT_INVALID');
  const kinds = outputRequirement?.acceptedPartKinds;
  if (!Array.isArray(kinds) || !kinds.length || new Set(kinds).size !== kinds.length
    || kinds.some(kind => !['text', 'data', 'file'].includes(kind))
    || selected.outputModes.some(mode => !kinds.includes(mode === 'text/plain' ? 'text' : 'data'))
    || Object.hasOwn(outputRequirement, 'dataValidation') && !selected.outputModes.includes('application/json'))
    fail('OUTPUT_REQUIREMENT_MISMATCH');

  // No input bytes/hash here: a frozen skill contract remains stable after
  // legitimate predecessor output materialization. The caller binds inputHash
  // separately and reruns this same check on the actual input before dispatch.
  return {
    schema: A2A_SELECTED_SKILL_CONTRACT_SCHEMA, ...selected,
    agentCardHash: discovery.agentCardHash, sourceHash: discovery.sourceHash,
    skillHash: digest({ skill, inputModes, outputModes }), discoveryHash: digest(discovery),
    skillSelectionHash: digest(selected), semanticSuitabilityProven: false,
    supplierAcceptanceProven: false, inputConsumptionProven: false,
  };
}
