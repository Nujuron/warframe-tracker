import type { SupabaseClient } from '@supabase/supabase-js';
import type { EquipmentInput, TrackedItem } from '$lib/types';
import { equipmentSchema, patchSchema, identityKey, ServiceError } from '$lib/validation';
import { parseImport, previewImport } from '$lib/imports';
import { sharedData, primeKey } from './catalogue';
import { componentPatch } from '$lib/components';
export type Actor = { db: SupabaseClient; userId: string; clientId?: string };
function dbError(error: { message: string; code?: string }) {
	const code = ['CONFLICT', 'NOT_FOUND', 'EXPIRED', 'UNAUTHORIZED'].find((c) =>
		error.message.includes(c)
	);
	throw new ServiceError(
		code || 'SAVE_FAILED',
		code === 'CONFLICT'
			? 'This list changed elsewhere. Refresh and try again.'
			: code === 'EXPIRED'
				? 'This preview expired. Create a new preview.'
				: code === 'NOT_FOUND'
					? 'Equipment or preview not found.'
					: code === 'UNAUTHORIZED'
						? 'This connection no longer has access.'
						: error.message,
		code === 'CONFLICT' ? 409 : code === 'NOT_FOUND' ? 404 : code === 'UNAUTHORIZED' ? 403 : 400
	);
}
export async function trackerRevision(a: Actor) {
	const { data, error } = await a.db
		.from('tracker_state')
		.select('revision')
		.eq('user_id', a.userId)
		.maybeSingle();
	if (error) dbError(error);
	return data?.revision || 0;
}
export async function readTracker(a: Actor) {
	const { data, error } = await a.db.rpc('read_tracker');
	if (error) dbError(error);
	return data as { items: TrackedItem[]; revision: number };
}
export async function listEquipment(a: Actor) {
	const items: TrackedItem[] = [];
	for (let offset = 0; ; offset += 1000) {
		const { data, error } = await a.db
			.from('user_equipment')
			.select('*')
			.eq('user_id', a.userId)
			.order('name')
			.order('id')
			.range(offset, offset + 999);
		if (error) dbError(error);
		items.push(...((data || []) as TrackedItem[]));
		if (!data || data.length < 1000) break;
	}
	return items;
}
export async function getEquipment(a: Actor, id: string) {
	const { data, error } = await a.db
		.from('user_equipment')
		.select('*')
		.eq('user_id', a.userId)
		.eq('id', id)
		.maybeSingle();
	if (error) dbError(error);
	if (!data) throw new ServiceError('NOT_FOUND', 'Equipment not found.', 404);
	return data as TrackedItem;
}
async function resolveInput(a: Actor, input: EquipmentInput) {
	const item = equipmentSchema.parse(input);
	if (item.catalogue_id) {
		const c = (await sharedData(a.db)).catalogue.find((c) => c.id === item.catalogue_id);
		if (!c) throw new ServiceError('NOT_FOUND', 'Catalogue item not found.', 404);
		item.name = c.name;
		item.category = c.category;
	}
	return { ...item, identity_key: identityKey(item.name, item.category, item.catalogue_id) };
}
export async function addEquipment(a: Actor, input: EquipmentInput) {
	const payload = await resolveInput(a, input);
	const { data, error } = await a.db.rpc('save_equipment', { payload });
	if (error) dbError(error);
	return data as TrackedItem;
}
export async function updateEquipment(a: Actor, id: string, revision: number, input: unknown) {
	return savePatch(a, await getEquipment(a, id), revision, input);
}
async function savePatch(a: Actor, current: TrackedItem, revision: number, input: unknown) {
	const patch = patchSchema.parse(input);
	if (current.catalogue_id && (patch.name !== undefined || patch.category !== undefined))
		throw new ServiceError('INVALID_INPUT', 'Catalogue equipment cannot be renamed.');
	const payload = {
		...patch,
		...(!current.catalogue_id
			? {
					identity_key: identityKey(patch.name || current.name, patch.category || current.category)
				}
			: {})
	};
	const { data, error } = await a.db.rpc('save_equipment', {
		payload,
		item_id: current.id,
		expected_revision: revision
	});
	if (error) dbError(error);
	return data as TrackedItem;
}
export async function setComponent(
	a: Actor,
	id: string,
	revision: number,
	part: string,
	count: number
) {
	const item = await getEquipment(a, id);
	if (!item.catalogue_id)
		throw new ServiceError('INVALID_COMPONENT', 'Custom equipment has no assumed components.');
	const recipe = (await sharedData(a.db)).primes.equipment[primeKey(item.name)];
	const p = recipe?.parts.find((p) => p.name === part);
	if (!p || !Number.isInteger(count) || count < 0 || count > p.count)
		throw new ServiceError('INVALID_COMPONENT', 'Component or owned quantity is invalid.');
	return savePatch(a, item, revision, componentPatch(item, recipe, part, count));
}
export async function createImport(
	a: Actor,
	text: string,
	format: 'auto' | 'json' | 'markdown' = 'auto',
	category = 'Other'
) {
	const preview = previewImport(
		parseImport(text, format, category),
		(await sharedData(a.db)).catalogue
	);
	const expected_revision = await trackerRevision(a);
	const payload = preview.entries.map((e) => ({
		...e.item,
		identity_key: identityKey(e.item.name, e.item.category, e.item.catalogue_id)
	}));
	const { data, error } = await a.db
		.from('import_previews')
		.insert({ user_id: a.userId, payload, expected_revision })
		.select('id,expires_at')
		.single();
	if (error) dbError(error);
	return { ...preview, previewId: data!.id as string, expiresAt: data!.expires_at as string };
}
export async function applyImport(a: Actor, id: string, replace = false) {
	const { data, error } = await a.db.rpc('apply_equipment_import', {
		preview_id: id,
		replace_progress: replace
	});
	if (error) dbError(error);
	return data as { added: number; updated: number; preserved: number };
}
export async function resetTracker(a: Actor, revision: number) {
	if (a.clientId)
		throw new ServiceError('FORBIDDEN', 'Reset is available only on the website.', 403);
	const { error } = await a.db.rpc('reset_tracker', { expected_revision: revision });
	if (error) dbError(error);
}
