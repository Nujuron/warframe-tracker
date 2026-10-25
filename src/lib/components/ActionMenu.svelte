<script lang="ts">
	import type { Snippet } from 'svelte';
	let { label, children }: { label: string; children: Snippet } = $props();
	let menu: HTMLDetailsElement;
</script>

<svelte:window
	onclick={(event) => {
		if (
			menu?.open &&
			menu.contains(event.target as Node) &&
			(event.target as HTMLElement).closest('button, a')
		)
			menu.open = false;
	}}
	onkeydown={(event) => {
		if (event.key === 'Escape' && menu?.open && menu.contains(event.target as Node)) {
			menu.open = false;
			menu.querySelector('summary')?.focus();
			event.stopPropagation();
		}
	}}
	onpointerdown={(event) => {
		if (menu?.open && !menu.contains(event.target as Node)) menu.open = false;
	}}
/>
<details
	class="actionMenu"
	bind:this={menu}
	ontoggle={() => {
		if (!menu.open) return;
		const panel = menu.querySelector<HTMLElement>('.menuPanel');
		if (!panel) return;
		panel.style.transform = '';
		const rect = panel.getBoundingClientRect();
		const shift = Math.max(0, 12 - rect.left) - Math.max(0, rect.right - (window.innerWidth - 12));
		panel.style.transform = `translateX(${shift}px)`;
	}}
>
	<summary>{label}</summary>
	<div class="menuPanel">{@render children()}</div>
</details>
