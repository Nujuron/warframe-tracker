<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<h1>Your account</h1>
<p>{data.email}</p>
<div class="accountSections">
	<form class="stack" method="POST" action="?/update" use:enhance>
		<label
			>Display name<input
				name="displayName"
				value={data.displayName}
				maxlength="80"
				autocomplete="nickname"
			/></label
		><button class="primary">Save profile</button>
	</form>
	{#if form?.error}<p class="message error" role="alert">{form.error}</p>{/if}{#if form?.message}<p
			class="message"
			role="status"
		>
			{form.message}
		</p>{/if}
	<section>
		<h2>Account access</h2>
		<div class="actions">
			<a href="/account/recover">Change password →</a><a href="/connections">Manage connections →</a
			>
		</div>
	</section>
</div>
