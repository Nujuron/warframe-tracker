import { json, type RequestEvent } from '@sveltejs/kit';
import { ZodError } from 'zod';
import { ServiceError } from '$lib/validation';
import type { Actor } from './equipment';
export async function actor(event: Pick<RequestEvent, 'locals'>): Promise<Actor> {
	const user = await event.locals.getUser();
	if (!user || !event.locals.supabase)
		throw new ServiceError('UNAUTHORIZED', 'Sign in to use your tracker.', 401);
	return { db: event.locals.supabase, userId: user.id };
}
export async function body(request: Request) {
	const text = await request.text();
	if (new TextEncoder().encode(text).length > 2_100_000)
		throw new ServiceError('TOO_LARGE', 'Request is too large.', 413);
	try {
		return JSON.parse(text);
	} catch {
		throw new ServiceError('INVALID_INPUT', 'Invalid JSON.');
	}
}
export async function respond(fn: () => Promise<unknown>) {
	try {
		return json(await fn());
	} catch (e) {
		if (e instanceof ZodError)
			return json(
				{ error: { code: 'INVALID_INPUT', message: e.issues.map((i) => i.message).join('; ') } },
				{ status: 400 }
			);
		if (e instanceof ServiceError)
			return json({ error: { code: e.code, message: e.message } }, { status: e.status });
		console.error('Request failed:', e);
		return json(
			{
				error: { code: 'INTERNAL_ERROR', message: 'The request could not be completed. Try again.' }
			},
			{ status: 500 }
		);
	}
}
