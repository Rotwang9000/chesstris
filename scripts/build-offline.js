#!/usr/bin/env node
/**
 * Offline engine bundler.
 *
 * Bundles `offline/engine.js` — the game's server code plus an
 * in-memory socket.io stand-in — into `public/dist/offline-engine.js`,
 * a Web Worker script. Node-only modules are swapped for the browser
 * shims in `offline/shims/` (disk persistence, logging, metrics, Sentry,
 * the visitor funnel, the HTTP API, crypto, Buffer/process globals).
 *
 * Usage: node scripts/build-offline.js [--watch]
 */

'use strict';

const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const SHIMS = path.join(ROOT, 'offline', 'shims');
const OUT_FILE = path.join(ROOT, 'public', 'dist', 'offline-engine.js');
const isWatch = process.argv.includes('--watch');

// Project files replaced wholesale (resolved absolute path → shim).
const FILE_SHIMS = {
	[path.join(ROOT, 'server', 'persistence.js')]: 'persistence.js',
	[path.join(ROOT, 'server', 'observability', 'logger.js')]: 'logger.js',
	[path.join(ROOT, 'server', 'observability', 'metrics.js')]: 'metrics.js',
	[path.join(ROOT, 'server', 'observability', 'sentry.js')]: 'sentry.js',
	[path.join(ROOT, 'server', 'observability', 'funnel.js')]: 'funnel.js',
	[path.join(ROOT, 'routes', 'api.js')]: 'externalApi.js',
};

// Bare Node modules.
const MODULE_SHIMS = {
	crypto: 'crypto.js',
	fs: 'empty.js',
	path: 'empty.js',
};

const shimPlugin = {
	name: 'offline-shims',
	setup(build) {
		build.onResolve({ filter: /^(crypto|fs|path)$/ }, (args) => ({
			path: path.join(SHIMS, MODULE_SHIMS[args.path]),
		}));
		build.onResolve({ filter: /^\.\.?\// }, (args) => {
			let resolved = path.resolve(args.resolveDir, args.path);
			if (!resolved.endsWith('.js')) resolved += '.js';
			const shim = FILE_SHIMS[resolved];
			return shim ? { path: path.join(SHIMS, shim) } : undefined;
		});
	},
};

const options = {
	entryPoints: [path.join(ROOT, 'offline', 'engine.js')],
	bundle: true,
	outfile: OUT_FILE,
	format: 'iife',
	platform: 'browser',
	target: ['chrome120', 'firefox121', 'safari17', 'edge120'],
	minify: !isWatch,
	sourcemap: true,
	inject: [path.join(SHIMS, 'globals.js')],
	define: { 'process.env.NODE_ENV': '"production"' },
	plugins: [shimPlugin],
	logLevel: 'info',
	metafile: true,
};

/** Build the engine; `outfile`/`minify` overridable (tests build to a temp dir). */
async function buildOffline({ outfile = OUT_FILE, minify = !isWatch, logLevel = 'info' } = {}) {
	fs.mkdirSync(path.dirname(outfile), { recursive: true });
	const result = await esbuild.build({ ...options, outfile, minify, logLevel });
	return { outfile, inputs: Object.keys(result.metafile.inputs) };
}

async function build() {
	if (isWatch) {
		const ctx = await esbuild.context(options);
		await ctx.watch();
		console.log('[build-offline] watching offline/engine.js');
		return;
	}
	const { inputs: files } = await buildOffline();
	const kb = (fs.statSync(OUT_FILE).size / 1024).toFixed(1);
	console.log(`[build-offline] bundled ${files.length} files → ${kb} KiB`);
	const leaked = files.filter(f => /node_modules/.test(f));
	if (leaked.length) console.log('[build-offline] packages bundled:', leaked.join(', '));
}

if (require.main === module) {
	build().catch((err) => {
		console.error('[build-offline] build failed:', err);
		process.exit(1);
	});
}

module.exports = { buildOffline };
