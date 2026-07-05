// Initialisation de Firebase (App, Auth, Firestore) + persistance hors-ligne
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Firestore avec cache local persistant (fonctionne hors-ligne, multi-onglets)
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

// L'utilisateur reste connecté d'une session à l'autre
await setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn("Impossible de définir la persistance d'authentification :", err);
});
