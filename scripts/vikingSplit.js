'use strict';

/**
 * The Viking edition's own file (scripts/build-client.js).
 *
 * Standard visitors should not download the Viking code, and the client
 * bundle is one IIFE (no chunked imports), so the split is done here:
 *
 *   • every module under js/viking/, js/longships/ and js/paintings/ —
 *     bar the small doors listed in STAYS — is Viking-only and goes into
 *     dist/viking.bundle.js (entry js/vikingLazy/chunk.js);
 *   • in dist/app.bundle.js each Viking-only module the app imports is
 *     replaced by its stub (js/vikingLazy/stubs/, same relative path),
 *     and js/vikingLazy/loader.js by runtime.js, which fetches the chunk
 *     when the Viking edition is in force;
 *   • the chunk's imports of the app's own modules ("host" modules) are
 *     not bundled again: each becomes a shim reading the running app's
 *     copy from `window.__tetchesHost[i]`, which the app bundle fills
 *     from a generated list of exactly the names the chunk imports;
 *   • the chunk runs only beside the app bundle it was built with
 *     (`__tetchesHostBuild`, a fingerprint of that list), so a stale
 *     cached chunk can never meet a newer app.
 *
 * Unbundled (dev pages, tests) none of this applies: the real modules
 * are imported directly.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const JS = path.join(ROOT, 'public', 'js');
const LAZY = path.join(JS, 'vikingLazy');
const STUBS = path.join(LAZY, 'stubs');
const CHUNK_ENTRY = path.join(LAZY, 'chunk.js');
const LOADER = path.join(LAZY, 'loader.js');
const RUNTIME = path.join(LAZY, 'runtime.js');
const REGISTRY = 'tetches:viking-host-registry';

const VIKING_DIRS = ['viking', 'longships', 'paintings'].map(d => path.join(JS, d) + path.sep);
/** Small, Viking-flavoured modules the app bundle keeps (cheap, and on hot paths). */
const STAYS = new Set([
	path.join(JS, 'longships', 'shipEvents.js'),
	path.join(JS, 'paintings', 'index.js'),
]);

function rel(p) {
	return path.relative(ROOT, p).split(path.sep).join('/');
}

/** Does this file live only in dist/viking.bundle.js? */
function isVikingOnly(file) {
	if (!file || STAYS.has(file)) return false;
	return VIKING_DIRS.some(dir => file.startsWith(dir));
}

/** The app bundle's stand-in for a Viking-only module. */
function stubFor(file) {
	return path.join(STUBS, path.relative(JS, file));
}

