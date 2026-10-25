import { configured } from '$lib/server/config';
import { env } from '$env/dynamic/public';
export const load = async ({ locals }: { locals: App.Locals }) => {
	const user = await locals.getUser();
	return {
		configured: configured(),
		googleEnabled: env.PUBLIC_GOOGLE_AUTH_ENABLED === 'true',
		user: user ? { id: user.id, email: user.email } : null
	};
};
