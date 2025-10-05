// Step 4: 比較 — Bifurcation & Heatmap

export async function render(container) {
  container.innerHTML = `
    <h1 class="simple-step-title">比較 — Bifurcation & Heatmap</h1>
    <p class="simple-step-description">
      分岐図 / ヒートマップ / オーバーレイ管理
    </p>

    <div class="placeholder-content">
      <h3>Step 4 — Phase 5 Implementation</h3>
      <p>This step will embed bifurcation and heatmap views as switchable tabs.</p>
      <ul style="text-align: left; max-width: 600px; margin: 1rem auto; color: var(--gray-600);">
        <li>Reuse existing logic from /web/bifurcation/ and /web/heatmap/</li>
        <li>Overlay table showing baseline/active/overlays metrics</li>
        <li>Controls for presets, axis overrides, and outputs</li>
        <li>Sync with Step 2 overlay selections</li>
        <li>CSV/PNG export placeholders</li>
      </ul>
    </div>
  `;
}
