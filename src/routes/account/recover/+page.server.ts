import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ locals }) => {
	if (!(await locals.getUser())) redirect(303, '/login');
};
export const actions: Actions = {
	default: async ({ locals, request }) => {
		if (!(await locals.getUser()) || !locals.supabase)
			return fail(401, { error: 'Sign in or open your recovery link again.' });
		const f = await request.formData(),
			password = String(f.get('password') || '');
		if (password.length < 8 || password !== f.get('confirm'))
			return fail(400, { error: 'Passwords must match and contain at least eight characters.' });
		const { error } = await locals.supabase.auth.updateUser({ password });
		if (error) return fail(400, { error: error.message });
		return { message: 'Password updated. You can now return to your tracker.' };
	}
};
