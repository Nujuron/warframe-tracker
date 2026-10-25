import type { Farm, Prime, Relic, Snapshot, TrackedItem } from './types';

export type FarmStage = 'farm' | 'components-ready' | 'building' | 'level';
export type NeededPart = Prime['parts'][number] & { owned: number; missing: number };
export type FarmTarget = {
	item: TrackedItem;
	prime?: Prime;
	needed: NeededPart[];
	stage: FarmStage;
};
export type PlannedRelic = {
	name: string;
	rewards: {
		itemId: string;
		itemName: string;
		part: string;
		missing: number;
		chances: Relic['chances'];
	}[];
	targetCount: number;
	farms: Farm[];
};

export function farmingPlan(items: TrackedItem[], snapshot: Snapshot) {
	const targets: FarmTarget[] = items
		.filter((item) => item.priority && item.status !== 'mastered')
		.toSorted((a, b) => a.name.localeCompare(b.name))
		.map((item) => {
			const prime = item.catalogue_id
				? snapshot.equipment[item.name.toLowerCase().replace(/[^a-z0-9]/g, '')]
				: undefined;
			const needed = (prime?.parts || []).flatMap((part) => {
				const owned = Math.max(0, Math.min(part.count, item.parts[part.name] || 0));
				return owned < part.count ? [{ ...part, owned, missing: part.count - owned }] : [];
			});
			const stage: FarmStage =
				item.status === 'building'
					? 'building'
					: item.status === 'owned'
						? 'level'
						: prime?.parts.length && !needed.length
							? 'components-ready'
							: 'farm';
			return { item, prime, needed, stage };
		});
	const relics = new Map<string, PlannedRelic>();
	for (const target of targets.filter((t) => t.stage === 'farm')) {
		for (const part of target.needed) {
			for (const relic of part.relics) {
				let planned = relics.get(relic.name);
				if (!planned) {
					planned = {
						name: relic.name,
						rewards: [],
						targetCount: 0,
						farms: snapshot.farms[relic.name] || []
					};
					relics.set(relic.name, planned);
				}
				// Source data can repeat a reward; one missing component needs one plan entry.
				if (!planned.rewards.some((r) => r.itemId === target.item.id && r.part === part.name)) {
					planned.rewards.push({
						itemId: target.item.id,
						itemName: target.item.name,
						part: part.name,
						missing: part.missing,
						chances: relic.chances
					});
				}
			}
		}
	}
	for (const relic of relics.values())
		relic.targetCount = new Set(relic.rewards.map((r) => r.itemId)).size;
	return {
		targets,
		relics: [...relics.values()].toSorted(
			(a, b) =>
				b.targetCount - a.targetCount ||
				b.rewards.length - a.rewards.length ||
				Number(!!b.farms.length) - Number(!!a.farms.length) ||
				a.name.localeCompare(b.name)
		)
	};
}
