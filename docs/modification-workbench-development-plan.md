# Modification Workbench Development Plan

_Last updated: 2025-09-26 (post Workbench ratio UX + deep-link presets)_

This plan expands the roadmap into actionable tasks with checkpoints, owners (default: current agent), and acceptance criteria. The intent is to keep development unblocked even if the Codex session resets.

## 0. Snapshot
- **Repo state**: `main` @ `Improve workbench UX and deep-link presets` (`990aaf4`).
- **Delivered**: modification card storage, simulator & sweep overlays, heatmap variant selector, prey-only CSV ingestion + fitting with Workbench integration, ratio validation/locks, hairpin feedback, Workbench → sweep deep links, doc refresh.
- **Outstanding**: GN titration fit polish, Fit logging/export review (CI wiring), Library report export, regression harness fetch shim.

## 1. Milestone Breakdown

### Milestone A — Fit Section GA
**Goal:** Deliver spec §5.4 end-to-end (CSV → fit → card update) with validation tooling.

| Task | Details | Output | Notes |
| --- | --- | --- | --- |
| **A1. CSV ingestion module** ✅ | Parse `time,F_green[,F_yellow]` with options from `CsvImportOptions`; apply cross-talk, baseline correction, unit scaling. | `web/workbench/fit/importer.js` | Mirrors spec §7.1. Tests pending. |
| **A2. Prey-only solver** ✅ | Linearised estimator with optional Huber loss; compute covariance → CI. | `web/workbench/fit/prey_fit.js` | Deterministic; returns diagnostics + factors. |
| **A3. GN titration helper** ✅ | Fit binding curve to recover `K_a^{GN}`; map to `r_assoc`. | `web/workbench/fit/titration.js` + Workbench integration. | Uses 1D log-space search; warns on singularities (§8.3). |
| **A4. Factor reconciliation** ✅ | Combine baseline `(k1,b)` and fitted `(k1',b')` → `r_poly`, `r_nick`; warn on CI conflicts. | Integrated in `workbench.js` Fit flow. | Uses spec eqns (§4, §8.2). |
| **A5. Fit UI** ✅ | Build Fit subsection (dropzone, controls, results cards, warnings). | `workbench/index.html` + `workbench.js`. | Handles drag/drop and browse; now shows traffic-light consistency + failure hints. |
| **A6. Logging & audit** ✅ | Persist `FitResult` per spec §6.1; allow export. | Fit history stored on card + JSON/CSV exports. | Includes timestamp, options, metrics. |

**Exit criteria:** Fit CSV → cards update → simulator overlays change without reload; CI available for derived factors. _Status:_ CSV ingestion and prey-only fit delivered; GN titration + logging/export remain pending.

### Milestone B — Library & Reporting
| Task | Details |
| --- | --- |
| B1. Tagging model | Extend `Modification` schema with descriptors (charge, aromaticity, linker length). Migrate stored cards. _Status:_ heuristics + filter scaffolding implemented (`workbench/library.js`). |
| **B2. Library UI** In progress | Table/list with filters, multi-select for overlays, quick actions (compare in Bifurcation/Heatmap). _Status:_ charge filter + multi-select overlay actions implemented; quick-launch buttons now deep-link pages with selected cards; reporting/export still pending. |
| B3. Exporter | Produce CSV + lightweight PDF (via jsPDF) summarizing modifications and diagnostics. |
| B4. Overlay presets | Allow saving named overlay sets for quick activation. |

### Milestone C — Preset Migration & Regression
| Task | Details |
| --- | --- |
| **C1. Update Heatmap defaults** ✅ | Swap `mod_factor` axis → `ΔΔG_assoc` (`r_assoc`). Adjust tooltips. |
| **C2. Reinstate SI presets** ✅ | Ensure Simulator defaults, Bifurcation “G sweep” work unchanged; presets load via query params. |
| C3. New Rec variants | Add optional Rec-based presets. |
| **C4. Docs refresh** ✅ | `AGENTS.md`, roadmap, user help. |
| C5. Regression tests | Scripted checks for oscillation-on-start, preset outputs, invariant math. _Status:_ Node harness (`tests/regression.js`) covers oscillation baseline, bifurcation timing, heatmap timing; currently fails in CI due to missing `fetch` shim—triage pending. |

### Milestone D — Simple Mode & Mode Synchronisation
| Task | Details |
| --- | --- |
| **D1. Schema migration** | Extend modification cards with mode, concentration inputs, derived caches, stepper progress. Implement localStorage migration and idempotent defaults. Refer to `docs/workbench-simple-mode-plan.md` Phase A. |
| **D2. Simple Mode shell** | Build guided layout, mode toggle routing (`mode=simple|detail`), stepper component, and deep-link versioning (`wbv=2`). |
| **D3. Step implementations** | Deliver Steps ①–④ per implementation request: presets, derived metrics, streamlined fit, comparison table, quick deep links. Ensure dominance classification and Δ displays. |
| **D4. Detail Mode parity** | Add memo block, compact stepper, and ratio↔濃度 toggles for Nb/ETSSB while sharing the unified store. |
| **D5. KaTeX integration & docs** | Load KaTeX from CDN in Workbench, render math explanations, update documentation/test notes accordingly. |
| D6. QA & regression | Execute manual matrix, extend regression harness when fetch shim lands, capture release notes. |

## 2. Testing Matrix
- **Unit:** importer, fitter, binding curve utilities, invariant math.
- **Integration:** Fit UI flows, card sync → overlays, Library actions, preset toggles.
- **Performance:** 300-point sweep, 100×100 heatmap with 3 overlays; log timings.
- **Regression:** Compare baseline waveforms vs golden JSON (no mod). Validate old `mod_factor` import path.

## 3. Open Questions / TBD
1. Precision vs speed: If LM in JS is too slow, consider Rust WASM module using `nalgebra` (requires build updates).
2. PDF export scope: minimum viable (tables + plots screenshot?) vs deferring to CSV only.
3. UX for conflicting fits: when `r_assoc` and `r_poly` imply incompatible `r_nick`, decide whether to block card update or annotate.
4. Storage bloat: Evaluate IndexedDB vs localStorage once Library grows (spec hints at IndexedDB optional).

## 4. Suggested Timeline
- **Week 1:** Milestone A end-to-end (Fit GA).
- **Week 2:** Milestone B Library + reporting; start Milestone C adjustments.
- **Week 3:** Complete preset migration, add regression suite, polish docs.

## 5. Next Steps Checklist
- [x] Implement CSV importer (unit tests outstanding).
- [x] Draft Fit UI skeleton and wire to new modules.
- [x] Implement GN titration helper and integrate into Fit flow.
- [x] Add Fit logging/export (JSON/CSV hooks).
- [x] Define data structures for Library filters.
- [ ] Enumerate regression scenarios and capture baselines (blocked on Node `fetch` shim).
- [ ] Deliver Milestone D (Simple Mode + KaTeX) per new implementation request.

Keep this plan synced with `docs/modification-workbench-development-plan.md`. Update checkboxes and milestones as work progresses.
