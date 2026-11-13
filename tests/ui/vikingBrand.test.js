/**
 * @jest-environment jsdom
 *
 * The Viking wordmark: in the Viking edition VIKING is stamped across
 * every TETCHES in a rune face (index.html, <style id="viking-brand-style">).
 * The standard game must not change at all and must fetch nothing more:
 * every rule is keyed on html[data-edition="viking"], and the font
 * preloads and the "Tetches — Viking" title only happen when the
 * pre-paint edition script has switched the edition on.
 */

// As in the production bundle: the loader is runtime.js.
jest.mock('../../public/js/vikingLazy/loader.js', () => jest.requireActual('../../public/js/vikingLazy/runtime.js'));

import fs from 'fs';
import path from 'path';
import { urlsToKeep } from '../../public/js/offline/appShell.js';

const PUBLIC = path.join(__dirname, '../../public');
const INDEX = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
// The first plain inline <script> in <head>: portal, offline and edition.
const INLINE = INDEX.match(/<script>([\s\S]*?)<\/script>/)[1];
// The one-liner right after <title>.
const TITLE_SCRIPT = INDEX.match(/<\/title>\s*<script>([\s\S]*?)<\/script>/)[1];
const BRAND_CSS = INDEX.match(/<style id="viking-brand-style">([\s\S]*?)<\/style>/)[1];
const FONT_FILES = ['viking-futhark.woff2'];
const MARKS = ['viking-mark.svg', 'viking-mark-cute.svg', 'viking-mark-retro.svg'];

function boot(search, stored = null) {
	window.history.replaceState({}, '', `/${search}`);
	document.head.innerHTML = '<title>Tetches — Chess meets Tetris, live multiplayer</title>';
	delete document.documentElement.dataset.edition;
	if (stored) localStorage.setItem('tetches_edition', stored);
	new Function(INLINE)();
	new Function(TITLE_SCRIPT)();
	return {
		edition: document.documentElement.dataset.edition || null,
		preloads: [...document.head.querySelectorAll('link[rel="preload"]')].map(l => l.getAttribute('href')),
		title: document.title,
	};
}

/** The selectors of every style rule (not @font-face / @keyframes). */
function styleRuleSelectors(css) {
	const flat = css.replace(/\/\*[\s\S]*?\*\//g, '');
	const selectors = [];
	// Unwrap @media blocks; drop @font-face and @keyframes blocks whole.
	const body = flat
		.replace(/@font-face\s*{[^}]*}/g, '')
		.replace(/@keyframes[^{]*{(?:[^{}]*{[^}]*})*\s*}/g, '')
		.replace(/@media[^{]*{([\s\S]*?})\s*}/g, '$1');
	for (const m of body.matchAll(/([^{}]+){[^}]*}/g)) {
		for (const s of m[1].split(',')) if (s.trim()) selectors.push(s.trim());
	}
	return selectors;
}

afterEach(() => {
	localStorage.clear();
	sessionStorage.clear();
	document.head.innerHTML = '';
	delete window.__BUNDLE_VERSION__;
	delete document.documentElement.dataset.edition;
	window.history.replaceState({}, '', '/');
});

describe('standard edition: no change, nothing more fetched', () => {
	test('a plain visit preloads no rune fonts and keeps the title', () => {
		const page = boot('');
		expect(page.edition).toBeNull();
		expect(page.preloads).toEqual([]);
		expect(page.title).toBe('Tetches — Chess meets Tetris, live multiplayer');
	});

	test('?edition=standard (even over a remembered Viking choice) stays standard', () => {
		const page = boot('?edition=standard', 'viking');
		expect(page.edition).toBeNull();
		expect(page.preloads).toEqual([]);
		expect(page.title).toMatch(/^Tetches — Chess meets Tetris/);
	});

	test('an unknown edition name is the standard game', () => {
		const page = boot('?edition=pirate');
		expect(page.preloads).toEqual([]);
	});

	test('every brand rule is keyed on html[data-edition="viking"]', () => {
		const selectors = styleRuleSelectors(BRAND_CSS);
		expect(selectors.length).toBeGreaterThan(10);
		for (const s of selectors) expect(s.startsWith('html[data-edition="viking"]')).toBe(true);
	});

	test('the rune fonts are used only inside the Viking-keyed rules', () => {
		// Nothing outside the brand style names them, so the standard page
		// never triggers the download.
		const rest = INDEX.replace(BRAND_CSS, '');
		expect(rest).not.toMatch(/Tetches Viking Display|Tetches Futhark/);
		for (const file of FONT_FILES) {
			// Outside the brand style, only the edition script's preload names them.
			const mentions = rest.split(file).length - 1;
			expect(mentions).toBe(1);
		}
	});
});

