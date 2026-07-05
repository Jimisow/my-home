// Journal des activites recentes du foyer
import {
  collection,
  query,
  where,
  addDoc,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { db } from "../firebase.js";
import { toMillis } from "../utils.js";

export async function logActivity(householdId, profileId, profileName, type, message, importance = "normal") {
  await addDoc(collection(db, "activities"), {
    householdId,
    profileId,
    profileName,
    type,
    message,
    importance,
    timestamp: serverTimestamp()
  });
}

// Tri et decoupage cote client : evite un index compose et reste tres bon marche
// pour le volume d'activites d'un foyer.
export function watchRecentActivities(householdId, count, callback) {
  const q = query(collection(db, "activities"), where("householdId", "==", householdId));
  return onSnapshot(q, (snap) => {
    const activities = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    activities.sort((a, b) => toMillis(b.timestamp) - toMillis(a.timestamp));
    callback(activities.slice(0, count));
  });
}
