// Step 3: 同定 — Fit & Titration

import { parsePreyCsv, parseTitrationCsv } from '../../detail/fit/importer.js';
import { fitPreyDataset } from '../../detail/fit/prey_fit.js';
import { fitTitrationDataset } from '../../detail/fit/titration.js';
import {
  loadModifications,
  getActiveModificationId,
  upsertModification,
} from '../../modifications.js';

// Baseline parameters (SI Table S5)
const BASELINE = {
  pol: 3.7,
  rec: 32.5,
  G: 150,
  k1: 0.0020,
  k2: 0.0031,
  kN: 0.0210,
  kP: 0.0047,
  b: 0.000048,
  KmP: 34,
  N0: 10,
  P0: 10,
};

let preyData = null;
let preyFitResult = null;
let titrationData = null;
let titrationFitResult = null;

export async function render(container) {
  // Load CSS
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './steps/step3.css';
  document.head.appendChild(link);

  // Build UI
  container.innerHTML = `
    <h1 class="simple-step-title">同定 — Fit & Titration</h1>
    <p class="simple-step-description">
      CSV ドロップ → Fit → 結果反映、滴定サブセクション
    </p>

    <div class="step3-layout">
      <!-- Prey Fit Section -->
      <div class="step3-section">
        <h2>Prey Fit (Time Series)</h2>
        <p class="step3-help">Upload prey-only fluorescence CSV to estimate k₁′ and b′</p>

        <div id="step3PreyDropzone" class="step3-dropzone">
          <div class="step3-dropzone-content">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            <p>Drag & drop CSV file here</p>
            <p style="font-size: 0.75rem; color: #94a3b8;">or click to browse</p>
          </div>
          <input type="file" id="step3PreyFileInput" accept=".csv" style="display: none;">
        </div>

        <div id="step3PreyStatus" class="step3-status"></div>

        <!-- Advanced Options (Collapsible) -->
        <details class="step3-advanced">
          <summary>Advanced Options</summary>
          <div class="step3-form">
            <label>
              Time Unit
              <select id="step3PreyTimeUnit">
                <option value="s" selected>Seconds</option>
                <option value="min">Minutes</option>
              </select>
            </label>
            <label>
              Baseline Points
              <input type="number" id="step3PreyBaseline" value="10" min="1" max="100">
            </label>
            <label>
              Green Scale (nM/unit)
              <input type="number" id="step3PreyScale" value="1" step="0.1">
            </label>
            <label>
              Initial N₀ (nM)
              <input type="number" id="step3PreyN0" value="10" step="0.1">
            </label>
          </div>
        </details>

        <div class="step3-actions">
          <button id="step3PreyFit" class="step3-btn-primary" disabled>Run Fit</button>
        </div>

        <div id="step3PreyResult" class="step3-result"></div>
      </div>

      <!-- Titration Section -->
      <div class="step3-section">
        <h2>Titration (G:N Binding)</h2>
        <p class="step3-help">Upload titration CSV to estimate Ka (association constant)</p>

        <div id="step3TitrationDropzone" class="step3-dropzone">
          <div class="step3-dropzone-content">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            <p>Drag & drop CSV file here</p>
            <p style="font-size: 0.75rem; color: #94a3b8;">or click to browse</p>
          </div>
          <input type="file" id="step3TitrationFileInput" accept=".csv" style="display: none;">
        </div>

        <div id="step3TitrationStatus" class="step3-status"></div>

        <!-- Advanced Options (Collapsible) -->
        <details class="step3-advanced">
          <summary>Advanced Options</summary>
          <div class="step3-form">
            <label>
              Log Ka Min
              <input type="number" id="step3TitrationLogMin" value="-8" step="0.5">
            </label>
            <label>
              Log Ka Max
              <input type="number" id="step3TitrationLogMax" value="8" step="0.5">
            </label>
          </div>
        </details>

        <div class="step3-actions">
          <button id="step3TitrationFit" class="step3-btn-primary" disabled>Run Fit</button>
        </div>

        <div id="step3TitrationResult" class="step3-result"></div>
      </div>
    </div>

    <!-- Detail View Link -->
    <div class="step3-footer">
      <p style="color: #64748b; font-size: 0.875rem;">
        Need more control? Open the
        <a href="../detail/#fit" class="step3-link">Detail (Legacy) Fit View</a>
        for advanced options and diagnostics.
      </p>
    </div>
  `;

  // Set up event listeners
  setupPreyFit();
  setupTitration();
}

