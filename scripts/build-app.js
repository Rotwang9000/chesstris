#!/usr/bin/env node
/**
 * Offline app bundle.
 *
 * Builds `app/www/`: a self-contained copy of the game that runs with no
 * network at all, in offline mode (battles against the computer, the
 * game's server code running in a Web Worker). It's the web folder a
 * native wrapper (Capacitor) packages into the Android / iOS app, and it
 * also works served as plain static files.
 *
 * What changes from the website's index.html:
 *   • `window.__TETCHES_OFFLINE__ = true` before anything else runs;
 *   • three.js and the Playfair Display font come from local copies
 *     (devDependencies `three@0.132.2`, `@fontsource/playfair-display`)
 *     instead of CDNs; socket.io isn't loaded at all;
 *   • the client loads as the one minified bundle.
 *
 * Usage: node scripts/build-app.js   (runs the client + offline builds first)
 */

'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const OUT = path.join(ROOT, 'app', 'www');
const THREE = path.join(ROOT, 'node_modules', 'three');
const FONT = path.join(ROOT, 'node_modules', '@fontsource', 'playfair-display', 'files');

// Static assets the game page uses (the client JS is bundled).
const ASSET_DIRS = ['img', 'css', 'sounds', 'textures', 'models'];
const ASSET_FILES = ['styles.css', 'favicon.svg'];

const THREE_VERSION = '0.132.2';
const VENDOR = {
	[`https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/build/three.min.js`]: ['build/three.min.js', 'vendor/three.min.js'],
	[`https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/examples/js/controls/OrbitControls.js`]: ['examples/js/controls/OrbitControls.js', 'vendor/OrbitControls.js'],
	[`https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/examples/js/loaders/GLTFLoader.js`]: ['examples/js/loaders/GLTFLoader.js', 'vendor/GLTFLoader.js'],
};

function copy(from, to) {
	fs.mkdirSync(path.dirname(to), { recursive: true });
	fs.cpSync(from, to, { recursive: true });
}

/** Swap exactly one occurrence of `from` in `html`, or fail loudly. */
function swap(html, from, to) {
	const count = html.split(from).length - 1;
	if (count !== 1) throw new Error(`build-app: expected one "${from.slice(0, 80)}" in index.html, found ${count}`);
	return html.replace(from, to);
}

function transformIndexHtml(html) {
	let out = html;
	out = swap(out, '<meta charset="UTF-8">',
		'<meta charset="UTF-8">\n\t<script>window.__TETCHES_OFFLINE__ = true;</script>');
	for (const [cdn, [, local]] of Object.entries(VENDOR)) {
		out = swap(out, `src="${cdn}"`, `src="${local}"`);
	}
	out = swap(out, '\t<script src="https://cdn.jsdelivr.net/npm/socket.io-client@4.8.1/dist/socket.io.min.js" defer></script>\n', '');
	out = swap(out, '\t<link rel="preconnect" href="https://cdn.jsdelivr.net">\n', '');
	out = swap(out, '\t<link rel="preconnect" href="https://fonts.googleapis.com">\n', '');
	out = swap(out, '\t<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n', '');
	out = swap(out,
		'<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap">',
		'<link rel="stylesheet" href="fonts/playfair-display.css">');
	out = swap(out, '<script type="module" src="js/main-enhanced.js"></script>',
		'<script src="dist/app.bundle.js" defer></script>');
	// Nothing may still reach for the network.
	const remote = out.replace(/<!--[\s\S]*?-->/g, '').match(/(?:src|href)="https?:\/\/(?!tetches\.com\/")[^"]+"/g);
	if (remote) throw new Error(`build-app: index.html still loads remote files: ${remote.join(', ')}`);
	return out;
}

function fontCss() {
	return [400, 700].map(weight => `@font-face {
	font-family: 'Playfair Display';
	font-style: normal;
	font-weight: ${weight};
	font-display: swap;
	src: url('playfair-display-latin-${weight}-normal.woff2') format('woff2');
}`).join('\n') + '\n';
}

function build() {
	for (const script of ['build-client.js', 'build-offline.js']) {
		execFileSync(process.execPath, [path.join(__dirname, script)], { stdio: 'inherit' });
	}
	const threeVersion = require(path.join(THREE, 'package.json')).version;
	if (threeVersion !== THREE_VERSION) {
		throw new Error(`build-app: need three@${THREE_VERSION} (the website's version), found ${threeVersion}`);
	}

	fs.rmSync(OUT, { recursive: true, force: true });
	fs.mkdirSync(OUT, { recursive: true });

	for (const dir of ASSET_DIRS) {
		if (fs.existsSync(path.join(PUBLIC, dir))) copy(path.join(PUBLIC, dir), path.join(OUT, dir));
	}
	for (const file of ASSET_FILES) copy(path.join(PUBLIC, file), path.join(OUT, file));
	for (const file of ['app.bundle.js', 'offline-engine.js']) {
		copy(path.join(PUBLIC, 'dist', file), path.join(OUT, 'dist', file));
	}
	for (const [, [from, to]] of Object.entries(VENDOR)) copy(path.join(THREE, from), path.join(OUT, to));
	for (const weight of [400, 700]) {
		const name = `playfair-display-latin-${weight}-normal.woff2`;
		copy(path.join(FONT, name), path.join(OUT, 'fonts', name));
	}
	fs.writeFileSync(path.join(OUT, 'fonts', 'playfair-display.css'), fontCss());

	const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
	fs.writeFileSync(path.join(OUT, 'index.html'), transformIndexHtml(html));

	const bytes = (dir) => fs.readdirSync(dir, { withFileTypes: true })
		.reduce((n, e) => n + (e.isDirectory() ? bytes(path.join(dir, e.name)) : fs.statSync(path.join(dir, e.name)).size), 0);
	console.log(`[build-app] app/www ready — ${(bytes(OUT) / 1024 / 1024).toFixed(1)} MB`);
}

if (require.main === module) {
	try {
		build();
	} catch (err) {
		console.error(err.message || err);
		process.exit(1);
	}
}

module.exports = { transformIndexHtml };
