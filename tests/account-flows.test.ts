import { describe, it, expect, vi } from 'vitest';
import { isRedirect } from '@sveltejs/kit';
import { actions as login } from '../src/routes/login/+page.server';
import { actions as consent, load as consentLoad } from '../src/routes/oauth/consent/+page.server';
import { safePath } from '../src/lib/validation';
function event(fields: Record<string, string>, supabase: unknown) {
	return {
		request: new Request('https://tracker.example/login', {
			method: 'POST',
			body: new URLSearchParams(fields)
		}),
		url: new URL('https://tracker.example/login'),
		locals: { supabase, getUser: async () => ({ id: 'account-a' }) }
	};
}
// Route actions only use these request fields; generated framework types include unrelated properties.
const run = (fn: unknown, e: unknown) => (fn as (e: unknown) => Promise<any>)(e);
describe('account and OAuth flow contracts', () => {
	it('keeps recovery links on this site and sends them to password recovery', async () => {
		const reset = vi.fn().mockResolvedValue({ error: null });
		const result = await run(
			login.recover,
			event({ email: 'friend@example.test' }, { auth: { resetPasswordForEmail: reset } })
		);
		expect(reset).toHaveBeenCalledWith('friend@example.test', {
			redirectTo: 'https://tracker.example/auth/callback?next=/account/recover'
		});
		expect(result.message).toContain('If that address');
		expect(safePath('//evil.test')).toBe('/tracker');
		expect(safePath('/\\evil.test')).toBe('/tracker');
	});
	it('configures Google callback with a safe post-login path', async () => {
		const google = vi
			.fn()
			.mockResolvedValue({ data: { url: 'https://accounts.google.com/approved' }, error: null });
		try {
			await run(
				login.google,
				event({ next: '//evil.test' }, { auth: { signInWithOAuth: google } })
			);
		} catch (e) {
			expect(isRedirect(e)).toBe(true);
		}
		expect(google).toHaveBeenCalledWith({
			provider: 'google',
			options: { redirectTo: 'https://tracker.example/auth/callback?next=%2Ftracker' }
		});
	});
	it.each(['approve', 'deny'] as const)(
		'handles OAuth %s using server-fetched client information',
		async (decision) => {
			const upsert = vi.fn().mockResolvedValue({ error: null }),
				approve = vi.fn().mockResolvedValue({
					data: { redirect_url: 'https://client.example/callback' },
					error: null
				}),
				deny = vi.fn().mockResolvedValue({
					data: { redirect_url: 'https://client.example/denied' },
					error: null
				});
			const e = event(
				{ authorization_id: 'request-id', client_id: 'forged-client' },
				{
					from: () => ({ upsert }),
					auth: {
						oauth: {
							getAuthorizationDetails: async () => ({
								data: {
									authorization_id: 'request-id',
									client: { id: 'real-client', name: 'Client' }
								},
								error: null
							}),
							approveAuthorization: approve,
							denyAuthorization: deny
						}
					}
				}
			);
			try {
				await run(consent[decision], e);
			} catch (issue) {
				expect(isRedirect(issue)).toBe(true);
			}
			if (decision === 'approve') {
				expect(upsert).toHaveBeenCalledWith(
					expect.objectContaining({ client_id: 'real-client', user_id: 'account-a' })
				);
				expect(approve).toHaveBeenCalledWith('request-id');
			} else {
				expect(upsert).not.toHaveBeenCalled();
				expect(deny).toHaveBeenCalledWith('request-id');
			}
		}
	);
	it('shows a useful expired-request state', async () => {
		const e = event(
			{},
			{
				auth: {
					oauth: {
						getAuthorizationDetails: async () => ({ data: null, error: { message: 'expired' } })
					}
				}
			}
		);
		e.url = new URL('https://tracker.example/oauth/consent?authorization_id=expired');
		expect((await run(consentLoad, e)).message).toContain('expired');
	});
});
