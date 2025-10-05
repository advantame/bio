// Step 1: 設計 — Hypothesis & Card Editing

import {
  loadModifications,
  saveModifications,
  upsertModification,
  deleteModification,
  getActiveModificationId,
  setActiveModificationId,
  computeEffectiveParameters,
  resolveRAssoc,
  resolveDeltaFromRAssoc,
  formatDominanceText,
  GAS_CONSTANT_KCAL,
} from '../../modifications.js';

import { STEP1_EXPLANATION, autoRenderMath } from '../mathExplainer.js';

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

// Baseline enzyme concentrations (nM)
const BASELINE_ENZYMES = {
  Nb_nM: 32.5, // rec baseline
  ETSSB_nM: 3.7, // pol baseline
};

// Presets
const PRESETS = {
  si_baseline: {
    label: 'SI Baseline',
    inputs: {
      r_assoc: 1,
      r_poly: 1,
      r_nick: 1,
      deltaDeltaGAssoc: null,
      deltaDeltaGFold: null,
      temperatureC: 37,
      useHairpin: false,
      assocLock: 'r',
      Nb_nM: BASELINE_ENZYMES.Nb_nM,
      ETSSB_nM: BASELINE_ENZYMES.ETSSB_nM,
      aminoAcid: null,
      linker: null,
    },
  },
  nb_titration: {
    label: 'Nb Titration',
    inputs: {
      r_assoc: 1,
      r_poly: 1,
      r_nick: 2, // 2x Nb concentration
      deltaDeltaGAssoc: null,
      deltaDeltaGFold: null,
      temperatureC: 37,
      useHairpin: false,
      assocLock: 'r',
      Nb_nM: BASELINE_ENZYMES.Nb_nM * 2,
      ETSSB_nM: BASELINE_ENZYMES.ETSSB_nM,
      aminoAcid: null,
      linker: null,
    },
  },
  etssb_booster: {
    label: 'ETSSB Booster',
    inputs: {
      r_assoc: 1,
      r_poly: 1.5, // 1.5x ETSSB
      r_nick: 1,
      deltaDeltaGAssoc: null,
      deltaDeltaGFold: null,
      temperatureC: 37,
      useHairpin: false,
      assocLock: 'r',
      Nb_nM: BASELINE_ENZYMES.Nb_nM,
      ETSSB_nM: BASELINE_ENZYMES.ETSSB_nM * 1.5,
      aminoAcid: null,
      linker: null,
    },
  },
};

let selectedId = null;
let suppressUpdates = false;
let saveDebounceTimer = null;
let useConcentrationMode = false; // Toggle between concentration and ratio inputs

export async function render(container) {
  // Load CSS
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './steps/step1.css';
  document.head.appendChild(link);

  // Build UI
  container.innerHTML = `
    <h1 class="simple-step-title">設計 — Hypothesis & Card Editing</h1>
    <p class="simple-step-description">
      修飾カードの編集、濃度↔比率トグル、プリセット選択
    </p>

    <div class="step1-layout">
      <!-- Left: Card List -->
      <div>
        <h3 style="margin: 0 0 0.75rem 0; font-size: 1rem; color: #374151;">修飾カード一覧</h3>
        <div id="step1CardList" class="step1-card-list"></div>
        <div class="step1-card-actions">
          <button id="step1NewCard" class="primary">新規作成</button>
          <button id="step1DeleteCard">削除</button>
        </div>
      </div>

      <!-- Right: Editor -->
      <div class="step1-editor">
        <div id="step1EditorContent">
          <p style="color: #94a3b8; text-align: center; padding: 2rem;">
            Select a card or create a new one
          </p>
        </div>
      </div>
    </div>
  `;

  // Initialize
  await init();
}

async function init() {
  const activeId = getActiveModificationId();
  if (activeId) {
    const mods = loadModifications();
    const activeMod = mods.find((m) => m.id === activeId);
    if (activeMod) {
      selectedId = activeId;
    }
  }

  renderCardList();
  renderEditor();
  attachEventListeners();
}