describe('Viking edition', () => {
	test('?edition=viking preloads the rune face and the carved mark and titles the tab', () => {
		const page = boot('?edition=viking');
		expect(page.edition).toBe('viking');
		expect(page.preloads).toEqual([...FONT_FILES.map(f => `/fonts/${f}`), '/img/brand/viking-mark.svg']);
		const link = document.head.querySelector('link[rel="preload"][as="font"]');
		expect(link.crossOrigin).toBe('anonymous');
		expect(link.type).toBe('font/woff2');
		expect(page.title).toBe('Tetches — Viking');
	});

	test('a remembered Viking choice gets the same', () => {
		const page = boot('', 'viking');
		expect(page.preloads).toHaveLength(2);
		expect(page.title).toBe('Tetches — Viking');
	});

	test('the stamp covers each place the wordmark shows', () => {
		for (const where of ['.game-title::after', '.welcome-hero::after', '#loading .loading-text::after',
			'.loading-indicator-title::after', '#lite-welcome h1::after']) {
			expect(BRAND_CSS).toContain(`html[data-edition="viking"] ${where}`);
		}
		// The carved mark, per render profile.
		for (const f of MARKS) expect(BRAND_CSS).toContain(`url('/img/brand/${f}')`);
		// Elder Futhark: TETCHES : VIKING
		expect(BRAND_CSS).toContain('ᛏᛖᛏᚲᚺᛖᛊ ᛬ ᚹᛁᚲᛁᛜ');
	});

	test('motion is one-off and switched off for reduced motion', () => {
		expect(BRAND_CSS).not.toMatch(/infinite/);
		expect(BRAND_CSS).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none/);
	});

	test('the welcome hero and the world loader carry the hooks the stamp needs', () => {
		const loader = fs.readFileSync(path.join(PUBLIC, 'js/createLoadingIndicator.js'), 'utf8');
		expect(loader).toMatch(/<div class="welcome-hero"><img src="\/img\/welcome-hero\.png"/);
		expect(loader).toContain("loadingText.className = 'loading-indicator-title'");
	});
});

describe('font files', () => {
	test('are self-hosted, small, and shipped with their OFL licences', () => {
		for (const [, url] of BRAND_CSS.matchAll(/url\('(\/fonts\/[^']+)'\)/g)) {
			expect(url).toMatch(/^\/fonts\/viking-[a-z-]+\.woff2$/);
			const file = path.join(PUBLIC, url);
			expect(fs.existsSync(file)).toBe(true);
			const bytes = fs.readFileSync(file);
			expect(bytes.subarray(0, 4).toString('latin1')).toBe('wOF2');
			expect(bytes.length).toBeLessThan(16 * 1024);
		}
		for (const licence of ['OFL-NotoSansRunic.txt']) {
			expect(fs.readFileSync(path.join(PUBLIC, 'fonts', licence), 'utf8')).toMatch(/SIL Open Font License/);
		}
		// The OFL reserves "New Rocker" for unmodified copies: the subset is renamed.
		expect(BRAND_CSS).not.toMatch(/New Rocker/);
	});

	test('the carved marks are small self-contained SVGs', () => {
		for (const f of MARKS) {
			const svg = fs.readFileSync(path.join(PUBLIC, 'img/brand', f), 'utf8');
			expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
			expect(svg).not.toMatch(/<script|href=/);
			expect(svg.length).toBeLessThan(8 * 1024);
		}
	});

	test('the installed app keeps them for offline Viking play', () => {
		const tag = document.createElement('script');
		tag.src = 'dist/app.bundle.js?v=9';
		document.head.appendChild(tag);
		window.__BUNDLE_VERSION__ = '9';
		const urls = urlsToKeep();
		for (const f of FONT_FILES) expect(urls).toContain(new URL(`/fonts/${f}`, window.location.href).href);
		for (const f of MARKS) expect(urls).toContain(new URL(`/img/brand/${f}`, window.location.href).href);
	});

	test('the offline app build copies the fonts folder', () => {
		const buildApp = fs.readFileSync(path.join(__dirname, '../../scripts/build-app.js'), 'utf8');
		expect(buildApp).toMatch(/ASSET_DIRS = \[[^\]]*'fonts'/);
	});
});
