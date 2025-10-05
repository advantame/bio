# Modification Workbench — Next Steps (2025-10-05)

This note captures the immediate follow-on work agreed after integrating the modification engine, Workbench UI, and simulator/bifurcation/heatmap overlays. It distills the remaining specification items so that any agent can resume development even without the interactive context.

## Guiding References
- **Implementation Request (Oct 05)** — `docs/new-Implementation-request.md`
- **Simple Flow Plan** — `docs/workbench-simple-mode-plan.md`
- **Specification (to be updated)** — `docs/specification.md` Workbench section
- Defaults continue to track SI Table S5 values until new presets are defined within the simple flow.

## Priority Work Queue (in order)
0. **Launch Simple Flow (primary app)** — Full restructure.
   - ✅ **Phase 0 Complete** — Schema v2 migration and preferences storage implemented in `web/modifications.js`.
   - ✅ **Phase 1 Complete** — Routing shell created at `/web/simple/` with header, stepper, CTA bar, and step placeholders.
   - ✅ **Phase 6 Complete** — Detail (legacy) view created at `/web/detail/` with full Workbench UI and v1↔v2 compatibility.
   - 🔄 **Phases 2–5 In Progress** — Steps ①–④ implementation (card editor, time-series, fit, comparison).
   - ⏳ **Phases 7–8 Pending** — KaTeX, QA.
   - Ensure legacy URLs redirect cleanly with preserved `active/overlays/preset` query parameters.
1. **Finalize the Fit section** (spec §5.4, §8.1–8.3).
   - ✅ CSV import pipeline: `time, F_green[, F_yellow]` with cross-talk correction and baseline removal (§7.1).
   - ✅ Prey-only estimator with optional Huber loss, covariance → CI, and factor reconciliation applied to the active card.
   - ✅ GN titration helper: fit `K_a^{GN}`, derive `r_assoc`, reconcile `r_nick`, warn on CI conflicts (§8.2, §8.3).
   - ✅ Fit logging/export: persist `FitResult` metadata and offer download hooks (spec §6.1) with consistency badges + failure hints.
2. **Library reporting (post simple-flow)** — spec §5.5.
   - Persist/compare modification cards with physicochemical filters (charge, aromaticity, linker length). _Status:_ heuristics + charge filter shipped.
   - Provide comparison launchers that open bifurcation/heatmap overlays with selected cards. _Status:_ quick-launch buttons done; revisit once Step④ stabilises.
   - Export reports (CSV + PDF) containing fit summaries and derived parameters. _Status:_ TODO after simple flow GA.
3. **Restore and adapt presets with the new parameterization**.
   - ✅ Heatmap: default preset now sweeps `G × ΔΔG_assoc` (converted to `r_assoc`); G×rec amplitude preset retained (§5.3, §13). URL param `preset=assoc_period|rec_amp` supported.
   - ✅ Simulator keeps SI defaults (unchanged `DEFAULTS`).
   - ✅ Bifurcation: retain “Birth of oscillations (G sweep)” using SI defaults upon preset activation (§5.3) and via `preset=G_sweep` deep link.
   - ✅ Update docs and tooltips to explain the r_assoc / r_poly / r_nick mapping (spec §13, §15). Additional KaTeX-rendered explanations tracked under Priority 0.
4. **Guarantee “oscillation-at-start” regressions**.
   - ✅ Regression harness (`tests/regression.js`) checks SI baseline oscillation and logs bifurcation/heatmap timings; currently fails in Node sans `fetch` shim (needs follow-up).
   - ◻ Extend harness with invariant math/unit checks (r_assoc / r_poly / r_nick) and preset qualitative assertions (blocked on harness fetch support).
5. **Optional enrichment**.
   - Preload dual Rec presets (e.g., 32.5 nM vs 15 nM) to explore Rec-dependent saturation, per spec §17.

## Test & QA Expectations
- Mathematical invariants for r_assoc / r_poly / r_nick scaling (§14.1).
- UI regression snapshots for presets (§14.2, §14.4).
- Performance checks: 1D sweeps (≤300 samples ≈100 ms) and 2D grids (≈100×100 ≤1.5 s) (§10, §14.5).

## Documentation To-Do Once Features Land
- Update `AGENTS.md` and any user-facing help pages when presets/defaults shift.
- Document CSV schema and fit assumptions (Huber loss option, CI computation) in `docs/`.
- Record backward-compatibility behaviour for legacy `mod_factor` imports (§13).

Keep this roadmap in `docs/modification-workbench-roadmap.md` and amend it as milestones complete.
