#!/usr/bin/env node
/**
 * End-to-end battle-flow verification against a RUNNING server.
 *
 * Replays the user-reported reproduction path over real sockets:
 *   1. Host connects (no join) and previews the world (`get_game_state`)
 *   2. Host joins the world (the welcome-modal PLAY/BATTLE click)
 *   3. Host creates a battle, cancels it, creates another
 *   4. Guest connects, joins the world, joins the battle by code
 *   5. Host starts the battle
 *   6. Both sides re-fetch state and assert the board centre marker is
 *      still pinned at (0,0) even though arena cells inflated the bounds
 *
 * Usage: node scripts/e2e-battle-flow.js [serverUrl]
 *   default serverUrl: http://localhost:3668
 */

const { io } = require('socket.io-client');

const SERVER_URL = process.argv[2] || 'http://localhost:3668';
const STEP_TIMEOUT_MS = 10000;

const failures = [];
let stepCounter = 0;

function pass(label) {
	stepCounter++;
	console.log(`  ok ${stepCounter} - ${label}`);
}

function fail(label, detail) {
	stepCounter++;
	failures.push(`${label}: ${detail}`);
	console.error(`  FAIL ${stepCounter} - ${label}: ${detail}`);
}

function assert(condition, label, detail = '') {
	if (condition) pass(label);
	else fail(label, detail || 'assertion failed');
}

function connectClient(name) {
	return new Promise((resolve, reject) => {
		const socket = io(SERVER_URL, {
			transports: ['websocket'],
			reconnection: false,
			query: { playerName: name },
		});
		const timer = setTimeout(
			() => reject(new Error(`${name}: connect timed out`)), STEP_TIMEOUT_MS
		);
		socket.on('player_id', (playerId) => {
			clearTimeout(timer);
			resolve({ socket, playerId, name });
		});
		socket.on('connect_error', (err) => {
			clearTimeout(timer);
			reject(new Error(`${name}: connect_error ${err.message}`));
		});
	});
}

function emitAck(client, event, data) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(
			() => reject(new Error(`${client.name}: '${event}' ack timed out`)), STEP_TIMEOUT_MS
		);
		client.socket.emit(event, data, (response) => {
			clearTimeout(timer);
			resolve(response);
		});
	});
}

function waitForEvent(client, event, timeoutMs = STEP_TIMEOUT_MS) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(
			() => reject(new Error(`${client.name}: never received '${event}'`)), timeoutMs
		);
		client.socket.once(event, (payload) => {
			clearTimeout(timer);
			resolve(payload);
		});
	});
}

function checkCentreMarker(board, label) {
	const marker = board?.centreMarker;
	assert(
		marker && marker.x === 0 && marker.z === 0,
		`${label}: board.centreMarker pinned at (0,0)`,
		`got ${JSON.stringify(marker)}`
	);
}

