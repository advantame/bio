import { initWasm, computeEffectiveParams } from "../core.js";
import {
  EPS,
  clampPositive,
  rAssocFromDelta,
  deltaFromRAssoc,
  hairpinOpenFraction,
} from "./math.js";

const DB_NAME = "modification-workbench";
const DB_VERSION = 1;
const STORE_MODS = "modifications";
const STORE_SETTINGS = "settings";
const KEY_BASE_PARAMS = "baseParams";
const KEY_ACTIVE_MOD = "activeModificationId";
const KEY_ANALYSIS_PREFS = "analysisPrefs";
const GLOBAL_CRYPTO =
  typeof globalThis !== "undefined" && globalThis.crypto ? globalThis.crypto : null;

const DEFAULT_BASE_PARAMS = {
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

export const BASE_PARAMS_DEFAULT = { ...DEFAULT_BASE_PARAMS };

const MOD_FIELD_DEFAULTS = {
  label: "New modification",
  temperatureC: 37,
  rAssoc: 1,
  rPoly: 1,
  rNick: 1,
  deltaDeltaGAssoc: 0,
  deltaDeltaGFold: 0,
  useHairpin: false,
  notes: "",
};

const DEFAULT_MODIFICATION = {
  id: "mod-default",
  ...MOD_FIELD_DEFAULTS,
  label: "No modification",
  notes: "Baseline (unmodified) condition.",
};

export const BASE_MODIFICATION_TEMPLATE = { ...DEFAULT_MODIFICATION };

const DEFAULT_ANALYSIS_PREFS = {
  simulator: { showBaseline: true, showDelta: true, overlays: [] },
  bifurcation: { showBaseline: true, overlays: [] },
  heatmap: { showBaseline: true, showDelta: true, overlays: [] },
};

const state = {
  ready: false,
  db: null,
  baseParams: { ...DEFAULT_BASE_PARAMS },
  modifications: new Map(),
  activeId: null,
  analysisPrefs: clonePrefs(DEFAULT_ANALYSIS_PREFS),
  listeners: new Set(),
};

let initPromise = null;

export function subscribe(listener) {
  state.listeners.add(listener);
  if (state.ready) listener(getSnapshot());
  return () => state.listeners.delete(listener);
}

export function getSnapshot() {
  return {
    ready: state.ready,
    baseParams: { ...state.baseParams },
    activeId: state.activeId,
    modifications: Array.from(state.modifications.values()).map((m) => ({
      ...m,
    })),
    analysisPrefs: clonePrefs(state.analysisPrefs),
  };
}

export function listModifications() {
  if (!state.ready) return [];
  return Array.from(state.modifications.values()).map((m) => ({ ...m }));
}

function emit() {
  const snap = getSnapshot();
  state.listeners.forEach((listener) => listener(snap));
}

export async function initModificationStore() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    await initWasm();
    state.db = await openDatabase();
    state.baseParams = await loadBaseParams(state.db);
    const mods = await loadModifications(state.db);
    if (mods.length === 0) {
      await persistModification(state.db, DEFAULT_MODIFICATION);
      mods.push({ ...DEFAULT_MODIFICATION });
    }
    // Normalize & compute derived fields
    for (const raw of mods) {
      const normalized = normalizeModification(raw);
      const enriched = await enrichModification(normalized);
      state.modifications.set(enriched.id, enriched);
    }
    state.activeId = await loadActiveId(state.db);
    if (!state.activeId || !state.modifications.has(state.activeId)) {
      state.activeId = DEFAULT_MODIFICATION.id;
      await persistActiveId(state.db, state.activeId);
    }
    state.analysisPrefs = await loadAnalysisPrefs(state.db);
    state.ready = true;
    emit();
  })();
  return initPromise;
}

export function getActiveModification() {
  if (!state.ready) return null;
  const mod = state.modifications.get(state.activeId);
  return mod ? { ...mod } : null;
}

export function getModification(id) {
  if (!state.ready) return null;
  const mod = state.modifications.get(id);
  return mod ? { ...mod } : null;
}

