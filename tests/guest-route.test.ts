import { beforeEach, describe, expect, it, vi } from 'vitest';
import snapshot from '../src/lib/data/snapshot.json';
const mocks = vi.hoisted(() => ({ read: vi.fn(), shared: vi.fn() }));
vi.mock('../src/lib/server/equipment', () => ({ readTracker: mocks.read }));
vi.mock('../src/lib/server/catalogue', () => ({
	sharedData: mocks.shared,
	relevantPrimes: (value: unknown) => value
}));
import { load } from '../src/routes/tracker/+page.server';
import { GET } from '../src/routes/api/tracker/+server';

beforeEach(() => {
	vi.clearAllMocks();
	mocks.shared.mockResolvedValue(snapshot);
});
describe('guest and account boundaries', () => {
	it('serves an empty guest shell with public catalogue data without reading account progress', async () => {
		const event = { locals: { getUser: async () => null, supabase: {} } };
		const data = await load(event as Parameters<typeof load>[0]);
		expect(data).toMatchObject({
			items: [],
			revision: 0,
			catalogue: snapshot.catalogue,
			snapshot: snapshot.primes
		});
		expect(mocks.read).not.toHaveBeenCalled();
		const response = await GET(event as Parameters<typeof GET>[0]);
		expect(response.status).toBe(401);
		expect(mocks.read).not.toHaveBeenCalled();
	});
	it('reads only the verified account and never imports guest browser data on the server', async () => {
		mocks.read.mockResolvedValue({ items: [], revision: 7 });
		const db = {};
		const data = await load({
			locals: { getUser: async () => ({ id: 'signed-in-account' }), supabase: db }
		} as unknown as Parameters<typeof load>[0]);
		expect(mocks.read).toHaveBeenCalledWith({ userId: 'signed-in-account', db });
		expect(data).toMatchObject({ items: [], revision: 7, catalogue: [] });
	});
});
