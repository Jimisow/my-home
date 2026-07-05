// Petit routeur : chaque page s'enregistre elle-meme, pas de dependance circulaire
import { setState, clearSubscriptions } from "./state.js";

const mounts = {};
let viewRoot = null;

export function registerPage(name, mountFn) {
  mounts[name] = mountFn;
}

export function initRouter(viewRootEl) {
  viewRoot = viewRootEl;
}

export function navigate(pageName, params) {
  clearSubscriptions();
  setState({ page: pageName });
  if (!viewRoot) return;
  viewRoot.innerHTML = "";
  const mountFn = mounts[pageName];
  if (mountFn) {
    mountFn(viewRoot, params);
  } else {
    viewRoot.innerHTML = `<p class="empty-state">Page introuvable : ${pageName}</p>`;
  }
  document.dispatchEvent(new CustomEvent("page-changed", { detail: { page: pageName } }));
}