async function main() {
	console.log(`E2E battle flow against ${SERVER_URL}\n`);

	const host = await connectClient('E2E Host');
	pass(`host connected as ${host.playerId}`);

	// ── 1. Spectator preview: state BEFORE joining the world ─────────
	const preview = await emitAck(host, 'get_game_state', {});
	assert(preview.success === true, 'pre-join get_game_state succeeds', preview.error);
	checkCentreMarker(preview.state?.board, 'pre-join preview');
	const hasHomeZonePreJoin = !!preview.state?.homeZones?.[host.playerId];
	assert(!hasHomeZonePreJoin, 'pre-join preview does NOT create a kingdom',
		'home zone exists before join_game');

	// ── 2. Join the world (PLAY / BATTLE click) ──────────────────────
	const joinRes = await emitAck(host, 'join_game', { playerName: 'E2E Host' });
	assert(joinRes.success === true, 'host join_game succeeds', joinRes.error);
	checkCentreMarker(joinRes.gameState?.board, 'host join payload');
	assert(!!joinRes.gameState?.homeZones?.[host.playerId],
		'host has a home zone after join', 'no home zone in join payload');

	// ── 3. Create battle → cancel → create again ─────────────────────
	const create1 = await emitAck(host, 'battle_create', { seatCount: 2 });
	assert(create1.success === true, 'battle_create #1 succeeds', create1.error);
	const code1 = create1.battle?.code;
	assert(!!code1, 'battle #1 has a code', JSON.stringify(create1));

	const cancel = await emitAck(host, 'battle_leave', {});
	assert(cancel.success === true, 'host cancels battle #1', cancel.error);

	const stateAfterCancel = await emitAck(host, 'battle_state', {});
	assert(stateAfterCancel.battle === null, 'no battle bound to host after cancel',
		JSON.stringify(stateAfterCancel.battle));

	const create2 = await emitAck(host, 'battle_create', { seatCount: 2 });
	assert(create2.success === true, 'battle_create #2 succeeds', create2.error);
	const code2 = create2.battle?.code;
	assert(!!code2 && code2 !== code1, 'battle #2 has a fresh code',
		`code1=${code1} code2=${code2}`);

	// ── 4. Guest joins world then battle ─────────────────────────────
	const guest = await connectClient('E2E Guest');
	pass(`guest connected as ${guest.playerId}`);
	const guestJoin = await emitAck(guest, 'join_game', { playerName: 'E2E Guest' });
	assert(guestJoin.success === true, 'guest join_game succeeds', guestJoin.error);

	const guestLobbyEvent = waitForEvent(guest, 'battle_started');
	const hostLobbyEvent = waitForEvent(host, 'battle_started');

	const joinBattle = await emitAck(guest, 'battle_join', { code: code2 });
	assert(joinBattle.success === true, `guest joins battle ${code2}`, joinBattle.error);
	assert(!!joinBattle.seatId, 'guest got a seat id', JSON.stringify(joinBattle));

	// ── 5. Host starts the battle ────────────────────────────────────
	const hostUpdatePromise = waitForEvent(host, 'game_update');
	const start = await emitAck(host, 'battle_start', {});
	assert(start.success === true, 'battle_start succeeds', start.error);
	assert(start.battle?.status === 'active', 'battle is active',
		`status=${start.battle?.status}`);
	const centre = start.battle?.centre;
	assert(centre && Number.isFinite(centre.x) && Number.isFinite(centre.z),
		'battle has an arena centre', JSON.stringify(centre));

	const [hostStarted, guestStarted] = await Promise.all([hostLobbyEvent, guestLobbyEvent]);
	assert(hostStarted?.battle?.code === code2, 'host received battle_started');
	assert(guestStarted?.battle?.code === code2, 'guest received battle_started');

	// ── 6. Post-start state: marker still (0,0), bounds inflated ─────
	const hostUpdate = await hostUpdatePromise;
	if (hostUpdate.board) checkCentreMarker(hostUpdate.board, 'broadcast after battle_start');
	else pass('broadcast was a delta (board unchanged in payload)');

	const after = await emitAck(host, 'get_game_state', {});
	assert(after.success === true, 'post-start get_game_state succeeds', after.error);
	checkCentreMarker(after.state?.board, 'post-start state');

	const bounds = {
		minX: after.state.board.minX, maxX: after.state.board.maxX,
		minZ: after.state.board.minZ, maxZ: after.state.board.maxZ,
	};
	const boundsSpanArena = Math.max(
		Math.abs(bounds.minX), Math.abs(bounds.maxX),
		Math.abs(bounds.minZ), Math.abs(bounds.maxZ)
	) >= Math.max(Math.abs(centre.x), Math.abs(centre.z)) - 50;
	assert(boundsSpanArena,
		'board bounds now span the arena (marker must NOT follow them)',
		`bounds=${JSON.stringify(bounds)} centre=${JSON.stringify(centre)}`);

	const arenaCellCount = Object.keys(after.state.board.cells || {}).filter((key) => {
		const [x, z] = key.split(',').map(Number);
		return Math.abs(x - centre.x) <= 40 && Math.abs(z - centre.z) <= 40;
	}).length;
	assert(arenaCellCount > 50, 'arena cells exist around the battle centre',
		`only ${arenaCellCount} cells near centre`);

	// AOI-clipped fetch must also carry the marker (spread preserves it).
	const aoiRes = await emitAck(host, 'get_game_state', {
		options: { aoi: { centerX: centre.x, centerZ: centre.z, radius: 40 } },
	});
	assert(aoiRes.success === true, 'AOI get_game_state succeeds', aoiRes.error);
	checkCentreMarker(aoiRes.state?.board, 'AOI-clipped state');

	// ── 7. Forfeit: host leaves mid-battle, sweep settles the outcome ─
	// (Elimination poll runs every SWEEP_INTERVAL_MS = 5s; the finished
	// battle then lingers 60s before the arena is dismantled.)
	const guestFinished = waitForEvent(guest, 'battle_finished', 15000);
	const hostLeave = await emitAck(host, 'battle_leave', {});
	assert(hostLeave.success === true, 'host leaves battle', hostLeave.error);
	assert(hostLeave.forfeited === true, 'mid-battle leave is a forfeit',
		JSON.stringify(hostLeave));

	const finishedPayload = await guestFinished;
	assert(finishedPayload?.battle?.status === 'finished',
		'sweep finished the battle after forfeit',
		`status=${finishedPayload?.battle?.status}`);
	assert(finishedPayload?.battle?.winnerSeatId != null,
		'guest seat won by forfeit', JSON.stringify(finishedPayload?.battle));

	const final = await emitAck(host, 'get_game_state', {});
	checkCentreMarker(final.state?.board, 'state after battle finish');
	// The arena ring deliberately lingers FINISHED_LINGER_MS (60s) so the
	// result stays on show — full dismantling is covered by unit tests.

	// ── 8. Leave no trace: remove both test kingdoms from the world ───
	const hostExit = await emitAck(host, 'exit_game', {});
	const guestExit = await emitAck(guest, 'exit_game', {});
	assert(hostExit.success === true && guestExit.success === true,
		'test kingdoms removed from the world (exit_game)',
		JSON.stringify({ hostExit, guestExit }));

	host.socket.disconnect();
	guest.socket.disconnect();

	console.log(`\n${stepCounter - failures.length}/${stepCounter} checks passed`);
	if (failures.length) {
		console.error(`\n${failures.length} FAILURE(S):`);
		for (const f of failures) console.error(`  - ${f}`);
		process.exit(1);
	}
	console.log('E2E battle flow: ALL GREEN');
	process.exit(0);
}

main().catch((err) => {
	console.error(`\nE2E aborted: ${err.message}`);
	process.exit(1);
});
