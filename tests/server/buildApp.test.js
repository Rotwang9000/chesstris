/**
 * The offline app's index.html (scripts/build-app.js) is derived from the
 * website's: if index.html changes shape, the build must fail loudly
 * rather than ship an app that quietly reaches for the network.
 */

const fs = require('fs');
const path = require('path');
const { transformIndexHtml } = require('../../scripts/build-app');

const html = fs.readFileSync(path.join(__dirname, '../../public/index.html'), 'utf8');

describe('offline app index.html', () => {
	const out = transformIndexHtml(html);

	test('turns offline mode on before any other script runs', () => {
		const flag = out.indexOf('window.__TETCHES_OFFLINE__ = true');
		expect(flag).toBeGreaterThan(-1);
		expect(flag).toBeLessThan(out.indexOf('<script>', out.indexOf('<script>') + 1));
	});

	test('loads only local files', () => {
		const live = out.replace(/<!--[\s\S]*?-->/g, '');
		expect(live).not.toMatch(/src="https?:/);
		expect(live).not.toMatch(/socket\.io\.min\.js/);
		expect(live).toMatch(/src="vendor\/three\.min\.js"/);
		expect(live).toMatch(/href="fonts\/playfair-display\.css"/);
		expect(live).toMatch(/<script src="dist\/app\.bundle\.js" defer><\/script>/);
	});

	test('fails loudly if index.html changes shape', () => {
		expect(() => transformIndexHtml(html.replace('three@0.132.2/build', 'three@0.150.0/build')))
			.toThrow(/expected one/);
	});
});
