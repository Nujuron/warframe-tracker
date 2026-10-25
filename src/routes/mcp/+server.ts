import { mcpRequest } from '$lib/server/mcp';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = ({ request }) => mcpRequest(request);
export const POST = GET;
export const DELETE = GET;
export const OPTIONS: RequestHandler = () =>
	new Response(null, {
		status: 204,
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
			'Access-Control-Allow-Headers':
				'Authorization, Content-Type, MCP-Protocol-Version, MCP-Session-Id',
			'Access-Control-Expose-Headers': 'WWW-Authenticate, MCP-Session-Id'
		}
	});
