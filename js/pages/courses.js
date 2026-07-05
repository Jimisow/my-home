// Page Courses : gestion du stock de la maison
import { registerPage } from "../router.js";
import { state, trackSubscription } from "../state.js";
import {
  watchProducts,
  addProduct,
  updateProduct,
  adjustQuantity,
  setManualStatus,
  restockProduct,
  deleteProduct
} from "../services/productService.js";
import { escapeHtml, formatDateTime } from "../utils.js";
import { showToast } from "../components/toast.js";

const STATUS_LABEL = { full: "🟢 Plein", almost: "🟠 Presque fini", empty: "🔴 Vide" };

function mount(root) {
  root.innerHTML = `
    <div class="page courses-page">
      <h1 class="page-title">🛒 Courses</h1>
      <div class="toolbar">
        <input type="search" id="search-input" placeholder="Rechercher un produit..." class="search-input" />
        <button id="add-product-btn" class="btn btn-primary">➕ Ajouter</button>
      </div>
      <div class="filter-bar">
        <button data-filter="all" class="filter-btn active">Tous</button>
        <button data-filter="full" class="filter-btn">🟢 Pleins</button>
        <button data-filter="almost" class="filter-btn">🟠 Presque</button>
        <button data-filter="empty" class="filter-btn">🔴 Vides</button>
      </div>
      <div id="products-list" class="products-grid">
        <p class="empty-state">Chargement...</p>
      </div>
      <button id="shopping-fab" class="fab" title="Liste de courses">
        🛒<span id="shopping-badge" class="fab-badge hidden">0</span>
      </button>
    </div>

    <div id="product-modal" class="modal hidden">
      <div class="modal-content">
        <h2 id="product-modal-title">Ajouter un produit</h2>
        <form id="product-form" class="auth-form">
          <input type="hidden" id="product-id" />
          <label>Nom
            <input type="text" id="product-name" required placeholder="Lait" />
          </label>
          <label class="checkbox-label">
            <input type="checkbox" id="product-has-quantity" checked /> Produit quantifiable
          </label>
          <div id="quantity-fields">
            <label>Quantite
              <input type="number" id="product-quantity" min="0" value="1" />
            </label>
            <label>Seuil d'alerte
              <input type="number" id="product-threshold" min="0" value="1" />
            </label>
            <label>Unite
              <input type="text" id="product-unit" placeholder="bouteilles" />
            </label>
          </div>
          <div id="manual-status-fields" class="hidden">
            <label>Etat
              <select id="product-manual-status">
                <option value="full">🟢 Plein</option>
                <option value="almost">🟠 Presque fini</option>
                <option value="empty">🔴 Vide</option>
              </select>
            </label>
          </div>
          <div class="form-actions">
            <button type="button" id="cancel-product-btn" class="btn btn-ghost">Annuler</button>
            <button type="submit" class="btn btn-primary">Enregistrer</button>
          </div>
        </form>
      </div>
    </div>

    <div id="shopping-modal" class="modal hidden">
      <div class="modal-content">
        <h2>🛒 Liste de courses</h2>
        <div id="shopping-list" class="shopping-list"></div>
        <div class="form-actions">
          <button type="button" id="close-shopping-btn" class="btn btn-ghost">Fermer</button>
          <button type="button" id="validate-shopping-btn" class="btn btn-primary">Valider les achats</button>
        </div>
      </div>
    </div>
  `;

  let products = [];
  let currentFilter = "all";
  let searchTerm = "";

  const listEl = root.querySelector("#products-list");
  const productModal = root.querySelector("#product-modal");
  const shoppingModal = root.querySelector("#shopping-modal");
  const productForm = root.querySelector("#product-form");
  const hasQuantityCheckbox = root.querySelector("#product-has-quantity");
  const quantityFields = root.querySelector("#quantity-fields");
  const manualStatusFields = root.querySelector("#manual-status-fields");

  hasQuantityCheckbox.addEventListener("change", () => {
    quantityFields.classList.toggle("hidden", !hasQuantityCheckbox.checked);
    manualStatusFields.classList.toggle("hidden", hasQuantityCheckbox.checked);
  });

  root.querySelector("#search-input").addEventListener("input", (e) => {
    searchTerm = e.target.value.trim().toLowerCase();
    renderList();
  });

  root.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentFilter = btn.dataset.filter;
      root.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderList();
    });
  });

  function openProductModal(product = null) {
    productForm.reset();
    root.querySelector("#product-modal-title").textContent = product ? "Modifier le produit" : "Ajouter un produit";
    root.querySelector("#product-id").value = product?.id || "";
    root.querySelector("#product-name").value = product?.name || "";
    const hasQuantity = product ? !!product.hasQuantity : true;
    hasQuantityCheckbox.checked = hasQuantity;
    quantityFields.classList.toggle("hidden", !hasQuantity);
    manualStatusFields.classList.toggle("hidden", hasQuantity);
    root.querySelector("#product-quantity").value = product?.quantity ?? 1;
    root.querySelector("#product-threshold").value = product?.threshold ?? 1;
    root.querySelector("#product-unit").value = product?.unit || "";
    root.querySelector("#product-manual-status").value = product?.manualStatus || "full";
    productModal.classList.remove("hidden");
  }

  function closeProductModal() {
    productModal.classList.add("hidden");
  }

  root.querySelector("#add-product-btn").addEventListener("click", () => openProductModal());
  root.querySelector("#cancel-product-btn").addEventListener("click", closeProductModal);
  productModal.addEventListener("click", (e) => { if (e.target === productModal) closeProductModal(); });

  productForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = root.querySelector("#product-id").value;
    const data = {
      name: root.querySelector("#product-name").value,
      hasQuantity: hasQuantityCheckbox.checked,
      quantity: root.querySelector("#product-quantity").value,
      threshold: root.querySelector("#product-threshold").value,
      unit: root.querySelector("#product-unit").value,
      manualStatus: root.querySelector("#product-manual-status").value
    };
    try {
      if (id) {
        await updateProduct(state.householdId, state.profile, id, data);
        showToast("Produit modifie", "success");
      } else {
        await addProduct(state.householdId, state.profile, data);
        showToast("Produit ajoute", "success");
      }
      closeProductModal();
    } catch (err) {
      console.error(err);
      showToast("Erreur lors de l'enregistrement.", "error");
    }
  });

  function matchesFilter(product) {
    if (currentFilter !== "all" && product.status !== currentFilter) return false;
    if (searchTerm && !product.name.toLowerCase().includes(searchTerm)) return false;
    return true;
  }

  function renderList() {
    const filtered = products.filter(matchesFilter);
    if (filtered.length === 0) {
      listEl.innerHTML = `<p class="empty-state">Aucun produit ne correspond.</p>`;
    } else {
      listEl.innerHTML = "";
      filtered.forEach((product) => listEl.appendChild(renderProductCard(product)));
    }

    const toBuy = products.filter((p) => p.status === "almost" || p.status === "empty");
    const badge = root.querySelector("#shopping-badge");
    badge.textContent = toBuy.length;
    badge.classList.toggle("hidden", toBuy.length === 0);
  }

  function renderProductCard(product) {
    const card = document.createElement("div");
    card.className = `product-card status-${product.status}`;
    const quantityInfo = product.hasQuantity
      ? `<div class="product-quantity">
           <button class="qty-btn" data-action="dec" data-id="${product.id}">➖</button>
           <span>${product.quantity ?? 0} ${escapeHtml(product.unit || "")}</span>
           <button class="qty-btn" data-action="inc" data-id="${product.id}">➕</button>
         </div>`
      : `<div class="manual-status-buttons">
           <button data-action="status-full" data-id="${product.id}" class="${product.status === "full" ? "active" : ""}">🟢</button>
           <button data-action="status-almost" data-id="${product.id}" class="${product.status === "almost" ? "active" : ""}">🟠</button>
           <button data-action="status-empty" data-id="${product.id}" class="${product.status === "empty" ? "active" : ""}">🔴</button>
         </div>`;

    card.innerHTML = `
      <div class="product-card-header">
        <span class="status-dot"></span>
        <strong>${escapeHtml(product.name)}</strong>
      </div>
      ${quantityInfo}
      <div class="product-meta">Modifie par ${escapeHtml(product.updatedBy || "")} · ${formatDateTime(product.updatedAt)}</div>
      <div class="card-actions">
        <button data-action="edit" data-id="${product.id}" title="Modifier">✏️</button>
        <button data-action="delete" data-id="${product.id}" title="Supprimer">🗑️</button>
      </div>
    `;

    card.querySelectorAll("button[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => handleCardAction(btn.dataset.action, product));
    });
    return card;
  }

  async function handleCardAction(action, product) {
    try {
      if (action === "inc") await adjustQuantity(state.householdId, state.profile, product, 1);
      else if (action === "dec") await adjustQuantity(state.householdId, state.profile, product, -1);
      else if (action === "status-full") await setManualStatus(state.householdId, state.profile, product, "full");
      else if (action === "status-almost") await setManualStatus(state.householdId, state.profile, product, "almost");
      else if (action === "status-empty") await setManualStatus(state.householdId, state.profile, product, "empty");
      else if (action === "edit") openProductModal(product);
      else if (action === "delete") {
        if (confirm(`Supprimer ${product.name} ?`)) await deleteProduct(state.householdId, state.profile, product);
      }
    } catch (err) {
      console.error(err);
      showToast("Une erreur est survenue.", "error");
    }
  }

  const fab = root.querySelector("#shopping-fab");
  const shoppingListEl = root.querySelector("#shopping-list");
  const checkedIds = new Set();

  fab.addEventListener("click", () => {
    checkedIds.clear();
    renderShoppingList();
    shoppingModal.classList.remove("hidden");
  });
  root.querySelector("#close-shopping-btn").addEventListener("click", () => shoppingModal.classList.add("hidden"));
  shoppingModal.addEventListener("click", (e) => { if (e.target === shoppingModal) shoppingModal.classList.add("hidden"); });

  function renderShoppingList() {
    const toBuy = products.filter((p) => p.status === "almost" || p.status === "empty");
    if (toBuy.length === 0) {
      shoppingListEl.innerHTML = `<p class="empty-state">Rien a racheter pour le moment !</p>`;
      return;
    }
    shoppingListEl.innerHTML = "";
    toBuy.forEach((product) => {
      const row = document.createElement("label");
      row.className = "shopping-item";
      row.innerHTML = `
        <input type="checkbox" data-id="${product.id}" ${checkedIds.has(product.id) ? "checked" : ""} />
        <span>${STATUS_LABEL[product.status]} ${escapeHtml(product.name)}</span>
      `;
      row.querySelector("input").addEventListener("change", (e) => {
        if (e.target.checked) checkedIds.add(product.id);
        else checkedIds.delete(product.id);
      });
      shoppingListEl.appendChild(row);
    });
  }

  root.querySelector("#validate-shopping-btn").addEventListener("click", async () => {
    const toRestock = products.filter((p) => checkedIds.has(p.id));
    if (toRestock.length === 0) {
      shoppingModal.classList.add("hidden");
      return;
    }
    try {
      await Promise.all(toRestock.map((p) => restockProduct(state.householdId, state.profile, p)));
      showToast("Achats valides !", "success");
      shoppingModal.classList.add("hidden");
    } catch (err) {
      console.error(err);
      showToast("Erreur lors de la validation.", "error");
    }
  });

  trackSubscription(watchProducts(state.householdId, (data) => {
    products = data;
    renderList();
  }));
}

registerPage("courses", mount);
