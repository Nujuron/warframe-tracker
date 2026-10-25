import { redirect, error } from '@sveltejs/kit';
import { configured } from '$lib/server/config';
import { readTracker } from '$lib/server/equipment';
import { sharedData, relevantPrimes } from '$lib/server/catalogue';
import { ServiceError } from '$lib/validation';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ locals }) => {
	const user = await locals.getUser();
	if (configured() && !user) redirect(303, '/login?next=/tracker');
	try {
		const shared = await sharedData(locals.supabase);
		const a = user && locals.supabase ? { userId: user.id, db: locals.supabase } : null;
		const state = a ? await readTracker(a) : { items: [], revision: 0 };
		return {
			...state,
			snapshot: relevantPrimes(
				shared.primes,
				state.items.filter((i) => i.catalogue_id).map((i) => i.name)
			),
			categories: [...new Set(shared.catalogue.map((i) => i.category))].sort()
		};
	} catch (e) {
		error(
			e instanceof ServiceError ? e.status : 503,
			e instanceof Error ? e.message : 'Tracker unavailable.'
		);
	}
};