export async function setActiveModification(id) {
  if (!state.ready) throw new Error("Modification store not initialized");
  if (id && !state.modifications.has(id)) {
    throw new Error(`Unknown modification id: ${id}`);
  }
  state.activeId = id;
  if (state.db) await persistActiveId(state.db, id);
  emit();
}

export async function upsertModification(mod) {
  if (!state.ready) throw new Error("Modification store not initialized");
  const normalized = normalizeModification(mod);
  const enriched = await enrichModification(normalized);
  state.modifications.set(enriched.id, enriched);
  if (state.db) await persistModification(state.db, normalized);
  if (!state.activeId) {
    state.activeId = enriched.id;
    if (state.db) await persistActiveId(state.db, enriched.id);
  }
  emit();
  return enriched;
}

export async function removeModification(id) {
  if (!state.ready) throw new Error("Modification store not initialized");
  if (id === DEFAULT_MODIFICATION.id) {
    throw new Error("Cannot remove baseline modification");
  }
  state.modifications.delete(id);
  if (state.db) await deleteModification(state.db, id);
  if (state.activeId === id) {
    state.activeId = DEFAULT_MODIFICATION.id;
    if (state.db) await persistActiveId(state.db, state.activeId);
  }
  emit();
}

export function getBaseParams() {
  return { ...state.baseParams };
}

export async function updateBaseParams(partial) {
  if (!state.ready) throw new Error("Modification store not initialized");
  state.baseParams = { ...state.baseParams, ...partial };
  if (state.db) await persistBaseParams(state.db, state.baseParams);
  // Recompute derived fields for all modifications
  const entries = Array.from(state.modifications.entries());
  state.modifications.clear();
  for (const [id, mod] of entries) {
    const enriched = await enrichModification(mod);
    state.modifications.set(id, enriched);
  }
  emit();
}

export async function getEffectiveParametersFor(id) {
  if (!state.ready) throw new Error("Modification store not initialized");
  const mod = id ? state.modifications.get(id) : getActiveModification();
  if (!mod) return null;
  const { k1Eff, bEff, gEff, betaEff, rAssoc, rPoly, rNick } = mod;
  return { k1Eff, bEff, gEff, betaEff, rAssoc, rPoly, rNick };
}

export function getAnalysisPrefs() {
  return clonePrefs(state.analysisPrefs);
}

export async function updateAnalysisPrefs(page, patch) {
  if (!state.ready) throw new Error("Modification store not initialized");
  if (!page || !state.analysisPrefs[page]) {
    throw new Error(`Unknown analysis page: ${page}`);
  }
  const merged = {
    ...state.analysisPrefs[page],
    ...patch,
  };
  const overlays = Array.isArray(merged.overlays)
    ? Array.from(new Set(merged.overlays.filter((id) => state.modifications.has(id) && id !== DEFAULT_MODIFICATION.id)))
    : state.analysisPrefs[page].overlays;
  state.analysisPrefs = {
    ...state.analysisPrefs,
    [page]: {
      ...merged,
      overlays,
    },
  };
  if (state.db) await persistAnalysisPrefs(state.db, state.analysisPrefs);
  emit();
}

async function enrichModification(mod) {
  const base = state.baseParams;
  const temperatureC = Number.isFinite(mod.temperatureC) ? mod.temperatureC : 37;
  const rAssoc = deriveRAssoc(mod);
  const rPoly = clampPositive(mod.rPoly, 1);
  const rNick = clampPositive(mod.rNick, 1);

  const { k1Eff, bEff } = computeEffectiveParams(
    { k1: base.k1, b: base.b },
    { rAssoc, rPoly, rNick }
  );
  const ratio = (rAssoc * rPoly) / (rNick || EPS);
  const gBase = computeBaseG(base);
  const betaBase = computeBaseBeta(base);
  let gEff = gBase * ratio;
  let gFree = base.G;
  let hairpinOpen = 1;
  if (mod.useHairpin) {
    hairpinOpen = hairpinOpenFraction(mod.deltaDeltaGFold, temperatureC);
    gFree = base.G * hairpinOpen;
    gEff = (k1Eff * gFree) / (base.k2 * base.KmP || EPS);
  }
  const betaEff = betaBase / (rPoly || EPS);

  const dominance = classifyDominance(rAssoc, rPoly, rNick);

  const deltaDeltaGAssoc = deriveDeltaGFromRAssoc(rAssoc, temperatureC);

  return {
    ...mod,
    temperatureC,
    rAssoc,
    rPoly,
    rNick,
    k1Eff,
    bEff,
    gEff,
    betaEff,
    gFree,
    hairpinOpen,
    deltaDeltaGAssoc,
    dominance,
  };
}

