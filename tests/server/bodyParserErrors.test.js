/**
 * Body-parser client errors answer in JSON with a one-line log, instead
 * of Express's default HTML page plus a full stack trace in err.log per
 * request (seen in production as bursts of PayloadTooLargeError).
 */

const request = require('supertest');

describe('body-parser client errors', () => {
	let app;
	let warn;

	beforeAll(() => {
		const { createApp } = require('../../server/app');
		app = createApp({ projectRoot: process.cwd() });
	});

	beforeEach(() => {
		warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
	});

	afterEach(() => warn.mockRestore());

	test('a body over the limit gets a JSON 413', async () => {
		const res = await request(app)
			.post('/api/advertisers')
			.set('Content-Type', 'application/json')
			.send(JSON.stringify({ x: 'a'.repeat(70 * 1024) }))
			.expect(413);
		expect(res.body).toEqual({ success: false, error: 'payload_too_large' });
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('413 payload_too_large: POST /api/advertisers'));
	});

	test('malformed JSON gets a JSON 400', async () => {
		const res = await request(app)
			.post('/api/advertisers')
			.set('Content-Type', 'application/json')
			.send('{"x":')
			.expect(400);
		expect(res.body).toEqual({ success: false, error: 'invalid_json' });
	});
});
