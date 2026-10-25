import { z } from 'zod';
export const partsSchema = z
	.record(z.string().min(1).max(200), z.number().int().min(0).max(99))
	.refine((v) => Object.keys(v).length <= 100, 'Too many components');
export const equipmentSchema = z.object({
	catalogue_id: z.string().min(1).max(400).nullable().optional(),
	name: z.string().trim().min(1).max(160),
	category: z.string().trim().min(1).max(80),
	status: z.enum(['missing', 'building', 'owned', 'mastered']).optional(),
	priority: z.boolean().optional(),
	notes: z.string().max(10000).optional(),
	parts: partsSchema.optional(),
	rank: z.string().max(80).optional()
});
export const patchSchema = equipmentSchema.omit({ catalogue_id: true }).partial();
export const normalize = (s: string) =>
	s.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
export const identityKey = (name: string, category: string, catalogueId?: string | null) =>
	catalogueId ? `catalogue:${catalogueId}` : `custom:${normalize(category)}:${normalize(name)}`;
export function safePath(path: unknown, fallback = '/tracker'): string {
	return typeof path === 'string' &&
		path.startsWith('/') &&
		!path.startsWith('//') &&
		!/[\\\r\n]/.test(path)
		? path
		: fallback;
}
export class ServiceError extends Error {
	constructor(
		public code: string,
		message: string,
		public status = 400
	) {
		super(message);
	}
}
