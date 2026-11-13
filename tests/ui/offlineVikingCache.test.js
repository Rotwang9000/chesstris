/**
 * @jest-environment jsdom
 *
 * The installed app's cache (offline/appShell.js) keeps the Viking
 * chunk and the paintings list whatever edition the page is, so the app
 * can open `?edition=viking` later with no connection. And the build's
 * swap of vikingLazy/loader.js for runtime.js keeps every name.
 */

// As in the production bundle: the loader is runtime.js.
jest.mock('../../public/js/vikingLazy/loader.js', () => jest.requireActual('../../public/js/vikingLazy/runtime.js'));

import * as devLoader from '../../public/js/vikingLazy/loader.js';
import * as runtime from '../../public/js/vikingLazy/runtime.js';
import { urlsToKeep } from '../../public/js/offline/appShell.js';
import { MANIFEST_URL } from '../../public/js/paintings/paintingCatalogue.js';

afterEach(() => {
	document.head.innerHTML = '';
	delete window.__BUNDLE_VERSION__;
	delete document.documentElement.dataset.edition;
});

test('the chunk sits beside the app bundle, same version', () => {
	const tag = document.createElement('script');
	tag.src = 'dist/app.bundle.js?v=123';
	document.head.appendChild(tag);
	expect(runtime.vikingChunkUrl()).toBe('dist/viking.bundle.js?v=123');
});

test('a standard page keeps the Viking chunk and the paintings list for later', () => {
	const tag = document.createElement('script');
	tag.src = 'dist/app.bundle.js?v=77';
	document.head.appendChild(tag);
	window.__BUNDLE_VERSION__ = '77';
	const urls = urlsToKeep();
	expect(urls).toContain(new URL('dist/viking.bundle.js?v=77', window.location.href).href);
	expect(urls).toContain(new URL(MANIFEST_URL, window.location.href).href);
	// Kept, not run: nothing was injected.
	expect(document.querySelector('script[src*="viking.bundle"]')).toBeNull();
	expect(window.__tetchesViking).toBeUndefined();
});

test('unbundled (dev) has no chunk to keep', () => {
	expect(jest.requireActual('../../public/js/vikingLazy/loader.js').vikingChunkUrl()).toBeNull();
});

test('runtime.js has every name loader.js has (the build swaps one for the other)', () => {
	const real = jest.requireActual('../../public/js/vikingLazy/loader.js');
	for (const key of Object.keys(real)) {
		expect(typeof runtime[key]).toBe(typeof real[key]);
	}
	expect(devLoader.vikingChunkUrl).toBe(runtime.vikingChunkUrl);
});
