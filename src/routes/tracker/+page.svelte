<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import { api } from '$lib/client';
	import { exportEquipment } from '$lib/imports';
	import type { TrackedItem } from '$lib/types';
	import type { PageData } from './$types';
	import EquipmentCard from '$lib/components/EquipmentCard.svelte';
	import ImportPanel from '$lib/components/ImportPanel.svelte';
	let { data }: { data: PageData } = $props();
	let ready = $state(false);
	let query = $state(''),
		category = $state(''),
		filter = $state('unfinished'),
		pending = $state(false),
		message = $state(''),
		errorMessage = $state(false),
		importOpen = $state(false),
		addOpen = $state(false),
		name = $state(''),
		customCategory = $state('Warframes');
	let categories = $derived([...new Set(data.items.map((i) => i.category))].sort());
	let mastered = $derived(data.items.filter((i) => i.status === 'mastered').length);
	let owned = $derived(data.items.filter((i) => ['building', 'owned'].includes(i.status)).length);
	let filtered = $derived(
		data.items
			.filter(
				(i) =>
					(!category || i.category === category) &&
					(!query || (i.name + ' ' + i.notes).toLowerCase().includes(query.toLowerCase())) &&
					(filter === 'all' ||
						(filter === 'unfinished' && i.status !== 'mastered') ||
						(filter === 'priority' && i.priority) ||
						i.status === filter)
			)
			.toSorted((a, b) => Number(b.priority) - Number(a.priority) || a.name.localeCompare(b.name))
	);
	async function reload() {
		await invalidateAll();
	}
	async function mutate(fn: () => Promise<unknown>, success = 'Progress saved to your account.') {
		pending = true;
		message = 'Saving…';
		errorMessage = false;
		try {
			await fn();
			await reload();
			message = success;
		} catch (e) {
			message = (e as Error).message;
			errorMessage = true;
		} finally {
			pending = false;
		}
	}
	function update(item: TrackedItem, patch: unknown) {
		void mutate(() => api(`/api/tracker/${item.id}`, 'PATCH', { revision: item.revision, patch }));
	}
	function component(item: TrackedItem, part: string, count: number) {
		void mutate(() =>
			api(`/api/tracker/${item.id}/component`, 'POST', { revision: item.revision, part, count })
		);
	}
	function backup() {
		const b = new Blob([JSON.stringify(exportEquipment(data.items), null, 2)], {
				type: 'application/json'
			}),
			url = URL.createObjectURL(b),
			a = document.createElement('a');
		a.href = url;
		a.download = `warframe-equipment-${new Date().toISOString().slice(0, 10)}.json`;
		a.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
		message = 'Equipment and progress exported.';
		errorMessage = false;
	}
	function reset() {
		if (
			confirm(
				'Start with an empty tracker? Export a backup first to keep this list and its progress. Only your account is affected.'
			)
		)
			void mutate(
				() => api('/api/tracker', 'DELETE', { revision: data.revision }),
				'Your tracker is now empty.'
			);
	}
	async function add(e: SubmitEvent) {
		e.preventDefault();
		await mutate(
			() => api('/api/tracker', 'POST', { name, category: customCategory }),
			'Custom equipment added.'
		);
		if (!errorMessage) {
			name = '';
			addOpen = false;
		}
	}
	onMount(() => {
		ready = true;
		let refreshing = false;
		const focus = async () => {
			if (!data.user || pending || refreshing) return;
			refreshing = true;
			try {
				const fresh = await api<{ revision: number }>('/api/tracker');
				if (
					fresh.revision !== data.revision &&
					(importOpen || document.activeElement?.matches('textarea'))
				) {
					message =
						'Your list changed elsewhere. Finish your edit, then refresh to review the latest progress.';
					errorMessage = true;
				} else {
					await reload();
				}
			} catch {
				message = 'Could not refresh your cloud data. Please try again.';
				errorMessage = true;
			} finally {
				refreshing = false;
			}
		};
		window.addEventListener('focus', focus);
		return () => window.removeEventListener('focus', focus);
	});
</script>

