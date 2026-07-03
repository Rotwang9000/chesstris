/**
 * Self-contained "kingdom key" login (username + passphrase).
 *
 * The passphrase NEVER leaves the browser. We derive a stable,
 * high-entropy account key locally (SHA-256 of name+passphrase) and store
 * it in the `tetches_auth_key` cookie; the server adopts that key as the
 * player's identity (resuming the account, or migrating the current guest
 * kingdom on first login) so the SAME kingdom follows them across devices.
 * No email, no PII, no third party.
 *
 * (Auth0 passwordless email is planned as a later upgrade for players who
 * would rather not remember a passphrase — see ./auth0Client.js.)
 */

const AUTH_KEY_COOKIE = 'tetches_auth_key';
const DEVICE_ID_COOKIE = 'tetches_player_id';
const NAME_STORAGE = 'playerName';
// 32 hex chars = 128 bits of entropy: unguessable, and collision between
// two distinct credential pairs is negligible. Matches the server's
// `^player_[a-f0-9]{16,64}$` gate.
const KEY_HEX_LENGTH = 32;
const MIN_USERNAME_LENGTH = 2;
const MIN_PASSPHRASE_LENGTH = 6;
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // one year

function setCookie(name, value, maxAgeSeconds) {
	// Secure only over HTTPS — a Secure cookie is silently dropped on the
	// plain-http localhost dev server, which would break login locally.
	const secure = location.protocol === 'https:' ? ';Secure' : '';
	document.cookie = `${name}=${encodeURIComponent(value)};path=/;max-age=${maxAgeSeconds};SameSite=Lax${secure}`;
}

function deleteCookie(name) {
	document.cookie = `${name}=;path=/;max-age=0;SameSite=Lax`;
}

function readCookie(name) {
	const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
	return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Derive the stable account key from credentials. Username is folded to
 * lower case so "Bob" and "bob" reach the same account; the original case
 * is kept only as the display name. Produces the `player_<hex>` shape the
 * server's `isWellFormedAuthKey` gate expects.
 *
 * @param {string} username
 * @param {string} passphrase
 * @returns {Promise<string>}
 */
export async function deriveKingdomKey(username, passphrase) {
	const name = String(username || '').trim().toLowerCase();
	const secret = String(passphrase || '');
	if (!crypto || !crypto.subtle) {
		throw new Error('Secure crypto is unavailable in this browser context.');
	}
	const data = new TextEncoder().encode(`${name}:${secret}:tetches`);
	const digest = await crypto.subtle.digest('SHA-256', data);
	const hex = Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
	return `player_${hex.slice(0, KEY_HEX_LENGTH)}`;
}

/** @returns {boolean} whether an account key is currently stored */
export function isLoggedIn() {
	return !!readCookie(AUTH_KEY_COOKIE);
}

/** @returns {string|null} the stored display name when logged in */
export function getLoggedInName() {
	if (!isLoggedIn()) return null;
	try {
		return localStorage.getItem(NAME_STORAGE) || null;
	} catch (_e) {
		return null;
	}
}

/**
 * Log in / create an account. Validates input, persists the derived key
 * and display name, then reloads so the socket reconnects under the new
 * identity (the server resumes the account or migrates the guest kingdom).
 *
 * @param {string} username
 * @param {string} passphrase
 * @returns {Promise<void>} resolves just before the page reload
 */
export async function loginWithPassphrase(username, passphrase) {
	const trimmedName = String(username || '').trim();
	if (trimmedName.length < MIN_USERNAME_LENGTH) {
		throw new Error(`Please choose a username of at least ${MIN_USERNAME_LENGTH} characters.`);
	}
	if (String(passphrase || '').length < MIN_PASSPHRASE_LENGTH) {
		throw new Error(`Please choose a passphrase of at least ${MIN_PASSPHRASE_LENGTH} characters.`);
	}
	const key = await deriveKingdomKey(trimmedName, passphrase);
	try {
		localStorage.setItem(NAME_STORAGE, trimmedName);
	} catch (_e) {
		// Private-mode storage failure is non-fatal; the cookie still carries identity.
	}
	setCookie(AUTH_KEY_COOKIE, key, COOKIE_MAX_AGE_SECONDS);
	// A full reload is the cleanest way to rebind the socket identity
	// end-to-end (handshake re-reads the cookie on connect).
	location.reload();
}

/**
 * Log out: drop the account key and the derived device-session cookie,
 * then reload as a fresh guest.
 */
export function logout() {
	deleteCookie(AUTH_KEY_COOKIE);
	deleteCookie(DEVICE_ID_COOKIE);
	location.reload();
}
