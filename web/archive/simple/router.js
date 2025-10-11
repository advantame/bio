// Router for Simple Flow
import { loadPreferences, savePreferences } from '../modifications.js';

// Step configurations
const STEPS = {
  1: {
    title: '設計 — Hypothesis & Card Editing',
    description: '修飾カードの編集、濃度↔比率トグル、プリセット選択',
    module: './steps/step1.js',
  },
  2: {
    title: '即時予測 — Time Series & Quick Comparison',
    description: '時間波形・派生パラメータ・簡易比較',
    module: './steps/step2.js',
  },
  3: {
    title: '同定 — Fit & Titration',
    description: 'CSV ドロップ → Fit → 結果反映、滴定サブセクション',
    module: './steps/step3.js',
  },
  4: {
    title: '比較 — Bifurcation & Heatmap',
    description: '分岐図 / ヒートマップ / オーバーレイ管理',
    module: './steps/step4.js',
  },
};

// Current state (0 means not initialized)
let currentStep = 0;

// DOM elements (will be initialized in init())
let stepContainer;
let btnBack;
let btnNext;
let stepLinks;

/**
 * Parse the current URL to determine the step
 */
function parseURL() {
  const hash = window.location.hash.slice(1); // Remove #
  const parts = hash.split('/').filter(p => p); // Remove empty strings

  // Expected format: #/simple/1 → ['simple', '1']
  if (parts.length >= 2 && parts[0] === 'simple') {
    const step = parseInt(parts[1], 10);
    return step >= 1 && step <= 4 ? step : 1;
  }

  // Fallback: try to parse just the number (e.g., #1 → ['1'])
  const step = parseInt(parts[0], 10);
  return step >= 1 && step <= 4 ? step : 1;
}

/**
 * Update the URL without reload
 */
function updateURL(step) {
  const newHash = `#/simple/${step}`;
  if (window.location.hash !== newHash) {
    window.location.hash = newHash;
  }
}

/**
 * Update the stepper UI
 */
function updateStepper() {
  if (!stepLinks || stepLinks.length === 0) return;

  stepLinks.forEach((link) => {
    const linkStep = parseInt(link.dataset.step, 10);
    if (linkStep === currentStep) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });
}

/**
 * Update CTA buttons
 */
function updateCTAButtons() {
  btnBack.disabled = currentStep === 1;
  // For now, allow all next clicks. Step completion validation will be added in later phases.
  btnNext.disabled = currentStep === 4;
  btnNext.textContent = currentStep === 4 ? '完了' : '次へ →';
}

/**
 * Load and render the current step
 */
async function renderStep() {
  const stepConfig = STEPS[currentStep];

  if (!stepConfig) {
    stepContainer.innerHTML = `
      <h1 class="simple-step-title">Error</h1>
      <p class="simple-step-description">Invalid step: ${currentStep}</p>
    `;
    return;
  }

  // Show placeholder while loading
  stepContainer.innerHTML = `
    <h1 class="simple-step-title">${stepConfig.title}</h1>
    <p class="simple-step-description">${stepConfig.description}</p>
    <div class="placeholder-content">
      <h3>Loading...</h3>
      <p>Initializing step ${currentStep}</p>
    </div>
  `;

  // Try to load the step module
  try {
    const module = await import(stepConfig.module);

    // Clear container
    stepContainer.innerHTML = '';

    // Call the step's render function
    if (module.render) {
      await module.render(stepContainer);
    } else {
      throw new Error('Step module missing render function');
    }
  } catch (error) {
    console.warn(`[router] Step ${currentStep} module not yet implemented:`, error);

    // Show placeholder for unimplemented steps
    stepContainer.innerHTML = `
      <h1 class="simple-step-title">${stepConfig.title}</h1>
      <p class="simple-step-description">${stepConfig.description}</p>
      <div class="placeholder-content">
        <h3>Step ${currentStep} — Coming Soon</h3>
        <p>${stepConfig.description}</p>
        <p style="margin-top: 1rem; font-size: 0.75rem; color: var(--gray-400);">
          Module: ${stepConfig.module}
        </p>
      </div>
    `;
  }
}

/**
 * Navigate to a specific step (internal use only - updates without changing URL)
 */
async function navigateToStep(step) {
  if (step < 1 || step > 4) return;

  currentStep = step;
  updateStepper();
  updateCTAButtons();
  await renderStep();

  // Save last step to preferences
  const prefs = loadPreferences();
  savePreferences({ ...prefs, lastStep: step });

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Initialize the router
 */
function init() {
  // Get DOM elements
  stepContainer = document.getElementById('stepContainer');
  btnBack = document.getElementById('btnBack');
  btnNext = document.getElementById('btnNext');
  stepLinks = document.querySelectorAll('.simple-step');

  if (!stepContainer || !btnBack || !btnNext || stepLinks.length === 0) {
    console.error('[router] Required DOM elements not found');
    return;
  }

  // Set up event listeners for CTA buttons
  btnBack.addEventListener('click', () => {
    if (currentStep > 1) {
      window.location.hash = `#/simple/${currentStep - 1}`;
    }
  });

  btnNext.addEventListener('click', () => {
    if (currentStep < 4) {
      window.location.hash = `#/simple/${currentStep + 1}`;
    }
  });

  // Handle hash changes (browser back/forward, stepper clicks, in-page links)
  window.addEventListener('hashchange', () => {
    const newStep = parseURL();
    if (newStep !== currentStep) {
      navigateToStep(newStep);
    }
  });

  // Parse URL or load from preferences
  const urlStep = parseURL();
  const prefs = loadPreferences();

  // Determine initial step
  let initialStep = 1;
  if (window.location.hash && urlStep) {
    // URL has a hash, use it
    initialStep = urlStep;
  } else if (prefs.lastStep) {
    // No hash, but we have a saved preference
    initialStep = prefs.lastStep;
  }

  // Set URL if not already set
  const needsURLUpdate = !window.location.hash || parseURL() !== initialStep;
  if (needsURLUpdate) {
    // Setting hash will trigger hashchange event
    // currentStep is 0, so hashchange handler will always trigger navigation
    window.location.hash = `#/simple/${initialStep}`;
  } else {
    // URL already correct, just render
    currentStep = initialStep;
    navigateToStep(currentStep);
  }
}

// Start the router when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
