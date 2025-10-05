// Step 1: 設計 — Hypothesis & Card Editing

export async function render(container) {
  container.innerHTML = `
    <h1 class="simple-step-title">設計 — Hypothesis & Card Editing</h1>
    <p class="simple-step-description">
      修飾カード編集、濃度↔比率トグル、プリセット選択
    </p>

    <div class="placeholder-content">
      <h3>Step 1 — Phase 2 Implementation</h3>
      <p>This step will embed the card editor from the legacy Workbench with concentration↔ratio toggles.</p>
      <ul style="text-align: left; max-width: 600px; margin: 1rem auto; color: var(--gray-600);">
        <li>Modification card editor with r_assoc / r_poly / r_nick inputs</li>
        <li>Concentration (Nb/ETSSB) ↔ Ratio toggle</li>
        <li>Preset selector (SI baseline, Nb titration, ETSSB booster)</li>
        <li>Derived summary and validation inline</li>
        <li>Auto-save form changes (debounced)</li>
      </ul>
    </div>
  `;
}