function setupPreyFit() {
  const dropzone = document.getElementById('step3PreyDropzone');
  const fileInput = document.getElementById('step3PreyFileInput');
  const fitBtn = document.getElementById('step3PreyFit');
  const statusEl = document.getElementById('step3PreyStatus');

  // Dropzone click
  dropzone.addEventListener('click', () => fileInput.click());

  // File input change
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) await handlePreyFile(file);
  });

  // Drag & drop
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) await handlePreyFile(file);
  });

  // Fit button
  fitBtn.addEventListener('click', runPreyFit);
}

function setupTitration() {
  const dropzone = document.getElementById('step3TitrationDropzone');
  const fileInput = document.getElementById('step3TitrationFileInput');
  const fitBtn = document.getElementById('step3TitrationFit');

  // Dropzone click
  dropzone.addEventListener('click', () => fileInput.click());

  // File input change
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) await handleTitrationFile(file);
  });

  // Drag & drop
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) await handleTitrationFile(file);
  });

  // Fit button
  fitBtn.addEventListener('click', runTitrationFit);
}

async function handlePreyFile(file) {
  const statusEl = document.getElementById('step3PreyStatus');
  const fitBtn = document.getElementById('step3PreyFit');

  try {
    const text = await file.text();
    const options = {
      timeUnit: document.getElementById('step3PreyTimeUnit').value,
      baselinePoints: parseInt(document.getElementById('step3PreyBaseline').value),
      greenScale: parseFloat(document.getElementById('step3PreyScale').value),
    };

    preyData = parsePreyCsv(text, options);

    statusEl.innerHTML = `
      <div class="step3-status-success">
        ✓ Loaded ${preyData.time.length} data points
        ${preyData.warnings.length > 0 ? `<br><small>⚠ ${preyData.warnings.length} warnings</small>` : ''}
      </div>
    `;
    fitBtn.disabled = false;
  } catch (err) {
    statusEl.innerHTML = `
      <div class="step3-status-error">
        ✗ Error: ${err.message}
      </div>
    `;
    fitBtn.disabled = true;
  }
}

async function handleTitrationFile(file) {
  const statusEl = document.getElementById('step3TitrationStatus');
  const fitBtn = document.getElementById('step3TitrationFit');

  try {
    const text = await file.text();
    titrationData = parseTitrationCsv(text);

    statusEl.innerHTML = `
      <div class="step3-status-success">
        ✓ Loaded ${titrationData.ligand.length} titration points
        ${titrationData.warnings.length > 0 ? `<br><small>⚠ ${titrationData.warnings.length} warnings</small>` : ''}
      </div>
    `;
    fitBtn.disabled = false;
  } catch (err) {
    statusEl.innerHTML = `
      <div class="step3-status-error">
        ✗ Error: ${err.message}
      </div>
    `;
    fitBtn.disabled = true;
  }
}

function runPreyFit() {
  if (!preyData) return;

  const resultEl = document.getElementById('step3PreyResult');

  try {
    const params = {
      pol: BASELINE.pol,
      G: BASELINE.G,
      N0: parseFloat(document.getElementById('step3PreyN0').value),
      loss: 'huber',
      huberDelta: 1.5,
    };

    preyFitResult = fitPreyDataset(preyData, params);

    const k1 = preyFitResult.k1;
    const b = preyFitResult.b;
    const r2 = preyFitResult.r2;

    resultEl.innerHTML = `
      <h3>Fit Results</h3>
      <div class="step3-result-grid">
        <div class="step3-result-item">
          <h4>k₁′</h4>
          <p>${formatScientific(k1.estimate)} nM⁻¹min⁻¹</p>
          <small>95% CI: [${formatScientific(k1.ci[0])}, ${formatScientific(k1.ci[1])}]</small>
        </div>
        <div class="step3-result-item">
          <h4>b′</h4>
          <p>${formatScientific(b.estimate)} nM⁻¹</p>
          <small>95% CI: [${formatScientific(b.ci[0])}, ${formatScientific(b.ci[1])}]</small>
        </div>
        <div class="step3-result-item">
          <h4>R²</h4>
          <p>${r2.toFixed(4)}</p>
        </div>
      </div>
      <div class="step3-actions">
        <button id="step3ApplyPreyFit" class="step3-btn-secondary">Apply to Active Card</button>
      </div>
    `;

    document.getElementById('step3ApplyPreyFit').addEventListener('click', applyPreyFitToCard);
  } catch (err) {
    resultEl.innerHTML = `
      <div class="step3-status-error">
        ✗ Fit failed: ${err.message}
      </div>
    `;
  }
}

