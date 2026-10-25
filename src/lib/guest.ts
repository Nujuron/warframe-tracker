import { z } from 'zod';
import { parseImport, previewImport } from './imports';
import { equipmentSchema, identityKey, patchSchema, ServiceError } from './validation';
import type { CatalogueItem, EquipmentInput, ImportPreview, Snapshot, TrackedItem } from './types';

export const GUEST_STORAGE_KEY = 'warframe-tracker:guest:v1';
type StorageAccess = Pick<Storage, 'getItem' | 'setItem'>;
export type GuestState = { version: 1; revision: number; items: TrackedItem[] };
export type GuestPreview = ImportPreview & {
	previewId: string;
	expiresAt: string;
	expectedRevision: number;
};
const storedItem = equipmentSchema.extend({
	id: z.string().uuid(),
	user_id: z.literal('guest'),
	identity_key: z.string().min(1),
	catalogue_id: z.string().nullable(),
	status: z.enum(['missing', 'building', 'owned', 'mastered']),
	priority: z.boolean(),
	notes: z.string().max(10000),
	parts: z.record(z.string(), z.number().int().min(0).max(99)),
	rank: z.string().max(80),
	revision: z.number().int().min(1),
	created_at: z.string().datetime(),
	updated_at: z.string().datetime()
});
const stateSchema = z.object({
	version: z.literal(1),
	revision: z.number().int().min(0),
	items: z.array(storedItem).max(5000)
});
export const emptyGuest = (): GuestState => ({ version: 1, revision: 0, items: [] });

export function readGuest(storage?: StorageAccess): GuestState {
	let raw: string | null;
	try {
		raw = (storage ?? window.localStorage).getItem(GUEST_STORAGE_KEY);
	} catch {
		throw Error('Browser storage is blocked. Allow site storage to save guest progress.');
	}
	if (raw === null) return emptyGuest();
	try {
		const state = stateSchema.parse(JSON.parse(raw));
		if (
			new Set(state.items.map((i) => i.id)).size !== state.items.length ||
			new Set(state.items.map((i) => i.identity_key)).size !== state.items.length
		)
			throw Error('Duplicate entries');
		return state;
	} catch {
		throw Error(
			'Saved guest data could not be read and has not been overwritten. Restore a backup or review this site’s browser storage.'
		);
	}
}

async function changeGuest(
	expectedRevision: number,
	change: (state: GuestState) => void,
	storage?: StorageAccess
) {
	const write = () => {
		const state = readGuest(storage);
		if (state.revision !== expectedRevision)
			throw new ServiceError(
				'CONFLICT',
				'Guest progress changed in another tab. Refresh data before trying again.',
				409
			);
		change(state);
		state.revision++;
		try {
			(storage ?? window.localStorage).setItem(
				GUEST_STORAGE_KEY,
				JSON.stringify(stateSchema.parse(state))
			);
		} catch {
			throw Error(
				'Guest progress could not be saved. Browser storage may be full or blocked. Export a backup before clearing site data.'
			);
		}
		return state;
	};
	// Serialize writes between browser tabs when Web Locks are available.
	return typeof window !== 'undefined' && navigator.locks
		? navigator.locks.request(GUEST_STORAGE_KEY, write)
		: write();
}

