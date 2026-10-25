import { error } from '@sveltejs/kit';
import { readTracker } from '$lib/server/equipment';
import { sharedData, relevantPrimes } from '$lib/server/catalogue';
import { ServiceError } from '$lib/validation';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ locals }) => {
	const user = await locals.getUser();
	try {
		const shared = await sharedData(locals.supabase);
		const a = user && locals.supabase ? { userId: user.id, db: locals.supabase } : null;
		const state = a ? await readTracker(a) : { items: [], revision: 0 };
		return {
			...state,
			catalogue: user ? [] : shared.catalogue,
			snapshot: user
				? relevantPrimes(
						shared.primes,
						state.items.filter((i) => i.catalogue_id).map((i) => i.name)
					)
				: shared.primes,
			categories: [...new Set(shared.catalogue.map((i) => i.category))].sort()
		};
	} catch (e) {
		error(
			e instanceof ServiceError ? e.status : 503,
			e instanceof Error ? e.message : 'Tracker unavailable.'
		);
	}
};
