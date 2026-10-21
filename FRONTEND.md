# Frontend

React 18, Vite, Tailwind utilities, native CSS, Lucide icons and a lazily loaded
Recharts component. Branding, layout and light/dark themes live in
`src/styles/friendly.css`. The active entry point is `src/app/App.tsx`.

Use Node 20. Run `npm ci --ignore-scripts`, `npm test`, `npm run build`, then
`npm run dev` for loopback-only development at `http://127.0.0.1:8173`.

The verified reader (`src/app/data/verified.mjs`) fetches `data/current.json` with
no-store semantics, validates the manifest, verifies the immutable payload's
SHA-256 and checks its statistical definitions. Never attach old AI numerical
context to new verified values. The legacy report file supplies only the labelled
summary archive, independently of statistics loading.

Without a public official-data export the UI must show an unavailable state and
keep explanatory content usable. Recorded data belongs in tests, not a fabricated
live dashboard. When a refresh fails after successful loading, retain prior data
with a visible warning. Charts must preserve gaps and reference periods.

Static build inputs are allowlisted: no private config, runtime data, symlinks or
source maps. Local generated `public/data/` must be moved out before a release
build. Release deployment adds the approved external data link afterward; see
[deployment and rollback](docs/dashboard-cutover.md). Apache's SPA fallback must
serve the frontend for direct application URLs; data must remain actual JSON.

Keep the homepage concise and navigation in plain English. Reuse metric/chart and
summary components; do not invent statistical coverage or generate policy claims
from generic explanatory text. Verify desktop/mobile, keyboard focus, theme,
loading, missing data, failed refresh, charts and source details before approval.
