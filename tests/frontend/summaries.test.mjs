import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSummaries, summariesForSubject } from "../../src/app/data/summaries.mjs";
import { createRefreshController } from "../../src/app/data/refresh.mjs";

const repo = resolve(fileURLToPath(new URL("../..", import.meta.url)));

async function mockedWorkerData() {
  const root = await mkdtemp(join(tmpdir(), "finstats-summary-test-"));
  const script = fileURLToPath(new URL("../fixtures/summaries/mock-worker-producer.py", import.meta.url));
  const result = spawnSync("python3", [script, root], {
    cwd: repo,
    encoding: "utf8",
    env: { ...process.env, PYTHONPATH: resolve(repo, "src") },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const fetcher = async (url) => {
    const relative = url.replace(/^\/data\//, "");
    const bytes = await readFile(join(root, "data", relative));
    return { ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  };
  return loadSummaries("/", fetcher);
}

function currentMetrics() {
  return Object.fromEntries([
    ["cpi", { validation_status: "verified", definition: { unit: "percent", comparison: "year_on_year" }, latest: { period: "2026-08", value: "2.5" } }],
    ["unemployment", { validation_status: "verified", definition: { unit: "percent", comparison: "level" }, latest: { period: "2026-08", value: "4.8" } }],
  ]);
}

test("mocked worker output validates, matches current tuples and stays on its own subject", async () => {
  const data = await mockedWorkerData();
  const metrics = currentMetrics();
  assert.equal(data.summaries.length, 2);
  const prices = summariesForSubject(data, "prices", metrics);
  const jobs = summariesForSubject(data, "jobs-pay", metrics);
  assert.equal(prices.length, 2);
  assert.equal(jobs.length, 2);
  assert.equal(prices.find((claim) => claim.period === "2026-08").matchesCurrent, true);
  assert.equal(prices.find((claim) => claim.period === "2026-07").matchesCurrent, false);
  assert.equal(jobs.find((claim) => claim.period === "2026-08").matchesCurrent, true);
  assert.equal(jobs.find((claim) => claim.period === "2026-07").matchesCurrent, false);

  const pageData = JSON.parse(await readFile(join(repo, "tests/fixtures/verified/producer-pay-v1.json"), "utf8"));
  pageData.metrics.cpi.latest = { period: "2026-08", value: "2.5" };
  pageData.metrics.unemployment.latest = { period: "2026-08", value: "4.8" };

  const { createServer } = await import("vite");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
  try {
    const { default: App } = await server.ssrLoadModule("/src/app/App.tsx");
    const render = (pathname) => renderToStaticMarkup(createElement(App, { pathname, initialData: pageData, initialSummaries: data }));
    const pricesHtml = render("/prices");
    const jobsHtml = render("/jobs-pay");
    assert.match(pricesHtml, /Matches the current verified reading/);
    assert.match(pricesHtml, /Earlier release period · 2026-07/);
    assert.match(pricesHtml, /Cpi \(2026-08; year_on_year\): 2\.5 %/i);
    assert.doesNotMatch(pricesHtml, /Unemployment \(2026-08/);
    assert.match(jobsHtml, /Unemployment \(2026-08; level\): 4\.8 %/);
    assert.doesNotMatch(jobsHtml, /Cpi \(2026-08/);
    assert.match(pricesHtml, /https:\/\/www\.ons\.gov\.uk\/releases\/consumer-contract-test/);
    assert.doesNotMatch(pricesHtml, /checksum/i);

    const subjects = [
      ["/prices", "release-explanations-prices"],
      ["/housing", "release-explanations-housing"],
      ["/jobs-pay", "release-explanations-jobs-pay"],
      ["/economy", "release-explanations-economy"],
      ["/government-budget", "release-explanations-government"],
    ];
    for (const [path, heading] of subjects) assert.match(render(path), new RegExp(heading));
    assert.match(render("/government-budget"), /MPC decisions, Budget announcements and OBR forecasts are not covered/);
  } finally {
    await server.close();
  }
});

test("summary loader rejects traversal, oversized files and incompatible claim units", async () => {
  const data = await mockedWorkerData();
  const manifest = structuredClone(data.manifest);
  const entry = Object.values(manifest.summaries)[0];
  entry.version = "summary-versions/../../current.json";
  await assert.rejects(() => loadSummaries("/", async (url) => ({
    ok: true,
    arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(url.endsWith("summary-manifest.json") ? manifest : data.status)).buffer,
  })), /manifest/i);
  await assert.rejects(() => loadSummaries("/", async () => ({ ok: true, arrayBuffer: async () => new Uint8Array(65_537).buffer })), /limit/i);
  const incompatible = structuredClone(data);
  incompatible.summaries[0].version.summary.claims[0].unit = "GBP";
  const versionBytes = new TextEncoder().encode(JSON.stringify(incompatible.summaries[0].version));
  await assert.rejects(() => loadSummaries("/", async (url) => {
    const bytes = url.endsWith("summary-manifest.json") ? new TextEncoder().encode(JSON.stringify(incompatible.manifest))
      : url.endsWith("summary-status.json") ? new TextEncoder().encode(JSON.stringify(incompatible.status)) : versionBytes;
    return { ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  }), /summary version|claim/i);
});

test("summary refresh fails independently and retains its prior snapshot", async () => {
  const data = await mockedWorkerData();
  const states = [];
  const owner = createRefreshController({
    initialData: data, initialStatus: "success", load: async () => { throw new Error("offline"); },
    onState: (state) => states.push(state),
  });
  await owner.refresh();
  assert.equal(owner.snapshot.status, "error");
  assert.equal(owner.snapshot.data, data);
  assert.equal(states.at(-1).data, data);
});
