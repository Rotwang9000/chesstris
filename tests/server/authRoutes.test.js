/**
 * Auth route contract tests.
 *
 * Authentication is delegated to Auth0 (passwordless email). The server
 * only exposes PUBLIC Auth0 config + an unrelated shareable game-key
 * generator. These tests pin that contract and act as a tripwire if a
 * PII/email-handling endpoint ever creeps back in.
 */
const express = require('express');
const request = require('supertest');
const { mountAuthRoutes, getAuth0Config } = require('../../server/auth/routes');
const {
	generateGameKey,
	GAME_KEY_LENGTH,
	GAME_KEY_ALPHABET,
} = require('../../server/auth/gameKey');

function makeApp() {
	const app = express();
	app.use(express.json());
	mountAuthRoutes(app);
	return app;
}

describe('GET /api/auth/config', () => {
	test('returns a non-empty Auth0 domain + clientId', async () => {
		const res = await request(makeApp()).get('/api/auth/config');
		expect(res.status).toBe(200);
		expect(typeof res.body.domain).toBe('string');
		expect(res.body.domain.length).toBeGreaterThan(0);
		expect(typeof res.body.clientId).toBe('string');
		expect(res.body.clientId.length).toBeGreaterThan(0);
		// Must not leak any secret/PII fields.
		expect(res.body.clientSecret).toBeUndefined();
		expect(res.body.email).toBeUndefined();
	});

	test('honours AUTH0_DOMAIN / AUTH0_CLIENT_ID env overrides', () => {
		const prevDomain = process.env.AUTH0_DOMAIN;
		const prevClient = process.env.AUTH0_CLIENT_ID;
		process.env.AUTH0_DOMAIN = 'example.eu.auth0.com';
		process.env.AUTH0_CLIENT_ID = 'abc123';
		try {
			expect(getAuth0Config()).toMatchObject({
				domain: 'example.eu.auth0.com',
				clientId: 'abc123',
			});
		} finally {
			if (prevDomain === undefined) delete process.env.AUTH0_DOMAIN;
			else process.env.AUTH0_DOMAIN = prevDomain;
			if (prevClient === undefined) delete process.env.AUTH0_CLIENT_ID;
			else process.env.AUTH0_CLIENT_ID = prevClient;
		}
	});
});

describe('POST /api/auth/generate-game-key', () => {
	test('returns a well-formed, unambiguous game key', async () => {
		const res = await request(makeApp()).post('/api/auth/generate-game-key');
		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.gameKey).toMatch(
			new RegExp(`^[${GAME_KEY_ALPHABET}]{${GAME_KEY_LENGTH}}$`),
		);
	});
});

describe('no email/PII endpoints remain (Auth0 owns this now)', () => {
	test('legacy magic-link endpoint is gone', async () => {
		const res = await request(makeApp())
			.post('/api/auth/magic-link')
			.send({ email: 'someone@example.com' });
		expect(res.status).toBe(404);
	});

	test('legacy verify endpoint is gone', async () => {
		const res = await request(makeApp()).get('/auth/verify?token=abc');
		expect(res.status).toBe(404);
	});
});

describe('generateGameKey()', () => {
	test('only ever uses the unambiguous alphabet', () => {
		for (let i = 0; i < 50; i++) {
			const key = generateGameKey();
			expect(key).toHaveLength(GAME_KEY_LENGTH);
			expect([...key].every((c) => GAME_KEY_ALPHABET.includes(c))).toBe(true);
		}
	});
});
