import {
  initModificationStore,
  subscribe,
  listModifications,
  getActiveModification,
  setActiveModification,
  upsertModification,
  removeModification,
  getBaseParams,
  getAnalysisPrefs,
  updateAnalysisPrefs,
} from "../modifications/store.js";
import {
  clampPositive,
  rAssocFromDelta,
  deltaFromRAssoc,
  hairpinOpenFraction,
} from "../modifications/math.js";

const storeStatusEl = byId("storeStatus");
const modListEl = byId("modList");
const newBtn = byId("newModBtn");
const duplicateBtn = byId("duplicateModBtn");
const deleteBtn = byId("deleteModBtn");
const mapStatusEl = byId("mapStatus");
const mapControls = {
  simulator: {
    baseline: byId("map_simulator_baseline"),
    delta: byId("map_simulator_delta"),
    overlays: byId("map_simulator_overlays"),
  },
  bifurcation: {
    baseline: byId("map_bifurcation_baseline"),
    overlays: byId("map_bifurcation_overlays"),
  },
  heatmap: {
    baseline: byId("map_heatmap_baseline"),
    delta: byId("map_heatmap_delta"),
    overlays: byId("map_heatmap_overlays"),
  },
};
const BASELINE_ID = "mod-default";

const form = {
  label: byId("mod_label"),
  amino: byId("mod_amino"),
  linkerLength: byId("mod_linker"),
  linkerPolarity: byId("mod_linker_polarity"),
  temperature: byId("mod_temperature"),
  rAssoc: byId("mod_r_assoc"),
  ddgAssoc: byId("mod_ddg_assoc"),
  rPoly: byId("mod_r_poly"),
  rNick: byId("mod_r_nick"),
  useHairpin: byId("mod_use_hairpin"),
  ddgFold: byId("mod_ddg_fold"),
  notes: byId("mod_notes"),
};

const derivedEls = {
  k1: byId("derived_k1"),
  b: byId("derived_b"),
  g: byId("derived_g"),
  beta: byId("derived_beta"),
  dominance: byId("derived_dominance"),
  hairpin: byId("derived_hairpin"),
};

let unsubscribe = null;
let activeMod = null;
let suppressFormEvents = false;
let pendingDraft = null;
let saveScheduled = false;
let saving = false;
let lastSnapshot = null;
let analysisPrefs = null;
let suppressMapEvents = false;

void (async function bootstrap() {
  updateStoreStatus("Loading store…", true);
  await initModificationStore();
  unsubscribe = subscribe(handleSnapshot);
  handleSnapshot({
    ready: true,
    activeId: getActiveModification()?.id || null,
    modifications: listModifications(),
    analysisPrefs: getAnalysisPrefs(),
  });
  attachEventListeners();
})();

