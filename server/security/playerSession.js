/**
 * Player session secrets.
 *
 * A player id is PUBLIC: it's in every game_update, on every chess
 * piece and board cell, and in GET /api/world. It used to be the only
 * thing a socket had to present (as the `tetches_player_id` cookie) to
 * become that player, so anyone could copy an id into their cookie and
 * take over the kingdom.
 *
 * Now each human record carries `sessionSecretHash` — the SHA-256 of a
 * random 256-bit secret that only the owner's browser holds (the
 * `tetches_session` cookie). Reclaiming an id requires the secret. Only
 * the hash is stored, so a leaked save file or snapshot can't be
 * replayed.
 *
 * Account ("kingdom key") players: the key the client derives from
 * username + passphrase is itself the credential, so it must never be
 * the public id. `accountIdForKey` maps it to an opaque public id.
 */

const crypto = require('crypto');

const SESSION_COOKIE = 'tetches_session';

function hashSecret(secret) {
	return crypto.createHash('sha256').update(String(secret)).digest('hex');
}

/** Give `record` a fresh secret; returns the plaintext to hand the client. */
function bindNewSecret(record) {
	const secret = crypto.randomBytes(32).toString('hex');
	record.sessionSecretHash = hashSecret(secret);
	return secret;
}

function hasSecret(record) {
	return !!(record && typeof record.sessionSecretHash === 'string' && record.sessionSecretHash);
}

function verifySecret(record, secret) {
	if (!hasSecret(record) || typeof secret !== 'string' || !secret) return false;
	const a = Buffer.from(hashSecret(secret), 'hex');
	const b = Buffer.from(record.sessionSecretHash, 'hex');
	return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Public id for an account key. Deliberately NOT in the `player_<hex>`
 * auth-key shape, so a public id can never be presented as a key.
 */
function accountIdForKey(authKey) {
	const digest = crypto.createHash('sha256')
		.update(`tetches-account:${authKey}`)
		.digest('hex');
	return `acct_${digest.slice(0, 32)}`;
}

module.exports = {
	SESSION_COOKIE,
	bindNewSecret,
	hasSecret,
	verifySecret,
	accountIdForKey,
};
