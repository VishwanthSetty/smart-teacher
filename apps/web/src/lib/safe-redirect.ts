export const DEFAULT_REDIRECT = '/dashboard';

// Guards the post-login `?next=` hop against open redirects. Only same-origin absolute
// paths are honoured: "//evil.com" and "/\evil.com" are rejected because browsers
// normalise both into a protocol-relative URL pointing off-site, and anything without a
// leading slash could be an absolute URL. Anything suspicious falls back to the default
// rather than erroring — a tampered link should still log the user in.
export function toSafeRedirect(next: string | string[] | undefined): string {
  const value = Array.isArray(next) ? next[0] : next;

  if (!value || !value.startsWith('/')) {
    return DEFAULT_REDIRECT;
  }
  if (value.startsWith('//') || value.startsWith('/\\')) {
    return DEFAULT_REDIRECT;
  }

  return value;
}
