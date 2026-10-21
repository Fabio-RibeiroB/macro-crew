import { applyRefreshEvent, refreshSnapshot } from "./refreshMachine.mjs";

export { refreshSnapshot, refreshView } from "./refreshMachine.mjs";

/** One refresh owner for the timer, button and page lifecycle. */
export function refreshMessage(error) {
  return (
    {
      timeout: "This check took too long. Please try again.",
      missing: "The latest data file is not available yet.",
      invalid:
        "The latest data did not pass our checks and has not been displayed.",
      network: "We couldn’t reach the latest data. Please try again.",
      unavailable:
        "The latest data is temporarily unavailable. Please try again.",
    }[error?.kind] || "We couldn’t check the latest figures. Please try again."
  );
}

export function createRefreshController({
  load,
  onStart,
  onData,
  onError,
  onSettled,
  onState,
  initialData = null,
  timeoutMs = 15_000,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  let snapshot = refreshSnapshot(initialData);
  let current = null;

  const apply = (event) => {
    const result = applyRefreshEvent(snapshot, event);
    if (result.accepted) snapshot = result.snapshot;
    return result;
  };
  const publish = (result) => {
    if (result.accepted) onState?.(result.snapshot);
    return result;
  };
  const finish = (run) => {
    if (current === run) current = null;
    clearTimer(run.timer);
  };
  const drop = (run, reason) => {
    run.superseded = reason === "supersede";
    run.settled = true;
    finish(run);
    run.controller.abort();
    run.cancelReject?.({ kind: reason });
  };

  const refresh = async () => {
    if (snapshot.status === "disposed") return;
    const previous = current;
    const started = apply({ type: "start" });
    if (!started.accepted) return;
    onStart?.();
    publish(started);
    if (previous) drop(previous, "supersede");

    let rejectStopped = () => {};
    const stopped = new Promise((_, reject) => {
      rejectStopped = reject;
    });
    const run = {
      generation: snapshot.generation,
      controller: new AbortController(),
      timer: null,
      settled: false,
      timedOut: false,
      superseded: false,
      cancelReject: (error) => rejectStopped(error),
    };
    run.timer = setTimer(() => {
      if (run.settled || current !== run) return;
      run.timedOut = true;
      run.controller.abort();
      rejectStopped({ kind: "timeout" });
    }, timeoutMs);
    current = run;

    try {
      // A race also releases a hung loader that ignores AbortSignal.
      const next = await Promise.race([
        Promise.resolve().then(() => load(run.controller.signal)),
        stopped,
      ]);
      if (run.settled || current !== run) return;
      run.settled = true;
      finish(run);
      const result = publish(
        apply({ type: "resolve", generation: run.generation, data: next }),
      );
      if (!result.accepted) return;
      onData?.(next);
      onSettled?.();
    } catch (error) {
      if (run.timedOut) {
        run.settled = true;
        finish(run);
        const result = publish(
          apply({
            type: "timeout",
            generation: run.generation,
            errorMessage: refreshMessage({ kind: "timeout" }),
          }),
        );
        if (!result.accepted) return;
        onError?.(result.snapshot.error);
        onSettled?.();
        return;
      }
      if (run.settled || run.superseded || snapshot.status === "disposed")
        return;
      run.settled = true;
      finish(run);
      const result = publish(
        apply({
          type: "reject",
          generation: run.generation,
          errorMessage: refreshMessage(error),
        }),
      );
      if (!result.accepted) return;
      onError?.(result.snapshot.error);
      onSettled?.();
    }
  };

  return {
    refresh,
    /** Leave `loading` before the request settles, including after pagehide. */
    cancel() {
      if (snapshot.status !== "loading") return;
      const run = current;
      if (run) drop(run, "cancel");
      const result = publish(apply({ type: "cancel" }));
      if (result.accepted) onSettled?.();
    },
    dispose() {
      if (snapshot.status === "disposed") return;
      const run = current;
      apply({ type: "dispose" });
      if (run) drop(run, "dispose");
    },
    get snapshot() {
      return snapshot;
    },
  };
}

/** Pause on pagehide, resume BFCache pages, and fully dispose on React unmount. */
export function bindRefreshLifecycle(owner, win, everyMs = 5 * 60_000) {
  const startTimer = () => win.setInterval(() => void owner.refresh(), everyMs);
  let timer = startTimer();
  void owner.refresh();
  const hide = () => {
    win.clearInterval(timer);
    owner.cancel();
  };
  const show = (event) => {
    if (event.persisted) {
      win.clearInterval(timer);
      timer = startTimer();
      void owner.refresh();
    }
  };
  win.addEventListener("pagehide", hide);
  win.addEventListener("pageshow", show);
  return () => {
    win.clearInterval(timer);
    win.removeEventListener("pagehide", hide);
    win.removeEventListener("pageshow", show);
    owner.dispose();
  };
}
