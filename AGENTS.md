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
  - `index.html` — redirects to `/simple/` (Simple Flow is now the homepage)
  - `equation.png` — equation image used by legacy pages
  - `core.js` — WASM wrapper exposing `initWasm()` and `runSimulationPhysical(params)`
  - `modifications.js` — shared helpers for modification cards (v2 schema), storage, migration, and effective parameter mapping
  - `simple/` — **Simple Flow (Primary App)** — 4-step guided workflow
    - `index.html` — shell with header, stepper, navigation, KaTeX CDN
    - `router.js` — hash-based routing (#/simple/1-4)
    - `simple.css` — shared styles
    - `mathExplainer.js` — KaTeX rendering helpers & explanation templates (Japanese)
    - `steps/` — Step implementations (card editor, time series, fit, comparison)
      - `step1.js`, `step1.css` — Step ① 設計 (Design: card editor, presets, derived parameters)
      - `step2.js`, `step2.css` — Step ② 即時予測 (Time Series: simulation visualization, overlays)
      - `step3.js`, `step3.css` — Step ③ 同定 (Fit/Titration: CSV upload, parameter estimation)
      - `step4.js`, `step4.css` — Step ④ 比較 (Comparison: bifurcation, heatmap)
  - `detail/` — **Detail (Legacy) View** — Original workbench with v1↔v2 compatibility
    - `index.html` — legacy UI with mode banner
    - `workbench.js` — v1↔v2 schema compatibility layer
    - `library.js` — card filtering and batch actions
    - `fit/` — CSV importer, prey_fit, titration modules
  - `simulator/`, `bifurcation/`, `heatmap/` — Legacy standalone pages (still accessible)
- `docs/` — Documentation
  - `archive/plan.md` — Initial roadmap (archived)
  - `new-Implementation-request.md` — Simple Flow requirements
  - `workbench-simple-mode-plan.md` — Phased implementation plan (Phases 0–8)
  - `modification-workbench-development-plan.md` — Detailed task breakdown with milestones
  - `handoff-next-agent.md` — **Quick start guide for new agents** (current state, build steps, troubleshooting)
  - `specification.md` — Technical specification
  - `reference/Supplementary_Information.md` — **Source paper SI** (520 lines, 82KB; use Task tool for analysis)
- `.gitignore` — ignores build artifacts (`crate/target/`, `web/pkg/`)
- `netlify.toml`, `netlify-build.sh` — build config (wasm-pack) for deployment

## Implemented Features

### Core Engine
- Physical ODE (Rust, WASM, JS)
  - `simulate_physical(pol, rec, G, k1, k2, k_n, k_p, b, km_p, N0, P0, mod_factor, t_end_min, dt_min)`
    - Implements SI S3 Eq. (3,4) with Runge–Kutta (fixed step)
    - UI computes effective `k1'` / `b'` via v2 schema; `mod_factor` remains as a passthrough for historical data
    - Returns `[N_series..., P_series...]` (nM)
  - `web/core.js` exposes a reusable `runSimulationPhysical(params)` for all pages

### Simple Flow (Primary App) — `/simple/`
**Status:** ✅ Complete (Phase 0-7 implemented)

- **Step ① 設計 (Design)**
  - Card-based modification editor with v2 schema support
  - Concentration ↔ Ratio toggle for Nb (nickase) and ETSSB (polymerase)
  - Presets: SI Baseline, Nb Titration, ETSSB Booster
  - Live derived parameter display (k₁′, b′, g′, β′, dominance)
  - Validation with real-time feedback
  - Auto-save to localStorage
  - **Japanese UI + detailed mathematical explanation** (KaTeX-rendered)

- **Step ② 即時予測 (Time Series)**
  - Embedded simulator with time-series and phase portrait
  - Baseline vs. active card comparison with Δ indicators
  - Overlay manager (multi-card comparison)
  - Quick links to Step ④ (bifurcation/heatmap)
  - **Japanese UI + ODE model explanation** (equations, metrics)

- **Step ③ 同定 (Fit/Titration)**
  - CSV drag & drop for prey-only fluorescence data
  - Prey fit: estimate k₁′ and b′ (linearized solver with Huber loss option)
  - Titration: estimate Ka (association constant) from G:N binding curves
  - Results auto-applied to active card
  - Advanced options (collapsible): time units, baseline points, scaling
  - **Japanese UI + fitting theory explanation** (χ² minimization, binding curves)

- **Step ④ 比較 (Comparison)**
  - Bifurcation view: 1D parameter sweep, oscillation boundaries
  - Heatmap view: 2D parameter grid, amplitude/period maps
  - Overlay table with baseline/active/overlays
  - Export placeholders (CSV/PNG)
  - **Japanese UI + bifurcation/heatmap theory explanation**

- **Shared Features**
  - Schema v2 with nested `inputs`, `derived`, `workflow` fields
  - v1 ↔ v2 migration and compatibility layer
  - Preferences storage (`pp_workbench_prefs_v1`: mode, last step)
  - Hash-based routing with history sync
  - Stepper navigation with Next/Back CTAs
  - KaTeX math rendering (CDN-based with auto-render)
  - Full Japanese localization (UI labels, help text, validation messages)

### Detail (Legacy) View — `/detail/`
- Original Workbench UI preserved for advanced users
- v1↔v2 schema compatibility (reads/writes both formats)
- Mode banner indicating legacy view
- Fit pane with CSV import, OLS/Huber loss, r_assoc/r_nick reconciliation
- Library with charge filters, multi-select overlays, deep links to bifurcation/heatmap

### Legacy Standalone Pages (Still Accessible)
- Simulator (`/simulator/`) — Physical parameters, time series, phase portrait
- Bifurcation (`/bifurcation/`) — 1D parameter sweep with presets
- Heatmap (`/heatmap/`) — 2D parameter grid with turbo colormap
- All pages support `?preset=...&active=...&overlays=...` deep linking

### Defaults and Presets (from SI Table S5, PP1 optimized / Fig.2 & S11)
- Common base values used in pages and presets:
  - `pol=3.7`, `rec=32.5`, `G=150`, `k1=0.0020`, `k2=0.0031`, `kN=0.0210`, `kP=0.0047`, `b=0.000048`, `KmP=34`, `N0=10`, `P0=10`
  - Enzyme baselines: `Nb_nM=32.5`, `ETSSB_nM=3.7`
  - Typical windows: `t_end=2000–3000` min, `dt=0.5` min, tail window `50–60%`

## Build & Run
- Tooling (installed locally during development)
  - Rust toolchain via rustup
  - `wasm-pack`
- Build
  - `wasm-pack build --target web --release --out-dir web/pkg crate/`
- Local serve
  - `python3 -m http.server --directory web 8080`
- Open URLs:
  - `http://localhost:8080/simple/` — Simple Flow (homepage, default)
  - `http://localhost:8080/detail/` — Detail (Legacy) view
  - `http://localhost:8080/simulator/` — Legacy standalone simulator
- Regression harness:
  - `wasm-pack build --target web --release --out-dir web/pkg crate/`
  - `node tests/regression.js` (Note: currently requires fetch shim fix)

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
- When plotting time series: Prey = `400 − N`, Predator = `P`; phase portrait uses raw `N` vs `P`
- For sweeps, ignore transients using a tail window (%) before computing metrics
- **Schema v2** is the primary format; v1 compatibility maintained via migration helpers in `modifications.js`
- **Japanese UI**: All user-facing text in Simple Flow is Japanese; legacy pages remain English
- **Math explanations**: KaTeX-rendered with `$...$` (inline) and `$$...$$` (display) delimiters; templates in `mathExplainer.js`
- Fit workflow validates positive inputs, provides OLS/Huber modes, auto-selects baseline windows, and shows r_assoc/r_nick consistency badges with recovery hints on failures

## Mathematical Model Reference

**⚠️ Important for Model Verification:**

The source mathematical model is documented in `docs/reference/Supplementary_Information.md`:
- **File size:** 520 lines, 82KB (very large)
- **Content:** Reaction networks, ODE formulation (Section S3, Eq. 3-4), experimental methods, parameter values (Table S5)
- **Key sections:**
  - S3: ODE equations (verify against `crate/src/lib.rs`)
  - Table S5: Baseline parameters (PP1 optimized)
  - Figures S11, S2: Bifurcation and limit cycle data

**📌 Recommended Approach:**
- Due to file size, **delegate analysis to a Task tool with general-purpose agent**
- Specify target sections (e.g., "Search for Section S3 equations and compare to Rust implementation")
- Use for parameter validation, unit conversions, theoretical background

**Example Task:**
```
Task tool: "Read docs/reference/Supplementary_Information.md, locate Section S3
ODE equations (Eq. 3-4), and verify that crate/src/lib.rs::simulate_physical()
correctly implements dN/dt and dP/dt with all terms matching."
```

## Ideas for Future Work (Phase 8+)
- ✅ KaTeX math explanations (completed)
- ✅ Japanese UI localization (completed)
- Export PNG buttons for Bifurcation and Heatmap pages (placeholders exist)
- Robustify period detection (prominence thresholds, smoothing)
- Additional presets (e.g., vary `k1` vs `G` amplitude maps, boundary of oscillatory region)
- Optional LSODA/ode45-style adaptive solver (trade-off: complexity vs speed)
- Unit annotations and ranges validated per SI for broader PP variants (PP2, PP3)
- Node.js regression test fetch shim (currently broken in CI)

---
Maintained by: agents working on the PP-oscillation simulation app. Follow this guide for consistent changes across Rust/WASM/JS.
