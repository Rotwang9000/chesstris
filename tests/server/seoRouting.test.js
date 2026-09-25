/**
 * Crawler-facing routing: robots.txt / sitemap.xml are real files, and
 * unknown URLs no longer come back as the game page with a 200 (which
 * search engines index as duplicate "soft 404" pages).
 */

'use strict';

const request = require('supertest');

describe('SEO routing', () => {
	let app;

	beforeAll(() => {
		const { createApp } = require('../../server/app');
		app = createApp({ projectRoot: process.cwd() });
	});

	test('serves robots.txt as text with a sitemap pointer', async () => {
		const res = await request(app).get('/robots.txt').expect(200);
		expect(res.headers['content-type']).toMatch(/text\/plain/);
		expect(res.text).toMatch(/^Sitemap: https:\/\/tetches\.com\/sitemap\.xml$/m);
	});

	test('serves sitemap.xml as XML', async () => {
		const res = await request(app).get('/sitemap.xml').expect(200);
		expect(res.headers['content-type']).toMatch(/xml/);
		expect(res.text).toContain('<loc>https://tetches.com/</loc>');
	});

	test('home page carries an h1 and structured data', async () => {
		const res = await request(app).get('/').expect(200);
		expect(res.text).toMatch(/<h1[^>]*>TETCHES<\/h1>/);
		const ld = res.text.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
		expect(ld).not.toBeNull();
		expect(JSON.parse(ld[1])['@type']).toBe('VideoGame');
	});

	test('/2d still serves the game', async () => {
		const res = await request(app).get('/2d').expect(200);
		expect(res.text).toContain('game-container');
	});

	test('missing asset is a real 404, not HTML', async () => {
		const res = await request(app).get('/js/does-not-exist.js').expect(404);
		expect(res.headers['content-type']).not.toMatch(/html/);
	});

	test('unknown API path is a JSON 404', async () => {
		const res = await request(app).get('/api/nope').expect(404);
		expect(res.body).toEqual({ success: false, error: 'not_found' });
	});

	test('unknown page redirects to / and keeps the query string', async () => {
		const res = await request(app).get('/some/old-link?battle=ABC123').expect(301);
		expect(res.headers.location).toBe('/?battle=ABC123');
	});
});
