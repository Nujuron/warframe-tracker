import type { Prime, TrackedItem } from './types';

export function componentPatch(
	item: TrackedItem,
	recipe: Prime | undefined,
	part: string,
	count: number
) {
	const parts = { ...item.parts, [part]: count };
	return completedPartsPatch(item, recipe, parts);
}

export function allComponentsPatch(item: TrackedItem, recipe: Prime) {
	const parts = {
		...item.parts,
		...Object.fromEntries(recipe.parts.map((part) => [part.name, part.count]))
	};
	return completedPartsPatch(item, recipe, parts);
}

function completedPartsPatch(
	item: TrackedItem,
	recipe: Prime | undefined,
	parts: Record<string, number>
) {
	const completed =
		item.catalogue_id &&
		item.status === 'missing' &&
		recipe?.parts.length &&
		recipe.parts.some((p) => (item.parts[p.name] || 0) < p.count) &&
		recipe.parts.every((p) => (parts[p.name] || 0) >= p.count);
	return { parts, ...(completed ? { status: 'building' as const } : {}) };
}
