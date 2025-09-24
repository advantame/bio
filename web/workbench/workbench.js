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

const BASE_CONTEXT = {
  k1: 0.0020,
  b: 0.000048,
  G: 150,
  k2: 0.0031,
  KmP: 34,
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
}

init();
