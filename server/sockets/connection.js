/**
 * Per-socket connection wiring.  Resolves the player id from the cookie,
 * registers all event handlers, and arms a disconnect grace timer that
 * either welcomes the player back on reconnect or, after the grace
 * period, fully removes them.
 */

const { randomUUID: uuidv4 } = require('crypto');

const World = require('../world/World');
const Sessions = require('../world/Sessions');
const Disconnects = require('../world/Disconnects');
const { parseCookies } = require('../utils/cookies');
const funnel = require('../observability/funnel');

const { validatePlayerName } = require('../utils/validation');
const { registerJoinHandlers } = require('./join');
const { registerTetrominoHandlers } = require('./tetromino');
const { registerChessHandlers } = require('./chess');
const { registerDuelHandlers } = require('./duels');
const { registerStateHandlers } = require('./state');
const { registerSpectateHandlers } = require('./spectate');
const { registerLifecycleHandlers } = require('./lifecycle');
const { attachPacketShape } = require('./packetShape');
const {
	SESSION_COOKIE,
	bindNewSecret,
	hasSecret,
	verifySecret,
	accountIdForKey,
} = require('../security/playerSession');
const { registerBattleHandlers } = require('./battle');
const { attachSocketRateLimit } = require('./rateLimiter');
// External AI registry. Imported via `module.exports.validateApiToken`
// on the routes module rather than the router object so a circular
// import doesn't end up empty at load time.
const externalApi = require('../../routes/api');

const PLAYER_ID_COOKIE = 'tetches_player_id';
const API_TOKEN_COOKIE = 'tetches_api_token';
// Set by the client's username+passphrase login. Distinct from the
// anonymous `tetches_player_id` device cookie: an auth key is *adopted*
// as the canonical identity (resume an existing account, migrate a guest
// kingdom on first login, or claim a fresh one) so the same kingdom
// follows a player across devices.
const AUTH_KEY_COOKIE = 'tetches_auth_key';

// Account keys are derived client-side from credentials as `player_<hex>`
// (16–64 hex chars). The strict shape keeps them in their own namespace —
// they can never collide with anonymous uuid device ids or `ai-…` bot ids,
// and it blocks attempts to "claim" some other player's arbitrary id.
function isWellFormedAuthKey(key) {
	return typeof key === 'string' && /^player_[a-f0-9]{16,64}$/.test(key);
}

function createConnectionHandler(services) {
	const { io, lifecycleService, spectatorRegistry, pauseService, getBundleVersion } = services;
	if (!io) throw new Error('createConnectionHandler: io required');
	if (!lifecycleService) throw new Error('createConnectionHandler: lifecycleService required');
	if (!spectatorRegistry) throw new Error('createConnectionHandler: spectatorRegistry required');
	if (!pauseService) throw new Error('createConnectionHandler: pauseService required');

	return function handleConnection(socket) {
		let playerId;
		try {
			playerId = resolvePlayerIdForSocket(socket, services);
		} catch (err) {
			// `resolvePlayerIdForSocket` throws on auth_token failure
			// after disconnecting the socket. Nothing more to do.
			return;
		}
		Sessions.bind(socket, playerId);

		// Every socket joins the world broadcast room, participant or
		// not. Most identity paths already joined inside
		// `resolvePlayerIdForSocket`, but brand-new visitors did NOT —
		// so a first-visit spectator (or battle-only player, who never
		// calls join_game) silently missed every `game_update`
		// broadcast until their first refresh. Joining twice is a no-op.
		socket.join(World.getWorldId());

		// Wire-level flood protection (runs before any event handler).
		attachSocketRateLimit(socket);
		// Strip junk trailing args so `callback` is a function or undefined.
		attachPacketShape(socket);

		socket.emit('player_id', playerId);
		// The session secret is only sent when one was just issued (new
		// player, or a legacy record binding its first secret).
		const issued = socket.data && socket.data.issuedSessionSecret;
		socket.emit('set_session', issued ? { playerId, sessionSecret: issued } : { playerId });

		// Tell the client which build the server is on. Old clients
		// compare this against the bundle version embedded in their
		// page (`window.__BUNDLE_VERSION__`) and display a "please
		// refresh" prompt if they're more than one redeploy behind.
		// Also lets the server detect cheating front-ends that
		// connect without ever loading the SPA: they won't reply
		// with `client_version_ack` and we can flag them in the log.
		try {
			const serverBundleVersion = typeof getBundleVersion === 'function'
				? String(getBundleVersion() || '')
				: '';
			socket.emit('server_version', {
				bundleVersion: serverBundleVersion,
				serverTs: Date.now(),
			});
		} catch (err) {
			console.warn('[Connection] server_version emit failed:', err.message);
		}

		// Gameplay handlers act as the player's battle SEAT while they're
		// in an active battle; their real-world kingdom is untouched.
		// Which battle (a player can hold several) is the socket's FOCUS,
		// set by the client's `battle_focus` — undefined means legacy
		// auto-resolution (first active battle).
		const resolveActingPlayerId = () => {
			try {
				return services.battleManager
					? services.battleManager.effectivePlayerId(playerId, {
						focusBattleId: socket.data ? socket.data.focusedBattleId : undefined,
					})
					: playerId;
			} catch (_e) {
				return playerId;
			}
		};
		const handlerCtx = { ...services, playerId, socket, resolveActingPlayerId };

		registerJoinHandlers(socket, handlerCtx);
		registerTetrominoHandlers(socket, handlerCtx);
		registerChessHandlers(socket, handlerCtx);
		registerDuelHandlers(socket, handlerCtx);
		registerStateHandlers(socket, handlerCtx);
		registerSpectateHandlers(socket, handlerCtx);
		registerLifecycleHandlers(socket, handlerCtx);
		registerBattleHandlers(socket, handlerCtx);

		// One-shot fetch so a freshly-connected client can paint the
		// fleet immediately instead of waiting for the next
		// `boats_update` broadcast.
		if (services.boatManager && typeof services.boatManager.getSnapshot === 'function') {
			socket.on('get_boats', (cb) => {
				try {
					const snapshot = services.boatManager.getSnapshot();
					if (typeof cb === 'function') cb({ boats: snapshot, ts: Date.now() });
				} catch (err) {
					if (typeof cb === 'function') cb({ error: err.message });
				}
			});
		}

		socket.on('disconnect', () => {
			handleDisconnect(socket, playerId, services);
		});
	};
}

