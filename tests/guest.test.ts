import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import snapshot from '../src/lib/data/snapshot.json';
import { exportEquipment } from '../src/lib/imports';
import {
	addGuest,
	applyGuest,
	GUEST_STORAGE_KEY,
	previewGuest,
	readGuest,
	resetGuest,
	setGuestComponent,
	updateGuest
} from '../src/lib/guest';

function storage() {
	const values = new Map<string, string>();
	return {
		values,
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => {
			values.set(key, value);
		}
	};
}
const frame = snapshot.catalogue.find((i) => i.name === 'Citrine Prime')!;
const input = { catalogue_id: frame.id, name: frame.name, category: frame.category };

describe('local guest persistence', () => {
	it('starts empty, adds without duplicates and preserves edits on repeated additions', async () => {
		const db = storage();
		expect(readGuest(db).items).toEqual([]);
		let state = await addGuest(input, snapshot.catalogue, 0, db);
		state = await updateGuest(
			state.items[0],
			{ status: 'building', priority: true, notes: 'Farm together' },
			state.revision,
			db
		);
		state = await addGuest(input, snapshot.catalogue, state.revision, db);
		expect(readGuest(db).items).toHaveLength(1);
		expect(state.items[0]).toMatchObject({
			status: 'building',
			priority: true,
			notes: 'Farm together',
			user_id: 'guest'
		});
		expect(db.values.has(GUEST_STORAGE_KEY)).toBe(true);
	});
	it('round trips all 289 items and statuses, notes, priorities and component progress', async () => {
		const db = storage();
		const original = readFileSync('tests/fixtures/original-289.json', 'utf8');
		let result = await applyGuest(
			previewGuest(original, 'Other', snapshot.catalogue, 0),
			false,
			db
		);
		expect(result.added).toBe(289);
		let state = result.state;
		const item = state.items.find((i) => i.name === frame.name)!;
		state = await updateGuest(
			item,
			{ status: 'owned', notes: 'Keep these parts', priority: true },
			state.revision,
			db
		);
		const part = snapshot.primes.equipment.citrineprime.parts[0];
		state = await setGuestComponent(
			state.items.find((i) => i.id === item.id)!,
			part.name,
			1,
			snapshot.primes,
			state.revision,
			db
		);
		const backup = JSON.stringify(exportEquipment(state.items));
		const restored = await applyGuest(
			previewGuest(backup, 'Other', snapshot.catalogue, 0),
			false,
			storage()
		);
		expect(restored.state.items).toHaveLength(289);
		expect(restored.state.items.find((i) => i.name === frame.name)).toMatchObject({
			status: 'owned',
			priority: true,
			notes: 'Keep these parts',
			parts: { [part.name]: 1 }
		});
		result = await applyGuest(
			previewGuest(original, 'Other', snapshot.catalogue, state.revision),
			false,
			db
		);
		expect(result).toMatchObject({ added: 0, updated: 0, preserved: 289 });
		expect(result.state.items.find((i) => i.name === frame.name)?.status).toBe('owned');
	});
	it('preserves custom entries, replaces only supplied progress and rejects expired previews', async () => {
		const db = storage();
		let state = await addGuest(
			{ name: 'My custom gear', category: 'Other', notes: 'Keep note', priority: true },
			[],
			0,
			db
		);
		const preview = previewGuest(
			JSON.stringify([{ name: 'My custom gear', category: 'Other', status: 'mastered' }]),
			'Other',
			[],
			state.revision
		);
		state = (await applyGuest(preview, true, db)).state;
		expect(state.items[0]).toMatchObject({
			catalogue_id: null,
			notes: 'Keep note',
			priority: true,
			status: 'mastered'
		});
		await expect(
			applyGuest({ ...preview, expiresAt: '2000-01-01T00:00:00.000Z' }, true, db)
		).rejects.toThrow('expired');
	});
	it('rejects stale edits, imports and resets and keeps the newer data', async () => {
		const db = storage();
		const first = await addGuest(input, snapshot.catalogue, 0, db);
		const preview = previewGuest('Atlas', 'Warframes', snapshot.catalogue, first.revision);
		await updateGuest(first.items[0], { notes: 'Newer edit' }, first.revision, db);
		await expect(
			updateGuest(first.items[0], { notes: 'Stale edit' }, first.revision, db)
		).rejects.toThrow('another tab');
		await expect(applyGuest(preview, false, db)).rejects.toThrow('another tab');
		await expect(resetGuest(first.revision, db)).rejects.toThrow('another tab');
		expect(readGuest(db).items[0].notes).toBe('Newer edit');
	});
	it('does not overwrite unreadable storage or claim a failed save succeeded', async () => {
		const db = storage();
		db.values.set(GUEST_STORAGE_KEY, '{broken json');
		expect(() => readGuest(db)).toThrow('not been overwritten');
		await expect(addGuest(input, snapshot.catalogue, 0, db)).rejects.toThrow(
			'not been overwritten'
		);
		expect(db.values.get(GUEST_STORAGE_KEY)).toBe('{broken json');
		const good = storage();
		const initial = await addGuest(input, snapshot.catalogue, 0, good);
		const blocked = {
			...good,
			setItem: () => {
				throw Error('Quota exceeded');
			}
		};
		await expect(
			updateGuest(initial.items[0], { notes: 'Unsaved' }, initial.revision, blocked)
		).rejects.toThrow('could not be saved');
		expect(readGuest(good).items[0].notes).toBe('');
		expect(() =>
			readGuest({
				...good,
				getItem: () => {
					throw Error('Blocked');
				}
			})
		).toThrow('storage is blocked');
	});
	it('supports multiple component copies and only resets its own guest key', async () => {
		const db = storage();
		db.values.set('other-app', 'untouched');
		const gear = snapshot.catalogue.find((i) => i.name === 'Akstiletto Prime')!;
		let state = await addGuest(
			{ catalogue_id: gear.id, name: gear.name, category: gear.category },
			snapshot.catalogue,
			0,
			db
		);
		const part = snapshot.primes.equipment.akstilettoprime.parts.find((p) => p.count === 2)!;
		state = await setGuestComponent(
			state.items[0],
			part.name,
			2,
			snapshot.primes,
			state.revision,
			db
		);
		expect(state.items[0].parts[part.name]).toBe(2);
		expect(() =>
			setGuestComponent(state.items[0], part.name, 3, snapshot.primes, state.revision, db)
		).toThrow('invalid');
		expect((await resetGuest(state.revision, db)).items).toEqual([]);
		expect(db.values.get('other-app')).toBe('untouched');
	});
});
