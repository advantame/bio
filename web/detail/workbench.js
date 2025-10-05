import {
  buildSimulationVariants,
  computeEffectiveParameters,
  deleteModification,
  findModification,
  formatDominanceText,
  getActiveModificationId,
  getOverlayModificationIds,
  loadModifications,
  pruneOverlayIds,
  resolveDeltaFromRAssoc,
  resolveRAssoc,
  setActiveModificationId,
  setOverlayModificationIds,
  upsertModification,
} from '../modifications.js';
import { parsePreyCsvFile, parseTitrationCsvFile } from './fit/importer.js';
import { fitPreyDataset, deriveModificationFactors } from './fit/prey_fit.js';
import { fitTitrationDataset, deriveRAssoc } from './fit/titration.js';
import { computeDescriptors, passesFilters, CHARGE_FILTER_OPTIONS } from './library.js';

const BASE_CONTEXT = {
  pol: 3.7,
  rec: 32.5,
  k1: 0.0020,
  b: 0.000048,
  G: 150,
  k2: 0.0031,
  KmP: 34,
  N0: 10,
};

const RATIO_WARN_MIN = 0.2;
const RATIO_WARN_MAX = 5;
const RATIO_ERR_MIN = 0.05;
const RATIO_ERR_MAX = 20;
const TWO_DECIMALS = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

const elements = {
  list: document.getElementById('modList'),
  chargeFilter: document.getElementById('libraryChargeFilter'),
  librarySetActive: document.getElementById('librarySetActive'),
  libraryApplyOverlays: document.getElementById('libraryApplyOverlays'),
  libraryOpenBifurcation: document.getElementById('libraryOpenBifurcation'),
  libraryOpenHeatmap: document.getElementById('libraryOpenHeatmap'),
  addBtn: document.getElementById('addModBtn'),
  deleteBtn: document.getElementById('deleteModBtn'),
  setActiveBtn: document.getElementById('setActiveBtn'),
  clearActiveBtn: document.getElementById('clearActiveBtn'),
  overlayToggle: document.getElementById('overlayToggle'),
  hairpinToggle: document.getElementById('hairpinToggle'),
  resetDefaultsBtn: document.getElementById('resetDefaultsBtn'),
  hairpinInfo: document.getElementById('hairpinInfo'),
  hairpinValue: document.getElementById('hairpinValue'),
  form: document.getElementById('modForm'),
  warningText: document.getElementById('warningText'),
  derivedGrid: document.getElementById('derivedGrid'),
  bindingTable: document.getElementById('bindingTable'),
  statusBanner: document.getElementById('statusBanner'),
  fields: {
    label: document.getElementById('label'),
    amino: document.getElementById('amino'),
    temperature: document.getElementById('temperature'),
    deltaAssoc: document.getElementById('deltaAssoc'),
    deltaAssocLabel: document.getElementById('deltaAssocLabel'),
    rAssoc: document.getElementById('rAssoc'),
    rAssocLabel: document.getElementById('rAssocLabel'),
    deltaAssocLock: document.getElementById('deltaAssocLock'),
    rAssocLock: document.getElementById('rAssocLock'),
    rPoly: document.getElementById('rPoly'),
    rNick: document.getElementById('rNick'),
    deltaFold: document.getElementById('deltaFold'),
    linkerLength: document.getElementById('linkerLength'),
    linkerPolarity: document.getElementById('linkerPolarity'),
    notes: document.getElementById('notes'),
  },
  fit: {
    dropZone: document.getElementById('fitDropZone'),
    browse: document.getElementById('fitBrowse'),
    fileInput: document.getElementById('fitFile'),
    meta: document.getElementById('fitMeta'),
    warnings: document.getElementById('fitWarnings'),
    results: document.getElementById('fitResults'),
    pol: document.getElementById('fitPol'),
    G: document.getElementById('fitG'),
    timeUnit: document.getElementById('fitTimeUnit'),
    baseline: document.getElementById('fitBaseline'),
    N0: document.getElementById('fitN0'),
    loss: document.getElementById('fitLoss'),
    crosstalkYG: document.getElementById('fitCrosstalkYG'),
    crosstalkGY: document.getElementById('fitCrosstalkGY'),
    greenScale: document.getElementById('fitGreenScale'),
    actions: {
      exportJson: document.getElementById('fitExportJson'),
      exportCsv: document.getElementById('fitExportCsv'),
    },
    titration: {
      dropZone: document.getElementById('fitTitrationDropZone'),
      browse: document.getElementById('fitTitrationBrowse'),
      fileInput: document.getElementById('fitTitrationFile'),
      meta: document.getElementById('fitTitrationMeta'),
      warnings: document.getElementById('fitTitrationWarnings'),
      results: document.getElementById('fitTitrationResults'),
      kaRef: document.getElementById('fitKaRef'),
      kaMin: document.getElementById('fitKaMin'),
      kaMax: document.getElementById('fitKaMax'),
    },
  },
};

let mods = loadModifications();
let selectedId = mods.length ? mods[0].id : null;
let suppressUpdates = false;
const libraryFilters = { charge: 'any' };
const librarySelection = new Set();

function pruneLibrarySelection(){
  const available = new Set(mods.map((m) => m.id));
  for (const id of Array.from(librarySelection)) {
    if (!available.has(id)) librarySelection.delete(id);
  }
}

if (!selectedId) {
  selectedId = null;
}

function ratioSeverity(value) {
  if (!Number.isFinite(value) || value <= 0) return 'error';
  if (value < RATIO_ERR_MIN || value > RATIO_ERR_MAX) return 'error';
  if (value < RATIO_WARN_MIN || value > RATIO_WARN_MAX) return 'warning';
  return 'ok';
}

function setFieldSeverity(fieldEl, severity) {
  if (!fieldEl) return;
  fieldEl.classList.remove('field-warning', 'field-error');
  if (severity === 'warning') fieldEl.classList.add('field-warning');
  if (severity === 'error') fieldEl.classList.add('field-error');
}

function formatScientific(value, digits = 3) {
  if (!Number.isFinite(value)) return '—';
  return value.toExponential(digits);
}

