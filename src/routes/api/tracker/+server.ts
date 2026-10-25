import { respond, actor, body } from '$lib/server/http';
import { readTracker, addEquipment, resetTracker } from '$lib/server/equipment';
import { z } from 'zod';
import { equipmentSchema } from '$lib/validation';
import { sharedData, relevantPrimes } from '$lib/server/catalogue';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = (e) =>
	respond(async () => {
		const a = await actor(e),
			state = await readTracker(a),
			shared = await sharedData(a.db);
		return {
			...state,
			snapshot: relevantPrimes(
				shared.primes,
				state.items.filter((i) => i.catalogue_id).map((i) => i.name)
			)
		};
	});
export const POST: RequestHandler = (e) =>
	respond(async () => addEquipment(await actor(e), equipmentSchema.parse(await body(e.request))));
export const DELETE: RequestHandler = (e) =>
	respond(async () => {
		const { revision } = z
			.object({ revision: z.number().int().min(0) })
			.parse(await body(e.request));
		await resetTracker(await actor(e), revision);
		return { ok: true };
	});
