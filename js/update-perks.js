const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const axios = require("axios").default;

const killerNameMap = {
	"Frank, Julie, Susie, Joey": "Legion",
	"Danny Johnson": "Ghost Face",
	"Nemesis T-Type": "Nemesis",
	"Kenneth Chase": "Clown",
	"Charles Lee Ray": "The Good Guy"
};

async function parsePerks(url) {
	const response = await axios.get(url);
	const dom = new JSDOM(response.data);
	const { document } = dom.window;

	let perks = [...document.querySelector("tbody").children].map((row) => {

		row.children[2].querySelectorAll(".iconLink").forEach(el => el.remove());

		const imageElement = row.children[0].querySelector("img");
		const imageUrl = imageElement?.src.substring(0, imageElement.src.lastIndexOf("/")).replace("/thumb", "");

		let characterName = row.children[3].querySelector("a")?.title || "";

		if (killerNameMap[characterName]) {
			characterName = killerNameMap[characterName];
		}

		return {
			perkImage: imageElement ? "https://deadbydaylight.wiki.gg" + imageUrl : "",
			perkName: imageElement?.alt || "",
			description: encodeURI(row.children[2].innerHTML.replaceAll("/wiki/", "https://deadbydaylight.wiki.gg/wiki/")),
			character: characterName,
			characterImage: row.children[3].querySelector("img")?.src || ""
		};
	});

	perks.sort((a, b) => a.perkName.localeCompare(b.perkName, 'en'));
	return perks;
}


(async function () {
	try {
		console.log("Descargando perks desde la wiki...");

		const killerPerks = await parsePerks("https://deadbydaylight.wiki.gg/wiki/Killer_Perks");
		const survivorPerks = await parsePerks("https://deadbydaylight.wiki.gg/wiki/Survivor_Perks");

		const dataDir = path.join(__dirname, "..", "data");
		if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

		fs.writeFileSync(path.join(dataDir, "killer-perks.json"), JSON.stringify(killerPerks, null, '\t'));
		fs.writeFileSync(path.join(dataDir, "survivor-perks.json"), JSON.stringify(survivorPerks, null, '\t'));

		console.log(`Archivos guardados en ${dataDir}`);
	} catch (err) {
		console.error("Error:", err);
	}
})();
