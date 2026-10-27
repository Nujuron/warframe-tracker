<script lang="ts">
	import '$lib/styles/app.css';
	import { page } from '$app/state';
	import type { LayoutData } from './$types';
	import type { Snippet } from 'svelte';
	import ActionMenu from '$lib/components/ActionMenu.svelte';
	import TrackerTour from '$lib/components/TrackerTour.svelte';
	let { data, children }: { data: LayoutData; children: Snippet } = $props();
	let tourOpen = $state(false);
</script>

<svelte:head
	><title>Warframe Tracker</title><meta
		name="description"
		content="Your personal Warframe mastery checklist, Prime components, and relic farming references."
	/></svelte:head
>
<header class="sitebar">
	<a href="/tracker" class="brand">
		<svg class="brandMark" width="30" height="32" viewBox="0 0 30 32" fill="none" aria-hidden="true"
			><path
				d="M15 2 28 9.5v13L15 30 2 22.5v-13L15 2Z"
				stroke="currentColor"
				stroke-width="1.5"
			/><path d="m8 11 7 13 7-13-7 5-7-5Z" fill="currentColor" /></svg
		>
		<span>Warframe <span style="color:var(--accent)">Tracker</span></span>
	</a>
	<nav aria-label="Main navigation">
		{#each [['/tracker', 'My tracker'], ['/catalogue', 'Catalogue'], ['/connections', 'Connections'], ['/account', 'Account']] as [href, label]}<a
				{href}
				aria-current={page.url.pathname.startsWith(href) ? 'page' : undefined}>{label}</a
			>{/each}
		<ActionMenu label="Help"
			><button onclick={() => (tourOpen = true)}>Show tour again</button><a href="/connections"
				>Connect an assistant</a
			><a href="https://wiki.warframe.com" target="_blank" rel="noreferrer">Warframe wiki ↗</a
			></ActionMenu
		>
		{#if data.user}<form method="POST" action="/auth/logout">
				<button>Sign out</button>
			</form>{:else}<a href="/login">Sign in</a>{/if}
	</nav>
</header>
<main class="shell">
	{#if !data.configured}<aside class="notice">
			<strong>Guest mode is available · cloud accounts are not configured</strong>
			<p>
				Use the catalogue and save guest progress on this browser. Sign-in, cross-device saves and
				assistant connections become available when cloud accounts are configured.
			</p>
		</aside>{/if}{@render children()}
	<footer>
		<a href="/privacy">Privacy</a> · <a href="/terms">Terms</a>
		<details class="footerInfo">
			<summary>About &amp; data</summary>
			<p>
				Independent fan project, not affiliated with Digital Extremes. Guest progress stays in this
				browser; accounts sync privately. Relic availability is a dated snapshot. Sources: Digital
				Extremes via WFCD. <a href="/WFCD-LICENSE.txt">Data license</a>.
			</p>
		</details>
	</footer>
</main>
<TrackerTour
	userId={data.user?.id || null}
	seen={data.tourSeen}
	active={page.url.pathname === '/tracker'}
	bind:open={tourOpen}
/>