function attachEventListeners() {
  newBtn.addEventListener("click", async () => {
    try {
      const snapshot = lastSnapshot || { modifications: [] };
      const nextIndex = snapshot.modifications.length + 1;
      const base = getBaseParams();
      const label = `Modification ${nextIndex}`;
      const payload = {
        label,
        temperatureC: base.temperatureC ?? 37,
        rAssoc: 1,
        rPoly: 1,
        rNick: 1,
      };
      const saved = await upsertModification(payload);
      await setActiveModification(saved.id);
    } catch (err) {
      console.error("Failed to create modification", err);
    }
  });

  duplicateBtn.addEventListener("click", async () => {
    if (!activeMod) return;
    try {
      const snapshot = lastSnapshot || { modifications: [] };
      const nextIndex = snapshot.modifications.length + 1;
      const copy = toBasePayload({ ...activeMod });
      delete copy.id;
      copy.label = `${activeMod.label || "Modification"} (copy ${nextIndex})`;
      const saved = await upsertModification(copy);
      await setActiveModification(saved.id);
    } catch (err) {
      console.error("Failed to duplicate modification", err);
    }
  });

  deleteBtn.addEventListener("click", async () => {
    if (!activeMod) return;
    try {
      await removeModification(activeMod.id);
    } catch (err) {
      console.error("Failed to delete modification", err);
    }
  });

  form.label.addEventListener("input", () => handleTextField("label", form.label.value));
  form.amino.addEventListener("input", () => handleTextField("aminoAcid", form.amino.value));
  form.notes.addEventListener("input", () => handleTextField("notes", form.notes.value));

  form.temperature.addEventListener("input", () => {
    if (!activeMod || suppressFormEvents) return;
    if (!form.temperature.value.trim()) return;
    const temp = parseNumber(form.temperature.value, activeMod.temperatureC ?? 37);
    const delta = deltaFromRAssoc(activeMod.rAssoc ?? 1, temp);
    queueUpdate({ temperatureC: temp, deltaDeltaGAssoc: delta });
    withSuppressed(() => {
      form.temperature.value = formatNumber(temp, 2);
      form.ddgAssoc.value = formatNumber(delta, 3);
    });
  });

  form.rAssoc.addEventListener("input", () => {
    if (!activeMod || suppressFormEvents) return;
    if (!form.rAssoc.value.trim()) return;
    const rAssoc = clampPositive(parseNumber(form.rAssoc.value, activeMod.rAssoc ?? 1), 1);
    const delta = deltaFromRAssoc(rAssoc, activeMod.temperatureC ?? 37);
    queueUpdate({ rAssoc, deltaDeltaGAssoc: delta });
    withSuppressed(() => {
      form.ddgAssoc.value = formatNumber(delta, 3);
      form.rAssoc.value = formatNumber(rAssoc, 3);
    });
  });

  form.ddgAssoc.addEventListener("input", () => {
    if (!activeMod || suppressFormEvents) return;
    if (!form.ddgAssoc.value.trim()) return;
    const delta = parseNumber(form.ddgAssoc.value, activeMod.deltaDeltaGAssoc ?? 0);
    const rAssoc = clampPositive(rAssocFromDelta(delta, activeMod.temperatureC ?? 37), 1);
    queueUpdate({ deltaDeltaGAssoc: delta, rAssoc });
    withSuppressed(() => {
      form.rAssoc.value = formatNumber(rAssoc, 3);
      form.ddgAssoc.value = formatNumber(delta, 3);
    });
  });

  form.rPoly.addEventListener("input", () => {
    if (!activeMod || suppressFormEvents) return;
    if (!form.rPoly.value.trim()) return;
    const rPoly = clampPositive(parseNumber(form.rPoly.value, activeMod.rPoly ?? 1), 1);
    queueUpdate({ rPoly });
    withSuppressed(() => {
      form.rPoly.value = formatNumber(rPoly, 3);
    });
  });

  form.rNick.addEventListener("input", () => {
    if (!activeMod || suppressFormEvents) return;
    if (!form.rNick.value.trim()) return;
    const rNick = clampPositive(parseNumber(form.rNick.value, activeMod.rNick ?? 1), 1);
    queueUpdate({ rNick });
    withSuppressed(() => {
      form.rNick.value = formatNumber(rNick, 3);
    });
  });

  form.useHairpin.addEventListener("change", () => {
    if (!activeMod || suppressFormEvents) return;
    const useHairpin = form.useHairpin.value === "true";
    queueUpdate({ useHairpin });
  });

  form.ddgFold.addEventListener("input", () => {
    if (!activeMod || suppressFormEvents) return;
    if (!form.ddgFold.value.trim()) return;
    const delta = parseNumber(form.ddgFold.value, activeMod.deltaDeltaGFold ?? 0);
    queueUpdate({ deltaDeltaGFold: delta });
  });

  form.linkerLength.addEventListener("input", handleLinkerChange);
  form.linkerPolarity.addEventListener("change", handleLinkerChange);

  Object.entries(mapControls).forEach(([page, controls]) => {
    if (controls.baseline) {
      controls.baseline.addEventListener("change", () => {
        if (suppressMapEvents) return;
        void applyAnalysisPref(page, { showBaseline: controls.baseline.checked });
      });
    }
    if (controls.delta) {
      controls.delta.addEventListener("change", () => {
        if (suppressMapEvents) return;
        void applyAnalysisPref(page, { showDelta: controls.delta.checked });
      });
    }
    if (controls.overlays) {
      controls.overlays.addEventListener("change", () => {
        if (suppressMapEvents) return;
        const selected = Array.from(controls.overlays.selectedOptions).map((opt) => opt.value);
        void applyAnalysisPref(page, { overlays: selected });
      });
    }
  });
}

