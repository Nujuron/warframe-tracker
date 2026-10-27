import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const categories = [
	'Warframes',
	'Primary',
	'Secondary',
	'Melee',
	'Arch-Gun',
	'Arch-Melee',
	'Archwing',
	'Sentinels',
	'SentinelWeapons',
	'Pets',
	'Misc',
	'Resources'
];
const labels = {
	Warframes: 'Warframes',
	Archwing: 'Archwings',
	Primary: 'Primary weapons',
	Secondary: 'Secondary weapons',
	Melee: 'Melee weapons',
	'Arch-Gun': 'Archguns',
	'Arch-Melee': 'Archmelee',
	Sentinels: 'Companions',
	Pets: 'Companions',
	SentinelWeapons: 'Robotic companion weapons'
};
function masteryCategory(item) {
	// Some regular melee weapons inherit Archwing internal paths in the source registry.
	// The exported product category distinguishes them from actual SpaceMelee equipment.
	if (item.source === 'Arch-Melee' && item.productCategory === 'Melee') return labels.Melee;
	if (item.type === 'Amp' || item.name === 'Sirocco') return 'Amps';
	if (item.type === 'Necramech') return 'Necramechs';
	if (item.type === 'K-Drive Component') return 'K-Drives';
	if (item.type === 'Kitgun Component') return 'Kitguns';
	return labels[item.source] || item.type || item.category;
}
export function validateData(data) {
	if (!Array.isArray(data.catalogue) || data.catalogue.length < 750)
		throw Error('Incomplete catalogue: expected at least 750 masterable items');
	if (new Set(data.catalogue.map((i) => i.id)).size !== data.catalogue.length)
		throw Error('Duplicate stable identifiers');
	if (data.catalogue.filter((i) => i.category === 'Amps').length < 9)
		throw Error('Incomplete Amp mastery catalogue');
	if (!data.primes?.equipment?.citrineprime || !data.primes.modified)
		throw Error('Incomplete Prime snapshot');
	for (const i of Object.values(data.primes.equipment))
		for (const p of i.parts) {
			if (!p.name || !Number.isInteger(p.count) || p.count < 1) throw Error('Invalid component');
			for (const r of p.relics)
				for (const chance of Object.values(r.chances))
					if (typeof chance !== 'number' || chance < 0 || chance > 100)
						throw Error('Invalid drop chance');
		}
	return data;
}
async function fetchJson(url) {
	const res = await fetch(url, { signal: AbortSignal.timeout(45000) });
	if (!res.ok) throw Error(`${url}: ${res.status}`);
	return res.json();
}
export function makeSnapshot(raw, relics, missions, info) {
	const all = Object.entries(raw).flatMap(([source, items]) =>
			items.map((i) => ({ ...i, source }))
		),
		registry = new Map(all.map((i) => [i.uniqueName, i]));
	const catalogue = [...registry.values()]
		// WFCD flags Amp crafting components as non-masterable. Only prisms grant
		// mastery for a gilded Amp; scaffolds/braces are deliberately excluded.
		// Reference: https://wiki.warframe.com/w/Amp#Notes
		.filter((i) => i.masterable === true || (i.type === 'Amp' && i.name.endsWith(' Prism')))
		.map((i) => ({
			id: i.uniqueName,
			name: i.name,
			category: masteryCategory(i),
			isPrime: !!i.isPrime,
			wiki:
				i.wikiaUrl ||
				`https://wiki.warframe.com/w/${encodeURIComponent(i.name.replaceAll(' ', '_'))}`
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
	const farms = {};
	for (const [planet, nodes] of Object.entries(missions))
		for (const [node, m] of Object.entries(nodes)) {
			if (m.isEvent) continue;
			for (const [rotation, rewards] of Object.entries(
				Array.isArray(m.rewards) ? { Completion: m.rewards } : m.rewards || {}
			))
				for (const r of rewards) {
					const name = r.itemName?.match(/^((?:Lith|Meso|Neo|Axi) \S+) Relic$/)?.[1];
					if (name)
						(farms[name] ||= []).push({
							planet,
							node,
							mode: m.gameMode,
							rotation,
							chance: r.chance
						});
				}
		}
	for (const n in farms)
		farms[n] = [...new Map(farms[n].map((f) => [JSON.stringify(f), f])).values()].sort(
			(a, b) => b.chance - a.chance
		);
	const byReward = {};
	for (const r of relics)
		for (const reward of r.rewards || []) {
			const name = `${r.tier} ${r.relicName}`,
				entry = (byReward[reward.itemName] ||= {});
			(entry[name] ||= { name, chances: {} }).chances[r.state] = reward.chance;
		}
	const key = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, ''),
		equipment = {};
	for (const item of all.filter((i) => i.isPrime && i.masterable)) {
		const rewardNames = Object.keys(byReward).filter((n) => n.startsWith(item.name + ' ')),
			parts = [];
		for (const c of item.components || []) {
			const tail = c.uniqueName.split('/').pop(),
				resolved = registry.get(c.uniqueName);
			if (resolved && !resolved.name.includes('Prime')) continue;
			let reward;
			if (/HelmetComponent$/.test(tail)) reward = item.name + ' Neuroptics Blueprint';
			else if (/ChassisComponent$/.test(tail)) reward = item.name + ' Chassis Blueprint';
			else if (/SystemsComponent$/.test(tail)) reward = item.name + ' Systems Blueprint';
			else if (/WingsComponent$/.test(tail)) reward = item.name + ' Wings Blueprint';
			else if (/Blueprint$/.test(tail)) reward = item.name + ' Blueprint';
			else
				reward = rewardNames
					.toSorted((a, b) => b.length - a.length)
					.find((n) => key(tail).endsWith(key(n.slice(item.name.length + 1))));
			if (!reward && /Holster$/.test(tail)) reward = item.name + ' Pouch';
			if (!reward && /Handle$/.test(tail) && rewardNames.includes(item.name + ' Hilt'))
				reward = item.name + ' Hilt';
			if (!reward && item.name === 'Venka Prime' && /Blade$/.test(tail))
				reward = item.name + ' Blades';
			if (!reward && item.name === 'Zhuge Prime' && /Stock$/.test(tail))
				reward = item.name + ' Grip';
			if (!reward && resolved?.name.includes('Prime')) reward = resolved.name;
			if (reward)
				parts.push({
					name: reward,
					count: c.itemCount || 1,
					relics: Object.values(byReward[reward] || {})
				});
		}
		for (const name of rewardNames)
			if (!parts.some((p) => p.name === name))
				parts.push({ name, count: 1, relics: Object.values(byReward[name]) });
		const combined = new Map();
		for (const p of parts) {
			if (combined.has(p.name)) combined.get(p.name).count += p.count;
			else combined.set(p.name, p);
		}
		equipment[key(item.name)] = {
			name: item.name,
			vaulted: typeof item.vaulted === 'boolean' ? item.vaulted : null,
			wiki:
				item.wikiaUrl ||
				`https://wiki.warframe.com/w/${encodeURIComponent(item.name.replaceAll(' ', '_'))}`,
			parts: [...combined.values()]
		};
	}
	const retrievedAt = new Date().toISOString();
	return {
		catalogue,
		primes: {
			retrievedAt,
			modified: info.modified,
			generated: info.timestamp,
			equipment,
			farms,
			sources: [
				'https://www.warframe.com/droptables',
				'https://github.com/WFCD/warframe-drop-data',
				'https://github.com/WFCD/warframe-items'
			]
		}
	};
}
async function main() {
	const cached = process.argv.includes('--from-cache');
	const load = async (n, url) =>
		cached ? JSON.parse(await fs.readFile(`.data-cache/raw/${n}.json`, 'utf8')) : fetchJson(url);
	const raw = Object.fromEntries(
		await Promise.all(
			categories.map(async (c) => [
				c,
				await load(
					c,
					`https://raw.githubusercontent.com/WFCD/warframe-items/master/data/json/${c}.json`
				)
			])
		)
	);
	const [relics, missions, info] = await Promise.all(
		['relics', 'missionRewards', 'info'].map((n) =>
			load(n, `https://drops.warframestat.us/data/${n}.json`)
		)
	);
	const data = validateData(makeSnapshot(raw, relics.relics, missions.missionRewards, info));
	await fs.mkdir('src/lib/data', { recursive: true });
	await fs.mkdir('.data-cache', { recursive: true });
	const file = 'src/lib/data/snapshot.json';
	try {
		await fs.copyFile(file, `.data-cache/snapshot-${Date.now()}.json`);
	} catch (e) {
		if (e.code !== 'ENOENT') throw e;
	}
	const encoded = JSON.stringify(data);
	await fs.writeFile(file + '.tmp', encoded);
	await fs.rename(file + '.tmp', file);
	console.log(
		`Validated ${data.catalogue.length} items; snapshot ${crypto.createHash('sha256').update(encoded).digest('hex').slice(0, 12)}. Run data:publish to publish it atomically to Supabase.`
	);
}
if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
)
	main().catch((e) => {
		console.error('Refresh rejected; previous snapshot retained:', e.message);
		process.exitCode = 1;
	});
