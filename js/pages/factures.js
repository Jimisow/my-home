// Page Factures : gestion des depenses et validation a plusieurs
import { registerPage } from "../router.js";
import { state, trackSubscription } from "../state.js";
import {
  watchBills,
  addBill,
  updateBill,
  togglePaidBy,
  deleteBill,
  getDisplayStatus
} from "../services/billService.js";
import { watchProfiles } from "../services/profileService.js";
import { escapeHtml, formatAmount, formatDate } from "../utils.js";
import { showToast } from "../components/toast.js";

const STATUS_LABEL = { pending: "A payer", paid: "Payee", overdue: "En retard" };
const CATEGORIES = ["Electricite", "Eau", "Internet", "Loyer", "Assurance", "Telephone", "Autre"];

function mount(root) {
  root.innerHTML = `
    <div class="page factures-page">
      <h1 class="page-title">💳 Factures</h1>

      <div class="summary-row">
        <div class="summary-card"><span id="sum-pending">-</span><label>A payer</label></div>
        <div class="summary-card"><span id="sum-paid">-</span><label>Payees</label></div>
        <div class="summary-card"><span id="sum-total">-</span><label>Total du mois</label></div>
      </div>

      <div class="toolbar">
        <button id="add-bill-btn" class="btn btn-primary">➕ Ajouter une facture</button>
      </div>
      <div class="filter-bar">
        <button data-filter="all" class="filter-btn active">Toutes</button>
        <button data-filter="pending" class="filter-btn">A payer</button>
        <button data-filter="paid" class="filter-btn">Payees</button>
        <button data-filter="overdue" class="filter-btn">En retard</button>
      </div>

      <div id="bills-list" class="bills-list">
        <p class="empty-state">Chargement...</p>
      </div>
    </div>

    <div id="bill-modal" class="modal hidden">
      <div class="modal-content">
        <h2 id="bill-modal-title">Ajouter une facture</h2>
        <form id="bill-form" class="auth-form">
          <input type="hidden" id="bill-id" />
          <label>Titre
            <input type="text" id="bill-title" required placeholder="EDF Janvier 2026" />
          </label>
          <label>Montant (€)
            <input type="number" id="bill-amount" min="0" step="0.01" required />
          </label>
          <label>Date d'echeance
            <input type="date" id="bill-due-date" required />
          </label>
          <label>Categorie
            <select id="bill-category">
              ${CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join("")}
            </select>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" id="bill-recurring" /> Facture mensuelle (se renouvelle chaque mois)
          </label>
          <div class="form-actions">
            <button type="button" id="cancel-bill-btn" class="btn btn-ghost">Annuler</button>
            <button type="submit" class="btn btn-primary">Enregistrer</button>
          </div>
        </form>
      </div>
    </div>
  `;

  let bills = [];
  let profiles = [];
  let currentFilter = "all";

  const listEl = root.querySelector("#bills-list");
  const modal = root.querySelector("#bill-modal");
  const form = root.querySelector("#bill-form");

  root.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentFilter = btn.dataset.filter;
      root.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderList();
    });
  });

  function openModal(bill = null) {
    form.reset();
    root.querySelector("#bill-modal-title").textContent = bill ? "Modifier la facture" : "Ajouter une facture";
    root.querySelector("#bill-id").value = bill?.id || "";
    root.querySelector("#bill-title").value = bill?.title || "";
    root.querySelector("#bill-amount").value = bill?.amount ?? "";
    root.querySelector("#bill-due-date").value = bill?.dueDate || "";
    root.querySelector("#bill-category").value = bill?.category || "Autre";
    root.querySelector("#bill-recurring").checked = !!bill?.recurring;
    modal.classList.remove("hidden");
  }
  function closeModal() { modal.classList.add("hidden"); }

  root.querySelector("#add-bill-btn").addEventListener("click", () => openModal());
  root.querySelector("#cancel-bill-btn").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = root.querySelector("#bill-id").value;
    const data = {
      title: root.querySelector("#bill-title").value,
      amount: root.querySelector("#bill-amount").value,
      dueDate: root.querySelector("#bill-due-date").value,
      category: root.querySelector("#bill-category").value,
      recurring: root.querySelector("#bill-recurring").checked
    };
    try {
      if (id) {
        await updateBill(state.householdId, state.profile, id, data);
        showToast("Facture modifiee", "success");
      } else {
        await addBill(state.householdId, state.profile, data);
        showToast("Facture ajoutee", "success");
      }
      closeModal();
    } catch (err) {
      console.error(err);
      showToast("Erreur lors de l'enregistrement.", "error");
    }
  });

  function renderSummary() {
    const now = new Date();
    const monthBills = bills.filter((b) => {
      if (!b.dueDate) return false;
      const d = new Date(b.dueDate);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const pendingTotal = monthBills.filter((b) => getDisplayStatus(b) !== "paid").reduce((s, b) => s + (Number(b.amount) || 0), 0);
    const paidTotal = monthBills.filter((b) => getDisplayStatus(b) === "paid").reduce((s, b) => s + (Number(b.amount) || 0), 0);
    const total = monthBills.reduce((s, b) => s + (Number(b.amount) || 0), 0);
    root.querySelector("#sum-pending").textContent = formatAmount(pendingTotal);
    root.querySelector("#sum-paid").textContent = formatAmount(paidTotal);
    root.querySelector("#sum-total").textContent = formatAmount(total);
  }

  function renderList() {
    const filtered = currentFilter === "all" ? bills : bills.filter((b) => getDisplayStatus(b) === currentFilter);
    if (filtered.length === 0) {
      listEl.innerHTML = `<p class="empty-state">Aucune facture ne correspond.</p>`;
      return;
    }
    listEl.innerHTML = "";
    filtered.forEach((bill) => listEl.appendChild(renderBillCard(bill)));
  }

  function renderBillCard(bill) {
    const displayStatus = getDisplayStatus(bill);
    const card = document.createElement("div");
    card.className = `bill-card status-${displayStatus}`;
    const circles = profiles.map((p) => {
      const validated = (bill.paidBy || []).includes(p.name);
      return `<button class="validate-circle ${validated ? "validated" : ""}" data-profile="${escapeHtml(p.name)}">
        ${escapeHtml(p.name)} ${validated ? "✅" : "⭕"}
      </button>`;
    }).join("");

    card.innerHTML = `
      <div class="bill-card-header">
        <strong>${bill.recurring ? "🔁 " : ""}${escapeHtml(bill.title)}</strong>
        <span class="bill-status-badge">${STATUS_LABEL[displayStatus]}</span>
      </div>
      <div class="bill-meta">${escapeHtml(bill.category)} · Echeance : ${formatDate(bill.dueDate)}</div>
      <div class="bill-amount">${formatAmount(bill.amount)}</div>
      <div class="validate-row">${circles}</div>
      <div class="card-actions">
        <button data-action="edit" title="Modifier">✏️</button>
        <button data-action="delete" title="Supprimer">🗑️</button>
      </div>
    `;

    card.querySelectorAll(".validate-circle").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await togglePaidBy(state.householdId, state.profile, bill, profiles.map((p) => p.name));
        } catch (err) {
          console.error(err);
          showToast("Erreur lors de la validation.", "error");
        }
      });
    });
    card.querySelector("[data-action='edit']").addEventListener("click", () => openModal(bill));
    card.querySelector("[data-action='delete']").addEventListener("click", async () => {
      if (confirm(`Supprimer la facture ${bill.title} ?`)) {
        try {
          await deleteBill(state.householdId, state.profile, bill);
        } catch (err) {
          console.error(err);
          showToast("Erreur lors de la suppression.", "error");
        }
      }
    });
    return card;
  }

  trackSubscription(watchBills(state.householdId, (data) => {
    bills = data;
    renderSummary();
    renderList();
  }));
  trackSubscription(watchProfiles(state.householdId, (data) => {
    profiles = data;
    renderList();
  }));
}

registerPage("factures", mount);
