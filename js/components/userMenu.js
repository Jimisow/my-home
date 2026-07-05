// Menu utilisateur affiche en haut a droite (nom du profil actif + actions)
import { state, setState, clearProfileFromStorage } from "../state.js";
import { navigate } from "../router.js";
import { logout } from "../services/authService.js";
import { escapeHtml } from "../utils.js";

export function renderUserMenu(root) {
  if (!state.profile) {
    root.innerHTML = "";
    return;
  }
  root.innerHTML = `
    <div class="user-menu">
      <button type="button" id="user-menu-toggle" class="user-menu-toggle">
        <span class="user-avatar" style="background:${state.profile.avatarColor || "#4CAF50"}"></span>
        ${escapeHtml(state.profile.name)} 👤
      </button>
      <div id="user-menu-dropdown" class="user-menu-dropdown hidden">
        <button type="button" id="switch-profile-btn">🔄 Changer de profil</button>
        <button type="button" id="logout-btn">🚪 Deconnexion</button>
      </div>
    </div>
  `;

  const toggle = root.querySelector("#user-menu-toggle");
  const dropdown = root.querySelector("#user-menu-dropdown");
  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.classList.toggle("hidden");
  });
  document.addEventListener("click", () => dropdown.classList.add("hidden"), { once: true });

  root.querySelector("#switch-profile-btn").addEventListener("click", () => {
    clearProfileFromStorage();
    setState({ profile: null });
    navigate("profiles");
  });

  root.querySelector("#logout-btn").addEventListener("click", async () => {
    clearProfileFromStorage();
    setState({ profile: null, householdId: null, householdName: null });
    await logout();
    navigate("login");
  });
}
