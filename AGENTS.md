# AGENTS.md — Simulation App Guide for Agents

This document summarizes the work completed in this repository and provides guidance for future contributors (agents). Scope: entire repo.

## Project Overview
A Rust + WebAssembly + Canvas web app to explore a DNA-based predator–prey oscillator. The model follows the Supplementary Information (SI) S3 (Eq. 3, 4) of the source paper, expressed in physical parameters directly relatable to experiments. The app helps plan and interpret experiments, including the effect of amino-acid modification to the template DNA via the Modification Workbench (r_assoc / r_poly / r_nick mapping to effective k1 and b; the legacy mod_factor remains for backward compatibility only).

## Repository Layout
- `crate/` — Rust WASM crate
  - `src/lib.rs`
    - `simulate(...)` — legacy nondimensional ODE (kept for compatibility)
    - `simulate_physical(...)` — physical-parameter ODE (SI S3 Eq. 3,4) with `mod_factor`
  - `Cargo.toml`, `Cargo.lock`
- `web/` — Static web app
  - `index.html` — redirects to `/simulator/` (simulator is the homepage)
  - `equation.png` — equation image used by the simulator page
  - `core.js` — WASM wrapper exposing `initWasm()` and `runSimulationPhysical(params)`
  - `modifications.js` — shared helpers for modification cards, storage, and effective parameter mapping
  - `simulator/` — Physical-Parameter Simulator (time series + phase plot)
    - `index.html`, `simulator.js`
  - `bifurcation/` — Parameter sweep and bifurcation plotting (P max/min)
    - `index.html`, `bifurcation.js`
  - `heatmap/` — 2D parameter heatmap (amplitude or period)
    - `index.html`, `heatmap.js`
  - `workbench/` — Modification Workbench UI (design, overlays, state management)
- `docs/plan.md` — Initial roadmap/design doc
- `.gitignore` — ignores build artifacts (`crate/target/`, `web/pkg/`)
- `netlify.toml`, `netlify-build.sh` — build config (wasm-pack) for deployment

## Implemented Features
- Physical ODE (Rust, WASM, JS)
  - `simulate_physical(pol, rec, G, k1, k2, k_n, k_p, b, km_p, N0, P0, mod_factor, t_end_min, dt_min)`
    - Implements SI S3 Eq. (3,4) with Runge–Kutta (fixed step)
    - UI computes effective `k1'` / `b'` via the workbench; `mod_factor` remains as a passthrough for historical data
    - Returns `[N_series..., P_series...]` (nM)
  - `web/core.js` exposes a reusable `runSimulationPhysical(params)` for all pages

- Pages and UI
  - Simulator (`/simulator/`)
    - Physical parameters sliders/inputs, time series and phase portrait
    - Explanation section (with `web/equation.png`)
    - Cross-page nav (Simulator, Bifurcation, Heatmap, Workbench)
    - Displays baseline plus active/overlay modification trajectories; time-series “Prey” is plotted as `400 − N` while the phase plot uses raw `N` vs `P`
  - Bifurcation (`/bifurcation/`)
    - Sweep one parameter across a range; after transients (tail window), compute `P` min/max and plot them
    - Supports baseline, active, and overlay modification series with per-series color coding
    - Preset: “Birth of oscillations (G sweep)” — reproduces SI Fig. S11-like behavior; accepts URL params (`preset`, `active`, `overlays`, core ranges) for deep links from the Workbench
  - Heatmap (`/heatmap/`)
    - Sweep two parameters over a grid; evaluate either amplitude (P max−min) or period (mean peak spacing)
    - Turbo colormap rendering with legend and a selector to toggle baseline/active/overlay grids and Δ vs baseline views
    - Presets (selectable or via `?preset=assoc_period|rec_amp`):
      - “Amino-acid modification (period)”: X=`G`, Y=`ΔΔG_assoc` (converted to `r_assoc`), metric=`period`
      - “Enzyme balance & stability (amplitude)”: X=`G`, Y=`rec`, metric=`amplitude`
  - Modification Workbench (`/workbench/`)
    - Manage modification cards (r_assoc / r_poly / r_nick, ΔΔG inputs, linker metadata)
    - Computes effective parameters, highlights dominant factors, and surfaces k₁′/b′/g′/β′ at all times (with g′·f_open when hairpin folding is enabled)
    - ΔΔG_assoc ↔ r_assoc inputs mirror each other with a 🔒 indicator on the driving field; conversions respect the configured temperature
    - Ratio inputs enforce 0.05–20 hard bounds (0.2–5 recommended) with inline warnings; a “Reset to SI defaults” button restores PP1 baselines
    - Hairpin correction displays the live opening probability `f_open` so downstream g-derived quantities stay transparent
    - Library actions can open `/bifurcation` or `/heatmap` preloaded via `?preset=…&active=…&overlays=…` for one-click comparisons
    - Fit pane auto-detects baseline windows, supports OLS/Huber loss, and reports r_assoc / r_nick consistency with traffic-light badges and recovery hints on failure

