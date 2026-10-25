import { respond, actor, body } from '$lib/server/http';
import { setComponent } from '$lib/server/equipment';
import { z } from 'zod';
import type { RequestHandler } from './$types';
export const POST: RequestHandler = (e) =>
	respond(async () => {
		const { revision, part, count } = z
			.object({
				revision: z.number().int().min(1),
				part: z.string().min(1).max(200),
				count: z.number().int().min(0).max(99)
			})
			.parse(await body(e.request));
		return setComponent(
			await actor(e),
			z.string().uuid().parse(e.params.id),
			revision,
			part,
			count
		);
	});
