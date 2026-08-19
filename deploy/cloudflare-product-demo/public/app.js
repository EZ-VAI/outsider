const REQUIRED_HASH = /^sha256:[a-f0-9]{64}$/;
const STEP_DELAY_MS = 1180;

const elements = {
  play: document.querySelector("#play"),
  reset: document.querySelector("#reset"),
  status: document.querySelector("#run-status"),
  worker: document.querySelector("#worker-state"),
  controller: document.querySelector("#controller-state"),
  evidence: document.querySelector("#evidence-state"),
  sequence: document.querySelector("#event-seq"),
  type: document.querySelector("#event-type"),
  title: document.querySelector("#event-title"),
  detail: document.querySelector("#event-detail"),
  eventHash: document.querySelector("#event-hash"),
  timeline: document.querySelector("#timeline"),
  publicHash: document.querySelector("#public-hash"),
  chainHash: document.querySelector("#chain-hash"),
  fingerprint: document.querySelector("#fingerprint"),
  proofResult: document.querySelector("#proof-result"),
};

const stateColors = {
  neutral: "#a7b0ac",
  red: "#ff6b6b",
  amber: "#ffbf69",
  blue: "#6ab8ff",
  green: "#66f2a4",
};

let demo = null;
let cursor = -1;
let timer = null;
let playing = false;
let timelineButtons = [];

function canonicalizeStrict(value, active = new Set()) {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("canonical values must contain only finite numbers");
    return JSON.stringify(value);
  }
  if (["undefined", "function", "symbol", "bigint"].includes(typeof value)) {
    throw new TypeError(`unsupported canonical value type:${typeof value}`);
  }
  if (active.has(value)) throw new TypeError("cyclic canonical value");

  active.add(value);
  if (Array.isArray(value)) {
    const encoded = `[${value.map((item) => canonicalizeStrict(item, active)).join(",")}]`;
    active.delete(value);
    return encoded;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    active.delete(value);
    throw new TypeError("canonical values must be plain objects or arrays");
  }
  const encoded = `{${Object.keys(value).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalizeStrict(value[key], active)}`
  )).join(",")}}`;
  active.delete(value);
  return encoded;
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => (
    byte.toString(16).padStart(2, "0")
  )).join("")}`;
}

function verifyCausalWindow(timeline, requiredStages) {
  if (!Array.isArray(timeline) || !Array.isArray(requiredStages) || requiredStages.length === 0) {
    return false;
  }
  if (new Set(requiredStages).size !== requiredStages.length) return false;

  const start = timeline.findIndex((event) => event.type === requiredStages[0]);
  if (start < 0) return false;
  const lastType = requiredStages.at(-1);
  const endOffset = timeline.slice(start).findIndex((event) => event.type === lastType);
  if (endOffset < 0) return false;
  const end = start + endOffset;
  const requiredSet = new Set(requiredStages);
  const observed = timeline.slice(start, end + 1)
    .filter((event) => requiredSet.has(event.type));

  const typesAreExact = observed.length === requiredStages.length
    && observed.every((event, index) => event.type === requiredStages[index]);
  const sequenceIncreases = observed.every((event, index) => (
    Number.isSafeInteger(event.seq) && (index === 0 || observed[index - 1].seq < event.seq)
  ));
  const commitmentsLookBounded = timeline.every((event) => REQUIRED_HASH.test(event.eventHash));
  return typesAreExact && sequenceIncreases && commitmentsLookBounded;
}

function compactHash(hash) {
  if (!REQUIRED_HASH.test(hash)) return "invalid commitment";
  return `${hash.slice(0, 17)}…${hash.slice(-10)}`;
}

function setCode(element, value) {
  element.textContent = compactHash(value);
  element.title = value;
}

function setStatus(label, tone) {
  elements.status.textContent = label;
  elements.status.className = `status ${tone}`;
}

