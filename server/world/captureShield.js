/**
 * A fair chance to answer, in the shared world.
 *
 * Seen on 2026-11-26: a player founded a kingdom 30 squares from a bot
 * that was already raiding; its knight took eleven pieces and the king
 * in 100 seconds, one every 5 to 20 seconds, while the player was still
 * finding their feet. A human skipping their drops could do the same.
 * Two rules stop that:
 *
 *   • Shelter. A kingdom just founded can't be captured from for
 *     NEW_KINGDOM_MS, one whose ruler has just come back online for
 *     RETURN_MS (offline kingdoms are already safe from raiders). The
 *     shelter ends early the moment its owner captures something: a
 *     ruler who strikes is fair game.
 *   • Right of reply. After A takes one of B's pieces, A may not take
 *     another of B's until B has answered (made a chess move, or
 *     skipped one) or REPLY_MS has passed. Duels go back and forth as
 *     in chess; an idle victim still loses, but slowly enough that
 *     anyone at the screen can fight back.
 *
 * World only: battles are short games everyone sat down to play.
 * Bots both obey and are covered (a bot's kingdom gets the reply rule;
 * bots are never sheltered).
 *
 * State lives on the player records, so it is saved with the world:
 *   record.shelteredUntil  ms
 *   record.answerDue       { [attackerId]: ms of the capture }
 *   record.lastChessMoveAt ms (already kept by every move path)
 */

'use strict';

const SHIELD = Object.freeze({
	NEW_KINGDOM_MS: 90 * 1000,
	RETURN_MS: 45 * 1000,
	/** Away at least this long to earn the return shelter (a reload doesn't). */
	RETURN_AWAY_MIN_MS: 2 * 60 * 1000,
	REPLY_MS: 25 * 1000,
});

const SHIELD_TEXT = Object.freeze({
	sheltered: 'That kingdom has only just arrived: it is sheltered for a few moments.',
	reply_turn: 'Give them a chance to answer: you can take another of their pieces once they have moved.',
});

function recordOf(world, playerId) {
	if (!world || !world.players || playerId == null) return null;
	return world.players[String(playerId)] || null;
}

function isBot(record) {
	return !!(record && (record.isComputer || record.isAi || record.isAI));
}

/** Is this a shared-world kingdom (not a battle seat)? */
function inWorld(record) {
	return !!record && !record.battleId;
}

/**
 * The veto for `attackerId` taking a piece owned by `ownerId`, or null.
 * `{ reason, message, waitMs }`.
 */
function shieldVeto(world, attackerId, ownerId, now = Date.now()) {
	if (attackerId == null || ownerId == null || String(attackerId) === String(ownerId)) return null;
	const owner = recordOf(world, ownerId);
	const attacker = recordOf(world, attackerId);
	if (!inWorld(owner) || !inWorld(attacker)) return null;

	const until = Number(owner.shelteredUntil) || 0;
	if (until > now) {
		return { reason: 'sheltered', message: SHIELD_TEXT.sheltered, waitMs: until - now };
	}

	const raw = owner.answerDue ? owner.answerDue[String(attackerId)] : undefined;
	const due = Number(raw);
	if (raw != null && Number.isFinite(due)) {
		const answered = (Number(owner.lastChessMoveAt) || 0) > due;
		const waited = now - due >= SHIELD.REPLY_MS;
		if (!answered && !waited) {
			return { reason: 'reply_turn', message: SHIELD_TEXT.reply_turn, waitMs: SHIELD.REPLY_MS - (now - due) };
		}
	}
	return null;
}

/**
 * A capture happened: the victim now has a reply owed by the attacker,
 * and an attacker who was sheltered gives the shelter up.
 */
function noteCapture(world, attackerId, victimId, now = Date.now()) {
	if (attackerId == null || victimId == null || String(attackerId) === String(victimId)) return;
	const victim = recordOf(world, victimId);
	const attacker = recordOf(world, attackerId);
	if (!inWorld(victim) || !inWorld(attacker)) return;
	if (!victim.answerDue || typeof victim.answerDue !== 'object') victim.answerDue = {};
	victim.answerDue[String(attackerId)] = now;
	// (old entries: anything past the reply window is spent)
	for (const [id, at] of Object.entries(victim.answerDue)) {
		if (now - Number(at) >= SHIELD.REPLY_MS && id !== String(attackerId)) delete victim.answerDue[id];
	}
	if (Number(attacker.shelteredUntil) > now) attacker.shelteredUntil = 0;
}

/**
 * Shelter a human's kingdom for `ms` (never shortens one already
 * running). Bots and battle seats are never sheltered.
 * @returns {number} the shelter's end, or 0 when none applies
 */
function shelter(world, playerId, ms, now = Date.now()) {
	const record = recordOf(world, playerId);
	if (!inWorld(record) || isBot(record)) return 0;
	const until = now + ms;
	if (!(Number(record.shelteredUntil) >= until)) record.shelteredUntil = until;
	return record.shelteredUntil;
}

/** Seconds of shelter left for a player (0 when none), for the client. */
function shelterLeftMs(world, playerId, now = Date.now()) {
	const record = recordOf(world, playerId);
	const until = record ? Number(record.shelteredUntil) || 0 : 0;
	return Math.max(0, until - now);
}

module.exports = {
	SHIELD,
	SHIELD_TEXT,
	shieldVeto,
	noteCapture,
	shelter,
	shelterLeftMs,
};
