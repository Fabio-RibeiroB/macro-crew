import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, readFileSync, lstatSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = new URL("../../", import.meta.url).pathname;
const RELEASE = join(ROOT, "deploy", "release.sh");
const PRUNE_MERGED = join(ROOT, "scripts", "prune-merged.sh");

const has = (cmd) => spawnSync(cmd, ["--version"], { encoding: "utf8" }).status === 0;
const skip = !(has("bash") && has("git")) && "bash and git are required";

function home() {
  const h = mkdtempSync(join(tmpdir(), "finstats-home-"));
  const rel = (n) => join(h, "releases", n);
  const bak = (n) => join(h, "backups", "macro-crew", n);
  for (const n of ["deploy-2026-11-10.1", "deploy-2026-11-17.2", "deploy-2026-11-17.10", "deploy-2026-11-18.1", "deploy-2026-11-18.2", "deploy-2026-11-18.3"]) {
    mkdirSync(rel(n), { recursive: true });
    writeFileSync(join(rel(n), "index.html"), "x");
  }
  for (const n of ["20261110T010101Z", "20261117T010101Z", "20261118T010101Z"]) {
    mkdirSync(bak(n), { recursive: true });
    writeFileSync(join(bak(n), "precommit.txt"), "abc");
  }
  // unexpected names must never be touched
  mkdirSync(rel("scratch"), { recursive: true });
  mkdirSync(rel("deploy-2026-11-18.1.old"), { recursive: true });
  mkdirSync(rel("deploy-2026-1-1.1"), { recursive: true });
  mkdirSync(bak("notes"), { recursive: true });
  writeFileSync(join(h, "releases", "deploy-2026-11-01.1"), "a file, not a directory");
  // out-of-scope trees
  mkdirSync(join(h, "published-data"), { recursive: true });
  writeFileSync(join(h, "published-data", "current.json"), "{}");
  mkdirSync(join(h, ".local", "state", "finstats-shadow"), { recursive: true });
  writeFileSync(join(h, ".local", "state", "finstats-shadow", "db"), "x");
  // live = 18.2 (not the newest), so previous (newest other) = 18.3
  mkdirSync(join(h, "public_html", "macro-crew"), { recursive: true });
  symlinkSync(rel("deploy-2026-11-18.2"), join(h, "public_html", "macro-crew", "dist"));
  return { h, rel, bak };
}

const run = (h, args) => spawnSync("bash", [RELEASE, ...args], { encoding: "utf8", env: { ...process.env, FINSTATS_HOME: h } });

