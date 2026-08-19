/*
 * SEAM 1 — from what the supervisor CAPTURES to what the engine EATS.
 *
 * A wrapped run produces an Experience record (outsider/experience/v1). The
 * flywheel eats feed lines ({instanceId, resolved, way, verbSequence…}). Between
 * them sit two honesty rules this adapter enforces rather than papers over:
 *
 *   1. SELF-REPORTED NEVER TRAINS. An Experience carries the agent's CLAIM of
 *      success (claimedPass), not a verified outcome. Feeding claims into the
 *      router would train it on exactly the lies the whole system exists to
 *      catch. A record trains only if it carries `verified: {resolved, by}` —
 *      an outcome someone other than the agent established (a test runner, a
 *      human check, an adjudicator). Everything else is refused BY NAME.
 *
 *   2. NOTHING IS INVENTED. A record without a task identity cannot join
 *      within-instance training pairs; it is refused, not assigned a fake task.
 */

export function verbOf(action) {
  const first = String(action ?? "").trim().split(/\s+/)[0] ?? "";
  const base = first.split("/").pop().toLowerCase();
  return base.replace(/^[^a-z0-9_.-]+/, "") || "other";
}

/* derive the engine's trajectory fields from the supervisor's step records */
export function trajectoryFromSteps(stepsDetail = []) {
  const verbSequence = [];
  const returnCodes = {};
  for (const s of stepsDetail) {
    verbSequence.push(verbOf(s.action));
    if (s.exit != null) returnCodes[String(s.exit)] = (returnCodes[String(s.exit)] ?? 0) + 1;
  }
  return { verbSequence, returnCodes, steps: stepsDetail.length };
}

export function experienceToFeedLine(rec) {
  if (rec?.schema === "outsider/supervised-experience/v2") {
    try { rec = supervisedExperienceModelInput(rec); }
    catch (error) { return { ok: false, reason: String(error?.message ?? error) }; }
  }
  if (!rec || rec.schema !== "outsider/experience/v1") {
    return { ok: false, reason: "not an outsider/experience/v1 record" };
  }
  const way = rec.executor?.id ?? rec.executor?.name ?? null;
  if (!way) return { ok: false, reason: "no executor identity (way)" };
  const instanceId = rec.taskId ?? rec.claim?.id ?? rec.claim?.taskId ?? rec.claim?.task ?? null;
  if (!instanceId) return { ok: false, reason: "no task identity — cannot form within-instance pairs" };
  if (typeof rec.verified?.resolved !== "boolean") {
    return {
      ok: false,
      reason: "SELF_REPORTED_NEVER_TRAINS: no verified outcome. claimedPass is the agent's claim; "
        + "add verified:{resolved,by} from a test runner, adjudicator, or human check",
    };
  }
  const t = rec.trajectory ?? {};
  return {
    ok: true,
    line: {
      instanceId: String(instanceId), way: String(way),
      resolved: rec.verified.resolved,
      verifiedBy: rec.verified.by ?? "unstated",
      verbSequence: Array.isArray(t.verbSequence) ? t.verbSequence : [],
      returnCodes: t.returnCodes ?? {},
      steps: t.steps ?? rec.features?.nSteps ?? 0,
    },
  };
}

export function adaptExperienceLines(records) {
  const lines = [], refused = [];
  records.forEach((r, i) => {
    const out = experienceToFeedLine(r);
    if (out.ok) lines.push(out.line);
    else refused.push({ index: i, reason: out.reason });
  });
  return { lines, refused };
}
import { supervisedExperienceModelInput } from "./outsider-supervised-experience.js";
