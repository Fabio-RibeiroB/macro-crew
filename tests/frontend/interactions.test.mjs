import test from "node:test";
import assert from "node:assert/strict";
import {
  createRefreshController,
  bindRefreshLifecycle,
  refreshMessage,
} from "../../src/app/data/refresh.mjs";
import {
  bindPageNavigation,
  bindMenuDismissal,
} from "../../src/app/data/interactions.mjs";
import { loadVerified, reportLabel } from "../../src/app/data/verified.mjs";

function clock() {
  let sequence = 0;
  const jobs = new Map();
  return {
    setTimer(fn) {
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
    get size() {
      return jobs.size;
    },
  };
}
const tick = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
function harness() {
  const calls = [],
    published = [],
    errors = [],
    states = [];
  const time = clock();
  const owner = createRefreshController({
    load(signal) {
      return new Promise((resolve, reject) =>
        calls.push({ signal, resolve, reject }),
      );
    },
    onStart() {
      states.push("loading");
    },
    onSettled() {
      states.push("settled");
    },
    onData(value) {
      published.push(value);
    },
    onError(value) {
      errors.push(value);
    },
    setTimer: (fn) => time.setTimer(fn),
    clearTimer: (id) => time.clearTimer(id),
    strict: true,
  });
  return { owner, calls, published, errors, states, time };
}

test("overlapping manual/timer refreshes abort older requests and ignore late results", async () => {
  const h = harness();
  const older = h.owner.refresh();
  await tick();
  const newer = h.owner.refresh();
  await tick();
  assert.equal(h.calls[0].signal.aborted, true);
  h.calls[1].resolve("new generation");
  await newer;
  h.calls[0].resolve("old generation");
  await older;
  assert.deepEqual(h.published, ["new generation"]);
  assert.deepEqual(h.errors, []);
  assert.deepEqual(h.states, ["loading", "loading", "settled"]);
  assert.equal(h.time.size, 0);
  h.owner.dispose();
});

test("disposal aborts pending work and prevents data/error/loading updates after unmount", async () => {
  const h = harness();
  const pending = h.owner.refresh();
  await tick();
  h.owner.dispose();
  assert.equal(h.calls[0].signal.aborted, true);
  h.calls[0].resolve("late");
  await pending;
  assert.deepEqual(h.published, []);
  assert.deepEqual(h.errors, []);
  assert.deepEqual(h.states, ["loading"]);
  assert.equal(h.time.size, 0);
  await h.owner.refresh();
  assert.equal(h.calls.length, 1);
});

test("timeout settles even a loader that ignores abort, and a retry can succeed", async () => {
  const h = harness();
  const slow = h.owner.refresh();
  await tick();
  h.time.fire();
  await slow;
  assert.equal(h.calls[0].signal.aborted, true);
  assert.deepEqual(h.errors, [refreshMessage({ kind: "timeout" })]);
  assert.equal(h.states.at(-1), "settled");
  const retry = h.owner.refresh();
  await tick();
  h.calls[0].resolve("timed out");
  h.calls[1].resolve("retry");
  await retry;
  assert.deepEqual(h.published, ["retry"]);
  h.owner.dispose();
});

test("an abort-aware timeout still reports a timeout rather than a generic cancellation", async () => {
  const time = clock();
  const errors = [];
  const owner = createRefreshController({
    load: (signal) =>
      new Promise((_, reject) =>
        signal.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        ),
      ),
    onStart() {},
    onData() {
      assert.fail("timed out");
    },
    onSettled() {},
    onError: (value) => errors.push(value),
    setTimer: (fn) => time.setTimer(fn),
    clearTimer: (id) => time.clearTimer(id),
    strict: true,
  });
  const pending = owner.refresh();
  await tick();
  time.fire();
  await pending;
  assert.deepEqual(errors, [refreshMessage({ kind: "timeout" })]);
  owner.dispose();
});

class Browser extends EventTarget {
  constructor(url = "https://finstats.example/") {
    super();
    this.frames = clock();
    this.intervals = new Map();
    this.sequence = 0;
    this.replacements = [];
    this.setURL(url);
  }
  setURL(url) {
    this.location = new URL(url, this.location?.href);
    this.location.replace = (target) => this.replacements.push(target);
  }
  requestAnimationFrame(fn) {
    return this.frames.setTimer(fn);
  }
  cancelAnimationFrame(id) {
    this.frames.clearTimer(id);
  }
  setInterval(fn, ms) {
    this.intervals.set(++this.sequence, { fn, ms });
    return this.sequence;
  }
  clearInterval(id) {
    this.intervals.delete(id);
  }
}

test("pagehide cancels collection and polling; BFCache pageshow resumes; cleanup removes both", async () => {
  const win = new Browser();
  const h = harness();
  const cleanup = bindRefreshLifecycle(h.owner, win);
  await tick();
  assert.equal([...win.intervals.values()][0].ms, 300_000);
  [...win.intervals.values()][0].fn();
  await tick(); // Automatic refresh competes with initial load.
  assert.equal(h.calls[0].signal.aborted, true);
  win.dispatchEvent(new Event("pagehide"));
  await tick();
  assert.equal(h.calls[1].signal.aborted, true);
  assert.equal(win.intervals.size, 0);
  const restored = new Event("pageshow");
  restored.persisted = true;
  win.dispatchEvent(restored);
  await tick();
  assert.equal(win.intervals.size, 1);
  assert.equal(h.calls.length, 3);
  h.calls[2].resolve("restored");
  await tick();
  assert.deepEqual(h.published, ["restored"]);
  cleanup();
  win.dispatchEvent(restored);
  await tick();
  assert.equal(win.intervals.size, 0);
  assert.equal(h.calls.length, 3);
});

