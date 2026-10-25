import { respond, actor, body } from '$lib/server/http';
import { createImport } from '$lib/server/equipment';
import { z } from 'zod';
import type { RequestHandler } from './$types';
export const POST: RequestHandler = (e) =>
	respond(async () => {
		const p = z
			.object({
				text: z.string().max(2_000_000),
				format: z.enum(['auto', 'json', 'markdown']).default('auto'),
				category: z.string().max(80).default('Other')
			})
			.parse(await body(e.request));
		return createImport(await actor(e), p.text, p.format, p.category);
	});
