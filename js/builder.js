import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { collection, addDoc, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { auth, db, KILLER_PENDING, SURVIVOR_GROUPS, SURVIVOR_PENDING } from "./firebase.js";

const repo = "https://raw.githubusercontent.com/RulOfficial/ruls-dbd-builds/dev/";
let perks = [], killers = [];
const $ = (id) => document.getElementById(id), $$ = (s) => document.querySelectorAll(s);

let currentUser = null;

function showToast(msg, type = '') {
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast show ' + type;
  setTimeout(() => t.classList.remove('show'), 2500);
}

function markSubmitted() {
  const button = $("submitBtn");
  if (!button) return;
  button.classList.add("submitted");
  button.disabled = true;
  setTimeout(() => {
    button.classList.remove("submitted");
    button.disabled = false;
  }, 1800);
}

async function loadPerks() {
  try {
    const type = $("type").value;
    perks = (await fetch(repo + `data/${type}-perks.json`).then(r => r.json())).filter(p => p.perkName);
    if (type === "survivor") {
      const groups = (await getDocs(collection(db, SURVIVOR_GROUPS))).docs.map((document) => {
        const group = document.data();
        return group.group || group.name || document.id;
      }).filter(Boolean).sort();
      $("groupSelect").innerHTML = groups.map(g => `<option value="${g}">${g}</option>`).join('');
    } else {
      killers = [...new Set(perks.map(p => p.character).filter(Boolean))];
    }
    renderPerks();
  } catch (e) {
    showToast('Error loading perks', 'error');
  }
}

function renderPerks() {
  $("perkContainer").innerHTML = "";
  for (let i = 0; i < 4; i++) {
    const slot = Object.assign(document.createElement("div"), { className: "perk-slot" });
    const img = Object.assign(document.createElement("img"), { className: "perk-image" });
    const input = Object.assign(document.createElement("input"), { placeholder: `Perk ${i + 1}` });
    const list = Object.assign(document.createElement("div"), { className: "autocomplete-list" });
    const desc = Object.assign(document.createElement("div"), { className: "perk-desc" });
    const box = Object.assign(document.createElement("div"), { className: "autocomplete" });
    const header = Object.assign(document.createElement("div"), { className: "perk-header" });
    input.oninput = input.onfocus = () => input.value && searchPerk(input, list, img, desc, slot);
    box.append(input, list);
    header.append(img, box);
    slot.append(header, desc);
    $("perkContainer").appendChild(slot);
  }
}

function searchPerk(input, list, img, desc, slot) {
  list.innerHTML = "";
  if (!input.value) { list.classList.remove('active'); return; }
  const matches = perks.filter(p => p.perkName.toLowerCase().includes(input.value.toLowerCase())).slice(0, 15);
  if (!matches.length) { list.classList.remove('active'); return; }
  matches.forEach(p => {
    const item = Object.assign(document.createElement("div"), { className: "autocomplete-item", textContent: p.perkName });
    item.onclick = () => {
      if ([...$$('#perkContainer input')].some(i => i.value === p.perkName)) { showToast("Perk already selected", "error"); return; }
      input.value = p.perkName;
      img.src = p.perkImage;
      desc.innerHTML = decodeURIComponent(p.description || "");
      slot.classList.add('selected');
      list.classList.remove('active');
      list.innerHTML = "";
    };
    list.appendChild(item);
  });
  list.classList.add('active');
}

function searchAutocomplete(input, list, data) {
  list.innerHTML = "";
  if (!input.value) { list.classList.remove('active'); return; }
  const matches = data.filter(k => k.toLowerCase().includes(input.value.toLowerCase()));
  if (!matches.length) { list.classList.remove('active'); return; }
  matches.forEach(k => {
    const item = Object.assign(document.createElement("div"), { className: "autocomplete-item", textContent: k });
    item.onclick = () => { input.value = k; list.classList.remove('active'); list.innerHTML = ""; };
    list.appendChild(item);
  });
  list.classList.add('active');
}

document.onclick = e => { if (!e.target.closest('.autocomplete')) $$('.autocomplete-list').forEach(l => l.classList.remove('active')); };

$("killerInput").oninput = $("killerInput").onfocus = () => searchAutocomplete($("killerInput"), $("killerList"), killers);

$("type").onchange = () => {
  const isKiller = $("type").value === "killer";
  $("killerBox").style.display = isKiller ? "flex" : "none";
  $("groupBox").style.display = isKiller ? "none" : "flex";
  loadPerks();
};

function buildPayload() {
  const name = $("buildName").value.trim(), author = $("author").value.trim(), type = $("type").value;
  const perksSelected = [...$$('#perkContainer input')].map(i => i.value);
  if (!name) { showToast("Name is required", "error"); return null; }
  if (perksSelected.some(p => !p)) { showToast("All four perks are required", "error"); return null; }
  const json = {
    name: name.toLowerCase().includes("build") ? name : name + " Build",
    perks: perksSelected,
    altperks: ["", "", "", ""],
    author: author || "Anonymous"
  };
  if (type === "survivor") {
    json.group = $("groupSelect").value;
  } else {
    if (!$("killerInput").value) { showToast("Killer is required", "error"); return null; }
    json.killer = $("killerInput").value;
  }
  return json;
}

$("submitBtn")?.addEventListener("click", async () => {
  if (!currentUser) {
    showToast("Sign in to submit a build", "error");
    window.location.href = "login.html?next=builder.html";
    return;
  }
  const json = buildPayload();
  if (!json) return;
  const type = $("type").value;
  try {
    const col = type === "killer" ? KILLER_PENDING : SURVIVOR_PENDING;
    await addDoc(collection(db, col), {
      ...json,
      submittedAt: serverTimestamp(),
      submittedBy: currentUser.uid,
      submittedByEmail: currentUser.email || ""
    });
    markSubmitted();
  } catch (e) {
    console.error(e);
    showToast("Error submitting build", "error");
  }
});

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  const userInfo = $("userInfo");
  const loginLink = $("loginLink");
  const logoutBtn = $("logoutBtn");
  const submitHint = $("submitHint");
  if (user) {
    if (userInfo) userInfo.textContent = user.displayName || user.email || "Signed in";
    if (loginLink) loginLink.hidden = true;
    if (logoutBtn) {
      logoutBtn.hidden = false;
      logoutBtn.onclick = async () => { await signOut(auth); window.location.reload(); };
    }
    if (submitHint) submitHint.textContent = "Submitted directly to the moderation panel.";
  } else {
    if (userInfo) userInfo.textContent = "Signed out";
    if (loginLink) loginLink.hidden = false;
    if (logoutBtn) logoutBtn.hidden = true;
    if (submitHint) submitHint.textContent = "Sign in to submit directly.";
  }
});

loadPerks();
