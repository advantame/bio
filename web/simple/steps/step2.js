// Step 2: 即時予測 — Time Series & Quick Comparison

export async function render(container) {
  container.innerHTML = `
    <h1 class="simple-step-title">即時予測 — Time Series & Quick Comparison</h1>
    <p class="simple-step-description">
      時間波形・派生パラメータ・簡易比較
    </p>

    <div class="placeholder-content">
      <h3>Step 2 — Phase 3 Implementation</h3>
      <p>This step will integrate the Simulator time-series engine inside the step view.</p>
      <ul style="text-align: left; max-width: 600px; margin: 1rem auto; color: var(--gray-600);">
        <li>Reuse /web/simulator/ rendering logic</li>
        <li>Left panel: derived metrics (baseline vs active, Δ badges)</li>
        <li>Right panel: overlay manager and CTAs to Step 4</li>
        <li>Loading indicators during WASM runs</li>
        <li>State updates instantly when Step 1 inputs change</li>
      </ul>
    </div>
  `;
}
