# PP Oscillation Simulation App — Specification

_Last updated: 2025-10-05_

## 1. Project Overview
A Rust + WebAssembly + Canvas web application for exploring a DNA-based predator–prey oscillator. The model mirrors the Supplementary Information (SI) section S3 (Eq. 3,4) of the source paper and exposes physical parameters that align with wet-lab experiments. As of October 2025 the **Simple Flow** (`/simple/1–4`) is the primary user experience, guiding researchers through hypothesis → immediate prediction → identification → comparison. The legacy Workbench UI remains available as the **Detail (Legacy)** view for advanced adjustments and backwards compatibility.

## 2. Repository Layout
- `crate/` — Rust crate compiled to WebAssembly.
  - `src/lib.rs`
    - `simulate(...)`: legacy nondimensional solver (retained for backwards compatibility).
    - `simulate_physical(...)`: physical-parameter RK4 solver. Signature still includes a `mod_factor` parameter for historical compatibility, but the front-end always supplies `1.0`; new work relies on explicit r-based adjustments instead.
  - Built via `wasm-pack` (`wasm-pack build --target web --release --out-dir ../web/pkg`).
- `web/` — Static front-end served as plain files (no bundler).
  - `core.js`: initializes the WASM module (`initWasm`) and exposes `runSimulationPhysical` returning `{ N, P }` Float32Arrays.
  - `modifications.js`: shared state utilities (localStorage-backed) and effective-parameter derivations (`k1'`, `b'`, `g'`, `β'`, invariants, dominance detection, hairpin folding, workflow state).
  - `simple/`: new root flow (Step 1–4 views, header shell, embedded visualisations).
  - `detail/`: legacy Workbench view (exposes advanced controls with schema parity).
  - Legacy subdirectories (`simulator/`, `bifurcation/`, `heatmap/`, `workbench/`) persist as modular view components consumed by the simple flow and detail view.
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

## 5. Application Structure & Capabilities
### 5.1 Simple Flow Overview (`/simple/:step`)
- Shared header with branding, four-step progress indicator (① 設計 → ② 即時予測 → ③ 同定 → ④ 比較), and mode toggle (`Simple` / `Detail (Legacy)`).
- Bottom-right CTA bar exposes `戻る` / `次へ`; disabled with explanatory tooltip while validation errors remain.
- Deep links append `step`, `view`, `active`, `overlays`, `preset`, `wbv` so the flow can be restored via URL.

### 5.2 Step ① 設計 — Hypothesis & Card Editing (`/simple/1`)
- Modification card editor with concentration↔比率 toggles for Nb (nickase) and ETSSB (polymerase assist).
- Preset selector (SI baseline, Nb titration, ETSSB booster) updates the active card immediately.
- Derived summary (k₁′, b′, g′, β′, dominance) and validation warnings display inline; completion requires association + at least one enzyme input within supported bounds.
- Debounced auto-save pushes updates through the shared store, triggering downstream recalculation.

### 5.3 Step ② 即時予測 — Time Series & Quick Comparison (`/simple/2`)
- Embeds the legacy Simulator canvas (time series + phase portrait) driven by `runSimulationPhysical`.
- Left column: derived metrics comparing baseline vs active with Δ% badges.
- Right column: overlay manager (selection, ordering) and CTA buttons to open Step④ sub-views with synced query params.
- Shows loading indicator while WASM simulation runs after parameter changes.

### 5.4 Step ③ 同定 — Fit & Titration (`/simple/3`)
- Streamlined Fit workflow: drag/drop CSV, minimal options by default, expandable “詳細設定” for advanced controls.
- Titration helper (GN binding) sits beneath Fit results; both update the active card, derived cache, and history.
- Successful operations mark the step as `done` and prompt users toward comparison; failures retain `in_progress` with retry guidance.

### 5.5 Step ④ 比較 — Bifurcation & Heatmap (`/simple/4`)
- Embeds bifurcation and heatmap visualisations as switchable panels, reusing existing canvas engines.
- Overlay table summarises baseline/active/overlays (k₁′, b′, g′, β′, dominance, Nb/ETSSB concentrations) with CSV export option (planned).
- Controls for presets, axis ranges, and Δ vs baseline mirror the former standalone pages.

### 5.6 Detail (Legacy) View (`/detail`)
- Retains the historical Workbench interface for expert usage and backwards compatibility.
- Adds compact step indicator, mode banner, and concentration↔比 toggles aligned with the new schema.
- State remains synchronised with the Simple Flow; switching views never duplicates data.

