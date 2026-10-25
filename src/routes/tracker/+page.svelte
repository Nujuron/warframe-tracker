<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { api } from '$lib/client';
	import { exportEquipment } from '$lib/imports';
	import {
		addGuest,
		emptyGuest,
		GUEST_STORAGE_KEY,
		readGuest,
		resetGuest,
		setGuestComponent,
		updateGuest
	} from '$lib/guest';
	import type { TrackedItem } from '$lib/types';
	import type { PageData } from './$types';
	import EquipmentCard from '$lib/components/EquipmentCard.svelte';
	import ImportPanel from '$lib/components/ImportPanel.svelte';
	import FarmFocus from '$lib/components/FarmFocus.svelte';
	import ActionMenu from '$lib/components/ActionMenu.svelte';
	let { data }: { data: PageData } = $props();
	let ready = $state(false);
	let guestState = $state(emptyGuest());
	let items = $derived(data.user ? data.items : guestState.items);
	let revision = $derived(data.user ? data.revision : guestState.revision);
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
	let categories = $derived([...new Set(items.map((i) => i.category))].sort());
	let farmView = $derived(page.url.searchParams.get('view') === 'farm');
	let focusCount = $derived(items.filter((i) => i.priority && i.status !== 'mastered').length);
	let mastered = $derived(items.filter((i) => i.status === 'mastered').length);
	let owned = $derived(items.filter((i) => ['building', 'owned'].includes(i.status)).length);
	let filtered = $derived(
		items
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
		if (data.user) await invalidateAll();
		else guestState = readGuest();
	}
	async function mutate(fn: () => Promise<unknown>, success = 'Saved.') {
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
		void mutate(() =>
			data.user
				? api(`/api/tracker/${item.id}`, 'PATCH', { revision: item.revision, patch })
				: updateGuest(item, patch, revision)
		);
	}
	function component(item: TrackedItem, part: string, count: number) {
		void mutate(() =>
			data.user
				? api(`/api/tracker/${item.id}/component`, 'POST', { revision: item.revision, part, count })
				: setGuestComponent(item, part, count, data.snapshot, revision)
		);
	}
	function backup() {
		const b = new Blob([JSON.stringify(exportEquipment(items), null, 2)], {
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
				`Start with an empty tracker? Export a backup first to keep this list and its progress. Only ${data.user ? 'your account' : 'this browser’s guest tracker'} is affected.`
			)
		)
			void mutate(
				() => (data.user ? api('/api/tracker', 'DELETE', { revision }) : resetGuest(revision)),
				'Your tracker is now empty.'
			);
	}
	async function add(e: SubmitEvent) {
		e.preventDefault();
		await mutate(
			() =>
				data.user
					? api('/api/tracker', 'POST', { name, category: customCategory })
					: addGuest({ name, category: customCategory }, data.catalogue, revision),
			'Custom equipment added.'
		);
		if (!errorMessage) {
			name = '';
			addOpen = false;
		}
	}
	onMount(() => {
		ready = true;
		if (!data.user) {
			try {
				guestState = readGuest();
			} catch (e) {
				message = (e as Error).message;
				errorMessage = true;
			}
		}
		let refreshing = false;
		const focus = async () => {
			if (pending || refreshing) return;
			refreshing = true;
			try {
				const fresh = data.user ? await api<{ revision: number }>('/api/tracker') : readGuest();
				if (
					fresh.revision !== revision &&
					(importOpen || document.activeElement?.matches('textarea'))
				) {
					message =
						'Your list changed elsewhere. Finish your edit, then refresh to review the latest progress.';
					errorMessage = true;
				} else {
					await reload();
				}
			} catch {
				message = data.user
					? 'Could not refresh your cloud data. Please try again.'
					: 'Could not read guest progress from browser storage. Please try again.';
				errorMessage = true;
			} finally {
				refreshing = false;
			}
		};
		window.addEventListener('focus', focus);
		const storage = (e: StorageEvent) => {
			if (!data.user && (e.key === GUEST_STORAGE_KEY || e.key === null)) void focus();
		};
		window.addEventListener('storage', storage);
		return () => {
			window.removeEventListener('focus', focus);
			window.removeEventListener('storage', storage);
		};
	});
</script>

