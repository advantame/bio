# Modification Workbench — Next Steps (2025-09-24)

This note captures the immediate follow-on work agreed after integrating the modification engine, Workbench UI, and simulator/bifurcation/heatmap overlays. It distills the remaining specification items so that any agent can resume development even without the interactive context.

## Guiding References
- **Specification v1.0** (2025-09-24): sections 5.4 Fit, 5.5 Library, 6 Data Model, 8 Algorithms, 14 Tests, and 13 Compatibility outline the pending capabilities. Line numbers refer to that document.
- Current defaults remain the SI Table S5 values (spec §5.2, §14) and the “Birth of oscillations (G sweep)” preset (§5.3) for continuity.

## Priority Work Queue (in order)
1. **Finalize the Fit section** (spec §5.4, §8.1–8.3).
   - ✅ CSV import pipeline: `time, F_green[, F_yellow]` with cross-talk correction and baseline removal (§7.1).
   - ✅ Prey-only estimator with optional Huber loss, covariance → CI, and factor reconciliation applied to the active card.
   - ✅ GN titration helper: fit `K_a^{GN}`, derive `r_assoc`, reconcile `r_nick`, warn on CI conflicts (§8.2, §8.3).
   - ✅ Fit logging/export: persist `FitResult` metadata and offer download hooks (spec §6.1).
2. **Implement the Library section** (spec §5.5).
   - Persist/compare modification cards with physicochemical filters (charge, aromaticity, linker length).
   - Provide comparison launchers that open bifurcation/heatmap overlays with selected cards.
   - Export reports (CSV + PDF) containing fit summaries and derived parameters.
3. **Restore and adapt presets with the new parameterization**.
   - ✅ Heatmap: default preset now sweeps `G × ΔΔG_assoc` (converted to `r_assoc`); G×rec amplitude preset retained (§5.3, §13).
   - ◻ Simulator keeps SI defaults (unchanged `DEFAULTS`).
   - ◻ Bifurcation: retain “Birth of oscillations (G sweep)” using SI defaults upon preset activation (§5.3).
   - ◻ Update docs and tooltips to explain the r_assoc / r_poly / r_nick mapping (spec §13, §15).
4. **Guarantee “oscillation-at-start” regressions**.
   - Ensure the SI baseline (no modification) still oscillates on first load; capture as a regression test (§14.2).
   - Validate bifurcation and heatmap presets emit the expected qualitative behaviour.
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
