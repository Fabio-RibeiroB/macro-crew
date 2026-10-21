import test from "node:test";
import assert from "node:assert/strict";
import { VerifiedDataError } from "../../src/app/data/verified.mjs";
import {
  REFRESH_EVENTS,
  REFRESH_STATUSES,
  REFRESH_TRANSITIONS,
  applyRefreshEvent,
  refreshView,
} from "../../src/app/data/refreshMachine.mjs";

/** Issue #17 contract, written here rather than read back from the implementation. */
const EXPECTED_TRANSITIONS = {
  idle: {
    start: "loading",
    resolve: null,
    reject: null,
    timeout: null,
    cancel: null,
    dispose: "disposed",
  },
  loading: {
    start: "loading",
    resolve: "success",
    reject: "error",
    timeout: "error",
    cancel: "cancelled",
    dispose: "disposed",
  },
  success: {
    start: "loading",
    resolve: null,
    reject: null,
    timeout: null,
    cancel: null,
    dispose: "disposed",
  },
  error: {
    start: "loading",
    resolve: null,
    reject: null,
    timeout: null,
    cancel: null,
    dispose: "disposed",
  },
  cancelled: {
    start: "loading",
    resolve: null,
    reject: null,
    timeout: null,
    cancel: null,
    dispose: "disposed",
  },
  disposed: {
    start: null,
    resolve: null,
    reject: null,
    timeout: null,
    cancel: null,
    dispose: "disposed",
  },
};
import {
  bindRefreshLifecycle,
  createRefreshController,
  refreshMessage,
} from "../../src/app/data/refresh.mjs";

function sample(status) {
  return {
    status,
    data: status === "idle" ? null : { id: "previous" },
    error:
      status === "idle" || status === "success" ? "" : "Keep the last message",
    generation: 4,
  };
}

function eventFor(type) {
  if (type === "resolve") return { type, data: { id: "fresh" } };
  if (type === "reject" || type === "timeout")
    return { type, errorMessage: `${type} message` };
  return { type };
}

test("every transition cell matches the issue contract", () => {
  assert.deepEqual(REFRESH_TRANSITIONS, EXPECTED_TRANSITIONS);
  assert.deepEqual(REFRESH_STATUSES, Object.keys(EXPECTED_TRANSITIONS));
  assert.deepEqual(REFRESH_EVENTS, Object.keys(EXPECTED_TRANSITIONS.idle));
});

for (const [status, events] of Object.entries(EXPECTED_TRANSITIONS)) {
  for (const [type, expected] of Object.entries(events)) {
    test(`${status} + ${type} -> ${expected ?? "rejected"}`, () => {
      assert.equal(REFRESH_TRANSITIONS[status][type], expected);
      const before = sample(status);
      const event = eventFor(type);
      if (expected == null) {
        assert.throws(
          () => applyRefreshEvent(before, event, { strict: true }),
          { message: `Invalid refresh transition: ${status} + ${type}` },
        );
        const ignored = applyRefreshEvent(before, event);
        assert.equal(ignored.accepted, false);
        assert.equal(ignored.reason, "invalid");
        assert.equal(ignored.snapshot, before);
        assert.equal(refreshView(before).loading, status === "loading");
        return;
      }
      const result = applyRefreshEvent(before, event, { strict: true });
      assert.equal(result.accepted, true);
      assert.equal(result.reason, null);
      const next = result.snapshot;
      assert.equal(next.status, expected);
      assert.equal(refreshView(next).loading, expected === "loading");
      if (type === "resolve") {
        assert.deepEqual(next.data, event.data);
        assert.equal(next.error, "");
        assert.equal(next.generation, before.generation);
      } else if (type === "reject" || type === "timeout") {
        assert.equal(next.data, before.data);
        assert.equal(next.error, event.errorMessage);
        assert.equal(next.generation, before.generation);
      } else {
        assert.equal(next.data, before.data);
        assert.equal(next.error, before.error);
        assert.equal(next.generation, before.generation + 1);
      }
      assert.deepEqual(refreshView(next), {
        loading: expected === "loading",
        error: next.error,
        data: next.data,
      });
    });
  }
}

