import { equipmentSchema, normalize, ServiceError } from './validation';
import type { CatalogueItem, EquipmentInput, ImportPreview } from './types';
const categoryAliases: Record<string, string> = {
	primary: 'Primary weapons',
	secondary: 'Secondary weapons',
	melee: 'Melee weapons',
	warframe: 'Warframes',
	archgun: 'Archguns',
	'arch-melee': 'Archmelee',
	'additional robotic companions': 'Companions',
	'robotic companions': 'Companions',
	robotic: 'Companions',
	pets: 'Companions',
	sentinels: 'Companions',
	'sentinel weapons': 'Robotic companion weapons'
};
export function canonicalCategory(s: string) {
	return categoryAliases[normalize(s)] || s.trim();
}
function record(v: unknown): v is Record<string, unknown> {
	return !!v && typeof v === 'object' && !Array.isArray(v);
}
export function parseImport(
	text: string,
	format: 'auto' | 'json' | 'markdown' = 'auto',
	defaultCategory = 'Other'
): EquipmentInput[] {
	if (new TextEncoder().encode(text).length > 2_000_000)
		throw new ServiceError('INVALID_IMPORT', 'Import must be smaller than 2 MB.');
	let rows: EquipmentInput[] = [];
	if (format === 'json' || (format === 'auto' && /^[\s]*[\[{]/.test(text))) {
		let data: unknown;
		try {
			data = JSON.parse(text);
		} catch {
			throw new ServiceError('INVALID_IMPORT', 'The JSON file is not valid.');
		}
		if (Array.isArray(data)) rows = data.map((i) => equipmentSchema.parse(i));
		else if (record(data) && data.format === 'warframe-mastery-v2' && Array.isArray(data.items)) {
			const progress = record(data.progress) ? data.progress : {};
			rows = data.items.map((raw) => {
				if (!record(raw)) throw new ServiceError('INVALID_IMPORT', 'Invalid item.');
				const key = typeof raw.id === 'string' ? raw.id : `${raw.category}:${raw.name}`;
				const p = record(progress[key]) ? progress[key] : {};
				return equipmentSchema.parse({ ...raw, ...p });
			});
		} else if (record(data) && data.format === 'warframe-mastery-v1' && record(data.progress)) {
			rows = Object.entries(data.progress).map(([id, p]) => {
				const split = id.indexOf(':');
				if (split < 1 || !record(p))
					throw new ServiceError('INVALID_IMPORT', 'Invalid legacy progress entry.');
				return equipmentSchema.parse({
					...p,
					name: id.slice(split + 1),
					category: id.slice(0, split)
				});
			});
		} else
			throw new ServiceError(
				'INVALID_IMPORT',
				'Use a tracker JSON backup or an array of equipment.'
			);
	} else {
		let category = defaultCategory;
		const checklist = /^\s*[-*+]\s+\[[ xX]\]/m.test(text);
		for (let line of text.split(/\r?\n/)) {
			line = line.trim();
			if (!line) continue;
			if (/^#{1,6}\s/.test(line)) {
				if (/^##\s/.test(line))
					category = line
						.replace(/^#+\s*/, '')
						.split(/\s+[—–]\s/)[0]
						.replace(/\s*\([^)]*\)\s*$/, '')
						.trim();
				continue;
			}
			if (checklist && !/^[-*+]\s+\[[ xX]\]/.test(line)) continue;
			const checked = /^[-*+]\s+\[[xX]\]/.test(line);
			line = line.replace(/^[-*+]\s*/, '').replace(/^\[[ xX]\]\s*/, '');
			const [name, rank] = line.split(' — ');
			rows.push(
				equipmentSchema.parse({
					name,
					category,
					rank: rank || '',
					...(checked ? { status: 'mastered' } : {})
				})
			);
		}
	}
	if (!rows.length || rows.length > 5000)
		throw new ServiceError('INVALID_IMPORT', 'Provide between 1 and 5,000 equipment entries.');
	return rows.map((i) => ({ ...i, category: canonicalCategory(i.category) }));
}
export function previewImport(rows: EquipmentInput[], catalogue: CatalogueItem[]): ImportPreview {
	const entries: ImportPreview['entries'] = [],
		seen = new Set<string>();
	let duplicates = 0;
	for (const item of rows) {
		const candidates =
			item.catalogue_id === null
				? []
				: item.catalogue_id
					? catalogue.filter((c) => c.id === item.catalogue_id)
					: catalogue.filter(
							(c) =>
								normalize(c.name) === normalize(item.name) &&
								normalize(canonicalCategory(c.category)) === normalize(item.category)
						);
		const canonical = candidates.length === 1 ? candidates[0] : null;
		const resolved = {
			...item,
			catalogue_id: canonical?.id || null,
			name: canonical?.name || item.name,
			category: canonical?.category || item.category
		};
		const key = canonical?.id || `${normalize(resolved.category)}:${normalize(resolved.name)}`;
		if (seen.has(key)) {
			duplicates++;
			continue;
		}
		seen.add(key);
		entries.push({
			item: resolved,
			match: candidates.length === 1 ? 'matched' : candidates.length > 1 ? 'ambiguous' : 'custom',
			candidates
		});
	}
	const unresolved = entries.filter((e) => e.match !== 'matched').length;
	return {
		entries,
		duplicates,
		warnings: [
			...(duplicates
				? [`${duplicates} duplicate entries were removed; the first occurrence was kept.`]
				: []),
			...(unresolved
				? [
						`${unresolved} entries have no unique catalogue match. They will be kept as custom equipment without assumed relic data.`
					]
				: [])
		]
	};
}
export function exportEquipment(
	items: {
		id: string;
		catalogue_id?: string | null;
		name: string;
		category: string;
		rank: string;
		status: string;
		priority: boolean;
		notes: string;
		parts: Record<string, number>;
	}[]
) {
	return {
		format: 'warframe-mastery-v2',
		exportedAt: new Date().toISOString(),
		items: items.map((i) => ({
			id: i.id,
			catalogue_id: i.catalogue_id,
			name: i.name,
			category: i.category,
			rank: i.rank
		})),
		progress: Object.fromEntries(
			items.map((i) => [
				i.id,
				{ status: i.status, priority: i.priority, notes: i.notes, parts: i.parts }
			])
		)
	};
}