<svelte:head><title>My tracker · Warframe Tracker</title></svelte:head>
<div class="pagehead">
	<div>
		<div class="eyebrow">Your personal arsenal</div>
		<h1>Make room for your next mastery.</h1>
		<p>Your equipment, components, and next steps—in one place.</p>
	</div>
	<div class="actions">
		<button onclick={() => (importOpen = !importOpen)} disabled={!ready || !data.user}
			>Load equipment</button
		><a href="/catalogue">Add from catalogue</a><button
			onclick={() => (addOpen = !addOpen)}
			disabled={!ready || !data.user}>Add custom</button
		><button onclick={backup} disabled={!ready || !data.items.length}>Export backup</button><button
			class="danger"
			onclick={reset}
			disabled={!ready || pending || !data.items.length}>Start empty</button
		>
	</div>
</div>
{#if importOpen}<ImportPanel
		onimport={reload}
		onclose={() => (importOpen = false)}
	/>{/if}{#if addOpen}<section class="panel">
		<h2>Add custom equipment</h2>
		<p>For equipment not found in the catalogue. Relic mappings won’t be assumed.</p>
		<form class="controls" onsubmit={add}>
			<input
				aria-label="Equipment name"
				bind:value={name}
				placeholder="Equipment name"
				required
				maxlength="160"
			/><input
				aria-label="Equipment category"
				bind:value={customCategory}
				required
				maxlength="80"
			/><button class="primary" disabled={!ready || pending}>Add equipment</button>
		</form>
	</section>{/if}
<div class="message" class:error={errorMessage} role="status" aria-live="polite">
	{message}{#if errorMessage}
		<button
			class="subtle"
			onclick={() =>
				mutate(reload, 'Cloud data refreshed. Review your changes before trying again.')}
			>Refresh data</button
		>{/if}
</div>
<section class="metrics" aria-label="Your mastery progress">
	<div class="metric">
		<strong>{data.items.length - mastered}</strong><span>Still to master</span>
	</div>
	<div class="metric"><strong>{mastered}</strong><span>Mastered on your list</span></div>
	<div class="metric"><strong>{owned}</strong><span>Owned or building</span></div>
	<div class="metric">
		<strong>{data.items.length ? Math.round((mastered / data.items.length) * 100) : 0}%</strong
		><progress value={mastered} max={data.items.length || 1}></progress><br /><span
			>Progress through your equipment list</span
		>
	</div>
</section>
<div class="workspace">
	<nav class="categories" aria-label="Equipment categories">
		<button class:active={!category} onclick={() => (category = '')}
			>All equipment <small>{data.items.length}</small></button
		>{#each categories as c}<button class:active={category === c} onclick={() => (category = c)}
				>{c}<small>{data.items.filter((i) => i.category === c).length}</small></button
			>{/each}
	</nav>
	<section>
		<div class="controls">
			<input
				type="search"
				aria-label="Search equipment or notes"
				bind:value={query}
				placeholder="Search equipment or notes…"
			/><select aria-label="Filter progress" bind:value={filter}
				><option value="unfinished">Unfinished</option><option value="all">All statuses</option
				><option value="missing">Missing</option><option value="building">Building</option><option
					value="owned">Owned / levelling</option
				><option value="mastered">Mastered</option><option value="priority">Priorities</option
				></select
			>
		</div>
		<div class="listhead">
			<h2>{category || 'All equipment'}</h2>
			<span class="meta">{filtered.length} items</span>
		</div>
		{#each filtered as item (item.id)}<EquipmentCard
				{item}
				snapshot={data.snapshot}
				pending={!ready || pending}
				onupdate={update}
				oncomponent={component}
			/>{:else}<div class="empty">
				{#if data.items.length}<h2>No matching equipment.</h2>
					<p>Try a different search or status filter.</p>{:else}<h2>Your list starts here.</h2>
					<p>
						{data.user
							? 'Add equipment from the catalogue or import your existing list. Every account starts empty.'
							: 'Browse the catalogue, then sign in to create your private tracker.'}
					</p>
					<a href={data.user ? '/catalogue' : '/login'}
						>{data.user ? 'Browse equipment →' : 'Sign in or create an account →'}</a
					>{/if}
			</div>{/each}
	</section>
</div>