test("prune-only keeps live, previous and newest backup and removes the rest", { skip }, () => {
  const { h, rel, bak } = home();
  try {
    const r = run(h, ["--prune-only"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /LIVE: .*deploy-2026-11-18\.2/);
    for (const n of ["deploy-2026-11-18.2", "deploy-2026-11-18.3"]) assert.ok(existsSync(rel(n)), n);
    for (const n of ["deploy-2026-11-10.1", "deploy-2026-11-17.2", "deploy-2026-11-17.10", "deploy-2026-11-18.1"]) assert.ok(!existsSync(rel(n)), n);
    assert.ok(existsSync(bak("20261118T010101Z")));
    assert.ok(!existsSync(bak("20261110T010101Z")) && !existsSync(bak("20261117T010101Z")));
    // never touched: non-matching names, files, published data, collector archive
    for (const p of [rel("scratch"), rel("deploy-2026-11-18.1.old"), rel("deploy-2026-1-1.1"), bak("notes"), join(h, "releases", "deploy-2026-11-01.1"),
      join(h, "published-data", "current.json"), join(h, ".local", "state", "finstats-shadow", "db")]) {
      assert.ok(existsSync(p), p);
    }
  } finally { rmSync(h, { recursive: true, force: true }); }
});

test("dry-run lists candidates and removes nothing", { skip }, () => {
  const { h, rel, bak } = home();
  try {
    const r = run(h, ["--prune-only", "--dry-run"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /would remove: .*deploy-2026-11-10\.1/);
    assert.match(r.stdout, /would remove: .*20261110T010101Z/);
    assert.doesNotMatch(r.stdout, /would remove: .*(deploy-2026-11-18\.[23]|20261118T010101Z|scratch|notes)/);
    assert.ok(existsSync(rel("deploy-2026-11-10.1")) && existsSync(bak("20261110T010101Z")));
  } finally { rmSync(h, { recursive: true, force: true }); }
});

test("a full deploy cannot be combined with --dry-run, and unknown options fail", { skip }, () => {
  const { h } = home();
  try {
    assert.equal(run(h, ["--dry-run"]).status, 2);
    assert.equal(run(h, ["--bogus"]).status, 2);
  } finally { rmSync(h, { recursive: true, force: true }); }
});

test("a release directory that is a symlink is never followed or deleted", { skip }, () => {
  const { h, rel } = home();
  const outside = mkdtempSync(join(tmpdir(), "finstats-outside-"));
  try {
    writeFileSync(join(outside, "precious.txt"), "keep");
    symlinkSync(outside, rel("deploy-2026-11-12.1"));
    const r = run(h, ["--prune-only"]);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(lstatSync(rel("deploy-2026-11-12.1")).isSymbolicLink());
    assert.ok(existsSync(join(outside, "precious.txt")));
  } finally { rmSync(h, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
});

test("a data symlink inside a removed release does not delete published data", { skip }, () => {
  const { h, rel } = home();
  try {
    symlinkSync(join(h, "published-data"), join(rel("deploy-2026-11-10.1"), "data"));
    assert.equal(run(h, ["--prune-only"]).status, 0);
    assert.ok(!existsSync(rel("deploy-2026-11-10.1")));
    assert.ok(existsSync(join(h, "published-data", "current.json")));
  } finally { rmSync(h, { recursive: true, force: true }); }
});

test("prune refuses to run when the live target cannot be resolved", { skip }, () => {
  const { h, rel } = home();
  try {
    rmSync(join(h, "public_html", "macro-crew", "dist"));
    const r = run(h, ["--prune-only"]);
    assert.notEqual(r.status, 0);
    assert.ok(existsSync(rel("deploy-2026-11-10.1")));
  } finally { rmSync(h, { recursive: true, force: true }); }
});

test("release names are the next free N for today; the disk guard blocks over-limit accounts", { skip }, () => {
  const h = mkdtempSync(join(tmpdir(), "finstats-home-"));
  try {
    const today = new Date().toLocaleDateString("sv");
    mkdirSync(join(h, "releases", `deploy-${today}.1`), { recursive: true });
    mkdirSync(join(h, "releases", `deploy-${today}.2`));
    const r = spawnSync("bash", ["-c", `source "${RELEASE}"; next_release_name`], { encoding: "utf8", env: { ...process.env, FINSTATS_HOME: h } });
    assert.equal(r.stdout.trim(), `deploy-${today}.3`);
    const g = spawnSync("bash", ["-c", `source "${RELEASE}"; check_disk_guard`], { encoding: "utf8", env: { ...process.env, FINSTATS_HOME: h, FINSTATS_MAX_USED_MB: "0" } });
    assert.notEqual(g.status, 0);
    assert.match(g.stderr, /guard/);
  } finally { rmSync(h, { recursive: true, force: true }); }
});

test("receipt is mode 0600 and holds no secrets", { skip }, () => {
  const { h } = home();
  try {
    const file = join(h, "receipt.json");
    const r = spawnSync("bash", ["-c", `source "${RELEASE}"; write_receipt "${file}" c1 c0 /r /prev /b 20261118T010101Z`], { encoding: "utf8", env: { ...process.env, FINSTATS_HOME: h } });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(lstatSync(file).mode & 0o777, 0o600);
    const body = JSON.parse(readFileSync(file, "utf8"));
    assert.equal(body.deployed_commit, "c1");
    assert.equal(body.previous_dist_target, "/prev");
  } finally { rmSync(h, { recursive: true, force: true }); }
});


function git(cwd, ...args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
}

function repo() {
  const base = mkdtempSync(join(tmpdir(), "finstats-prune-"));
  const origin = join(base, "origin.git");
  const work = join(base, "work");
  git(base, "init", "-q", "--bare", "-b", "main", origin);
  git(base, "clone", "-q", origin, work);
  git(work, "config", "user.email", "t@example.invalid");
  git(work, "config", "user.name", "t");
  git(work, "config", "commit.gpgsign", "false");
  writeFileSync(join(work, "a"), "1");
  git(work, "add", "a");
  git(work, "commit", "-q", "-m", "init");
  git(work, "push", "-q", "origin", "main");
  // merged branches
  git(work, "branch", "merged-a");
  git(work, "branch", "merged-open-pr");
  // unmerged branch
  git(work, "checkout", "-q", "-b", "unmerged");
  writeFileSync(join(work, "b"), "2");
  git(work, "add", "b");
  git(work, "commit", "-q", "-m", "unmerged work");
  git(work, "checkout", "-q", "main");
  // stub gh: only branch "merged-open-pr" has an open PR
  const bin = join(base, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "gh"), `#!/usr/bin/env bash
case "$*" in *"--head merged-open-pr"*) echo 1 ;; *) echo 0 ;; esac
`);
  chmodSync(join(bin, "gh"), 0o755);
  return { base, work, bin };
}

const branches = (work) => git(work, "for-each-ref", "--format=%(refname:short)", "refs/heads").trim().split("\n").sort();
const prune = (work, bin, args = []) =>
  spawnSync("bash", [PRUNE_MERGED, ...args], { cwd: work, encoding: "utf8", env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });

test("prune-merged dry run lists merged branches and deletes nothing", { skip }, () => {
  const { base, work, bin } = repo();
  try {
    const r = prune(work, bin);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /would delete merged-a/);
    assert.match(r.stdout, /kept \(merged-open-pr: open PR\)/);
    assert.match(r.stdout, /kept \(unmerged: not merged into origin\/main\)/);
    assert.doesNotMatch(r.stdout, /would delete (main|unmerged|merged-open-pr)\b/);
    assert.deepEqual(branches(work), ["main", "merged-a", "merged-open-pr", "unmerged"]);
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test("prune-merged --apply deletes only merged branches without open PRs", { skip }, () => {
  const { base, work, bin } = repo();
  try {
    const r = prune(work, bin, ["--apply"]);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(branches(work), ["main", "merged-open-pr", "unmerged"]);
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test("prune-merged keeps everything when gh is unavailable", { skip }, () => {
  const { base, work } = repo();
  try {
    // PATH with git/bash/coreutils but no gh
    const noGh = join(base, "nogh");
    mkdirSync(noGh);
    for (const tool of ["git", "bash", "sed", "cat", "dirname", "env"]) {
      const p = spawnSync("bash", ["-c", `command -v ${tool}`], { encoding: "utf8" }).stdout.trim();
      if (p) symlinkSync(p, join(noGh, tool));
    }
    const r = spawnSync(join(noGh, "bash"), [PRUNE_MERGED, "--apply"], { cwd: work, encoding: "utf8", env: { ...process.env, PATH: noGh } });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /gh unavailable/);
    assert.deepEqual(branches(work), ["main", "merged-a", "merged-open-pr", "unmerged"]);
  } finally { rmSync(base, { recursive: true, force: true }); }
});
