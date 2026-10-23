const RESERVED_PATHS = new Set(["accounts", "direct", "explore", "p", "reel", "reels", "stories", "about", "legal"]);

/** Accept a handle or an actual Instagram profile URL, never a different site's URL. */
export function instagramProfileUsername(value: string): string | null {
  let username = value.trim();
  if (/^(?:https?:\/\/|(?:www\.)?instagram\.com\/)/i.test(username)) {
    try {
      const url = new URL(/^https?:\/\//i.test(username) ? username : `https://${username}`);
      if (!['instagram.com', 'www.instagram.com'].includes(url.hostname.toLowerCase()) || url.username || url.password || url.port) return null;
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length !== 1) return null;
      username = parts[0];
    } catch { return null; }
  }
  username = username.replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9_](?:[a-z0-9_.]{0,28}[a-z0-9_])?$/.test(username) || username.includes('..') || RESERVED_PATHS.has(username)) return null;
  return username;
}
