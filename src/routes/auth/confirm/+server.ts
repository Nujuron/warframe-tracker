import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = async ({ url, locals }) => {
	const hash = url.searchParams.get('token_hash'),
		type = url.searchParams.get('type');
	if (hash && (type === 'email' || type === 'recovery') && locals.supabase) {
		const { error } = await locals.supabase.auth.verifyOtp({ token_hash: hash, type });
		if (!error) redirect(303, type === 'recovery' ? '/account/recover' : '/tracker');
	}
	redirect(303, '/login?error=confirmation');
};
