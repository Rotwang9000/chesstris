'use strict';

/**
 * Bundle-aware index.html serving.
 *
 * In dev `public/index.html` loads the client as ~70 separate ES
 * module requests (one per file under `public/js/**`). For production
 * we want to ship one minified bundle instead, but we don't want to
 * maintain a second copy of index.html that drifts.
 *
 * This middleware checks for `public/dist/app.bundle.js` at server
 * boot. If it exists, it rewrites the
 *   `<script type="module" src="js/main-enhanced.js"></script>`
 * tag on the way out the door, so the same `index.html` template
 * works in dev (unbundled) and prod (bundled).
 *
 * It also serves an `index.html` no-cache header so a redeploy
 * always picks up new bundles (the bundle itself is content-hashed
 * via mtime + `Cache-Control: immutable` further upstream in nginx).
 */

const fs = require('fs');
const path = require('path');

const ENTRY_TAG = '<script type="module" src="js/main-enhanced.js"></script>';
const BUNDLE_HREF = 'dist/app.bundle.js';

function buildBundleScriptTag(version) {
	const v = version ? `?v=${version}` : '';
	// Embed the bundle version on `window.__BUNDLE_VERSION__` so
	// client-side code can compare against the version advertised by
	// the server on socket connect. A stale tab open since before a
	// redeploy will mismatch and prompt the user to refresh.
	const versionPin = version
		? `<script>window.__BUNDLE_VERSION__=${JSON.stringify(String(version))};</script>`
		: '';
	return `${versionPin}<script src="${BUNDLE_HREF}${v}" defer></script>`;
}

/**
 * @param {{ projectRoot: string }} opts
 * @returns {{ middleware: import('express').RequestHandler, bundleStatus: () => string }}
 */
function createIndexHtmlBundleSwap({ projectRoot } = {}) {
	if (!projectRoot) throw new Error('createIndexHtmlBundleSwap: projectRoot required');

	const indexPath = path.join(projectRoot, 'public', 'index.html');
	const bundlePath = path.join(projectRoot, 'public', 'dist', 'app.bundle.js');

	let bundleExists = false;
	let bundleVersion = '';
	let cachedHtml = null;
	let cachedAt = 0;

	function refreshBundleStatus() {
		try {
			const stat = fs.statSync(bundlePath);
			bundleExists = stat.size > 0;
			bundleVersion = String(Math.floor(stat.mtimeMs));
		} catch (_e) {
			bundleExists = false;
			bundleVersion = '';
		}
	}

	function readAndSwap() {
		if (cachedHtml && Date.now() - cachedAt < 5000) return cachedHtml;
		let html;
		try {
			html = fs.readFileSync(indexPath, 'utf8');
		} catch (err) {
			throw new Error(`Failed to read index.html: ${err.message}`, { cause: err });
		}
		refreshBundleStatus();
		if (bundleExists && html.includes(ENTRY_TAG)) {
			html = html.replace(ENTRY_TAG, buildBundleScriptTag(bundleVersion));
		}
		cachedHtml = html;
		cachedAt = Date.now();
		return html;
	}

	refreshBundleStatus();

	const middleware = (req, res, next) => {
		// Only intercept when the resource being served is the SPA
		// shell. Asset requests still flow through `express.static`.
		if (req.method !== 'GET' && req.method !== 'HEAD') return next();
		const sendIndex = () => {
			try {
				const html = readAndSwap();
				res.set('Cache-Control', 'no-cache');
				res.type('html').send(html);
			} catch (err) {
				next(err);
			}
		};

		if (req.path === '/' || req.path === '/index.html' || req.path === '/2d') {
			return sendIndex();
		}
		next();
	};

	const bundleStatus = () =>
		bundleExists ? `bundled (mtime ${bundleVersion})` : 'unbundled (no app.bundle.js)';

	/**
	 * Expose the live bundle version so the server can advertise it
	 * to clients via the socket handshake. Stale clients use this to
	 * detect that a redeploy has happened and prompt the player to
	 * refresh — important because cheating / older front-ends could
	 * otherwise stay connected indefinitely on logic that's drifted
	 * out of sync with the current server.
	 */
	const getBundleVersion = () => {
		refreshBundleStatus();
		return bundleVersion || '';
	};

	return { middleware, bundleStatus, getBundleVersion };
}

module.exports = { createIndexHtmlBundleSwap };