function severityEmoji(severity) {
  if (severity === 'warning') return '🟠';
  if (severity === 'error') return '🔴';
  return '🟢';
}

function severityClass(severity) {
  if (severity === 'warning') return 'warn';
  if (severity === 'error') return 'err';
  return 'ok';
}

function updateAssocLocks(primary) {
  const { deltaAssocLock, rAssocLock } = elements.fields;
  if (deltaAssocLock) deltaAssocLock.classList.toggle('visible', primary === 'delta');
  if (rAssocLock) rAssocLock.classList.toggle('visible', primary === 'ratio');
}

function refreshHairpinInfo(derived, mod) {
  const info = elements.hairpinInfo;
  const valueEl = elements.hairpinValue;
  if (!info || !valueEl) return;
  if (!mod?.useHairpin) {
    info.hidden = true;
    valueEl.textContent = '—';
    return;
  }
  const factor = derived?.hairpinFactor ?? 1;
  valueEl.textContent = TWO_DECIMALS.format(factor);
  info.hidden = false;
}

function ensureSelectedExists() {
  if (!selectedId) return;
  if (!mods.some((m) => m.id === selectedId)) {
    selectedId = mods.length ? mods[0].id : null;
  }
}

function renderList() {
  pruneLibrarySelection();
  elements.list.innerHTML = '';
  const activeId = getActiveModificationId();
  const overlayIds = new Set(pruneOverlayIds(getOverlayModificationIds(), mods));
  mods.forEach((mod) => {
    const descriptors = computeDescriptors(mod);
    if (!passesFilters(descriptors, libraryFilters)) return;
    const card = document.createElement('div');
    const isSelected = mod.id === selectedId;
    const isOverlaySelected = librarySelection.has(mod.id);
    card.className = 'mod-card' + (isSelected ? ' active' : '') + (isOverlaySelected ? ' overlay-select' : '');
    const title = document.createElement('div');
    title.className = 'name';
    const labelSpan = document.createElement('span');
    labelSpan.textContent = mod.label || 'Untitled modification';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'library-select-checkbox';
    checkbox.checked = librarySelection.has(mod.id);
    checkbox.addEventListener('click', (evt) => {
      evt.stopPropagation();
      if (checkbox.checked) librarySelection.add(mod.id);
      else librarySelection.delete(mod.id);
      renderList();
    });
    title.appendChild(labelSpan);
    title.appendChild(checkbox);
    const meta = document.createElement('div');
    meta.className = 'meta';
    const assoc = resolveRAssoc(mod).toFixed(2);
    const descriptorBits = [];
    if (descriptors?.charge) descriptorBits.push(`charge=${descriptors.charge}`);
    if (descriptors?.aromatic) descriptorBits.push(descriptors.aromatic);
    if (Number.isFinite(descriptors?.linkerLength)) descriptorBits.push(`linker=${descriptors.linkerLength}`);
    const descriptorText = descriptorBits.length ? ` · ${descriptorBits.join(', ')}` : '';
    meta.innerHTML = `r<sub>assoc</sub>: ${assoc} · r<sub>poly</sub>: ${(mod.rPoly ?? 1).toFixed(2)} · r<sub>nick</sub>: ${(mod.rNick ?? 1).toFixed(2)}${descriptorText}`;
    if (activeId === mod.id) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = 'Active';
      title.appendChild(badge);
    }
    if (overlayIds.has(mod.id)) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.style.background = '#dcfce7';
      badge.style.color = '#166534';
      badge.textContent = 'Overlay';
      title.appendChild(badge);
    }
    card.appendChild(title);
    card.appendChild(meta);
    card.addEventListener('click', () => {
      selectedId = mod.id;
      populateForm();
      renderList();
    });
    elements.list.appendChild(card);
  });
  elements.deleteBtn.disabled = !selectedId;
  elements.setActiveBtn.disabled = !selectedId;
  updateLibraryActionState();
}

function currentMod() {
  if (!selectedId) return null;
  return mods.find((m) => m.id === selectedId) || null;
}

function updateMod(partial) {
  if (!selectedId) return;
  const idx = mods.findIndex((m) => m.id === selectedId);
  if (idx < 0) return;
  mods[idx] = { ...mods[idx], ...partial };
  upsertModification(mods[idx]);
  mods = loadModifications();
  populateDerived();
  renderList();
  updateStatusBanner();
}

function populateForm() {
  suppressUpdates = true;
  const mod = currentMod();
  const fields = elements.fields;
  if (!mod) {
    Object.values(fields).forEach((field) => {
      if ('value' in field) field.value = '';
    });
    elements.overlayToggle.checked = false;
    elements.hairpinToggle.checked = false;
    updateAssocLocks(null);
    setFieldSeverity(fields.rAssocLabel, null);
    setFieldSeverity(fields.rPoly?.closest('label'), null);
    setFieldSeverity(fields.rNick?.closest('label'), null);
    refreshHairpinInfo(null, null);
    suppressUpdates = false;
    return;
  }
  fields.label.value = mod.label || '';
  fields.amino.value = mod.aminoAcid || '';
  fields.temperature.value = mod.temperatureC ?? 37;
  const ddg = mod.deltaDeltaGAssoc;
  fields.deltaAssoc.value = ddg ?? '';
  const rAssoc = resolveRAssoc(mod);
  fields.rAssoc.value = Number.isFinite(rAssoc) ? rAssoc : 1;
  fields.rPoly.value = mod.rPoly ?? 1;
  fields.rNick.value = mod.rNick ?? 1;
  fields.deltaFold.value = mod.deltaDeltaGFold ?? '';
  fields.linkerLength.value = mod.linker?.length ?? '';
  fields.linkerPolarity.value = mod.linker?.polarity ?? '';
  fields.notes.value = mod.notes ?? '';
  elements.overlayToggle.checked = pruneOverlayIds(getOverlayModificationIds(), mods).includes(mod.id);
  elements.hairpinToggle.checked = Boolean(mod.useHairpin);
  const primary = mod.assocSource || (typeof mod.deltaDeltaGAssoc === 'number' ? 'delta' : 'ratio');
  updateAssocLocks(primary);
  setFieldSeverity(fields.rAssocLabel, ratioSeverity(rAssoc));
  setFieldSeverity(fields.rPoly?.closest('label'), ratioSeverity(mod.rPoly));
  setFieldSeverity(fields.rNick?.closest('label'), ratioSeverity(mod.rNick));
  suppressUpdates = false;
  populateDerived();
}

