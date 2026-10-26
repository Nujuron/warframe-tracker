import { describe, expect, it, vi } from 'vitest';
import { OptimisticTracker, type TrackerEdit } from '../src/lib/optimisticTracker';
import type { TrackedItem, Snapshot } from '../src/lib/types';
const recipeSnapshot: Snapshot = {
	retrievedAt: '',
	generated: 0,
	modified: 0,
	sources: [],
	farms: {},
	equipment: {
		a: { name: 'a', vaulted: null, wiki: '', parts: [{ name: 'Barrel', count: 2, relics: [] }] }
	}
};

const item = (id: string): TrackedItem => ({
	id,
	user_id: 'account-a',
	identity_key: id,
	catalogue_id: id,
	name: id,
	category: 'Other',
	status: 'missing',
	priority: false,
	notes: '',
	parts: {},
	rank: '',
	revision: 1,
	created_at: '',
	updated_at: ''
});
function deferred<T>() {
	let resolve!: (value: T) => void, reject!: (error: Error) => void;
	const promise = new Promise<T>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}
const tick = async () => {
	await Promise.resolve();
	await Promise.resolve();
};

describe('optimistic cloud edits', () => {
	it('shows every click immediately, serializes an item using confirmed revisions and keeps newer edits visible', async () => {
		const first = deferred<TrackedItem>(),
			second = deferred<TrackedItem>();
		const save = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
		const changed = vi.fn();
		const tracker = new OptimisticTracker([item('a')], 10, save, changed, recipeSnapshot);
		tracker.edit('a', { part: 'Barrel', count: 1 });
		tracker.edit('a', { part: 'Barrel', count: 2 });
		expect(tracker.view.items[0].parts).toEqual({ Barrel: 2 });
		expect(tracker.view.items[0].status).toBe('building');
		expect(save).toHaveBeenCalledTimes(1);
		expect(tracker.replace([item('a')], 1)).toBe(false);
		first.resolve({ ...item('a'), parts: { Barrel: 1 }, revision: 2 });
		await tick();
		expect(save.mock.calls[1]).toEqual([
			expect.objectContaining({ revision: 2, parts: { Barrel: 1 } }),
			{ part: 'Barrel', count: 2 }
		]);
		expect(tracker.view.items[0].parts).toEqual({ Barrel: 2 });
		expect(tracker.view.saving.has('a')).toBe(true);
		second.resolve({ ...item('a'), parts: { Barrel: 2 }, status: 'building', revision: 3 });
		await tick();
		expect(tracker.pending).toBe(false);
		expect(tracker.view.revision).toBe(12);
		expect(tracker.view.items[0].revision).toBe(3);
		expect(tracker.view.items[0].status).toBe('building');
	});
	it('rolls back both the last part and the automatic Building status if that save fails', async () => {
		const request = deferred<TrackedItem>();
		const current = { ...item('a'), parts: { Barrel: 1 } };
		const tracker = new OptimisticTracker(
			[current],
			1,
			() => request.promise,
			vi.fn(),
			recipeSnapshot
		);
		tracker.edit('a', { part: 'Barrel', count: 2 });
		expect(tracker.view.items[0]).toMatchObject({ status: 'building', parts: { Barrel: 2 } });
		request.reject(Error('Save failed'));
		await tick();
		expect(tracker.view.items[0]).toEqual(current);
		expect(tracker.view.revision).toBe(1);
	});
	it('rolls back only a failed item, stops its queued edits, preserves failed notes, and requires refresh', async () => {
		const failed = deferred<TrackedItem>(),
			successful = deferred<TrackedItem>();
		const save = vi.fn((current: TrackedItem, _: TrackerEdit) =>
			current.id === 'a' ? failed.promise : successful.promise
		);
		const tracker = new OptimisticTracker([item('a'), item('b')], 10, save, vi.fn());
		tracker.edit('a', { patch: { notes: 'Keep this draft', priority: true } });
		tracker.edit('a', { part: 'Barrel', count: 1 });
		tracker.edit('b', { patch: { status: 'owned' } });
		expect(save).toHaveBeenCalledTimes(2); // Independent items can save concurrently.
		failed.reject(Error('This list changed elsewhere.'));
		await tick();
		expect(tracker.view.items[0]).toEqual(item('a'));
		expect(tracker.view.items[1].status).toBe('owned');
		expect(tracker.view.failures[0]).toMatchObject({
			id: 'a',
			note: 'Keep this draft',
			message: 'This list changed elsewhere.'
		});
		tracker.edit('a', { patch: { notes: 'Do not retry blindly' } });
		expect(save).toHaveBeenCalledTimes(2);
		successful.resolve({ ...item('b'), status: 'owned', revision: 2 });
		await tick();
		expect(tracker.view.revision).toBe(11);
		expect(
			tracker.replace(
				[{ ...item('a'), notes: 'Other device edit', revision: 4 }, tracker.view.items[1]],
				25
			)
		).toBe(true);
		expect(tracker.view.failures).toEqual([]);
		expect(tracker.view.items[0].notes).toBe('Other device edit');
		expect(tracker.view.revision).toBe(25);
	});
	it('keeps the last confirmed save when a later queued edit fails', async () => {
		const save = vi
			.fn()
			.mockResolvedValueOnce({ ...item('a'), priority: true, revision: 2 })
			.mockRejectedValueOnce(Error('Network unavailable'));
		const tracker = new OptimisticTracker([item('a')], 10, save, vi.fn());
		tracker.edit('a', { patch: { priority: true } });
		tracker.edit('a', { patch: { status: 'owned' } });
		await tick();
		await tick();
		expect(tracker.view.items[0]).toMatchObject({ priority: true, status: 'missing', revision: 2 });
		expect(tracker.view.revision).toBe(11);
		expect(save.mock.calls[1][0].revision).toBe(2);
	});
	it('stops queued requests and ignores late responses when the account/page is disposed', async () => {
		const request = deferred<TrackedItem>(),
			changed = vi.fn();
		const save = vi.fn().mockReturnValue(request.promise);
		const tracker = new OptimisticTracker([item('a')], 0, save, changed);
		tracker.edit('a', { patch: { priority: true } });
		tracker.edit('a', { patch: { notes: 'queued' } });
		tracker.dispose();
		changed.mockClear();
		request.resolve({ ...item('a'), priority: true, revision: 2 });
		await tick();
		expect(save).toHaveBeenCalledTimes(1);
		expect(changed).not.toHaveBeenCalled();
		expect(tracker.replace([item('b')], 0)).toBe(false);
	});
});
