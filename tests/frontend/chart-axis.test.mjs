import test from "node:test";
import assert from "node:assert/strict";
import { chartYDomain } from "../../src/app/data/chartRange.mjs";

test("axis does not dip below zero for a series that never went negative", () => {
  const [yMin, yMax] = chartYDomain([0.1, 4, 17]);
  assert.equal(yMin, 0);
  assert.ok(yMax >= 17);
});

test("axis keeps headroom below zero when the series is negative", () => {
  const [yMin] = chartYDomain([-0.5, 0.2, 1]);
  assert.ok(yMin < -0.5);
});

test("flat series still gets a visible range", () => {
  const [yMin, yMax] = chartYDomain([4, 4, 4]);
  assert.ok(yMin < 4 && yMax > 4);
});

import { chartYAxis } from "../../src/app/data/chartRange.mjs";

const readable = (step) => {
  const m = step / 10 ** Math.floor(Math.log10(step));
  return [1, 2, 2.5, 5].some((x) => Math.abs(x - m) < 1e-9);
};

function assertNiceAxis(values, { startsAtZero = false } = {}) {
  const { domain, ticks } = chartYAxis(values);
  assert.ok(ticks.length >= 3 && ticks.length <= 6, `tick count ${ticks.length}`);
  assert.deepEqual(domain, [ticks[0], ticks[ticks.length - 1]]);
  const step = ticks[1] - ticks[0];
  assert.ok(readable(Number(step.toPrecision(10))), `step ${step}`);
  ticks.forEach((t, i) => i && assert.ok(Math.abs(t - ticks[i - 1] - step) < 1e-6 * step));
  assert.ok(domain[0] <= Math.min(...values) && domain[1] >= Math.max(...values));
  ticks.forEach((t) => assert.equal(t, Number(t.toFixed(6)), `tick ${t} not clean`));
  if (startsAtZero) assert.equal(domain[0], 0);
  return { domain, ticks };
}

test("house prices get round pound ticks", () => {
  const { ticks } = assertNiceAxis([231476.2, 262000, 289500]);
  ticks.forEach((t) => assert.equal(t % 5000, 0));
});

test("rents get round pound ticks", () => {
  const { ticks } = assertNiceAxis([1003.4, 1190, 1388.8]);
  ticks.forEach((t) => assert.equal(t % 50, 0));
});

test("percentages get round ticks", () => {
  const { ticks } = assertNiceAxis([0.2, 5, 10.8], { startsAtZero: true });
  ticks.forEach((t) => assert.equal(t % 0.5, 0));
});

test("Bank Rate 0 to 5.25 starts at 0 with readable steps", () => {
  const { domain, ticks } = assertNiceAxis([0, 0.1, 5.25], { startsAtZero: true });
  assert.ok(domain[1] >= 5.25);
  assert.equal(ticks[0], 0);
});

test("negative and mixed series keep headroom and clean ticks", () => {
  const neg = assertNiceAxis([-4.2, -1.1, -0.3]);
  assert.ok(neg.domain[1] >= -0.3);
  const mixed = assertNiceAxis([-0.5, 0.2, 1]);
  assert.ok(mixed.domain[0] < -0.5);
});

test("flat and empty input stay safe", () => {
  const flat = assertNiceAxis([4, 4, 4]);
  assert.ok(flat.domain[0] < 4 && flat.domain[1] > 4);
  const empty = chartYAxis([]);
  assert.ok(empty.ticks.length >= 2 && empty.domain[0] === 0);
});
