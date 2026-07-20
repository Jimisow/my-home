// Page Factures : gestion des depenses et validation a plusieurs
import { registerPage } from "../router.js";
import { state, trackSubscription } from "../state.js";
import {
  watchBills,
  addBill,
  updateBill,
  togglePaidBy,
  deleteBill,
  getDisplayStatus,
  getOwedShare,
  getProfileAmount,
  getInstallmentProgress
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
        <button type="button" id="bill-filter-all-btn" class="filter-btn active">Toutes</button>
        <button type="button" id="bill-filter-personal-btn" class="filter-btn">Personnel</button>
        <div class="filter-dropdown">
          <button type="button" id="bill-status-filter-btn" class="filter-btn">Statut</button>
          <div id="bill-status-menu" class="filter-menu hidden">
            <button type="button" class="filter-menu-item active" data-value="all">Tous les statuts</button>
            <button type="button" class="filter-menu-item" data-value="pending">A payer</button>
            <button type="button" class="filter-menu-item" data-value="paid">Payees</button>
            <button type="button" class="filter-menu-item" data-value="overdue">En retard</button>
          </div>
        </div>
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
          <label id="bill-amount-label">Montant (€)
            <input type="number" id="bill-amount" min="0" step="0.01" required />
          </label>
          <label class="checkbox-label">
            <input type="checkbox" id="bill-installment" /> Paiement echelonne (echeancier)
          </label>
          <div id="bill-installment-fields" class="hidden">
            <label>Montant total (€)
              <input type="number" id="bill-installment-total" min="0" step="0.01" placeholder="2500" />
            </label>
            <div class="bill-options-row">
              <label>Date de debut
                <input type="date" id="bill-installment-start" />
              </label>
              <label>Date de fin (optionnel)
                <input type="date" id="bill-installment-end" />
              </label>
            </div>
          </div>
          <label>Date d'echeance
            <input type="date" id="bill-due-date" required />
          </label>
          <label>Categorie
            <select id="bill-category">
              ${CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join("")}
            </select>
          </label>
          <div id="bill-category-other-wrap" class="hidden">
            <label>Nom de la depense
              <input type="text" id="bill-category-other" placeholder="Ex. Cadeau, Reparation..." />
            </label>
          </div>
          <div class="bill-options-row">
            <label class="checkbox-label">
              <input type="checkbox" id="bill-recurring" /> Facture mensuelle
            </label>
            <select id="bill-mode">
              <option value="shared">Facture commune</option>
              <option value="split">Partager a parts egales</option>
              <option value="personal">Facture personnelle</option>
            </select>
          </div>
          <div id="bill-personal-wrap" class="hidden">
            <label>Concerne
              <select id="bill-personal-profile"></select>
            </label>
          </div>
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
  let personalFilterActive = false;
  let statusFilterValue = "all";

  const listEl = root.querySelector("#bills-list");
  const modal = root.querySelector("#bill-modal");
  const form = root.querySelector("#bill-form");
  const categorySelect = root.querySelector("#bill-category");
  const categoryOtherWrap = root.querySelector("#bill-category-other-wrap");
  const categoryOtherInput = root.querySelector("#bill-category-other");
  const personalWrap = root.querySelector("#bill-personal-wrap");
  const personalProfileSelect = root.querySelector("#bill-personal-profile");
  const billModeSelect = root.querySelector("#bill-mode");
  const recurringCheckbox = root.querySelector("#bill-recurring");
  const installmentCheckbox = root.querySelector("#bill-installment");
  const installmentFields = root.querySelector("#bill-installment-fields");
  const amountLabel = root.querySelector("#bill-amount-label");

  const billFilterAllBtn = root.querySelector("#bill-filter-all-btn");
  const billFilterPersonalBtn = root.querySelector("#bill-filter-personal-btn");
  const billStatusFilterBtn = root.querySelector("#bill-status-filter-btn");
  const billStatusMenu = root.querySelector("#bill-status-menu");

  // "Personnel" et "Statut" se combinent (ET logique) : "Toutes" reinitialise
  // les deux, chacun des deux autres reste actif independamment de l'autre.
  function updateBillFilterButtonsUI() {
    billFilterAllBtn.classList.toggle("active", !personalFilterActive && statusFilterValue === "all");
    billFilterPersonalBtn.classList.toggle("active", personalFilterActive);
    billStatusFilterBtn.classList.toggle("active", statusFilterValue !== "all");
  }

  billFilterAllBtn.addEventListener("click", () => {
    personalFilterActive = false;
    statusFilterValue = "all";
    billStatusFilterBtn.textContent = "Statut";
    billStatusMenu.querySelectorAll(".filter-menu-item").forEach((item) => item.classList.toggle("active", item.dataset.value === "all"));
    billStatusMenu.classList.add("hidden");
    updateBillFilterButtonsUI();
    renderList();
  });

  billFilterPersonalBtn.addEventListener("click", () => {
    personalFilterActive = !personalFilterActive;
    billStatusMenu.classList.add("hidden");
    updateBillFilterButtonsUI();
    renderList();
  });

  billStatusFilterBtn.addEventListener("click", () => {
    billStatusMenu.classList.toggle("hidden");
  });

  billStatusMenu.querySelectorAll(".filter-menu-item").forEach((item) => {
    item.addEventListener("click", () => {
      statusFilterValue = item.dataset.value;
      billStatusFilterBtn.textContent = statusFilterValue === "all" ? "Statut" : item.textContent.trim();
      billStatusMenu.querySelectorAll(".filter-menu-item").forEach((i) => i.classList.toggle("active", i === item));
      billStatusMenu.classList.add("hidden");
      updateBillFilterButtonsUI();
      renderList();
    });
  });

  function closeBillFilterMenuOnOutsideClick(e) {
    if (!e.target.closest(".filter-dropdown")) billStatusMenu.classList.add("hidden");
  }
  document.addEventListener("click", closeBillFilterMenuOnOutsideClick);
  document.addEventListener("page-changed", () => document.removeEventListener("click", closeBillFilterMenuOnOutsideClick), { once: true });

  categorySelect.addEventListener("change", () => {
    categoryOtherWrap.classList.toggle("hidden", categorySelect.value !== "Autre");
  });

  billModeSelect.addEventListener("change", () => {
    personalWrap.classList.toggle("hidden", billModeSelect.value !== "personal");
  });

  installmentCheckbox.addEventListener("change", () => {
    const isInstallment = installmentCheckbox.checked;
    installmentFields.classList.toggle("hidden", !isInstallment);
    amountLabel.firstChild.textContent = isInstallment ? "Montant mensuel (€)" : "Montant (€)";
    recurringCheckbox.checked = isInstallment ? true : recurringCheckbox.checked;
    recurringCheckbox.disabled = isInstallment;
  });

  function fillPersonalProfileOptions(selected) {
    personalProfileSelect.innerHTML = profiles.map((p) => `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)}</option>`).join("");
    if (selected) personalProfileSelect.value = selected;
  }

  function openModal(bill = null) {
    form.reset();
    root.querySelector("#bill-modal-title").textContent = bill ? "Modifier la facture" : "Ajouter une facture";
    root.querySelector("#bill-id").value = bill?.id || "";
    root.querySelector("#bill-title").value = bill?.title || "";
    root.querySelector("#bill-amount").value = bill?.amount ?? "";
    root.querySelector("#bill-due-date").value = bill?.dueDate || "";
    const isKnownCategory = !bill?.category || CATEGORIES.includes(bill.category);
    categorySelect.value = isKnownCategory ? (bill?.category || "Autre") : "Autre";
    categoryOtherInput.value = isKnownCategory ? "" : bill.category;
    categoryOtherWrap.classList.toggle("hidden", categorySelect.value !== "Autre");
    recurringCheckbox.checked = !!bill?.recurring;
    const mode = bill?.personal ? "personal" : (bill?.split ? "split" : "shared");
    billModeSelect.value = mode;
    fillPersonalProfileOptions(bill?.assignedTo || state.profile?.name);
    personalWrap.classList.toggle("hidden", mode !== "personal");
    installmentCheckbox.checked = !!bill?.installment;
    installmentFields.classList.toggle("hidden", !bill?.installment);
    amountLabel.firstChild.textContent = bill?.installment ? "Montant mensuel (€)" : "Montant (€)";
    recurringCheckbox.disabled = !!bill?.installment;
    root.querySelector("#bill-installment-total").value = bill?.installmentTotal ?? "";
    root.querySelector("#bill-installment-start").value = bill?.installmentStartDate || "";
    root.querySelector("#bill-installment-end").value = bill?.installmentEndDate || "";
    modal.classList.remove("hidden");
  }
  function closeModal() { modal.classList.add("hidden"); }

  root.querySelector("#add-bill-btn").addEventListener("click", () => openModal());
  root.querySelector("#cancel-bill-btn").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = root.querySelector("#bill-id").value;
    const mode = billModeSelect.value;
    const customCategory = categoryOtherInput.value.trim();
    const category = categorySelect.value === "Autre" && customCategory ? customCategory : categorySelect.value;
    const data = {
      title: root.querySelector("#bill-title").value,
      amount: root.querySelector("#bill-amount").value,
      dueDate: root.querySelector("#bill-due-date").value,
      category,
      recurring: recurringCheckbox.checked,
      split: mode === "split",
      personal: mode === "personal",
      assignedTo: mode === "personal" ? personalProfileSelect.value : null,
      installment: installmentCheckbox.checked,
      installmentTotal: root.querySelector("#bill-installment-total").value,
      installmentStartDate: root.querySelector("#bill-installment-start").value,
      installmentEndDate: root.querySelector("#bill-installment-end").value
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

  // Les 3 cartes de resume sont personnelles au profil connecte : ce qu'il lui
  // reste a payer, ce qu'il a deja regle et son engagement total pour le mois.
  function renderSummary() {
    const now = new Date();
    const monthBills = bills.filter((b) => {
      if (!b.dueDate) return false;
      const d = new Date(b.dueDate);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const profileName = state.profile?.name;
    const profileCount = profiles.length;
    const pendingTotal = monthBills.reduce((s, b) => s + getOwedShare(b, profileName, profileCount), 0);
    const total = monthBills.reduce((s, b) => s + getProfileAmount(b, profileName, profileCount), 0);
    const paidTotal = total - pendingTotal;
    root.querySelector("#sum-pending").textContent = formatAmount(pendingTotal);
    root.querySelector("#sum-paid").textContent = formatAmount(paidTotal);
    root.querySelector("#sum-total").textContent = formatAmount(total);
  }

  function matchesFilter(bill) {
    if (personalFilterActive && !(bill.personal && bill.assignedTo === state.profile?.name)) return false;
    if (statusFilterValue !== "all" && getDisplayStatus(bill) !== statusFilterValue) return false;
    return true;
  }

  function renderList() {
    const filtered = bills.filter(matchesFilter);
    if (filtered.length === 0) {
      listEl.innerHTML = `<p class="empty-state">Aucune facture ne correspond.</p>`;
      return;
    }
    listEl.innerHTML = "";
    filtered.forEach((bill) => listEl.appendChild(renderBillCard(bill)));
  }

  function renderInstallmentBlock(bill) {
    const progress = getInstallmentProgress(bill);
    const countLabel = progress.totalCount
      ? `${progress.paidCount} / ${progress.totalCount} mensualites`
      : `${progress.paidCount} mensualite${progress.paidCount > 1 ? "s" : ""} versee${progress.paidCount > 1 ? "s" : ""}`;
    return `
      <div class="installment-progress">
        <div class="installment-progress-bar"><div class="installment-progress-fill" style="width:${progress.percent}%"></div></div>
        <div class="installment-progress-label">
          <span>${formatAmount(progress.paidAmount)} / ${formatAmount(bill.installmentTotal)} · ${countLabel}</span>
          ${bill.installmentCompleted ? `<span class="installment-finished">🏁 Rembourse</span>` : ""}
        </div>
      </div>
    `;
  }

  function renderBillCard(bill) {
    const displayStatus = getDisplayStatus(bill);
    const card = document.createElement("div");
    card.className = `bill-card status-${displayStatus}`;
    const share = bill.split && profiles.length > 0 ? bill.amount / profiles.length : null;
    const relevantProfiles = bill.personal ? profiles.filter((p) => p.name === bill.assignedTo) : profiles;
    const circles = relevantProfiles.map((p) => {
      const validated = (bill.paidBy || []).includes(p.name);
      const label = share !== null ? `${escapeHtml(p.name)} · ${formatAmount(share)}` : escapeHtml(p.name);
      return `<button class="validate-circle ${validated ? "validated" : ""}" data-profile="${escapeHtml(p.name)}">
        ${label} ${validated ? "✅" : "⭕"}
      </button>`;
    }).join("");

    card.innerHTML = `
      <div class="bill-card-header">
        <strong>${bill.personal ? "👤 " : ""}${escapeHtml(bill.title)}</strong>
        <div class="bill-badges">
          ${bill.installment ? `<span class="bill-recurring-badge" title="Paiement echelonne">📊</span>` : (bill.recurring ? `<span class="bill-recurring-badge" title="Facture mensuelle">🔁</span>` : "")}
          <span class="bill-status-badge">${STATUS_LABEL[displayStatus]}</span>
        </div>
      </div>
      <div class="bill-meta">${escapeHtml(bill.category)} · Echeance : ${formatDate(bill.dueDate)}${bill.personal ? ` · Personnelle (${escapeHtml(bill.assignedTo || "")})` : ""}</div>
      <div class="bill-amount">${formatAmount(bill.amount)}${share !== null ? `<span class="bill-amount-split"> · ${formatAmount(share)} / personne</span>` : ""}${bill.installment ? `<span class="bill-amount-split"> / mois</span>` : ""}</div>
      ${bill.installment ? renderInstallmentBlock(bill) : ""}
      <div class="validate-row">${circles}</div>
      <div class="card-actions">
        <button data-action="edit" title="Modifier">✏️</button>
        <button data-action="delete" title="Supprimer">🗑️</button>
      </div>
    `;

    card.querySelectorAll(".validate-circle").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await togglePaidBy(state.householdId, state.profile, bill, relevantProfiles.map((p) => p.name));
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
    renderSummary();
    renderList();
  }));
}

registerPage("factures", mount);
