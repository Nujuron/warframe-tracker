import { error } from '@sveltejs/kit';
import { sharedData, searchCatalogue, relevantPrimes } from '$lib/server/catalogue';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ locals, url }) => {
	try {
		const shared = await sharedData(locals.supabase);
		const q = (url.searchParams.get('q') || '').slice(0, 160),
			category = url.searchParams.get('category') || '',
			offset = Math.max(0, Math.min(10000, Number(url.searchParams.get('offset')) || 0));
		const result = searchCatalogue(shared.catalogue, q, category, offset);
		return {
			...result,
			q,
			category,
			offset,
			categories: [...new Set(shared.catalogue.map((i) => i.category))].sort(),
			snapshot: relevantPrimes(
				shared.primes,
				result.items.map((i) => i.name)
			)
		};
	} catch (e) {
		error(503, e instanceof Error ? e.message : 'Catalogue unavailable.');
	}
};