test("legacy links redirect on same-page hash changes, including mixed case, without losing query parameters", () => {
  const win = new Browser("https://finstats.example/?view=plain");
  const cleanup = bindPageNavigation(win, { getElementById() {} });
  win.setURL("https://finstats.example/?view=plain#Decisions");
  win.dispatchEvent(new Event("hashchange"));
  win.setURL("https://finstats.example/?view=plain#Sources");
  win.dispatchEvent(new Event("hashchange"));
  assert.deepEqual(win.replacements, [
    "/economy?view=plain#interest-rates",
    "/sources?view=plain",
  ]);
  cleanup();
  win.dispatchEvent(new Event("hashchange"));
  assert.equal(win.replacements.length, 2);
});

test("known trailing-slash pages canonicalise and unknown addresses are left alone", () => {
  const win = new Browser("https://finstats.example/prices/?x=1#trends");
  const cleanup = bindPageNavigation(win, {});
  assert.deepEqual(win.replacements, ["/prices?x=1#trends"]);
  cleanup();
  win.setURL("https://finstats.example/unknown/");
  bindPageNavigation(win, { getElementById() {} })();
  assert.equal(win.replacements.length, 1);
});

test("fragment scrolling follows navigation only, not slow data or reader scrolling; hash back/forward works", () => {
  const win = new Browser("https://finstats.example/economy#interest-rates");
  const targets = [];
  const cleanup = bindPageNavigation(win, {
    getElementById: (id) => ({ scrollIntoView: () => targets.push(id) }),
  });
  win.frames.fire();
  assert.deepEqual(targets, ["interest-rates"]);
  win.dispatchEvent(new Event("scroll"));
  win.dispatchEvent(new Event("data-loaded"));
  win.frames.fire();
  assert.deepEqual(targets, ["interest-rates"]);
  for (const hash of ["#publications", "#interest-rates", "#publications"]) {
    win.setURL(`https://finstats.example/economy${hash}`);
    win.dispatchEvent(new Event("hashchange"));
    win.frames.fire();
  }
  assert.deepEqual(targets, [
    "interest-rates",
    "publications",
    "interest-rates",
    "publications",
  ]);
  cleanup();
  win.dispatchEvent(new Event("hashchange"));
  win.frames.fire();
  assert.equal(targets.length, 4);
});

test("menu closes on Escape anywhere or an outside pointer, preserving inside clicks and removing listeners", () => {
  const doc = new EventTarget();
  const inside = {};
  let closed = 0,
    focused = 0;
  const cleanup = bindMenuDismissal(
    doc,
    { contains: (target) => target === inside },
    {
      focus() {
        focused++;
      },
    },
    () => closed++,
  );
  const inner = new Event("pointerdown");
  Object.defineProperty(inner, "target", { value: inside });
  doc.dispatchEvent(inner);
  assert.equal(closed, 0);
  doc.dispatchEvent(new Event("pointerdown"));
  assert.equal(closed, 1);
  const escape = new Event("keydown");
  escape.key = "Escape";
  doc.dispatchEvent(escape);
  assert.equal(closed, 2);
  assert.equal(focused, 1);
  cleanup();
  doc.dispatchEvent(escape);
  doc.dispatchEvent(new Event("pointerdown"));
  assert.equal(closed, 2);
});

for (const [kind, fetcher] of [
  ["missing", async () => ({ ok: false, status: 404 })],
  ["unavailable", async () => ({ ok: false, status: 503 })],
  [
    "network",
    async () => {
      throw new TypeError("private diagnostic");
    },
  ],
  [
    "invalid",
    async () => ({
      ok: true,
      json: async () => {
        throw new SyntaxError("private diagnostic");
      },
    }),
  ],
])
  test(`data loader identifies ${kind} errors without exposing raw diagnostics to visitors`, async () => {
    let caught;
    try {
      await loadVerified("/", fetcher);
    } catch (error) {
      caught = error;
    }
    assert.equal(caught?.kind, kind);
    assert.doesNotMatch(refreshMessage(caught), /private diagnostic/);
  });

test("the archive keeps policy reports distinct from MPC decisions and stability reports", () => {
  assert.equal(
    reportLabel({
      key: "monetary_policy_report",
      source:
        "https://www.bankofengland.co.uk/monetary-policy-report/2026/august-2026",
    }),
    "Monetary Policy Report commentary",
  );
  assert.equal(
    reportLabel({
      key: "monetary_policy_report",
      source:
        "https://www.bankofengland.co.uk/monetary-policy-summary-and-minutes/2026/september-2026",
    }),
    "MPC / monetary policy commentary",
  );
  assert.equal(
    reportLabel({
      key: "financial_stability_report",
      source: "https://www.bankofengland.co.uk/financial-stability-report/",
    }),
    "Financial stability commentary",
  );
});
