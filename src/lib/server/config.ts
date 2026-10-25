import { env } from '$env/dynamic/public';
export const supabaseUrl = () => env.PUBLIC_SUPABASE_URL?.replace(/\/$/, '') || '';
export const publishableKey = () => env.PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
export const configured = () => Boolean(supabaseUrl() && publishableKey());
export const siteOrigin = (url: URL) => env.PUBLIC_SITE_URL?.replace(/\/$/, '') || url.origin;
