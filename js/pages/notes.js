// Page Notes : bloc-notes partage du foyer
import { registerPage } from "../router.js";
import { state, trackSubscription } from "../state.js";
import { watchNotes, addNote, updateNote, togglePinned, deleteNote } from "../services/noteService.js";
import { escapeHtml, formatDateTime } from "../utils.js";
import { showToast } from "../components/toast.js";

function mount(root) {
  root.innerHTML = `
    <div class="page notes-page">
      <h1 class="page-title">📝 Notes</h1>
      <div class="toolbar">
        <input type="search" id="search-input" class="search-input" placeholder="Rechercher une note..." />
        <button id="add-note-btn" class="btn btn-primary">➕ Ajouter</button>
      </div>

      <section class="dashboard-section">
        <h2>📌 Epinglees</h2>
        <div id="pinned-list" class="notes-grid"><p class="empty-state">Aucune note epinglee</p></div>
      </section>
      <section class="dashboard-section">
        <h2>Toutes les notes</h2>
        <div id="notes-list" class="notes-grid"><p class="empty-state">Chargement...</p></div>
      </section>
    </div>

    <div id="note-modal" class="modal hidden">
      <div class="modal-content">
        <h2 id="note-modal-title">Ajouter une note</h2>
        <form id="note-form" class="auth-form">
          <input type="hidden" id="note-id" />
          <label>Titre
            <input type="text" id="note-title" required placeholder="Appeler la banque" />
          </label>
          <label>Contenu
            <textarea id="note-content" rows="4" placeholder="Pour le pret immobilier"></textarea>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" id="note-pinned" /> Epingler cette note
          </label>
          <div class="form-actions">
            <button type="button" id="cancel-note-btn" class="btn btn-ghost">Annuler</button>
            <button type="submit" class="btn btn-primary">Enregistrer</button>
          </div>
        </form>
      </div>
    </div>
  `;

  let notes = [];
  let searchTerm = "";

  const pinnedList = root.querySelector("#pinned-list");
  const notesList = root.querySelector("#notes-list");
  const modal = root.querySelector("#note-modal");
  const form = root.querySelector("#note-form");

  root.querySelector("#search-input").addEventListener("input", (e) => {
    searchTerm = e.target.value.trim().toLowerCase();
    renderLists();
  });

  function openModal(note = null) {
    form.reset();
    root.querySelector("#note-modal-title").textContent = note ? "Modifier la note" : "Ajouter une note";
    root.querySelector("#note-id").value = note?.id || "";
    root.querySelector("#note-title").value = note?.title || "";
    root.querySelector("#note-content").value = note?.content || "";
    root.querySelector("#note-pinned").checked = !!note?.pinned;
    modal.classList.remove("hidden");
  }
  function closeModal() { modal.classList.add("hidden"); }

  root.querySelector("#add-note-btn").addEventListener("click", () => openModal());
  root.querySelector("#cancel-note-btn").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = root.querySelector("#note-id").value;
    const data = {
      title: root.querySelector("#note-title").value,
      content: root.querySelector("#note-content").value,
      pinned: root.querySelector("#note-pinned").checked
    };
    try {
      if (id) {
        await updateNote(state.householdId, state.profile, id, data);
        showToast("Note modifiee", "success");
      } else {
        await addNote(state.householdId, state.profile, data);
        showToast("Note ajoutee", "success");
      }
      closeModal();
    } catch (err) {
      console.error(err);
      showToast("Erreur lors de l'enregistrement.", "error");
    }
  });

  function matchesSearch(note) {
    if (!searchTerm) return true;
    return note.title.toLowerCase().includes(searchTerm) || (note.content || "").toLowerCase().includes(searchTerm);
  }

  function renderLists() {
    const filtered = notes.filter(matchesSearch);
    const pinned = filtered.filter((n) => n.pinned);
    const others = filtered.filter((n) => !n.pinned);

    pinnedList.innerHTML = "";
    if (pinned.length === 0) pinnedList.innerHTML = `<p class="empty-state">Aucune note epinglee</p>`;
    else pinned.forEach((n) => pinnedList.appendChild(renderNoteCard(n)));

    notesList.innerHTML = "";
    if (others.length === 0) notesList.innerHTML = `<p class="empty-state">Aucune note</p>`;
    else others.forEach((n) => notesList.appendChild(renderNoteCard(n)));
  }

  function renderNoteCard(note) {
    const card = document.createElement("div");
    card.className = `note-card ${note.pinned ? "note-pinned" : ""}`;
    card.innerHTML = `
      <div class="note-card-header">
        <strong>${escapeHtml(note.title)}</strong>
        <button data-action="pin" title="Epingler">${note.pinned ? "📌" : "📍"}</button>
      </div>
      <p class="note-content">${escapeHtml(note.content || "")}</p>
      <div class="product-meta">${escapeHtml(note.updatedBy || "")} · ${formatDateTime(note.updatedAt)}</div>
      <div class="card-actions">
        <button data-action="edit" title="Modifier">✏️</button>
        <button data-action="delete" title="Supprimer">🗑️</button>
      </div>
    `;
    card.querySelector("[data-action='pin']").addEventListener("click", () => togglePinned(note));
    card.querySelector("[data-action='edit']").addEventListener("click", () => openModal(note));
    card.querySelector("[data-action='delete']").addEventListener("click", async () => {
      if (confirm(`Supprimer la note ${note.title} ?`)) {
        await deleteNote(state.householdId, state.profile, note);
      }
    });
    return card;
  }

  trackSubscription(watchNotes(state.householdId, (data) => {
    notes = data;
    renderLists();
  }));
}

registerPage("notes", mount);
