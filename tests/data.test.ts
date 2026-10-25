import { describe, it, expect } from 'vitest';
import snapshot from '../src/lib/data/snapshot.json';
// The refresh command uses this same validator before touching the last good file.
import { validateData } from '../scripts/refresh-data.mjs';
describe('catalogue and relic snapshot', () => {
	it('has stable unique identifiers and companion mastery equipment', () => {
		expect(validateData(snapshot)).toBe(snapshot);
		expect(new Set(snapshot.catalogue.map((i) => i.id)).size).toBe(snapshot.catalogue.length);
		expect(snapshot.catalogue.filter((i) => i.category === 'Companions').length).toBeGreaterThan(
			20
		);
	});
	it('includes Amp mastery prisms without counting scaffolds or braces and separates vehicle categories', () => {
		const amps = snapshot.catalogue.filter((i) => i.category === 'Amps');
		expect(amps).toHaveLength(9);
		expect(amps.some((i) => i.name === 'Mote Prism')).toBe(true);
		expect(amps.some((i) => i.name === 'Sirocco')).toBe(true);
		expect(amps.some((i) => /Brace|Scaffold/.test(i.name))).toBe(false);
		expect(snapshot.catalogue.find((i) => i.name === 'Voidrig')?.category).toBe('Necramechs');
		expect(snapshot.catalogue.find((i) => i.name === 'Bad Baby')?.category).toBe('K-Drives');
	});
	it('retains multiple copies and distinguishes opening probabilities from mission drops', () => {
		const ak = snapshot.primes.equipment.akstilettoprime;
		expect(ak.parts.find((p) => p.name === 'Akstiletto Prime Barrel')?.count).toBe(2);
		expect(ak.parts.find((p) => p.name === 'Akstiletto Prime Receiver')?.count).toBe(2);
		const rewards = Object.values(snapshot.primes.equipment).flatMap((i) =>
			i.parts.flatMap((p) => p.relics)
		);
		expect(rewards.some((r) => r.chances.Intact === 2 && r.chances.Radiant === 10)).toBe(true);
		expect(
			Object.values(snapshot.primes.farms)
				.flat()
				.every((f) => f.chance >= 0 && f.chance <= 100)
		).toBe(true);
		expect(snapshot.primes.modified).toBeGreaterThan(0);
		expect(snapshot.primes.sources).toHaveLength(3);
	});
	it('rejects broken data before replacement', () => {
		expect(() => validateData({ ...snapshot, catalogue: [] })).toThrow('Incomplete catalogue');
		expect(() =>
			validateData({ ...snapshot, catalogue: [...snapshot.catalogue, snapshot.catalogue[0]] })
		).toThrow('Duplicate');
		const bad = structuredClone(snapshot);
		bad.primes.equipment.citrineprime.parts[0].count = 0;
		expect(() => validateData(bad)).toThrow('Invalid component');
	});
});
