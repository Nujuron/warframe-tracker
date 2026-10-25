<script lang="ts">
	import type { PageData } from './$types';
	import { api } from '$lib/client';
	import PrimeDetails from '$lib/components/PrimeDetails.svelte';
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
			await api('/api/tracker', 'POST', {
				catalogue_id: item.id,
				name: item.name,
				category: item.category
			});
			message = `${item.name} is in your tracker. Existing progress was preserved.`;
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
		<div class="eyebrow">Find your next project</div>
		<h1>Equipment catalogue</h1>
		<p>Browse masterable equipment. Your tracker changes only when you add an item.</p>
	</div>
	<a href="/tracker">Go to my tracker →</a>
</div>
<form class="controls" method="GET">
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
	><button class="primary" disabled={!ready}>Search</button>
</form>
<div class="message" class:error={failed} role="status">{message}</div>
<div class="listhead">
	<h2>{data.category || 'All masterable equipment'}</h2>
	<span class="meta">{data.total} results</span>
</div>
{#each data.items as item (item.id)}<article class="equipment">
		<div class="catalogueRow">
			<div>
				<div class="itemName">{item.name}</div>
				<div class="meta">
					{item.category} · <a href={item.wiki} target="_blank" rel="noreferrer">Wiki ↗</a>
				</div>
			</div>
			{#if data.user}<button disabled={!ready || !!pending} onclick={() => add(item)}
					>{pending === item.id ? 'Adding…' : 'Add to tracker'}</button
				>{:else}<a href="/login?next=/catalogue">Sign in to add</a>{/if}
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
