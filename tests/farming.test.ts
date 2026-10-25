import { describe, it, expect } from 'vitest';
import { farmingPlan } from '../src/lib/farming';
import type { Snapshot, TrackedItem } from '../src/lib/types';

const shared = { name: 'Lith A1', chances: { Intact: 2, Radiant: 10 } };
const snapshot: Snapshot = {
	retrievedAt: '2026-10-25T00:00:00Z',
	modified: 1,
	generated: 1,
	sources: [],
	equipment: {
		alphaprime: {
			name: 'Alpha Prime',
			vaulted: false,
			wiki: '',
			parts: [
				{ name: 'Alpha Prime Barrel', count: 2, relics: [shared, shared] },
				{
					name: 'Alpha Prime Blueprint',
					count: 1,
					relics: [{ name: 'Axi B1', chances: { Intact: 25.33, Radiant: 16.67 } }]
				}
			]
		},
		betaprime: {
			name: 'Beta Prime',
			vaulted: true,
			wiki: '',
			parts: [{ name: 'Beta Prime Blueprint', count: 1, relics: [shared] }]
		}
	},
	farms: {
		'Axi B1': [
			{ planet: 'Void', node: 'Example', mode: 'Capture', rotation: 'Completion', chance: 10 }
		]
	}
};
function item(name: string, patch: Partial<TrackedItem> = {}): TrackedItem {
	return {
		id: name,
		user_id: 'account-a',
		catalogue_id: name,
		identity_key: name,
		name,
		category: 'Primary weapons',
		status: 'missing',
		priority: true,
		notes: '',
		parts: {},
		rank: '',
		revision: 1,
		created_at: '',
		updated_at: '',
		...patch
	};
}

describe('farming focus', () => {
	it('uses saved stars, excludes mastered targets, and keeps unstarred equipment out', () => {
		expect(farmingPlan([], snapshot).targets).toEqual([]);
		const plan = farmingPlan(
			[
				item('Alpha Prime', { priority: false }),
				item('Beta Prime', { status: 'mastered' }),
				item('Normal weapon')
			],
			snapshot
		);
		expect(plan.targets.map((t) => t.item.name)).toEqual(['Normal weapon']);
		expect(plan.targets[0].stage).toBe('farm');
		expect(plan.relics).toEqual([]);
	});
	it('counts remaining copies, removes collected rewards, and deduplicates shared relics', () => {
		const plan = farmingPlan(
			[
				item('Alpha Prime', { parts: { 'Alpha Prime Barrel': 1, 'Alpha Prime Blueprint': 1 } }),
				item('Beta Prime')
			],
			snapshot
		);
		expect(plan.targets[0].needed).toMatchObject([
			{ name: 'Alpha Prime Barrel', owned: 1, missing: 1 }
		]);
		expect(plan.relics).toHaveLength(1);
		expect(plan.relics[0]).toMatchObject({ name: 'Lith A1', targetCount: 2, farms: [] });
		expect(plan.relics[0].rewards).toHaveLength(2);
		expect(plan.relics[0].rewards[0]).toMatchObject({
			missing: 1,
			chances: { Intact: 2, Radiant: 10 }
		});
	});
	it('ranks target coverage first without requiring mission sources or inventing them', () => {
		const plan = farmingPlan([item('Alpha Prime'), item('Beta Prime')], snapshot);
		expect(plan.relics.map((r) => r.name)).toEqual(['Lith A1', 'Axi B1']);
		expect(plan.relics[1].farms[0].chance).toBe(10);
	});
	it('separates components ready, building and levelling without farming their components again', () => {
		const plan = farmingPlan(
			[
				item('Alpha Prime', { parts: { 'Alpha Prime Barrel': 2, 'Alpha Prime Blueprint': 1 } }),
				item('Beta Prime', { status: 'building' }),
				item('Other', { status: 'owned' })
			],
			snapshot
		);
		expect(plan.targets.map((t) => t.stage)).toEqual(['components-ready', 'building', 'level']);
		expect(plan.relics).toEqual([]);
		const restored = farmingPlan(
			[item('Alpha Prime', { parts: { 'Alpha Prime Barrel': 1 } })],
			snapshot
		);
		expect(restored.targets[0].stage).toBe('farm');
	});
	it('does not infer recipes for custom names and keeps missing-data targets actionable', () => {
		const plan = farmingPlan(
			[item('Alpha Prime', { catalogue_id: null }), item('Unknown Prime')],
			snapshot
		);
		expect(plan.targets.every((t) => !t.prime && !t.needed.length && t.stage === 'farm')).toBe(
			true
		);
		expect(plan.relics).toEqual([]);
	});
});
