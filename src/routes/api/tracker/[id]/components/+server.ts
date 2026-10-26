import { respond, actor, body } from '$lib/server/http';
import { ownAllComponents } from '$lib/server/equipment';
import { z } from 'zod';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = (e) =>
	respond(async () => {
		const { revision } = z
			.object({ revision: z.number().int().min(1) })
			.parse(await body(e.request));
		return ownAllComponents(await actor(e), z.string().uuid().parse(e.params.id), revision);
	});
