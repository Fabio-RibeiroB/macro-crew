# Security and reliability review — 21 October 2026

Scope: repository `main` at `1cdfa23`, deployed Apache configuration, file **metadata**,
service settings, listening sockets, dependency inventory and safe HTTP HEAD probes.
No API credentials, environment values, private keys or secret response bodies were
read, copied, printed or sent to an external service. No paid AI calls were made.
Repository and dependency checks are point-in-time checks, not a security guarantee.
This PR is for review: **no production settings have been changed**.

## Findings and priorities

| Priority | Finding / evidence | Status and action |
| --- | --- | --- |
| High | The origin HTTP vhost serves `/home/finstats/public_html`; HEAD `/macro-crew/.git/config` and `/macro-crew/pyproject.toml` return 200. HTTPS serves the static release correctly. | Confirmed origin source exposure. Whether the origin is reachable through the router/Cloudflare is unverified. Replace the HTTP vhost with fixed-host HTTPS redirect; review template in `deploy/apache/finstats-static.conf`. No secret content was fetched. Check historical access logs privately and rotate credentials if exposure is suspected. |
| High | Installed legacy Python environment: `pip-audit --no-deps --disable-pip` found 216 advisory entries across 27 packages. This counts advisories, not 216 distinct exploitable application flaws. Includes old CrewAI/tool and web-processing dependencies. | Confirmed vulnerable versions, exploitability not established. Do not blindly upgrade the live legacy environment. Provision the official collector in a dependency-free environment; proposed unit hides credentials and tightens privileges. Upgrade/replace the legacy AI dependency tree separately with full compatibility testing before continued unattended use. |
| Medium | Paid CLI jobs had no shared lock, persistent daily attempt ceiling or opt-in. Agent iteration/time/RPM limits exist, but RPM is not a spending cap. | This PR adds fail-closed admission, one attempt/day by default (UTC, max configurable 4), lock and private ledger. Failed/killed jobs consume attempts; corrupt state stops jobs. Applies to run, trigger, train, test and replay entry points. |
| Medium | Researcher used unrestricted `ScrapeWebsiteTool` with access to host networking. Retrieved text can instruct an agent to fetch internal URLs. | The capability is confirmed; no successful attack was demonstrated. Replaced with bounded direct HTTPS reads of four exact official hosts, no redirects/proxies/binary files. Search text remains untrusted; prompts are not a security boundary. |
| Medium | npm audit found 12 affected packages, including critical build-tool dependencies and high Vite advisories. The unused PM2 config proposed a public development server. | Compatible Vite/lockfile updates clear the npm audit; PM2 removal is in housekeeping. No Vite listener is currently exposed on 8173. Build tooling must never be served as production. |
| Medium | Vite copies everything in `public/`. No reviewed-file boundary or credential-shaped artifact check existed. | No credential found in tracked sources or current static files by a limited pattern scan. Added public allowlist, symlink rejection and artifact checks, including custom output directories. These cannot detect every form of secret; human review remains necessary. |
| Medium | Daily legacy cron runs as `finstats` without the publisher's systemd sandbox. That user owns source, releases and the API credential file. | Confirmed weaker isolation. Static site cannot start this job, but compromise of that user could read its secrets and alter the site. Move AI execution into a restricted service/user when replacing the legacy engine; do not claim existing OS-user isolation between AI and collector. |
| Medium | GitHub `main` has no branch protection; automatic branch deletion is off. | API verified. Recommend required CI/review and no force pushes; settings require owner approval. Existing Actions already have read-only contents, pinned actions and no deployed API secrets. |
| Operational | Publisher retries every 30 minutes, retains valid data and reports partial failures nonzero; no external alert or disk monitor is installed by this repository. | Confirmed. Frontend labels degraded/stale checks. Add an operator-visible failure notification and disk/backup checks; collection success alone is not an alert. |

## Verified boundaries

* HTTPS serves a complete React/Vite release plus explicitly public JSON. Frontend
  fetches are reads of static data and archived summaries. There is no backend HTTP
  application, visitor-triggered AI, upload API, chatbot or executable job endpoint.
  `/api` returns the SPA HTML fallback, **not** an API response.
* Public delivery copies whitelisted fields; raw downloads/SQLite stay outside web
  roots. The web-server user cannot read the private database. `finstats` has no
  supplementary administrative groups. The API file `/home/finstats/.env` is 0600;
  private statistics state is 0700. No container is used for FinStats.
* Publisher is a oneshot, non-root service with `NoNewPrivileges`, read-only home
  and system, two explicit writable directories, a timeout and private umask. It
  uses no OpenAI/Exa credentials and doesn't load dotenv. Its current virtualenv
  nevertheless shares the legacy dependency tree, addressed by the proposed unit.
* Static assets contain no source maps, Python source or private database. React
  escapes summary text; no `dangerouslySetInnerHTML` is used. Official links are
  validated. The checksum detects accidental generation mixing, not a malicious
  publisher or compromised origin able to change both payload and manifest.
* CI uses hosted runners, dummy API keys, offline tests, no deployment, no
  `pull_request_target`, read-only contents and checkout without persisted tokens.
  Existing core CI skips the two CrewAI-dependent suites; these were separately
  exercised offline against the installed runtime. No production secrets should
  be added to PR jobs or frontend `VITE_*` variables.

## Spending and low-funds monitoring