function setLaneState(event) {
  const type = event?.type;
  let worker = "Completion requested";
  let controller = "Waiting at boundary";
  let evidence = "Unresolved";

  if (event) {
    worker = "Completion withheld";
    controller = "Inspecting delivery state";
    evidence = "Red boundary recorded";
  }
  if (["boundary_paused", "supervisor_verdict", "correction_factual_audit"].includes(type)) {
    worker = "Paused at boundary";
    controller = type === "boundary_paused" ? "Boundary locked" : "Correction under audit";
    evidence = "Intervention chain open";
  }
  if (["correction_emitted", "correction_observed"].includes(type)) {
    worker = type === "correction_emitted" ? "Correction pending" : "Correction received";
    controller = "Audited authority delivered";
    evidence = "Delivery bound to worker";
  }
  if (type === "effect_observed") {
    worker = "Repair applied";
    controller = "Post-correction effect seen";
    evidence = "Causal effect committed";
  }
  if (type === "acceptance_finished" && event.state === "green") {
    worker = "Acceptance is green";
    controller = "Re-verifying outcome";
    evidence = "New fingerprint recorded";
  }
  if (type === "outcome_verdict") {
    worker = "Delivery verified";
    controller = "Independent audit passed";
    evidence = "Outcome proof complete";
  }
  if (["intervention_resolved", "run_finalized"].includes(type)) {
    worker = "Delivery complete";
    controller = "Intervention resolved";
    evidence = type === "run_finalized" ? "SAFE_DELIVERY sealed" : "Causal chain complete";
  }

  elements.worker.textContent = worker;
  elements.controller.textContent = controller;
  elements.evidence.textContent = evidence;

  const activeLane = type === "effect_observed" ? 0
    : ["acceptance_finished", "outcome_verdict", "intervention_resolved", "run_finalized"].includes(type) ? 2
      : event ? 1 : -1;
  document.querySelectorAll(".lane").forEach((lane, index) => {
    lane.classList.toggle("active", index === activeLane);
    lane.style.setProperty("--state-color", stateColors[event?.state] || stateColors.neutral);
  });
}

function setPlayLabel() {
  elements.play.textContent = playing ? "Pause replay" : cursor >= (demo?.timeline.length || 0) - 1
    ? "Replay intervention →" : cursor >= 0 ? "Continue replay →" : "Play the intervention →";
  elements.play.setAttribute("aria-pressed", String(playing));
}

function render(index, { announce = true } = {}) {
  if (!demo || index < 0 || index >= demo.timeline.length) return;
  cursor = index;
  const event = demo.timeline[index];
  const tone = event.state in stateColors ? event.state : "neutral";

  elements.sequence.textContent = String(event.seq);
  elements.type.textContent = event.type;
  elements.title.textContent = event.title;
  elements.detail.textContent = event.detail;
  elements.eventHash.textContent = compactHash(event.eventHash);
  elements.eventHash.title = event.eventHash;
  document.querySelector(".event-stage").style.setProperty("--state-color", stateColors[tone]);
  setLaneState(event);

  timelineButtons.forEach((button, buttonIndex) => {
    button.classList.toggle("complete", buttonIndex < index);
    button.classList.toggle("current", buttonIndex === index);
    button.setAttribute("aria-current", buttonIndex === index ? "step" : "false");
  });

  if (event.type === "run_finalized") setStatus("SAFE DELIVERY SEALED", "green");
  else if (tone === "red") setStatus("COMPLETION WITHHELD", "red");
  else if (tone === "green") setStatus("VERIFYING DELIVERY", "green");
  else if (tone === "blue") setStatus("EFFECT OBSERVED", "blue");
  else setStatus("INTERVENTION ACTIVE", "amber");

  if (announce) {
    elements.status.setAttribute("aria-label", `Replay step ${index + 1} of ${demo.timeline.length}: ${event.title}`);
  }
  setPlayLabel();
}

function stopPlayback() {
  if (timer !== null) window.clearTimeout(timer);
  timer = null;
  playing = false;
  setPlayLabel();
}

function scheduleNext() {
  if (!playing || !demo) return;
  if (cursor >= demo.timeline.length - 1) {
    stopPlayback();
    return;
  }
  timer = window.setTimeout(() => {
    render(cursor + 1);
    scheduleNext();
  }, STEP_DELAY_MS);
}

