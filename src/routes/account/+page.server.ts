import { fail, redirect, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ locals }) => {
	const user = await locals.getUser();
	if (!user || !locals.supabase) redirect(303, '/login?next=/account');
	const { data, error: err } = await locals.supabase
		.from('profiles')
		.select('display_name')
		.eq('id', user.id)
		.maybeSingle();
	if (err) error(503, 'Account settings could not be loaded.');
	return {
		displayName: data
			? data.display_name
			: String(user.user_metadata.display_name || '').slice(0, 80),
		email: user.email || ''
	};
};
export const actions: Actions = {
	update: async ({ locals, request }) => {
		const user = await locals.getUser();
		if (!user || !locals.supabase) return fail(401, { error: 'Please sign in again.' });
		const f = await request.formData(),
			display_name = String(f.get('displayName') || '').trim();
		if (display_name.length > 80)
			return fail(400, { error: 'Display name must be 80 characters or fewer.' });
		const { error } = await locals.supabase.from('profiles').upsert({ id: user.id, display_name });
		if (error) return fail(400, { error: 'Your profile could not be saved.' });
		return { message: 'Profile saved.' };
	}
};