function renderCardList() {
  const listEl = document.getElementById('step1CardList');
  const mods = loadModifications();
  const activeId = getActiveModificationId();

  if (mods.length === 0) {
    listEl.innerHTML = '<p class="step1-note">まだ修飾カードがありません。新規作成して始めましょう。</p>';
    return;
  }

  listEl.innerHTML = '';
  mods.forEach((mod) => {
    const card = document.createElement('div');
    card.className = 'step1-mod-card';
    if (mod.id === selectedId) card.classList.add('active');

    const rAssoc = resolveRAssoc(mod);
    const rPoly = mod.inputs?.r_poly ?? mod.rPoly ?? 1;
    const rNick = mod.inputs?.r_nick ?? mod.rNick ?? 1;

    card.innerHTML = `
      <div class="step1-mod-card-title">
        ${mod.label || 'Untitled'}
        ${mod.id === activeId ? '<span style="color: #2563eb; font-size: 0.75rem; margin-left: 0.5rem;">●</span>' : ''}
      </div>
      <div class="step1-mod-card-meta">
        r_assoc: ${rAssoc.toFixed(2)} · r_poly: ${rPoly.toFixed(2)} · r_nick: ${rNick.toFixed(2)}
      </div>
    `;

    card.addEventListener('click', () => {
      selectedId = mod.id;
      renderCardList();
      renderEditor();
    });

    listEl.appendChild(card);
  });
}