function normalizeModification(mod) {
  const id = mod.id || generateId();
  const base = {
    ...MOD_FIELD_DEFAULTS,
    id,
  };
  const merged = {
    ...base,
    ...mod,
  };

  if (typeof merged.mod_factor === "number" && merged.mod_factor > 0) {
    merged.rPoly = merged.mod_factor;
    merged.rAssoc = merged.rAssoc ?? 1;
    merged.rNick = merged.rNick ?? 1;
    delete merged.mod_factor;
  }

  if (typeof merged.use_hairpin === "boolean" && merged.useHairpin === undefined) {
    merged.useHairpin = merged.use_hairpin;
  }
  if (Number.isFinite(merged.ddelta_g_fold) && merged.deltaDeltaGFold === undefined) {
    merged.deltaDeltaGFold = merged.ddelta_g_fold;
  }
  delete merged.use_hairpin;
  delete merged.ddelta_g_fold;

  merged.temperatureC = Number.isFinite(merged.temperatureC)
    ? merged.temperatureC
    : 37;
  merged.rPoly = clampPositive(merged.rPoly, 1);
  merged.rNick = clampPositive(merged.rNick, 1);
  if (!Number.isFinite(merged.rAssoc) || merged.rAssoc <= 0) {
    if (Number.isFinite(merged.deltaDeltaGAssoc)) {
      merged.rAssoc = deriveRAssoc(merged);
    } else {
      merged.rAssoc = 1;
    }
  }
  if (!Number.isFinite(merged.deltaDeltaGAssoc)) {
    merged.deltaDeltaGAssoc = deriveDeltaGFromRAssoc(
      merged.rAssoc,
      merged.temperatureC
    );
  }
  if (!Number.isFinite(merged.deltaDeltaGFold)) {
    merged.deltaDeltaGFold = 0;
  }
  merged.useHairpin = Boolean(merged.useHairpin);
  if (typeof merged.label !== "string" || !merged.label.trim()) {
    merged.label = id;
  }
  return merged;
}

function deriveRAssoc(mod) {
  if (Number.isFinite(mod.rAssoc) && mod.rAssoc > 0) return mod.rAssoc;
  if (Number.isFinite(mod.deltaDeltaGAssoc)) {
    return rAssocFromDelta(mod.deltaDeltaGAssoc, mod.temperatureC);
  }
  return 1;
}

function deriveDeltaGFromRAssoc(rAssoc, temperatureC) {
  return deltaFromRAssoc(rAssoc, temperatureC);
}

function computeBaseG(base) {
  return (base.k1 * base.G) / (base.k2 * base.KmP || EPS);
}

function computeBaseBeta(base) {
  return (base.b * base.k2 * base.KmP * base.KmP) / (base.k1 || EPS);
}

function classifyDominance(rAssoc, rPoly, rNick) {
  const entries = [
    ["association", Math.abs(Math.log(rAssoc))],
    ["polymerase", Math.abs(Math.log(rPoly))],
    ["saturation", Math.abs(Math.log(rNick))],
  ];
  entries.sort((a, b) => b[1] - a[1]);
  const [topLabel, topVal] = entries[0];
  const secondVal = entries[1][1];
  if (topVal < 0.05) return "mixed";
  if (topVal - secondVal > 0.1) return topLabel;
  return "mixed";
}

function generateId() {
  if (GLOBAL_CRYPTO && GLOBAL_CRYPTO.randomUUID) {
    return GLOBAL_CRYPTO.randomUUID();
  }
  return `mod-${Math.random().toString(36).slice(2, 10)}`;
}

