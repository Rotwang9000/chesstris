/**
 * Portal mode: the game embedded on a game portal (CrazyGames, itch.io).
 *
 * Portals frame https://tetches.com/?portal=<name>. Their rules forbid
 * our own ads, external logins and links out to a playable copy of the
 * game, so in portal mode those are hidden (CSS keyed on
 * `<html data-portal>`, set by an inline script in index.html before
 * first paint) and the code paths below check `isPortal()`.
 *
 * Embedded anywhere (portal or not), tetches.com cookies are
 * third-party: Safari drops them and the others only keep partitioned
 * ones. `identityCookieAttributes()` and the localStorage mirror below
 * keep a guest's kingdom across visits from inside an iframe.
 */

const PORTALS = new Set(['crazygames', 'itch']);
const IDENTITY_KEY = 'tetches_embedded_identity';

/** 'crazygames' | 'itch' | null — from <html data-portal>. */
export function portalName() {
	try {
		const name = document.documentElement.dataset.portal;
		return PORTALS.has(name) ? name : null;
	} catch (_e) {
		return null;
	}
}

export function isPortal() {
	return portalName() !== null;
}

/** True when the page runs inside someone else's frame. */
export function isEmbedded() {
	try {
		return window.self !== window.top;
	} catch (_e) {
		// Cross-origin parent: reading window.top threw, so we're framed.
		return true;
	}
}

/**
 * Attributes for our identity cookies. Embedded, a SameSite=Lax cookie
 * is neither stored nor sent; SameSite=None + Partitioned (CHIPS) is,
 * keyed to the portal's site.
 */
export function identityCookieAttributes() {
	const secure = location.protocol === 'https:';
	if (isEmbedded() && secure) return ';SameSite=None;Secure;Partitioned';
	return `;SameSite=Lax${secure ? ';Secure' : ''}`;
}

/** Remember the guest identity in (partitioned) localStorage when embedded. */
export function rememberEmbeddedIdentity(playerId, sessionSecret) {
	if (!isEmbedded() || !playerId) return;
	try {
		const prev = JSON.parse(localStorage.getItem(IDENTITY_KEY) || 'null') || {};
		const same = prev.playerId === playerId;
		localStorage.setItem(IDENTITY_KEY, JSON.stringify({
			playerId,
			session: sessionSecret || (same ? prev.session : undefined),
		}));
	} catch (_e) { /* storage blocked: a fresh guest next visit */ }
}

/** Forget the remembered guest identity (exit / sign-out). */
export function forgetEmbeddedIdentity() {
	try { localStorage.removeItem(IDENTITY_KEY); } catch (_e) { /* storage blocked */ }
}

/**
 * socket.io `auth` payload carrying the remembered identity, for when
 * the browser blocks our cookies in the frame. The server only uses it
 * if no identity cookie arrives, and checks the secret either way.
 */
export function embeddedIdentityAuth() {
	if (!isEmbedded()) return undefined;
	try {
		const saved = JSON.parse(localStorage.getItem(IDENTITY_KEY) || 'null');
		if (saved && typeof saved.playerId === 'string') {
			return { playerId: saved.playerId, session: typeof saved.session === 'string' ? saved.session : undefined };
		}
	} catch (_e) { /* nothing saved */ }
	return undefined;
}
