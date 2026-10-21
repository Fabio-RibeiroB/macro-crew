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
  timeoutMs = 15_000,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  let active = null;
  let disposed = false;
  const refresh = async () => {
    if (disposed) return;
    active?.cancel();
    const run = {
      controller: new AbortController(),
      cancel: null,
      timer: null,
    };
    active = run;
    const stopped = new Promise((_, reject) => {
      run.cancel = () => {
        run.controller.abort();
        reject({ kind: "cancelled" });
      };
      run.timer = setTimer(() => {
        run.timedOut = true;
        run.controller.abort();
        reject({ kind: "timeout" });
      }, timeoutMs);
    });
    onStart();
    try {
      // A race also releases a hung loader that ignores AbortSignal.
      const next = await Promise.race([
        Promise.resolve().then(() => load(run.controller.signal)),
        stopped,
      ]);
      if (!disposed && active === run) onData(next);
    } catch (error) {
      if (!disposed && active === run)
        onError(refreshMessage(run.timedOut ? { kind: "timeout" } : error));
    } finally {
      clearTimer(run.timer);
      if (!disposed && active === run) {
        active = null;
        onSettled();
      }
    }
  };
  return {
    refresh,
    cancel() {
      const run = active;
      active = null;
      run?.cancel();
      if (run) clearTimer(run.timer);
      if (run && !disposed) onSettled();
    },
    dispose() {
      disposed = true;
      active?.cancel();
      if (active) clearTimer(active.timer);
      active = null;
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