function runTitrationFit() {
  if (!titrationData) return;

  const resultEl = document.getElementById('step3TitrationResult');

  try {
    const options = {
      logKaMin: parseFloat(document.getElementById('step3TitrationLogMin').value),
      logKaMax: parseFloat(document.getElementById('step3TitrationLogMax').value),
    };

    titrationFitResult = fitTitrationDataset(titrationData, options);

    const Ka = titrationFitResult.Ka;
    const F0 = titrationFitResult.F0;
    const dF = titrationFitResult.dF;
    const r2 = titrationFitResult.r2;

    resultEl.innerHTML = `
      <h3>Fit Results</h3>
      <div class="step3-result-grid">
        <div class="step3-result-item">
          <h4>Ka</h4>
          <p>${formatScientific(Ka.estimate)} nM⁻¹</p>
          <small>95% CI: [${formatScientific(Ka.ci[0])}, ${formatScientific(Ka.ci[1])}]</small>
        </div>
        <div class="step3-result-item">
          <h4>F₀</h4>
          <p>${F0.estimate.toFixed(2)}</p>
        </div>
        <div class="step3-result-item">
          <h4>ΔF</h4>
          <p>${dF.estimate.toFixed(2)}</p>
        </div>
        <div class="step3-result-item">
          <h4>R²</h4>
          <p>${r2.toFixed(4)}</p>
        </div>
      </div>
      <p style="color: #64748b; font-size: 0.875rem; margin-top: 1rem;">
        Titration results for reference only. Use Prey Fit to update active card parameters.
      </p>
    `;
  } catch (err) {
    resultEl.innerHTML = `
      <div class="step3-status-error">
        ✗ Fit failed: ${err.message}
      </div>
    `;
  }
}

function applyPreyFitToCard() {
  if (!preyFitResult) return;

  const activeId = getActiveModificationId();
  if (!activeId) {
    alert('No active modification card. Please set one in Step ①.');
    return;
  }

  const mods = loadModifications();
  const activeMod = mods.find((m) => m.id === activeId);
  if (!activeMod) {
    alert('Active modification not found.');
    return;
  }

  // Calculate ratios from fitted parameters
  const k1Ratio = preyFitResult.k1.estimate / BASELINE.k1;
  const bRatio = preyFitResult.b.estimate / BASELINE.b;

  // Update modification with fitted ratios
  const updated = {
    ...activeMod,
    label: activeMod.label || `Fitted ${new Date().toISOString().slice(0, 10)}`,
    inputs: {
      ...activeMod.inputs,
      // We don't directly set k1/b ratios in v2 schema
      // Instead, we could store in notes or workflow history
    },
    workflow: {
      ...activeMod.workflow,
      fitHistory: [
        ...(activeMod.workflow?.fitHistory || []),
        {
          timestamp: Date.now(),
          k1: preyFitResult.k1.estimate,
          b: preyFitResult.b.estimate,
          r2: preyFitResult.r2,
          k1Ratio,
          bRatio,
        },
      ],
      lastModified: Date.now(),
    },
    notes: `${activeMod.notes || ''}\n\nFit Results (${new Date().toLocaleString()}):\nk₁′ = ${formatScientific(preyFitResult.k1.estimate)} (${k1Ratio.toFixed(2)}× baseline)\nb′ = ${formatScientific(preyFitResult.b.estimate)} (${bRatio.toFixed(2)}× baseline)\nR² = ${preyFitResult.r2.toFixed(4)}`.trim(),
  };

  upsertModification(updated);

  alert(`Fit results added to "${activeMod.label}" notes and workflow history.\n\nNote: k₁′ and b′ ratios recorded for reference. To use these values in simulations, manually adjust association/enzyme parameters in Step ①.`);
}

function formatScientific(num) {
  if (num >= 0.01) return num.toFixed(4);
  return num.toExponential(2);
}
