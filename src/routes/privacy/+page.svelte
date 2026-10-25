<svelte:head><title>Privacy · Warframe Tracker</title></svelte:head>
<article class="policy">
	<p class="eyebrow">Warframe Tracker</p>
	<h1>Privacy notice</h1>
	<p>Updated 25 October 2026</p>
	<h2>Who runs this service</h2>
	<p>
		Warframe Tracker is an independent personal fan project. It is not affiliated with Digital
		Extremes or Google. For privacy questions or account-deletion requests, contact <a
			href="mailto:archimon99@gmail.com">archimon99@gmail.com</a
		>.
	</p>
	<h2>Account and Google sign-in information</h2>
	<p>
		We use Supabase to authenticate accounts. When you choose Google sign-in, Google supplies
		identity information that may include your Google account identifier, email address, name and
		profile-image address. We use this information to identify your account and establish your
		sign-in session. Google processes your Google password; the tracker does not receive it. We
		request only OpenID, email and basic profile permissions. The tracker does not request access to
		Gmail, Drive, contacts or other Google account content.
	</p>
	<h2>Your tracker information</h2>
	<p>
		We store your equipment list, mastery statuses, priorities, notes, rank annotations and owned
		component quantities in Supabase under your account. We also store a display name if you set
		one, a preference remembering that you dismissed the introductory tour, and records of apps you
		approve or revoke. This information supports your private tracker, cloud saves and authorized
		connections. Other ordinary users cannot browse your personal tracker. The project operator and
		infrastructure providers can process data as needed to operate and maintain the service.
	</p>
	<h2>Guest mode and browser storage</h2>
	<p>
		You can use the tracker without signing in. Guest equipment, statuses, priorities, notes and
		component quantities are saved in localStorage on this browser and are not uploaded to your
		Supabase account. Other people using the same browser profile can see this guest list. Guest
		mode does not provide cross-device saves or MCP connections. Clearing site storage, switching
		browsers, or closing a private browsing session can remove or hide it. Export a backup to keep
		your progress. Signing in does not automatically import guest data; you can move it with
		export/import.
	</p>
	<h2>Connected assistants</h2>
	<p>
		If you approve an MCP connection, that app can read and edit your tracker as described on the
		approval screen. Its own privacy policy applies to information it receives. You can revoke
		tracker access from Connections. The tracker does not send your Google password to connected
		apps.
	</p>
	<h2>Cookies, hosting and technical information</h2>
	<p>
		Sign-in uses cookies and session credentials so you can remain signed in. The website is hosted
		by Vercel and its database and authentication are hosted by Supabase. These services may process
		technical information such as IP addresses, request details and operational logs under their own
		policies. The interface loads fonts from Google Fonts, which creates requests from your browser
		to Google. The tracker has no advertising or application analytics integration.
	</p>
	<p>
		<a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noreferrer"
			>Vercel privacy</a
		>
		· <a href="https://supabase.com/privacy" target="_blank" rel="noreferrer">Supabase privacy</a> ·
		<a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google privacy</a
		>
	</p>
	<h2>Your choices and data removal</h2>
	<p>
		You can export your equipment and progress from My tracker. Start empty removes your tracked
		equipment but does not delete your sign-in account. Account information and saved progress
		remain associated with your account until changed or removed. For account deletion, contact the
		address above. Infrastructure backups and operational logs may remain subject to the providers'
		retention practices. You can also remove the Google connection through your Google Account
		settings; doing so does not by itself delete an existing tracker account.
	</p>
	<h2>Use of Google user data</h2>
	<p>
		Google identity information is used for account authentication and operation of this tracker. It
		is not sold, used for advertising, or used to train AI models by this application. The
		application's use of information received from Google APIs follows the <a
			href="https://developers.google.com/terms/api-services-user-data-policy"
			target="_blank"
			rel="noreferrer">Google API Services User Data Policy</a
		>, including its Limited Use requirements where applicable. If you choose to share tracker
		information with an assistant, that assistant's own data practices apply.
	</p>
	<h2>Changes</h2>
	<p>
		This page will be updated when the service's data practices change. New uses of Google
		information will be disclosed before requesting the relevant authorization.
	</p>
</article>

<style>
	.policy {
		max-width: 800px;
		margin: auto;
	}
	.policy h2 {
		margin-top: 28px;
	}
	.policy p {
		line-height: 1.75;
	}
</style>
