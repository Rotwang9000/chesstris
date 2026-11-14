/**
 * The Viking edition's own file (scripts/vikingSplit.js): standard
 * visitors' app bundle carries none of the Viking code, the chunk
 * bundles none of the app, and the two meet only through the names
 * the chunk imports.
 */

const path = require('path');
const esbuild = require('esbuild');
const split = require('../../scripts/vikingSplit');

const ROOT = path.resolve(__dirname, '../..');
const JS = path.join(ROOT, 'public', 'js');
const ENTRY = path.join(JS, 'main-enhanced.js');
const OPTIONS = {
	absWorkingDir: ROOT,
	entryPoints: [ENTRY],
	bundle: true,
	format: 'iife',
	platform: 'browser',
	target: ['chrome120'],
	write: false,
	metafile: true,
	logLevel: 'silent',
};

describe('which modules are Viking-only', () => {
	test('the Viking directories, bar the doors the app keeps', () => {
		expect(split.isVikingOnly(path.join(JS, 'viking', 'theme.js'))).toBe(true);
		expect(split.isVikingOnly(path.join(JS, 'longships', 'shipControls.js'))).toBe(true);
		expect(split.isVikingOnly(path.join(JS, 'paintings', 'paintingDirector.js'))).toBe(true);
		expect(split.isVikingOnly(path.join(JS, 'paintings', 'index.js'))).toBe(false);
		expect(split.isVikingOnly(path.join(JS, 'longships', 'shipEvents.js'))).toBe(false);
		expect(split.isVikingOnly(path.join(JS, 'edition.js'))).toBe(false);
		expect(split.isVikingOnly(path.join(JS, 'battle', 'vikingRules.js'))).toBe(false);
		expect(split.isVikingOnly(path.join(JS, 'vikingLazy', 'runtime.js'))).toBe(false);
	});
});

describe('reading imports', () => {
	test('default, named, renamed, mixed, multi-line, re-exports and stars', () => {
		const src = `
			// import nope from './commented.js';
			/* import { gone } from './block.js'; */
			import gameState from '../utils/gameState.js';
			import { a, b as c } from './x.js';
			import d, { e } from './y.js';
			import {
				f,
				g,
			} from './z.js';
			import * as ns from './ns.js';
			export { h } from './re.js';
			export * from './star.js';
			const url = 'https://example.com/import x from "./no.js"';
		`;
		const got = Object.fromEntries(split.staticImports(src).map(i => [i.spec, { names: [...i.names].sort(), star: i.star }]));
		expect(got).toEqual({
			'../utils/gameState.js': { names: ['default'], star: false },
			'./x.js': { names: ['a', 'b'], star: false },
			'./y.js': { names: ['default', 'e'], star: false },
			'./z.js': { names: ['f', 'g'], star: false },
			'./ns.js': { names: [], star: true },
			'./re.js': { names: ['h'], star: false },
			'./star.js': { names: [], star: true },
		});
	});

	test('a let export is noticed (a snapshot would go stale)', () => {
		expect(split.exportsMutable('export let count = 0;', 'count')).toBe(true);
		expect(split.exportsMutable('export const count = 0;', 'count')).toBe(false);
		expect(split.exportsMutable('export function count() {}', 'count')).toBe(false);
	});
});

describe('the two bundles', () => {
	let hosts;
	let build;
	let app;
	let chunk;

	beforeAll(async () => {
		({ hosts, build } = await split.analyseChunk(esbuild, OPTIONS));
		chunk = await esbuild.build({
			...OPTIONS, entryPoints: [split.CHUNK_ENTRY], plugins: [split.chunkPlugin(hosts)],
		});
		app = await esbuild.build({ ...OPTIONS, plugins: [split.appPlugin({ entry: ENTRY, hosts, build })] });
	}, 30000);

	test('the app bundle has no Viking-only module, and says which build its chunk is', () => {
		expect(() => split.assertSplit(app.metafile)).not.toThrow();
		const inputs = Object.keys(app.metafile.inputs);
		expect(inputs.some(f => f.includes('vikingLazy/runtime.js'))).toBe(true);
		expect(inputs.some(f => f.includes('vikingLazy/loader.js'))).toBe(false);
		const text = app.outputFiles[0].text;
		expect(text).toContain(`__tetchesHostBuild = ${JSON.stringify(build)}`);
		expect(text).not.toMatch(/function buildLongship|paintingSettingLabel/);
	});

	test('the chunk bundles no app module: they are the running app’s', () => {
		const inputs = Object.keys(chunk.metafile.inputs).map(f => path.resolve(ROOT, f));
		const appModules = inputs.filter(f => f.startsWith(JS) && f !== split.CHUNK_ENTRY && !split.isVikingOnly(f));
		expect(appModules).toEqual([]);
		expect(hosts.map(h => path.relative(JS, h.file))).toEqual(expect.arrayContaining([
			'utils/gameState.js', 'edition.js', 'showToastMessage.js',
		]));
		expect(hosts.find(h => h.file.endsWith('utils/gameState.js')).names).toEqual(['default']);
		for (const h of hosts) expect(split.isVikingOnly(h.file)).toBe(false);
	});

	test('the fingerprint follows the host list', () => {
		const other = split.registrySource(hosts.slice(1), 'zzz');
		expect(other).toContain('"zzz"');
		expect(split.hostShim(0, ['default', 'a'])).toBe('const m = window.__tetchesHost[0];\nexport const a = m.a;\nexport default m.default;');
	});
});
