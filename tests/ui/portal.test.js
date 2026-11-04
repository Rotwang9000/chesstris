/**
 * @jest-environment jsdom
 *
 * Portal mode helpers (public/js/portal.js).
 */

import {
	portalName, isPortal, identityCookieAttributes,
	rememberEmbeddedIdentity, embeddedIdentityAuth, forgetEmbeddedIdentity,
} from '../../public/js/portal.js';

function embed(on) {
	Object.defineProperty(window, 'top', { configurable: true, get: () => (on ? {} : window) });
}

afterEach(() => {
	embed(false);
	delete document.documentElement.dataset.portal;
	localStorage.clear();
});

test('portal name comes from <html data-portal>, known portals only', () => {
	expect(isPortal()).toBe(false);
	document.documentElement.dataset.portal = 'crazygames';
	expect(portalName()).toBe('crazygames');
	document.documentElement.dataset.portal = 'evil.example';
	expect(isPortal()).toBe(false);
});

test('top-level pages keep Lax cookies', () => {
	expect(identityCookieAttributes()).toBe(';SameSite=Lax');
});

test('embedded, the identity is remembered and offered as socket auth', () => {
	embed(true);
	rememberEmbeddedIdentity('p1', 'secret');
	expect(embeddedIdentityAuth()).toEqual({ playerId: 'p1', session: 'secret' });
	// A later set_session without a secret keeps the one we have.
	rememberEmbeddedIdentity('p1');
	expect(embeddedIdentityAuth()).toEqual({ playerId: 'p1', session: 'secret' });
	forgetEmbeddedIdentity();
	expect(embeddedIdentityAuth()).toBeUndefined();
});

test('not embedded: nothing is stored or sent', () => {
	rememberEmbeddedIdentity('p1', 'secret');
	expect(embeddedIdentityAuth()).toBeUndefined();
	expect(localStorage.length).toBe(0);
});
