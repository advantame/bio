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
1. **Current schema inventory**
   - Card fields in use (baseline as of Sept 2025):
     `id`, `label`, `amino`, `temperatureC`, `deltaDeltaGAssoc`, `rAssoc`, `rPoly`, `rNick`, `deltaDeltaGFold`, `linkerLength`, `linkerPolarity`, `notes`, `useHairpin`, plus fit/titration histories.
   - Global storage keys: `pp_workbench_modifications_v1`, `pp_workbench_active_mod_v1`, `pp_workbench_overlay_mods_v1`.
   - UI depends on top-level ratios (`rPoly`, `rNick`) for immediate simulation; helper utilities read only these scalar fields.
2. **New fields / structures (proposed additions)**
   - `schemaVersion` (number) per card to manage future migrations (default `1`, bump to `2` once upgraded).
   - `inputs`:
     - `assoc`: `{ mode: 'delta' | 'ratio', delta?: number, ratio?: number }` (mirrors 🔒 lock state).
     - `nb`: `{ mode: 'ratio' | 'concentration', ratio?: number, concentration?: { value: number, unit: 'u_per_ml' }, hillExponent?: number }`.
     - `ssb`: `{ mode: 'ratio' | 'concentration', ratio?: number, concentration?: { value: number, unit: 'ug_per_ml' }, hairpin?: { enabled: boolean, deltaGFold?: number } }`.
   - `derived`: `{ k1Prime, bPrime, gPrime, gPrimeFold, betaPrime, dominance, updatedAt }` (cached and reused across modes).
   - `workflow`: `{ design: 'incomplete'|'in_progress'|'done', predict: ..., identify: ..., compare: ... }`.
3. **Mode preference storage**
   - Introduce `pp_workbench_prefs_v1` with shape `{ mode: 'simple'|'detail', lastVisitedStep?: 'design'|'predict'|'identify'|'compare' }`.
   - Fallback to `simple` when key missing or invalid.
4. **Migration strategy**
   - Continue reading `pp_workbench_modifications_v1` but, on load, map legacy cards to the expanded structure:
     - Set `schemaVersion = 2`.
     - Populate `inputs.assoc` from whichever of `rAssoc` / `deltaDeltaGAssoc` was primary (existing lock state via heuristics: prefer ΔΔG when defined, else ratio).
     - Populate `inputs.nb.mode = 'ratio'` with value from `rNick`; set concentration fields to `null`.
     - Populate `inputs.ssb.mode = 'ratio'` with `rPoly`; carry over `deltaDeltaGFold` into `inputs.ssb.hairpin` for convenience.
     - Initialise `derived` block by recomputing via `computeEffectiveParameters`.
     - Initialise `workflow` to `{ design: 'in_progress', predict: 'incomplete', identify: 'incomplete', compare: 'incomplete' }` and mark steps as `done` when historical fit/titration data exists.
   - Persist upgraded cards back to localStorage once migration completes to keep runtime fast.
5. **Code touchpoints & helpers**
   - `web/modifications.js`
     - Add `loadWorkbenchPrefs` / `saveWorkbenchPrefs` for the new preference key.
     - Introduce `upgradeLegacyModifications(mods)` that returns `{ mods, changed }`, handles schemaVersion defaults, and normalises ratios (ensuring legacy callers still see `rPoly`, `rNick`, `rAssoc`).
     - Export convenience getters (`getAssocInputs(mod)`, `getNbInputs(mod)`, `getSsbInputs(mod)`) used by both modes.
     - Extend `computeEffectiveParameters` to read from `inputs.*` but continue populating top-level `rPoly` / `rNick` during migration for backward compatibility.
   - `web/workbench/workbench.js`
     - On bootstrap, call migration helper before rendering; wire new `workflow` state into forthcoming steppers.
     - Replace direct `mod.rPoly` / `mod.rNick` field reads with helper accessors where validation depends on the configured mode.
     - Capture derived cache writes (`mod.derived = { ... }`) whenever fit/titration completes or inputs change.
   - Shared constants: define enumerations for step states and input modes to avoid string drift.
