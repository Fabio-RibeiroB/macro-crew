# Agent instructions

FinStats is a static React website backed by private, deterministic official-data
collection. Read [README.md](README.md) for the project architecture and development
commands. For frontend changes, also follow [FRONTEND.md](FRONTEND.md), including its
refresh lifecycle contract. Read [docs/security-audit.md](docs/security-audit.md)
before changing deployment, AI execution or public output. The migration is
incomplete; do not revive the old AI-number pipeline as a fallback.

## Shared operating guidance

* Verified indicators live in `src/finstats`; each metric has a definition, source
  series, unit, comparison and reference period. Keep revisions and source evidence.
* The dashboard reads `data/current.json`, then a checksummed immutable generation.
  Cards and charts use the same snapshot. Missing values stay absent, never zero.
* `src/uk_macro_crew` and `scheduler.py` are the legacy AI/archive path. AI summaries
  are not numerical source data. CLI training/evaluation commands spend money.
* Keep credentials outside all web roots. Do not read, log, commit or package secret
  values. No secret may use a `VITE_` prefix. CI uses only dummy keys and mocks.
* Never add visitor-triggered jobs, arbitrary URL scraping, shell/file tools for an
  AI agent or a public development server. The static frontend has no backend API.
* Use `npm ci --ignore-scripts`, `npm test`, and `npm run build`; Vite dev binds to
  loopback on port 8173. Use the dependency-light Python test command in README.
  Full CrewAI tests need a compatible legacy runtime and must mock paid calls.
* Keep deterministic fixture replay labelled as fixtures. It must never be
  promoted to official production figures.
* Preserve generated production reports, private databases and source archives.
  A dirty production checkout can contain intentional generated JSON changes.
* Build outside the served directory, test data/assets/direct URLs and retain
  rollback. Templates do not apply themselves. The owner authorises the oversight
  agent to merge PRs within the approved specification after review and green
  required checks. Production deployment and paid-AI execution still require
  explicit authorisation.
* Prefer small PRs, minimal dependencies and meaningful tests of data integrity,
  failure recovery and navigation. No cosmetic rewrites or speculative frameworks.
* Before deleting branches, list candidates, check ancestry against freshly fetched
  main, open PRs, protections and worktree ownership. Keep uncertain/unmerged work.

## Owner orchestration preferences

* Oversight coordinates agents with concise, bounded briefs.
* Prefer economical, suitable DeepSeek Pro or Luna assignments; use Sol for
  oversight and complex integration.
* Never use fast or priority speed settings; use standard only.
* Select reasoning explicitly from each model's capabilities, and use only low,
  medium or max. If requested options are unsupported, report the mismatch.

Keep shared guidance here. README remains the architecture and development-command
source; FRONTEND remains the frontend lifecycle source. Avoid duplicating their
content here.
