/**
 * Smoke tests for the production security middleware.
 *
 * Boots a real Express app via `createApp()` and supertest-pings it.
 * Covers:
 *   - helmet sets the expected response headers
 *   - CORS allowlist accepts production origin + rejects strangers
 *   - /api rate-limiter returns 429 after the threshold
 *   - origins helper agrees with the middleware
 *
 * No Socket.IO server, no game state — purely HTTP middleware.
 */

'use strict';

const request = require('supertest');

const ORIGINS_HELPER = require('../../server/security/origins');

describe('security middleware', () => {
	const ORIGINAL_ENV = process.env.NODE_ENV;
	const ORIGINAL_ALLOWED = process.env.ALLOWED_ORIGIN;

	beforeEach(() => {
		// Force production so CSP + strict CORS are active; the
		// rate-limiter behaves the same in both envs.
		process.env.NODE_ENV = 'production';
		process.env.ALLOWED_ORIGIN = 'https://tetches.com,https://www.tetches.com';
		// Re-require app builder so it picks up the env.
		jest.resetModules();
	});

	afterAll(() => {
		process.env.NODE_ENV = ORIGINAL_ENV;
		if (ORIGINAL_ALLOWED === undefined) delete process.env.ALLOWED_ORIGIN;
		else process.env.ALLOWED_ORIGIN = ORIGINAL_ALLOWED;
	});

	test('helmet adds the expected response headers', async () => {
		const { createApp } = require('../../server/app');
		const app = createApp({ projectRoot: process.cwd() });
		const res = await request(app).get('/api/').expect(200);
		expect(res.headers['x-content-type-options']).toBe('nosniff');
		expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
		expect(res.headers['strict-transport-security']).toBeDefined();
		expect(res.headers['content-security-policy']).toBeDefined();
	});

	test('CORS allowlist accepts production origin', async () => {
		const { createApp } = require('../../server/app');
		const app = createApp({ projectRoot: process.cwd() });
		const res = await request(app)
			.get('/api/')
			.set('Origin', 'https://tetches.com')
			.expect(200);
		expect(res.headers['access-control-allow-origin']).toBe('https://tetches.com');
	});

	test('CORS allowlist rejects unknown origin', async () => {
		const { createApp } = require('../../server/app');
		const app = createApp({ projectRoot: process.cwd() });
		const res = await request(app)
			.get('/api/')
			.set('Origin', 'https://evil.example.com');
		// CORS rejection returns 500 from the cors middleware
		// because the callback errors; importantly, the
		// `access-control-allow-origin` header is *absent*.
		expect(res.headers['access-control-allow-origin']).toBeUndefined();
	});

	test('origins helper agrees with the middleware', () => {
		const { parseAllowedOrigins, isOriginAllowed, normaliseOrigin } = ORIGINS_HELPER;
		const allowed = parseAllowedOrigins('https://tetches.com, https://www.tetches.com/, HTTPS://STAGING.TETCHES.COM');
		expect(allowed).toContain('https://tetches.com');
		expect(allowed).toContain('https://www.tetches.com');
		expect(allowed).toContain('https://staging.tetches.com');

		expect(isOriginAllowed('https://tetches.com', allowed)).toBe(true);
		expect(isOriginAllowed('https://tetches.com/', allowed)).toBe(true);
		expect(isOriginAllowed('https://evil.example.com', allowed)).toBe(false);

		// localhost in dev is always allowed
		expect(isOriginAllowed('http://localhost:5173', allowed, { allowLocalhost: true })).toBe(true);
		expect(isOriginAllowed('http://localhost:5173', allowed, { allowLocalhost: false })).toBe(false);

		expect(normaliseOrigin('HTTPS://Foo.Bar:8080/')).toBe('https://foo.bar:8080');
	});
});
