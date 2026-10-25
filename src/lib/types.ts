export const STATUSES = ['missing', 'building', 'owned', 'mastered'] as const;
export type Status = (typeof STATUSES)[number];
export type CatalogueItem = {
	id: string;
	name: string;
	category: string;
	isPrime: boolean;
	wiki: string;
	retired?: boolean;
};
export type TrackedItem = {
	id: string;
	user_id: string;
	identity_key: string;
	catalogue_id: string | null;
	name: string;
	category: string;
	status: Status;
	priority: boolean;
	notes: string;
	parts: Record<string, number>;
	rank: string;
	revision: number;
	created_at: string;
	updated_at: string;
};
export type Farm = { planet: string; node: string; mode: string; rotation: string; chance: number };
export type Relic = { name: string; chances: Record<string, number> };
export type Prime = {
	name: string;
	vaulted: boolean | null;
	wiki: string;
	parts: { name: string; count: number; relics: Relic[] }[];
};
export type Snapshot = {
	retrievedAt: string;
	modified: number;
	generated: number;
	equipment: Record<string, Prime>;
	farms: Record<string, Farm[]>;
	sources: string[];
};
export type EquipmentInput = {
	catalogue_id?: string | null;
	name: string;
	category: string;
	status?: Status;
	priority?: boolean;
	notes?: string;
	parts?: Record<string, number>;
	rank?: string;
};
export type ImportEntry = {
	item: EquipmentInput;
	match: 'matched' | 'custom' | 'ambiguous';
	candidates: CatalogueItem[];
	duplicate?: boolean;
};
export type ImportPreview = { entries: ImportEntry[]; warnings: string[]; duplicates: number };
