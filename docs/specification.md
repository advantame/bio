# PP Oscillation Simulation App — Specification

_Last updated: 2025-09-26_

## 1. Project Overview
A Rust + WebAssembly + Canvas web application for exploring a DNA-based predator–prey oscillator. The model mirrors the Supplementary Information (SI) section S3 (Eq. 3,4) of the source paper and exposes physical parameters that align with wet-lab experiments. The app supports interactive simulation, parameter sweeps (1D bifurcation and 2D heatmap), and a Modification Workbench for managing amino-acid modifications that alter effective kinetic parameters.

## 2. Repository Layout
- `crate/` — Rust crate compiled to WebAssembly.
  - `src/lib.rs`
    - `simulate(...)`: legacy nondimensional solver (retained for backwards compatibility).
    - `simulate_physical(...)`: physical-parameter RK4 solver. Signature still includes a `mod_factor` parameter for historical compatibility, but the front-end always supplies `1.0`; new work relies on explicit r-based adjustments instead.
  - Built via `wasm-pack` (`wasm-pack build --target web --release --out-dir ../web/pkg`).
- `web/` — Static front-end served as plain files (no bundler).
  - `core.js`: initializes the WASM module (`initWasm`) and exposes `runSimulationPhysical` returning `{ N, P }` Float32Arrays.
  - `modifications.js`: localStorage-backed state and effective-parameter derivations (`k1'`, `b'`, `g'`, `β'`, invariants, dominance detection, hairpin folding).
  - Pages:
    - `index.html`: redirect to `/simulator/`.
    - `simulator/`: time-series + phase-portrait explorer.
    - `bifurcation/`: single-parameter sweep (P min/max envelopes).
    - `heatmap/`: two-parameter grid with amplitude/period metrics.
    - `workbench/`: modification management, derived metrics, Fit and titration workflows.
- `docs/`: design notes and plans (including this spec).
- `tests/`: regression harness (`tests/regression.js`).

## 3. Simulation Model
- Units: minutes for time, nanomolar (nM) for concentrations.
- Inputs to `simulate_physical`: `pol, rec, G, k1, k2, k_n, k_p, b, KmP, N0, P0, t_end_min, dt_min` (a deprecated `mod_factor` argument remains in the Rust signature but is fixed to `1.0` by the JS wrapper).
- ODEs (SI S3 Eq. 3,4) integrated via fixed-step RK4. Negative concentrations are clamped to zero post-step.
- Output layout: concatenated `[N_series..., P_series...]` (Float32 arrays) consumed by JavaScript.

## 4. Front-end Architecture
- JavaScript imports the generated `pp_osc_wasm.js` bundle and runs entirely in-browser.
- Canvas rendering (`<canvas>`) is used for time series, phase portraits, bifurcation plots, and heatmaps to keep sweeps performant.
- All user state (modifications, active/overlay selections, fit history) resides in localStorage under versioned keys.

## 5. Application Pages & Capabilities
### 5.1 Simulator (`/simulator/`)
- UI parameters: `pol, rec, G, k1, k2, kN, kP, b, KmP, N0, P0, t_end, dt` seeded with SI S5 PP1 optimized defaults.
- Plots:
  - Time series: Predator `P` and Prey plotted as `400 − N` (historic convention) against time (min).
  - Phase portrait: raw `N` vs `P`.
- Supports baseline, active modification, and overlay trajectories. Colors/dash styles differentiate sets.
- Legend and modification summary show effective `k1'`, `b'`, `β'` ratios against baseline.

### 5.2 Bifurcation (`/bifurcation/`)
- Sweeps a single parameter from `pmin` to `pmax` over `steps` samples; after ignoring the first `tail%` of points it records P min/max for each series.
- Presents envelopes + scatter dots per series with color-coded baselines/active/overlays.
- Preset dropdown (default: “Birth of oscillations (G sweep)”) applies SI defaults.
- Deep link query parameters:
  - `preset=G_sweep` → applies canonical G sweep defaults.
  - `param, pmin, pmax, steps, t_end, dt, tail` override sweep settings.
  - `active=<id>` sets the Workbench active modification.
  - `overlays=<id1,id2,...>` preloads overlay set (pruned to known cards).

