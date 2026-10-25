<script lang="ts">
	let { data, form } = $props();
</script>

<svelte:head><title>Approve connection · Warframe Tracker</title></svelte:head>
<section class="panel auth">
	<p class="eyebrow">Connected apps</p>
	<h1>Connect {data.clientName || 'an app'}</h1>
	{#if data.message}<p class="notice">{data.message}</p>{:else}
		<p>
			This app will be able to read your private tracker, add equipment, update progress and notes,
			and apply imports. It cannot reset your entire list.
		</p>
		<p>You can revoke access from Connections at any time.</p>
		{#if data.scope}<p class="muted">Requested sign-in scopes: {data.scope}</p>{/if}
		{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
		<form method="POST">
			<input type="hidden" name="authorization_id" value={data.authorizationId} />
			<div class="row">
				<button class="primary" formaction="?/approve">Allow access</button><button
					formaction="?/deny">Deny</button
				>
			</div>
		</form>
	{/if}
</section>