function stripComments(src) {
	return src
		.replace(/\/\*[\s\S]*?\*\//g, ' ')
		.replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
}

/**
 * The static imports (and re-exports) of an ES module, from its text:
 * `[{ spec, names: Set, star: boolean }]`. `names` are the imported
 * names ('default' for a default import); `star` is an `import * as` or
 * `export *`. Our modules keep to the plain forms; the build checks the
 * result anyway (esbuild refuses a shim missing a name).
 */
function staticImports(src) {
	const code = stripComments(src);
	const out = [];
	const re = /(?:^|[\n;])\s*(import|export)\s*([\w$\s{},*]*?)\s*from\s*(['"])([^'"\n]+)\3/g;
	let m;
	while ((m = re.exec(code))) {
		const [, kind, clauseRaw, , spec] = m;
		const clause = clauseRaw.trim();
		const names = new Set();
		let star = false;
		if (/^\*/.test(clause) || /,\s*\*/.test(clause)) star = true;
		const braces = clause.match(/\{([^}]*)\}/);
		if (braces) {
			for (const part of braces[1].split(',')) {
				const name = part.trim().split(/\s+as\s+/)[0].trim();
				if (name) names.add(name);
			}
		}
		if (kind === 'import') {
			const head = clause.replace(/\{[^}]*\}/, '').split(',')[0].trim();
			if (head && !head.startsWith('*')) names.add('default');
		}
		out.push({ spec, names, star });
	}
	return out;
}

/** A name a module exports as a `let`/`var` (a live binding a snapshot would freeze). */
function exportsMutable(src, name) {
	const re = new RegExp(`export\\s+(?:let|var)\\s+[^;=]*\\b${name.replace(/\$/g, '\\$')}\\b`);
	return re.test(stripComments(src));
}

/**
 * Work out the host modules the chunk uses, and the names it imports
 * from each, from a metafile build of the chunk (host imports external).
 *
 * @returns {{ hosts: Array<{file:string, names:string[]}>, build: string }}
 */
async function analyseChunk(esbuild, baseOptions) {
	const external = {
		name: 'viking-host-scan',
		setup(b) {
			b.onResolve({ filter: /^\./ }, (args) => {
				const file = path.resolve(args.resolveDir, args.path);
				if (file === CHUNK_ENTRY || isVikingOnly(file)) return undefined;
				return { path: file, external: true };
			});
		},
	};
	const result = await esbuild.build({
		...baseOptions,
		entryPoints: [CHUNK_ENTRY],
		write: false,
		metafile: true,
		sourcemap: false,
		minify: false,
		logLevel: 'silent',
		plugins: [external],
	});
	const byHost = new Map();
	for (const input of Object.keys(result.metafile.inputs)) {
		const file = path.resolve(ROOT, input);
		const src = fs.readFileSync(file, 'utf8');
		for (const imp of staticImports(src)) {
			if (!imp.spec.startsWith('.')) {
				throw new Error(`[viking-split] ${rel(file)} imports "${imp.spec}": the chunk takes only relative imports`);
			}
			const target = path.resolve(path.dirname(file), imp.spec);
			if (target === CHUNK_ENTRY || isVikingOnly(target)) continue;
			if (imp.star) {
				throw new Error(`[viking-split] ${rel(file)} uses \`* \` from the app module ${rel(target)}: import the names it needs`);
			}
			if (!byHost.has(target)) byHost.set(target, new Set());
			for (const n of imp.names) byHost.get(target).add(n);
		}
	}
	const hosts = [...byHost.entries()]
		.map(([file, names]) => ({ file, names: [...names].sort() }))
		.sort((a, b) => (rel(a.file) < rel(b.file) ? -1 : 1));
	for (const { file, names } of hosts) {
		const src = fs.readFileSync(file, 'utf8');
		for (const n of names) {
			if (n !== 'default' && exportsMutable(src, n)) {
				throw new Error(`[viking-split] ${rel(file)} exports ${n} as a let/var: the chunk would see a stale copy`);
			}
		}
	}
	const build = crypto.createHash('sha256')
		.update(JSON.stringify(hosts.map(h => [rel(h.file), h.names])))
		.digest('hex').slice(0, 12);
	return { hosts, build };
}

/** The chunk's view of host module `i`: its names, read from the running app. */
function hostShim(i, names) {
	const lines = [`const m = window.__tetchesHost[${i}];`];
	const named = names.filter(n => n !== 'default');
	if (named.length) lines.push(`export const ${named.map(n => `${n} = m.${n}`).join(', ')};`);
	if (names.includes('default')) lines.push('export default m.default;');
	return lines.join('\n');
}

/** The app bundle's half: the list of host names the chunk reads. */
function registrySource(hosts, build) {
	const imports = [];
	const tables = [];
	hosts.forEach(({ file, names }, i) => {
		const local = names.map(n => `${n === 'default' ? 'default' : n} as h${i}_${n === 'default' ? 'default' : n}`);
		imports.push(`import { ${local.join(', ')} } from ${JSON.stringify(file)};`);
		tables.push(`{ ${names.map(n => `${JSON.stringify(n)}: h${i}_${n}`).join(', ')} }`);
	});
	return `${imports.join('\n')}
if (typeof window !== 'undefined') {
	window.__tetchesHostBuild = ${JSON.stringify(build)};
	window.__tetchesHostModules = () => [
		${tables.join(',\n\t\t')},
	];
}
`;
}

/** esbuild plugin for dist/viking.bundle.js. */
function chunkPlugin(hosts) {
	const index = new Map(hosts.map((h, i) => [h.file, i]));
	return {
		name: 'viking-chunk',
		setup(b) {
			b.onResolve({ filter: /^\./ }, (args) => {
				const file = path.resolve(args.resolveDir, args.path);
				if (file === CHUNK_ENTRY || isVikingOnly(file)) return undefined;
				if (!index.has(file)) {
					return { errors: [{ text: `[viking-split] ${rel(file)} was not in the host scan (imported by ${rel(args.importer)})` }] };
				}
				return { path: String(index.get(file)), namespace: 'viking-host' };
			});
			b.onLoad({ filter: /.*/, namespace: 'viking-host' }, (args) => {
				const i = Number(args.path);
				return { contents: hostShim(i, hosts[i].names), loader: 'js', resolveDir: JS };
			});
		},
	};
}

/** esbuild plugin for dist/app.bundle.js: stubs in, registry appended to the entry. */
function appPlugin({ entry, hosts, build }) {
	return {
		name: 'viking-stubs',
		setup(b) {
			b.onResolve({ filter: /^\./ }, (args) => {
				const file = path.resolve(args.resolveDir, args.path);
				if (file === LOADER) return { path: RUNTIME };
				if (!isVikingOnly(file)) return undefined;
				const stub = stubFor(file);
				if (!fs.existsSync(stub)) {
					return {
						errors: [{
							text: `[viking-split] ${rel(args.importer)} imports ${rel(file)}, which lives in the Viking chunk, `
								+ `and there is no stub at ${rel(stub)}`,
						}],
					};
				}
				return { path: stub };
			});
			b.onResolve({ filter: new RegExp(`^${REGISTRY}$`) }, () => ({ path: REGISTRY, namespace: 'viking-registry' }));
			b.onLoad({ filter: /.*/, namespace: 'viking-registry' }, () => ({
				contents: registrySource(hosts, build), loader: 'js', resolveDir: JS,
			}));
			// Last import of the entry: after the whole app has evaluated.
			b.onLoad({ filter: /\.js$/ }, (args) => {
				if (args.path !== entry) return undefined;
				const src = fs.readFileSync(entry, 'utf8');
				return { contents: `${src}\nimport ${JSON.stringify(REGISTRY)};\n`, loader: 'js' };
			});
		},
	};
}

/** Throw if any Viking-only module ended up in the app bundle. */
function assertSplit(metafile) {
	const leaked = Object.keys(metafile.inputs)
		.map(input => path.resolve(ROOT, input))
		.filter(isVikingOnly);
	if (leaked.length) {
		throw new Error(`[viking-split] Viking-only modules in the app bundle: ${leaked.map(rel).join(', ')}`);
	}
}

module.exports = {
	CHUNK_ENTRY, STUBS, LOADER, RUNTIME,
	isVikingOnly, stubFor, staticImports, exportsMutable,
	analyseChunk, chunkPlugin, appPlugin, assertSplit, hostShim, registrySource,
};
