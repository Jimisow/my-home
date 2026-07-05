// Ecran de connexion du foyer + creation d'un nouveau foyer
import { registerPage, navigate } from "../router.js";
import { login, createHousehold, getHousehold } from "../services/authService.js";
import { setState } from "../state.js";
import { showToast } from "../components/toast.js";

function translateAuthError(err) {
  const code = err?.code || "";
  const map = {
    "auth/invalid-credential": "Email ou mot de passe incorrect.",
    "auth/invalid-email": "Adresse email invalide.",
    "auth/user-not-found": "Aucun foyer ne correspond a cet email.",
    "auth/wrong-password": "Mot de passe incorrect.",
    "auth/email-already-in-use": "Un foyer existe deja avec cet email.",
    "auth/weak-password": "Le mot de passe doit contenir au moins 6 caracteres."
  };
  return map[code] || "Une erreur est survenue. Reessayez.";
}

function mount(root) {
  root.innerHTML = `
    <div class="auth-screen">
      <div class="auth-card">
        <div class="auth-logo">🏠</div>
        <h1>My Home</h1>
        <p class="auth-subtitle" id="auth-subtitle">Connectez-vous a votre foyer</p>

        <form id="login-form" class="auth-form">
          <label>Email
            <input type="email" id="login-email" required autocomplete="username" placeholder="foyer@maison.com" />
          </label>
          <label>Mot de passe
            <input type="password" id="login-password" required autocomplete="current-password" placeholder="••••••••" />
          </label>
          <div id="create-name-wrap" class="hidden">
            <label>Nom du foyer
              <input type="text" id="household-name" placeholder="My Home" />
            </label>
          </div>
          <button type="submit" class="btn btn-primary btn-block" id="submit-btn">Se connecter</button>
        </form>

        <button type="button" id="toggle-mode" class="btn-link">Creer un foyer</button>
      </div>
    </div>
  `;

  let mode = "login";
  const form = root.querySelector("#login-form");
  const subtitle = root.querySelector("#auth-subtitle");
  const submitBtn = root.querySelector("#submit-btn");
  const toggleBtn = root.querySelector("#toggle-mode");
  const createNameWrap = root.querySelector("#create-name-wrap");

  toggleBtn.addEventListener("click", () => {
    mode = mode === "login" ? "create" : "login";
    const isCreate = mode === "create";
    subtitle.textContent = isCreate ? "Creez le compte de votre foyer" : "Connectez-vous a votre foyer";
    submitBtn.textContent = isCreate ? "Creer le foyer" : "Se connecter";
    toggleBtn.textContent = isCreate ? "J'ai deja un foyer" : "Creer un foyer";
    createNameWrap.classList.toggle("hidden", !isCreate);
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = root.querySelector("#login-email").value.trim();
    const password = root.querySelector("#login-password").value;
    submitBtn.disabled = true;
    submitBtn.textContent = "Patientez...";
    try {
      if (mode === "login") {
        const user = await login(email, password);
        const household = await getHousehold(user.uid);
        if (!household) {
          showToast("Aucun foyer trouve pour ce compte.", "error");
          return;
        }
        setState({ householdId: household.id, householdName: household.name });
      } else {
        const name = root.querySelector("#household-name").value.trim();
        const user = await createHousehold(email, password, name);
        setState({ householdId: user.uid, householdName: name || "My Home" });
      }
      navigate("profiles");
    } catch (err) {
      console.error(err);
      showToast(translateAuthError(err), "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = mode === "login" ? "Se connecter" : "Creer le foyer";
    }
  });
}

registerPage("login", mount);
