const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/**
 * Ask one already-identified child/process-group to stop, then prove that it
 * actually closed.  The caller owns identity resolution; this helper never
 * scans the process table and therefore cannot signal an unrelated agent.
 */
export async function terminateChildProcessBounded({
  child,
  terminate,
  graceMs = 3_000,
  killGraceMs = Math.max(1_000, Number(graceMs) || 0),
} = {}) {
  if (!child || typeof terminate !== "function") {
    return { terminated: true, forced: false, alreadyClosed: true };
  }
  const isClosed = () => child.exitCode != null || child.signalCode != null;
  if (isClosed()) return { terminated: true, forced: false, alreadyClosed: true };

  let closed = false;
  const observedClose = new Promise((resolve) => child.once("close", () => {
    closed = true;
    resolve(true);
  }));
  terminate("SIGTERM");
  await Promise.race([observedClose, delay(Math.max(0, Number(graceMs) || 0)).then(() => false)]);
  if (closed || isClosed()) {
    return { terminated: true, forced: false, alreadyClosed: false };
  }

  terminate("SIGKILL");
  await Promise.race([observedClose,
    delay(Math.max(0, Number(killGraceMs) || 0)).then(() => false)]);
  return { terminated: closed || isClosed(), forced: true, alreadyClosed: false };
}
