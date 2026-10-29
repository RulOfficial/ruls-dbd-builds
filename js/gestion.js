import { collection, getDocs, getDoc, doc, deleteDoc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { db, KILLER_PENDING, SURVIVOR_PENDING, SURVIVOR_GROUPS_PENDING, KILLER_BUILDS, SURVIVOR_BUILDS, SURVIVOR_GROUPS, escapeHtml } from "./firebase.js";
import { requireAdmin } from "./admin.js";

const $ = (id) => document.getElementById(id);
const pendingList = $("pendingList");
const approvedList = $("approvedList");
const pendingView = $("pendingView");
const approvedView = $("approvedView");
const typeFilter = $("typeFilter");
const search = $("search");
const emptyMsg = $("emptyMsg");
const loadMsg = $("loadMsg");
const toast = $("toast");
const editModal = $("editModal");
const editForm = $("editForm");
const repo = "https://raw.githubusercontent.com/RulOfficial/ruls-dbd-builds/dev/";

let pending = [];
let approved = [];
let view = "pending";
let editingItem = null;
let editPerks = [];
const editCatalogs = { killer: [], survivor: [] };
let editKillers = [];
let editGroups = [];

function showToast(msg, type = "") {
  if (!toast) return;
  toast.textContent = msg;
  toast.className = "toast show " + type;
  setTimeout(() => toast.classList.remove("show"), 2500);
}

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

function formatWhen(value) {
  const date = toDate(value);
  if (date) return date.toLocaleString("en-US", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function timeOf(value) {
  const date = toDate(value);
  return date ? date.getTime() : 0;
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^the[\s-]+/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function suggestedBuildId(item) {
  if (item._buildId) return item._buildId;
  if (item._type === "group") return item.group || item.name || item.id;
  const name = slugify(item.name || item.group || "build").replace(/-build$/, "");
  const base = `${name || "build"}-build`;
  return item._type === "killer" ? `${base}-${slugify(item.killer)}` : base;
}

async function readCollection(name) {
  const snap = await getDocs(collection(db, name));
  return snap.docs.map((d) => ({ id: d.id, ...d.data(), _col: name }));
}

function renderBuildCard(item, isPending) {
  const li = document.createElement("li");
  li.className = "build-item";
  const typeLabel = item._type === "killer" ? "Killers" : item._type === "survivor" ? "Survivors" : "Survivor groups";
  const meta = [];
  if (item.author) meta.push(`Author: ${escapeHtml(item.author)}`);
  if (item.killer) meta.push(`Killer: ${escapeHtml(item.killer)}`);
  if (item.group) meta.push(`Group: ${escapeHtml(item.group)}`);
  if (item.submittedAt) meta.push(`Submitted: ${escapeHtml(formatWhen(item.submittedAt))}`);
  if (!isPending && item.approvedAt) meta.push(`Approved: ${escapeHtml(formatWhen(item.approvedAt))}`);

  li.innerHTML = `
    <div class="build-item-header">
      <div>
        <h3>${escapeHtml(item.name || item.group || item.id)}</h3>
        <div class="build-meta">${typeLabel} ${meta.length ? "· " + meta.join(" · ") : ""}</div>
      </div>
      <div class="build-actions">
        ${isPending ? `<input class="build-id-input" data-build-id type="text" value="${escapeHtml(suggestedBuildId(item))}" aria-label="Firebase build ID"><button class="btn-edit" data-action="edit">Edit</button><button class="btn-accept" data-action="accept">Accept</button><button class="btn-reject" data-action="reject">Reject</button>` : `<button class="btn-edit" data-action="edit">Edit</button><button class="btn-reject" data-action="delete">Delete</button>`}
      </div>
    </div>
    ${(item.perks && item.perks.length) ? `<div class="build-perks">${item.perks.map((p) => `<span class="perk-chip">${escapeHtml(p)}</span>`).join("")}</div>` : ""}
    ${item.portrait ? `<div class="group-preview"><img src="${escapeHtml(item.portrait)}" alt=""></div>` : ""}
  `;

  if (isPending) {
    li.querySelector('[data-action="edit"]').addEventListener("click", () => openEditor(item, li.querySelector("[data-build-id]").value));
    li.querySelector('[data-action="accept"]').addEventListener("click", () => accept(item, li));
    li.querySelector('[data-action="reject"]').addEventListener("click", () => reject(item, li));
  } else {
    li.querySelector('[data-action="edit"]').addEventListener("click", () => openEditor(item, item.id));
    li.querySelector('[data-action="delete"]').addEventListener("click", () => removeApproved(item, li));
  }
  return li;
}

function setEditorVisibility() {
  const type = $("editType").value;
  const isGroup = type === "group";
  const visibility = [
    ["editIdBox", !isGroup],
    ["editAuthorBox", !isGroup],
    ["editTypeBox", !isGroup],
    ["editKillerBox", type === "killer"],
    ["editGroupBox", type === "survivor"],
    ["editPortraitBox", isGroup],
    ["editPerksSection", !isGroup]
  ];
  visibility.forEach(([id, visible]) => {
    const element = $(id);
    element.hidden = !visible;
    element.style.display = visible ? "" : "none";
  });
  $("editId").required = !isGroup;
  $("editName").required = true;
  $("editKiller").required = type === "killer";
  $("editGroup").required = type === "survivor";
  $("editNameLabel").textContent = isGroup ? "Group name / ID" : "Name";
}

function createEditPerkSlots(containerId, prefix) {
  const container = $(containerId);
  container.replaceChildren();
  for (let i = 0; i < 4; i++) {
    const slot = document.createElement("div");
    slot.className = "perk-slot edit-perk-slot";
    slot.innerHTML = `<div class="perk-header"><img class="perk-image" alt=""><div class="autocomplete"><input id="${prefix}${i}" placeholder="Perk ${i + 1}" autocomplete="off"><div class="autocomplete-list"></div></div></div><div class="perk-desc"></div>`;
    const input = slot.querySelector("input");
    input.required = prefix === "editPerk";
    const list = slot.querySelector(".autocomplete-list");
    input.addEventListener("input", () => searchEditPerk(input, list, slot, prefix));
    input.addEventListener("focus", () => searchEditPerk(input, list, slot, prefix));
    container.append(slot);
  }
}

function searchEditPerk(input, list, slot, prefix) {
  list.replaceChildren();
  if (!input.value) {
    list.classList.remove("active");
    return;
  }
  const selected = [...document.querySelectorAll(`#${prefix === "editPerk" ? "editPerkContainer" : "editAltPerkContainer"} input`)]
    .filter((field) => field !== input).map((field) => field.value);
  const matches = editPerks.filter((perk) => perk.perkName.toLowerCase().includes(input.value.toLowerCase())).slice(0, 15);
  matches.forEach((perk) => {
    const option = document.createElement("div");
    option.className = "autocomplete-item";
    option.textContent = perk.perkName;
    option.addEventListener("click", () => {
      if (selected.includes(perk.perkName)) {
        showToast("Perk already selected", "error");
        return;
      }
      input.value = perk.perkName;
      slot.querySelector(".perk-image").src = perk.perkImage || "";
      slot.querySelector(".perk-desc").innerHTML = decodeURIComponent(perk.description || "");
      slot.classList.add("selected");
      list.classList.remove("active");
      list.replaceChildren();
    });
    list.append(option);
  });
  list.classList.toggle("active", matches.length > 0);
}

async function loadEditCatalog(type) {
  try {
    const catalog = (await fetch(`${repo}data/${type === "killer" ? "killer" : "survivor"}-perks.json`).then((response) => {
      if (!response.ok) throw new Error("Perks could not be loaded");
      return response.json();
    })).filter((perk) => perk.perkName);
    editCatalogs[type] = catalog;
    editPerks = catalog;
    if (type === "killer") {
      editKillers = [...new Set(editPerks.map((perk) => perk.character).filter(Boolean))];
    } else {
      editGroups = (await getDocs(collection(db, SURVIVOR_GROUPS))).docs
        .map((groupDoc) => {
          const group = groupDoc.data();
          return group.group || group.name || groupDoc.id;
        }).filter(Boolean).sort();
      $("editGroup").innerHTML = editGroups.map((group) => `<option value="${escapeHtml(group)}">${escapeHtml(group)}</option>`).join("");
    }
    createEditPerkSlots("editPerkContainer", "editPerk");
    createEditPerkSlots("editAltPerkContainer", "editAltPerk");
  } catch (e) {
    console.error(e);
    showToast("Error loading builder data", "error");
  }
}

function setupEditAutocomplete(inputId, listId, values) {
  const input = $(inputId);
  const list = $(listId);
  const suggestions = [...new Set(values || [])].filter(Boolean);
  const showSuggestions = () => {
    list.replaceChildren();
    const query = input.value.trim().toLowerCase();
    const matches = suggestions.filter((value) => value.toLowerCase().includes(query));
    matches.slice(0, 15).forEach((value) => {
      const option = document.createElement("div");
      option.className = "autocomplete-item";
      option.textContent = value;
      option.onclick = () => {
        input.value = value;
        list.classList.remove("active");
        list.replaceChildren();
      };
      list.append(option);
    });
    list.classList.toggle("active", matches.length > 0);
  };
  input.oninput = showSuggestions;
  input.onfocus = showSuggestions;
  input.setAttribute("autocomplete", "off");
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
}

function openEditor(item, buildId) {
  editingItem = item;
  editPerks = editCatalogs[item._type === "killer" ? "killer" : "survivor"];
  const isGroup = item._type === "group";
  const groupName = item.group || item.name || item.id || "";
  $("editId").value = isGroup ? groupName : (buildId || item.id || "");
  $("editName").value = isGroup ? groupName : (item.name || "");
  $("editAuthor").value = item.author || "";
  $("editType").value = item._type || "survivor";
  $("editKiller").value = item.killer || "";
  $("editGroup").value = item.group || "";
  $("editPortrait").value = item.portrait || "";
  const perks = Array.isArray(item.perks) ? item.perks : [];
  const altperks = Array.isArray(item.altperks) ? item.altperks : [];
  createEditPerkSlots("editPerkContainer", "editPerk");
  createEditPerkSlots("editAltPerkContainer", "editAltPerk");
  for (let i = 0; i < 4; i++) {
    $(`editPerk${i}`).value = perks[i] || "";
    $(`editAltPerk${i}`).value = altperks[i] || "";
    [[$(`editPerk${i}`), perks[i]], [$(`editAltPerk${i}`), altperks[i]]].forEach(([input, value]) => {
      const perk = editPerks.find((candidate) => candidate.perkName === value);
      if (!perk) return;
      const slot = input.closest(".perk-slot");
      slot.querySelector(".perk-image").src = perk.perkImage || "";
      slot.querySelector(".perk-desc").innerHTML = decodeURIComponent(perk.description || "");
      slot.classList.add("selected");
    });
  }
  setEditorVisibility();
  if (item._type === "killer") setupEditAutocomplete("editKiller", "editKillerList", editKillers);
  if (item._type === "survivor") $("editGroup").value = item.group || "";
  editModal.hidden = false;
  $("editName").focus();
}

function closeEditor() {
  editingItem = null;
  editModal.hidden = true;
  editForm.reset();
}

function editorData() {
  const type = $("editType").value;
  if (type === "group") {
    const name = $("editName").value.trim();
    if (!name || /[\/#\[\]]/.test(name)) throw new Error("A valid group name is required");
    return {
      id: name,
      data: { name, group: name, portrait: $("editPortrait").value.trim() }
    };
  }

  const perks = Array.from({ length: 4 }, (_, i) => $(`editPerk${i}`).value.trim());
  const altperks = Array.from({ length: 4 }, (_, i) => $(`editAltPerk${i}`).value.trim());
  const rawName = $("editName").value.trim();
  const name = rawName.toLowerCase().includes("build") ? rawName : `${rawName} Build`;
  const author = $("editAuthor").value.trim();
  const id = $("editId").value.trim();
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error("Invalid database ID");
  if (!name || perks.some((perk) => !perk)) throw new Error("Name and four perks are required");
  if (type === "killer" && !$("editKiller").value.trim()) throw new Error("Killer is required");
  if (type === "survivor" && !$("editGroup").value.trim()) throw new Error("Group is required");
  return {
    id,
    data: {
      name,
      author: author || "Anonymous",
      perks,
      altperks,
      ...(type === "killer" ? { killer: $("editKiller").value.trim(), group: null } : { group: $("editGroup").value, killer: null })
    }
  };
}

function collectionFor(type, isPending) {
  if (isPending) {
    if (type === "killer") return KILLER_PENDING;
    if (type === "group") return SURVIVOR_GROUPS_PENDING;
    return SURVIVOR_PENDING;
  }
  if (type === "killer") return KILLER_BUILDS;
  if (type === "group") return SURVIVOR_GROUPS;
  return SURVIVOR_BUILDS;
}

async function saveEditor(event) {
  event.preventDefault();
  if (!editingItem) return;
  let edited;
  try {
    edited = editorData();
  } catch (e) {
    showToast(e.message, "error");
    return;
  }
  const saveButton = editForm.querySelector('[type="submit"]');
  saveButton.disabled = true;
  try {
    const batch = writeBatch(db);
    const data = { ...editingItem, ...edited.data };
    delete data.id;
    delete data._col;
    delete data._type;
    delete data._buildId;
    const isPending = editingItem._col.includes("pending");
    const targetCol = collectionFor($("editType").value, isPending);
    const sourceId = editingItem.id;
    const targetId = isPending ? sourceId : edited.id;
    if (targetCol !== editingItem._col || targetId !== sourceId) {
      if ((await getDoc(doc(db, targetCol, targetId))).exists()) {
        showToast("That database ID is already in use", "error");
        return;
      }
    }
    if (isPending) {
      batch.set(doc(db, targetCol, sourceId), data);
      if (targetCol !== editingItem._col) batch.delete(doc(db, editingItem._col, sourceId));
    } else if (targetCol !== editingItem._col || edited.id !== editingItem.id) {
      batch.set(doc(db, targetCol, edited.id), data);
      batch.delete(doc(db, editingItem._col, editingItem.id));
    } else {
      batch.set(doc(db, targetCol, edited.id), data);
    }
    await batch.commit();
    const collectionItems = editingItem._col.includes("pending") ? pending : approved;
    const index = collectionItems.indexOf(editingItem);
    const updated = {
      ...editingItem,
      id: isPending ? sourceId : edited.id,
      _col: targetCol,
      _type: $("editType").value,
      ...(isPending ? { _buildId: edited.id } : {}),
      ...edited.data
    };
    if (index >= 0) collectionItems[index] = updated;
    closeEditor();
    render();
    showToast("Changes saved", "success");
  } catch (e) {
    console.error(e);
    showToast("Error saving changes", "error");
  } finally {
    saveButton.disabled = false;
  }
}

async function accept(item, li) {
  const btns = li.querySelectorAll("button");
  const idInput = li.querySelector("[data-build-id]");
  const destId = idInput?.value.trim();
  if (!destId || !/^[a-zA-Z0-9_-]+$/.test(destId)) {
    showToast("Invalid build ID", "error");
    idInput?.focus();
    return;
  }
  btns.forEach((b) => (b.disabled = true));
  if (idInput) idInput.disabled = true;
  try {
    const batch = writeBatch(db);
    const now = serverTimestamp();
    let targetCol, data = { ...item };
    delete data.id;
    delete data._col;
    delete data._type;
    data.approvedAt = now;
    if (data.updatedAt) delete data.updatedAt;
    if (item._type === "killer") targetCol = KILLER_BUILDS;
    else if (item._type === "survivor") targetCol = SURVIVOR_BUILDS;
    else if (item._type === "group") targetCol = SURVIVOR_GROUPS;
    else targetCol = SURVIVOR_BUILDS;

    batch.set(doc(db, targetCol, destId), data);
    if (item._col) batch.delete(doc(db, item._col, item.id));
    await batch.commit();
    pending = pending.filter((p) => p !== item);
    approved.unshift({ id: destId, ...data, _col: targetCol, _type: item._type, approvedAt: new Date() });
    render();
    showToast("Accepted", "success");
  } catch (e) {
    console.error(e);
    btns.forEach((b) => (b.disabled = false));
    showToast("Error", "error");
  }
}

async function reject(item, li) {
  if (!confirm("Reject?")) return;
  const btns = li.querySelectorAll("button");
  btns.forEach((b) => (b.disabled = true));
  try {
    if (item._col && item.id) await deleteDoc(doc(db, item._col, item.id));
    pending = pending.filter((p) => p !== item);
    render();
    showToast("Rejected", "success");
  } catch (e) {
    console.error(e);
    btns.forEach((b) => (b.disabled = false));
    showToast("Error", "error");
  }
}

async function removeApproved(item, li) {
  if (!confirm("Delete?")) return;
  const btns = li.querySelectorAll("button");
  btns.forEach((b) => (b.disabled = true));
  try {
    if (item._col && item.id) await deleteDoc(doc(db, item._col, item.id));
    approved = approved.filter((p) => p !== item);
    render();
    showToast("Deleted", "success");
  } catch (e) {
    console.error(e);
    btns.forEach((b) => (b.disabled = false));
    showToast("Error", "error");
  }
}

function getFiltered() {
  const f = typeFilter.value;
  const q = search.value.trim().toLowerCase();
  const items = view === "pending" ? pending : approved;
  return items.filter((item) => {
    if (f !== "all") {
      if (f === "killer" && item._type !== "killer") return false;
      if (f === "survivor" && item._type !== "survivor") return false;
      if (f === "group" && item._type !== "group") return false;
    }
    if (!q) return true;
    const hay = `${item.name || ""} ${item.author || ""} ${item.killer || ""} ${item.group || ""} ${(item.perks || []).join(" ")}`.toLowerCase();
    return hay.includes(q);
  });
}

function render() {
  pending.sort((a, b) => timeOf(b.submittedAt) - timeOf(a.submittedAt));
  approved.sort((a, b) => timeOf(b.approvedAt) - timeOf(a.approvedAt));
  const items = getFiltered();
  const list = view === "pending" ? pendingList : approvedList;
  list.replaceChildren(...items.map((i) => renderBuildCard(i, view === "pending")));
  $("pendingCount").textContent = pending.length;
  $("approvedCount").textContent = approved.length;
  emptyMsg.hidden = items.length > 0;
  if (items.length === 0) emptyMsg.textContent = "No results";
}

document.querySelectorAll("[data-tab]").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll("[data-tab]").forEach((t) => { t.classList.remove("active"); t.setAttribute("aria-selected", "false"); });
    tab.classList.add("active");
    tab.setAttribute("aria-selected", "true");
    view = tab.dataset.tab;
    pendingView.hidden = view !== "pending";
    approvedView.hidden = view !== "approved";
    render();
  });
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".autocomplete")) {
    document.querySelectorAll(".autocomplete-list").forEach((list) => list.classList.remove("active"));
  }
});

