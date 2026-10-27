// Public example software, not Outsider's private planning/actuarial models.
// Dates and durations are declared inputs, never evidence of real fulfillment.
type Step = { id: string; minutes: number; dependsOn: string[] };
export function schedule(steps: Step[]) {
  if (!Array.isArray(steps) || steps.length < 1 || steps.length > 32) throw Error("STEPS_INVALID");
  const byId = new Map(steps.map(step => [step.id, step]));
  if (byId.size !== steps.length || steps.some(step => !/^[a-zA-Z0-9_-]+$/.test(step.id)
    || !Number.isFinite(step.minutes) || step.minutes <= 0 || step.minutes > 525600 || !Array.isArray(step.dependsOn))) throw Error("STEPS_INVALID");
  const result = new Map<string, { id: string; start: number; finish: number; path: string[] }>(), visiting = new Set<string>();
  function visit(id: string) {
    if (result.has(id)) return result.get(id)!;
    if (visiting.has(id)) throw Error("DEPENDENCY_CYCLE");
    const step = byId.get(id); if (!step) throw Error("DEPENDENCY_MISSING");
    visiting.add(id);
    const parents = step.dependsOn.map(visit).sort((a, b) => b.finish - a.finish || a.id.localeCompare(b.id));
    const start = parents[0]?.finish ?? 0;
    const value = { id, start, finish: start + step.minutes, path: [...(parents[0]?.path ?? []), id] };
    visiting.delete(id); result.set(id, value); return value;
  }
  const ordered = steps.map(step => visit(step.id));
  const last = [...ordered].sort((a, b) => b.finish - a.finish || a.id.localeCompare(b.id))[0];
  return { completionMinutes: last.finish, criticalPath: last.path,
    schedule: ordered.map(({ id, start, finish }) => ({ id, start, finish })) };
}
