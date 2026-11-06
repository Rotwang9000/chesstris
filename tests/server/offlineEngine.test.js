/**
 * Offline mode: the game's server code running in a Web Worker.
 *
 *  • the browser `crypto` shim matches Node's for what the game uses;
 *  • the in-memory socket.io stand-in routes rooms like the real one;
 *  • the BUILT engine bundle (scripts/build-offline.js) plays a whole
 *    Quick battle against a bot through the postMessage interface.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const nodeCrypto = require('crypto');

const shimCrypto = require('../../offline/shims/crypto');
const { FakeIoServer } = require('../../offline/fakeIo');

describe('offline crypto shim', () => {
	test('sha256 matches Node', () => {
		for (const input of ['', 'abc', 'tetches-account:player_' + 'ab'.repeat(20), 'x'.repeat(1000)]) {
			const expected = nodeCrypto.createHash('sha256').update(input).digest('hex');
			expect(shimCrypto.createHash('sha256').update(input).digest('hex')).toBe(expected);
		}
	});

	test('hmac-sha256 matches Node', () => {
		const expected = nodeCrypto.createHmac('sha256', 'key').update('The quick brown fox jumps over the lazy dog').digest('hex');
		expect(shimCrypto.createHmac('sha256', 'key').update('The quick brown fox jumps over the lazy dog').digest('hex')).toBe(expected);
	});

	test('random ids have the right shape', () => {
		expect(shimCrypto.randomBytes(5).toString('hex')).toMatch(/^[0-9a-f]{10}$/);
		expect(shimCrypto.randomBytes(6)[5]).toBeGreaterThanOrEqual(0);
		expect(shimCrypto.randomUUID()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
		expect(shimCrypto.timingSafeEqual(Uint8Array.from([1, 2]), Uint8Array.from([1, 2]))).toBe(true);
		expect(shimCrypto.timingSafeEqual(Uint8Array.from([1, 2]), Uint8Array.from([1, 3]))).toBe(false);
	});
});

describe('offline socket.io stand-in', () => {
	function connect(io, id) {
		const got = [];
		const socket = io.connect({ id, send: (m) => got.push(m) });
		return { socket, got };
	}

	test('rooms, except and socket.to route like socket.io', () => {
		const io = new FakeIoServer();
		const a = connect(io, 'a');
		const b = connect(io, 'b');
		a.socket.join('world');
		b.socket.join('world');
		b.socket.join('legacy');

		io.to('world').except('legacy').emit('delta', 1);
		a.socket.to('world').emit('from_a', 2);
		io.to('a').emit('direct', 3);
		io.emit('all', 4);

		const events = (c) => c.got.filter(m => m.type === 'event').map(m => m.event);
		expect(events(a)).toEqual(['delta', 'direct', 'all']);
		expect(events(b)).toEqual(['from_a', 'all']);
		expect(io.engine.clientsCount).toBe(2);
	});

	test('middleware runs before handlers and acks reach the client', () => {
		const io = new FakeIoServer();
		const { socket } = connect(io, 'a');
		const seen = [];
		socket.use((packet, next) => { seen.push(packet[0]); if (packet[0] !== 'blocked') next(); });
		socket.on('ping_me', (data, ack) => ack({ pong: data.n }));
		socket.on('blocked', () => seen.push('handler ran'));

		const replies = [];
		socket._receive('ping_me', [{ n: 7 }], (r) => replies.push(r));
		socket._receive('blocked', [{}], undefined);
		expect(replies).toEqual([{ pong: 7 }]);
		expect(seen).toEqual(['ping_me', 'blocked']);
	});
});

describe('offline engine bundle', () => {
	let outDir;
	let bundle;

	beforeAll(async () => {
		const { buildOffline } = require('../../scripts/build-offline');
		outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tetches-offline-'));
		const built = await buildOffline({ outfile: path.join(outDir, 'engine.js'), minify: false, logLevel: 'silent' });
		bundle = built.outfile;
		// Nothing from node_modules: the app ships without npm packages.
		expect(built.inputs.filter(f => f.includes('node_modules'))).toEqual([]);
	}, 30000);

	afterAll(() => {
		jest.useRealTimers();
		delete global.self;
		fs.rmSync(outDir, { recursive: true, force: true });
	});

	test('plays a whole Quick battle against a bot', () => {
		jest.useFakeTimers();
		const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
		const posted = [];
		// The engine reads its dev knobs from the worker script URL.
		global.self = { postMessage: (m) => posted.push(m), location: { search: '?seaScale=0.2' } };
		jest.isolateModules(() => { require(bundle); });

		let ackSeq = 0;
		const emit = (event, data) => {
			const ackId = ++ackSeq;
			global.self.onmessage({ data: { type: 'emit', socketId: 's1', event, args: [data], ackId } });
			return posted.find(m => m.type === 'ack' && m.ackId === ackId)?.args?.[0];
		};

		expect(posted[0]).toEqual({ type: 'ready' });
		global.self.onmessage({ data: { type: 'connect', socketId: 's1', query: { playerName: 'Tester', proto: '2' } } });
		const connectAt = posted.findIndex(m => m.type === 'connect');
		const playerIdAt = posted.findIndex(m => m.event === 'player_id');
		expect(connectAt).toBeGreaterThan(-1);
		expect(playerIdAt).toBeGreaterThan(connectAt);

		const created = emit('battle_create', { seatCount: 2, botDifficulty: 'hard', mode: 'quick' });
		expect(created.success).toBe(true);
		expect(created.battle.mode).toBe('quick');
		expect(emit('battle_start', { battleId: created.battle.id }).success).toBe(true);
		expect(posted.some(m => m.event === 'battle_started')).toBe(true);

		// The sea runs 5× fast: 8 s calm + 18 bands × 4.4 s ≈ 90 s.
		jest.advanceTimersByTime(30 * 1000);
		expect(posted.filter(m => m.event === 'chess_move').length).toBeGreaterThan(0);
		jest.advanceTimersByTime(120 * 1000);

		const finished = posted.find(m => m.event === 'battle_finished');
		expect(finished).toBeDefined();
		const { battle } = finished.args[0];
		expect(battle.status).toBe('finished');
		// Someone won, by the sea or a capture (an idle player can't
		// out-last a bot that keeps moving inward, but bots aren't perfect).
		expect(battle.winnerSeatId).toBeTruthy();
		const me = finished.args[0].results.standings.find(x => !x.isAi);
		expect(me.knockedOutBy).toBe('the sea');
		if (process.env.DEBUG_OFFLINE) {
			const winner = finished.args[0].results.standings.find(x => x.place === 1);
			process.stdout.write(`WINNER ${winner.isAi ? 'bot' : 'idle human'}\n`);
		}
		// Everything crossing to the page is plain JSON.
		for (const m of posted) expect(() => JSON.stringify(m)).not.toThrow();

		jest.clearAllTimers();
		spy.mockRestore();
	}, 30000);
});
