#!/usr/bin/env node
/**
 * Client bundler.
 *
 * Bundles `public/js/main-enhanced.js` (and every ES module it
 * imports) into a single `public/dist/app.bundle.js`. The server
 * detects the bundle's presence at boot and rewrites the
 * `<script type="module" src="js/main-enhanced.js">` tag in
 * `index.html` to a single `<script src="dist/app.bundle.js">`,
 * so production users load 1 file instead of ~60.
 *
 * Why esbuild (vs Vite / Webpack)?
 *   • Zero-config — one CLI call, no config file pollution.
 *   • 100ms cold build for our entire client tree.
 *   • Output is a plain IIFE, no runtime, no chunked dynamic imports
 *     that fight with our nginx caching policy.
 *
 * Why not eject from ES modules?
 *   • Dev experience: changes are picked up by the page reload with
 *     no rebuild step required (the un-bundled modules are still
 *     loadable directly). Production gets the bundle.
 *
 * THREE.js and Socket.IO are still loaded via CDN <script> tags in
 * `index.html` (see top of that file) and exposed on `window`. We
 * mark them as external here so esbuild doesn't try to re-bundle
 * them — they're already cached by the CDN.
 */

'use strict';

const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const ENTRY = path.join(ROOT, 'public', 'js', 'main-enhanced.js');
const OUT_DIR = path.join(ROOT, 'public', 'dist');
const OUT_FILE = path.join(OUT_DIR, 'app.bundle.js');
const META_FILE = path.join(OUT_DIR, 'meta.json');
// The Viking edition's longship builder is its own file, fetched only
// when a Viking battle needs it (public/js/viking/longshipLazy.js).
const VIKING_ENTRY = path.join(ROOT, 'public', 'js', 'viking', 'longshipChunk.js');
const VIKING_OUT = path.join(OUT_DIR, 'viking.bundle.js');
const LONGSHIP_REAL = path.join(ROOT, 'public', 'js', 'viking', 'longship.js');
const LONGSHIP_LAZY = path.join(ROOT, 'public', 'js', 'viking', 'longshipLazy.js');

/** In the app bundle, `viking/longship.js` is the on-demand loader. */
const lazyLongship = {
	name: 'lazy-longship',
	setup(b) {
		b.onResolve({ filter: /(^|\/)longship\.js$/ }, (args) => {
			const resolved = path.resolve(args.resolveDir, args.path);
			return resolved === LONGSHIP_REAL ? { path: LONGSHIP_LAZY } : undefined;
		});
	},
};

const isWatch = process.argv.includes('--watch');

function ensureOutDir() {
	if (!fs.existsSync(OUT_DIR)) {
		fs.mkdirSync(OUT_DIR, { recursive: true });
	}
}

const sharedOptions = {
	entryPoints: [ENTRY],
	bundle: true,
	outfile: OUT_FILE,
	format: 'iife',
	platform: 'browser',
	target: ['chrome120', 'firefox121', 'safari17', 'edge120'],
	minify: !isWatch,
	sourcemap: isWatch ? 'inline' : true,
	logLevel: 'info',
	// THREE + socket.io are loaded via CDN <script>; their globals
	// (`THREE`, `io`) are referenced by the client code.
	define: {
		'process.env.NODE_ENV': isWatch ? '"development"' : '"production"',
	},
	loader: {
		'.js': 'js',
		'.css': 'css',
	},
	metafile: true,
};

async function build() {
	ensureOutDir();
	if (isWatch) {
		console.log('[build-client] starting esbuild in watch mode…');
		const ctx = await esbuild.context(sharedOptions);
		await ctx.watch();
		console.log('[build-client] watching ' + path.relative(ROOT, ENTRY) +
			' → ' + path.relative(ROOT, OUT_FILE));
		return;
	}

	console.log('[build-client] bundling ' + path.relative(ROOT, ENTRY) +
		' → ' + path.relative(ROOT, OUT_FILE));
	const result = await esbuild.build({ ...sharedOptions, plugins: [lazyLongship] });
	const viking = await esbuild.build({
		...sharedOptions,
		entryPoints: [VIKING_ENTRY],
		outfile: VIKING_OUT,
		metafile: false,
	});
	if (viking.errors?.length) throw new Error('viking chunk failed');
	console.log(`[build-client] longship chunk → ${(fs.statSync(VIKING_OUT).size / 1024).toFixed(1)} KiB`);
	if (result.metafile) {
		fs.writeFileSync(META_FILE, JSON.stringify(result.metafile));
	}

	const stat = fs.statSync(OUT_FILE);
	const kb = (stat.size / 1024).toFixed(1);
	const fileCount = Object.keys(result.metafile?.inputs || {}).length;
	console.log(`[build-client] bundled ${fileCount} files → ${kb} KiB`);
}

build().catch(err => {
	console.error('[build-client] build failed:', err);
	process.exit(1);
});