function handshakePlayerName(socket) {
	const raw = socket.handshake?.query?.playerName;
	return validatePlayerName(raw);
}

function isAutoGeneratedPlayerName(name) {
	if (!name || typeof name !== 'string') return true;
	return /^Player_[a-f0-9]{6}$/i.test(name.trim())
		|| /^DevPlayer_/i.test(name.trim());
}

/**
 * Pull a {playerId, apiToken} pair out of the handshake. We accept
 * either the query string (`?playerId=…&apiToken=…`) or cookies
 * (`tetches_player_id=…; tetches_api_token=…`). Both are read-only
 * lookups so it doesn't matter which the bot uses.
 */
function readRegisteredBotCredentials(socket, cookies) {
	const query = socket.handshake?.query || {};
	const playerId = (query.playerId && String(query.playerId).trim())
		|| cookies[PLAYER_ID_COOKIE]
		|| null;
	const apiToken = (query.apiToken && String(query.apiToken).trim())
		|| cookies[API_TOKEN_COOKIE]
		|| null;
	return { playerId, apiToken };
}

function resolvePlayerIdForSocket(socket, services) {
	const { lifecycleService } = services;
	const cookies = parseCookies(socket.handshake.headers.cookie);
	const handshakeName = handshakePlayerName(socket);

	// Registered external-AI path: if the bot presents the playerId
	// + apiToken they got from `POST /api/computer-players/register`,
	// claim that identity even if no World record exists yet (or one
	// was wiped by the disconnect-grace sweep). Token validation is
	// the only place an external bot is auth'd; once authed they
	// behave exactly like any other socket player.
	const creds = readRegisteredBotCredentials(socket, cookies);
	if (creds.apiToken
		&& creds.playerId
		&& typeof externalApi.validateApiToken === 'function'
		&& externalApi.validateApiToken(creds.playerId, creds.apiToken)) {
		const botId = creds.playerId;
		Disconnects.clear(botId);
		const record = World.getPlayer(botId);
		const desiredName = (handshakeName && handshakeName.toLowerCase() !== 'guest')
			? handshakeName
			: (record?.name || `Bot_${botId.slice(-6)}`);
		if (!record) {
			console.log(`External AI re-binding identity ${botId} (no prior record; recreating)`);
			World.upsertPlayer(botId, {
				name: desiredName,
				isComputer: true,
				external: true,
				lastActiveAt: Date.now(),
			});
		} else {
			console.log(`External AI ${botId} connecting (socket ${socket.id})`);
			record.lastActiveAt = Date.now();
			record.isComputer = true;
			record.external = true;
			if (handshakeName
				&& handshakeName.toLowerCase() !== 'guest'
				&& isAutoGeneratedPlayerName(record.name)) {
				record.name = handshakeName;
			}
			World.markDirty();
		}
		socket.join(World.getWorldId());
		return botId;
	}

	// Reject a query-string token that didn't match. A *missing*
	// token is fine (regular browser join); a *wrong* one is most
	// likely a bot misconfigured against the wrong server.
	if (creds.apiToken && !externalApi.validateApiToken?.(creds.playerId, creds.apiToken)) {
		console.warn(`External AI auth failed for playerId=${creds.playerId} (socket ${socket.id})`);
		socket.emit('auth_error', { reason: 'invalid_api_token' });
		try { socket.disconnect(true); } catch (_e) { /* socket already closing */ }
		// Fall through to a throw so callers don't accidentally use
		// an unauthenticated identity.
		throw new Error('invalid_api_token');
	}

	// Authenticated account path (username+passphrase login). The client
	// derives a stable, high-entropy key from credentials and presents it
	// as `tetches_auth_key`; the account's public id is derived from it
	// (accountIdForKey) so the kingdom follows the player across
	// devices/browsers without the key ever being broadcast.
	const authKey = cookies[AUTH_KEY_COOKIE];
	if (authKey && isWellFormedAuthKey(authKey)) {
		// The key is the credential, so it must never be the (public,
		// broadcast) player id. The account lives under a derived id.
		const accountId = accountIdForKey(authKey);
		// One-time migration: accounts created before this split were
		// stored — and broadcast — under the raw key.
		if (!World.getPlayer(accountId) && World.getPlayer(authKey)
			&& World.reassignPlayerId(authKey, accountId)) {
			Disconnects.clear(authKey);
			console.log(`Account sign-in: moved ${accountId} off its raw-key id`);
			World.markDirty();
		}
		Disconnects.clear(accountId);
		const account = World.getPlayer(accountId);

		if (account && !account.eliminated) {
			console.log(`Account sign-in: ${accountId} (socket ${socket.id})`);
			account.lastActiveAt = Date.now();
			if (handshakeName
				&& handshakeName.toLowerCase() !== 'guest'
				&& isAutoGeneratedPlayerName(account.name)) {
				account.name = handshakeName;
			}
			World.markDirty();
			socket.join(World.getWorldId());
			return accountId;
		}

		// A stale eliminated account record blocks reuse — clear it so the
		// key starts from a clean slate.
		if (account && account.eliminated) {
			lifecycleService.removePlayerCompletely(accountId);
		}

		// First sign-in on this key: migrate the player's current guest
		// kingdom (if any) onto the account so logging in KEEPS progress
		// rather than starting them over.
		const deviceId = cookies[PLAYER_ID_COOKIE];
		if (deviceId && deviceId !== accountId) {
			const guest = World.getPlayer(deviceId);
			// Only the guest's owner (holding its session secret) may carry
			// it into an account — otherwise pairing a fresh key with a
			// victim's public id would steal their kingdom.
			if (guest && !guest.isComputer && !guest.eliminated
				&& verifySecret(guest, cookies[SESSION_COOKIE])
				&& World.reassignPlayerId(deviceId, accountId)) {
				Disconnects.clear(deviceId);
				console.log(`Account sign-in: migrated guest ${deviceId} → ${accountId} (socket ${socket.id})`);
				const migrated = World.getPlayer(accountId);
				if (migrated) {
					migrated.lastActiveAt = Date.now();
					if (handshakeName
						&& handshakeName.toLowerCase() !== 'guest'
						&& isAutoGeneratedPlayerName(migrated.name)) {
						migrated.name = handshakeName;
					}
				}
				World.markDirty();
				socket.join(World.getWorldId());
				return accountId;
			}
		}

		// Brand-new account with no guest kingdom to carry over — create a
		// fresh record under the derived id. The join flow assigns a home zone
		// exactly as it does for any new player.
		console.log(`Account sign-in: new account ${accountId} (socket ${socket.id})`);
		const accountName = (handshakeName && handshakeName.toLowerCase() !== 'guest')
			? handshakeName
			: `Player_${String(accountId).slice(-6)}`;
		World.upsertPlayer(accountId, { name: accountName, lastActiveAt: Date.now() });
		socket.join(World.getWorldId());
		return accountId;
	}

	let playerId = cookies[PLAYER_ID_COOKIE];
	let existingRecord = playerId ? World.getPlayer(playerId) : null;
	if (existingRecord && !canReclaimGuest(existingRecord, playerId, cookies[SESSION_COOKIE])) {
		// Knowing a (public) player id isn't enough to become that player.
		console.warn(`Refused reclaim of ${playerId} without its session secret (socket ${socket.id})`);
		existingRecord = null;
	}
	const wasEliminated = !!existingRecord?.eliminated;

	if (existingRecord && !wasEliminated) {
		console.log(`Player reconnecting: ${playerId} (socket ${socket.id})`);
		Disconnects.clear(playerId);
		if (!hasSecret(existingRecord)) {
			// Legacy guest from before session secrets: bind one now.
			issueSecret(socket, existingRecord);
		}
		existingRecord.lastActiveAt = Date.now();
		if (handshakeName
			&& handshakeName.toLowerCase() !== 'guest'
			&& isAutoGeneratedPlayerName(existingRecord.name)) {
			existingRecord.name = handshakeName;
		}
		World.markDirty();
		socket.join(World.getWorldId());
		return playerId;
	}

	if (existingRecord && wasEliminated) {
		console.log(`Eliminated player ${playerId} refreshed; issuing a fresh player identity.`);
		Disconnects.clear(playerId);
		lifecycleService.removePlayerCompletely(playerId);
	}

	const freshId = uuidv4();
	console.log(`New player connected: ${freshId} (socket ${socket.id})`);
	// Funnel: a fresh identity means a device we have never seen before.
	// (Account sign-ins above don't count — that human was already counted
	// when they first arrived as a guest.)
	funnel.recordNewVisitor();
	const initialName = (handshakeName && handshakeName.toLowerCase() !== 'guest')
		? handshakeName
		: `Player_${freshId.substring(0, 6)}`;
	const fresh = World.upsertPlayer(freshId, {
		name: initialName,
		lastActiveAt: Date.now(),
	});
	issueSecret(socket, fresh);
	return freshId;
}