editForm.addEventListener("submit", saveEditor);
$("editType").addEventListener("change", () => {
  const type = $("editType").value;
  editPerks = editCatalogs[type === "killer" ? "killer" : "survivor"];
  setEditorVisibility();
  if (type === "killer") {
    setupEditAutocomplete("editKiller", "editKillerList", editKillers);
    $("editKiller").focus();
  }
});
$("closeEditBtn").addEventListener("click", closeEditor);
$("cancelEditBtn").addEventListener("click", closeEditor);
editModal.addEventListener("click", (event) => {
  if (event.target === editModal) closeEditor();
});

typeFilter.addEventListener("change", render);
search.addEventListener("input", render);

async function load() {
  try {
    await Promise.all([loadEditCatalog("survivor"), loadEditCatalog("killer")]);
    const [kp, sp, gp, kb, sb, sgb] = await Promise.allSettled([
      readCollection(KILLER_PENDING),
      readCollection(SURVIVOR_PENDING),
      readCollection(SURVIVOR_GROUPS_PENDING),
      readCollection(KILLER_BUILDS),
      readCollection(SURVIVOR_BUILDS),
      readCollection(SURVIVOR_GROUPS)
    ]);
    if (kp.status === "fulfilled") pending.push(...kp.value.map((v) => ({ ...v, _type: "killer" })));
    if (sp.status === "fulfilled") pending.push(...sp.value.map((v) => ({ ...v, _type: "survivor" })));
    if (gp.status === "fulfilled") pending.push(...gp.value.map((v) => ({ ...v, _type: "group" })));
    if (kb.status === "fulfilled") approved.push(...kb.value.map((v) => ({ ...v, _type: "killer" })));
    if (sb.status === "fulfilled") approved.push(...sb.value.map((v) => ({ ...v, _type: "survivor" })));
    if (sgb.status === "fulfilled") approved.push(...sgb.value.map((v) => ({ ...v, _type: "group" })));
    loadMsg.textContent = "";
    render();
  } catch (e) {
    console.error(e);
    loadMsg.textContent = "Error loading";
  }
}

requireAdmin().then(load);
