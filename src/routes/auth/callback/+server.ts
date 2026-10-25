import { redirect } from '@sveltejs/kit';
import { safePath } from '$lib/validation';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = async ({ url, locals }) => {
	const code = url.searchParams.get('code');
	if (code && locals.supabase) {
		const { error } = await locals.supabase.auth.exchangeCodeForSession(code);
		if (!error) redirect(303, safePath(url.searchParams.get('next')));
	}
	redirect(303, '/login?error=callback');
};
