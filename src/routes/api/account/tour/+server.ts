import { z } from 'zod';
import { actor, body, respond } from '$lib/server/http';
import { ServiceError } from '$lib/validation';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = (event) =>
	respond(async () => {
		const { db } = await actor(event);
		z.object({ version: z.literal(1) })
			.strict()
			.parse(await body(event.request));
		// This user-editable preference never participates in authorization.
		const { error } = await db.auth.updateUser({ data: { tracker_tour_version: 1 } });
		if (error)
			throw new ServiceError('PREFERENCE_SAVE_FAILED', 'Tour preference could not be saved.', 503);
		return { ok: true };
	});
