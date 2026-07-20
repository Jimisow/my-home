// Gestion des courses / stock de la maison
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

function computeStatus(product) {
  if (!product.hasQuantity) {
    return product.manualStatus || "full";
  }
  const quantity = Number(product.quantity) || 0;
  const threshold = Number(product.threshold) || 1;
  if (quantity <= 0) return "empty";
  if (quantity <= threshold) return "almost";
  return "full";
}

export function watchProducts(householdId, callback) {
  const q = query(collection(db, "products"), where("householdId", "==", householdId));
  return onSnapshot(q, (snap) => {
    const products = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    products.sort((a, b) => a.name.localeCompare(b.name));
    callback(products);
  });
}

export async function addProduct(householdId, profile, data) {
  const base = {
    householdId,
    profileId: profile.id,
    name: data.name.trim(),
    category: data.category || "Autre",
    hasQuantity: !!data.hasQuantity,
    quantity: data.hasQuantity ? Number(data.quantity) || 0 : null,
    threshold: data.hasQuantity ? Number(data.threshold) || 1 : null,
    unit: data.hasQuantity ? (data.unit || "") : "",
    manualStatus: data.hasQuantity ? null : (data.manualStatus || "full"),
    updatedAt: serverTimestamp(),
    updatedBy: profile.name
  };
  base.status = computeStatus(base);
  await addDoc(collection(db, "products"), base);
  await logActivity(householdId, profile.id, profile.name, "product", `${profile.name} a ajoute ${base.name}`);
}

export async function updateProduct(householdId, profile, productId, data) {
  const patch = {
    name: data.name.trim(),
    category: data.category || "Autre",
    hasQuantity: !!data.hasQuantity,
    quantity: data.hasQuantity ? Number(data.quantity) || 0 : null,
    threshold: data.hasQuantity ? Number(data.threshold) || 1 : null,
    unit: data.hasQuantity ? (data.unit || "") : "",
    manualStatus: data.hasQuantity ? null : (data.manualStatus || "full"),
    updatedAt: serverTimestamp(),
    updatedBy: profile.name
  };
  patch.status = computeStatus(patch);
  await updateDoc(doc(db, "products", productId), patch);
  await logActivity(householdId, profile.id, profile.name, "product", `${profile.name} a modifie ${patch.name}`);
}

export async function adjustQuantity(householdId, profile, product, delta) {
  const quantity = Math.max(0, (Number(product.quantity) || 0) + delta);
  const patch = { ...product, quantity };
  const status = computeStatus(patch);
  await updateDoc(doc(db, "products", product.id), {
    quantity,
    status,
    updatedAt: serverTimestamp(),
    updatedBy: profile.name
  });
  if (status === "empty" && product.status !== "empty") {
    await logActivity(householdId, profile.id, profile.name, "product", `${profile.name} a fini ${product.name}`, "important");
  }
}

export async function setManualStatus(householdId, profile, product, manualStatus) {
  await updateDoc(doc(db, "products", product.id), {
    manualStatus,
    status: manualStatus,
    updatedAt: serverTimestamp(),
    updatedBy: profile.name
  });
  if (manualStatus === "empty" && product.status !== "empty") {
    await logActivity(householdId, profile.id, profile.name, "product", `${profile.name} a fini ${product.name}`, "important");
  }
}

export async function restockProduct(householdId, profile, product) {
  const patch = product.hasQuantity
    ? { quantity: (Number(product.threshold) || 1) + 1 }
    : { manualStatus: "full" };
  patch.status = "full";
  await updateDoc(doc(db, "products", product.id), {
    ...patch,
    updatedAt: serverTimestamp(),
    updatedBy: profile.name
  });
  await logActivity(householdId, profile.id, profile.name, "product", `${profile.name} a rachete ${product.name}`);
}

export async function deleteProduct(householdId, profile, product) {
  await deleteDoc(doc(db, "products", product.id));
  await logActivity(householdId, profile.id, profile.name, "product", `${profile.name} a supprime ${product.name}`);
}