Use a dedicated OpenAI **project/service account** and a restricted inference key;
restrict allowed models and configure both alerts and an **enforced hard limit**.
Current official docs distinguish alerts (traffic continues) from enforced limits
(affected calls return 429). Enforcement can lag; this is not an exact penny cap.
Account settings were not accessed or verified. See [OpenAI spend controls](https://developers.openai.com/api/docs/guides/spend-limits).

Usage/cost reporting can support reconciliation, but must not be described as a
live prepaid-credit balance. No supported balance endpoint was established in
this review; don't scrape the billing UI or use undocumented endpoints. Verify
credit notifications, auto-recharge and recharge ceilings in the billing dashboard.
Use an operator-owned monitor if needed, not an organisation admin key in the AI
worker. Administrative keys have broader scope and the installed OpenAI SDK is
older than current Admin API support. See [OpenAI Admin APIs](https://developers.openai.com/api/docs/guides/admin-apis).

The local gate is an **attempt limit**, not a dollar/token accounting system. A
training invocation can contain multiple calls. SDK retries are disabled; output
is capped at 4096 tokens/call (configurable 1–8192) and call timeout at 60 seconds. Modern reasoning-capable models use
`max_completion_tokens` (including reasoning tokens); older models use `max_tokens`,
following the [Chat Completions reference](https://developers.openai.com/api/reference/python/resources/chat/subresources/completions/methods/create).
Agent limits remain relevant. Input tokens, tool costs and framework calls still
need reconciliation; direct Python use outside guarded CLI entry points can
bypass the gate. Provider model permissions and enforced spend limits remain
necessary. Do not enable automatic retries on exhausted credits/spend caps.

To enable only after review, set `FINSTATS_AI_ENABLED=true` in the private backend
configuration. State defaults to `~/.local/state/finstats-ai` (0700, ledger 0600).
Disable immediately by setting it false. Do not delete/reset ledgers to retry a
failed job routinely. Statistics publishing continues without AI or credits.

## Practical deployment checklist (not applied)

1. Back up Apache config and run `apache2ctl configtest` before reload. Review the
   static vhost template, retain the real certificate/ACME renewal setup and test
   HTTPS home, assets, data, direct routes and JSON cache headers. HTTP must only
   redirect to fixed HTTPS or serve ACME challenge files. Dotfiles/source/private
   paths must be denied; no CGI/proxy aliases in the FinStats vhost. Check origin
   directly, IPv4/IPv6 and all configured host aliases, not just the CDN URL.
2. Prefer source/venvs outside `public_html`. Existing HTTPS uses a release symlink;
   keep target ownership matched, directory listing and execution disabled. Do not
   expose any source tree or the whole home directory through an HTTP alias.
3. Provision the proposed clean collector runtime **before** installing its unit:
   `uv venv --python 3.13 /home/finstats/.local/share/finstats-collector`, then
   `uv pip install --python /home/finstats/.local/share/finstats-collector/bin/python --no-deps .`
   from the reviewed source. Only the stdlib `finstats` module is used; install no
   CrewAI dependencies. Confirm `python -m finstats.delivery --help`, run fixture
   tests and a manual successful collection/delivery before enabling its timer.
   Review `InaccessiblePaths`, writable paths and resource limits for this host.
4. Keep keys outside all served trees, owner-only, dedicated to this project. Check
   backups/logs are equally private. Never print environment values, raw model
   traces or `.env` in troubleshooting. Rotate credentials if access is suspected;
   enable GitHub secret scanning/push protection where available. The limited
   pattern scan does not establish that all git history is free of secrets.
5. Router/provider review: verify public forwarding and IPv6 rules; restrict the
   origin to intended ingress, verify TLS and CDN origin protections. SSH, DNS,
   mail and hosting-admin listeners exist on this multi-service machine; public
   reachability, authentication and other tenants were **not** audited. Restrict
   administrative ports to VPN/LAN as appropriate without breaking other services.
   Check OS patch support and unattended security updates. No firewall/router
   changes are made by this PR.
6. Prompt injection: no shell/code/file-read tools for AI. Treat even official text
   as untrusted, bound input size, reject off-host links/redirects, and validate
   output before publication. Official host allowlisting still trusts DNS/TLS and
   that site's content; the reader is not an OS sandbox. Exa search results are
   still third-party text. Future release summaries should receive prefetched
   evidence without network tools and must never change numerical statistics.
7. Verify provider project permissions, model allowlist, enforced hard limit,
   spend-alert recipients, credits/auto-recharge and failed-payment handling. Do a
   manual low-funds/disabled-AI simulation without paid calls; confirm statistics
   still update and commentary clearly remains unavailable/older.
8. Check failed systemd runs, stale public manifest and disk space daily; configure
   a notification channel. Rotate private logs, retain source evidence, back up
   SQLite with its backup API, and rehearse restore and frontend rollback. Monitor
   the next real scheduled run and certificate renewal. This PR does not install
   paid monitoring or send messages to anyone.

## Reproduction

`npm ci --ignore-scripts && npm audit && npm test && npm run build`.
The Vite build plugin checks both input and the **actual** output directory even
when `--outDir` is used. Do not put runtime `data/` under `public/` for release
builds: deploy the reviewed external JSON directory after building, as documented
in `dashboard-cutover.md`. No private payload should be copied into public assets.

For Python inventory, extract only installed distribution names/versions, then run
`pip-audit --no-deps --disable-pip -r INVENTORY`. Do not upload an environment file
or logs to scanners. Advisory presence alone does not prove exploitability; do
not perform uncontrolled upgrades of the legacy AI tree on the live host.
