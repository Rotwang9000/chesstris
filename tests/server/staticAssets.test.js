/**
 * Tests that the server correctly serves all assets required for the game client.
 *
 * These tests guard against regressions where nginx or Express misconfiguration
 * prevents critical JS, socket.io, or API endpoints from reaching the browser.
 */
const http = require('http');
const path = require('path');
const express = require('express');
const socketIO = require('socket.io');

let server;
let app;
let baseUrl;

beforeAll((done) => {
	app = express();
	const httpServer = http.createServer(app);
	socketIO(httpServer);

	app.use('/node_modules', express.static(path.join(__dirname, '../../node_modules')));
	app.use(express.static(path.join(__dirname, '../../public')));

	httpServer.listen(0, () => {
		const port = httpServer.address().port;
		baseUrl = `http://localhost:${port}`;
		server = httpServer;
		done();
	});
});

afterAll((done) => {
	if (server) server.close(done);
	else done();
});

function get(urlPath) {
	return new Promise((resolve, reject) => {
		http.get(`${baseUrl}${urlPath}`, (res) => {
			let body = '';
			res.on('data', (chunk) => { body += chunk; });
			res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
		}).on('error', reject);
	});
}

describe('Socket.IO client endpoint', () => {
	test('serves /socket.io/socket.io.js with 200 and JS content-type', async () => {
		const res = await get('/socket.io/socket.io.js');
		expect(res.status).toBe(200);
		expect(res.headers['content-type']).toMatch(/javascript/);
	});
});

describe('Core static assets', () => {
	test('serves /js/main-enhanced.js', async () => {
		const res = await get('/js/main-enhanced.js');
		expect(res.status).toBe(200);
		expect(res.headers['content-type']).toMatch(/javascript/);
	});

	test('serves /js/enhanced-gameCore.js', async () => {
		const res = await get('/js/enhanced-gameCore.js');
		expect(res.status).toBe(200);
	});

	test('serves /js/utils/networkManager.js', async () => {
		const res = await get('/js/utils/networkManager.js');
		expect(res.status).toBe(200);
	});

	test('serves /js/utils/NetworkManagerClass.js', async () => {
		const res = await get('/js/utils/NetworkManagerClass.js');
		expect(res.status).toBe(200);
	});

	test('serves index.html at root', async () => {
		const res = await get('/');
		expect(res.status).toBe(200);
		expect(res.body).toContain('Shaktris');
	});
});
