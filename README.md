# FinStats — The UK economy, explained

[FinStats](https://finstats.fabio.org.uk/) helps UK residents understand prices,
interest rates and economic growth through official figures, useful charts and
plain-English context. React/Vite serves a static website; visitors cannot start
AI jobs. The project is migrating its legacy AI research into a separate,
evidence-grounded explanation engine.

## How it works today

```text
ONS and Bank of England structured downloads
    → deterministic parsers and validation (src/finstats)
    → private SQLite observations, source evidence and revision vintages
    → immutable public JSON generation + atomic current.json manifest
    → static React website verifies and displays the same figures in cards/charts

Private legacy AI cron → research_report.json → clearly labelled archived summaries
```

The verified metrics are **daily Bank Rate (IUDBEDR)**, **annual CPI inflation
(D7G7/MM23)** — the homepage and Prices headline, with **annual CPIH inflation
(L55O/MM23)** retained as clearly labelled supporting context — **nominal regular
pay growth (KAI9/LMS)** and its official **CPIH-adjusted counterpart (A2FA/LMS)**
for Great Britain, **UK unemployment aged 16+ (MGSX/LMS)**, **monthly
seasonally adjusted real GDP growth (ECYX/MGDP)**, and UK-wide PIPR annual private-rent
growth plus average monthly rent in pounds. Rent uses ONS Table 1's United Kingdom
row (K02000001); its latest two months are provisional and Northern Ireland inputs
are imputed for those months. Labour figures retain their
full three-month reference windows. UK House Price Index average price in pounds
and annual change are separate UK-national series from HM Land Registry's
Average price CSV. These describe integrated source coverage; the
[M2 acceptance record](docs/m2-acceptance.md) and [M3 rollout qualification](docs/m3-acceptance.md)
record point-in-time evidence, not deployment.
Reference period, official release date and FinStats check time are separate.
Missing figures remain unavailable. Failed collection preserves previously
verified data; failed AI never blocks statistical publication. Revision history
starts with locally collected evidence; it is not a reconstructed archive of all
historical official publication vintages.

The publisher runs every 30 minutes on the mini PC. Apache HTTPS serves a complete
release via `dist`, with `data` pointing to `/home/finstats/published-data`. Private
state is `/home/finstats/.local/state/finstats-shadow`. The daily legacy AI cron
remains separate. Repository paths and proposed templates are **not proof** of
installed server settings: see the [security audit](docs/security-audit.md).

## Frontend development

Node 20 and npm are used in CI. No API keys are required for frontend development.

```sh
npm ci --ignore-scripts
npm test
npm run build
npm run dev
```

The development URL is `http://127.0.0.1:8173`. A missing verified-data export shows
an explicit unavailable state; general guides still work. Never substitute
legacy AI numbers or fixtures for verified production figures.

Release builds accept only reviewed files in `public/` and check the actual output
directory for unexpected/private files. Runtime `public/data/` is deliberately
excluded from release inputs: move any local development export outside `public/`
before building. Deploy the approved external public-data directory after the
build, following [the cutover guide](docs/dashboard-cutover.md).

## Official-data development and tests

Python 3.10–3.13. The official-data package uses the standard library. Core tests
need only pytest and python-dotenv; no API credentials or CrewAI are necessary:

```sh
uv run --no-project --python 3.12 --with pytest==8.3.5 --with python-dotenv==1.1.0 \
  env PYTHONPATH=src python -m pytest \
  --ignore=tests/test_llm_config.py --ignore=tests/test_crew_integration.py
```

Replay recorded fixtures into private temporary state (output is labelled fixture
evidence and cannot be published as official data):

```sh
PYTHONPATH=src python -m finstats --data-dir /tmp/finstats-replay \
  --fixtures-dir tests/fixtures/official
```

A live manual collection uses the same command without `--fixtures-dir`. Public
delivery is `python -m finstats.delivery --state-dir PRIVATE --output-dir PUBLIC`;
read the deployment guide before using real paths. Never use a private directory
inside a repository, release, or served directory.

## Legacy AI development

The legacy dependency tree in `pyproject.toml` is separate from the official-data
runtime. Fresh installation is **not currently reproducible**: old transitive
constraints, including LanceDB, can fail resolution on current platforms. Do not
repair this by upgrading the running production environment in place. A tested
legacy runtime exists on the server, but carries dependency audit findings.
A clean, minimal collector virtualenv is proposed in the security PR.

`run_crew`, `train`, `replay`, `test` and `run_with_trigger` can incur API charges.
They require explicit `FINSTATS_AI_ENABLED=true` and use a private daily admission
ledger. `.env.dist` documents the controls. Keep API keys outside every served
path, never use `VITE_*` for secrets, and use a dedicated provider project with
model restrictions and enforced spending limits. Rate limits and attempt counts
are not dollar caps. See [the audit and checklist](docs/security-audit.md).

Full legacy tests also need CrewAI, OpenAI SDK and tools installed. Use dummy keys,
disabled telemetry and mocked network calls; `uv run test` is a **paid evaluation
command**, not pytest. CI runs the dependency-light suite, frontend tests and build;
full legacy compatibility tests are currently a separate offline check.

## Repository and operations

* `src/finstats/`: definitions, official parsers, revision store, collector and delivery.
* `src/app/`: React application, verified-data reader and chart component.
* `src/uk_macro_crew/`: legacy AI research, report validation/history and CLI.
* `scheduler.py`: daily legacy scheduling and archive copying; not the official publisher.
* `deploy/`: reviewable Apache/systemd templates, not automatic deployment.
* `tests/`: offline release fixtures, data integrity/failure tests and frontend tests.
* `research_report.json`, `history_report.json` and public copies: retained legacy
  artifacts for compatibility. They are not authoritative current indicators.

Development follows an agreed spec → implementation issues → focused PRs →
validation workflow. The [FinStats UK specification](docs/ui-data-improvements-spec.md)
is the canonical agreed scope; GitHub issues #23–#42 hold live progress and
blocking dependencies. Read both before starting a slice. Update the specification
when the owner changes scope, and link the affected issues; do not maintain a
second task checklist or leave an approved spec in a long-lived approval PR.
Existing `.kiro/specs/` documents concern earlier work and are not competing copies
of this specification.

Use `docs/adr/NNNN-short-name.md` when a settled decision is hard to reverse,
surprising without context and involves a real trade-off. Record context, decision
and consequences; number records sequentially and supersede decisions with a new
record. Routine copy and branding choices stay in the spec. An unresolved choice
stays an explicit issue dependency until decided; do not write it as an accepted
ADR. Commit documentation through reviewed PRs under the same merge rules as code.

Use short-lived branches and focused PRs against `main`. Do not force-push shared
history or remove branches with unique work. [The cleanup report](docs/repository-cleanup.md)
lists deletion candidates and remaining owner decisions. Nothing merges or deploys
from CI. Build a separate release, inspect it, retain rollback, then activate only
after review. Never build over the served `dist` directory.

Further reading: [methodology and architecture](docs/architecture-assessment.md),
[official data details](docs/official-data-foundation.md),
[deployment and rollback](docs/dashboard-cutover.md),
[release tracking](docs/releases.md),
[frontend development](FRONTEND.md), [agent instructions](AGENTS.md).
