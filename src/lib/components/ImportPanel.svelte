<script lang="ts">
	import { api } from '$lib/client';
	import { previewGuest, applyGuest, type GuestPreview } from '$lib/guest';
	import type { ImportPreview, CatalogueItem } from '$lib/types';
	let {
		onimport,
		onclose,
		guest,
		disabled = false,
		onpending
	}: {
		onimport: () => Promise<void>;
		onclose: () => void;
		guest?: { catalogue: CatalogueItem[]; revision: number };
		disabled?: boolean;
		onpending?: (value: boolean) => void;
	} = $props();
	let text = $state(''),
		category = $state('Warframes'),
		message = $state(''),
		pending = $state(false),
		replace = $state(false);
	let preview = $state<
		(ImportPreview & { previewId: string; expiresAt: string; expectedRevision?: number }) | null
	>(null);
	$effect(() => onpending?.(pending));
	async function file(event: Event) {
		const input = event.target as HTMLInputElement,
			f = input.files?.[0];
		if (!f) return;
		if (f.size > 2_000_000) {
			message = 'File must be smaller than 2 MB.';
			return;
		}
		text = await f.text();
		preview = null;
	}
	async function inspect() {
		if (disabled || pending) return;
		pending = true;
		message = '';
		preview = null;
		try {
			preview = guest
				? previewGuest(text, category, guest.catalogue, guest.revision)
				: await api('/api/import/preview', 'POST', { text, category });
		} catch (e) {
			message = (e as Error).message;
		} finally {
			pending = false;
		}
	}
	async function apply() {
		if (!preview || disabled || pending) return;
		pending = true;
		try {
			const result = guest
				? await applyGuest(preview as GuestPreview, replace)
				: await api<{ added: number; updated: number; preserved: number }>(
						'/api/import/apply',
						'POST',
						{ previewId: preview.previewId, replaceProgress: replace }
					);
			message = `Imported ${result.added} new entries; ${result.updated} updated; ${result.preserved} existing entries preserved.`;
			preview = null;
			text = '';
			await onimport();
		} catch (e) {
			message = (e as Error).message;
		} finally {
			pending = false;
		}
	}
</script>

<section class="panel" aria-label="Import equipment">
	<h2>Load your equipment</h2>
	<p>
		Paste a list, upload a Markdown checklist, or import a tracker JSON backup. Category headings
		such as <code>## Warframes</code> are supported. Review the results before saving.
	</p>
	<div class="controls">
		<label
			>Default category <select bind:value={category}
				>{#each ['Warframes', 'Primary weapons', 'Secondary weapons', 'Melee weapons', 'Archguns', 'Archmelee', 'Amps', 'Robotic companion weapons', 'Companions', 'Other'] as c}<option
						>{c}</option
					>{/each}</select
			></label
		><label
			>Equipment file <input
				type="file"
				accept=".json,.md,.txt,application/json,text/plain,text/markdown"
				onchange={file}
			/></label
		>
	</div>
	<textarea
		aria-label="Equipment list to import"
		bind:value={text}
		oninput={() => (preview = null)}
		placeholder="## Warframes&#10;- [ ] Atlas&#10;- [ ] Citrine"></textarea>
	<div class="actions">
		<button class="primary" disabled={disabled || pending || !text.trim()} onclick={inspect}
			>{pending ? 'Working…' : 'Preview import'}</button
		><button onclick={onclose} disabled={pending}>Close</button>
	</div>
	{#if preview}<h3 style="margin-top:22px">Review {preview.entries.length} equipment entries</h3>
		{#each preview.warnings as warning}<p>{warning}</p>{/each}
		<div class="preview">
			{#each preview.entries as entry}<div class="previewRow">
					<span>{entry.item.name}<small class="meta"> · {entry.item.category}</small></span><span
						>{entry.match === 'matched'
							? 'Catalogue match'
							: entry.match === 'ambiguous'
								? 'Ambiguous · kept as custom'
								: 'Custom entry'}</span
					>
				</div>{/each}
		</div>
		<label class="checklabel"
			><input type="checkbox" bind:checked={replace} /> Replace progress for existing entries using values
			supplied by this file</label
		>
		<p class="meta">
			Unchecked: existing progress is preserved. New items use imported values. Preview expires
			after 15 minutes.
		</p>
		<button class="primary" disabled={disabled || pending} onclick={apply}>Apply import</button
		>{/if}
	<div class="message" role="status">{message}</div>
</section>
