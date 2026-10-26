import { describe, expect, it } from 'vitest';
import { componentPatch, allComponentsPatch } from '../src/lib/components';
import type { Prime, TrackedItem } from '../src/lib/types';
const recipe: Prime = {
	name: 'Example Prime',
	vaulted: null,
	wiki: '',
	parts: [
		{ name: 'Blueprint', count: 1, relics: [] },
		{ name: 'Blade', count: 2, relics: [] }
	]
};
const item = {
	catalogue_id: 'example',
	status: 'missing',
	parts: { Blueprint: 1 }
} as unknown as TrackedItem;
describe('collecting the final component', () => {
	it('collects the whole recipe including repeated copies in a single patch', () => {
		expect(allComponentsPatch(item, recipe)).toEqual({
			parts: { Blueprint: 1, Blade: 2 },
			status: 'building'
		});
		expect(allComponentsPatch({ ...item, status: 'owned' }, recipe).status).toBeUndefined();
	});
	it('waits for every required copy and changes parts and status together', () => {
		const first = componentPatch(item, recipe, 'Blade', 1);
		expect(first).toEqual({ parts: { Blueprint: 1, Blade: 1 } });
		const last = componentPatch({ ...item, ...first }, recipe, 'Blade', 2);
		expect(last).toEqual({ parts: { Blueprint: 1, Blade: 2 }, status: 'building' });
		expect(item.parts).toEqual({ Blueprint: 1 });
	});
	it('preserves later statuses and does not infer completion for unknown or custom equipment', () => {
		for (const status of ['owned', 'mastered', 'building'] as const)
			expect(componentPatch({ ...item, status }, recipe, 'Blade', 2).status).toBeUndefined();
		expect(componentPatch(item, undefined, 'Blade', 2).status).toBeUndefined();
		expect(
			componentPatch({ ...item, catalogue_id: null }, recipe, 'Blade', 2).status
		).toBeUndefined();
	});
	it('does not change status when unchecking a part or repeating an existing quantity', () => {
		const complete = { ...item, parts: { Blueprint: 1, Blade: 2 } };
		expect(componentPatch(complete, recipe, 'Blade', 1).status).toBeUndefined();
		expect(componentPatch(complete, recipe, 'Blade', 2).status).toBeUndefined();
	});
});
