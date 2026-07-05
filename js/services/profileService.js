// Gestion des profils utilisateurs (membres du foyer, sans mot de passe)
import {
  collection,
  doc,
  getDoc,
  query,
  where,
  addDoc,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { db } from "../firebase.js";
import { toMillis } from "../utils.js";

export async function getProfile(profileId) {
  const snap = await getDoc(doc(db, "profiles", profileId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// Le tri se fait cote client (pas d'orderBy Firestore) pour eviter d'avoir
// a creer un index compose : where(householdId) + orderBy(createdAt) en exige un.
export function watchProfiles(householdId, callback) {
  const q = query(collection(db, "profiles"), where("householdId", "==", householdId));
  return onSnapshot(q, (snap) => {
    const profiles = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    profiles.sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
    callback(profiles);
  });
}

export async function createProfile(householdId, name, avatarColor) {
  return addDoc(collection(db, "profiles"), {
    householdId,
    name,
    avatarColor,
    isActive: true,
    createdAt: serverTimestamp()
  });
}
