// Page Rendez-vous : agenda partage du foyer
import { registerPage } from "../router.js";
import { state, trackSubscription } from "../state.js";
import {
  watchMeetings,
  addMeeting,
  updateMeeting,
  cancelMeeting,
  deleteMeeting,
  getDisplayStatus
} from "../services/meetingService.js";
import { watchProfiles } from "../services/profileService.js";
import { escapeHtml, formatDateTime } from "../utils.js";
import { showToast } from "../components/toast.js";

const TYPE_ICON = { sante: "🏥", travail: "💼", personnel: "👤", autre: "📌" };
const TYPE_LABEL = { sante: "Sante", travail: "Travail", personnel: "Personnel", autre: "Autre" };

function mount(root) {
  root.innerHTML = `
    <div class="page rdv-page">
      <h1 class="page-title">📅 Rendez-vous</h1>
      <div class="toolbar">
        <button id="add-meeting-btn" class="btn btn-primary">➕ Ajouter un rendez-vous</button>
      </div>
      <div class="filter-bar">
        <button data-filter="upcoming" class="filter-btn active">A venir</button>
        <button data-filter="passed" class="filter-btn">Passes</button>
      </div>
      <div id="meetings-list" class="meetings-list">
        <p class="empty-state">Chargement...</p>
      </div>
    </div>

    <div id="meeting-modal" class="modal hidden">
      <div class="modal-content">
        <h2 id="meeting-modal-title">Ajouter un rendez-vous</h2>
        <form id="meeting-form" class="auth-form">
          <input type="hidden" id="meeting-id" />
          <label>Titre
            <input type="text" id="meeting-title" required placeholder="Dentiste" />
          </label>
          <label>Date et heure
            <input type="datetime-local" id="meeting-date" required />
          </label>
          <label>Lieu
            <input type="text" id="meeting-location" placeholder="15 rue de Paris" />
          </label>
          <label>Type
            <select id="meeting-type">
              <option value="sante">🏥 Sante</option>
              <option value="travail">💼 Travail</option>
              <option value="personnel">👤 Personnel</option>
              <option value="autre">📌 Autre</option>
            </select>
          </label>
          <div id="participants-fields" class="checkbox-group"></div>
          <div class="form-actions">
            <button type="button" id="cancel-meeting-btn" class="btn btn-ghost">Annuler</button>
            <button type="submit" class="btn btn-primary">Enregistrer</button>
          </div>
        </form>
      </div>
    </div>
  `;

  let meetings = [];
  let profiles = [];
  let currentFilter = "upcoming";

  const listEl = root.querySelector("#meetings-list");
  const modal = root.querySelector("#meeting-modal");
  const form = root.querySelector("#meeting-form");
  const participantsFields = root.querySelector("#participants-fields");

  root.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentFilter = btn.dataset.filter;
      root.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderList();
    });
  });

  function renderParticipantCheckboxes(selected = []) {
    participantsFields.innerHTML = profiles.map((p) => `
      <label class="checkbox-label">
        <input type="checkbox" value="${escapeHtml(p.name)}" ${selected.includes(p.name) ? "checked" : ""} />
        ${escapeHtml(p.name)}
      </label>
    `).join("") || `<p class="empty-state">Aucun profil disponible</p>`;
  }

  function toLocalInputValue(date) {
    const d = date?.toDate ? date.toDate() : new Date(date);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function openModal(meeting = null) {
    form.reset();
    root.querySelector("#meeting-modal-title").textContent = meeting ? "Modifier le rendez-vous" : "Ajouter un rendez-vous";
    root.querySelector("#meeting-id").value = meeting?.id || "";
    root.querySelector("#meeting-title").value = meeting?.title || "";
    root.querySelector("#meeting-date").value = meeting ? toLocalInputValue(meeting.date) : "";
    root.querySelector("#meeting-location").value = meeting?.location || "";
    root.querySelector("#meeting-type").value = meeting?.type || "autre";
    renderParticipantCheckboxes(meeting?.participants || []);
    modal.classList.remove("hidden");
  }
  function closeModal() { modal.classList.add("hidden"); }

  root.querySelector("#add-meeting-btn").addEventListener("click", () => openModal());
  root.querySelector("#cancel-meeting-btn").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = root.querySelector("#meeting-id").value;
    const participants = Array.from(participantsFields.querySelectorAll("input:checked")).map((i) => i.value);
    const data = {
      title: root.querySelector("#meeting-title").value,
      date: root.querySelector("#meeting-date").value,
      location: root.querySelector("#meeting-location").value,
      type: root.querySelector("#meeting-type").value,
      participants
    };
    try {
      if (id) {
        await updateMeeting(state.householdId, state.profile, id, data);
        showToast("Rendez-vous modifie", "success");
      } else {
        await addMeeting(state.householdId, state.profile, data);
        showToast("Rendez-vous ajoute", "success");
      }
      closeModal();
    } catch (err) {
      console.error(err);
      showToast("Erreur lors de l'enregistrement.", "error");
    }
  });

  function renderList() {
    const filtered = meetings.filter((m) => {
      const displayStatus = getDisplayStatus(m);
      if (currentFilter === "upcoming") return displayStatus === "upcoming";
      return displayStatus === "passed" || displayStatus === "cancelled";
    });
    if (filtered.length === 0) {
      listEl.innerHTML = `<p class="empty-state">Aucun rendez-vous ici.</p>`;
      return;
    }
    listEl.innerHTML = "";
    filtered.forEach((meeting) => listEl.appendChild(renderMeetingCard(meeting)));
  }

  function renderMeetingCard(meeting) {
    const displayStatus = getDisplayStatus(meeting);
    const card = document.createElement("div");
    card.className = `meeting-card status-${displayStatus}`;
    const participantTags = (meeting.participants || []).map((name) => `<span class="tag">${escapeHtml(name)}</span>`).join("");
    card.innerHTML = `
      <div class="meeting-card-header">
        <span class="meeting-type-icon">${TYPE_ICON[meeting.type] || "📌"}</span>
        <strong>${escapeHtml(meeting.title)}</strong>
        ${displayStatus === "cancelled" ? '<span class="bill-status-badge">Annule</span>' : ""}
      </div>
      <div class="meeting-meta">${formatDateTime(meeting.date)}${meeting.location ? " · " + escapeHtml(meeting.location) : ""}</div>
      <div class="meeting-meta">${TYPE_LABEL[meeting.type] || "Autre"}</div>
      <div class="tag-row">${participantTags}</div>
      <div class="card-actions">
        ${displayStatus === "upcoming" ? `<button data-action="cancel" title="Annuler">🚫</button>` : ""}
        <button data-action="edit" title="Modifier">✏️</button>
        <button data-action="delete" title="Supprimer">🗑️</button>
      </div>
    `;

    const cancelBtn = card.querySelector("[data-action='cancel']");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", async () => {
        if (confirm(`Annuler le rendez-vous ${meeting.title} ?`)) {
          await cancelMeeting(state.householdId, state.profile, meeting);
        }
      });
    }
    card.querySelector("[data-action='edit']").addEventListener("click", () => openModal(meeting));
    card.querySelector("[data-action='delete']").addEventListener("click", async () => {
      if (confirm(`Supprimer le rendez-vous ${meeting.title} ?`)) {
        await deleteMeeting(state.householdId, state.profile, meeting);
      }
    });
    return card;
  }

  trackSubscription(watchMeetings(state.householdId, (data) => {
    meetings = data;
    renderList();
  }));
  trackSubscription(watchProfiles(state.householdId, (data) => {
    profiles = data;
  }));
}

registerPage("rendezvous", mount);
