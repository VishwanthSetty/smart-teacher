export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

// Keep in sync with apps/api's JWT_ACCESS_EXPIRY / JWT_REFRESH_EXPIRY. The cookie
// must outlive the token it carries so middleware can detect expiry and refresh
// instead of the browser silently dropping the session.
export const REFRESH_TOKEN_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
