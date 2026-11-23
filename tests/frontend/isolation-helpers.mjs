import assert from "node:assert/strict";
// Not a test file. Shared assertions for single-metric isolation.
/**
 * Assert the parsed generation differs from `pristine` only by isolated metrics:
 * every other metric is identical, and at least one metric was isolated.
 * Returns the isolated keys.
 */
export function assertOnlyIsolated(pristine, parsed) {
  const isolated = [];
  for (const key of Object.keys(pristine.metrics)) {
    const metric = parsed.metrics[key];
    if (metric?.verification_rejected === true) {
      assert.equal(metric.validation_status, "unavailable", key);
      assert.equal(metric.latest, null, key);
      assert.deepEqual(metric.history, [], key);
      isolated.push(key);
    } else assert.deepEqual(metric, pristine.metrics[key], `${key} must be untouched`);
  }
  assert.ok(isolated.length >= 1, "a failing metric must be isolated");
  return isolated;
}
