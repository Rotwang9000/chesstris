/**
 * @jest-environment jsdom
 *
 * The edition switch: public/js/edition.js and the pre-paint inline
 * script in public/index.html that sets <html data-edition>.
 */

import fs from 'fs';
import path from 'path';
import {
	resolveEdition, edition, isViking, EDITION_STORAGE_KEY, standardEditionHref, returnToStandardEdition, switchToVikingEdition,
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
	test('the Viking edition by default (owner, 2026-11-17)', () => {
		expect(resolveEdition()).toEqual({ edition: 'viking', store: null });
	});

	test('?edition=standard picks the standard game and asks to remember it', () => {
		expect(resolveEdition({ query: 'standard' })).toEqual({ edition: null, store: 'standard' });
		expect(resolveEdition({ query: 'standard', stored: 'viking', injected: 'viking' }))
			.toEqual({ edition: null, store: 'standard' });
	});

	test('a remembered choice holds on a plain visit, either way', () => {
		expect(resolveEdition({ stored: 'standard' })).toEqual({ edition: null, store: null });
		expect(resolveEdition({ stored: 'viking' })).toEqual({ edition: 'viking', store: null });
	});

	test('?edition=viking picks it again', () => {
		expect(resolveEdition({ query: 'viking', stored: 'standard' })).toEqual({ edition: 'viking', store: 'viking' });
	});

	test('a packaged build can inject either, under the player\'s own choice', () => {
		expect(resolveEdition({ injected: 'standard' }).edition).toBeNull();
		expect(resolveEdition({ injected: 'standard', stored: 'viking' }).edition).toBe('viking');
	});

	test('unknown names are ignored', () => {
		expect(resolveEdition({ query: 'pirate' })).toEqual({ edition: 'viking', store: null });
		expect(resolveEdition({ stored: '<script>' }).edition).toBe('viking');
		expect(resolveEdition({ injected: { toString: () => 'standard' } }).edition).toBe('viking');
		expect(resolveEdition({ query: 'pirate', stored: 'standard' })).toEqual({ edition: null, store: null });
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
	test('no query, nothing stored: the Viking edition, nothing written', () => {
		expect(runInlineScript('')).toBe('viking');
		expect(localStorage.getItem(EDITION_STORAGE_KEY)).toBeNull();
	});

	test('?edition=standard picks the standard game and keeps it', () => {
		expect(runInlineScript('?edition=standard')).toBeNull();
		expect(localStorage.getItem(EDITION_STORAGE_KEY)).toBe('standard');
		// A later plain visit (or the installed app) keeps it.
		expect(runInlineScript('')).toBeNull();
	});

	test('?edition=viking picks it back', () => {
		runInlineScript('?edition=standard');
		expect(runInlineScript('?edition=viking')).toBe('viking');
		expect(localStorage.getItem(EDITION_STORAGE_KEY)).toBe('viking');
		expect(runInlineScript('')).toBe('viking');
	});

	test('unknown values are ignored', () => {
		expect(runInlineScript('?edition=pirate')).toBe('viking');
		expect(localStorage.getItem(EDITION_STORAGE_KEY)).toBeNull();
		localStorage.setItem(EDITION_STORAGE_KEY, 'pirate');
		expect(runInlineScript('')).toBe('viking');
	});

	test('window.__TETCHES_EDITION__ = standard: the standard game, not persisted', () => {
		window.__TETCHES_EDITION__ = 'standard';
		expect(runInlineScript('')).toBeNull();
		expect(localStorage.getItem(EDITION_STORAGE_KEY)).toBeNull();
	});

	test('blocked storage still honours the query', () => {
		const spy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
		const spySet = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
		expect(runInlineScript('?edition=standard')).toBeNull();
		expect(runInlineScript('')).toBe('viking');
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

	test('remembers the standard game and reloads', () => {
		localStorage.setItem(EDITION_STORAGE_KEY, 'viking');
		const loc = { pathname: '/', search: '?offline=1&app=1', replace: jest.fn() };
		returnToStandardEdition(loc);
		expect(localStorage.getItem(EDITION_STORAGE_KEY)).toBe('standard');
		expect(loc.replace).toHaveBeenCalledWith('/?offline=1&app=1&edition=standard');
		// And the reloaded page is the standard game.
		expect(runInlineScript('?offline=1&app=1&edition=standard')).toBeNull();
		// …and stays it on the next plain visit.
		expect(runInlineScript('')).toBeNull();
	});

	test('and the way back to the Viking edition', () => {
		localStorage.setItem(EDITION_STORAGE_KEY, 'standard');
		const loc = { pathname: '/', search: '?app=1&edition=standard', replace: jest.fn() };
		switchToVikingEdition(loc);
		expect(localStorage.getItem(EDITION_STORAGE_KEY)).toBe('viking');
		expect(loc.replace).toHaveBeenCalledWith('/?app=1&edition=viking');
	});
});