function renderEditor() {
  const editorEl = document.getElementById('step1EditorContent');

  if (!selectedId) {
    editorEl.innerHTML = '<p style="color: #94a3b8; text-align: center; padding: 2rem;">カードを選択するか、新規作成してください</p>';
    return;
  }

  const mods = loadModifications();
  const mod = mods.find((m) => m.id === selectedId);

  if (!mod) {
    editorEl.innerHTML = '<p style="color: #ef4444; text-align: center; padding: 2rem;">カードが見つかりません</p>';
    return;
  }

  // Get current values (v2 schema aware)
  const label = mod.label || '';
  const aminoAcid = mod.inputs?.aminoAcid ?? mod.aminoAcid ?? '';
  const temperatureC = mod.inputs?.temperatureC ?? mod.temperatureC ?? 37;
  const deltaDeltaGAssoc = mod.inputs?.deltaDeltaGAssoc ?? mod.deltaDeltaGAssoc ?? '';
  const rAssoc = resolveRAssoc(mod);
  const rPoly = mod.inputs?.r_poly ?? mod.rPoly ?? 1;
  const rNick = mod.inputs?.r_nick ?? mod.rNick ?? 1;
  const Nb_nM = mod.inputs?.Nb_nM ?? BASELINE_ENZYMES.Nb_nM;
  const ETSSB_nM = mod.inputs?.ETSSB_nM ?? BASELINE_ENZYMES.ETSSB_nM;
  const deltaDeltaGFold = mod.inputs?.deltaDeltaGFold ?? mod.deltaDeltaGFold ?? '';
  const useHairpin = mod.inputs?.useHairpin ?? mod.useHairpin ?? false;
  const assocLock = mod.inputs?.assocLock ?? mod.assocSource ?? 'r';
  const notes = mod.notes ?? '';

  // Compute derived
  const derived = computeEffectiveParameters(BASELINE, mod);

  editorEl.innerHTML = `
    <!-- Preset Selector -->
    <div class="step1-section">
      <h3>プリセット</h3>
      <div class="step1-preset-selector">
        <button class="step1-preset-btn" data-preset="si_baseline">SI ベースライン</button>
        <button class="step1-preset-btn" data-preset="nb_titration">Nb 滴定</button>
        <button class="step1-preset-btn" data-preset="etssb_booster">ETSSB ブースター</button>
      </div>
    </div>

    <!-- Basic Info -->
    <div class="step1-section">
      <h3>基本情報</h3>
      <div class="step1-form">
        <label>
          ラベル
          <input type="text" id="step1Label" value="${label}" placeholder="例: Lys-Gly リンカー" required>
        </label>
        <label>
          アミノ酸
          <input type="text" id="step1Amino" value="${aminoAcid}" placeholder="Lys / Arg / カスタム">
        </label>
        <label>
          温度 [°C]
          <input type="number" id="step1Temp" value="${temperatureC}" step="0.1">
        </label>
      </div>
    </div>

    <!-- Association -->
    <div class="step1-section">
      <h3>結合親和性</h3>
      <div class="step1-form">
        <label id="step1DeltaAssocLabel">
          ΔΔG_assoc [kcal/mol]
          <div class="step1-input-lock">
            <input type="number" id="step1DeltaAssoc" value="${deltaDeltaGAssoc}" step="0.1" placeholder="optional">
            <span class="step1-lock-icon ${assocLock === 'delta' ? 'visible' : ''}" id="step1DeltaLock">🔒</span>
          </div>
        </label>
        <label id="step1RAssocLabel">
          r_assoc（比）
          <div class="step1-input-lock">
            <input type="number" id="step1RAssoc" value="${rAssoc}" step="0.01" min="0">
            <span class="step1-lock-icon ${assocLock === 'r' ? 'visible' : ''}" id="step1RAssocLock">🔒</span>
          </div>
        </label>
      </div>
    </div>

    <!-- Enzymes with Concentration/Ratio Toggle -->
    <div class="step1-section">
      <h3>酵素パラメータ</h3>

      <!-- Nb (Nickase) -->
      <div class="step1-toggle-group">
        <div class="step1-toggle-header">
          <h4>Nb（ニッカーゼ）</h4>
          <label class="step1-toggle-switch">
            <input type="checkbox" id="step1NbToggle" ${useConcentrationMode ? 'checked' : ''}>
            <span>${useConcentrationMode ? '濃度' : '比率'}</span>
          </label>
        </div>
        <div class="step1-form">
          <label id="step1NbLabel">
            ${useConcentrationMode ? 'Nb [nM]' : 'r_nick'}
            <input type="number" id="step1Nb" value="${useConcentrationMode ? Nb_nM : rNick}" step="${useConcentrationMode ? '0.1' : '0.01'}" min="0">
          </label>
        </div>
        <p class="step1-note">
          ${useConcentrationMode ? `比率: ${rNick.toFixed(2)}（ベースライン: ${BASELINE_ENZYMES.Nb_nM} nM）` : `濃度: ${Nb_nM.toFixed(1)} nM`}
        </p>
      </div>

      <!-- ETSSB (Polymerase assist) -->
      <div class="step1-toggle-group">
        <div class="step1-toggle-header">
          <h4>ETSSB（ポリメラーゼ補助）</h4>
          <label class="step1-toggle-switch">
            <input type="checkbox" id="step1ETSSBToggle" ${useConcentrationMode ? 'checked' : ''}>
            <span>${useConcentrationMode ? '濃度' : '比率'}</span>
          </label>
        </div>
        <div class="step1-form">
          <label id="step1ETSSBLabel">
            ${useConcentrationMode ? 'ETSSB [nM]' : 'r_poly'}
            <input type="number" id="step1ETSSB" value="${useConcentrationMode ? ETSSB_nM : rPoly}" step="${useConcentrationMode ? '0.1' : '0.01'}" min="0">
          </label>
        </div>
        <p class="step1-note">
          ${useConcentrationMode ? `比率: ${rPoly.toFixed(2)}（ベースライン: ${BASELINE_ENZYMES.ETSSB_nM} nM）` : `濃度: ${ETSSB_nM.toFixed(1)} nM`}
        </p>
      </div>
    </div>

    <!-- Hairpin (optional) -->
    <div class="step1-section">
      <h3>ヘアピン補正（オプション）</h3>
      <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem;">
        <input type="checkbox" id="step1Hairpin" ${useHairpin ? 'checked' : ''}>
        <label for="step1Hairpin" style="margin: 0; cursor: pointer;">ヘアピン折りたたみ補正を適用</label>
      </div>
      <div class="step1-form">
        <label>
          ΔΔG_fold [kcal/mol]
          <input type="number" id="step1DeltaFold" value="${deltaDeltaGFold}" step="0.1" placeholder="optional" ${!useHairpin ? 'disabled' : ''}>
        </label>
      </div>
      ${useHairpin && derived.hairpinFactor !== 1 ? `<p class="step1-note">f_open = ${derived.hairpinFactor.toFixed(3)} (applied to g only)</p>` : ''}
    </div>

    <!-- Notes -->
    <div class="step1-section">
      <h3>メモ</h3>
      <textarea id="step1Notes" rows="3" style="width: 100%; padding: 0.5rem; border: 1px solid #cbd5e1; border-radius: 0.375rem; font-family: inherit;" placeholder="自由記述欄">${notes}</textarea>
    </div>

    <!-- Derived Parameters -->
    <div class="step1-section">
      <h3>派生パラメータ</h3>
      <div class="step1-derived-grid">
        <div class="step1-derived-item">
          <h4>k₁′</h4>
          <p>${formatScientific(derived.k1Eff)} nM⁻¹min⁻¹</p>
        </div>
        <div class="step1-derived-item">
          <h4>b′</h4>
          <p>${formatScientific(derived.bEff)} nM⁻¹</p>
        </div>
        <div class="step1-derived-item">
          <h4>g′</h4>
          <p>${derived.gEff.toFixed(3)}</p>
        </div>
        ${useHairpin ? `
        <div class="step1-derived-item">
          <h4>g′·f_open</h4>
          <p>${derived.gEffFold.toFixed(3)}</p>
        </div>
        ` : ''}
        <div class="step1-derived-item">
          <h4>β′</h4>
          <p>${derived.betaEff.toFixed(3)}</p>
        </div>
        <div class="step1-derived-item">
          <h4>支配因子</h4>
          <p>${formatDominanceText(derived.dominance)}</p>
        </div>
      </div>
    </div>

    <!-- Validation Status -->
    <div id="step1ValidationStatus"></div>

    <!-- Actions -->
    <div style="display: flex; gap: 0.75rem; margin-top: 1.5rem;">
      <button id="step1SetActive" class="step1-preset-btn" style="flex: 1; background: #2563eb; color: white; border-color: #2563eb;">
        アクティブに設定
      </button>
      <button id="step1ResetDefaults" class="step1-preset-btn" style="flex: 1;">
        SI デフォルトにリセット
      </button>
    </div>

    <!-- Explanation Section -->
    <div class="step1-section step1-explanation" style="margin-top: 2rem; padding: 1.5rem; background: #f8fafc; border-radius: 0.5rem; border: 1px solid #e2e8f0;">
      <div id="step1ExplanationContent">${STEP1_EXPLANATION}</div>
    </div>
  `;

  attachEditorListeners();
  updateValidationStatus();

  // Render math in explanation
  setTimeout(() => {
    const explainer = document.getElementById('step1ExplanationContent');
    if (explainer) autoRenderMath(explainer);
  }, 150);
}

