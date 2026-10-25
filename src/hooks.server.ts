import { createServerClient } from '@supabase/ssr';
import { error, type Handle } from '@sveltejs/kit';
import { configured, supabaseUrl, publishableKey } from '$lib/server/config';
export const handle: Handle = async ({ event, resolve }) => {
	event.locals.supabase = configured()
		? createServerClient(supabaseUrl(), publishableKey(), {
				cookies: {
					getAll: () => event.cookies.getAll(),
					setAll: (values) =>
						values.forEach(({ name, value, options }) =>
							event.cookies.set(name, value, {
								...options,
								path: '/',
								secure: event.url.protocol === 'https:'
							})
						)
				}
			})
		: null;
	let userPromise: ReturnType<App.Locals['getUser']> | undefined;
	event.locals.getUser = () =>
		(userPromise ??= (async () => {
			if (!event.locals.supabase) return null;
			const { data, error } = await event.locals.supabase.auth.getUser();
			return error ? null : data.user;
		})());
	if (
		event.url.pathname.startsWith('/api/') &&
		!['GET', 'HEAD', 'OPTIONS'].includes(event.request.method) &&
		event.request.headers.get('origin') !== event.url.origin
	)
		error(403, 'Cross-origin writes are not allowed.');
	const response = await resolve(event, {
		filterSerializedResponseHeaders: (name) =>
			['content-range', 'x-supabase-api-version'].includes(name)
	});
	if (
		event.url.pathname.startsWith('/api/') ||
		['/tracker', '/account', '/connections', '/oauth/consent'].includes(event.url.pathname)
	)
		response.headers.set('Cache-Control', 'private, no-store');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	return response;
};