### 5.3 Heatmap (`/heatmap/`)
- 2D grid across `xParam`, `yParam` (defaults: `G` vs `ΔΔG_assoc` converted to `r_assoc`).
- Metrics supported: `amplitude` (P max − min) and `period` (mean peak spacing from tail window).
- Result rendering uses Turbo colormap with legend and optional Δ vs baseline view.
- Presets via UI and query params:
  - `preset=assoc_period` (G × ΔΔG_assoc, period).
  - `preset=rec_amp` (G × rec, amplitude).
- Query parameters mirror input fields; `active` / `overlays` behave like Bifurcation.

### 5.4 Workbench (`/workbench/`)
#### Library Panel
- Lists stored modification cards with charge/aromatic descriptors.
- Multi-select checkboxes drive overlay sets; buttons provide quick actions:
  - “Set selected as active” (requires single selection).
  - “Use selected as overlays”.
  - “Open Bifurcation” / “Open Heatmap” — deep-link respective pages with `preset` + `active`/`overlays` encoded; selection synchronizes Workbench state beforehand.
- Cards are color-coded for active (badge) and overlay membership (green badge). Selection state uses dashed outlines.

#### Design Form
- Fields: label, amino acid, temperature (°C), ΔΔG_assoc (kcal/mol), r_assoc, r_poly, r_nick, ΔΔG_fold, linker length/polarity, notes.
- ΔΔG_assoc ↔ r_assoc interlock: editing one locks it (🔒 icon) and auto-fills the other via temperature-aware conversion. Primary field tracked via `assocSource`.
- Ratio inputs enforce >0; warnings and hard stops occur when outside recommended (0.2–5) or allowed (0.05–20) ranges.
- Hairpin toggle applies hairpin folding correction, exposing live `f_open` (opening probability) and clarifying it only scales `g`.
- “Reset to SI defaults” restores baseline values (`ΔΔG_assoc` cleared, ratios=1, no hairpin).
- “Include in overlay comparisons” toggles membership in overlays.

#### Derived Parameters
- Continuously displays k₁′, b′, g′, β′, and g′·f_open when hairpin enabled, plus dominance classification (association/polymerase/saturation/mixed).
- Highlights ratio fields with yellow (warning) or red (error) backgrounds; warns if ΔΔG and r_assoc disagree (>0.2 kcal/mol difference).
- Binding table summarises k₁′, b′, g′, β′ for baseline, active, and overlays.

#### Fit Section (Prey-only)
- Inputs: `pol`, `G`, `time unit` (seconds/minutes), `Baseline points` (auto defaults to first 10 if blank), `N0`, loss function (OLS/Huber), cross-talk factors, green→nM scale.
- Drag-and-drop/browse CSV ingestion with dynamic feedback.
- Fit pipeline:
  - Parses CSV (time + fluorescence, optional yellow channel), applies cross-talk correction, baseline subtraction, and converts to nM.
  - Performs linearized estimation with optional Huber robustification; computes 95% CIs.
  - Updates current card (k₁′, b′, r_poly, r_nick), storing fit history with metadata for export.
  - Displays result cards (k₁′, b′, r_poly, r_nick, R², loss metrics) plus traffic-light pills for r_assoc/r_nick consistency relative to previous state.
- Validation: positive `pol/G/N0/scale`, supported time unit; errors surfaced inline.
- Failure hint: suggests enabling Huber or reducing baseline scaling when convergence fails.

#### Titration Section
- Imports ligand-response CSV to fit `K_a` and derive `r_assoc` via `deriveRAssoc` (temperature-adjusted). Updates card with history entry.

#### Simple Mode (in development)
- A guided four-step flow (設計 → 予測 → 同定 → 比較) will wrap the existing capabilities.
- Simple Mode and Detail Mode share a unified store; mode toggled via header control or `mode=simple|detail` query parameter with persistence in localStorage.
- Nb / ETSSB inputs support concentration↔比率 toggles, with conversions applied automatically and validation aligned to the implementation request.
- Explanatory formulas (k₁′, b′, g′, β′, ΔΔG↔r, Nb/ETSSB transforms) render via KaTeX loaded from CDN for clarity; fallback shows plain code when CDN unavailable.
- Deep links to Simulator/Bifurcation/Heatmap carry a version flag (`wbv=2`) to keep overlays synchronised.

