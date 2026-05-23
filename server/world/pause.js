/**
 * Player pause / resume service.
 *
 * The pause feature lets a player freeze the world's degradation /
 * line-clear pressure on their own pieces for a short window so they
 * can step away from the keyboard without coming back to a wiped
 * board. It is **not** a true world-pause — other players keep
 * playing — only the calling player's footprint becomes inert:
 *
 *   • Their home zone does not degrade while paused.
 *   • Their cells are skipped by the line-clear scan (`isPaused`
 *     ownership on a cell breaks the run, same as a degraded-home
 *     remnant).
 *   • Their chess pieces cannot be captured.
 *
 * Limits (per session, reset on `player_id` change or explicit
 * `resetUsage`):
 *   • `PAUSE_MAX_USES`   — number of distinct pauses they may start.
 *   • `PAUSE_MAX_TOTAL_MS` — total accumulated paused time.
 *   • `PAUSE_AUTO_RESUME_MS` — single pause length cap before the
 *      server auto-resumes them.
 *
 * Persisted on the player record so the limits survive a server
 * restart and so the client can show "X pauses left" in the UI.
 */

const World = require('./World');

const PAUSE_MAX_USES = 4;
const PAUSE_MAX_TOTAL_MS = 60 * 60 * 1000;       // 60 minutes per session
const PAUSE_AUTO_RESUME_MS = 30 * 60 * 1000;     // 30 min single pause

function nowMs() { return Date.now(); }

function ensurePauseRecord(player) {
	if (!player.pauseState || typeof player.pauseState !== 'object') {
		player.pauseState = {
			active: false,
			pausedAt: 0,
			usesRemaining: PAUSE_MAX_USES,
			totalPausedMs: 0,
			lastResumeAt: 0,
		};
	}
	if (!Number.isFinite(player.pauseState.usesRemaining)) {
		player.pauseState.usesRemaining = PAUSE_MAX_USES;
	}
	if (!Number.isFinite(player.pauseState.totalPausedMs)) {
		player.pauseState.totalPausedMs = 0;
	}
	return player.pauseState;
}

function buildStatus(player) {
	const state = ensurePauseRecord(player);
	return {
		active: !!state.active,
		pausedAt: state.pausedAt || 0,
		usesRemaining: Math.max(0, state.usesRemaining),
		totalPausedMs: state.totalPausedMs,
		maxTotalMs: PAUSE_MAX_TOTAL_MS,
		autoResumeMs: PAUSE_AUTO_RESUME_MS,
	};
}

function createPauseService({ io = null, broadcaster = null, persistence = null } = {}) {
	const autoResumeTimers = new Map();

	function clearAutoResume(playerId) {
		const handle = autoResumeTimers.get(playerId);
		if (handle) {
			clearTimeout(handle);
			autoResumeTimers.delete(playerId);
		}
	}

	function emitStatus(playerId, status) {
		if (!io) return;
		try {
			io.to(World.getWorldId()).emit('player_pause_state', {
				playerId,
				...status,
			});
		} catch (err) {
			console.warn('[Pause] emit failed:', err.message);
		}
	}

	function pause(playerId) {
		const player = World.getPlayer(playerId);
		if (!player) return { ok: false, error: 'player_not_found' };
		const state = ensurePauseRecord(player);

		if (state.active) {
			return { ok: true, status: buildStatus(player), alreadyPaused: true };
		}
		if (state.usesRemaining <= 0) {
			return { ok: false, error: 'pause_uses_exhausted', status: buildStatus(player) };
		}
		const remainingBudget = PAUSE_MAX_TOTAL_MS - state.totalPausedMs;
		if (remainingBudget <= 0) {
			return { ok: false, error: 'pause_budget_exhausted', status: buildStatus(player) };
		}

		state.active = true;
		state.pausedAt = nowMs();
		state.usesRemaining = Math.max(0, state.usesRemaining - 1);
		player.paused = true;

		const cap = Math.min(PAUSE_AUTO_RESUME_MS, remainingBudget);
		const handle = setTimeout(() => {
			resume(playerId, { reason: 'auto_timeout' });
		}, cap);
		if (typeof handle.unref === 'function') handle.unref();
		autoResumeTimers.set(playerId, handle);

		if (persistence) persistence.markDirty();
		World.markDirty();
		const status = buildStatus(player);
		emitStatus(playerId, status);
		if (broadcaster && typeof broadcaster.broadcastGameUpdate === 'function') {
			broadcaster.broadcastGameUpdate({ forceFullUpdate: false });
		}
		return { ok: true, status };
	}

	function resume(playerId, { reason = 'manual' } = {}) {
		const player = World.getPlayer(playerId);
		if (!player) return { ok: false, error: 'player_not_found' };
		const state = ensurePauseRecord(player);

		if (!state.active) {
			return { ok: true, status: buildStatus(player), alreadyResumed: true };
		}

		const elapsed = Math.max(0, nowMs() - (state.pausedAt || nowMs()));
		state.active = false;
		state.totalPausedMs = Math.min(PAUSE_MAX_TOTAL_MS, state.totalPausedMs + elapsed);
		state.lastResumeAt = nowMs();
		state.pausedAt = 0;
		player.paused = false;
		clearAutoResume(playerId);

		if (persistence) persistence.markDirty();
		World.markDirty();
		const status = buildStatus(player);
		emitStatus(playerId, { ...status, resumeReason: reason });
		if (broadcaster && typeof broadcaster.broadcastGameUpdate === 'function') {
			broadcaster.broadcastGameUpdate({ forceFullUpdate: false });
		}
		return { ok: true, status, resumeReason: reason };
	}

	function getStatus(playerId) {
		const player = World.getPlayer(playerId);
		if (!player) return null;
		return buildStatus(player);
	}

	function resetUsage(playerId) {
		const player = World.getPlayer(playerId);
		if (!player) return;
		player.pauseState = null;
		player.paused = false;
		clearAutoResume(playerId);
		ensurePauseRecord(player);
	}

	function shutdown() {
		for (const playerId of autoResumeTimers.keys()) clearAutoResume(playerId);
	}

	return {
		pause,
		resume,
		getStatus,
		resetUsage,
		shutdown,
		PAUSE_MAX_USES,
		PAUSE_MAX_TOTAL_MS,
		PAUSE_AUTO_RESUME_MS,
	};
}

module.exports = {
	createPauseService,
	PAUSE_MAX_USES,
	PAUSE_MAX_TOTAL_MS,
	PAUSE_AUTO_RESUME_MS,
};