function populateDerived() {
  const mod = currentMod();
  const container = elements.derivedGrid;
  container.innerHTML = '';
  const warningField = elements.warningText;
  warningField.textContent = '';
  if (!mod) return;

  const derived = computeEffectiveParameters(BASE_CONTEXT, mod);
  const primary = mod.assocSource || (typeof mod.deltaDeltaGAssoc === 'number' ? 'delta' : 'ratio');
  updateAssocLocks(primary);

  refreshHairpinInfo(derived, mod);

  const items = [
    { label: "k₁′", value: `${formatScientific(derived.k1Eff)} [nM⁻¹ min⁻¹]` },
    { label: "b′", value: `${formatScientific(derived.bEff)} [nM⁻¹]` },
    { label: "g′", value: derived.gEff.toFixed(3) },
    mod.useHairpin
      ? { label: "g′·f_open", value: derived.gEffFold.toFixed(3) }
      : null,
    { label: "β′", value: derived.betaEff.toFixed(3) },
    { label: 'Dominance', value: formatDominanceText(derived.dominance) },
  ].filter(Boolean);

  items.forEach((item) => {
    const block = document.createElement('div');
    block.className = 'derived-item';
    const h = document.createElement('h4');
    h.textContent = item.label;
    const p = document.createElement('p');
    p.textContent = item.value;
    block.appendChild(h);
    block.appendChild(p);
    container.appendChild(block);
  });

  const rAssoc = resolveRAssoc(mod);
  const ratios = [
    { label: 'r_assoc', value: rAssoc, severity: ratioSeverity(rAssoc), field: elements.fields.rAssocLabel },
    { label: 'r_poly', value: mod.rPoly, severity: ratioSeverity(mod.rPoly), field: elements.fields.rPoly?.closest('label') },
    { label: 'r_nick', value: mod.rNick, severity: ratioSeverity(mod.rNick), field: elements.fields.rNick?.closest('label') },
  ];

  const warnings = [];
  ratios.forEach(({ field, severity, label, value }) => {
    setFieldSeverity(field, severity);
    if (severity === 'warning') {
      warnings.push(`${label}=${Number.isFinite(value) ? value.toFixed(3) : '—'} is outside the recommended 0.2–5 range.`);
    }
    if (severity === 'error') {
      warnings.push(`${label}=${Number.isFinite(value) ? value.toFixed(3) : '—'} is outside the supported range (0.05–20). Adjust before simulating.`);
    }
  });

  if (typeof mod.deltaDeltaGAssoc === 'number' && (mod.deltaDeltaGAssoc < -5 || mod.deltaDeltaGAssoc > 5)) {
    warnings.push('ΔΔG_assoc is outside the recommended range (-5 to +5 kcal/mol).');
  }
  const deltaFromRatio = resolveDeltaFromRAssoc(mod);
  if (typeof mod.deltaDeltaGAssoc === 'number' && Number.isFinite(deltaFromRatio)) {
    const drift = Math.abs(mod.deltaDeltaGAssoc - deltaFromRatio);
    if (drift > 0.2) {
      warnings.push(`ΔΔG_assoc and r_assoc disagree by ${drift.toFixed(2)} kcal/mol. Check temperature inputs.`);
      setFieldSeverity(elements.fields.deltaAssocLabel, 'warning');
    } else {
      setFieldSeverity(elements.fields.deltaAssocLabel, null);
    }
  } else {
    setFieldSeverity(elements.fields.deltaAssocLabel, null);
  }
  if (warnings.length) {
    warningField.innerHTML = `<strong>Warnings:</strong> ${warnings.join(' ')}`;
  }

  updateFitActions();
}

function updateStatusBanner() {
  const activeId = getActiveModificationId();
  const banner = elements.statusBanner;
  if (!activeId) {
    banner.hidden = false;
    banner.textContent = 'No active modification. Baseline parameters are used everywhere.';
    return;
  }
  const mod = findModification(mods, activeId);
  if (!mod) {
    banner.hidden = false;
    banner.textContent = 'Active modification could not be found. Re-select from the library.';
    return;
  }
  const derived = computeEffectiveParameters(BASE_CONTEXT, mod);
  banner.hidden = false;
  banner.textContent = `Active modification: ${mod.label || 'Unnamed'} · k1'=${derived.k1Eff.toExponential(3)} · b'=${derived.bEff.toExponential(3)} · β'=${derived.betaEff.toFixed(3)}`;
}

function populateChargeFilterOptions() {
  const select = elements.chargeFilter;
  if (!select) return;
  select.innerHTML = '';
  CHARGE_FILTER_OPTIONS.forEach((opt) => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    select.appendChild(option);
  });
  select.value = libraryFilters.charge || 'any';
}

function updateLibraryActionState() {
  const hasSelection = librarySelection.size > 0;
  if (elements.librarySetActive) elements.librarySetActive.disabled = librarySelection.size !== 1;
  if (elements.libraryApplyOverlays) elements.libraryApplyOverlays.disabled = !hasSelection;
  if (elements.libraryOpenBifurcation) elements.libraryOpenBifurcation.disabled = !hasSelection;
  if (elements.libraryOpenHeatmap) elements.libraryOpenHeatmap.disabled = !hasSelection;
}

function appendFitHistory(entry, mod) {
  const history = mod.fitHistory ? [...mod.fitHistory] : [];
  history.push(entry);
  return history.slice(-20);
}

function updateFitActions() {
  const actions = elements.fit?.actions;
  if (!actions) return;
  const mod = currentMod();
  const hasHistory = Boolean(mod && mod.fitHistory && mod.fitHistory.length);
  if (actions.exportJson) actions.exportJson.disabled = !hasHistory;
  if (actions.exportCsv) actions.exportCsv.disabled = !hasHistory;
}