function handleLinkerChange() {
  if (!activeMod || suppressFormEvents) return;
  const rawLength = form.linkerLength.value.trim();
  const length = rawLength === "" ? null : Number(rawLength);
  const polarity = form.linkerPolarity.value || undefined;
  let linker = undefined;
  if (length !== null && Number.isFinite(length) && length >= 0) {
    linker = { length };
    if (polarity) linker.polarity = polarity;
  } else if (polarity && Number.isFinite(activeMod.linker?.length)) {
    linker = { length: activeMod.linker.length, polarity };
  }
  queueUpdate({ linker });
}

function handleTextField(field, value) {
  if (!activeMod || suppressFormEvents) return;
  queueUpdate({ [field]: value });
}

function handleSnapshot(snapshot) {
  lastSnapshot = snapshot;
  updateStoreStatus("Ready", false);
  const mods = snapshot.modifications || listModifications();
  analysisPrefs = cloneAnalysisPrefs(snapshot.analysisPrefs);
  renderModList(mods, snapshot.activeId);
  const active = mods.find((m) => m.id === snapshot.activeId) || mods[0] || null;
  activeMod = active ? { ...active } : null;
  setFormDisabled(!activeMod);
  updateButtons(activeMod);
  if (activeMod) {
    fillForm(activeMod);
    updateDerived(activeMod);
  } else {
    clearForm();
    clearDerived();
  }
  renderMapControls(mods, analysisPrefs);
}

function renderModList(mods, activeId) {
  modListEl.innerHTML = "";
  mods.forEach((mod) => {
    const li = document.createElement("li");
    li.className = "mod-item" + (mod.id === activeId ? " active" : "");
    li.dataset.id = mod.id;

    const title = document.createElement("div");
    title.className = "mod-item-title";
    title.textContent = mod.label || mod.id;
    li.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "mod-item-meta";
    const rAssoc = formatNumber(mod.rAssoc, 3, "–");
    const rPoly = formatNumber(mod.rPoly, 3, "–");
    const rNick = formatNumber(mod.rNick, 3, "–");
    meta.textContent = `r_assoc ${rAssoc}, r_poly ${rPoly}, r_nick ${rNick}`;
    li.appendChild(meta);

    li.addEventListener("click", async () => {
      if (mod.id === activeId) return;
      try {
        await setActiveModification(mod.id);
      } catch (err) {
        console.error("Failed to set active modification", err);
      }
    });

    modListEl.appendChild(li);
  });
}

function fillForm(mod) {
  withSuppressed(() => {
    form.label.value = mod.label || "";
    form.amino.value = mod.aminoAcid || "";
    form.temperature.value = formatNumber(mod.temperatureC ?? 37, 2);
    form.rAssoc.value = formatNumber(mod.rAssoc ?? 1, 3);
    form.ddgAssoc.value = formatNumber(mod.deltaDeltaGAssoc ?? 0, 3);
    form.rPoly.value = formatNumber(mod.rPoly ?? 1, 3);
    form.rNick.value = formatNumber(mod.rNick ?? 1, 3);
    form.useHairpin.value = mod.useHairpin ? "true" : "false";
    form.ddgFold.value = formatNumber(mod.deltaDeltaGFold ?? 0, 3);
    form.notes.value = mod.notes || "";
    form.linkerLength.value = mod.linker && Number.isFinite(mod.linker.length)
      ? String(mod.linker.length)
      : "";
    form.linkerPolarity.value = mod.linker?.polarity || "";
  });
}

