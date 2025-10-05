// Step 3: 同定 — Fit & Titration

export async function render(container) {
  container.innerHTML = `
    <h1 class="simple-step-title">同定 — Fit & Titration</h1>
    <p class="simple-step-description">
      CSV ドロップ → Fit → 結果反映、滴定サブセクション
    </p>

    <div class="placeholder-content">
      <h3>Step 3 — Phase 4 Implementation</h3>
      <p>This step will simplify the Fit UI with drag/drop CSV and minimal options.</p>
      <ul style="text-align: left; max-width: 600px; margin: 1rem auto; color: var(--gray-600);">
        <li>Drag/drop CSV with minimal options by default</li>
        <li>Expandable advanced settings</li>
        <li>Titration helper beneath Fit section</li>
        <li>Results update active card</li>
        <li>Link to open Detail (legacy) fit view for fine-tuning</li>
      </ul>
    </div>
  `;
}