function attachEventListeners() {
  document.getElementById('step1NewCard')?.addEventListener('click', createNewCard);
  document.getElementById('step1DeleteCard')?.addEventListener('click', deleteCurrentCard);
}

function attachEditorListeners() {
  // Preset buttons
  document.querySelectorAll('.step1-preset-btn[data-preset]').forEach((btn) => {
    btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
  });

  // Form inputs
  const inputs = [
    'step1Label',
    'step1Amino',
    'step1Temp',
    'step1DeltaAssoc',
    'step1RAssoc',
    'step1Nb',
    'step1ETSSB',
    'step1DeltaFold',
    'step1Notes',
  ];

  inputs.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', handleInputChange);
    }
  });

  // Toggles
  document.getElementById('step1Hairpin')?.addEventListener('change', handleInputChange);
  document.getElementById('step1NbToggle')?.addEventListener('change', toggleNbMode);
  document.getElementById('step1ETSSBToggle')?.addEventListener('change', toggleETSSBMode);

  // Actions
  document.getElementById('step1SetActive')?.addEventListener('click', setAsActive);
  document.getElementById('step1ResetDefaults')?.addEventListener('click', resetToDefaults);
}

function createNewCard() {
  const id = crypto.randomUUID ? crypto.randomUUID() : `mod-${Date.now()}`;
  const newMod = {
    schemaVersion: 2,
    id,
    label: 'New modification',
    inputs: {
      r_assoc: 1,
      r_poly: 1,
      r_nick: 1,
      deltaDeltaGAssoc: null,
      deltaDeltaGFold: null,
      temperatureC: 37,
      useHairpin: false,
      assocLock: 'r',
      Nb_nM: BASELINE_ENZYMES.Nb_nM,
      ETSSB_nM: BASELINE_ENZYMES.ETSSB_nM,
      aminoAcid: null,
      linker: null,
    },
    derived: null,
    workflow: {
      fitHistory: [],
      titrationHistory: [],
      lastModified: Date.now(),
    },
    notes: '',
  };

  upsertModification(newMod);
  selectedId = id;
  renderCardList();
  renderEditor();
}

function deleteCurrentCard() {
  if (!selectedId) return;
  if (!confirm('Delete this modification?')) return;

  deleteModification(selectedId);
  selectedId = null;
  renderCardList();
  renderEditor();
}