function clearForm() {
  withSuppressed(() => {
    Object.values(form).forEach((el) => {
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
        el.value = "";
      }
    });
  });
}

function updateDerived(mod) {
  derivedEls.k1.textContent = formatNumber(mod.k1Eff, 4, "–");
  derivedEls.b.textContent = formatNumber(mod.bEff, 6, "–");
  derivedEls.g.textContent = formatNumber(mod.gEff, 4, "–");
  derivedEls.beta.textContent = formatNumber(mod.betaEff, 4, "–");
  derivedEls.dominance.textContent = mod.dominance ? capitalize(mod.dominance) : "–";
  const hairpin = Number.isFinite(mod.hairpinOpen)
    ? mod.hairpinOpen
    : mod.useHairpin
    ? hairpinOpenFraction(mod.deltaDeltaGFold ?? 0, mod.temperatureC ?? 37)
    : 1;
  derivedEls.hairpin.textContent = formatNumber(hairpin, 3, "–");
}

function clearDerived() {
  Object.values(derivedEls).forEach((el) => (el.textContent = "–"));
}

function updateButtons(mod) {
  const canAct = Boolean(mod);
  duplicateBtn.disabled = !canAct;
  deleteBtn.disabled = !canAct || mod.id === "mod-default";
}

function setFormDisabled(disabled) {
  Object.values(form).forEach((el) => {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      el.disabled = disabled;
    }
  });
}

function queueUpdate(patch) {
  if (!activeMod) return;
  activeMod = { ...activeMod, ...patch };
  pendingDraft = { ...activeMod };
  updateDerived(activeMod);
  if (!saveScheduled) {
    saveScheduled = true;
    requestAnimationFrame(() => {
      saveScheduled = false;
      if (pendingDraft) {
        const draft = pendingDraft;
        pendingDraft = null;
        flushDraft(draft);
      }
    });
  }
}

async function flushDraft(draft) {
  if (saving) {
    pendingDraft = { ...draft };
    return;
  }
  saving = true;
  try {
    const payload = toBasePayload(draft);
    const saved = await upsertModification(payload);
    await setActiveModification(saved.id);
  } catch (err) {
    console.error("Failed to save modification", err);
  } finally {
    saving = false;
    if (pendingDraft) {
      const next = pendingDraft;
      pendingDraft = null;
      flushDraft(next);
    }
  }
}

function toBasePayload(mod) {
  const base = {
    id: mod.id,
    label: mod.label,
    aminoAcid: mod.aminoAcid,
    temperatureC: mod.temperatureC,
    rAssoc: mod.rAssoc,
    rPoly: mod.rPoly,
    rNick: mod.rNick,
    deltaDeltaGAssoc: mod.deltaDeltaGAssoc,
    deltaDeltaGFold: mod.deltaDeltaGFold,
    useHairpin: mod.useHairpin,
    notes: mod.notes,
  };
  if (mod.linker) {
    base.linker = { ...mod.linker };
  } else if (mod.linker === null) {
    base.linker = null;
  }
  return base;
}