// Guest ids minted before session secrets existed (plain uuids). Such a
// record, with no secret yet, is bound to the first browser that
// presents it — its owner, in practice, since that browser already
// holds the id cookie. Nothing else (accounts, bots, battle seats) is
// ever claimable without a secret.
const LEGACY_GUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function canReclaimGuest(record, playerId, secret) {
	if (record.isComputer || record.external) return false;
	if (hasSecret(record)) return verifySecret(record, secret);
	return LEGACY_GUEST_ID.test(String(playerId));
}

function issueSecret(socket, record) {
	const secret = bindNewSecret(record);
	World.markDirty();
	if (!socket.data) socket.data = {};
	socket.data.issuedSessionSecret = secret;
}

function handleDisconnect(socket, playerId, services) {
	const { lifecycleService, spectatorRegistry } = services;

	Sessions.unbind(socket.id);

	// Multi-tab: if the player still has another live socket (second
	// browser tab), this was not a real disconnect — skip the grace
	// timer and the lastDisconnectAt stamp entirely.
	if (Sessions.isOnline(playerId)) {
		console.log(`Player ${playerId} closed a tab (still connected on another socket)`);
		return;
	}

	console.log(`Player disconnected: ${playerId} (grace period ${Disconnects.DEFAULT_GRACE_MS / 1000}s)`);
	spectatorRegistry.stop(playerId);

	// Note the disconnect time on the record so the island-decay /
	// ghost-sweep machinery can use it as one input among several
	// when deciding fate. Crucially we do NOT delete the player or
	// their pieces here — the player reported losing every piece
	// after stepping away for a couple of minutes (grace expired
	// while they were AFK), and that's strictly worse than just
	// letting natural decay handle abandoned territory over a longer
	// window. The ghost-player sweep still picks up records that
	// have hit zero pieces via island decay; we just don't pre-empt it.
	const record = World.getPlayer(playerId);
	if (record) {
		record.lastDisconnectAt = Date.now();
		// `lastActiveAt` keeps moving with reconnects, so don't bump
		// it backwards here — the dissolve-timing code uses it as a
		// freshness signal.
	}

	if (record) {
		Disconnects.arm(playerId, () => {
			console.log(`Grace period expired for ${playerId} — leaving pieces in place (natural decay handles abandoned territory).`);
			// Intentional no-op: don't `removePlayerCompletely` here.
			// Explicit exit (`exit_game`) still removes pieces immediately;
			// island decay / ghost sweep will GC abandoned humans once
			// they're truly empty.
		});
	} else {
		lifecycleService.removePlayerCompletely(playerId);
	}
}

module.exports = {
	createConnectionHandler,
	resolvePlayerIdForSocket,
	PLAYER_ID_COOKIE,
	AUTH_KEY_COOKIE,
	isWellFormedAuthKey,
};
