/**
 * Tests that client-side ES modules do not contain import paths that
 * will break when served through nginx or without Express node_modules
 * static middleware.
 *
 * Specifically guards against:
 * - Imports from /node_modules/ (these 404 through nginx static regex)
 * - Imports that depend on Express-only routing hacks
 */
const fs = require('fs');
const path = require('path');

const PUBLIC_JS_DIR = path.join(__dirname, '../../public/js');
const PUBLIC_UTILS_DIR = path.join(__dirname, '../../public/utils');

function getClientJsFiles() {
	const dirs = [PUBLIC_JS_DIR, PUBLIC_UTILS_DIR];
	const files = [];
	for (const dir of dirs) {
		if (!fs.existsSync(dir)) continue;
		const entries = fs.readdirSync(dir, { recursive: true });
		for (const entry of entries) {
			const full = path.join(dir, entry);
			if (full.endsWith('.js') && fs.statSync(full).isFile()) {
				files.push(full);
			}
		}
	}
	return files;
}

describe('Client-side ES module imports', () => {
	const nodeModulesImportRe = /(?:import|export)\s.+from\s+['"]\/node_modules\//;

	// Catches typos like `import x from './uiUtils.js'` where the target
	// doesn't actually exist – these break the entire module graph in the
	// browser and the user just sees a blank screen.
	test('every relative import resolves to a file on disk', () => {
		const files = getClientJsFiles();
		expect(files.length).toBeGreaterThan(0);

		const importRe = /(?:^|[\s;{])(?:import|export)\b[^'"`]*?from\s+['"]((?:\.\.?\/)[^'"`]+)['"]/gm;
		const violations = [];

		// Strip both /* */ block comments and // line comments so we don't
		// flag commented-out import statements.
		const stripComments = (src) => src
			.replace(/\/\*[\s\S]*?\*\//g, '')
			.replace(/^\s*\/\/.*$/gm, '');

		for (const file of files) {
			const content = stripComments(fs.readFileSync(file, 'utf8'));
			const dir = path.dirname(file);
			let m;
			importRe.lastIndex = 0;
			while ((m = importRe.exec(content)) !== null) {
				const spec = m[1].split('?')[0].split('#')[0];
				const resolved = path.resolve(dir, spec);
				const tryPaths = [resolved];
				if (!path.extname(resolved)) {
					tryPaths.push(`${resolved}.js`, `${resolved}.mjs`, path.join(resolved, 'index.js'));
				}
				const ok = tryPaths.some(p => {
					try { return fs.statSync(p).isFile(); } catch { return false; }
				});
				if (!ok) {
					violations.push({
						file: path.relative(path.join(__dirname, '../..'), file),
						spec,
					});
				}
			}
		}

		if (violations.length > 0) {
			const detail = violations.map(v => `  ${v.file} → ${v.spec}`).join('\n');
			throw new Error(`Broken relative import(s) detected:\n${detail}`);
		}
	});

	test('no JS file imports from /node_modules/ (breaks behind nginx)', () => {
		const files = getClientJsFiles();
		expect(files.length).toBeGreaterThan(0);

		const violations = [];
		for (const file of files) {
			const content = fs.readFileSync(file, 'utf8');
			const lines = content.split('\n');
			lines.forEach((line, idx) => {
				if (nodeModulesImportRe.test(line)) {
					violations.push({
						file: path.relative(path.join(__dirname, '../..'), file),
						line: idx + 1,
						text: line.trim(),
					});
				}
			});
		}

		if (violations.length > 0) {
			const detail = violations
				.map((v) => `  ${v.file}:${v.line} → ${v.text}`)
				.join('\n');
			throw new Error(
				`Found ${violations.length} client-side import(s) from /node_modules/ which will 404 through nginx:\n${detail}`
			);
		}
	});

	test('NetworkManagerClass.js does not import socket.io from node_modules', () => {
		const file = path.join(PUBLIC_JS_DIR, 'utils', 'NetworkManagerClass.js');
		expect(fs.existsSync(file)).toBe(true);

		const content = fs.readFileSync(file, 'utf8');
		expect(content).not.toMatch(/from\s+['"]\/node_modules\//);
	});

	test('NetworkManagerClass.js references socket.io io() function', () => {
		const file = path.join(PUBLIC_JS_DIR, 'utils', 'NetworkManagerClass.js');
		const content = fs.readFileSync(file, 'utf8');
		expect(content).toMatch(/\bio\s*\(/);
	});
});

describe('index.html socket.io setup', () => {
	test('loads socket.io client from CDN', () => {
		const html = fs.readFileSync(
			path.join(__dirname, '../../public/index.html'),
			'utf8'
		);
		expect(html).toMatch(/socket\.io.*\.js/);
		expect(html).toMatch(/cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|unpkg\.com/);
	});

	test('does not duplicate socket.io with a /socket.io/socket.io.js script tag', () => {
		const html = fs.readFileSync(
			path.join(__dirname, '../../public/index.html'),
			'utf8'
		);
		const socketScriptTags = html.match(/<script[^>]*src=["'][^"']*socket\.io[^"']*["']/g) || [];
		expect(socketScriptTags.length).toBeLessThanOrEqual(1);
	});
});

describe('nginx config validity', () => {
	const NGINX_CONFIGS = [
		path.join(__dirname, '../../ci/nginx-staging.conf'),
		path.join(__dirname, '../../ci/nginx-production.conf'),
	];

	for (const configPath of NGINX_CONFIGS) {
		const basename = path.basename(configPath);
		const configExists = fs.existsSync(configPath);

		(configExists ? test : test.skip)(`${basename} uses ^~ for /socket.io/ location`, () => {
			const content = fs.readFileSync(configPath, 'utf8');
			expect(content).toMatch(/location\s+\^~\s+\/socket\.io\//);
		});

		(configExists ? test : test.skip)(`${basename} proxies /node_modules/ or excludes it from static regex`, () => {
			const content = fs.readFileSync(configPath, 'utf8');
			const hasNodeModulesProxy = /location.*\/node_modules\//.test(content);
			const staticRegexExcludesNodeModules = !content.includes('node_modules');
			expect(hasNodeModulesProxy || staticRegexExcludesNodeModules).toBe(true);
		});
	}
});
