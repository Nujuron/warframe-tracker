import bundled from '$lib/data/snapshot.json';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CatalogueItem, Snapshot } from '$lib/types';
import { ServiceError, normalize } from '$lib/validation';
export type SharedData = { catalogue: CatalogueItem[]; primes: Snapshot };
let cache: { data: SharedData; expires: number } | undefined;
export async function sharedData(db: SupabaseClient | null): Promise<SharedData> {
	if (!db) return bundled as SharedData;
	if (cache && cache.expires > Date.now()) return cache.data;
	const catalogue: CatalogueItem[] = [];
	for (let offset = 0; ; offset += 1000) {
		const { data, error } = await db
			.from('equipment_catalogue')
			.select('data,retired')
			.range(offset, offset + 999);
		if (error)
			throw new ServiceError(
				'CATALOGUE_UNAVAILABLE',
				'The catalogue could not be loaded. Apply the database migration and publish the data snapshot.',
				503
			);
		catalogue.push(
			...(data || []).map((r) => ({ ...r.data, retired: r.retired }) as CatalogueItem)
		);
		if (!data || data.length < 1000) break;
	}
	const { data, error } = await db
		.from('data_snapshots')
		.select('data')
		.eq('id', 'current')
		.maybeSingle();
	if (error || !data || !catalogue.length)
		throw new ServiceError(
			'CATALOGUE_UNAVAILABLE',
			'The shared catalogue has not been published yet. Run pnpm data:publish.',
			503
		);
	const result = { catalogue, primes: data.data as Snapshot };
	cache = { data: result, expires: Date.now() + 60000 };
	return result;
}
export const primeKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
export function searchCatalogue(
	all: CatalogueItem[],
	q = '',
	category = '',
	offset = 0,
	limit = 50
) {
	const filtered = all
		.filter(
			(i) =>
				!i.retired &&
				(!q || normalize(i.name).includes(normalize(q))) &&
				(!category || i.category === category)
		)
		.toSorted((a, b) => a.name.localeCompare(b.name));
	return {
		items: filtered.slice(offset, offset + limit),
		total: filtered.length,
		nextOffset: offset + limit < filtered.length ? offset + limit : null
	};
}
export function relevantPrimes(snapshot: Snapshot, names: string[]): Snapshot {
	const equipment = Object.fromEntries(
		names
			.map(primeKey)
			.filter((k) => snapshot.equipment[k])
			.map((k) => [k, snapshot.equipment[k]])
	);
	const relics = new Set(
		Object.values(equipment).flatMap((p) => p.parts.flatMap((c) => c.relics.map((r) => r.name)))
	);
	return {
		...snapshot,
		equipment,
		farms: Object.fromEntries(Object.entries(snapshot.farms).filter(([n]) => relics.has(n)))
	};
}
