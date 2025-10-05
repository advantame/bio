# Simple Flow Implementation Plan

_Prepared: 2025-09-27 · Updated for full simple-flow rollout_

This plan operationalises `docs/new-Implementation-request.md` after the October 2025 scope change: the **Simple Flow (Steps ①–④)** becomes the primary application, and the legacy Workbench UI lives under `Detail (Legacy)`.

## 0. Goals & Guardrails
- `/simple/:step` is the default experience; `/` must redirect to `/simple/1`.
- All functionality from Simulator / Bifurcation / Heatmap / Workbench is embedded inside the four-step flow.
- State remains single-source-of-truth (`modifications.js`), shared across steps and the legacy view.
- Deep links (`active`, `overlays`, `preset`, `wbv`) continue to work via compatible query parameters and redirects.
- Detail view stays intact but always reflects the same underlying state; no divergence of data.
- KaTeX provides mathematical explanations with CDN fallback.

## Phase 0 — Data Model & Preferences (carry-over, 1–2 days)
1. Upgrade modification schema (`schemaVersion=2`, nested `inputs`, `derived`, `workflow`).
2. Implement `upgradeLegacyModifications`, `ensureDerivedCache`, and helper accessors (`getAssocInputs`, etc.).
3. Add `pp_workbench_prefs_v1` with `{ mode: 'simple'|'detail', lastStep }`.
4. Hook migration + preference bootstrap in `web/modifications.js` + `web/workbench/workbench.js`.
5. Document schema in `docs/specification.md` once implemented.

## Phase 1 — Routing & Shell (2–3 days)
1. **Routes & redirects**
   - Introduce `/simple/1..4`, `/detail`, and redirect `/` → `/simple/1`.
   - Map legacy URLs (`/simulator`, `/bifurcation`, `/heatmap`, `/workbench`) to their step equivalents, preserving query params (`view`, `preset`, `active`, `overlays`, `wbv`).
   - Normalise unknown IDs (log warning + drop).
2. **Shell layout**
   - Build shared header (`branding`, `stepper`, `detail toggle`).
   - Persist mode + last step via prefs; keep URL + history in sync when toggling steps.
   - Implement `Next/Back` CTA bar (disabled when step incomplete).
3. **Infrastructure**
   - Create base CSS/layout modules reusable by all steps.
   - Set up simple view container that lazy-loads step modules.

## Phase 2 — Step ① 設計 (2 days)
1. Embed card editor (from legacy Workbench) with concentration↔ratio toggles for Nb/ETSSB.
2. Provide preset selector (SI baseline, Nb titration, ETSSB booster) that updates active card.
3. Surface derived summary and validations inline; mark step complete when inputs valid.
4. Auto-save form changes (debounced) through migration helpers.

## Phase 3 — Step ② 即時予測 (2–3 days)
1. Integrate Simulator time-series engine inside the step (reuse `web/simulator/` rendering logic).
2. Left panel: derived metrics (baseline vs active, Δ badges, dominance label).
3. Right panel: overlay manager (select existing cards, quick add), CTA buttons to Step④ views (`view=bifurcation`, `view=heatmap`).
4. Ensure state updates instantly when inputs in Step① change; show loading indicators during WASM runs.

## Phase 4 — Step ③ 同定 (2 days)
1. Simplify Fit UI: drag/drop CSV, minimal options by default, expandable advanced settings.
2. Embed titration helper beneath Fit section; results update active card.
3. After successful Fit/Titration, update workflow state to `done`, append history, and prompt user to proceed.
4. Provide link to open Detail (legacy) fit view for fine-tuning.

## Phase 5 — Step ④ 比較 (3 days)
1. Embed bifurcation view and heatmap view as switchable tabs (reuse existing logic from `/web/bifurcation/`, `/web/heatmap/`).
2. Overlay table showing baseline/active/overlays metrics; allow quick enable/disable.
3. Controls for presets, axis overrides, and outputs (CSV/PNG placeholders).
4. Keep Step② overlay selections synced; step completes once comparison rendered (or user acknowledges baseline-only).

## Phase 6 — Detail (Legacy) View Updates (1–2 days)
1. Add compact step indicator + mode banner so users know they are in legacy view.
2. Sync new schema (inputs toggles, derived cache) with existing form fields.
3. Ensure switches between Simple ⇄ Detail keep state identical (no extra conversions).

## Phase 7 — KaTeX Integration (1 day)
1. Load KaTeX CSS/JS from CDN with graceful fallback.
2. Author reusable math explainer fragment (k₁′, b′, g′, β′, ΔΔG↔r, Nb/ETSSB conversions).
3. Render explainer in Step① footer and Detail view collapsible panel; expose fallback text when CDN unavailable.

## Phase 8 — QA & Documentation (2 days)
1. Enhance regression harness with fetch shim; add migration + step navigation tests.
2. Manual QA matrix: Chrome/Firefox/Edge, first-time user, legacy URL redirects, concentration toggles, Fit/Titration flows, accessibility (keyboard + screen reader for KaTeX output).
3. Update `docs/specification.md`, `docs/modification-workbench-development-plan.md`, `docs/modification-workbench-roadmap.md`, and changelog.
4. Capture release notes summarising new flow vs legacy view.

## Deliverables Checklist
- [x] Schema migration and helpers (Phase 0).
- [x] Routing + header shell with redirects (Phase 1).
- [x] Step ① 設計 implemented (Phase 2).
- [x] Steps ②–④ implemented and wired (Phases 3–5).
- [x] Detail (legacy) parity adjustments (Phase 6).
- [x] KaTeX math explainer with Japanese UI (Phase 7).
- [ ] QA + documentation updates (Phase 8).

Follow the phases sequentially; if scope changes again, update this document and AGENTS.md immediately.
