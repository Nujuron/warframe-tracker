<script lang="ts">
	import type { PageData } from './$types';
	import { api } from '$lib/client';
	import { addGuest, readGuest } from '$lib/guest';
	import PrimeDetails from '$lib/components/PrimeDetails.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { onMount } from 'svelte';
	let ready = $state(false);
	onMount(() => {
		ready = true;
	});
	let { data }: { data: PageData } = $props();
	let pending = $state(''),
		message = $state(''),
		failed = $state(false);
	async function add(item: PageData['items'][number]) {
		pending = item.id;
		failed = false;
		try {
			const input = {
				catalogue_id: item.id,
				name: item.name,
				category: item.category
			};
			if (data.user) await api('/api/tracker', 'POST', input);
			else await addGuest(input, [item], readGuest().revision);
			message = `${item.name} is in your ${data.user ? 'tracker' : 'guest tracker on this browser'}. Existing progress was preserved.`;
		} catch (e) {
			message = (e as Error).message;
			failed = true;
		} finally {
			pending = '';
		}
	}
	function pageLink(offset: number) {
		const p = new URLSearchParams({ q: data.q, category: data.category, offset: String(offset) });
		return `/catalogue?${p}`;
	}
</script>

<svelte:head><title>Equipment catalogue · Warframe Tracker</title></svelte:head>
<div class="pagehead">
	<div>
		<h1>Catalogue</h1>
	</div>
	<a href="/tracker">Go to my tracker →</a>
</div>
<form class="controls catalogueControls" method="GET">
	<input
		name="q"
		disabled={!ready}
		type="search"
		aria-label="Search catalogue"
		value={data.q}
		placeholder="Search all equipment…"
	/><select name="category" aria-label="Catalogue category" value={data.category} disabled={!ready}
		><option value="">All categories</option>{#each data.categories as c}<option value={c}
				>{c}</option
			>{/each}</select
	><button class="primary hasIcon" disabled={!ready}><Icon name="search" />Search</button>
</form>
<div class="message" class:error={failed} role="status">{message}</div>
<div class="listhead">
	<span class="meta">{data.total} results</span>
</div>
{#each data.items as item (item.id)}<article class="equipment">
		<div class="catalogueRow">
			<div>
				<div class="itemName">{item.name}</div>
				<div class="meta">
					{item.category} ·
					<a class="hasIcon" href={item.wiki} target="_blank" rel="noreferrer"
						>Wiki<Icon name="external" size={12} /></a
					>
				</div>
			</div>
			<button class="hasIcon" disabled={!ready || !!pending} onclick={() => add(item)}
				><Icon name="plus" />{pending === item.id ? 'Adding…' : 'Add to tracker'}</button
			>
		</div>
		<PrimeDetails name={item.name} snapshot={data.snapshot} />
	</article>{:else}<div class="empty">
		<h2>No equipment matches.</h2>
		<p>Try another name or category.</p>
	</div>{/each}
<nav class="pager" aria-label="Catalogue pages">
	{#if data.offset > 0}<a href={pageLink(Math.max(0, data.offset - 50))}>← Previous</a
		>{/if}{#if data.nextOffset !== null}<a href={pageLink(data.nextOffset)}>Next →</a>{/if}
</nav>
