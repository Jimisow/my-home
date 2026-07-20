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
const CATEGORIES = ["Fruits & Legumes", "Viande & Poisson", "Cremerie", "Sec", "Surgeles", "Boissons", "Hygiene", "Entretien", "Enfant", "Animaux", "Autre"];
const CATEGORY_ICON = {
  "Fruits & Legumes": "🥦",
  "Viande & Poisson": "🥩",
  "Cremerie": "🧀",
  "Sec": "🥫",
  "Surgeles": "🧊",
  "Boissons": "🥤",
  "Hygiene": "🧴",
  "Entretien": "🧽",
  "Enfant": "🍼",
  "Animaux": "🐾",
  "Autre": "📦"
};

function mount(root) {
  root.innerHTML = `
    <div class="page courses-page">
      <h1 class="page-title">🛒 Courses</h1>
      <div class="toolbar">
        <input type="search" id="search-input" placeholder="Rechercher un produit..." class="search-input" />
        <button id="add-product-btn" class="btn btn-primary">➕ Ajouter</button>
      </div>
      <div class="filter-bar">
        <button type="button" data-filter-mode="all" class="filter-btn active">Tous</button>
        <div class="filter-dropdown">
          <button type="button" id="category-filter-btn" class="filter-btn">Categorie</button>
          <div id="category-menu" class="filter-menu hidden">
            <button type="button" class="filter-menu-item active" data-value="all">Toutes les categories</button>
            ${CATEGORIES.map((c) => `<button type="button" class="filter-menu-item" data-value="${c}">${CATEGORY_ICON[c]} ${c}</button>`).join("")}
          </div>
        </div>
        <div class="filter-dropdown">
          <button type="button" id="status-filter-btn" class="filter-btn">Statut</button>
          <div id="status-menu" class="filter-menu hidden">
            <button type="button" class="filter-menu-item active" data-value="all">Tous les statuts</button>
            <button type="button" class="filter-menu-item" data-value="full">🟢 Plein</button>
            <button type="button" class="filter-menu-item" data-value="almost">🟠 Presque fini</button>
            <button type="button" class="filter-menu-item" data-value="empty">🔴 Vide</button>
          </div>
        </div>
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
          <label>Categorie
            <select id="product-category">
              ${CATEGORIES.map((c) => `<option value="${c}">${CATEGORY_ICON[c]} ${c}</option>`).join("")}
            </select>
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
  let categoryFilterValue = "all";
  let statusFilterValue = "all";
  let searchTerm = "";

  const listEl = root.querySelector("#products-list");
  const productModal = root.querySelector("#product-modal");
  const shoppingModal = root.querySelector("#shopping-modal");
  const productForm = root.querySelector("#product-form");
  const hasQuantityCheckbox = root.querySelector("#product-has-quantity");
  const quantityFields = root.querySelector("#quantity-fields");
  const manualStatusFields = root.querySelector("#manual-status-fields");
  const allFilterBtn = root.querySelector('.filter-btn[data-filter-mode="all"]');
  const categoryFilterBtn = root.querySelector("#category-filter-btn");
  const statusFilterBtn = root.querySelector("#status-filter-btn");
  const categoryMenu = root.querySelector("#category-menu");
  const statusMenu = root.querySelector("#status-menu");

  hasQuantityCheckbox.addEventListener("change", () => {
    quantityFields.classList.toggle("hidden", !hasQuantityCheckbox.checked);
    manualStatusFields.classList.toggle("hidden", hasQuantityCheckbox.checked);
  });

  root.querySelector("#search-input").addEventListener("input", (e) => {
    searchTerm = e.target.value.trim().toLowerCase();
    renderList();
  });

  // Les filtres categorie et statut se combinent (ET logique) : "Tous" les
  // reinitialise tous les deux, les deux autres restent actifs independamment.
  function updateFilterButtonsUI() {
    allFilterBtn.classList.toggle("active", categoryFilterValue === "all" && statusFilterValue === "all");
    categoryFilterBtn.classList.toggle("active", categoryFilterValue !== "all");
    statusFilterBtn.classList.toggle("active", statusFilterValue !== "all");
  }

  allFilterBtn.addEventListener("click", () => {
    categoryFilterValue = "all";
    statusFilterValue = "all";
    categoryFilterBtn.textContent = "Categorie";
    statusFilterBtn.textContent = "Statut";
    categoryMenu.querySelectorAll(".filter-menu-item").forEach((item) => item.classList.toggle("active", item.dataset.value === "all"));
    statusMenu.querySelectorAll(".filter-menu-item").forEach((item) => item.classList.toggle("active", item.dataset.value === "all"));
    categoryMenu.classList.add("hidden");
    statusMenu.classList.add("hidden");
    updateFilterButtonsUI();
    renderList();
  });

  categoryFilterBtn.addEventListener("click", () => {
    statusMenu.classList.add("hidden");
    categoryMenu.classList.toggle("hidden");
  });

  statusFilterBtn.addEventListener("click", () => {
    categoryMenu.classList.add("hidden");
    statusMenu.classList.toggle("hidden");
  });

  categoryMenu.querySelectorAll(".filter-menu-item").forEach((item) => {
    item.addEventListener("click", () => {
      categoryFilterValue = item.dataset.value;
      categoryFilterBtn.textContent = categoryFilterValue === "all" ? "Categorie" : item.textContent.trim();
      categoryMenu.querySelectorAll(".filter-menu-item").forEach((i) => i.classList.toggle("active", i === item));
      categoryMenu.classList.add("hidden");
      updateFilterButtonsUI();
      renderList();
    });
  });

  statusMenu.querySelectorAll(".filter-menu-item").forEach((item) => {
    item.addEventListener("click", () => {
      statusFilterValue = item.dataset.value;
      statusFilterBtn.textContent = statusFilterValue === "all" ? "Statut" : item.textContent.trim();
      statusMenu.querySelectorAll(".filter-menu-item").forEach((i) => i.classList.toggle("active", i === item));
      statusMenu.classList.add("hidden");
      updateFilterButtonsUI();
      renderList();
    });
  });

  function closeFilterMenusOnOutsideClick(e) {
    if (!e.target.closest(".filter-dropdown")) {
      categoryMenu.classList.add("hidden");
      statusMenu.classList.add("hidden");
    }
  }
  document.addEventListener("click", closeFilterMenusOnOutsideClick);
  document.addEventListener("page-changed", () => document.removeEventListener("click", closeFilterMenusOnOutsideClick), { once: true });

  function openProductModal(product = null) {
    productForm.reset();
    root.querySelector("#product-modal-title").textContent = product ? "Modifier le produit" : "Ajouter un produit";
    root.querySelector("#product-id").value = product?.id || "";
    root.querySelector("#product-name").value = product?.name || "";
    root.querySelector("#product-category").value = product?.category || "Autre";
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
      category: root.querySelector("#product-category").value,
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
    if (categoryFilterValue !== "all" && (product.category || "Autre") !== categoryFilterValue) return false;
    if (statusFilterValue !== "all" && product.status !== statusFilterValue) return false;
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

    const category = product.category || "Autre";
    card.innerHTML = `
      <div class="product-card-header">
        <span class="status-dot"></span>
        <strong>${escapeHtml(product.name)}</strong>
        <span class="product-category-tag">${CATEGORY_ICON[category] || "📦"} ${escapeHtml(category)}</span>
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
    const groups = new Map();
    toBuy.forEach((product) => {
      const category = product.category || "Autre";
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category).push(product);
    });
    CATEGORIES.filter((c) => groups.has(c)).forEach((category) => {
      const section = document.createElement("div");
      section.className = "shopping-group";
      section.innerHTML = `<h3 class="shopping-group-title">${CATEGORY_ICON[category]} ${escapeHtml(category)}</h3>`;
      groups.get(category).forEach((product) => {
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
        section.appendChild(row);
      });
      shoppingListEl.appendChild(section);
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
