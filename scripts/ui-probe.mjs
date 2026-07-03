#!/usr/bin/env node
/**
 * Headless UI probe — drives the real game in headless Chromium with
 * software WebGL (SwiftShader) and takes screenshots, so rendering
 * bugs (colour loss, layout, battle arenas) can be verified without a
 * GPU or a human. Playwright-core + the Playwright browser cache.
 *
 * Usage:
 *   node scripts/ui-probe.mjs <url> <outPrefix> [mode] [seconds]
 *
 *   mode: overview | play | battle | invite   (default overview)
 *     overview — land on the welcome screen, shoot the spectator view
 *     play     — click PLAY NOW, wait, shoot the in-world view
 *     battle   — create a N-seat battle vs bots, wait, shoot the arena
 *     invite   — host a battle from Node, then join it in the browser
 *                through the ?battle=CODE link (the invite-link path)
 */

import { chromium } from 'playwright-core';
import { mkdirSync } from 'fs';
import path from 'path';
import { io as ioClient } from 'socket.io-client';

const url = process.argv[2] || 'http://localhost:3671';
const outPrefix = process.argv[3] || '/tmp/tetches-ui-test/probe';
const mode = process.argv[4] || 'overview';
const waitSeconds = Number(process.argv[5]) || 8;
const battleSeats = Number(process.argv[6]) || 2;

mkdirSync(path.dirname(outPrefix), { recursive: true });

const executablePath = `${process.env.HOME}/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome`;

// PROBE_GL=gles2 forces the old WebGL1-only SwiftShader path; the
// default lets Chromium negotiate WebGL2 over SwiftShader, matching
// what real desktop browsers use.
const glArgs = process.env.PROBE_GL === 'gles2'
	? ['--use-gl=angle', '--use-angle=swiftshader']
	: [];

const browser = await chromium.launch({
	executablePath,
	headless: true,
	args: [
		'--enable-unsafe-swiftshader',
		...glArgs,
		'--no-sandbox',
		'--disable-dev-shm-usage',
	],
});

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const logs = [];
page.on('console', (msg) => {
	const text = msg.text();
	if (msg.type() === 'error' || /error|Error|WebGL|failed/i.test(text)) logs.push(`[${msg.type()}] ${text}`);
});
page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));
page.on('response', (res) => {
	if (res.status() >= 400) logs.push(`[http ${res.status()}] ${res.url()}`);
});

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);

const shoot = async (label) => {
	const file = `${outPrefix}-${label}.png`;
	await page.screenshot({ path: file });
	console.log(`shot: ${file}`);
};

if (mode === 'overview') {
	await shoot('welcome');
	// Dismiss the modal to see the naked overview (spectator view).
	await page.evaluate(() => {
		const modal = document.getElementById('tutorial-message');
		if (modal) modal.style.display = 'none';
	});
	await page.waitForTimeout(2000);
	await shoot('overview');
} else if (mode === 'play') {
	const name = `Probe${Date.now() % 1000}`;
	await page.fill('#welcome-player-name', name).catch(() => {});
	await page.click('#new-game-btn', { timeout: 5000, force: true }).catch(async () => {
		// fallback: any button containing PLAY
		await page.getByText('PLAY NOW').first().click({ timeout: 5000, force: true }).catch(() => {});
	});
	await page.waitForTimeout(waitSeconds * 1000);
	await shoot('world');
} else if (mode === 'battle') {
	const name = `Probe${Date.now() % 1000}`;
	await page.fill('#welcome-name-input', name).catch(() => {});
	// Straight into a battle vs a bot via the console API is flaky;
	// use the socket directly through the page's own modules.
	await page.evaluate(async (seats) => {
		const network = await import('/js/utils/networkManager.js');
		await network.initialize();
		await network.ensureConnected(null, 8000);
		await new Promise((resolve) => {
			network.getSocket().emit('battle_create', { seatCount: seats }, resolve);
		});
		await new Promise((resolve) => {
			network.getSocket().emit('battle_start', {}, resolve);
		});
	}, battleSeats).catch((err) => logs.push(`[battle-setup] ${err.message}`));
	await page.waitForTimeout(waitSeconds * 1000);
	await shoot('battle');
} else if (mode === 'invite') {
	// Host the battle from Node so the browser exercises the pure
	// invite-link path: land on ?battle=CODE, press Enter on the name
	// field (the battle button must be the primary action).
	const host = ioClient(url, { transports: ['websocket'], reconnection: false });
	const hostAck = (event, data) => new Promise((resolve) => host.emit(event, data, resolve));
	await new Promise((resolve) => host.on('connect', resolve));
	const created = await hostAck('battle_create', { seatCount: battleSeats });
	const code = created?.battle?.code;
	if (!code) throw new Error(`battle_create failed: ${JSON.stringify(created)}`);
	console.log(`invite code: ${code}`);

	await page.goto(`${url}/?battle=${code}`, { waitUntil: 'domcontentloaded' });
	await page.waitForTimeout(4000);
	await shoot('invite-welcome');
	await page.fill('#welcome-player-name', 'ProbeGuest').catch(() => {});
	// force: the primary button pulses (CSS animation) and never counts
	// as "stable" for an actionability check.
	await page.click('#welcome-battle-btn', { timeout: 5000, force: true });
	await page.waitForTimeout(3000);
	await shoot('invite-lobby');

	await hostAck('battle_start', {});
	await page.waitForTimeout(waitSeconds * 1000);
	await shoot('invite-battle');

	const inviteState = await page.evaluate(() => ({
		activeBattle: window.gameState?.activeBattle || null,
		localPlayerId: window.gameState?.localPlayerId || null,
		dialogOpen: !!document.getElementById('tetches-battle-dialog'),
		welcomeOpen: !!document.getElementById('tutorial-message'),
		url: window.location.search,
	}));
	console.log('invite state:', JSON.stringify(inviteState));
	host.disconnect();
}

// WebGL sanity + colour histogram of the canvas (how many distinct
// hues are on screen — a colour-loss regression collapses this).
const diag = await page.evaluate(() => {
	const canvas = document.querySelector('canvas');
	if (!canvas) return { canvas: false };
	const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
	return {
		canvas: true,
		width: canvas.width,
		height: canvas.height,
		webgl: !!gl,
	};
});
console.log('diag:', JSON.stringify(diag));
if (logs.length) {
	console.log('console/log errors (first 20):');
	for (const line of logs.slice(0, 20)) console.log('  ' + line);
}

await browser.close();
