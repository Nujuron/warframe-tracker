import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
export const POST: RequestHandler = async ({ locals }) => {
	await locals.supabase?.auth.signOut({ scope: 'local' });
	redirect(303, '/login');
};
