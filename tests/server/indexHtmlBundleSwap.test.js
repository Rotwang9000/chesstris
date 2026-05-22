'use strict';

/**
 * Bundle-swap middleware: the production deploy ships a single
 * `dist/app.bundle.js` instead of ~70 separate ES modules. The
 * middleware checks for the bundle's presence on disk and rewrites
 * the entry `<script>` tag in `index.html` accordingly, so the same
 * HTML template works in dev (unbundled) and prod (bundled).
 *
 * This test plants a fake project tree in a tmp dir so we can flip
 * the bundle file in and out and confirm both paths.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const express = require('express');
const request = require('supertest');

const { createIndexHtmlBundleSwap } = require('../../server/bundling/indexHtmlBundleSwap');

const ENTRY_TAG = '<script type="module" src="js/main-enhanced.js"></script>';

function makeTmpProject(opts = {}) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tetches-bundle-test-'));
	const publicDir = path.join(root, 'public');
	const distDir = path.join(publicDir, 'dist');
	fs.mkdirSync(publicDir, { recursive: true });
	if (opts.withBundle) fs.mkdirSync(distDir, { recursive: true });
	const html = `<!doctype html><html><head><title>Tetches</title></head><body>${ENTRY_TAG}</body></html>`;
	fs.writeFileSync(path.join(publicDir, 'index.html'), html);
	if (opts.withBundle) {
		fs.writeFileSync(path.join(distDir, 'app.bundle.js'), 'console.log("test bundle");');
	}
	return root;
}

function makeApp(root) {
	const app = express();
	const { middleware } = createIndexHtmlBundleSwap({ projectRoot: root });
	app.use(middleware);
	app.use((_req, res) => res.status(404).send('not found'));
	return app;
}

describe('indexHtmlBundleSwap', () => {
	test('leaves the entrypoint tag alone when no bundle exists', async () => {
		const root = makeTmpProject({ withBundle: false });
		const app = makeApp(root);
		const res = await request(app).get('/').expect(200);
		expect(res.text).toContain(ENTRY_TAG);
		expect(res.text).not.toContain('dist/app.bundle.js');
		fs.rmSync(root, { recursive: true, force: true });
	});

	test('rewrites the entrypoint tag to the bundle when present', async () => {
		const root = makeTmpProject({ withBundle: true });
		const app = makeApp(root);
		const res = await request(app).get('/').expect(200);
		expect(res.text).not.toContain(ENTRY_TAG);
		expect(res.text).toMatch(/<script src="dist\/app\.bundle\.js\?v=\d+" defer><\/script>/);
		fs.rmSync(root, { recursive: true, force: true });
	});

	test('serves bundle-swapped HTML on /2d', async () => {
		const root = makeTmpProject({ withBundle: true });
		const app = makeApp(root);
		const res = await request(app).get('/2d').expect(200);
		expect(res.text).toContain('dist/app.bundle.js');
		fs.rmSync(root, { recursive: true, force: true });
	});

	test('passes non-HTML routes through to next handler', async () => {
		const root = makeTmpProject({ withBundle: true });
		const app = makeApp(root);
		const res = await request(app).get('/some/asset.png').expect(404);
		expect(res.text).toBe('not found');
		fs.rmSync(root, { recursive: true, force: true });
	});

	test('reports bundle status string', () => {
		const root = makeTmpProject({ withBundle: false });
		const { bundleStatus } = createIndexHtmlBundleSwap({ projectRoot: root });
		expect(bundleStatus()).toMatch(/unbundled/);
		fs.rmSync(root, { recursive: true, force: true });

		const root2 = makeTmpProject({ withBundle: true });
		const { bundleStatus: status2 } = createIndexHtmlBundleSwap({ projectRoot: root2 });
		expect(status2()).toMatch(/bundled \(mtime \d+\)/);
		fs.rmSync(root2, { recursive: true, force: true });
	});
});
