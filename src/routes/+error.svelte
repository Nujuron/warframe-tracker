<script lang="ts">
	import { page } from '$app/state';
</script>

<div class="errorPage">
	<div class="eyebrow">Request interrupted · {page.status}</div>
	<h1>We couldn’t load this page.</h1>
	<p>{page.error?.message || 'Please try again.'}</p>
	<a href="/tracker">Return to your tracker</a>
</div>