function togglePlayback() {
  if (!demo) return;
  if (playing) {
    stopPlayback();
    setStatus("REPLAY PAUSED", cursor >= 0 ? demo.timeline[cursor].state : "neutral");
    return;
  }
  if (cursor >= demo.timeline.length - 1) resetReplay();
  playing = true;
  setPlayLabel();
  if (cursor < 0) render(0);
  scheduleNext();
}

function resetReplay() {
  stopPlayback();
  cursor = -1;
  elements.sequence.textContent = "—";
  elements.type.textContent = "awaiting_start";
  elements.title.textContent = "Press play to inspect the proof chain.";
  elements.detail.textContent = "This page replays privacy-projected fields from a sealed Stage 0.5 run.";
  elements.eventHash.textContent = "sha256:—";
  elements.eventHash.removeAttribute("title");
  timelineButtons.forEach((button) => {
    button.classList.remove("complete", "current");
    button.setAttribute("aria-current", "false");
  });
  setLaneState(null);
  setStatus("READY TO REPLAY", "neutral");
  setPlayLabel();
}

function buildTimeline() {
  const fragment = document.createDocumentFragment();
  timelineButtons = demo.timeline.map((event, index) => {
    const button = document.createElement("button");
    const label = document.createElement("span");
    button.type = "button";
    button.className = "timeline-step";
    button.style.setProperty("--step-color", stateColors[event.state] || stateColors.neutral);
    button.setAttribute("aria-label", `Show step ${index + 1}: sequence ${event.seq}, ${event.title}`);
    button.setAttribute("aria-current", "false");
    label.textContent = String(event.seq);
    button.append(label);
    button.addEventListener("click", () => {
      stopPlayback();
      render(index);
    });
    fragment.append(button);
    return button;
  });
  elements.timeline.replaceChildren(fragment);
}

async function verifyProof() {
  const { publicEvidenceHash, ...publicEvidenceBody } = demo.publicEvidence;
  const computedHash = await sha256(canonicalizeStrict(publicEvidenceBody));
  const hashValid = computedHash === publicEvidenceHash;
  const stagesValid = verifyCausalWindow(demo.timeline, demo.requiredStages);
  const terminal = demo.publicEvidence.terminal;
  const terminalValid = terminal?.terminalClass === "SAFE_DELIVERY"
    && terminal.proofComplete === true
    && terminal.deliveryComplete === true
    && terminal.interventionRequired === true
    && terminal.interventionComplete === true;

  setCode(elements.publicHash, publicEvidenceHash);
  setCode(elements.chainHash, demo.publicEvidence.commitments.eventChainHash);
  setCode(elements.fingerprint, terminal.finalFingerprint);
  elements.proofResult.replaceChildren();

  if (hashValid && stagesValid && terminalValid) {
    elements.proofResult.className = "proof-result verified";
    elements.proofResult.textContent = "✓ VERIFIED LOCALLY · HASH MATCH · 9/9 CAUSAL STAGES · SAFE_DELIVERY";
    return;
  }

  const failures = [!hashValid && "hash mismatch", !stagesValid && "causal sequence invalid", !terminalValid && "terminal proof incomplete"]
    .filter(Boolean).join(" · ");
  elements.proofResult.className = "proof-result failed";
  elements.proofResult.textContent = `✕ VERIFICATION FAILED · ${failures}`;
}

async function initialize() {
  elements.status.setAttribute("role", "status");
  elements.status.setAttribute("aria-live", "polite");
  elements.proofResult.setAttribute("role", "status");
  elements.proofResult.setAttribute("aria-live", "polite");
  elements.play.disabled = true;
  elements.reset.disabled = true;

  try {
    const response = await fetch("/demo-run.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`evidence request failed (${response.status})`);
    demo = await response.json();
    buildTimeline();
    await verifyProof();
    elements.play.disabled = false;
    elements.reset.disabled = false;
    resetReplay();
  } catch (error) {
    elements.proofResult.replaceChildren();
    elements.proofResult.className = "proof-result failed";
    elements.proofResult.textContent = `✕ PUBLIC EVIDENCE UNAVAILABLE · ${error.message}`;
    setStatus("EVIDENCE UNAVAILABLE", "red");
  }
}

elements.play.addEventListener("click", togglePlayback);
elements.reset.addEventListener("click", resetReplay);
initialize();
