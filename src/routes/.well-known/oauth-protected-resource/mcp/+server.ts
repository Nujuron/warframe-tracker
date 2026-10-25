import { configured, siteOrigin, supabaseUrl } from '$lib/server/config';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = ({ url }) =>
	Response.json(
		configured()
			? {
					resource: `${siteOrigin(url)}/mcp`,
					authorization_servers: [`${supabaseUrl()}/auth/v1`],
					bearer_methods_supported: ['header'],
					resource_name: 'Warframe Tracker'
				}
			: { error: 'Authentication is not configured.' },
		{ status: configured() ? 200 : 503, headers: { 'Access-Control-Allow-Origin': '*' } }
	);
export const OPTIONS: RequestHandler = () =>
	new Response(null, {
		status: 204,
		headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' }
	});
