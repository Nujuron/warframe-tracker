<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
	let signup = $derived(data.mode === 'signup');
	let recovering = $derived(data.mode === 'recover');
	function modeLink(mode: string) {
		return '/login?' + new URLSearchParams({ mode, next: data.next });
	}
</script>

<svelte:head><title>Sign in · Warframe Tracker</title></svelte:head>
<section class="auth">
	<div class="eyebrow">Your arsenal, wherever you are</div>
	<h1>{recovering ? 'Reset your password' : signup ? 'Create your account' : 'Welcome back.'}</h1>
	<p>Save your own equipment list and component progress privately across devices.</p>
	{#if data.authError}<p class="message error">{data.authError}</p>{/if}{#if form?.error}<p
			class="message error"
			role="alert"
		>
			{form.error}
		</p>{/if}{#if form?.message}<p class="message" role="status">{form.message}</p>{/if}
	<form
		class="stack"
		method="POST"
		action={recovering ? '?/recover' : signup ? '?/signup' : '?/signin'}
		use:enhance
	>
		<input type="hidden" name="next" value={data.next} />{#if signup && !recovering}<label
				>Display name<input name="displayName" autocomplete="nickname" maxlength="80" /></label
			>{/if}<label>Email<input name="email" type="email" autocomplete="email" required /></label
		>{#if !recovering}<label
				>Password<input
					name="password"
					type="password"
					minlength={signup ? 8 : undefined}
					autocomplete={signup ? 'new-password' : 'current-password'}
					required
				/></label
			>{/if}<button class="primary" disabled={!data.configured}
			>{recovering ? 'Send recovery email' : signup ? 'Create account' : 'Sign in'}</button
		>
	</form>
	{#if data.googleEnabled && !recovering}<form
			method="POST"
			action="?/google"
			use:enhance
			style="margin-top:14px"
		>
			<input type="hidden" name="next" value={data.next} /><button style="width:100%"
				>Continue with Google</button
			>
		</form>{/if}
	<div class="actions" style="margin-top:22px">
		<a href={modeLink(signup ? 'signin' : 'signup')}
			>{signup ? 'Already have an account? Sign in' : 'Create an account'}</a
		><a href={modeLink(recovering ? 'signin' : 'recover')}
			>{recovering ? 'Back to sign in' : 'Forgot password?'}</a
		>
	</div>
</section>
