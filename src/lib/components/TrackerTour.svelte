<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { api } from '$lib/client';
	let {
		userId,
		seen,
		active,
		open = $bindable(false)
	}: {
		userId: string | null;
		seen: boolean;
		active: boolean;
		open?: boolean;
	} = $props();
	let dialog: HTMLDialogElement;
	let step = $state(0),
		checkedId = $state<string | null>(null),
		saveError = $state(''),
		saving = $state(false);
	const steps = [
		{
			title: 'Add your equipment',
			text: 'Add items from the catalogue, or use Load equipment to import a list. Review imports before saving.',
			preview: ['Add from catalogue', 'Load equipment']
		},
		{
			title: 'Choose what to farm',
			text: 'Star equipment to put it in Farm focus. Open that tab for missing parts and shared relics.',
			preview: ['☆ → ★', 'Farm focus']
		},
		{
			title: 'Track what you collect',
			text: 'The last Prime part sets Building automatically. Update Owned or Mastered as you progress. Mastered targets leave Farm focus automatically.',
			preview: ['+1 owned', 'Building → Owned → Mastered']
		}
	];
	$effect(() => {
		if (!active) {
			open = false;
			return;
		}
		const identity = userId || 'guest';
		if (checkedId === identity) return;
		checkedId = identity;
		let localSeen = false;
		try {
			localSeen = localStorage.getItem(`tracker-tour-v1:${identity}`) === 'done';
		} catch {
			/* Storage may be disabled. */
		}
		if (!seen && !localSeen) open = true;
	});
	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) {
			step = 0;
			dialog.showModal();
		} else if (!open && dialog.open) dialog.close();
	});
	async function savePreference() {
		if (!userId) return;
		saving = true;
		try {
			await api('/api/account/tour', 'POST', { version: 1 });
			saveError = '';
			await invalidateAll();
		} catch {
			saveError = 'Tour dismissed here. Could not save this preference across devices.';
		} finally {
			saving = false;
		}
	}
	function dismiss() {
		open = false;
		try {
			localStorage.setItem(`tracker-tour-v1:${userId || 'guest'}`, 'done');
		} catch {
			/* Current tab still remembers dismissal. */
		}
		if (userId && !seen) void savePreference();
	}
</script>

<dialog
	bind:this={dialog}
	class="tourDialog"
	aria-label="Tracker tour"
	aria-describedby="tour-description"
	oncancel={(event) => {
		event.preventDefault();
		dismiss();
	}}
>
	<div class="tourTop">
		<span class="meta">{step + 1} of {steps.length}</span><button class="subtle" onclick={dismiss}
			>Skip tour</button
		>
	</div>
	<div class="tourPreview" aria-hidden="true">
		{#each steps[step].preview as label}<span>{label}</span>{/each}
	</div>
	<div aria-live="polite">
		<h2>{steps[step].title}</h2>
		<p id="tour-description">{steps[step].text}</p>
	</div>
	<div class="tourActions">
		<button class="subtle" disabled={step === 0} onclick={() => step--}>Back</button>
		<div class="tourDots" aria-hidden="true">
			{#each steps as _, index}<span class:active={index === step}></span>{/each}
		</div>
		{#if step < steps.length - 1}<button class="primary" onclick={() => step++}>Next</button
			>{:else}<button class="primary" onclick={dismiss}>Done</button>{/if}
	</div>
</dialog>
{#if saveError}<aside class="tourSaveNotice" role="alert">
		<span>{saveError}</span><button disabled={saving} onclick={savePreference}>Retry</button><button
			class="subtle"
			aria-label="Dismiss tour preference message"
			onclick={() => (saveError = '')}>×</button
		>
	</aside>{/if}
