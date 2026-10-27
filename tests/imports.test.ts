import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseImport, previewImport, exportEquipment } from '../src/lib/imports';
import snapshot from '../src/lib/data/snapshot.json';
import type { CatalogueItem } from '../src/lib/types';
const catalogue = snapshot.catalogue as CatalogueItem[];
describe('migration and imports', () => {
	it('matches a Corufell Prime melee checklist to its verified catalogue identity', () => {
		const preview = previewImport(parseImport('## Melee weapons\n- [ ] Corufell Prime'), catalogue);
		expect(preview.entries[0].match).toBe('matched');
		expect(preview.entries[0].item.catalogue_id).toBe(
			'/Lotus/Weapons/Tenno/Archwing/Melee/PrimeCorufell/PrimeCorufellScytheWeapon'
		);
	});
	it('preserves stable identities for renamed and retired catalogue entries', () => {
		const source = catalogue.find((c) => c.name === 'Atlas')!;
		const preview = previewImport(
			[{ catalogue_id: source.id, name: 'Old Atlas name', category: 'Warframes' }],
			[{ ...source, retired: true }]
		);
		expect(preview.entries[0].item.catalogue_id).toBe(source.id);
		expect(preview.entries[0].item.name).toBe('Atlas');
	});
	it('migrates every entry in the original 289-item export without duplicate equipment', () => {
		const rows = parseImport(readFileSync('tests/fixtures/original-289.json', 'utf8'));
		expect(rows).toHaveLength(289);
		const preview = previewImport([...rows, ...rows], catalogue);
		expect(preview.entries).toHaveLength(289);
		expect(preview.duplicates).toBe(289);
		expect(preview.entries.some((e) => e.item.category === 'Companions')).toBe(true);
		expect(
			preview.entries
				.filter((e) => e.match !== 'matched')
				.every((e) => e.item.catalogue_id === null)
		).toBe(true);
	});
	it('preserves statuses, priority, notes, rank and multi-copy component quantities through export/import', () => {
		const items: Parameters<typeof exportEquipment>[0] = [
			{
				id: 'one',
				name: 'Akstiletto Prime',
				category: 'Secondary weapons',
				rank: '17',
				status: 'owned',
				priority: true,
				notes: 'Keep both barrels',
				parts: { 'Akstiletto Prime Barrel': 2 }
			},
			{
				id: 'two',
				name: 'My custom item',
				category: 'Other',
				rank: '',
				status: 'mastered',
				priority: false,
				notes: 'personal',
				parts: {}
			}
		];
		const rows = parseImport(JSON.stringify(exportEquipment(items)));
		expect(rows.map(({ catalogue_id, ...i }) => i)).toEqual(items.map(({ id, ...i }) => i));
	});
	it('only retains entries present in legacy v1 progress', () => {
		expect(
			parseImport(
				JSON.stringify({
					format: 'warframe-mastery-v1',
					progress: { 'Warframes:Atlas': { status: 'mastered', notes: 'done', priority: true } }
				})
			)
		).toEqual([
			{ name: 'Atlas', category: 'Warframes', status: 'mastered', notes: 'done', priority: true }
		]);
	});
	it('matches within category; ambiguous and unknown names stay custom', () => {
		const atlas = catalogue.find((c) => c.name === 'Atlas')!;
		const preview = previewImport(
			[
				{ name: ' atlas ', category: 'Warframes' },
				{ name: 'Atlas', category: 'Melee weapons' },
				{ name: 'Atlas', category: 'Other' }
			],
			[
				atlas,
				{ ...atlas, id: 'other', category: 'Other' },
				{ ...atlas, id: 'third', category: 'Other' }
			]
		);
		expect(preview.entries.map((e) => e.match)).toEqual(['matched', 'custom', 'ambiguous']);
		expect(preview.entries[1].item.catalogue_id).toBeNull();
		expect(preview.entries[2].item.catalogue_id).toBeNull();
	});
	it('reads category checklists and ignores prose in a checklist file', () => {
		expect(
			parseImport(
				'# My equipment\nSome explanation\n## Warframes (2)\n- [x] Atlas\n- [ ] Citrine — Rank 3'
			)
		).toEqual([
			{ name: 'Atlas', category: 'Warframes', rank: '', status: 'mastered' },
			{ name: 'Citrine', category: 'Warframes', rank: 'Rank 3' }
		]);
	});
	it('rejects malformed, excessive and invalid inputs', () => {
		for (const s of [
			'{',
			'{}',
			'',
			JSON.stringify([{ name: 'Atlas', category: 'Warframes', status: 'cheated' }]),
			'x'.repeat(2000001)
		])
			expect(() => parseImport(s)).toThrow();
	});
});
