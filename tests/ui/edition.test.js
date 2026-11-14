/**
 * @jest-environment jsdom
 *
 * The edition switch: public/js/edition.js and the pre-paint inline
 * script in public/index.html that sets <html data-edition>.
 */

import fs from 'fs';
import path from 'path';
import {
	resolveEdition, edition, isViking, EDITION_STORAGE_KEY, standardEditionHref, returnToStandardEdition,
} from '../../public/js/edition.js';

const INDEX = fs.readFileSync(path.join(__dirname, '../../public/index.html'), 'utf8');
// The first plain inline <script> in <head>: portal, offline and edition.
const INLINE = INDEX.match(/<script>([\s\S]*?)<\/script>/)[1];

function runInlineScript(search) {
	window.history.replaceState({}, '', `/${search}`);
	delete document.documentElement.dataset.edition;
	new Function(INLINE)();
	return document.documentElement.dataset.edition || null;
}

afterEach(() => {
	localStorage.clear();
	sessionStorage.clear();
	delete window.__TETCHES_EDITION__;
	delete document.documentElement.dataset.edition;
	window.history.replaceState({}, '', '/');
});

describe('resolveEdition', () => {
	test('standard by default', () => {
		expect(resolveEdition()).toEqual({ edition: null, store: null });
	});

	test('?edition=viking turns it on and asks to remember it', () => {
		expect(resolveEdition({ query: 'viking' })).toEqual({ edition: 'viking', store: 'set' });
	});

	test('a remembered choice holds on a plain visit', () => {
		expect(resolveEdition({ stored: 'viking' })).toEqual({ edition: 'viking', store: null });
	});

	test('?edition=standard forgets it, even over a stored or injected choice', () => {
		expect(resolveEdition({ query: 'standard', stored: 'viking', injected: 'viking' }))
			.toEqual({ edition: null, store: 'clear' });
	});

	test('a packaged build can inject it', () => {
		expect(resolveEdition({ injected: 'viking' })).toEqual({ edition: 'viking', store: null });
	});

	test('unknown names are the standard game', () => {
		expect(resolveEdition({ query: 'pirate' }).edition).toBeNull();
		expect(resolveEdition({ stored: '<script>' }).edition).toBeNull();
		expect(resolveEdition({ injected: { toString: () => 'viking' } }).edition).toBeNull();
		// An unknown query leaves the remembered choice alone.
		expect(resolveEdition({ query: 'pirate', stored: 'viking' })).toEqual({ edition: 'viking', store: null });
	});
});

describe('edition() / isViking()', () => {
	test('read <html data-edition>, allow-listed', () => {
		expect(edition()).toBeNull();
		expect(isViking()).toBe(false);
		document.documentElement.dataset.edition = 'viking';
		expect(edition()).toBe('viking');
		expect(isViking()).toBe(true);
		document.documentElement.dataset.edition = 'evil';
		expect(edition()).toBeNull();
	});
});

describe('index.html pre-paint script', () => {
	test('no query, nothing stored: standard, nothing written', () => {
		expect(runInlineScript('')).toBeNull();
		expect(localStorage.getItem(EDITION_STORAGE_KEY)).toBeNull();
	});

	test('?edition=viking sets the attribute and persists', () => {
		expect(runInlineScript('?edition=viking')).toBe('viking');
		expect(localStorage.getItem(EDITION_STORAGE_KEY)).toBe('viking');
		// A later plain visit (or the installed app) keeps it.
		expect(runInlineScript('')).toBe('viking');
	});

	test('?edition=standard clears it', () => {
		runInlineScript('?edition=viking');
		expect(runInlineScript('?edition=standard')).toBeNull();
		expect(localStorage.getItem(EDITION_STORAGE_KEY)).toBeNull();
		expect(runInlineScript('')).toBeNull();
	});

	test('unknown values are ignored', () => {
		expect(runInlineScript('?edition=pirate')).toBeNull();
		expect(localStorage.getItem(EDITION_STORAGE_KEY)).toBeNull();
		localStorage.setItem(EDITION_STORAGE_KEY, 'pirate');
		expect(runInlineScript('')).toBeNull();
	});

	test('window.__TETCHES_EDITION__ switches it on without persisting', () => {
		window.__TETCHES_EDITION__ = 'viking';
		expect(runInlineScript('')).toBe('viking');
		expect(localStorage.getItem(EDITION_STORAGE_KEY)).toBeNull();
	});

	test('blocked storage still honours the query', () => {
		const spy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
		const spySet = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
		expect(runInlineScript('?edition=viking')).toBe('viking');
		expect(runInlineScript('')).toBeNull();
		spy.mockRestore();
		spySet.mockRestore();
	});

	test('the page keeps exactly one <meta charset> and one entry script tag', () => {
		expect(INDEX.match(/<meta charset/g)).toHaveLength(1);
		expect(INDEX.match(/<script type="module" src="js\/main-enhanced\.js"><\/script>/g)).toHaveLength(1);
	});
});

describe('the way back to the standard game', () => {
	test('keeps the other switches and sets edition=standard', () => {
		expect(standardEditionHref({ pathname: '/', search: '?offline=1&app=1' }))
			.toBe('/?offline=1&app=1&edition=standard');
		expect(standardEditionHref({ pathname: '/', search: '?edition=viking&portal=crazygames' }))
			.toBe('/?edition=standard&portal=crazygames');
		expect(standardEditionHref({ pathname: '/play', search: '' })).toBe('/play?edition=standard');
	});

	test('forgets the stored edition and reloads', () => {
		localStorage.setItem(EDITION_STORAGE_KEY, 'viking');
		const loc = { pathname: '/', search: '?offline=1&app=1', replace: jest.fn() };
		returnToStandardEdition(loc);
		expect(localStorage.getItem(EDITION_STORAGE_KEY)).toBeNull();
		expect(loc.replace).toHaveBeenCalledWith('/?offline=1&app=1&edition=standard');
		// And the reloaded page is the standard game.
		expect(runInlineScript('?offline=1&app=1&edition=standard')).toBeNull();
	});
});
