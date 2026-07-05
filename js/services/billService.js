// Gestion des factures et de leur validation par plusieurs profils
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

// Une facture "mensuelle" est reconduite automatiquement : des qu'on constate que
// son echeance appartient a un mois deja passe, on la fait glisser au mois en cours
// (meme jour, ajuste si le mois est plus court) et on la remet a "a payer".
function isFromPastMonth(dueDate) {
  if (!dueDate) return false;
  const d = new Date(dueDate);
  const now = new Date();
  return d.getFullYear() < now.getFullYear() || (d.getFullYear() === now.getFullYear() && d.getMonth() < now.getMonth());
}

function rollDueDateToCurrentMonth(dueDate) {
  const original = new Date(dueDate);
  const now = new Date();
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const day = Math.min(original.getDate(), lastDayOfMonth);
  const rolled = new Date(now.getFullYear(), now.getMonth(), day);
  return rolled.toISOString().slice(0, 10);
}

const rolloverInFlight = new Set();

async function rolloverIfDue(bill) {
  if (!bill.recurring || !isFromPastMonth(bill.dueDate) || rolloverInFlight.has(bill.id)) return;
  rolloverInFlight.add(bill.id);
  try {
    await updateDoc(doc(db, "bills", bill.id), {
      dueDate: rollDueDateToCurrentMonth(bill.dueDate),
      status: "pending",
      paidBy: [],
      updatedAt: serverTimestamp()
    });
  } finally {
    rolloverInFlight.delete(bill.id);
  }
}

export function watchBills(householdId, callback) {
  const q = query(collection(db, "bills"), where("householdId", "==", householdId));
  return onSnapshot(q, (snap) => {
    const bills = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    bills.sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));
    bills.forEach(rolloverIfDue);
    callback(bills);
  });
}

// Une facture est "en retard" si elle n'est pas payee et que l'echeance est passee.
// Ce statut est purement calcule a l'affichage, il n'est jamais ecrit en base.
export function getDisplayStatus(bill) {
  if (bill.status === "paid") return "paid";
  if (bill.dueDate && new Date(bill.dueDate) < new Date(new Date().toDateString())) return "overdue";
  return "pending";
}

export async function addBill(householdId, profile, data) {
  await addDoc(collection(db, "bills"), {
    householdId,
    profileId: profile.id,
    title: data.title.trim(),
    amount: Number(data.amount) || 0,
    dueDate: data.dueDate,
    category: data.category || "Autre",
    recurring: !!data.recurring,
    status: "pending",
    paidBy: [],
    updatedAt: serverTimestamp(),
    updatedBy: profile.name
  });
  await logActivity(householdId, profile.id, profile.name, "bill", `${profile.name} a ajoute la facture ${data.title}`);
}

export async function updateBill(householdId, profile, billId, data) {
  await updateDoc(doc(db, "bills", billId), {
    title: data.title.trim(),
    amount: Number(data.amount) || 0,
    dueDate: data.dueDate,
    category: data.category || "Autre",
    recurring: !!data.recurring,
    updatedAt: serverTimestamp(),
    updatedBy: profile.name
  });
  await logActivity(householdId, profile.id, profile.name, "bill", `${profile.name} a modifie la facture ${data.title}`);
}

export async function togglePaidBy(householdId, profile, bill, allProfileNames) {
  const paidBy = new Set(bill.paidBy || []);
  if (paidBy.has(profile.name)) {
    paidBy.delete(profile.name);
  } else {
    paidBy.add(profile.name);
  }
  const paidByArr = Array.from(paidBy);
  const allValidated = allProfileNames.length > 0 && allProfileNames.every((name) => paidByArr.includes(name));
  const status = allValidated ? "paid" : "pending";
  await updateDoc(doc(db, "bills", bill.id), {
    paidBy: paidByArr,
    status,
    updatedAt: serverTimestamp(),
    updatedBy: profile.name
  });
  if (status === "paid" && bill.status !== "paid") {
    await logActivity(householdId, profile.id, profile.name, "bill", `La facture ${bill.title} est entierement payee`, "important");
  }
}

export async function deleteBill(householdId, profile, bill) {
  await deleteDoc(doc(db, "bills", bill.id));
  await logActivity(householdId, profile.id, profile.name, "bill", `${profile.name} a supprime la facture ${bill.title}`);
}
