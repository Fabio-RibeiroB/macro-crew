import test from "node:test";
import assert from "node:assert/strict";
import { simplifyForChart } from "../../src/app/data/chartRange.mjs";

const day = (i) => new Date(Date.UTC(1975, 0, 1) + i * 864e5).toISOString().slice(0, 10);

test("short series are drawn unchanged", () => {
  const pts = [{ date: "2020-01", value: 1 }, { date: "2020-02", value: null }];
  assert.equal(simplifyForChart(pts), pts);
});

test("a long step series keeps every change, gap and both ends", () => {
  const pts = Array.from({ length: 13000 }, (_, i) => ({ date: day(i), value: i < 5000 ? 5 : i < 9000 ? 3.75 : 4 }));
  pts[7000] = { date: day(7000), value: null };
  const out = simplifyForChart(pts);
  assert.ok(out.length < 50, `${out.length} points`);
  assert.equal(out[0], pts[0]);
  assert.equal(out.at(-1), pts.at(-1));
  for (const i of [4999, 5000, 6999, 7000, 7001, 8999, 9000]) assert.ok(out.includes(pts[i]), `missing ${i}`);
  assert.ok(out.every((p) => p.value !== 0), "no gap becomes zero");
});

test("a long noisy series is capped but keeps gaps and their neighbours", () => {
  const pts = Array.from({ length: 6800 }, (_, i) => ({ date: day(i), value: Math.sin(i) }));
  pts[3000] = { date: day(3000), value: null };
  const out = simplifyForChart(pts);
  assert.ok(out.length <= 1600, `${out.length} points`);
  for (const i of [0, 2999, 3000, 3001, 6799]) assert.ok(out.includes(pts[i]), `missing ${i}`);
});

test("a long exact-values table is only built when opened; the chart has an accessible name", async () => {
  const { createServer } = await import("vite");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
  try {
    const { HistoricalTrendCard } = await server.ssrLoadModule("/src/app/components/HistoricalTrendCard.tsx");
    const today = new Date();
    const data = Array.from({ length: 1500 }, (_, i) => {
      const d = new Date(today.getTime() - (1499 - i) * 864e5).toISOString().slice(0, 10);
      return { date: d, period: d, value: 4 };
    });
    const html = renderToStaticMarkup(createElement(HistoricalTrendCard, { title: "Bank Rate", label: "Bank Rate", data }));
    assert.match(html, /Exact values \(\d+\)/);
    assert.doesNotMatch(html, /<tbody>/);
    assert.match(html, /role="img" aria-label="Bank Rate: line chart of \d+ readings, latest 4/);
  } finally { await server.close(); }
});
