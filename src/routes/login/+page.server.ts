import { fail, redirect } from '@sveltejs/kit';
import { safePath } from '$lib/validation';
import { siteOrigin } from '$lib/server/config';
import { env } from '$env/dynamic/public';
import type { Actions, PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ locals, url }) => {
	const next = safePath(url.searchParams.get('next'));
	if (!url.searchParams.has('error') && (await locals.getUser())) redirect(303, next);
	return {
		next,
		mode:
			url.searchParams.get('mode') === 'signup'
				? 'signup'
				: url.searchParams.get('mode') === 'recover'
					? 'recover'
					: 'signin',
		authError: url.searchParams.has('error')
			? 'The sign-in link was invalid or expired. Please try again.'
			: ''
	};
};
export const actions: Actions = {
	signin: async ({ request, locals }) => {
		if (!locals.supabase) return fail(503, { error: 'Supabase is not configured yet.' });
		const f = await request.formData();
		const { error } = await locals.supabase.auth.signInWithPassword({
			email: String(f.get('email') || '').trim(),
			password: String(f.get('password') || '')
		});
		if (error) return fail(400, { error: error.message });
		redirect(303, safePath(f.get('next')));
	},
	signup: async ({ request, locals, url }) => {
		if (!locals.supabase) return fail(503, { error: 'Supabase is not configured yet.' });
		const f = await request.formData(),
			password = String(f.get('password') || '');
		if (password.length < 8)
			return fail(400, { error: 'Use at least eight characters for your password.' });
		const { data, error } = await locals.supabase.auth.signUp({
			email: String(f.get('email') || '').trim(),
			password,
			options: {
				emailRedirectTo: `${siteOrigin(url)}/auth/callback`,
				data: {
					display_name: String(f.get('displayName') || '')
						.trim()
						.slice(0, 80)
				}
			}
		});
		if (error) return fail(400, { error: error.message });
		if (data.session) redirect(303, '/tracker');
		return { message: 'Check your email to confirm your account, then sign in.' };
	},
	google: async ({ locals, url, request }) => {
		if (!locals.supabase || env.PUBLIC_GOOGLE_AUTH_ENABLED !== 'true')
			return fail(503, { error: 'Google sign-in is not configured.' });
		const f = await request.formData(),
			next = safePath(f.get('next'));
		const { data, error } = await locals.supabase.auth.signInWithOAuth({
			provider: 'google',
			options: { redirectTo: `${siteOrigin(url)}/auth/callback?next=${encodeURIComponent(next)}` }
		});
		if (error || !data.url)
			return fail(400, { error: error?.message || 'Google sign-in could not start.' });
		redirect(303, data.url);
	},
	recover: async ({ request, locals, url }) => {
		if (!locals.supabase) return fail(503, { error: 'Supabase is not configured yet.' });
		const f = await request.formData();
		const { error } = await locals.supabase.auth.resetPasswordForEmail(
			String(f.get('email') || '').trim(),
			{ redirectTo: `${siteOrigin(url)}/auth/callback?next=/account/recover` }
		);
		if (error) return fail(400, { error: 'Recovery email could not be sent. Please try later.' });
		return { message: 'If that address has an account, a password-reset email is on its way.' };
	}
};
