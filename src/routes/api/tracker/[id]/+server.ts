import { respond, actor, body } from '$lib/server/http';
import { getEquipment, updateEquipment } from '$lib/server/equipment';
import { z } from 'zod';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = (e) =>
	respond(async () => getEquipment(await actor(e), z.string().uuid().parse(e.params.id)));
export const PATCH: RequestHandler = (e) =>
	respond(async () => {
		const { revision, patch } = z
			.object({ revision: z.number().int().min(1), patch: z.unknown() })
			.parse(await body(e.request));
		return updateEquipment(await actor(e), z.string().uuid().parse(e.params.id), revision, patch);
	});
