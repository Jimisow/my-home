// Gestion des rendez-vous partages du foyer
import {
  collection,
  doc,
  query,
  where,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { db } from "../firebase.js";
import { logActivity } from "./activityService.js";
import { toMillis } from "../utils.js";

export function watchMeetings(householdId, callback) {
  const q = query(collection(db, "meetings"), where("householdId", "==", householdId));
  return onSnapshot(q, (snap) => {
    const meetings = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    meetings.sort((a, b) => toMillis(a.date) - toMillis(b.date));
    callback(meetings);
  });
}

// "passe" est calcule a l'affichage (jamais ecrit), sauf annulation qui reste explicite
export function getDisplayStatus(meeting) {
  if (meeting.status === "cancelled") return "cancelled";
  const date = meeting.date?.toDate ? meeting.date.toDate() : new Date(meeting.date);
  return date < new Date() ? "passed" : "upcoming";
}

export async function addMeeting(householdId, profile, data) {
  await addDoc(collection(db, "meetings"), {
    householdId,
    profileId: profile.id,
    title: data.title.trim(),
    date: Timestamp.fromDate(new Date(data.date)),
    location: data.location || "",
    type: data.type || "autre",
    participants: data.participants || [],
    status: "upcoming",
    updatedAt: serverTimestamp(),
    updatedBy: profile.name
  });
  await logActivity(householdId, profile.id, profile.name, "meeting", `${profile.name} a ajoute le rendez-vous ${data.title}`);
}

export async function updateMeeting(householdId, profile, meetingId, data) {
  await updateDoc(doc(db, "meetings", meetingId), {
    title: data.title.trim(),
    date: Timestamp.fromDate(new Date(data.date)),
    location: data.location || "",
    type: data.type || "autre",
    participants: data.participants || [],
    updatedAt: serverTimestamp(),
    updatedBy: profile.name
  });
  await logActivity(householdId, profile.id, profile.name, "meeting", `${profile.name} a modifie le rendez-vous ${data.title}`);
}

export async function cancelMeeting(householdId, profile, meeting) {
  await updateDoc(doc(db, "meetings", meeting.id), {
    status: "cancelled",
    updatedAt: serverTimestamp(),
    updatedBy: profile.name
  });
  await logActivity(householdId, profile.id, profile.name, "meeting", `${profile.name} a annule le rendez-vous ${meeting.title}`);
}

export async function deleteMeeting(householdId, profile, meeting) {
  await deleteDoc(doc(db, "meetings", meeting.id));
  await logActivity(householdId, profile.id, profile.name, "meeting", `${profile.name} a supprime le rendez-vous ${meeting.title}`);
}