6. **Documentation sync**
   - Update specification, roadmap, and tests docs (already noted) with explicit schema tables once implementation nears.
7. **Proposed helper signatures**
   ```js
   export function upgradeLegacyModifications(rawMods) {
     const upgraded = [];
     let changed = false;
     for (const mod of rawMods || []) {
       const next = normalizeModification(mod);
       if (next !== mod) changed = true;
       upgraded.push(next);
     }
     return { mods: upgraded, changed };
   }

   function normalizeModification(mod) {
     const schemaVersion = mod.schemaVersion ?? 1;
     if (schemaVersion >= 2) {
       return ensureDerivedCache(mod);
     }
     const upgraded = {
       ...mod,
       schemaVersion: 2,
       inputs: buildInputsFromLegacy(mod),
       derived: recomputeDerived(mod),
       workflow: inferWorkflow(mod),
     };
     return upgraded;
   }

   export function ensureDerivedCache(mod, baseParams = BASE_CONTEXT) {
     const computed = computeEffectiveParameters(baseParams, mod);
     return { ...mod, derived: { ...computed, updatedAt: Date.now() } };
   }
   ```
   - `buildInputsFromLegacy` sets default modes (`ratio`) and nests optional concentration placeholders.
   - `recomputeDerived` reuses `computeEffectiveParameters` but preserves top-level ratios for legacy callers until fully refactored.
   - `inferWorkflow` marks `identify` as `done` when `mod.fitHistory?.length` truthy; same for titration vs `compare` step readiness.
8. **Call-site adjustments (Phase A deliverable)**
   - Replace direct field access in `renderList`, `populateForm`, `populateDerived`, fit/titration handlers, and overlay exports with helper accessors so both ratios and concentration-driven modes remain consistent.
   - Ensure `updateMod` writes back through `upsertModification` with nested merge logic (e.g., when toggling concentration inputs, keep historical fit history and derived cache intact).
   - Audit `buildSimulationVariants` usage of `mod.rPoly` / `mod.rNick`; decide whether to read from `inputs` or continue relying on migration to keep top-level fields synced (the latter simplifies Phase A as long as normalization updates them).

### Phase B — Simple Mode Shell & Navigation (2–3 days)
1. **Routing & bootstrap**
   - Read `mode` query parameter (`simple`/`detail`) on load; fallback to stored preference (`pp_workbench_prefs_v1.mode`) or default `simple`.
   - Append/replace history state when user toggles modes so the URL stays in sync without full reload.
   - Guard against unknown values by coercing to `simple` and logging for debugging.
2. **Header toggles & layout chrome**
   - Add header bar with app title, mode toggle button, and link back to Simulator/Bifurcation/Heatmap.
   - Toggle button should visually indicate current mode and persist choice via `saveWorkbenchPrefs` (Phase A helper).
   - When switching to Detail Mode, hide Simple Mode wrapper and reveal existing layout (CSS class toggle to avoid DOM duplication).
3. **Stepper component**
   - Create reusable `<div class="wb-stepper">` driven by `mod.workflow` (fallback to defaults when null).
   - Each step cell shows label, state icon (🟡/🟢), and optional subtitle.
   - Provide `Next`/`Back` CTA row; hooking the CTAs updates workflow state and scrolls to target section.
   - Store `lastVisitedStep` in preferences so returning users resume where they left off.
4. **Simple Mode content skeleton**
   - Define four sections (`design`, `predict`, `identify`, `compare`) with minimal copy placeholders.
   - Each section should have dedicated container elements (`id="step-design"` etc.) for later wiring.
   - Include KaTeX-ready footer panel (`<section id="math-explainer" data-mode="simple">`) with blank content for Phase E.
