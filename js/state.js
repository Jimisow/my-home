// Etat global de l'application + petit systeme de pub/sub
const listeners = new Set();

export const state = {
  householdId: null,
  householdName: null,
  profile: null, // { id, name, avatarColor }
  profiles: [],
  page: "login",
  unsubscribers: [] // fonctions onSnapshot actives a nettoyer entre les pages
};

export function setState(patch) {
  Object.assign(state, patch);
  listeners.forEach((fn) => fn(state));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function clearSubscriptions() {
  state.unsubscribers.forEach((unsub) => {
    try { unsub(); } catch (e) { /* deja detache */ }
  });
  state.unsubscribers = [];
}

export function trackSubscription(unsub) {
  state.unsubscribers.push(unsub);
}

const PROFILE_KEY = "maison_profile_id";

export function saveProfileToStorage(profileId) {
  localStorage.setItem(PROFILE_KEY, profileId);
}

export function loadProfileFromStorage() {
  return localStorage.getItem(PROFILE_KEY);
}

export function clearProfileFromStorage() {
  localStorage.removeItem(PROFILE_KEY);
}