function handleInputChange(e) {
  if (suppressUpdates) return;

  debounceSave(() => {
    const mods = loadModifications();
    const mod = mods.find((m) => m.id === selectedId);
    if (!mod) return;

    const updates = {
      ...mod,
      label: document.getElementById('step1Label')?.value || 'Untitled',
      inputs: {
        ...mod.inputs,
        aminoAcid: document.getElementById('step1Amino')?.value || null,
        temperatureC: parseFloat(document.getElementById('step1Temp')?.value) || 37,
        deltaDeltaGAssoc: parseFloat(document.getElementById('step1DeltaAssoc')?.value) || null,
        r_assoc: parseFloat(document.getElementById('step1RAssoc')?.value) || 1,
        deltaDeltaGFold: parseFloat(document.getElementById('step1DeltaFold')?.value) || null,
        useHairpin: document.getElementById('step1Hairpin')?.checked || false,
      },
      notes: document.getElementById('step1Notes')?.value || '',
    };

    // Handle Nb/ETSSB based on mode
    const nbValue = parseFloat(document.getElementById('step1Nb')?.value) || 0;
    const etssbValue = parseFloat(document.getElementById('step1ETSSB')?.value) || 0;

    if (useConcentrationMode) {
      updates.inputs.Nb_nM = nbValue;
      updates.inputs.ETSSB_nM = etssbValue;
      updates.inputs.r_nick = nbValue / BASELINE_ENZYMES.Nb_nM;
      updates.inputs.r_poly = etssbValue / BASELINE_ENZYMES.ETSSB_nM;
    } else {
      updates.inputs.r_nick = nbValue;
      updates.inputs.r_poly = etssbValue;
      updates.inputs.Nb_nM = nbValue * BASELINE_ENZYMES.Nb_nM;
      updates.inputs.ETSSB_nM = etssbValue * BASELINE_ENZYMES.ETSSB_nM;
    }

    upsertModification(updates);
    renderCardList();
    renderEditor();
  });
}

function toggleNbMode(e) {
  useConcentrationMode = e.target.checked;
  renderEditor();
}

function toggleETSSBMode(e) {
  useConcentrationMode = e.target.checked;
  renderEditor();
}

function applyPreset(presetKey) {
  const preset = PRESETS[presetKey];
  if (!preset) return;

  const mods = loadModifications();
  const mod = mods.find((m) => m.id === selectedId);
  if (!mod) return;

  const updates = {
    ...mod,
    label: preset.label,
    inputs: {
      ...mod.inputs,
      ...preset.inputs,
    },
  };

  upsertModification(updates);
  renderCardList();
  renderEditor();
}

function setAsActive() {
  if (!selectedId) return;
  setActiveModificationId(selectedId);
  renderCardList();
  updateValidationStatus();
}

function resetToDefaults() {
  applyPreset('si_baseline');
}

function updateValidationStatus() {
  const statusEl = document.getElementById('step1ValidationStatus');
  if (!statusEl) return;

  const mods = loadModifications();
  const mod = mods.find((m) => m.id === selectedId);
  if (!mod) return;

  const rAssoc = resolveRAssoc(mod);
  const rPoly = mod.inputs?.r_poly ?? mod.rPoly ?? 1;
  const rNick = mod.inputs?.r_nick ?? mod.rNick ?? 1;

  // Validation rules
  const hasLabel = mod.label && mod.label !== 'Untitled';
  const hasAssoc = rAssoc !== 1 || mod.inputs?.deltaDeltaGAssoc != null;
  const hasEnzyme = rPoly !== 1 || rNick !== 1;
  const ratiosValid = rPoly >= 0.05 && rPoly <= 20 && rNick >= 0.05 && rNick <= 20;

  const isValid = hasLabel && (hasAssoc || hasEnzyme) && ratiosValid;
  const isActive = selectedId === getActiveModificationId();

  if (isValid && isActive) {
    statusEl.innerHTML = `
      <div class="step1-status success">
        ✓ ステップ完了：カードが設定され、アクティブになっています
      </div>
    `;
  } else if (isValid && !isActive) {
    statusEl.innerHTML = `
      <div class="step1-status info">
        ⓘ カードは有効ですがアクティブではありません。「アクティブに設定」をクリックしてシミュレーションで使用してください。
      </div>
    `;
  } else {
    const issues = [];
    if (!hasLabel) issues.push('わかりやすいラベルを追加してください');
    if (!hasAssoc && !hasEnzyme) issues.push('少なくとも1つのパラメータ（結合親和性または酵素）を変更してください');
    if (!ratiosValid) issues.push('比率は 0.05 から 20 の間である必要があります');

    statusEl.innerHTML = `
      <div class="step1-status warning">
        ⚠ 検証エラー：${issues.join('、')}
      </div>
    `;
  }
}

function debounceSave(callback) {
  if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(callback, 300);
}

function formatScientific(num) {
  if (num >= 0.01) return num.toFixed(4);
  return num.toExponential(2);
}
