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
 *   serverUrl falls back to $E2E_URL, then http://localhost:3668
 */

const { io } = require('socket.io-client');

const SERVER_URL = process.argv[2] || process.env.E2E_URL || 'http://localhost:3668';
console.log(`[e2e] target server: ${SERVER_URL}`);
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

	// ═══ Scenario B: BATTLE-ONLY flow (no join_game at all) ═══════════
	// The welcome modal's BATTLE button skips world entry entirely:
	// connect → battle_create/battle_join → battle_start. Neither player
	// may ever grow a kingdom in the shared world.
	console.log('\nScenario B: battle-only players (never join the world)');

	const bHost = await connectClient('E2E BattleOnly Host');
	const bGuest = await connectClient('E2E BattleOnly Guest');
	pass(`battle-only host ${bHost.playerId} / guest ${bGuest.playerId} connected`);

	const bCreate = await emitAck(bHost, 'battle_create', { seatCount: 2 });
	assert(bCreate.success === true, 'battle-only host creates a battle WITHOUT join_game',
		bCreate.error);
	const bCode = bCreate.battle?.code;

	const bJoin = await emitAck(bGuest, 'battle_join', { code: bCode });
	assert(bJoin.success === true, 'battle-only guest joins by code WITHOUT join_game',
		bJoin.error);

	const bHostStarted = waitForEvent(bHost, 'battle_started');
	const bGuestStarted = waitForEvent(bGuest, 'battle_started');
	const bStart = await emitAck(bHost, 'battle_start', {});
	assert(bStart.success === true, 'battle-only battle starts', bStart.error);

	const [bHostEvt, bGuestEvt] = await Promise.all([bHostStarted, bGuestStarted]);
	assert(bHostEvt?.battle?.code === bCode && bGuestEvt?.battle?.code === bCode,
		'both battle-only players received battle_started');
	const bCentre = bStart.battle?.centre;
	assert(bCentre && Number.isFinite(bCentre.x), 'battle-only arena has a centre',
		JSON.stringify(bCentre));
	const bSeats = bStart.battle?.seats || [];
	assert(bSeats.length === 2 && bSeats.every(s => !s.isAi),
		'battle-only battle seats both human', JSON.stringify(bSeats));

	// The REAL player ids must have no kingdom; the SEAT ids must have
	// home zones + kings inside the arena.
	const bState = await emitAck(bHost, 'get_game_state', {});
	assert(bState.success === true, 'battle-only get_game_state succeeds', bState.error);
	const bZones = bState.state?.homeZones || {};
	assert(!bZones[bHost.playerId] && !bZones[bGuest.playerId],
		'battle-only players never grew world kingdoms',
		`zones for real ids: ${JSON.stringify(Object.keys(bZones).filter(k => k === bHost.playerId || k === bGuest.playerId))}`);
	const seatZoneOk = bSeats.every(s => {
		const zone = bZones[s.seatId];
		return zone && Math.abs(zone.x - bCentre.x) <= 20 && Math.abs(zone.z - bCentre.z) <= 20;
	});
	assert(seatZoneOk, 'both seats have home zones inside the arena',
		JSON.stringify(bSeats.map(s => bZones[s.seatId])));
	const bPieces = bState.state?.chessPieces || [];
	const seatKings = bSeats.filter(s => bPieces.some(
		p => String(p.player) === s.seatId && String(p.type).toUpperCase() === 'KING'
	));
	assert(seatKings.length === 2, 'both seats have kings on the board',
		`kings for ${seatKings.length}/2 seats`);

	// Gameplay acts as the seat (session alias): place-ready state only.
	// Full placement mechanics are covered by unit tests; here we just
	// prove the battle finishes cleanly for battle-only players too.
	const bGuestFinished = waitForEvent(bGuest, 'battle_finished', 15000);
	const bLeave = await emitAck(bHost, 'battle_leave', {});
	assert(bLeave.forfeited === true, 'battle-only host forfeits', JSON.stringify(bLeave));
	const bFinPayload = await bGuestFinished;
	assert(bFinPayload?.battle?.status === 'finished',
		'battle-only battle finished after forfeit',
		`status=${bFinPayload?.battle?.status}`);

	// Their real records never joined the world, so there is nothing to
	// exit — disconnecting must be enough to leave no kingdom behind.
	bHost.socket.disconnect();
	bGuest.socket.disconnect();

	// ═══ Scenario C: multi-tab host + mid-battle bot takeover ═════════
	// Repro of the "host hasn't detected the join / host still in the
	// global game" report: the host had TWO tabs open, and the old
	// session layer routed every targeted emit to whichever socket
	// connected last. Every tab must now hear lobby updates and
	// battle_started. Then a latecomer joins the ACTIVE battle and
	// must be handed a live bot seat.
	console.log('\nScenario C: multi-tab host + bot-seat takeover');

	const cHost = await connectClient('E2E MultiTab Host');
	// Second "tab": same identity via the player cookie.
	const cHostTab2 = await new Promise((resolve, reject) => {
		const socket = io(SERVER_URL, {
			transports: ['websocket'],
			reconnection: false,
			extraHeaders: { cookie: `tetches_player_id=${cHost.playerId}` },
		});
		const timer = setTimeout(() => reject(new Error('tab2 connect timed out')), STEP_TIMEOUT_MS);
		socket.on('player_id', (playerId) => {
			clearTimeout(timer);
			resolve({ socket, playerId, name: 'E2E MultiTab Host tab2' });
		});
		socket.on('connect_error', (err) => {
			clearTimeout(timer);
			reject(new Error(`tab2 connect_error ${err.message}`));
		});
	});
	assert(cHostTab2.playerId === cHost.playerId,
		'second tab binds the SAME player identity',
		`tab1=${cHost.playerId} tab2=${cHostTab2.playerId}`);

	const cCreate = await emitAck(cHost, 'battle_create', { seatCount: 3 });
	assert(cCreate.success === true, 'multi-tab host creates a 3-seat battle', cCreate.error);
	const cCode = cCreate.battle?.code;

	// A guest joining the lobby must notify BOTH host tabs.
	const tab1Update = waitForEvent(cHost, 'battle_lobby_update');
	const tab2Update = waitForEvent(cHostTab2, 'battle_lobby_update');
	const cGuest = await connectClient('E2E MultiTab Guest');
	const cGuestJoin = await emitAck(cGuest, 'battle_join', { code: cCode });
	assert(cGuestJoin.success === true, 'guest joins the multi-tab lobby', cGuestJoin.error);
	const [tab1Payload, tab2Payload] = await Promise.all([tab1Update, tab2Update]);
	assert(tab1Payload?.battle?.seats?.length === 2, 'host tab 1 saw the join');
	assert(tab2Payload?.battle?.seats?.length === 2, 'host tab 2 saw the join');

	// Starting must reach both tabs (the "host still in global game" fix).
	const tab1Started = waitForEvent(cHost, 'battle_started');
	const tab2Started = waitForEvent(cHostTab2, 'battle_started');
	const cStart = await emitAck(cHost, 'battle_start', {});
	assert(cStart.success === true, 'multi-tab battle starts', cStart.error);
	assert(cStart.battle.seats.filter(s => s.isAi).length === 1,
		'one seat went to a bot', JSON.stringify(cStart.battle.seats));
	const [t1s, t2s] = await Promise.all([tab1Started, tab2Started]);
	assert(t1s?.battle?.code === cCode, 'host tab 1 received battle_started');
	assert(t2s?.battle?.code === cCode, 'host tab 2 received battle_started');

	// Latecomer takes over the bot seat mid-battle.
	const late = await connectClient('E2E Latecomer');
	const lateStarted = waitForEvent(late, 'battle_started');
	const takeover = await emitAck(late, 'battle_join', { code: cCode });
	assert(takeover.success === true, 'latecomer joins the ACTIVE battle', takeover.error);
	assert(takeover.tookOverBot === true, 'latecomer took over the bot seat',
		JSON.stringify(takeover));
	const lateSeat = takeover.battle.seats.find(s => s.seatId === takeover.seatId);
	assert(lateSeat && !lateSeat.isAi && String(lateSeat.controlledBy) === late.playerId,
		'bot seat now controlled by the latecomer', JSON.stringify(lateSeat));
	const lateEvt = await lateStarted;
	assert(lateEvt?.battle?.code === cCode, 'latecomer received battle_started to adopt the seat');
	assert(takeover.battle.seats.every(s => !s.isAi),
		'battle is now all-human', JSON.stringify(takeover.battle.seats));

	// A second latecomer must be turned away politely (no bots left).
	const late2 = await connectClient('E2E Latecomer 2');
	const noSeat = await emitAck(late2, 'battle_join', { code: cCode });
	assert(noSeat.success === false && /all humans/i.test(noSeat.error || ''),
		'no free bot seat → clean refusal', JSON.stringify(noSeat));

	// Wind the battle down (everyone forfeits until the sweep settles it).
	await emitAck(cHost, 'battle_leave', {});
	await emitAck(cGuest, 'battle_leave', {});
	for (const c of [cHost, cHostTab2, cGuest, late, late2]) c.socket.disconnect();

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
