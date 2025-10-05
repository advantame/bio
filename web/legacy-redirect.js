// Legacy URL redirect helper
// This script can be included in legacy pages to optionally redirect to Simple Flow

/**
 * Check if we should redirect to Simple Flow based on user preferences
 * Returns the redirect URL if applicable, null otherwise
 */
export function getLegacyRedirectURL() {
  // Check if user has opted to always use legacy pages
  const useLegacy = localStorage.getItem('pp_use_legacy_pages');
  if (useLegacy === 'true') {
    return null;
  }

  // Determine the current page and construct Simple Flow URL
  const path = window.location.pathname;
  const search = window.location.search;
  const params = new URLSearchParams(search);

  // /workbench → /simple/1 (unless mode=detail)
  if (path.includes('/workbench')) {
    if (params.get('mode') === 'detail') {
      return '/detail/' + search;
    }
    return '/simple/#/simple/1' + search;
  }

  // /simulator → /simple/2?view=time
  if (path.includes('/simulator')) {
    const newParams = new URLSearchParams(search);
    newParams.set('view', 'time');
    return '/simple/#/simple/2?' + newParams.toString();
  }

  // /bifurcation → /simple/4?view=bifurcation
  if (path.includes('/bifurcation')) {
    const newParams = new URLSearchParams(search);
    newParams.set('view', 'bifurcation');
    return '/simple/#/simple/4?' + newParams.toString();
  }

  // /heatmap → /simple/4?view=heatmap
  if (path.includes('/heatmap')) {
    const newParams = new URLSearchParams(search);
    newParams.set('view', 'heatmap');
    return '/simple/#/simple/4?' + newParams.toString();
  }

  return null;
}

/**
 * Show a banner offering to redirect to Simple Flow
 */
export function showRedirectBanner() {
  const redirectURL = getLegacyRedirectURL();
  if (!redirectURL) return;

  // Create banner
  const banner = document.createElement('div');
  banner.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: #2563eb;
    color: white;
    padding: 1rem;
    text-align: center;
    z-index: 9999;
    font-family: system-ui, sans-serif;
    font-size: 0.875rem;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  `;

  banner.innerHTML = `
    <div style="max-width: 1200px; margin: 0 auto; display: flex; align-items: center; justify-content: center; gap: 1rem; flex-wrap: wrap;">
      <span>🎉 新しいSimple Flowが利用可能です！</span>
      <button id="redirectToSimple" style="
        background: white;
        color: #2563eb;
        border: none;
        padding: 0.5rem 1rem;
        border-radius: 0.25rem;
        font-weight: 600;
        cursor: pointer;
      ">
        Simple Flowを使う
      </button>
      <button id="stayLegacy" style="
        background: transparent;
        color: white;
        border: 1px solid white;
        padding: 0.5rem 1rem;
        border-radius: 0.25rem;
        cursor: pointer;
      ">
        今のページを使い続ける
      </button>
      <button id="dismissBanner" style="
        background: transparent;
        color: white;
        border: none;
        padding: 0.5rem;
        cursor: pointer;
        margin-left: auto;
      ">
        ✕
      </button>
    </div>
  `;

  document.body.insertBefore(banner, document.body.firstChild);

  // Event handlers
  document.getElementById('redirectToSimple').addEventListener('click', () => {
    window.location.href = redirectURL;
  });

  document.getElementById('stayLegacy').addEventListener('click', () => {
    localStorage.setItem('pp_use_legacy_pages', 'true');
    banner.remove();
  });

  document.getElementById('dismissBanner').addEventListener('click', () => {
    banner.remove();
  });

  // Adjust body padding to account for banner
  document.body.style.paddingTop = '4rem';
}

// Auto-show banner on page load (can be disabled by setting data-no-redirect on <html>)
if (document.documentElement.dataset.noRedirect !== 'true') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showRedirectBanner);
  } else {
    showRedirectBanner();
  }
}
