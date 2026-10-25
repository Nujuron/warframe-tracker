import { describe, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
	list: vi.fn(),
	get: vi.fn(),
	add: vi.fn(),
	update: vi.fn(),
	component: vi.fn(),
	preview: vi.fn(),
	apply: vi.fn()
}));
vi.mock('../src/lib/server/mcpAuth', () => ({
	verifyMcpAccessToken: async (_r: Request, token?: string) =>
		token === 'valid'
			? { token, clientId: 'assistant', scopes: [], extra: { userId: 'account-a' } }
			: undefined,
	userClient: () => ({ permission: 'account-a' })
}));
vi.mock('../src/lib/server/equipment', () => ({
	listEquipment: mocks.list,
	getEquipment: mocks.get,
	addEquipment: mocks.add,
	updateEquipment: mocks.update,
	setComponent: mocks.component,
	createImport: mocks.preview,
	applyImport: mocks.apply
}));
import { mcpRequest } from '../src/lib/server/mcp';
import { GET as resourceMetadata } from '../src/routes/.well-known/oauth-protected-resource/mcp/+server';
import { ServiceError } from '../src/lib/validation';
async function request(method: string, params: unknown = {}, token = 'valid') {
	const response = await mcpRequest(
		new Request('https://tracker.example/mcp', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json, text/event-stream',
				Authorization: `Bearer ${token}`
			},
			body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
		})
	);
	const body = await response.text();
	const json =
		body.startsWith('event:') || body.startsWith('data:')
			? JSON.parse(
					body
						.split('\n')
						.find((s) => s.startsWith('data:'))!
						.slice(5)
				)
			: JSON.parse(body);
	return { response, json };
}
describe('real MCP HTTP transport', () => {
	it('challenges unauthenticated and invalid tokens', async () => {
		const { response } = await request('tools/list', {}, 'invalid');
		expect(response.status).toBe(401);
		const challenge = response.headers.get('www-authenticate')!;
		const metadataUrl = challenge.match(/resource_metadata="([^"]+)"/)?.[1];
		expect(metadataUrl).toBe('https://tracker.example/.well-known/oauth-protected-resource/mcp');
		const metadata = await resourceMetadata({ url: new URL(metadataUrl!) } as Parameters<
			typeof resourceMetadata
		>[0]);
		expect(metadata.status).toBe(200);
		expect(await metadata.json()).toMatchObject({
			resource: 'https://tracker.example/mcp',
			authorization_servers: ['https://tracker-test.supabase.co/auth/v1']
		});
	});
	it('advertises tools, annotations and bounded pagination without a reset tool', async () => {
		const { json, response } = await request('tools/list');
		expect(response.status).toBe(200);
		const tools = json.result.tools;
		expect(tools).toHaveLength(8);
		expect(tools.some((t: { name: string }) => t.name.includes('reset'))).toBe(false);
		expect(
			tools.find((t: { name: string }) => t.name === 'search_catalogue').annotations.readOnlyHint
		).toBe(true);
	});
	it('uses the authenticated actor and returns structured service errors', async () => {
		mocks.list.mockResolvedValueOnce([{ name: 'Atlas', status: 'missing' }]);
		const { json } = await request('tools/call', {
			name: 'list_tracked_equipment',
			arguments: { limit: 1 }
		});
		expect(mocks.list.mock.calls[0][0]).toMatchObject({
			userId: 'account-a',
			clientId: 'assistant'
		});
		expect(JSON.parse(json.result.content[0].text).total).toBe(1);
		mocks.get.mockRejectedValueOnce(new ServiceError('NOT_FOUND', 'Equipment not found.', 404));
		const failed = await request('tools/call', {
			name: 'get_equipment',
			arguments: { id: '00000000-0000-4000-8000-000000000002' }
		});
		expect(failed.json.result.isError).toBe(true);
		expect(JSON.parse(failed.json.result.content[0].text).error.code).toBe('NOT_FOUND');
	});
});