- Defaults and Presets (from SI Table S5, PP1 optimized / Fig.2 & S11)
  - Common base values used in pages and presets:
    - `pol=3.7`, `rec=32.5`, `G=150`, `k1=0.0020`, `k2=0.0031`, `kN=0.0210`, `kP=0.0047`, `b=0.000048`, `KmP=34`, `N0=10`, `P0=10`
    - Typical windows: `t_end=2000–3000` min, `dt=0.5` min, tail window `50–60%`

## Build & Run
- Tooling (installed locally during development)
  - Rust toolchain via rustup
  - `wasm-pack`
- Build
  - `cd crate && wasm-pack build --target web --release --out-dir ../web/pkg`
- Local serve
- `python3 -m http.server --directory web 8080`
- Open `http://localhost:8080/simulator/` (homepage), navigate to Bifurcation/Heatmap via the nav
- Regression harness: `wasm-pack build --target web --release --out-dir web/pkg` then `node tests/regression.js`

## Deployment
- Netlify build uses `netlify-build.sh` which installs `wasm-pack` (if needed) and builds to `web/pkg/`
- `netlify.toml` sets the publish directory and serves `.wasm` with correct MIME

### GitHub Pages (mirror)
- Use GitHub Actions to build and deploy from `main` to GitHub Pages.
- Workflow: `.github/workflows/deploy-pages.yml` (builds crate with `wasm-pack`, uploads `web/` as the artifact).
- Ensure `web/.nojekyll` exists (added) so static assets under `pkg/` are served as-is.
- In repository Settings → Pages, set Source to “GitHub Actions”. The workflow publishes to the Pages environment automatically on push to `main`.

### Workflow expectations
- **Commit discipline**: every meaningful code/documentation change must be committed on `main` (or a feature branch) before switching tasks. Avoid accumulating uncommitted edits.
- **Docs sync**: update the relevant documentation files (`docs/`, `AGENTS.md`, Workbench roadmap/plan) immediately after implementing features or altering presets/defaults so that a new agent can resume without Codex context.
- Record any deviations from the specification or temporary shortcuts in the roadmap file to maintain traceability.

## Git & Branches
- Default working branch renamed to `main` (pushed as `origin/main`)
- SSH remotes are used (private repository); ensure a valid SSH key is registered in GitHub if pushing from a new environment

## Design & Conventions
- Keep `simulate(...)` (legacy nondimensional) intact to avoid breaking older code; new work should use `simulate_physical(...)`
- JS shares WASM access via `web/core.js`
- Canvas rendering is used for performance; avoid heavy DOM operations during sweeps
- When plotting time series in Simulator: Prey = `400 − N`, Predator = `P`; phase portrait uses raw `N` vs `P`
- For sweeps, ignore transients using a tail window (%) before computing metrics
- Workbench fit workflow validates positive inputs, provides OLS/Huber modes, auto-selects the first-ten-point baseline if unset, and shows r_assoc / r_nick consistency badges (🟢/🟠/🔴) with recovery hints on failures

## Ideas for Future Work
- Add “Export PNG” buttons for Bifurcation and Heatmap pages
- Robustify period detection (prominence thresholds, smoothing)
- Additional presets (e.g., vary `k1` vs `G` amplitude maps, boundary of oscillatory region)
- Optional LSODA/ode45-style adaptive solver (trade-off: complexity vs speed)
- Unit annotations and ranges validated per SI for broader PP variants (PP2, PP3)

---
Maintained by: agents working on the PP-oscillation simulation app. Follow this guide for consistent changes across Rust/WASM/JS.
