<script lang="ts">
	let { data, form } = $props();
</script>

<svelte:head><title>Connections · Warframe Tracker</title></svelte:head>
<p class="eyebrow">Your tools, your account</p>
<h1>Connections</h1>
<section class="panel">
	<h2>Connect an AI assistant</h2>
	<p>Add a custom MCP connection in your assistant using this address:</p>
	<p><code>{data.endpoint}</code></p>
	<ol>
		<li>Choose an MCP or custom connector in your assistant.</li>
		<li>Paste this address and select OAuth authentication.</li>
		<li>
			Open Advanced OAuth settings and enter the client ID registered for this assistant. Automatic
			client registration is disabled, so the server address alone is not enough.
		</li>
		<li>Sign in to your tracker account and review the access request.</li>
		<li>Ask it to search equipment, update your list or check Prime relics.</li>
	</ol>
	<details>
		<summary>“Enter an OAuth client ID” or authentication failed?</summary>
		<p>
			The tracker owner must register the assistant in Supabase → Authentication → OAuth Apps. Copy
			the exact callback / redirect URL shown by the assistant into that registration, then enter
			its client ID in the assistant. Each assistant may use a different callback URL.
		</p>
		<p>
			A public client uses PKCE with no client secret (token authentication method: none). A
			confidential client also requires its secret. Use the credentials for the MCP client; Google
			sign-in credentials and Supabase API keys do not belong in these fields.
		</p>
	</details>
	<p class="muted">
		Client support varies. The connection can read and edit your tracker. Full-list resets stay on
		this website.
	</p>
</section>
{#if data.message}<p class="error" role="alert">{data.message}</p>{/if}
{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
{#if form?.message}<p class="notice" role="status">{form.message}</p>{/if}
<section class="panel">
	<h2>Connected apps</h2>
	{#if !data.grants.length}<p class="muted">
			No apps connected yet.
		</p>{/if}{#each data.grants as grant}<div class="row">
			<div>
				<strong>{grant.client_id}</strong>
				<p class="muted">
					{grant.revoked_at
						? 'Access revoked'
						: `Approved ${new Date(grant.granted_at).toLocaleDateString('en')}`}
				</p>
			</div>
			<form method="POST" action="?/revoke">
				<input type="hidden" name="client_id" value={grant.client_id} /><button
					>Revoke access</button
				>
			</form>
		</div>{/each}
</section>
