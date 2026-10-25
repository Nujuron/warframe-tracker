<script lang="ts">
	import '$lib/styles/app.css';
	import { page } from '$app/state';
	import type { LayoutData } from './$types';
	import type { Snippet } from 'svelte';
	let { data, children }: { data: LayoutData; children: Snippet } = $props();
</script>

<svelte:head
	><title>Warframe Tracker</title><meta
		name="description"
		content="Your personal Warframe mastery checklist, Prime components, and relic farming references."
	/></svelte:head
>
<header class="sitebar">
	<a href="/tracker" class="brand">Warframe <span style="color:var(--accent)">Tracker</span></a>
	<nav aria-label="Main navigation">
		{#each [['/tracker', 'My tracker'], ['/catalogue', 'Catalogue'], ['/connections', 'Connections'], ['/account', 'Account']] as [href, label]}<a
				{href}
				aria-current={page.url.pathname.startsWith(href) ? 'page' : undefined}>{label}</a
			>{/each}{#if data.user}<form method="POST" action="/auth/logout">
				<button>Sign out</button>
			</form>{:else}<a href="/login">Sign in</a>{/if}
	</nav>
</header>
<main class="shell">
	{#if !data.configured}<aside class="notice">
			<strong>Local preview · connect your Supabase project to save progress</strong>
			<p>
				The catalogue is available to explore. Set the tracker project URL and publishable key in <code
					>.env</code
				>, then apply the migration and publish the snapshot. Account data is never simulated.
			</p>
		</aside>{/if}{@render children()}
	<footer>
		Independent fan project. Not affiliated with Digital Extremes. Equipment and progress belong to
		your signed-in account. Relic references are dated snapshots; availability may change. <a
			href="/catalogue">Browse the catalogue</a
		>
		· <a href="/connections">Connect an assistant</a>
		· <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a>
	</footer>
</main>
