/**
 * Agent discovery tests — the Gopher-over-HTTPS directory at
 * /.well-known/agent.gopher (convention: https://seneschal.space/gopher/).
 *
 * Contract pinned here:
 *   • correct content type (application/gopher for menus, text/plain
 *     for leaves) and open CORS so in-browser Gopher clients can read
 *     the tree cross-origin;
 *   • RFC 1436 shape — <type><label>TAB<selector> lines, dot-terminated;
 *   • every submenu / text selector in a menu resolves to a real node.
 */

const express = require('express');
const request = require('supertest');
const { mountAgentDiscovery, NODES, buildMenu, info, menu, link } = require('../../server/discovery/agentGopher');

function makeApp() {
	const app = express();
	mountAgentDiscovery(app);
	return app;
}

describe('Gopher-over-HTTPS agent discovery', () => {
	test('root menu serves application/gopher with open CORS and caching', async () => {
		const res = await request(makeApp()).get('/.well-known/agent.gopher');
		expect(res.status).toBe(200);
		expect(res.headers['content-type']).toContain('application/gopher');
		expect(res.headers['access-control-allow-origin']).toBe('*');
		expect(res.headers['cache-control']).toContain('max-age=600');
		expect(res.headers['x-content-type-options']).toBe('nosniff');
	});

	test('root menu is a valid dot-terminated Gopher menu', async () => {
		const res = await request(makeApp()).get('/.well-known/agent.gopher');
		const lines = res.text.split('\n').filter(l => l.length > 0);
		expect(lines[lines.length - 1]).toBe('.');

		for (const line of lines.slice(0, -1)) {
			const type = line[0];
			expect(['i', '0', '1', 'h']).toContain(type);
			// Every non-info line needs a TAB + selector.
			if (type !== 'i') {
				const [label, selector] = line.slice(1).split('\t');
				expect(label.length).toBeGreaterThan(0);
				expect(selector.length).toBeGreaterThan(0);
			}
		}
	});

	test('every internal selector in every menu resolves to a served node', async () => {
		const app = makeApp();
		for (const [route, node] of Object.entries(NODES)) {
			if (!node.isMenu) continue;
			const res = await request(app).get(route);
			for (const line of res.text.split('\n')) {
				if (!line || line === '.') continue;
				const type = line[0];
				if (type !== '1' && type !== '0') continue;
				const selector = line.slice(1).split('\t')[1];
				expect(NODES[selector]).toBeDefined();
				const leaf = await request(app).get(selector);
				expect(leaf.status).toBe(200);
			}
		}
	});

	test('text leaves serve plain text with open CORS', async () => {
		const res = await request(makeApp()).get('/.well-known/agent/mcp');
		expect(res.status).toBe(200);
		expect(res.headers['content-type']).toContain('text/plain');
		expect(res.headers['access-control-allow-origin']).toBe('*');
		// The MCP leaf must point at the live endpoint.
		expect(res.text).toContain('https://tetches.com/mcp');
	});

	test('external links use the URL: selector convention', async () => {
		const res = await request(makeApp()).get('/.well-known/agent.gopher');
		const hLines = res.text.split('\n').filter(l => l.startsWith('h'));
		expect(hLines.length).toBeGreaterThan(0);
		for (const line of hLines) {
			expect(line.split('\t')[1]).toMatch(/^URL:https:\/\//);
		}
	});

	test('menu builder helpers produce tab-separated RFC 1436 lines', () => {
		const built = buildMenu([
			info('hello'),
			menu('sub', '/x'),
			link('ext', 'https://example.com/'),
		]);
		expect(built).toBe('ihello\t\n1sub\t/x\nhext\tURL:https://example.com/\n.\n');
	});
});