function resolve(input: EquipmentInput, catalogue: CatalogueItem[]) {
	const item = equipmentSchema.parse(input);
	if (item.catalogue_id) {
		const match = catalogue.find((c) => c.id === item.catalogue_id);
		if (!match) throw Error('Catalogue item not found.');
		item.name = match.name;
		item.category = match.category;
	}
	return item;
}
function insert(state: GuestState, input: EquipmentInput) {
	const key = identityKey(input.name, input.category, input.catalogue_id);
	if (state.items.some((i) => i.identity_key === key)) return false;
	if (state.items.length >= 5000) throw Error('Your guest list can contain up to 5,000 items.');
	const now = new Date().toISOString();
	state.items.push({
		...input,
		id: crypto.randomUUID(),
		user_id: 'guest',
		identity_key: key,
		catalogue_id: input.catalogue_id || null,
		status: input.status || 'missing',
		priority: input.priority ?? false,
		notes: input.notes || '',
		parts: input.parts || {},
		rank: input.rank || '',
		revision: 1,
		created_at: now,
		updated_at: now
	});
	return true;
}
export function addGuest(
	input: EquipmentInput,
	catalogue: CatalogueItem[],
	revision: number,
	storage?: StorageAccess
) {
	const item = resolve(input, catalogue);
	return changeGuest(
		revision,
		(state) => {
			insert(state, item);
		},
		storage
	);
}
export function updateGuest(
	item: TrackedItem,
	input: unknown,
	revision: number,
	storage?: StorageAccess
) {
	const patch = patchSchema.parse(input);
	return changeGuest(
		revision,
		(state) => {
			const current = state.items.find((i) => i.id === item.id);
			if (!current || current.revision !== item.revision)
				throw Error('Guest progress changed. Refresh data before trying again.');
			if (current.catalogue_id && (patch.name !== undefined || patch.category !== undefined))
				throw Error('Catalogue equipment cannot be renamed.');
			const updated = {
				...current,
				...patch,
				revision: current.revision + 1,
				updated_at: new Date().toISOString()
			};
			updated.identity_key = identityKey(updated.name, updated.category, updated.catalogue_id);
			if (state.items.some((i) => i.id !== current.id && i.identity_key === updated.identity_key))
				throw Error('That equipment is already in your guest tracker.');
			state.items[state.items.indexOf(current)] = updated;
		},
		storage
	);
}
export function setGuestComponent(
	item: TrackedItem,
	part: string,
	count: number,
	snapshot: Snapshot,
	revision: number,
	storage?: StorageAccess
) {
	const recipe = item.catalogue_id
		? snapshot.equipment[item.name.toLowerCase().replace(/[^a-z0-9]/g, '')]
		: undefined;
	const requirement = recipe?.parts.find((p) => p.name === part);
	if (!requirement || !Number.isInteger(count) || count < 0 || count > requirement.count)
		throw Error('Component or owned quantity is invalid.');
	return updateGuest(item, { parts: { ...item.parts, [part]: count } }, revision, storage);
}
export function previewGuest(
	text: string,
	category: string,
	catalogue: CatalogueItem[],
	revision: number
): GuestPreview {
	return {
		...previewImport(parseImport(text, 'auto', category), catalogue),
		previewId: crypto.randomUUID(),
		expiresAt: new Date(Date.now() + 15 * 60000).toISOString(),
		expectedRevision: revision
	};
}
export async function applyGuest(preview: GuestPreview, replace: boolean, storage?: StorageAccess) {
	if (Date.parse(preview.expiresAt) <= Date.now())
		throw Error('Import preview expired. Preview the file again.');
	const result = { added: 0, updated: 0, preserved: 0 };
	const state = await changeGuest(
		preview.expectedRevision,
		(state) => {
			for (const entry of preview.entries) {
				const input = equipmentSchema.parse(entry.item);
				const current = state.items.find(
					(i) => i.identity_key === identityKey(input.name, input.category, input.catalogue_id)
				);
				if (!current) {
					insert(state, input);
					result.added++;
				} else if (!replace) result.preserved++;
				else {
					for (const field of ['status', 'priority', 'notes', 'parts', 'rank'] as const) {
						if (input[field] !== undefined) Object.assign(current, { [field]: input[field] });
					}
					current.revision++;
					current.updated_at = new Date().toISOString();
					result.updated++;
				}
			}
		},
		storage
	);
	return { ...result, state };
}
export function resetGuest(revision: number, storage?: StorageAccess) {
	return changeGuest(
		revision,
		(state) => {
			state.items = [];
		},
		storage
	);
}
