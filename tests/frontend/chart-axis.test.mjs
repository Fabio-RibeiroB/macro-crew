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
