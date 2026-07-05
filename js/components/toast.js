// Petites notifications visuelles (succes / erreur / info)

let container;

function getContainer() {
  if (!container) {
    container = document.getElementById("toast-container");
  }
  return container;
}

export function showToast(message, type = "info") {
  const root = getContainer();
  if (!root) return;
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  root.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("toast-visible"));
  setTimeout(() => {
    toast.classList.remove("toast-visible");
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}