test("a late result for an older generation is ignored and does not throw", () => {
  const loading = applyRefreshEvent(sample("idle"), { type: "start" }, { strict: true })
    .snapshot;
  const cancelled = applyRefreshEvent(loading, { type: "cancel" }, { strict: true })
    .snapshot;
  const late = applyRefreshEvent(
    cancelled,
    {
      type: "resolve",
      generation: loading.generation,
      data: { id: "stale" },
    },
    { strict: true },
  );
  assert.equal(late.accepted, false);
  assert.equal(late.reason, "stale");
  assert.equal(late.snapshot, cancelled);
  assert.equal(refreshView(late.snapshot).loading, false);
  assert.equal(refreshView(late.snapshot).data, cancelled.data);
});

function clock() {
  let sequence = 0;
  const jobs = new Map();
  return {
    delays: [],
    setTimer(fn, delay) {
      this.delays.push(delay);
      jobs.set(++sequence, fn);
      return sequence;
    },
    clearTimer(id) {
      jobs.delete(id);
    },
    fire() {
      const pending = [...jobs.values()];
      jobs.clear();
      pending.forEach((fn) => fn());
    },
  };
}
const tick = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

test("the controller can start in the loading snapshot the page already shows", () => {
  const time = clock();
  const owner = createRefreshController({
    load: () => new Promise(() => {}),
    initialData: { id: "server" },
    initialStatus: "loading",
    strict: true,
    setTimer: (fn, delay) => time.setTimer(fn, delay),
    clearTimer: (id) => time.clearTimer(id),
  });
  assert.deepEqual(refreshView(owner.snapshot), {
    loading: true,
    error: "",
    data: { id: "server" },
  });
  owner.dispose();
});

test("the default deadline passed to the timer is 15 seconds", () => {
  const time = clock();
  const owner = createRefreshController({
    load: () => new Promise(() => {}),
    setTimer: (fn, delay) => time.setTimer(fn, delay),
    clearTimer: (id) => time.clearTimer(id),
    strict: true,
  });
  void owner.refresh();
  assert.deepEqual(time.delays, [15_000]);
  owner.dispose();
});

test("pagehide cancel clears the derived loading flag and ignores a late response", async () => {
  const views = [];
  const calls = [];
  const time = clock();
  const owner = createRefreshController({
    load: (signal) =>
      new Promise((resolve) => calls.push({ signal, resolve })),
    onState: (snapshot) => views.push(refreshView(snapshot)),
    setTimer: (fn, delay) => time.setTimer(fn, delay),
    clearTimer: (id) => time.clearTimer(id),
    strict: true,
  });
  const win = new EventTarget();
  win.setInterval = () => 1;
  win.clearInterval = () => {};
  const cleanup = bindRefreshLifecycle(owner, win);
  await tick();
  assert.equal(views.at(-1).loading, true);
  assert.equal(calls[0].signal.aborted, false);
  win.dispatchEvent(new Event("pagehide"));
  assert.equal(owner.snapshot.status, "cancelled");
  assert.equal(views.at(-1).loading, false);
  assert.equal(calls[0].signal.aborted, true);
  calls[0].resolve({ id: "late" });
  await tick();
  assert.equal(
    views.some((view) => view.data?.id === "late"),
    false,
  );
  assert.equal(owner.snapshot.status, "cancelled");
  cleanup();
  owner.cancel();
  owner.dispose();
});

test("a typed verification failure keeps the last figures and does not throw on a later cancel", async () => {
  const calls = [];
  const time = clock();
  const owner = createRefreshController({
    initialData: { id: "server" },
    load: (signal) =>
      new Promise((resolve, reject) => calls.push({ signal, resolve, reject })),
    setTimer: (fn, delay) => time.setTimer(fn, delay),
    clearTimer: (id) => time.clearTimer(id),
    strict: true,
  });
  const first = owner.refresh();
  await tick();
  calls[0].resolve({ id: "figures" });
  await first;
  assert.deepEqual(refreshView(owner.snapshot), {
    loading: false,
    error: "",
    data: { id: "figures" },
  });
  const second = owner.refresh();
  await tick();
  assert.equal(refreshView(owner.snapshot).loading, true);
  assert.deepEqual(refreshView(owner.snapshot).data, { id: "figures" });
  calls[1].reject(new VerifiedDataError("missing", "private diagnostic"));
  await second;
  const failed = refreshView(owner.snapshot);
  assert.equal(failed.loading, false);
  assert.deepEqual(failed.data, { id: "figures" });
  assert.equal(failed.error, refreshMessage({ kind: "missing" }));
  assert.doesNotMatch(failed.error, /private diagnostic/);
  owner.cancel();
  assert.deepEqual(refreshView(owner.snapshot), failed);
  owner.dispose();
  owner.dispose();
  await owner.refresh();
  assert.equal(calls.length, 2);
});
