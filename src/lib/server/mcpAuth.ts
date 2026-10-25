import { createClient } from '@supabase/supabase-js';
import type { AuthInfo } from '@modelcontextprotocol/server';
import { configured, publishableKey, supabaseUrl } from './config';

export function userClient(token: string) {
	return createClient(supabaseUrl(), publishableKey(), {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: { headers: { Authorization: `Bearer ${token}` } }
	});
}

// Claims are read only after Supabase has verified the token's signature and user.
export function validClaims(
	token: string,
	userId: string,
	issuer: string,
	now = Date.now() / 1000
) {
	try {
		const c = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
		if (
			c.sub !== userId ||
			c.iss !== issuer ||
			!Number.isFinite(c.exp) ||
			c.exp <= now ||
			(c.aud !== 'authenticated' && !(Array.isArray(c.aud) && c.aud.includes('authenticated'))) ||
			typeof c.client_id !== 'string' ||
			!c.client_id
		)
			return null;
		return c as { exp: number; client_id: string; scope?: string };
	} catch {
		return null;
	}
}

export async function verifyMcpAccessToken(
	_request: Request,
	token?: string
): Promise<AuthInfo | undefined> {
	if (!configured() || !token) return;
	try {
		const db = userClient(token);
		const { data, error } = await db.auth.getUser(token);
		if (error || !data.user) return;
		const claims = validClaims(token, data.user.id, `${supabaseUrl()}/auth/v1`);
		if (!claims) return;
		const { data: grant, error: grantError } = await db
			.from('oauth_client_grants')
			.select('revoked_at')
			.eq('user_id', data.user.id)
			.eq('client_id', claims.client_id)
			.maybeSingle();
		if (grantError || !grant || grant.revoked_at) return;
		return {
			token,
			clientId: claims.client_id,
			scopes: claims.scope?.split(/\s+/).filter(Boolean) || [],
			expiresAt: claims.exp,
			extra: { userId: data.user.id }
		};
	} catch {
		return;
	}
}