5. **Navigation + deep links**
   - Update Library action buttons to include `wbv=2` and current `mode` plus selected `step` when generating URLs.
   - Ensure receivers (Simulator/Bifurcation/Heatmap) ignore unknown `mode`/`step` params but preserve `wbv` for future compatibility.
   - Add TIP banner describing the one-click pathway to detail mode for advanced options.
6. **Fallback behaviour**
   - If no modifications exist, Simple Mode should display an empty state encouraging creation (button reuses existing `addModBtn`).
   - When user switches back to Detail Mode, ensure forms reflect underlying card immediately (call `populateForm`).
   - Provide screen-reader friendly ordering (stepper before content) and ensure tab order cycles logically.

### Phase C — Step Implementations (main effort, 5–7 days)
1. **Step① 設計（Design）**
   - Presets:
     - Include SI baseline, “Nb titration” (pre-populates concentration fields), and “ETSSB booster”.
     - Selecting a preset immediately updates active card via migration helper; display toast confirming change.
   - Form inputs:
     - Associate toggle between ratio/ΔΔG (reuse existing lock UI but show inline formula snippet rendered via KaTeX).
     - Nb section: radio buttons for `比率` vs `濃度 (U/mL)`; when in concentration mode, show numeric input + recommended range helper text; compute ratio via helper and store both representations.
     - ETSSB section: similar ratio/concentration toggle with optional hairpin checkbox (auto-enables when hairpin concentration input present).
     - All inputs debounce-save to `updateMod` (500 ms) with optimistic UI; errors surface inline with `field-warning/field-error` classes.
   - Completion logic:
     - Step marked `done` when required fields valid (association + at least one of Nb/ETSSB in-range).
     - Persist to `workflow.design = 'done'` and advance to Step② when user clicks “次へ”.
2. **Step② 予測（Predict）**
   - Derived panel:
     - Display baseline vs active cards side-by-side showing k₁′, b′, g′, β′, dominance tags, and Δ% badges.
     - Provide toggle to include overlays (limited to 3) with preview chips.
   - Quick actions:
     - Buttons: “Simulatorで確認”, “分岐図で比較”, “ヒートマップを見る”; each opens new tab with `wbv=2`, `mode=simple`, and serialized overlays.
     - Show KaTeX teaser referencing formulas used (links to footer explanation).
   - Completion logic: mark `predict` done once derived metrics computed without warnings (i.e., ratios within supported range). If warnings present, display caution but allow manual override via “完了としてマーク” button.
3. **Step③ 同定（Identify/Fit）**
   - UI simplification:
     - Keep drag-drop but hide advanced importer options behind expandable “詳細設定” matching Detail Mode.
     - Default inputs set from active card (pol, G, N0). Provide inline description of expected CSV headers.
   - Flow:
     - On file load, run importer + fit; show progress indicator.
     - After successful fit, show summary cards (r_poly, r_nick updates, CI badges). Offer “詳細モードで編集” link to jump to legacy fit view pre-populated.
   - State updates:
     - Append to `fitHistory`, update `derived`, switch workflow step to `done`.
     - If fit fails, keep step `in_progress` and surface retry guidance.
4. **Step④ 比較（Compare）**
   - Overlay selection: embed condensed library table showing active + up to 4 overlays with checkboxes; integrates with global library state.
   - Comparison table: columns for baseline/active/overlays, rows for k₁′, b′, g′, β′, dominance, r_assoc, Nb conc, ETSSB conc; highlight deltas vs baseline.
   - Export options: “CSVダウンロード” for comparison snapshot (mirrors reporting milestone) and deep links for bifurcation/heatmap with prefilled overlays.
   - Completion logic: mark `compare` done once at least one overlay is selected or user explicitly confirms they only need baseline vs active.
