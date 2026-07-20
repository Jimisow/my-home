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

// Pour un echeancier (paiement echelonne), le cycle mensuel s'arrete de lui-meme
// une fois le total rembourse ou la date de fin depassee : on ne relance plus le
// rollover, la facture reste sur son dernier etat ("payee").
function isInstallmentFinished(bill, paidCount, rolledDueDate) {
  const monthly = Number(bill.amount) || 0;
  const total = Number(bill.installmentTotal) || 0;
  if (total > 0 && paidCount * monthly >= total) return true;
  if (bill.installmentEndDate && new Date(rolledDueDate) > new Date(bill.installmentEndDate)) return true;
  return false;
}

async function rolloverIfDue(bill) {
  if (!bill.recurring || !isFromPastMonth(bill.dueDate) || rolloverInFlight.has(bill.id)) return;
  rolloverInFlight.add(bill.id);
  try {
    const rolledDueDate = rollDueDateToCurrentMonth(bill.dueDate);
    const patch = {
      dueDate: rolledDueDate,
      status: "pending",
      paidBy: [],
      updatedAt: serverTimestamp()
    };
    if (bill.installment) {
      const paidCount = (Number(bill.installmentsPaid) || 0) + (bill.status === "paid" ? 1 : 0);
      patch.installmentsPaid = paidCount;
      if (isInstallmentFinished(bill, paidCount, rolledDueDate)) {
        patch.recurring = false;
        patch.installmentCompleted = true;
        patch.dueDate = bill.dueDate;
        patch.status = bill.status === "paid" ? "paid" : "pending";
      }
    }
    await updateDoc(doc(db, "bills", bill.id), patch);
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
  const installment = !!data.installment;
  await addDoc(collection(db, "bills"), {
    householdId,
    profileId: profile.id,
    title: data.title.trim(),
    amount: Number(data.amount) || 0,
    dueDate: data.dueDate,
    category: data.category || "Autre",
    recurring: installment ? true : !!data.recurring,
    split: !!data.split,
    personal: !!data.personal,
    assignedTo: data.personal ? data.assignedTo || null : null,
    installment,
    installmentTotal: installment ? Number(data.installmentTotal) || 0 : null,
    installmentStartDate: installment ? data.installmentStartDate || null : null,
    installmentEndDate: installment ? data.installmentEndDate || null : null,
    installmentsPaid: 0,
    installmentCompleted: false,
    status: "pending",
    paidBy: [],
    updatedAt: serverTimestamp(),
    updatedBy: profile.name
  });
  await logActivity(householdId, profile.id, profile.name, "bill", `${profile.name} a ajoute la facture ${data.title}`);
}

export async function updateBill(householdId, profile, billId, data) {
  const installment = !!data.installment;
  await updateDoc(doc(db, "bills", billId), {
    title: data.title.trim(),
    amount: Number(data.amount) || 0,
    dueDate: data.dueDate,
    category: data.category || "Autre",
    recurring: installment ? true : !!data.recurring,
    split: !!data.split,
    personal: !!data.personal,
    assignedTo: data.personal ? data.assignedTo || null : null,
    installment,
    installmentTotal: installment ? Number(data.installmentTotal) || 0 : null,
    installmentStartDate: installment ? data.installmentStartDate || null : null,
    installmentEndDate: installment ? data.installmentEndDate || null : null,
    updatedAt: serverTimestamp(),
    updatedBy: profile.name
  });
  await logActivity(householdId, profile.id, profile.name, "bill", `${profile.name} a modifie la facture ${data.title}`);
}

// Etat d'avancement d'un echeancier : montant deja rembourse, montant restant,
// pourcentage et nombre de mensualites (les mensualites validees en base, plus le
// mois en cours si deja marque paye mais pas encore reconduit).
export function getInstallmentProgress(bill) {
  const monthly = Number(bill.amount) || 0;
  const total = Number(bill.installmentTotal) || 0;
  const basePaidCount = Number(bill.installmentsPaid) || 0;
  const currentCycleCounted = !bill.installmentCompleted && getDisplayStatus(bill) === "paid" ? 1 : 0;
  const paidCount = basePaidCount + currentCycleCounted;
  const paidAmount = total > 0 ? Math.min(total, paidCount * monthly) : paidCount * monthly;
  const remaining = total > 0 ? Math.max(0, total - paidAmount) : 0;
  const percent = total > 0 ? Math.min(100, Math.round((paidAmount / total) * 100)) : 0;
  const totalCount = total > 0 && monthly > 0 ? Math.ceil(total / monthly) : null;
  return { paidAmount, remaining, percent, paidCount, totalCount };
}

// Part de cette facture qui concerne ce profil, independamment de ce qui est deja
// paye : 0 si c'est une facture personnelle assignee a quelqu'un d'autre, sa
// quote-part si elle est partagee a parts egales, sinon le montant plein (facture
// commune, tout le monde est concerne pour la totalite).
export function getProfileAmount(bill, profileName, profileCount) {
  const amount = Number(bill.amount) || 0;
  if (bill.personal) return bill.assignedTo === profileName ? amount : 0;
  if (bill.split && profileCount > 0) return amount / profileCount;
  return amount;
}

// Part que doit encore regler ce profil sur cette facture. Retourne 0 des que la
// facture est payee, que le profil n'est pas concerne, ou qu'il a deja valide.
export function getOwedShare(bill, profileName, profileCount) {
  if (getDisplayStatus(bill) === "paid") return 0;
  if (bill.personal && bill.assignedTo !== profileName) return 0;
  if (!bill.personal && (bill.paidBy || []).includes(profileName)) return 0;
  return getProfileAmount(bill, profileName, profileCount);
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