function downloadTextFile(filename, text, mime = 'text/plain') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------- Fit helpers ----------
function getFitFormValues(){
  const fit = elements.fit;
  if (!fit) return null;
  const polVal = Number.parseFloat(fit.pol?.value);
  const gVal = Number.parseFloat(fit.G?.value);
  const baselineRaw = fit.baseline?.value ?? '';
  const baselineParsed = Number.parseInt(baselineRaw, 10);
  const baselineAuto = baselineRaw === '' || !Number.isFinite(baselineParsed);
  const baselinePoints = Math.max(1, baselineAuto ? 10 : baselineParsed);
  const greenScale = Number.parseFloat(fit.greenScale?.value);
  const N0Val = Number.parseFloat(fit.N0?.value);
  const timeUnit = fit.timeUnit?.value || 's';
  const loss = fit.loss?.value === 'huber' ? 'huber' : 'ols';

  const errors = [];
  if (!Number.isFinite(polVal) || polVal <= 0) errors.push('pol must be a positive value (nM).');
  if (!Number.isFinite(gVal) || gVal <= 0) errors.push('G must be a positive concentration.');
  if (!Number.isFinite(N0Val) || N0Val <= 0) errors.push('Initial N₀ must be positive.');
  if (!Number.isFinite(greenScale) || greenScale <= 0) errors.push('Green → nM scale must be a positive multiplier.');
  if (!['s', 'sec', 'seconds', 'min'].includes(timeUnit)) errors.push(`Unsupported time unit "${timeUnit}". Use seconds or minutes.`);

  return {
    importer: {
      timeUnit,
      baselinePoints,
      baselineAuto,
      greenScale,
      crossTalk: {
        fromYellowToGreen: Number.parseFloat(fit.crosstalkYG?.value) || 0,
        fromGreenToYellow: Number.parseFloat(fit.crosstalkGY?.value) || 0,
      },
    },
    solver: {
      pol: polVal,
      G: gVal,
      N0: N0Val,
      loss,
    },
    errors,
  };
}

function setFitMeta(text){
  if (elements.fit?.meta) elements.fit.meta.textContent = text || '';
}

function setFitWarnings(messages){
  const target = elements.fit?.warnings;
  if (!target) return;
  if (messages && messages.length){
    target.hidden = false;
    target.textContent = messages.join(' ');
  } else {
    target.hidden = true;
    target.textContent = '';
  }
}

function renderFitResults(dataset, fit, factors, formOpts, fileName, prevRatios, updatedMod){
  const container = elements.fit?.results;
  if (!container) return;
  container.innerHTML = '';
  if (!fit) return;

  const solver = formOpts?.solver || {};
  const importer = formOpts?.importer || {};
  const timeArray = dataset?.time ? Array.from(dataset.time) : [];
  const points = timeArray.length;
  const duration = points > 1 ? timeArray[points - 1] - timeArray[0] : 0;
  const dt = points > 1 ? duration / (points - 1) : 0;

  const modAfterFit = updatedMod || currentMod();
  const currentAssoc = modAfterFit ? resolveRAssoc(modAfterFit) : null;
  const currentNick = modAfterFit?.rNick ?? null;

  const assocRangeSeverity = Number.isFinite(currentAssoc) ? ratioSeverity(currentAssoc) : 'ok';
  const nickRangeSeverity = Number.isFinite(currentNick) ? ratioSeverity(currentNick) : 'ok';

  const assocDiff = prevRatios && Number.isFinite(prevRatios.rAssoc) && Number.isFinite(currentAssoc)
    ? Math.abs(currentAssoc - prevRatios.rAssoc)
    : null;
  const nickDiff = prevRatios && Number.isFinite(prevRatios.rNick) && Number.isFinite(currentNick)
    ? Math.abs(currentNick - prevRatios.rNick)
    : null;

  const diffSeverity = (diff) => {
    if (diff === null) return 'ok';
    if (diff < 0.05) return 'ok';
    if (diff < 0.2) return 'warning';
    return 'error';
  };

  const assocConsistency = assocRangeSeverity === 'error' ? 'error'
    : assocRangeSeverity === 'warning' || diffSeverity(assocDiff) === 'warning' ? 'warning'
    : diffSeverity(assocDiff);
  const nickConsistency = nickRangeSeverity === 'error' ? 'error'
    : nickRangeSeverity === 'warning' || diffSeverity(nickDiff) === 'warning' ? 'warning'
    : diffSeverity(nickDiff);

  const makeStatusCard = (title, label, severity, diff, units) => ({
    title,
    render(containerEl) {
      const pill = document.createElement('span');
      pill.className = `status-pill ${severityClass(severity)}`;
      pill.textContent = `${severityEmoji(severity)} ${label}`;
      if (diff !== null && Number.isFinite(diff)) {
        const diffSpan = document.createElement('span');
        diffSpan.textContent = ` · Δ ${TWO_DECIMALS.format(diff)}${units || ''}`;
        pill.appendChild(diffSpan);
      }
      containerEl.appendChild(pill);
    },
  });

  const cards = [
    {
      title: "k₁′ [nM⁻¹ min⁻¹]",
      body: `${fit.k1.toExponential(3)} (95% CI ${fit.k1CI[0].toExponential(3)} – ${fit.k1CI[1].toExponential(3)})`,
    },
    {
      title: "b′ [nM⁻¹]",
      body: `${fit.b.toExponential(3)} (95% CI ${fit.bCI[0].toExponential(3)} – ${fit.bCI[1].toExponential(3)})`,
    },
    {
      title: '(k₁′/b′)/(k₁/b) → r_poly',
      body: factors && Number.isFinite(factors.rPoly) ? factors.rPoly.toFixed(3) : '—',
    },
    {
      title: 'r_nick (fit-derived)',
      body: factors && Number.isFinite(factors.rNick) ? factors.rNick.toFixed(3) : '—',
    },
    makeStatusCard('r_assoc consistency', 'r_assoc', assocConsistency, assocDiff, ''),
    makeStatusCard('r_nick consistency', 'r_nick', nickConsistency, nickDiff, ''),
    {
      title: 'R²',
      body: `${(fit.diagnostics.r2 * 100).toFixed(2)}%`,
    },
    {
      title: 'Loss / points',
      body: `${(solver.loss || 'ols').toUpperCase()} • ${points} pts${fit.diagnostics.skipped.length ? ` (skipped ${fit.diagnostics.skipped.length})` : ''}`,
    },
  ];

  cards.forEach((card) => {
    const div = document.createElement('div');
    div.className = 'fit-result-card';
    const h = document.createElement('h4');
    h.textContent = card.title;
    const p = document.createElement('p');
    if (typeof card.render === 'function') {
      p.textContent = '';
      p.style.display = 'flex';
      p.style.alignItems = 'center';
      card.render(p);
    } else {
      p.textContent = card.body;
    }
    div.appendChild(h);
    div.appendChild(p);
    container.appendChild(div);
  });

  const baselineLabel = importer.baselineAuto ? `${importer.baselinePoints} (auto)` : importer.baselinePoints;
  const timeUnitLabel = importer.timeUnit === 'min' ? 'minutes' : 'seconds → minutes';
  const meta = [
    fileName ? `File: ${fileName}` : null,
    points ? `Points: ${points}` : null,
    `Range: ${duration.toFixed(2)} min`,
    `Δt ≈ ${dt.toFixed(3)} min`,
    `Baseline window: ${baselineLabel}`,
    `Time unit: ${timeUnitLabel}`,
  ].filter(Boolean).join(' • ');
  setFitMeta(meta);
}