5. **Shared behaviours**
   - Each step records timestamps (`workflowAudit` array) for analytics; optional but keep structure ready.
   - CTA bar respects validation: disable “次へ” when current step has blocking errors.
   - Provide contextual help tooltips linking to Detail Mode sections.

### Phase D — Detail Mode Enhancements (2–3 days)
1. **Compact stepper & memo**
   - Add a slim step indicator above the existing form using the same `workflow` state (icons only, hover reveals labels) so advanced users stay aligned with Simple Mode progress.
   - Provide memo textarea (per card) for lab notes; store in `mod.notes` (already present) but surface with character count + autosave.
2. **Input toggles parity**
   - Extend existing form to show Nb/ETSSB ratio↔濃度 toggles identical to Simple Mode, reusing helper components to avoid divergence.
   - When toggles switch to concentration mode, display derived ratio read-only field so advanced users can verify conversions.
3. **KaTeX access & tooltips**
   - Insert collapsible “数式リファレンス” panel in Detail Mode that reuses the KaTeX footer fragment.
   - Update tooltips (hairpin, ratio bounds, ΔΔG warnings) to reference the same wording as Simple Mode for consistency.
4. **Migration bindings**
   - Ensure conversions update both nested `inputs.*` and legacy top-level fields until all call sites refactored.
   - Add developer console warnings when legacy-only fields are edited to encourage future cleanup.

### Phase E — KaTeX Integration & Documentation (1 day)
1. **Asset loading**
   - Insert `<link rel="stylesheet">` and `<script>` tags pointing to `https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/…`; defer script execution and trigger `renderMathInElement` once loaded.
   - Provide fallback CSS class `.katex-fallback` to display plaintext formulas if CDN fails (set via timeout/error handler).
2. **Content authoring**
   - Create `web/workbench/math-explainer.html` partial or inline template strings detailing:
     - SI equations for k₁′, b′, g′, β′.
     - ΔΔG↔r conversion (`r = e^{-ΔΔG/(RT)}`) with temperature note.
     - Nb concentration→ratio mapping (power-law / Hill alternative).
     - ETSSB concentration→f_open and polymerase scaling relationships.
   - Each section includes short Japanese explanation + formula block (KaTeX `\[` … `\]`).
3. **Rendering pipeline**
   - When Simple Mode footer mounts, inject explainer HTML and call KaTeX render; allow Detail Mode panel to reuse the same markup.
   - Ensure client-side navigation (mode toggles) does not double render; guard with flag.
   - Add basic typography tweaks (font size, spacing) and accessible descriptions (ARIA labels).
4. **Documentation**
   - Update `docs/specification.md` with reference to KaTeX CDN version and failure fallback.
   - Note testing requirement in `docs/tests.md` for verifying KaTeX load failure path.

### Phase F — QA, Regression, Docs Sync (1–2 days)
1. **Automated checks**
   - Introduce fetch shim (Node ≥18 with `--experimental-fetch` or lightweight polyfill) so regression script can import `web/core.js`.
   - Add new scenario exercising migration helper: load synthetic legacy card JSON, run upgrade, assert nested inputs + top-level ratios align.
   - Extend regression script to simulate Simple Mode navigation using JSDOM or modular helper (focus on compute-level checks if DOM heavy).
2. **Manual QA matrix**
   - Browsers: latest Chrome, Firefox, Edge; confirm mode toggling, stepper progression, deep links, KaTeX rendering, offline fallback.
   - Scenario coverage: first-time user (no cards), legacy cards migration, concentration toggles, fit success/failure paths, overlay comparison.
   - Accessibility: keyboard navigation through steppers, screen reader labels for KaTeX formulas, color contrast for warnings.
3. **Docs & release notes**
   - Update `docs/modification-workbench-development-plan.md` / roadmap checklist to mark Milestone D tasks done.
   - Add KaTeX usage notes and new schema tables to `docs/specification.md`.
   - Prepare changelog entry summarizing Simple Mode features and migration guidance.

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
