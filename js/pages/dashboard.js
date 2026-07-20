// Page d'accueil : widgets, notes epinglees, activites recentes
import { registerPage, navigate } from "../router.js";
import { state, trackSubscription } from "../state.js";
import { watchProducts } from "../services/productService.js";
import { watchBills, getOwedShare } from "../services/billService.js";
import { watchMeetings, getDisplayStatus as getMeetingStatus } from "../services/meetingService.js";
import { watchProfiles } from "../services/profileService.js";
import { watchNotes } from "../services/noteService.js";
import { watchRecentActivities } from "../services/activityService.js";
import { escapeHtml, formatAmount, timeAgo } from "../utils.js";

function mount(root) {
  root.innerHTML = `
    <div class="page dashboard-page">
      <h1 class="page-title">Bonjour ${escapeHtml(state.profile?.name || "")} 👋</h1>
      <div class="widgets-grid">
        <button class="widget-card" data-page="courses">
          <span class="widget-icon">🛒</span>
          <span class="widget-value" id="widget-courses">-</span>
          <span class="widget-label">A racheter</span>
        </button>
        <button class="widget-card" data-page="factures">
          <span class="widget-icon">💳</span>
          <span class="widget-value" id="widget-factures">-</span>
          <span class="widget-label">Mon reste a payer</span>
        </button>
        <button class="widget-card" data-page="rendezvous">
          <span class="widget-icon">📅</span>
          <span class="widget-value" id="widget-rdv">-</span>
          <span class="widget-label">A venir</span>
        </button>
        <button class="widget-card" data-page="notes">
          <span class="widget-icon">📝</span>
          <span class="widget-value" id="widget-notes">-</span>
          <span class="widget-label">Notes epinglees</span>
        </button>
      </div>

      <section class="dashboard-section">
        <h2>📌 Notes epinglees</h2>
        <div id="pinned-notes-list" class="notes-preview-list">
          <p class="empty-state">Aucune note epinglee</p>
        </div>
      </section>

      <section class="dashboard-section">
        <h2>🕒 Activites recentes</h2>
        <ul id="activities-list" class="activities-list">
          <li class="empty-state">Aucune activite</li>
        </ul>
      </section>
    </div>
  `;

  root.querySelectorAll("[data-page]").forEach((btn) => {
    btn.addEventListener("click", () => navigate(btn.dataset.page));
  });

  trackSubscription(watchProducts(state.householdId, (products) => {
    const count = products.filter((p) => p.status === "almost" || p.status === "empty").length;
    root.querySelector("#widget-courses").textContent = count;
  }));

  let bills = [];
  let profileCount = 0;

  function renderMyDue() {
    if (!state.profile) return;
    const owed = bills.reduce((sum, b) => sum + getOwedShare(b, state.profile.name, profileCount), 0);
    root.querySelector("#widget-factures").textContent = formatAmount(owed);
  }

  trackSubscription(watchBills(state.householdId, (data) => {
    bills = data;
    renderMyDue();
  }));

  trackSubscription(watchProfiles(state.householdId, (profiles) => {
    profileCount = profiles.length;
    renderMyDue();
  }));

  trackSubscription(watchMeetings(state.householdId, (meetings) => {
    const count = meetings.filter((m) => getMeetingStatus(m) === "upcoming").length;
    root.querySelector("#widget-rdv").textContent = count;
  }));

  trackSubscription(watchNotes(state.householdId, (notes) => {
    const pinned = notes.filter((n) => n.pinned);
    root.querySelector("#widget-notes").textContent = pinned.length;

    const listEl = root.querySelector("#pinned-notes-list");
    if (pinned.length === 0) {
      listEl.innerHTML = `<p class="empty-state">Aucune note epinglee</p>`;
      return;
    }
    listEl.innerHTML = "";
    pinned.slice(0, 3).forEach((note) => {
      const card = document.createElement("div");
      card.className = "note-preview-card";
      card.innerHTML = `<strong>${escapeHtml(note.title)}</strong><p>${escapeHtml(note.content || "")}</p>`;
      listEl.appendChild(card);
    });
  }));

  trackSubscription(watchRecentActivities(state.householdId, 5, (activities) => {
    const listEl = root.querySelector("#activities-list");
    if (activities.length === 0) {
      listEl.innerHTML = `<li class="empty-state">Aucune activite</li>`;
      return;
    }
    listEl.innerHTML = "";
    activities.forEach((activity) => {
      const li = document.createElement("li");
      li.className = `activity-item ${activity.importance === "important" ? "activity-important" : ""}`;
      li.innerHTML = `<span>${escapeHtml(activity.message)}</span><time>${timeAgo(activity.timestamp)}</time>`;
      listEl.appendChild(li);
    });
  }));
}

registerPage("dashboard", mount);
