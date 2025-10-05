# Workbench Simple Mode Implementation Plan

_Prepared: 2025-09-27_

This plan translates `docs/new-Implementation-request.md` into actionable work. It focuses on introducing a guided “Simple Mode” while keeping the existing interface as “Detail Mode”, synchronising both views, and extending the Workbench math layer (Nb / ETSSB conversions, derived metrics, KaTeX-rendered explanations).

## 0. Goals & Guardrails
- Deliver the success conditions defined in §1.2 of the implementation request (guided flow, Nb/ETSSB concentration toggles, ΔΔG consistency checks, derived metric surfacing, deep-link continuity).
- Preserve backwards compatibility for existing cards, storage keys, and deep links (`preset`, `active`, `overlays`).
- All math-heavy explanations in the Workbench are rendered with KaTeX loaded from CDN (`https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/katex.min.css` / `katex.min.js`). No build step or local bundling required.
- Keep the regression harness and legacy `simulate` untouched, extending only the Workbench front end and state utilities.

## 1. Phased Breakdown

### Phase A — Specification & Data Model Alignment (1–2 days)
1. Audit current Workbench state schema (`web/modifications.js`) and identify required fields for:
   - Mode persistence (`mode: 'simple' | 'detail'`).
   - Nb / ETSSB concentration inputs (`nbConc`, `nbInputMode`, `ssbConc`, `ssbInputMode`).
   - Derived caches (`derived.k1Prime`, `derived.betaPrime`, `derived.gPrime`, `derived.fOpen`, `derived.dominance`).
   - Stepper status (`progress.design`, `progress.predict`, `progress.identify`, `progress.compare`).
2. Design migration logic for existing cards (default to ratio input, copy legacy derived data if present).
3. Update documentation (spec + roadmap) with new fields and KaTeX requirement.

### Phase B — Simple Mode Shell & Navigation (2–3 days)
1. Implement `mode=simple|detail` routing in `workbench/index.html` with header toggle and localStorage persistence.
2. Build shared stepper component with statuses and CTA controls; integrate with store progress state.
3. Layout Simple Mode sections: header, step area, footer explanation placeholder (KaTeX container).
4. Wire deep-link synchronisation (`wbv=2`) so outgoing links include the new version tag; adjust receivers to accept `wbv` ≥ 1.

### Phase C — Step Implementations (main effort, 5–7 days)
1. Step① 設計
   - Preset picker (SI defaults + new onboarding set for Nb / ETSSB scenarios).
   - Concentration/ratio forms with inline validation (bounds per request) and helper copy.
   - Auto-save to active card; mark step `done` when inputs valid.
2. Step② 予測
   - Derived parameter computation (reuse `computeEffectiveParameters`; extend for dominance classification).
   - Live preview cards (baseline vs active) with Δ display.
   - Call-out to run Simulator/Bifurcation/Heatmap; ensure KaTeX formula references.
3. Step③ 同定
   - Streamlined CSV import (reuse existing importer with simplified UI wrapper).
   - Minimal option set (Huber toggle, baseline window) with advanced link to Detail Mode.
   - On successful fit, propagate results to card, append to history, flag step `done`.
4. Step④ 比較
   - Library table filtered to overlays; quick actions for deep links.
   - Binding summary table (active vs overlays) with derived metrics.

### Phase D — Detail Mode Enhancements (2–3 days)
1. Insert memo block / compact stepper to mirror Simple Mode progress.
2. Add concentration/ratio toggles for Nb / ETSSB forms; keep layout consistent.
3. Update tooltips and validation messages; ensure shared KaTeX explanation section accessible here too.

### Phase E — KaTeX Integration & Documentation (1 day)
1. Inject KaTeX `<link>` / `<script>` tags in Workbench HTML; lazy-load explanation markup when section visible.
2. Author math explanation Markdown/HTML fragments (k₁′, b′, g′, β′, ΔΔG ↔ r conversions, Nb hill fit, ETSSB opening probability).
3. Verify rendering in both modes and adjust typography for accessibility.

### Phase F — QA, Regression, Docs Sync (1–2 days)
1. Extend `tests/regression.js` once fetch shim added to at least cover `computeEffectiveParameters` invariants invoked via store.
2. Manual test matrix covering stepper flow, deep links, KaTeX fallback, localStorage migrations.
3. Update docs (`specification.md`, roadmap, tests) and mark checked items.

## 2. Dependencies & Risks
- **Fetch shim** remains prerequisite for automated regression; perform manual smoke tests until resolved.
- Ensure localStorage migrations are idempotent; include version flag on card objects.
- KaTeX CDN dependency introduces offline risk; include graceful degradation (static formulas as `<code>` when KaTeX load fails).

## 3. Deliverables Checklist
- [ ] Updated Workbench store schema and migration logic.
- [ ] Simple Mode UI with four-step guided flow.
- [ ] Detail Mode parity (toggles, memo, mini stepper).
- [ ] Math explanation section rendered via KaTeX in both modes.
- [ ] Deep-link updates and docs aligned.
- [ ] QA notes and regression harness adjustments (if feasible).

Review and adjust timeline once implementation begins; sync `docs/modification-workbench-development-plan.md` after each phase completes.