function renderMapControls(mods, prefs) {
  if (!mapStatusEl) return;
  const modifications = Array.isArray(mods) ? mods : [];
  const overlayCandidates = modifications.filter((mod) => mod.id && mod.id !== BASELINE_ID);
  suppressMapEvents = true;
  try {
    Object.entries(mapControls).forEach(([page, controls]) => {
      const pref = prefs?.[page] || {};
      if (controls.baseline) {
        controls.baseline.disabled = false;
        controls.baseline.checked = pref.showBaseline !== false;
      }
      if (controls.delta) {
        controls.delta.disabled = pref.showBaseline === false;
        controls.delta.checked = pref.showDelta !== false && pref.showBaseline !== false;
      }
      if (controls.overlays) {
        const select = controls.overlays;
        select.innerHTML = "";
        overlayCandidates.forEach((mod) => {
          const option = document.createElement("option");
          option.value = mod.id;
          option.textContent = mod.label || mod.id;
          select.appendChild(option);
        });
        const overlays = Array.isArray(pref.overlays) ? pref.overlays : [];
        if (overlays.length) {
          const optionMap = new Map(Array.from(select.options).map((opt) => [opt.value, opt]));
          overlays.forEach((id) => {
            const option = optionMap.get(id);
            if (option) option.selected = true;
          });
        }
        select.disabled = overlayCandidates.length === 0;
      }
    });
  } finally {
    suppressMapEvents = false;
  }
  updateMapStatus("Ready", false);
}

async function applyAnalysisPref(page, patch) {
  if (!page || !patch) return;
  if (!analysisPrefs) {
    analysisPrefs = cloneAnalysisPrefs(getAnalysisPrefs());
  }
  const normalized = { ...patch };
  if (Array.isArray(patch.overlays)) {
    normalized.overlays = sanitizeOverlaySelection(patch.overlays);
  }
  if ((page === 'simulator' || page === 'heatmap') && 'showBaseline' in normalized && normalized.showBaseline === false) {
    normalized.showDelta = false;
  }
  const currentPagePrefs = analysisPrefs?.[page] || {};
  const nextPagePrefs = {
    ...currentPagePrefs,
    ...normalized,
  };
  analysisPrefs = {
    ...analysisPrefs,
    [page]: nextPagePrefs,
  };
  try {
    updateMapStatus("Saving…", true);
    await updateAnalysisPrefs(page, normalized);
    updateMapStatus("Ready", false);
  } catch (err) {
    console.error("Failed to save analysis preferences", err);
    updateMapStatus("Failed to save", false);
  }
}

function sanitizeOverlaySelection(ids) {
  if (!Array.isArray(ids)) return [];
  const snapshotMods = lastSnapshot?.modifications || listModifications();
  const validIds = new Set(snapshotMods.map((mod) => mod.id));
  validIds.delete(BASELINE_ID);
  const seen = new Set();
  const out = [];
  ids.forEach((id) => {
    if (!validIds.has(id) || seen.has(id)) return;
    seen.add(id);
    out.push(id);
  });
  return out;
}

function updateMapStatus(text, busy) {
  if (!mapStatusEl) return;
  if (busy) {
    mapStatusEl.innerHTML = `<span class="dot"></span>${text}`;
  } else {
    mapStatusEl.textContent = text;
  }
}

function cloneAnalysisPrefs(prefs) {
  return {
    simulator: { ...(prefs?.simulator || {}) },
    bifurcation: { ...(prefs?.bifurcation || {}) },
    heatmap: { ...(prefs?.heatmap || {}) },
  };
}

function updateStoreStatus(text, busy) {
  if (!storeStatusEl) return;
  if (busy) {
    storeStatusEl.innerHTML = `<span class="dot"></span>${text}`;
  } else {
    storeStatusEl.textContent = text;
  }
}

function parseNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function withSuppressed(fn) {
  suppressFormEvents = true;
  try {
    fn();
  } finally {
    suppressFormEvents = false;
  }
}

function formatNumber(value, digits = 3, fallback = "") {
  if (!Number.isFinite(value)) return fallback;
  const abs = Math.abs(value);
  if ((abs !== 0 && (abs < 0.001 || abs >= 10000))) {
    return value.toExponential(2);
  }
  return Number(value).toFixed(digits);
}

function capitalize(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function byId(id) {
  return document.getElementById(id);
}
