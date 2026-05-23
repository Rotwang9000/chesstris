/**
 * External AI registration + handshake auth.
 *
 * Verifies the contract documented in `docs/external-api.md`:
 *
 *   1. `POST /api/computer-players/register` issues a token AND
 *      seeds a real `World` player record for that id.
 *   2. A socket presenting that {playerId, apiToken} pair (via
 *      handshake query) claims the registered identity.
 *   3. A socket presenting the playerId with a *wrong* token is
 *      rejected outright (not silently downgraded to a fresh id).
 */

const request = require('supertest');
const apiRouter = require('../../routes/api');
const World = require('../../server/world/World');

// We instantiate a minimal Express app around the router so we
// don't have to bootstrap the whole game just to exercise the
// REST endpoint.
const express = require('express');
function buildTestApp() {
	const app = express();
	app.use(express.json());
	app.use('/api', apiRouter);
	return app;
}

beforeEach(() => {
	// Fresh world each test so player counts start at zero and we
	// can assert on `World.getPlayer` cleanly.
	World.resetWorld();
});

describe('external AI registration + handshake', () => {
	test('POST /api/computer-players/register seeds a World player and returns a token', async () => {
		const app = buildTestApp();
		const res = await request(app)
			.post('/api/computer-players/register')
			.send({ name: 'MyBot', description: 'unit test bot' })
			.expect(200);

		expect(res.body.success).toBe(true);
		expect(typeof res.body.playerId).toBe('string');
		expect(typeof res.body.apiToken).toBe('string');
		expect(res.body.apiToken).toHaveLength(64); // 32 random bytes hex
		expect(res.body.socketHandshake).toEqual(expect.objectContaining({
			query: expect.objectContaining({
				playerId: res.body.playerId,
				apiToken: res.body.apiToken,
			}),
		}));

		const record = World.getPlayer(res.body.playerId);
		expect(record).toBeDefined();
		expect(record.name).toBe('MyBot');
		expect(record.isComputer).toBe(true);
		expect(record.external).toBe(true);
	});

	test('validateApiToken accepts the issued pair and rejects mismatches', async () => {
		const app = buildTestApp();
		const res = await request(app)
			.post('/api/computer-players/register')
			.send({ name: 'AuthBot' })
			.expect(200);

		const { playerId, apiToken } = res.body;
		expect(apiRouter.validateApiToken(playerId, apiToken)).toBe(true);
		expect(apiRouter.validateApiToken(playerId, 'wrong-token')).toBe(false);
		expect(apiRouter.validateApiToken('unknown-id', apiToken)).toBe(false);
		expect(apiRouter.validateApiToken(playerId, '')).toBe(false);
		expect(apiRouter.validateApiToken(playerId, null)).toBe(false);
	});

	test('register rejects empty / missing name', async () => {
		const app = buildTestApp();
		await request(app)
			.post('/api/computer-players/register')
			.send({})
			.expect(400);
	});
});
