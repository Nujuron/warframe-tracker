<script lang="ts">
	import type { TrackedItem, Snapshot } from '$lib/types';
	import PrimeDetails from './PrimeDetails.svelte';
	import { missingComponentCount } from '$lib/farming';
	let {
		item,
		snapshot,
		pending,
		showEffort = false,
		saving = false,
		onupdate,
		oncomponent,
		onownall
	}: {
		item: TrackedItem;
		snapshot: Snapshot;
		pending: boolean;
		showEffort?: boolean;
		saving?: boolean;
		onupdate: (item: TrackedItem, patch: unknown) => void;
		oncomponent: (item: TrackedItem, part: string, count: number) => void;
		onownall: (item: TrackedItem) => void;
	} = $props();
	let notesOpen = $state(false);
	let missing = $derived(showEffort ? missingComponentCount(item, snapshot) : null);
</script>

<article class:mastered={item.status === 'mastered'} class="equipment" data-status={item.status}>
	<div class="equipmentTop">
		<button
			class="priority"
			class:active={item.priority}
			disabled={pending}
			aria-label={`${item.priority ? 'Remove priority from' : 'Prioritize'} ${item.name}`}
			aria-pressed={item.priority}
			title={item.priority ? 'Remove from farm focus' : 'Add to farm focus'}
			onclick={() => onupdate(item, { priority: !item.priority })}
			>{item.priority ? '★' : '☆'}</button
		>
		<div>
			<div class="itemName">
				{item.name}{#if saving}<span class="meta itemSaving">Saving…</span>{/if}
			</div>
			<div class="meta itemMeta">
				<span class="itemCategory">{item.category}</span>
				{#if !item.catalogue_id}<span>Custom entry</span>{/if}
				{#if item.rank}<span>Snapshot: {item.rank}</span>{/if}
			</div>
			{#if showEffort}<div class="meta effortCount">
					{missing === null
						? 'No component data'
						: missing === 0
							? item.status === 'missing'
								? 'Parts ready'
								: 'No parts needed'
							: `${missing} ${missing === 1 ? 'part' : 'parts'} missing`}
				</div>{/if}
			<button class="noteToggle" disabled={pending} onclick={() => (notesOpen = !notesOpen)}
				>{item.notes ? 'Edit note' : 'Add note'}</button
			>
		</div>
		<div class="statusControl">
			<select
				value={item.status}
				disabled={pending}
				aria-label={`Status for ${item.name}`}
				onchange={(e) => {
					const status = e.currentTarget.value;
					e.currentTarget.value = item.status;
					onupdate(item, { status });
				}}
				><option value="missing">Missing</option><option value="building">Building</option><option
					value="owned">Owned / levelling</option
				><option value="mastered">Mastered</option></select
			>
		</div>
		<div class="itemLinks">
			<a
				href={`https://wiki.warframe.com/w/${encodeURIComponent(item.name.replaceAll(' ', '_'))}#Acquisition`}
				target="_blank"
				rel="noreferrer">Get item ↗</a
			><a
				href={`https://wiki.warframe.com/w/Special:Search?search=${encodeURIComponent(item.name)}`}
				target="_blank"
				rel="noreferrer">Search</a
			>
		</div>
	</div>
	{#if notesOpen}<textarea
			class="notes"
			aria-label={`Notes for ${item.name}`}
			value={item.notes}
			maxlength="10000"
			disabled={pending}
			placeholder="Parts needed, farming location, next step…"
			onblur={(e) => {
				if (e.currentTarget.value !== item.notes) onupdate(item, { notes: e.currentTarget.value });
			}}></textarea>{/if}<PrimeDetails
		name={item.name}
		snapshot={item.catalogue_id ? snapshot : { ...snapshot, equipment: {} }}
		owned={item.parts}
		disabled={pending}
		onchange={(part, count) => oncomponent(item, part, count)}
		onownall={() => onownall(item)}
	/>
</article>
