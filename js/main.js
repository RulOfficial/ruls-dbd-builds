import { collection, getDocs } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { db, KILLER_BUILDS, SURVIVOR_BUILDS, SURVIVOR_GROUPS } from "./firebase.js";

const $ = (id) => document.getElementById(id);

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

function safeUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value) ? value : "";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[character]));
}

function formatLongDate(date) {
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function decodeDesc(desc) {
  if (!desc) return "";
  try {
    return decodeURIComponent(desc);
  } catch {
    return desc;
  }
}

function formatDescription(desc) {
  const source = decodeDesc(desc).replace(/\r\n/g, "\n");
  const template = document.createElement("template");
  template.innerHTML = source;
  const allowedTags = new Set(["A", "B", "BR", "EM", "I", "LI", "P", "SPAN", "STRONG", "UL", "OL"]);
  const nodes = template.content.querySelectorAll("*");
  nodes.forEach((node) => {
    if (!allowedTags.has(node.tagName)) {
      node.replaceWith(...node.childNodes);
      return;
    }
    [...node.attributes].forEach((attribute) => {
      if (node.tagName === "A" && attribute.name === "href" && /^https?:\/\//i.test(attribute.value)) return;
      if (node.tagName === "SPAN" && attribute.name === "style") {
        const color = attribute.value.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
        if (color) {
          node.setAttribute("style", `color: ${color[1].trim()}`);
          return;
        }
      }
      node.removeAttribute(attribute.name);
    });
    if (node.tagName === "A") {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
  });
  return template.innerHTML;
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const [killerSnap, survivorSnap, groupSnap, survivorPerks, killerPerks] = await Promise.all([
      getDocs(collection(db, KILLER_BUILDS)),
      getDocs(collection(db, SURVIVOR_BUILDS)),
      getDocs(collection(db, SURVIVOR_GROUPS)),
      fetch("./data/survivor-perks.json?v=" + Date.now()).then((response) => response.json()),
      fetch("./data/killer-perks.json?v=" + Date.now()).then((response) => response.json())
    ]);

    const killerBuilds = killerSnap.docs.map((document) => ({ id: document.id, ...document.data() }));
    const survivorBuilds = survivorSnap.docs.map((document) => ({ id: document.id, ...document.data() }));
    const portraits = {};

    groupSnap.docs.forEach((document) => {
      const group = document.data();
      const name = group.group || group.name || document.id;
      const portrait = safeUrl(group.portrait);
      if (portrait) portraits[name] = portrait;
    });

    const latest = [...killerBuilds, ...survivorBuilds]
      .map((build) => toDate(build.approvedAt))
      .filter(Boolean)
      .sort((first, second) => second - first)[0];
    const changeEl = $("changeDate");
    if (changeEl) changeEl.textContent = latest ? formatLongDate(latest) : "Recent";

    const renderPerk = (perkName, altPerkName, perks, role) => {
      const perk = perks.find((item) => item.perkName === perkName);
      if (!perk) return "";
      const alt = altPerkName ? perks.find((item) => item.perkName === altPerkName) : null;
      const image = safeUrl(perk.perkImage);
      const altImage = alt && safeUrl(alt.perkImage);
      return `
        <div class="perkWrapper">
          <img class="perk" title="${escapeHtml(perk.perkName)}" alt="${escapeHtml(perk.perkName)}" src="${image}"
               data-role="${role}" data-description="${escapeHtml(perk.description || "")}"
               data-character="${escapeHtml(perk.character || "")}" loading="lazy">
          ${alt && altImage ? `<div class="alternatives" title="${escapeHtml(alt.perkName)}">
            <img class="perk" src="${altImage}" alt="${escapeHtml(alt.perkName)}" title="${escapeHtml(alt.perkName)}"
                 data-role="${role}" data-description="${escapeHtml(alt.description || "")}"
                 data-character="${escapeHtml(alt.character || "")}" loading="lazy">
          </div>` : ""}
        </div>`;
    };

    const renderBuild = (build, perks, role) => `
      <div class="build">
        <div class="buildName">${escapeHtml(build.name || "")}</div>
        <div class="perks">${(build.perks || []).slice(0, 4).map((perk, index) => renderPerk(perk, build.altperks?.[index], perks, role)).join("")}</div>
      </div>`;

    const groupBy = (items, key) => items.reduce((groups, item) => {
      if (!item[key]) return groups;
      (groups[item[key]] ||= []).push(item);
      return groups;
    }, {});

    const survivorsGrouped = groupBy(survivorBuilds, "group");
    $("survivors").innerHTML = Object.keys(portraits)
      .filter((group) => survivorsGrouped[group])
      .sort((first, second) => first.localeCompare(second))
      .map((group) => {
        const portrait = safeUrl(portraits[group]);
        return `
        <div class="character survivor-character" id="${escapeHtml(group)}">
          <h3 class="characterName">${escapeHtml(group)}</h3>
          <div class="image"><img alt="${escapeHtml(group)}" src="${portrait}" loading="lazy"></div>
          <div class="builds">${survivorsGrouped[group].map((build) => renderBuild(build, survivorPerks, "survivor")).join("")}</div>
        </div>`;
      }).join("");

    const killerPortraits = Object.fromEntries(
      killerPerks
        .filter((perk) => perk.character && perk.characterImage)
        .map((perk) => [perk.character, safeUrl(perk.characterImage.startsWith("http") ? perk.characterImage : `https://deadbydaylight.wiki.gg${perk.characterImage}`)])
    );
    const killersGrouped = groupBy(killerBuilds, "killer");
    $("killerSidebar").innerHTML = Object.keys(killersGrouped)
      .sort()
      .map((killer) => `<a href="#${escapeHtml(killer)}">${escapeHtml(killer)}</a>`)
      .join("");
    $("killers").innerHTML = Object.entries(killersGrouped)
      .sort(([first], [second]) => first.localeCompare(second))
      .map(([killer, builds]) => `
      <div class="character" id="${escapeHtml(killer)}">
        <h3 class="characterName">${escapeHtml(killer)}</h3>
        <div class="image"><img alt="${escapeHtml(killer)}" src="${killerPortraits[killer] || ""}" loading="lazy"></div>
        <div class="builds">${builds.map((build) => renderBuild(build, killerPerks, "killer")).join("")}</div>
      </div>`).join("");

    document.querySelectorAll(".perk").forEach((image) => {
      image.addEventListener("click", () => {
        const modalBg = document.createElement("div");
        modalBg.className = "modalbg";
        modalBg.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="perkModalTitle">
          <button class="modalClose" type="button" aria-label="Close">×</button>
          <h2 id="perkModalTitle">${escapeHtml(image.alt)}</h2>
          <div class="perkDescription">${formatDescription(image.dataset.description || "")}</div>
          <p class="perkCharacter">Character: ${escapeHtml(image.dataset.character || "")}</p>
        </div>`;
        document.body.appendChild(modalBg);
        modalBg.querySelector(".modalClose").addEventListener("click", () => modalBg.remove());
        modalBg.addEventListener("click", (event) => {
          if (event.target === modalBg) modalBg.remove();
        });
        modalBg.addEventListener("keydown", (event) => {
          if (event.key === "Escape") modalBg.remove();
        });
        modalBg.tabIndex = -1;
        modalBg.focus();
      });
    });
  } catch (error) {
    console.error("Error loading data:", error);
  }
});
