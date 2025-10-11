# Modification Workbench Development Plan

_Last updated: 2025-10-05 (simple-flow architecture reset)_

This plan expands the roadmap into actionable tasks with checkpoints, owners (default: current agent), and acceptance criteria. The intent is to keep development unblocked even if the Codex session resets.

## 0. Snapshot
- **Repo state**: `main` @ `f93e591` — "Add KaTeX math explanations and Japanese UI localization"
- **Delivered**:
  - ✅ modification card storage (v2 schema with migration)
  - ✅ Simple Flow 4-step workflow (Phase 0-7 complete)
  - ✅ KaTeX integration with Japanese mathematical explanations
  - ✅ Full Japanese UI localization
  - ✅ Detail (legacy) view with v1↔v2 compatibility
  - ✅ simulator & sweep overlays, heatmap variant selector
  - ✅ prey-only CSV ingestion + fitting with Workbench integration
  - ✅ ratio validation/locks, hairpin feedback
- **Outstanding**: Phase 8 (QA & Documentation) — regression test fetch shim, manual QA matrix, final docs update。

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

### Milestone D — Simple Flow (Primary App)
| Task | Details | Status |
| --- | --- | --- |
| **D1. Schema & prefs** ✅ | Complete Phase 0 of the simple-flow plan (schemaVersion=2, nested inputs, workflow state, prefs key). | **Done** — modifications.js updated with v2 schema, migration, and preferences storage. |
| **D2. Routing & shell** ✅ | Implement Phase 1 ( `/simple/:step`, redirects, shared header/stepper, Next/Back CTA、legacy URL互換）。| **Done** — /web/simple/ created with router, steps 1-4 placeholders, /detail stub, root redirect. |
| **D3. Step ① 設計** ✅ | Build Step 1 per Phase 2 (presets、濃度↔比トグル、派生サマリー、完了条件)。| **Done** — Card editor with concentration↔ratio toggles, presets (SI/Nb/ETSSB), derived display, validation, auto-save. |
| **D4. Step ② 即時予測** ✅ | Embed time-series engine + derived/overlay panels (Phase 3)。| **Done** — Time series visualization with simulator engine, overlay manager, derived metrics panel. |
| **D5. Step ③ 同定** ✅ | Fit/滴定の簡素化とカード反映 (Phase 4)。| **Done** — CSV drag & drop, prey fit, titration, auto-apply to active card. |
| **D6. Step ④ 比較** ✅ | 分岐図・ヒートマップタブ埋め込み、オーバーレイ表、出力 (Phase 5)。| **Done** — Bifurcation/heatmap tabs, overlay table, export placeholders. |
| **D7. Detail(legacy) parity** ✅ | Compact stepper、入力同期、切替 (Phase 6)。| **Done** — /web/detail/ created with legacy Workbench UI, v1↔v2 schema compatibility layer, mode banner. |
| **D8. KaTeX & docs** ✅ | CDN読み込み＋解説パネル、仕様更新、回帰テスト強化 (Phases 7–8)。| **Done (Phase 7)** — KaTeX CDN, mathExplainer.js, Japanese explanations for all steps, UI localization. Phase 8 (QA) pending. |

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
- [ ] Execute Milestone D Phases 0–8 (see `docs/workbench-simple-mode-plan.md`).

Keep this plan synced with `docs/modification-workbench-development-plan.md`. Update checkboxes and milestones as work progresses.