function gatherFitWarnings(datasetWarnings, fitDiagnostics){
  const msgs = [];
  if (datasetWarnings && datasetWarnings.length) msgs.push(...datasetWarnings);
  if (fitDiagnostics && fitDiagnostics.skipped && fitDiagnostics.skipped.length){
    msgs.push(`Skipped ${fitDiagnostics.skipped.length} rows due to invalid concentrations.`);
  }
  return msgs;
}

async function processFitFile(file){
  const opts = getFitFormValues();
  if (!opts) return;
  if (opts.errors && opts.errors.length) {
    setFitWarnings(opts.errors);
    return;
  }
  setFitMeta('Parsing CSV…');
  setFitWarnings(null);
  if (elements.fit?.results) elements.fit.results.innerHTML = '';
  try {
    const dataset = await parsePreyCsvFile(file, {
      timeUnit: opts.importer.timeUnit,
      baselinePoints: opts.importer.baselinePoints,
      greenScale: opts.importer.greenScale,
      crossTalk: opts.importer.crossTalk,
    });

    const N0 = opts.solver.N0;
    if (!Number.isFinite(N0) || N0 <= 0) {
      throw new Error('Initial concentration N₀ must be a positive number');
    }

    const concentrations = Array.from(dataset.concentration, (v) => v + N0);
    if (concentrations.some((v) => v <= 0 || !Number.isFinite(v))) {
      throw new Error('Concentration values became non-positive after applying N₀ and scale. Check inputs.');
    }

    const fit = fitPreyDataset(
      { time: Array.from(dataset.time), concentration: concentrations },
      { pol: opts.solver.pol, G: opts.solver.G, N0, loss: opts.solver.loss }
    );

    const mod = currentMod();
    const prevRatios = mod
      ? {
          rAssoc: resolveRAssoc(mod),
          rPoly: mod.rPoly,
          rNick: mod.rNick,
        }
      : null;
    let factors = null;
    let warnings = gatherFitWarnings(dataset.warnings, fit.diagnostics);
    if (mod) {
      const rAssoc = resolveRAssoc(mod);
      factors = deriveModificationFactors(
        { k1: BASE_CONTEXT.k1, b: BASE_CONTEXT.b },
        { k1: fit.k1, b: fit.b },
        { rAssoc }
      );
      const timestamp = new Date().toISOString();
      const historyEntry = {
        type: 'prey',
        timestamp,
        fileName: file.name,
        solver: { ...opts.solver },
        dataset: {
          points: dataset.time.length,
          separator: dataset.separator,
          baseline: dataset.baseline,
          duration: dataset.time[dataset.time.length - 1] - dataset.time[0],
        },
        metrics: {
          k1: fit.k1,
          k1CI: fit.k1CI,
          b: fit.b,
          bCI: fit.bCI,
          r2: fit.diagnostics.r2,
          rPoly: factors?.rPoly ?? null,
          rNick: factors?.rNick ?? null,
        },
        warnings,
      };
      const fitHistory = appendFitHistory(historyEntry, mod);
      updateMod({
        rPoly: Number.isFinite(factors.rPoly) ? factors.rPoly : mod.rPoly,
        rNick: Number.isFinite(factors.rNick) ? factors.rNick : mod.rNick,
        k1Eff: fit.k1,
        bEff: fit.b,
        lastFit: historyEntry,
        fitHistory,
      });
      updateFitActions();
      const updatedAfterFit = currentMod();
      renderFitResults(dataset, fit, factors, opts, file.name, prevRatios, updatedAfterFit);
    } else {
      warnings = ['Select a modification card before applying fit results.'].concat(warnings);
      renderFitResults(dataset, fit, factors, opts, file.name, prevRatios, null);
    }

    setFitWarnings(warnings);
  } catch (err) {
    console.error('[fit] failed', err);
    setFitMeta('Fit failed.');
    const hint = 'Hint: try enabling Huber loss or reducing the initial b guess (e.g. halve the baseline) before re-running the fit.';
    const message = err?.message || String(err);
    setFitWarnings([message, hint]);
  }
}