### 5.7 Legacy Deep Links & Redirects
- `/` → `/simple/1`
- `/workbench` → `/simple/1`
- `/simulator` → `/simple/2?view=time`
- `/bifurcation` → `/simple/4?view=bifurcation&…`
- `/heatmap` → `/simple/4?view=heatmap&…`
- `/workbench?mode=detail` → `/detail`
- Unknown cards in queries are ignored with a toast warning; known IDs merge into the shared store before rendering.

### 5.8 Data Persistence
- LocalStorage keys:
  - `pp_workbench_modifications_v1`: array of modification cards (schemaVersion ≥ 2).
  - `pp_workbench_active_mod_v1`: active card id.
  - `pp_workbench_overlay_mods_v1`: overlay id list.
  - `pp_workbench_prefs_v1`: `{ mode, lastStep }` preference payload.
- `legacyModFactorToModification` converts old `mod_factor` values into pseudo-cards for compatibility.

## 6. Defaults & Presets
- Baseline (SI Table S5, PP1 optimized): `pol=3.7`, `rec=32.5`, `G=150`, `k1=0.0020`, `k2=0.0031`, `kN=0.0210`, `kP=0.0047`, `b=4.8e-5`, `KmP=34`, `N0=10`, `P0=10`.
- Step presets mirror the simple flow:
  - Step① presets: SI baseline, Nb titration, ETSSB booster.
  - Step④ presets reuse `preset=G_sweep`, `preset=assoc_period`, `preset=rec_amp` for bifurcation/heatmap tabs.

## 7. Workflows & Navigation
1. **Simple Flow:** Progress through Steps ①–④ using the header stepper or CTA buttons; state carries forward automatically.
2. **Legacy Deep Links:** Visiting `/simulator`, `/bifurcation`, `/heatmap`, or `/workbench` redirects into the corresponding simple step while retaining `active/overlays/preset`.
3. **Detail (Legacy) Toggle:** Switch via header; the same card/overlay state remains active, and the compact step indicator mirrors workflow progress.
4. **Hairpin modelling:** Available in both views; derived values recompute automatically.

## 8. Build & Deployment
- Local serve: build WASM (`wasm-pack build --target web --release --out-dir web/pkg`) then run `python3 -m http.server --directory web 8080` and open `/simple/1`.
- Netlify deployment uses `netlify-build.sh` (installs wasm-pack if missing) and `netlify.toml` (static publishing, `.wasm` MIME).
- GitHub Pages mirror: `.github/workflows/deploy-pages.yml` builds WASM and publishes `web/`.

## 9. Testing
- `wasm-pack build --target web --release --out-dir web/pkg` must precede JS-based tests.
- `node tests/regression.js` scenarios:
  1. Oscillation baseline amplitude check.
  2. Bifurcation sweep performance (G sweep).
  3. Heatmap sweep performance (G × ΔΔG_assoc grid).
  4. (Planned) Migration + simple-flow navigation smoke check (requires fetch shim).
- Current status: harness throws `fetch failed` in raw Node environments; add a fetch shim or run under `node --experimental-fetch` before automating.

## 10. Roadmap Snapshot
- Execute simple-flow Phases 0–8 (`docs/workbench-simple-mode-plan.md`).
- After GA, resume Library export/reporting (CSV/PDF) and named overlay sets.
- Harden regression harness (resolve fetch issue, add invariants).
- Continue documentation sync and evaluate IndexedDB if localStorage bloat becomes problematic.

## 11. Compatibility & Backwards Support
- Legacy `simulate` (nondimensional) retained for prior consumers.
- Deprecated `mod_factor` support limited to import helper; current flows rely on `r_assoc`, `r_poly`, `r_nick` and concentration inputs.
- Parameter conversions (ΔΔG ↔ r) respect temperature inputs ensuring historical datasets remain usable.

## 12. Reference Documents
- `AGENTS.md`: day-to-day agent guide.
- `docs/modification-workbench-development-plan.md`: granular plan & checkpoint tracking.
- `docs/modification-workbench-roadmap.md`: prioritised backlog.
- `docs/tests.md`: current testing status and tooling notes.
- `docs/archive/plan.md`: original high-level design (pre-physical parameterisation, historical).
- `docs/new-Implementation-request.md`: latest requirements.
- `docs/workbench-simple-mode-plan.md`: phased execution plan.
