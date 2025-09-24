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
import { parsePreyCsvFile } from './fit/importer.js';
import { fitPreyDataset, deriveModificationFactors } from './fit/prey_fit.js';

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

const elements = {
  list: document.getElementById('modList'),
  addBtn: document.getElementById('addModBtn'),
  deleteBtn: document.getElementById('deleteModBtn'),
  setActiveBtn: document.getElementById('setActiveBtn'),
  clearActiveBtn: document.getElementById('clearActiveBtn'),
  overlayToggle: document.getElementById('overlayToggle'),
  hairpinToggle: document.getElementById('hairpinToggle'),
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
    rAssoc: document.getElementById('rAssoc'),
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
  },
};

let mods = loadModifications();
let selectedId = mods.length ? mods[0].id : null;
let suppressUpdates = false;

if (!selectedId) {
  selectedId = null;
}

function ensureSelectedExists() {
  if (!selectedId) return;
  if (!mods.some((m) => m.id === selectedId)) {
    selectedId = mods.length ? mods[0].id : null;
  }
}

function renderList() {
  elements.list.innerHTML = '';
  const activeId = getActiveModificationId();
  const overlayIds = new Set(pruneOverlayIds(getOverlayModificationIds(), mods));
  mods.forEach((mod) => {
    const card = document.createElement('div');
    card.className = 'mod-card' + (mod.id === selectedId ? ' active' : '');
    const title = document.createElement('div');
    title.className = 'name';
    title.textContent = mod.label || 'Untitled modification';
    const meta = document.createElement('div');
    meta.className = 'meta';
    const assoc = resolveRAssoc(mod).toFixed(2);
    meta.innerHTML = `r<sub>assoc</sub>: ${assoc} · r<sub>poly</sub>: ${(mod.rPoly ?? 1).toFixed(2)} · r<sub>nick</sub>: ${(mod.rNick ?? 1).toFixed(2)}`;
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

  const items = [
    { label: 'k₁ eff', value: `${derived.k1Eff.toExponential(3)} [nM⁻¹ s⁻¹]` },
    { label: 'b eff', value: `${derived.bEff.toExponential(3)} [nM⁻¹]` },
    { label: 'g eff', value: derived.gEff.toFixed(3) },
    { label: 'β eff', value: derived.betaEff.toFixed(3) },
    { label: 'Dominance', value: formatDominanceText(derived.dominance) },
  ];

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

  const warnings = [];
  if (typeof mod.deltaDeltaGAssoc === 'number' && (mod.deltaDeltaGAssoc < -5 || mod.deltaDeltaGAssoc > 5)) {
    warnings.push('ΔΔG_assoc is outside the recommended range (-5 to +5 kcal/mol).');
  }
  if (typeof mod.rPoly === 'number' && (mod.rPoly < 0.2 || mod.rPoly > 5)) {
    warnings.push('r_poly is outside the suggested range (0.2 – 5).');
  }
  if (typeof mod.rNick === 'number' && (mod.rNick < 0.2 || mod.rNick > 5)) {
    warnings.push('r_nick is outside the suggested range (0.2 – 5).');
  }
  if (warnings.length) {
    warningField.innerHTML = `<strong>Warnings:</strong> ${warnings.join(' ')}`;
  }
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

// ---------- Fit helpers ----------
function getFitFormValues(){
  const fit = elements.fit;
  if (!fit) return null;
  const polVal = Number.parseFloat(fit.pol?.value);
  const gVal = Number.parseFloat(fit.G?.value);
  const baselinePoints = Math.max(1, Number.parseInt(fit.baseline?.value, 10) || 10);
  const greenScale = Number.parseFloat(fit.greenScale?.value);
  const N0Val = Number.parseFloat(fit.N0?.value);
  return {
    importer: {
      timeUnit: fit.timeUnit?.value || 's',
      baselinePoints,
      greenScale: Number.isFinite(greenScale) ? greenScale : 1,
      crossTalk: {
        fromYellowToGreen: Number.parseFloat(fit.crosstalkYG?.value) || 0,
        fromGreenToYellow: Number.parseFloat(fit.crosstalkGY?.value) || 0,
      },
    },
    solver: {
      pol: Number.isFinite(polVal) && polVal > 0 ? polVal : BASE_CONTEXT.pol,
      G: Number.isFinite(gVal) && gVal > 0 ? gVal : BASE_CONTEXT.G,
      N0: Number.isFinite(N0Val) && N0Val > 0 ? N0Val : BASE_CONTEXT.N0,
      loss: fit.loss?.value === 'huber' ? 'huber' : 'ols',
    },
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

function renderFitResults(dataset, fit, factors, solver, fileName){
  const container = elements.fit?.results;
  if (!container) return;
  container.innerHTML = '';
  if (!fit) return;
  const cards = [
    {
      title: "k₁' [nM⁻¹ min⁻¹]",
      body: `${fit.k1.toExponential(3)} (95% CI ${fit.k1CI[0].toExponential(3)} – ${fit.k1CI[1].toExponential(3)})`,
    },
    {
      title: "b' [nM⁻¹]",
      body: `${fit.b.toExponential(3)} (95% CI ${fit.bCI[0].toExponential(3)} – ${fit.bCI[1].toExponential(3)})`,
    },
    {
      title: 'r_poly',
      body: factors && Number.isFinite(factors.rPoly) ? factors.rPoly.toFixed(3) : '—',
    },
    {
      title: 'r_nick',
      body: factors && Number.isFinite(factors.rNick) ? factors.rNick.toFixed(3) : '—',
    },
    {
      title: 'R²',
      body: `${(fit.diagnostics.r2 * 100).toFixed(2)}%`,
    },
    {
      title: 'Loss / points',
      body: `${solver.loss.toUpperCase()} • ${dataset.time.length} pts${fit.diagnostics.skipped.length ? ` (skipped ${fit.diagnostics.skipped.length})` : ''}`,
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
  const duration = dataset.time[dataset.time.length - 1] - dataset.time[0];
  const dt = dataset.time.length > 1 ? duration / (dataset.time.length - 1) : 0;
  const meta = [
    fileName ? `File: ${fileName}` : null,
    `Points: ${dataset.time.length}`,
    `Range: ${duration.toFixed(2)} min`,
    `Δt ≈ ${dt.toFixed(3)} min`,
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
    let factors = null;
    if (mod) {
      const rAssoc = resolveRAssoc(mod);
      factors = deriveModificationFactors(
        { k1: BASE_CONTEXT.k1, b: BASE_CONTEXT.b },
        { k1: fit.k1, b: fit.b },
        { rAssoc }
      );
      updateMod({
        rPoly: Number.isFinite(factors.rPoly) ? factors.rPoly : mod.rPoly,
        rNick: Number.isFinite(factors.rNick) ? factors.rNick : mod.rNick,
        k1Eff: fit.k1,
        bEff: fit.b,
        lastFit: {
          timestamp: new Date().toISOString(),
          fileName: file.name,
          options: opts,
          dataset: {
            points: dataset.time.length,
            separator: dataset.separator,
            baseline: dataset.baseline,
          },
          result: fit,
          factors,
        },
      });
    }

    const warnings = gatherFitWarnings(dataset.warnings, fit.diagnostics);
    if (!mod) warnings.unshift('Select a modification card before applying fit results.');
    setFitWarnings(warnings);
    renderFitResults({ time: Array.from(dataset.time) }, fit, factors, opts.solver, file.name);
  } catch (err) {
    console.error('[fit] failed', err);
    setFitMeta('Fit failed.');
    setFitWarnings([err.message || String(err)]);
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

function updateBindingTable() {
  const variants = buildSimulationVariants(BASE_CONTEXT);
  const table = elements.bindingTable;
  const rows = [
    '<tr><th>Name</th><th>Type</th><th>k₁ eff</th><th>b eff</th><th>β eff</th></tr>',
  ];
  variants.forEach((variant) => {
    const { label, derived, type } = variant;
    rows.push(`<tr><td>${label}</td><td>${type}</td><td>${derived.k1Eff.toExponential(3)}</td><td>${derived.bEff.toExponential(3)}</td><td>${derived.betaEff.toFixed(3)}</td></tr>`);
  });
  table.innerHTML = rows.join('');
}

function onFieldChange(evt) {
  if (suppressUpdates) return;
  const mod = currentMod();
  if (!mod) return;
  const { id } = evt.target;
  const value = evt.target.value;
  if (id === 'label') updateMod({ label: value });
  else if (id === 'amino') updateMod({ aminoAcid: value || undefined });
  else if (id === 'temperature') updateMod({ temperatureC: value === '' ? undefined : Number(value) });
  else if (id === 'rPoly') updateMod({ rPoly: value === '' ? undefined : Number(value) });
  else if (id === 'rNick') updateMod({ rNick: value === '' ? undefined : Number(value) });
  else if (id === 'deltaFold') updateMod({ deltaDeltaGFold: value === '' ? undefined : Number(value) });
  else if (id === 'linkerLength' || id === 'linkerPolarity') {
    const len = elements.fields.linkerLength.value;
    const pol = elements.fields.linkerPolarity.value;
    if (len === '' && !pol) updateMod({ linker: undefined });
    else updateMod({ linker: { length: len === '' ? undefined : Number(len), polarity: pol || undefined } });
  } else if (id === 'notes') updateMod({ notes: value || undefined });
  else if (id === 'deltaAssoc') {
    const num = value === '' ? undefined : Number(value);
    updateMod({ deltaDeltaGAssoc: num, rAssoc: num === undefined ? mod.rAssoc : undefined });
    syncAssocFields();
  } else if (id === 'rAssoc') {
    const num = value === '' ? undefined : Number(value);
    updateMod({ rAssoc: num, deltaDeltaGAssoc: num === undefined ? mod.deltaDeltaGAssoc : undefined });
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
  };
  upsertModification(newMod);
  mods = loadModifications();
  selectedId = id;
  renderList();
  populateForm();
  updateBindingTable();
  updateStatusBanner();
}

function handleDelete() {
  const mod = currentMod();
  if (!mod) return;
  if (!confirm(`Delete modification "${mod.label || mod.id}"?`)) return;
  deleteModification(mod.id);
  mods = loadModifications();
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

function init() {
  ensureSelectedExists();
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

  Object.values(elements.fields).forEach((field) => {
    field?.addEventListener('input', onFieldChange);
  });

  setupFitSection();
}

init();
