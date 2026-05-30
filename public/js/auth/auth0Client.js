/**
 * Auth0 passwordless-email integration (client side).
 *
 * Auth0 hosts the ENTIRE sign-in journey on its Universal Login pages:
 * email entry, one-time code/link delivery, and verification. As a
 * result this game never sends, receives, or stores an email address.
 * We persist only an opaque, derived player key (`tetches_player_key`).
 *
 * The Auth0 SPA SDK is loaded via a CDN <script> in index.html and
 * exposed as `window.auth0` (same pattern as THREE / socket.io), so
 * there are no bare-module imports to break native-ESM dev serving.
 */

const CONFIG_ENDPOINT = '/api/auth/config';
const PLAYER_KEY_STORAGE = 'tetches_player_key';
const LEGACY_EMAIL_STORAGE = 'tetches_player_email';
const PLAYER_KEY_HEX_LENGTH = 16;

// Module-scoped singletons (NOT exported — complies with the "never
// export let / objects" rule; callers obtain these only via the
// functions below). `forcedConnection` pins the hosted-login connection
// when the server config requests one (e.g. 'email' for passwordless).
let auth0ClientPromise = null;
let forcedConnection = '';

function assertSdkLoaded() {
	if (!window.auth0 || typeof window.auth0.createAuth0Client !== 'function') {
		throw new Error('Auth0 SPA SDK not loaded — check the CDN <script> tag in index.html.');
	}
}

async function fetchAuthConfig() {
	const res = await fetch(CONFIG_ENDPOINT, { headers: { Accept: 'application/json' } });
	if (!res.ok) {
		throw new Error(`Auth config request failed (HTTP ${res.status}).`);
	}
	const config = await res.json();
	if (!config || !config.domain || !config.clientId) {
		throw new Error('Auth config response missing domain/clientId.');
	}
	forcedConnection = typeof config.connection === 'string' ? config.connection : '';
	return config;
}

/**
 * Lazily create (and memoise) the Auth0 client.
 * @returns {Promise<object>} the Auth0 SPA client
 */
async function getAuth0Client() {
	if (!auth0ClientPromise) {
		auth0ClientPromise = (async () => {
			assertSdkLoaded();
			const { domain, clientId } = await fetchAuthConfig();
			return window.auth0.createAuth0Client({
				domain,
				clientId,
				authorizationParams: { redirect_uri: window.location.origin },
				// Persist the session across reloads so returning players
				// don't have to re-verify their email every visit.
				cacheLocation: 'localstorage',
				useRefreshTokens: true,
			});
		})().catch((err) => {
			// Reset so a transient failure (e.g. offline) can be retried.
			auth0ClientPromise = null;
			throw err;
		});
	}
	return auth0ClientPromise;
}

/**
 * Derive a stable, opaque player key from the Auth0 subject claim.
 * Mirrors the server's historical `player_<sha256(...)[0:16]>` shape so
 * downstream persistence keys stay a consistent format. Uses the
 * subject (never the email) so we hold no PII.
 * @param {string} subject Auth0 `sub` claim
 * @returns {Promise<string>}
 */
async function derivePlayerKey(subject) {
	if (!subject || typeof subject !== 'string') {
		throw new Error('Cannot derive player key: missing subject claim.');
	}
	const data = new TextEncoder().encode(`${subject}:tetches`);
	const digest = await crypto.subtle.digest('SHA-256', data);
	const hex = Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
	return `player_${hex.slice(0, PLAYER_KEY_HEX_LENGTH)}`;
}

async function persistPlayerKey(client) {
	const claims = await client.getIdTokenClaims();
	if (!claims || !claims.sub) {
		throw new Error('Auth0 token had no subject claim; cannot identify player.');
	}
	const key = await derivePlayerKey(claims.sub);
	localStorage.setItem(PLAYER_KEY_STORAGE, key);
	// Defensive: purge any legacy raw-email value so we never retain PII.
	localStorage.removeItem(LEGACY_EMAIL_STORAGE);
	return key;
}

/**
 * Kick off the hosted email sign-in by redirecting to Auth0.
 * Navigates away from the page on success.
 * @param {string|null} gameKey optional world key to resume after login
 */
export async function loginWithEmail(gameKey) {
	const client = await getAuth0Client();
	const authorizationParams = { redirect_uri: window.location.origin };
	// Only pin a connection when the server explicitly requests one;
	// otherwise let Auth0's hosted page offer every enabled method.
	if (forcedConnection) {
		authorizationParams.connection = forcedConnection;
	}
	await client.loginWithRedirect({
		appState: gameKey ? { gameKey } : {},
		authorizationParams,
	});
}

/**
 * Complete an Auth0 redirect, if this page load is one. Strips the
 * `code`/`state` query params and persists the derived player key.
 * @returns {Promise<object|null>} the appState passed to loginWithEmail
 *   (e.g. `{ gameKey }`) when we just returned from a sign-in, else null
 */
export async function handleAuthRedirect() {
	const params = new URLSearchParams(window.location.search);
	const isCallback = params.has('code') && params.has('state');
	const hasError = params.has('error');
	if (!isCallback && !hasError) {
		return null;
	}

	let appState = null;
	try {
		if (isCallback) {
			const client = await getAuth0Client();
			const result = await client.handleRedirectCallback();
			appState = (result && result.appState) || {};
			await persistPlayerKey(client);
		} else {
			const description = params.get('error_description') || params.get('error');
			throw new Error(description || 'Sign-in was cancelled or failed.');
		}
	} finally {
		// Always scrub Auth0's params from the address bar.
		const clean = new URL(window.location.href);
		['code', 'state', 'error', 'error_description'].forEach((p) =>
			clean.searchParams.delete(p));
		window.history.replaceState({}, document.title, clean.toString());
	}
	return appState;
}

/**
 * @returns {Promise<boolean>} whether a valid Auth0 session exists
 */
export async function isSignedIn() {
	try {
		const client = await getAuth0Client();
		return await client.isAuthenticated();
	} catch (err) {
		console.warn('[auth] isAuthenticated check failed:', err);
		return false;
	}
}

/**
 * @returns {string|null} the persisted opaque player key, if any
 */
export function getStoredPlayerKey() {
	return localStorage.getItem(PLAYER_KEY_STORAGE);
}

/**
 * Sign out locally and at Auth0, then return to the app origin.
 */
export async function signOut() {
	localStorage.removeItem(PLAYER_KEY_STORAGE);
	localStorage.removeItem(LEGACY_EMAIL_STORAGE);
	try {
		const client = await getAuth0Client();
		await client.logout({ logoutParams: { returnTo: window.location.origin } });
	} catch (err) {
		console.error('[auth] sign-out failed:', err);
	}
}
