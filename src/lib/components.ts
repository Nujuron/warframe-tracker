import type { Prime, TrackedItem } from './types';

export function componentPatch(
	item: TrackedItem,
	recipe: Prime | undefined,
	part: string,
	count: number
) {
	const parts = { ...item.parts, [part]: count };
	const completed =
		item.catalogue_id &&
		item.status === 'missing' &&
		count > (item.parts[part] || 0) &&
		recipe?.parts.length &&
		recipe.parts.some((p) => (item.parts[p.name] || 0) < p.count) &&
		recipe.parts.every((p) => (parts[p.name] || 0) >= p.count);
	return { parts, ...(completed ? { status: 'building' as const } : {}) };
}
