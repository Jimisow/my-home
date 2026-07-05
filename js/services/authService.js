// Authentification du foyer (un seul compte email/mot de passe pour toute la maison)
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { auth, db } from "../firebase.js";

export function watchAuthState(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function login(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function createHousehold(email, password, householdName) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const householdRef = doc(db, "households", cred.user.uid);
  await setDoc(householdRef, {
    name: householdName || "My Home",
    email,
    createdAt: serverTimestamp()
  });
  return cred.user;
}

export async function getHousehold(uid) {
  const snap = await getDoc(doc(db, "households", uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function logout() {
  await firebaseSignOut(auth);
}