### 5.5 Data Persistence
- LocalStorage keys:
  - `pp_workbench_modifications_v1`: array of modification cards.
  - `pp_workbench_active_mod_v1`: active card id.
  - `pp_workbench_overlay_mods_v1`: overlay id list.
- `legacyModFactorToModification` helper converts old `mod_factor` values into pseudo-modification cards on import so pre-existing data can be migrated to r-based modifiers.

## 6. Defaults & Presets
- Baseline (SI Table S5, PP1 optimized): `pol=3.7`, `rec=32.5`, `G=150`, `k1=0.0020`, `k2=0.0031`, `kN=0.0210`, `kP=0.0047`, `b=4.8e-5`, `KmP=34`, `N0=10`, `P0=10`.
- Simulator, Bifurcation, and Heatmap presets restore or extend SI defaults; query parameters ensure Workbench integration enhances rather than breaks legacy flows.

## 7. Workflows & Navigation
1. **Interactive Simulation:** Adjust sliders in `/simulator/` to explore trajectories with baseline/active/overlays.
2. **Compare modifications:** In Workbench, multi-select cards and open Bifurcation/Heatmap to launch comparative sweeps with one click.
3. **Fit experimental data:** Drop CSV in Fit section → inspect derived parameters & consistency pills → new ratios propagate across all pages.
4. **Hairpin modeling:** Enable hairpin toggle to apply folding correction and monitor g′·f_open values.

## 8. Build & Deployment
- Local serve: after building WASM, run `python3 -m http.server --directory web 8080` and open `http://localhost:8080/simulator/`.
- Netlify deployment uses `netlify-build.sh` (installs wasm-pack if missing) and `netlify.toml` (static publishing, `.wasm` MIME).
- GitHub Pages mirror: `.github/workflows/deploy-pages.yml` builds WASM and publishes `web/`.

## 9. Testing
- `wasm-pack build --target web --release --out-dir web/pkg` must precede JS tests.
- `node tests/regression.js` scenarios:
  1. Oscillation baseline amplitude check.
  2. Bifurcation sweep performance (G sweep).
  3. Heatmap sweep performance (G × ΔΔG_assoc grid).
- Current status: harness throws `fetch failed` in raw Node environment; requires a `fetch` shim or execution under `node --experimental-fetch` / bundler before automation.
- Future work: extend tests with invariant checks (k₁′/b′/r ratios) and preset qualitative assertions.

## 10. Roadmap Snapshot
- Launch Simple Mode and KaTeX-backed explanations (ref. `docs/workbench-simple-mode-plan.md`).
- Complete Library export/reporting (CSV/PDF) and named overlay sets.
- Harden regression harness (resolve Node fetch issue, add invariants).
- Continue documentation sync (user-facing help, examples) as features evolve.
- Evaluate IndexedDB if localStorage growth becomes a bottleneck.

## 11. Compatibility & Backwards Support
- Legacy `simulate` (nondimensional) retained for prior consumers.
- Deprecated `mod_factor` support is limited to legacy-import helpers; all current flows operate on `r_assoc`, `r_poly`, and `r_nick` factors explicitly.
- Parameter conversions (ΔΔG ↔ r) respect temperature inputs ensuring historical datasets remain usable.

## 12. Reference Documents
- `AGENTS.md`: day-to-day agent guide.
- `docs/modification-workbench-development-plan.md`: granular plan & checkpoint tracking.
- `docs/modification-workbench-roadmap.md`: prioritized backlog.
- `docs/tests.md`: current testing status and tooling notes.
- `docs/archive/plan.md`: original high-level design (pre-physical parameterization, kept for historical context).
- `docs/new-Implementation-request.md`: latest Workbench overhaul requirements.
- `docs/workbench-simple-mode-plan.md`: execution plan aligned to the implementation request.