function clonePrefs(prefObj) {
  return {
    simulator: {
      showBaseline: prefObj.simulator?.showBaseline ?? true,
      showDelta: prefObj.simulator?.showDelta ?? true,
      overlays: Array.isArray(prefObj.simulator?.overlays)
        ? prefObj.simulator.overlays.slice()
        : [],
    },
    bifurcation: {
      showBaseline: prefObj.bifurcation?.showBaseline ?? true,
      overlays: Array.isArray(prefObj.bifurcation?.overlays)
        ? prefObj.bifurcation.overlays.slice()
        : [],
    },
    heatmap: {
      showBaseline: prefObj.heatmap?.showBaseline ?? true,
      showDelta: prefObj.heatmap?.showDelta ?? true,
      overlays: Array.isArray(prefObj.heatmap?.overlays)
        ? prefObj.heatmap.overlays.slice()
        : [],
    },
  };
}

function mergePrefs(raw) {
  const merged = clonePrefs(DEFAULT_ANALYSIS_PREFS);
  for (const key of Object.keys(DEFAULT_ANALYSIS_PREFS)) {
    if (raw && typeof raw[key] === "object") {
      merged[key] = {
        ...merged[key],
        ...raw[key],
        overlays: Array.isArray(raw[key].overlays)
          ? raw[key].overlays.slice()
          : merged[key].overlays,
      };
    }
  }
  return merged;
}

async function openDatabase() {
  if (typeof indexedDB === "undefined") return null;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_MODS)) {
        db.createObjectStore(STORE_MODS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS);
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function loadModifications(db) {
  if (!db) return [{ ...DEFAULT_MODIFICATION }];
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MODS, "readonly");
    const store = tx.objectStore(STORE_MODS);
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const value = request.result || [];
      resolve(value.map((item) => ({ ...item })));
    };
  });
}

async function loadBaseParams(db) {
  if (!db) return { ...DEFAULT_BASE_PARAMS };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SETTINGS, "readonly");
    const store = tx.objectStore(STORE_SETTINGS);
    const request = store.get(KEY_BASE_PARAMS);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const value = request.result;
      if (value && typeof value === "object") {
        resolve({ ...DEFAULT_BASE_PARAMS, ...value });
      } else {
        resolve({ ...DEFAULT_BASE_PARAMS });
      }
    };
  });
}

async function loadActiveId(db) {
  if (!db) return DEFAULT_MODIFICATION.id;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SETTINGS, "readonly");
    const store = tx.objectStore(STORE_SETTINGS);
    const request = store.get(KEY_ACTIVE_MOD);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      resolve(request.result || DEFAULT_MODIFICATION.id);
    };
  });
}

async function loadAnalysisPrefs(db) {
  if (!db) return clonePrefs(DEFAULT_ANALYSIS_PREFS);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SETTINGS, "readonly");
    const store = tx.objectStore(STORE_SETTINGS);
    const request = store.get(KEY_ANALYSIS_PREFS);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const value = request.result;
      if (value && typeof value === "object") {
        resolve(mergePrefs(value));
      } else {
        resolve(clonePrefs(DEFAULT_ANALYSIS_PREFS));
      }
    };
  });
}

async function persistModification(db, mod) {
  if (!db) return;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MODS, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    tx.objectStore(STORE_MODS).put(mod);
  });
}

async function deleteModification(db, id) {
  if (!db) return;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MODS, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    tx.objectStore(STORE_MODS).delete(id);
  });
}

async function persistBaseParams(db, base) {
  if (!db) return;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SETTINGS, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    tx.objectStore(STORE_SETTINGS).put(base, KEY_BASE_PARAMS);
  });
}

async function persistActiveId(db, id) {
  if (!db) return;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SETTINGS, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    tx.objectStore(STORE_SETTINGS).put(id, KEY_ACTIVE_MOD);
  });
}

async function persistAnalysisPrefs(db, prefs) {
  if (!db) return;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SETTINGS, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    tx.objectStore(STORE_SETTINGS).put(clonePrefs(prefs), KEY_ANALYSIS_PREFS);
  });
}
