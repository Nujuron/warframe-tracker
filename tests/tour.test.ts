import { describe, it, expect, vi } from 'vitest';
import { POST } from '../src/routes/api/account/tour/+server';

async function request(payload: unknown, authenticated = true, saveError: unknown = null) {
	const updateUser = vi.fn().mockResolvedValue({ error: saveError });
	const response = await POST({
		request: new Request('https://tracker.example/api/account/tour', {
			method: 'POST',
			body: JSON.stringify(payload)
		}),
		locals: {
			getUser: async () => (authenticated ? { id: 'account-a' } : null),
			supabase: { auth: { updateUser } }
		}
	} as unknown as Parameters<typeof POST>[0]);
	return { response, updateUser };
}

describe('tour preference', () => {
	it('saves only a presentation preference through the current authenticated session', async () => {
		const { response, updateUser } = await request({ version: 1 });
		expect(response.status).toBe(200);
		expect(updateUser).toHaveBeenCalledWith({ data: { tracker_tour_version: 1 } });
	});
	it('rejects unauthenticated requests', async () => {
		const { response, updateUser } = await request({ version: 1 }, false);
		expect(response.status).toBe(401);
		expect(updateUser).not.toHaveBeenCalled();
	});
	it('does not accept another account or arbitrary metadata', async () => {
		for (const input of [
			{ version: 1, user_id: 'account-b' },
			{ version: 1, data: { role: 'admin' } },
			{ version: 99 }
		]) {
			const { response, updateUser } = await request(input);
			expect(response.status).toBe(400);
			expect(updateUser).not.toHaveBeenCalled();
		}
	});
	it('reports a failed preference save', async () => {
		const { response } = await request({ version: 1 }, true, { message: 'unavailable' });
		expect(response.status).toBe(503);
		expect((await response.json()).error.code).toBe('PREFERENCE_SAVE_FAILED');
	});
});
