import { describe, it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), grant: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({
	createClient: () => ({
		auth: { getUser: mocks.getUser },
		from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: mocks.grant }) }) }) })
	})
}));
import { validClaims, verifyMcpAccessToken } from '../src/lib/server/mcpAuth';
const user = '00000000-0000-4000-8000-000000000001';
const claims = {
	sub: user,
	iss: 'https://tracker-test.supabase.co/auth/v1',
	aud: 'authenticated',
	exp: Math.floor(Date.now() / 1000) + 3600,
	client_id: 'assistant'
};
function token(changes: Record<string, unknown> = {}) {
	return `header.${Buffer.from(JSON.stringify({ ...claims, ...changes })).toString('base64url')}.signature`;
}
beforeEach(() => {
	vi.clearAllMocks();
	mocks.getUser.mockResolvedValue({ data: { user: { id: user } }, error: null });
	mocks.grant.mockResolvedValue({ data: { revoked_at: null }, error: null });
});
describe('MCP authentication', () => {
	it('requires verified user, correct issuer, subject, audience, expiry and OAuth client', async () => {
		expect(validClaims(token(), user, claims.iss)).toMatchObject({ client_id: 'assistant' });
		for (const change of [
			{ sub: 'another-user' },
			{ iss: 'https://other-project.supabase.co/auth/v1' },
			{ aud: 'other-app' },
			{ exp: 0 },
			{ exp: undefined },
			{ client_id: undefined }
		])
			expect(validClaims(token(change), user, claims.iss)).toBeNull();
		expect(validClaims('bad-token', user, claims.iss)).toBeNull();
		mocks.getUser.mockResolvedValueOnce({
			data: { user: null },
			error: { message: 'bad signature' }
		});
		expect(
			await verifyMcpAccessToken(new Request('https://tracker.example/mcp'), token())
		).toBeUndefined();
	});
	it('derives user and client from the verified token and refuses missing or revoked approval', async () => {
		const request = new Request('https://tracker.example/mcp');
		expect((await verifyMcpAccessToken(request, token()))?.extra).toEqual({ userId: user });
		expect(await verifyMcpAccessToken(request)).toBeUndefined();
		mocks.grant.mockResolvedValueOnce({ data: { revoked_at: '2026-10-25' }, error: null });
		expect(await verifyMcpAccessToken(request, token())).toBeUndefined();
		mocks.grant.mockResolvedValueOnce({ data: null, error: null });
		expect(await verifyMcpAccessToken(request, token())).toBeUndefined();
	});
});
