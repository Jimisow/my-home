// Ecran de choix / creation de profil (membre du foyer)
import { registerPage, navigate } from "../router.js";
import { watchProfiles, createProfile } from "../services/profileService.js";
import { state, setState, trackSubscription, saveProfileToStorage } from "../state.js";
import { escapeHtml } from "../utils.js";
import { showToast } from "../components/toast.js";

const COLORS = ["#4CAF50", "#2196F3", "#FF9800", "#E91E63", "#9C27B0", "#00BCD4", "#795548", "#607D8B"];

function initials(name) {
  return (name || "?").trim().slice(0, 2).toUpperCase();
}

function mount(root) {
  root.innerHTML = `
    <div class="auth-screen">
      <div class="auth-card auth-card-wide">
        <div class="auth-logo">👋</div>
        <h1>${escapeHtml(state.householdName || "My Home")}</h1>
        <p class="auth-subtitle">Qui es-tu ?</p>
        <div id="profiles-list" class="profiles-grid">
          <p class="empty-state">Chargement...</p>
        </div>
        <button type="button" id="add-profile-btn" class="btn btn-secondary btn-block">➕ Ajouter un membre</button>
        <form id="add-profile-form" class="auth-form hidden">
          <label>Prenom
            <input type="text" id="new-profile-name" required placeholder="Sophie" maxlength="20" />
          </label>
          <div class="color-picker" id="color-picker"></div>
          <div class="form-actions">
            <button type="button" id="cancel-add-profile" class="btn btn-ghost">Annuler</button>
            <button type="submit" class="btn btn-primary">Creer le profil</button>
          </div>
        </form>
      </div>
    </div>
  `;

  let selectedColor = COLORS[0];
  const colorPicker = root.querySelector("#color-picker");
  COLORS.forEach((color) => {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "color-swatch";
    swatch.style.background = color;
    if (color === selectedColor) swatch.classList.add("selected");
    swatch.addEventListener("click", () => {
      selectedColor = color;
      colorPicker.querySelectorAll(".color-swatch").forEach((s) => s.classList.remove("selected"));
      swatch.classList.add("selected");
    });
    colorPicker.appendChild(swatch);
  });

  const listEl = root.querySelector("#profiles-list");
  const addBtn = root.querySelector("#add-profile-btn");
  const addForm = root.querySelector("#add-profile-form");
  const cancelBtn = root.querySelector("#cancel-add-profile");

  addBtn.addEventListener("click", () => {
    addForm.classList.remove("hidden");
    addBtn.classList.add("hidden");
  });
  cancelBtn.addEventListener("click", () => {
    addForm.classList.add("hidden");
    addBtn.classList.remove("hidden");
    addForm.reset();
  });

  addForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = root.querySelector("#new-profile-name").value.trim();
    if (!name) return;
    try {
      await createProfile(state.householdId, name, selectedColor);
      addForm.reset();
      addForm.classList.add("hidden");
      addBtn.classList.remove("hidden");
      showToast(`Profil ${name} cree`, "success");
    } catch (err) {
      console.error(err);
      showToast("Impossible de creer le profil.", "error");
    }
  });

  const unsub = watchProfiles(state.householdId, (profiles) => {
    setState({ profiles });
    if (profiles.length === 0) {
      listEl.innerHTML = `<p class="empty-state">Aucun profil pour l'instant. Ajoutez le premier membre du foyer !</p>`;
      return;
    }
    listEl.innerHTML = "";
    profiles.forEach((profile) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "profile-card";
      card.innerHTML = `
        <div class="profile-avatar" style="background:${profile.avatarColor || "#4CAF50"}">${escapeHtml(initials(profile.name))}</div>
        <span>${escapeHtml(profile.name)}</span>
      `;
      card.addEventListener("click", () => {
        setState({ profile });
        saveProfileToStorage(profile.id);
        navigate("dashboard");
      });
      listEl.appendChild(card);
    });
  });
  trackSubscription(unsub);
}

registerPage("profiles", mount);