<svelte:head><title>My tracker · Warframe Tracker</title></svelte:head>
<h1 class="srOnly">{farmView ? 'Farm focus' : 'My equipment'}</h1>
<div class="trackerHeader">
	<nav class="trackerViews" aria-label="Tracker views">
		<a href="/tracker" aria-current={!farmView ? 'page' : undefined}>My equipment</a>
		<a href="/tracker?view=farm" aria-current={farmView ? 'page' : undefined}
			>Farm focus <span>{focusCount}</span></a
		>
	</nav>
	<div class="actions">
		{#if farmView}<a class="buttonLink" href="/tracker">Choose equipment</a>{:else}
			<a class="buttonLink primary" href="/catalogue">Add from catalogue</a>
			<button onclick={() => (importOpen = !importOpen)} disabled={!ready}>Load equipment</button
			>{/if}
		<ActionMenu label="More"
			><button onclick={() => (addOpen = !addOpen)} disabled={!ready}>Add custom</button><button
				onclick={backup}
				disabled={!ready || !items.length}>Export backup</button
			><button class="danger" onclick={reset} disabled={!ready || pending || !items.length}
				>Start empty</button
			>
		</ActionMenu>
	</div>
</div>
{#if !data.user}<aside class="guestNotice" aria-label="Guest mode">
		<strong>Guest mode · saved on this browser</strong>
		<a href="/login?next=/tracker">Sign in for sync</a>
		<details class="dataInfo">
			<summary>Details</summary>
			<p>
				No login needed. Equipment, notes, priorities and components stay in this browser’s local
				storage. No cross-device sync or MCP access. Clearing site data or using a private window
				can remove your progress, so keep an exported backup.
			</p>
			<p>Guest progress stays separate; use export/import to move it into an account.</p>
		</details>
	</aside>{/if}
{#if importOpen}<ImportPanel
		guest={!data.user ? { catalogue: data.catalogue, revision } : undefined}
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
<div class="message trackerMessage" class:error={errorMessage} role="status" aria-live="polite">
	{message}{#if errorMessage}
		<button
			class="subtle"
			onclick={() => mutate(reload, 'Data refreshed. Review your changes before trying again.')}
			>Refresh data</button
		>{/if}
</div>
{#if !farmView}<section class="metrics trackerMetrics" aria-label="Your mastery progress">
		<div class="metric">
			<strong>{items.length - mastered}</strong><span>Still to master</span>
		</div>
		<div class="metric"><strong>{mastered}</strong><span>Mastered</span></div>
		<div class="metric"><strong>{owned}</strong><span>Owned or building</span></div>
		<div class="metric">
			<strong>{items.length ? Math.round((mastered / items.length) * 100) : 0}%</strong><progress
				value={mastered}
				max={items.length || 1}
			></progress><br /><span>Mastery progress</span>
		</div>
	</section>{/if}
{#if farmView}
	<FarmFocus
		{items}
		snapshot={data.snapshot}
		pending={!ready || pending}
		onupdate={update}
		oncomponent={component}
	/>
{:else}
	<div class="workspace">
		<nav class="categories" aria-label="Equipment categories">
			<button class:active={!category} onclick={() => (category = '')}
				>All equipment <small>{items.length}</small></button
			>{#each categories as c}<button class:active={category === c} onclick={() => (category = c)}
					>{c}<small>{items.filter((i) => i.category === c).length}</small></button
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
				<h2 class="srOnly">{category || 'All equipment'}</h2>
				<span class="meta">{filtered.length} items</span>
			</div>
			{#each filtered as item (item.id)}<EquipmentCard
					{item}
					snapshot={data.snapshot}
					pending={!ready || pending}
					onupdate={update}
					oncomponent={component}
				/>{:else}<div class="empty">
					{#if items.length}<h2>No matching equipment.</h2>
						<p>Try a different search or status filter.</p>{:else}<h2>Your list starts here.</h2>
						<p>
							{data.user
								? 'Add equipment from the catalogue or import your existing list. Every account starts empty.'
								: 'Add equipment from the catalogue or import a list. Guest progress saves on this browser.'}
						</p>
						<a href="/catalogue">Browse equipment →</a>{/if}
				</div>{/each}
		</section>
	</div>
{/if}
