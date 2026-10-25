<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';
	let { form }: { form: ActionData } = $props();
</script>

<section class="auth">
	<h1>Set a new password</h1>
	<form class="stack" method="POST" use:enhance>
		<label
			>New password<input
				name="password"
				type="password"
				minlength="8"
				autocomplete="new-password"
				required
			/></label
		><label
			>Confirm new password<input
				name="confirm"
				type="password"
				minlength="8"
				autocomplete="new-password"
				required
			/></label
		><button class="primary">Update password</button>
	</form>
	{#if form?.error}<p class="message error" role="alert">{form.error}</p>{/if}{#if form?.message}<p
			class="message"
			role="status"
		>
			{form.message}
		</p>
		<a href="/tracker">Return to tracker →</a>{/if}
</section>
