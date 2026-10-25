import { respond, actor, body } from '$lib/server/http';
import { applyImport } from '$lib/server/equipment';
import { z } from 'zod';
import type { RequestHandler } from './$types';
export const POST: RequestHandler = (e) =>
	respond(async () => {
		const p = z
			.object({ previewId: z.string().uuid(), replaceProgress: z.boolean().default(false) })
			.parse(await body(e.request));
		return applyImport(await actor(e), p.previewId, p.replaceProgress);
	});
