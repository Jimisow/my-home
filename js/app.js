// Point d'entree de l'application : initialise le routeur, l'auth et le header
import "./firebase.js";
import { registerPage, initRouter, navigate } from "./router.js";
import { state, setState, subscribe, loadProfileFromStorage } from "./state.js";
import { watchAuthState, getHousehold } from "./services/authService.js";
import { getProfile } from "./services/profileService.js";
import { renderUserMenu } from "./components/userMenu.js";

import "./pages/login.js";
import "./pages/profiles.js";
import "./pages/dashboard.js";
import "./pages/courses.js";
import "./pages/factures.js";
import "./pages/rendezvous.js";
import "./pages/notes.js";

const PAGES_WITH_CHROME = ["dashboard", "courses", "factures", "rendezvous", "notes"];

function setupHeader() {
  const header = document.getElementById("app-header");
  const nav = document.getElementById("main-nav");
  const userMenuRoot = document.getElementById("user-menu-root");

  nav.querySelectorAll("button[data-page]").forEach((btn) => {
    btn.addEventListener("click", () => navigate(btn.dataset.page));
  });

  document.addEventListener("page-changed", (e) => {
    const showChrome = PAGES_WITH_CHROME.includes(e.detail.page);
    header.classList.toggle("hidden", !showChrome);
    nav.querySelectorAll("button[data-page]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.page === e.detail.page);
    });
    if (showChrome) renderUserMenu(userMenuRoot);
  });

  subscribe(() => {
    if (PAGES_WITH_CHROME.includes(state.page)) renderUserMenu(userMenuRoot);
  });
}

async function bootstrap() {
  const viewRoot = document.getElementById("view-root");
  initRouter(viewRoot);
  setupHeader();

  watchAuthState(async (user) => {
    if (!user) {
      setState({ householdId: null, householdName: null, profile: null });
      navigate("login");
      return;
    }

    try {
      const household = await getHousehold(user.uid);
      if (!household) {
        navigate("login");
        return;
      }
      setState({ householdId: household.id, householdName: household.name });

      const storedProfileId = loadProfileFromStorage();
      if (storedProfileId) {
        const profile = await getProfile(storedProfileId);
        if (profile && profile.householdId === household.id) {
          setState({ profile });
          navigate("dashboard");
          return;
        }
      }
      navigate("profiles");
    } catch (err) {
      console.error("Erreur lors de l'initialisation :", err);
      navigate("login");
    }
  });
}

bootstrap();
