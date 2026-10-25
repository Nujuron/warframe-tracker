import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const authorizationId = url.searchParams.get('authorization_id') || '';
	if (!authorizationId) return { message: 'This authorization link is incomplete.' };
	if (!(await locals.getUser()))
		redirect(303, `/login?next=${encodeURIComponent(url.pathname + url.search)}`);
	const { data, error: issue } =
		await locals.supabase!.auth.oauth.getAuthorizationDetails(authorizationId);
	if (issue || !data)
		return {
			message: 'This authorization request expired or is unavailable. Start the connection again.'
		};
	if (!('authorization_id' in data)) redirect(303, data.redirect_url);
	return {
		authorizationId: data.authorization_id,
		clientName: data.client.name || data.client.id,
		scope: data.scope || '',
		message: ''
	};
};

async function decide(locals: App.Locals, request: Request, approve: boolean) {
	const user = await locals.getUser();
	if (!user || !locals.supabase) error(401, 'Sign in first.');
	const authorizationId = String((await request.formData()).get('authorization_id') || '');
	const { data: details, error: detailError } =
		await locals.supabase.auth.oauth.getAuthorizationDetails(authorizationId);
	if (detailError || !details)
		return fail(400, { error: 'This authorization request is unavailable.' });
	if (!('authorization_id' in details)) redirect(303, details.redirect_url);
	const clientId = details.client.id;
	if (approve) {
		const { error: saveError } = await locals.supabase.from('oauth_client_grants').upsert({
			user_id: user.id,
			client_id: clientId,
			granted_at: new Date().toISOString(),
			revoked_at: null
		});
		if (saveError) return fail(500, { error: 'Could not save access approval. Please try again.' });
	}
	const { data, error: issue } = approve
		? await locals.supabase.auth.oauth.approveAuthorization(authorizationId)
		: await locals.supabase.auth.oauth.denyAuthorization(authorizationId);
	if (issue || !data) {
		if (approve)
			await locals.supabase
				.from('oauth_client_grants')
				.update({ revoked_at: new Date().toISOString() })
				.eq('user_id', user.id)
				.eq('client_id', clientId);
		return fail(400, { error: 'Could not complete authorization. Try connecting again.' });
	}
	redirect(303, data.redirect_url);
}
export const actions: Actions = {
	approve: ({ locals, request }) => decide(locals, request, true),
	deny: ({ locals, request }) => decide(locals, request, false)
};