function setupFitSection(){
  const fit = elements.fit;
  if (!fit || !fit.dropZone) return;
  const dropZone = fit.dropZone;
  const clearDrag = () => dropZone.classList.remove('dragover');

  dropZone.addEventListener('dragover', (evt) => {
    evt.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', clearDrag);
  dropZone.addEventListener('drop', (evt) => {
    evt.preventDefault();
    clearDrag();
    const file = evt.dataTransfer?.files?.[0];
    if (file) processFitFile(file);
  });
  dropZone.addEventListener('click', (evt) => {
    if (evt.target === fit.browse) return; // browse button handles its own click
    fit.fileInput?.click();
  });
  dropZone.addEventListener('keypress', (evt) => {
    if (evt.key === 'Enter' || evt.key === ' ') {
      evt.preventDefault();
      fit.fileInput?.click();
    }
  });

  fit.browse?.addEventListener('click', (evt) => {
    evt.preventDefault();
    fit.fileInput?.click();
  });

  fit.fileInput?.addEventListener('change', (evt) => {
    const file = evt.target.files?.[0];
    if (file) processFitFile(file);
    evt.target.value = '';
  });
}

function getTitrationFormValues(){
  const tit = elements.fit?.titration;
  if (!tit) return null;
  const kaRef = Number.parseFloat(tit.kaRef?.value);
  const logMin = Number.parseFloat(tit.kaMin?.value);
  const logMax = Number.parseFloat(tit.kaMax?.value);
  return {
    kaRef: Number.isFinite(kaRef) && kaRef > 0 ? kaRef : 1,
    logKaMin: Number.isFinite(logMin) ? logMin : -6,
    logKaMax: Number.isFinite(logMax) ? logMax : 6,
  };
}

function setTitrationMeta(text){
  const el = elements.fit?.titration?.meta;
  if (el) el.textContent = text || '';
}

function setTitrationWarnings(messages){
  const el = elements.fit?.titration?.warnings;
  if (!el) return;
  if (messages && messages.length){
    el.hidden = false;
    el.textContent = messages.join(' ');
  } else {
    el.hidden = true;
    el.textContent = '';
  }
}

function renderTitrationResults(fit, rAssoc, fileName){
  const container = elements.fit?.titration?.results;
  if (!container) return;
  container.innerHTML = '';
  if (!fit) return;
  const cards = [
    {
      title: "Kₐ [M⁻¹]",
      body: `${fit.Ka.toExponential(3)} (95% CI ${fit.KaCI[0].toExponential(3)} – ${fit.KaCI[1].toExponential(3)})`,
    },
    {
      title: 'r_assoc',
      body: Number.isFinite(rAssoc) ? rAssoc.toFixed(3) : '—',
    },
    {
      title: 'R²',
      body: `${(fit.r2 * 100).toFixed(2)}%`,
    },
  ];
  cards.forEach((card) => {
    const div = document.createElement('div');
    div.className = 'fit-result-card';
    const h = document.createElement('h4');
    h.textContent = card.title;
    const p = document.createElement('p');
    p.textContent = card.body;
    div.appendChild(h);
    div.appendChild(p);
    container.appendChild(div);
  });
  const meta = [fileName ? `File: ${fileName}` : null, `Points: ${fit.residuals.length}`]
    .filter(Boolean)
    .join(' • ');
  setTitrationMeta(meta);
}

async function processTitrationFile(file){
  const opts = getTitrationFormValues();
  if (!opts) return;
  setTitrationMeta('Parsing CSV…');
  setTitrationWarnings(null);
  if (elements.fit?.titration?.results) elements.fit.titration.results.innerHTML = '';
  try {
    const dataset = await parseTitrationCsvFile(file);
    const fit = fitTitrationDataset(dataset, { logKaMin: opts.logKaMin, logKaMax: opts.logKaMax });
    const rAssoc = deriveRAssoc(fit.Ka, opts.kaRef);
    const mod = currentMod();
    let warnings = [...(dataset.warnings || [])];
    if (mod) {
      const timestamp = new Date().toISOString();
      const historyEntry = {
        type: 'titration',
        timestamp,
        fileName: file.name,
        options: opts,
        metrics: {
          Ka: fit.Ka,
          KaCI: fit.KaCI,
          r2: fit.r2,
          rAssoc: Number.isFinite(rAssoc) ? rAssoc : null,
          F0: fit.F0,
          dF: fit.dF,
        },
        warnings,
      };
      const fitHistory = appendFitHistory(historyEntry, mod);
      updateMod({
        rAssoc: Number.isFinite(rAssoc) ? rAssoc : mod.rAssoc,
        deltaDeltaGAssoc: undefined,
        lastTitration: historyEntry,
        fitHistory,
      });
      updateFitActions();
    } else {
      warnings.unshift('Select a modification card before applying titration results.');
    }
    setTitrationWarnings(warnings);
    renderTitrationResults(fit, rAssoc, file.name);
  } catch (err) {
    console.error('[titration] failed', err);
    setTitrationMeta('Titration fit failed.');
    setTitrationWarnings([err.message || String(err)]);
  }
}

function setupTitrationSection(){
  const tit = elements.fit?.titration;
  if (!tit || !tit.dropZone) return;
  const dropZone = tit.dropZone;
  const clear = () => dropZone.classList.remove('dragover');

  dropZone.addEventListener('dragover', (evt) => {
    evt.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', clear);
  dropZone.addEventListener('drop', (evt) => {
    evt.preventDefault();
    clear();
    const file = evt.dataTransfer?.files?.[0];
    if (file) processTitrationFile(file);
  });
  dropZone.addEventListener('click', (evt) => {
    if (evt.target === tit.browse) return;
    tit.fileInput?.click();
  });
  dropZone.addEventListener('keypress', (evt) => {
    if (evt.key === 'Enter' || evt.key === ' ') {
      evt.preventDefault();
      tit.fileInput?.click();
    }
  });

  tit.browse?.addEventListener('click', (evt) => {
    evt.preventDefault();
    tit.fileInput?.click();
  });

  tit.fileInput?.addEventListener('change', (evt) => {
    const file = evt.target.files?.[0];
    if (file) processTitrationFile(file);
    evt.target.value = '';
  });
}

function exportLatestFitJson(){
  const mod = currentMod();
  if (!mod || !mod.fitHistory || !mod.fitHistory.length) return;
  const entry = mod.fitHistory[mod.fitHistory.length - 1];
  const payload = {
    exportedAt: new Date().toISOString(),
    modification: {
      id: mod.id,
      label: mod.label,
    },
    entry,
  };
  downloadTextFile(`fit-${mod.id}-${Date.now()}.json`, JSON.stringify(payload, null, 2), 'application/json');
}

function csvEscape(value){
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function exportFitHistoryCsv(){
  const mod = currentMod();
  if (!mod || !mod.fitHistory || !mod.fitHistory.length) return;
  const header = ['timestamp','type','file','k1','b','r_poly','r_nick','Ka','r_assoc','r2'];
  const rows = [header.join(',')];
  mod.fitHistory.forEach((entry) => {
    const metrics = entry.metrics || {};
    const row = [
      entry.timestamp,
      entry.type,
      entry.fileName || '',
      metrics.k1 ?? '',
      metrics.b ?? '',
      metrics.rPoly ?? '',
      metrics.rNick ?? '',
      metrics.Ka ?? '',
      metrics.rAssoc ?? '',
      metrics.r2 ?? '',
    ].map(csvEscape);
    rows.push(row.join(','));
  });
  downloadTextFile(`fit-history-${mod.id}.csv`, rows.join('\n'), 'text/csv');
}

function updateBindingTable() {
  const variants = buildSimulationVariants(BASE_CONTEXT);
  const table = elements.bindingTable;
  const rows = [
    '<tr><th>Name</th><th>Type</th><th>k₁′</th><th>b′</th><th>g′</th><th>β′</th></tr>',
  ];
  variants.forEach((variant) => {
    const { label, derived, type } = variant;
    rows.push(`<tr><td>${label}</td><td>${type}</td><td>${derived.k1Eff.toExponential(3)}</td><td>${derived.bEff.toExponential(3)}</td><td>${derived.gEff.toFixed(3)}</td><td>${derived.betaEff.toFixed(3)}</td></tr>`);
  });
  table.innerHTML = rows.join('');
}

function onFieldChange(evt) {
  if (suppressUpdates) return;
  const mod = currentMod();
  if (!mod) return;
  const fields = elements.fields;
  const { id } = evt.target;
  const value = evt.target.value;
  if (id === 'label') updateMod({ label: value });
  else if (id === 'amino') updateMod({ aminoAcid: value || undefined });
  else if (id === 'temperature') updateMod({ temperatureC: value === '' ? undefined : Number(value) });
  else if (id === 'rPoly' || id === 'rNick') {
    const num = value === '' ? undefined : Number(value);
    const warningField = elements.warningText;
    const labelEl = id === 'rPoly' ? fields.rPoly.closest('label') : fields.rNick.closest('label');
    if (value !== '' && (!Number.isFinite(num) || num <= 0)) {
      if (warningField) warningField.innerHTML = `<strong>Error:</strong> ${id} must be positive.`;
      if (id === 'rPoly') fields.rPoly.value = Number.isFinite(mod.rPoly) ? mod.rPoly : '';
      else fields.rNick.value = Number.isFinite(mod.rNick) ? mod.rNick : '';
      setFieldSeverity(labelEl, 'error');
      return;
    }
    const severity = num === undefined ? 'ok' : ratioSeverity(num);
    if (severity === 'error') {
      if (warningField) warningField.innerHTML = `<strong>Error:</strong> ${id} must stay within 0.05 – 20. Value not applied.`;
      if (id === 'rPoly') fields.rPoly.value = Number.isFinite(mod.rPoly) ? mod.rPoly : '';
      else fields.rNick.value = Number.isFinite(mod.rNick) ? mod.rNick : '';
      setFieldSeverity(labelEl, 'error');
      return;
    }
    const payload = id === 'rPoly' ? { rPoly: num } : { rNick: num };
    updateMod(payload);
  }
  else if (id === 'deltaFold') updateMod({ deltaDeltaGFold: value === '' ? undefined : Number(value) });
  else if (id === 'linkerLength' || id === 'linkerPolarity') {
    const len = fields.linkerLength.value;
    const pol = fields.linkerPolarity.value;
    if (len === '' && !pol) updateMod({ linker: undefined });
    else updateMod({ linker: { length: len === '' ? undefined : Number(len), polarity: pol || undefined } });
  } else if (id === 'notes') updateMod({ notes: value || undefined });
  else if (id === 'deltaAssoc') {
    const num = value === '' ? undefined : Number(value);
    if (value !== '' && !Number.isFinite(num)) {
      fields.deltaAssoc.value = mod.deltaDeltaGAssoc ?? '';
      return;
    }
    const payload = {
      deltaDeltaGAssoc: num,
      assocSource: num === undefined ? (mod.rAssoc ? 'ratio' : undefined) : 'delta',
    };
    if (num !== undefined) payload.rAssoc = undefined;
    updateMod(payload);
    syncAssocFields();
  } else if (id === 'rAssoc') {
    const num = value === '' ? undefined : Number(value);
    const warningField = elements.warningText;
    if (value !== '' && (!Number.isFinite(num) || num <= 0)) {
      if (warningField) warningField.innerHTML = '<strong>Error:</strong> r_assoc must be positive.';
      fields.rAssoc.value = resolveRAssoc(mod).toFixed(3);
      return;
    }
    const severity = num === undefined ? 'ok' : ratioSeverity(num);
    if (severity === 'error') {
      if (warningField) warningField.innerHTML = '<strong>Error:</strong> r_assoc must stay within 0.05 – 20. Value not applied.';
      fields.rAssoc.value = resolveRAssoc(mod).toFixed(3);
      setFieldSeverity(elements.fields.rAssocLabel, 'error');
      return;
    }
    updateMod({
      rAssoc: num,
      deltaDeltaGAssoc: num === undefined ? mod.deltaDeltaGAssoc : undefined,
      assocSource: num === undefined ? (typeof mod.deltaDeltaGAssoc === 'number' ? 'delta' : undefined) : 'ratio',
    });
    syncDeltaField();
  }
}

function syncAssocFields() {
  const mod = currentMod();
  if (!mod) return;
  suppressUpdates = true;
  elements.fields.rAssoc.value = resolveRAssoc(mod).toFixed(3);
  suppressUpdates = false;
  populateDerived();
}

function syncDeltaField() {
  const mod = currentMod();
  if (!mod) return;
  const delta = resolveDeltaFromRAssoc(mod);
  suppressUpdates = true;
  elements.fields.deltaAssoc.value = Number.isFinite(delta) ? delta.toFixed(3) : '';
  suppressUpdates = false;
  populateDerived();
}

function handleAdd() {
  const id = crypto.randomUUID ? crypto.randomUUID() : `mod-${Date.now()}`;
  const newMod = {
    id,
    label: 'New modification',
    temperatureC: 37,
    rPoly: 1,
    rNick: 1,
    rAssoc: 1,
    assocSource: 'ratio',
  };
  upsertModification(newMod);
  mods = loadModifications();
  selectedId = id;
  renderList();
  populateForm();
  updateBindingTable();
  updateStatusBanner();
  updateLibraryActionState();
}

function handleDelete() {
  const mod = currentMod();
  if (!mod) return;
  if (!confirm(`Delete modification "${mod.label || mod.id}"?`)) return;
  deleteModification(mod.id);
  mods = loadModifications();
  librarySelection.delete(mod.id);
  selectedId = mods.length ? mods[0].id : null;
  renderList();
  populateForm();
  updateBindingTable();
  updateStatusBanner();
}

function setActive() {
  const mod = currentMod();
  if (!mod) return;
  setActiveModificationId(mod.id);
  updateStatusBanner();
  renderList();
  updateBindingTable();
}

function clearActive() {
  setActiveModificationId(null);
  updateStatusBanner();
  renderList();
  updateBindingTable();
}

function toggleOverlay(evt) {
  const mod = currentMod();
  if (!mod) {
    evt.target.checked = false;
    return;
  }
  const ids = new Set(getOverlayModificationIds());
  if (evt.target.checked) ids.add(mod.id);
  else ids.delete(mod.id);
  setOverlayModificationIds(Array.from(ids));
  renderList();
  updateBindingTable();
}

function toggleHairpin(evt) {
  updateMod({ useHairpin: evt.target.checked });
}

function resetToDefaults() {
  const mod = currentMod();
  if (!mod) return;
  updateMod({
    temperatureC: 37,
    deltaDeltaGAssoc: undefined,
    rAssoc: 1,
    rPoly: 1,
    rNick: 1,
    deltaDeltaGFold: undefined,
    useHairpin: false,
    assocSource: 'ratio',
  });
  elements.hairpinToggle.checked = false;
  populateForm();
}

function setActiveFromSelection(){
  if (librarySelection.size !== 1) return;
  const id = Array.from(librarySelection)[0];
  if (!mods.some((m) => m.id === id)) return;
  selectedId = id;
  setActiveModificationId(id);
  populateForm();
  updateStatusBanner();
  renderList();
}

function applyOverlaysFromSelection(){
  if (!librarySelection.size) return;
  setOverlayModificationIds(Array.from(librarySelection));
  renderList();
  updateBindingTable();
}

function openPageWithOverlays(path, query = {}) {
  const selection = Array.from(librarySelection);
  let activeId = getActiveModificationId();
  let overlays = getOverlayModificationIds();

  if (selection.length) {
    activeId = selection[0];
    const overlayIds = selection.slice(1);
    setActiveModificationId(activeId);
    setOverlayModificationIds(overlayIds);
    overlays = overlayIds;
    selectedId = activeId;
    populateForm();
    renderList();
    updateStatusBanner();
    updateBindingTable();
  }

  overlays = pruneOverlayIds(overlays);

  const url = new URL(path, window.location.href);
  const params = url.searchParams;
  if (query.preset) params.set('preset', query.preset);
  if (query.param) params.set('param', query.param);
  if (query.metric) params.set('metric', query.metric);
  if (query.tail) params.set('tail', String(query.tail));
  if (query.extra) {
    Object.entries(query.extra).forEach(([key, val]) => {
      if (val !== undefined && val !== null) params.set(key, String(val));
    });
  }
  if (activeId) params.set('active', activeId);
  const overlayParam = overlays.filter((id) => id && id !== activeId);
  if (overlayParam.length) params.set('overlays', overlayParam.join(','));
  window.open(url.toString(), '_blank');
}

function init() {
  ensureSelectedExists();
  populateChargeFilterOptions();
  if (elements.chargeFilter) {
    elements.chargeFilter.addEventListener('change', (evt) => {
      libraryFilters.charge = evt.target.value || 'any';
      renderList();
    });
  }
  if (elements.librarySetActive) elements.librarySetActive.addEventListener('click', setActiveFromSelection);
  if (elements.libraryApplyOverlays) elements.libraryApplyOverlays.addEventListener('click', applyOverlaysFromSelection);
  if (elements.libraryOpenBifurcation) {
    elements.libraryOpenBifurcation.addEventListener('click', () => openPageWithOverlays('../bifurcation/', { preset: 'G_sweep' }));
  }
  if (elements.libraryOpenHeatmap) {
    elements.libraryOpenHeatmap.addEventListener('click', () => openPageWithOverlays('../heatmap/', { preset: 'assoc_period' }));
  }

  renderList();
  populateForm();
  updateStatusBanner();
  updateBindingTable();

  elements.addBtn.addEventListener('click', handleAdd);
  elements.deleteBtn.addEventListener('click', handleDelete);
  elements.setActiveBtn.addEventListener('click', setActive);
  elements.clearActiveBtn.addEventListener('click', clearActive);
  elements.overlayToggle.addEventListener('change', toggleOverlay);
  elements.hairpinToggle.addEventListener('change', toggleHairpin);
  if (elements.resetDefaultsBtn) elements.resetDefaultsBtn.addEventListener('click', resetToDefaults);

  Object.values(elements.fields).forEach((field) => {
    field?.addEventListener('input', onFieldChange);
  });

  setupFitSection();
  setupTitrationSection();
  if (elements.fit?.actions?.exportJson) {
    elements.fit.actions.exportJson.addEventListener('click', exportLatestFitJson);
  }
  if (elements.fit?.actions?.exportCsv) {
    elements.fit.actions.exportCsv.addEventListener('click', exportFitHistoryCsv);
  }
  updateFitActions();
}

init();
