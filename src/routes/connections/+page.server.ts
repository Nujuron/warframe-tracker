import { fail, redirect } from '@sveltejs/kit';
import { siteOrigin } from '$lib/server/config';
import type { Actions, PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ locals, url }) => {
	const user = await locals.getUser();
	if (!user) redirect(303, '/login?next=/connections');
	const { data, error } = await locals
		.supabase!.from('oauth_client_grants')
		.select('client_id,granted_at,revoked_at')
		.eq('user_id', user.id)
		.order('granted_at', { ascending: false });
	return {
		endpoint: `${siteOrigin(url)}/mcp`,
		grants: data || [],
		message: error ? 'Connections could not be loaded. Please refresh.' : ''
	};
};
export const actions: Actions = {
	revoke: async ({ locals, request }) => {
		const user = await locals.getUser();
		if (!user || !locals.supabase) redirect(303, '/login?next=/connections');
		const clientId = String((await request.formData()).get('client_id') || '');
		if (!clientId) return fail(400, { error: 'Choose a connection.' });
		// Block database access immediately, including access tokens not yet expired.
		const { data, error } = await locals.supabase
			.from('oauth_client_grants')
			.update({ revoked_at: new Date().toISOString() })
			.eq('user_id', user.id)
			.eq('client_id', clientId)
			.select('client_id');
		if (error || !data?.length)
			return fail(400, { error: 'Access could not be revoked. Please try again.' });
		const { error: oauthError } = await locals.supabase.auth.oauth.revokeGrant({ clientId });
		return {
			message: oauthError
				? 'Tracker access revoked. The sign-in grant could not be removed; retry to remove it as well.'
				: 'Access revoked.'
		};
	}
};
