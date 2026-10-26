import type { TrackedItem, Snapshot } from './types';
import { componentPatch, allComponentsPatch } from './components';

export type TrackerEdit =
	| { patch: Partial<Pick<TrackedItem, 'status' | 'priority' | 'notes'>> }
	| { part: string; count: number }
	| { allParts: true };
export type SaveFailure = { id: string; name: string; message: string; note?: string };
export type TrackerView = {
	items: TrackedItem[];
	revision: number;
	saving: Set<string>;
	blocked: Set<string>;
	failures: SaveFailure[];
};

// One writer per equipment item. Later clicks remain visible while earlier saves finish.
// This is an in-memory queue only: failures stop that item's queue and are never auto-retried.
export class OptimisticTracker {
	private confirmed: TrackedItem[];
	private revision: number;
	private queues = new Map<string, TrackerEdit[]>();
	private failures = new Map<string, SaveFailure>();
	private disposed = false;
	version = 0;

	constructor(
		items: TrackedItem[],
		revision: number,
		private save: (item: TrackedItem, edit: TrackerEdit) => Promise<TrackedItem>,
		private changed: (view: TrackerView) => void,
		private snapshot?: Snapshot
	) {
		this.confirmed = items;
		this.revision = revision;
	}
	private apply = (item: TrackedItem, edit: TrackerEdit): TrackedItem => {
		const recipe = item.catalogue_id
			? this.snapshot?.equipment[item.name.toLowerCase().replace(/[^a-z0-9]/g, '')]
			: undefined;
		return 'patch' in edit
			? { ...item, ...edit.patch }
			: 'allParts' in edit
				? recipe
					? { ...item, ...allComponentsPatch(item, recipe) }
					: item
				: { ...item, ...componentPatch(item, recipe, edit.part, edit.count) };
	};

	get pending() {
		return this.queues.size > 0;
	}
	get view(): TrackerView {
		return {
			items: this.confirmed.map((item) =>
				(this.queues.get(item.id) || []).reduce(this.apply, item)
			),
			revision: this.revision,
			saving: new Set(this.queues.keys()),
			blocked: new Set(this.failures.keys()),
			failures: [...this.failures.values()]
		};
	}
	private publish() {
		this.version++;
		if (!this.disposed) this.changed(this.view);
	}
	replace(items: TrackedItem[], revision: number, snapshot = this.snapshot) {
		if (this.pending || this.disposed) return false;
		this.confirmed = items;
		this.revision = revision;
		this.snapshot = snapshot;
		this.failures.clear();
		this.publish();
		return true;
	}
	edit(id: string, edit: TrackerEdit) {
		if (this.disposed || this.failures.has(id) || !this.confirmed.some((item) => item.id === id))
			return;
		const queue = this.queues.get(id);
		if (queue) queue.push(edit);
		else this.queues.set(id, [edit]);
		this.publish();
		if (!queue) void this.flush(id);
	}
	private async flush(id: string) {
		const queue = this.queues.get(id)!;
		while (queue.length && !this.disposed) {
			const current = this.confirmed.find((item) => item.id === id)!;
			try {
				const saved = await this.save(current, queue[0]);
				if (this.disposed) return;
				this.confirmed = this.confirmed.map((item) => (item.id === id ? saved : item));
				// save_equipment increments tracker_state once for each successful item update.
				// Unseen edits from another device stay outside this revision and still cause conflicts.
				this.revision++;
				queue.shift();
			} catch (error) {
				if (this.disposed) return;
				const draft = queue.reduce(this.apply, current);
				this.failures.set(id, {
					id,
					name: current.name,
					message: error instanceof Error ? error.message : 'Your changes could not be saved.',
					...(draft.notes !== current.notes ? { note: draft.notes } : {})
				});
				queue.length = 0;
			}
			if (!queue.length) this.queues.delete(id);
			this.publish();
		}
	}
	dispose() {
		this.disposed = true;
		this.queues.clear();
	}
}
