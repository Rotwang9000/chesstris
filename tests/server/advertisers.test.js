/**
 * Tests for the advertiser routes (in-memory + on-disk persistence).
 *
 * Spins up an Express app with only the advertisers router mounted and
 * exercises:
 *   - register → activate → list → next → impression cycle
 *   - persistence: data survives a route-module reload
 */

const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');

const ADVERTISERS_FILE = path.join(__dirname, '../../advertisers.json');
const ADS_DIR = path.join(__dirname, '../../public/uploads/ads');
const _testWrittenAdImages = new Set();

function clearAdvertisersFile() {
	try { fs.unlinkSync(ADVERTISERS_FILE); } catch { /* ignore */ }
}

function cleanupTestAdImages() {
	for (const filename of _testWrittenAdImages) {
		try { fs.unlinkSync(path.join(ADS_DIR, filename)); } catch { /* ignore */ }
	}
	_testWrittenAdImages.clear();
}

let currentModule = null;

function mountApp() {
	const app = express();
	app.use(express.json());
	app.use('/api/advertisers', currentModule);
	return app;
}

function freshApp() {
	if (currentModule && typeof currentModule.flushAdvertisersSync === 'function') {
		currentModule.flushAdvertisersSync();
	}
	delete require.cache[require.resolve('../../routes/advertisers')];
	clearAdvertisersFile();
	currentModule = require('../../routes/advertisers');
	if (typeof currentModule.__resetRegistrationRateLimit === 'function') {
		currentModule.__resetRegistrationRateLimit();
	}
	return mountApp();
}

function reloadAppKeepingFile() {
	if (currentModule && typeof currentModule.flushAdvertisersSync === 'function') {
		currentModule.flushAdvertisersSync();
	}
	delete require.cache[require.resolve('../../routes/advertisers')];
	currentModule = require('../../routes/advertisers');
	return mountApp();
}

function tinyPngBuffer() {
	// 1x1 transparent PNG (valid header + IHDR + IDAT + IEND).
	return Buffer.from(
		'89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4' +
		'89000000017352474200aece1ce90000000d49444154789c63000100000005000' +
		'1d0d0a2db0000000049454e44ae426082',
		'hex'
	);
}

describe('Advertiser routes', () => {
	afterEach(() => {
		if (currentModule && typeof currentModule.flushAdvertisersSync === 'function') {
			currentModule.flushAdvertisersSync();
		}
		clearAdvertisersFile();
		cleanupTestAdImages();
		if (currentModule) {
			delete require.cache[require.resolve('../../routes/advertisers')];
			currentModule = null;
		}
	});

	test('register → activate → list → next', async () => {
		const app = freshApp();

		const reg = await request(app)
			.post('/api/advertisers')
			.field('name', 'Acme')
			.field('email', 'a@b.co')
			.field('walletAddress', 'wallet-xyz')
			.field('adText', 'buy stuff')
			.field('adLink', 'https://acme.example')
			.field('bidAmount', '0.5')
			.field('cellCount', '10')
			.attach('adImage', tinyPngBuffer(), 'pixel.png');

		expect(reg.status).toBe(201);
		expect(reg.body.success).toBe(true);
		const id = reg.body.advertiser.id;
		expect(id).toBeTruthy();
		expect(reg.body.advertiser.bidStatus).toBe('pending');
		// Registration must NOT have written the image to disk yet —
		// only activation does. This is the spam/abuse guard.
		const beforeActivation = fs.existsSync(path.join(ADS_DIR, `${id}.png`));
		expect(beforeActivation).toBe(false);

		const next404 = await request(app).get('/api/advertisers/next');
		expect(next404.status).toBe(404);

		const act = await request(app)
			.post(`/api/advertisers/${id}/activate`)
			.send({ transactionSignature: 'sig-123' });
		expect(act.status).toBe(200);
		expect(act.body.advertiser.bidStatus).toBe('active');
		expect(act.body.advertiser.adImage).toMatch(/^\/uploads\/ads\//);
		// The bytes should now exist on disk.
		const imageFilename = `${id}.png`;
		expect(fs.existsSync(path.join(ADS_DIR, imageFilename))).toBe(true);
		_testWrittenAdImages.add(imageFilename);

		const list = await request(app).get('/api/advertisers');
		expect(list.status).toBe(200);
		expect(list.body.advertisers).toHaveLength(1);
		expect(list.body.advertisers[0].bidStatus).toBe('active');

		const next = await request(app).get('/api/advertisers/next');
		expect(next.status).toBe(200);
		expect(next.body.id).toBe(id);
	});

	test('rate-limits repeat registrations from a single IP', async () => {
		const app = freshApp();

		const submit = () => request(app)
			.post('/api/advertisers')
			.field('name', 'Spam Co')
			.field('email', 'a@b.co')
			.field('walletAddress', 'wallet-xyz')
			.field('adText', 'buy stuff')
			.field('adLink', 'https://acme.example')
			.field('bidAmount', '0.5')
			.field('cellCount', '10')
			.attach('adImage', tinyPngBuffer(), 'pixel.png');

		// Three successful registrations, then the next should be
		// rate-limited (429). We never have to wait the cooldown
		// because we tear the app down after each test.
		for (let i = 0; i < 3; i++) {
			const ok = await submit();
			expect(ok.status).toBe(201);
		}
		const blocked = await submit();
		expect(blocked.status).toBe(429);
		expect(blocked.body.success).toBe(false);
	});

	test('advertisers persist across module reload', async () => {
		jest.resetModules();
		clearAdvertisersFile();

		const stored = {
			version: 1,
			savedAt: new Date().toISOString(),
			advertisers: [
				{
					id: 'persist-1',
					name: 'Persistor',
					email: 'p@b.co',
					walletAddress: 'wallet-persist',
					adText: 'still here',
					adLink: 'https://persist.example',
					adImage: '/uploads/ads/fake.png',
					bidAmount: 1.0,
					cellCount: 5,
					bidStatus: 'active',
					impressions: 0,
					clicks: 0,
					cellsSponsored: 0,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
			],
		};
		fs.writeFileSync(ADVERTISERS_FILE, JSON.stringify(stored), 'utf8');

		currentModule = require('../../routes/advertisers');
		const app = mountApp();

		const list = await request(app).get('/api/advertisers');
		expect(list.status).toBe(200);
		expect(list.body.advertisers).toHaveLength(1);
		expect(list.body.advertisers[0].id).toBe('persist-1');
		expect(list.body.advertisers[0].bidStatus).toBe('active');

		const next = await request(app).get('/api/advertisers/next');
		expect(next.status).toBe(200);
		expect(next.body.id).toBe('persist-1');
	});
});
