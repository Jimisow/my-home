// Gestion du bloc-notes partage
import {
  collection,
  doc,
  query,
  where,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { db } from "../firebase.js";
import { logActivity } from "./activityService.js";
import { toMillis } from "../utils.js";

export function watchNotes(householdId, callback) {
  const q = query(collection(db, "notes"), where("householdId", "==", householdId));
  return onSnapshot(q, (snap) => {
    const notes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    notes.sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
    callback(notes);
  });
}

export async function addNote(householdId, profile, data) {
  await addDoc(collection(db, "notes"), {
    householdId,
    profileId: profile.id,
    title: data.title.trim(),
    content: data.content || "",
    pinned: !!data.pinned,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: profile.name
  });
  await logActivity(householdId, profile.id, profile.name, "note", `${profile.name} a ajoute la note ${data.title}`);
}

export async function updateNote(householdId, profile, noteId, data) {
  await updateDoc(doc(db, "notes", noteId), {
    title: data.title.trim(),
    content: data.content || "",
    updatedAt: serverTimestamp(),
    updatedBy: profile.name
  });
  await logActivity(householdId, profile.id, profile.name, "note", `${profile.name} a modifie la note ${data.title}`);
}

export async function togglePinned(note) {
  await updateDoc(doc(db, "notes", note.id), {
    pinned: !note.pinned,
    updatedAt: serverTimestamp()
  });
}

export async function deleteNote(householdId, profile, note) {
  await deleteDoc(doc(db, "notes", note.id));
  await logActivity(householdId, profile.id, profile.name, "note", `${profile.name} a supprime la note ${note.title}`);
}
