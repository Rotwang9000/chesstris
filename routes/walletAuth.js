/**
 * Wallet-based authentication for advertisers.
 *
 * Flow:
 *   1. Client calls POST /api/wallet-auth/challenge with their Solana
 *      address. Server generates a random nonce, stamps it with a
 *      5-minute expiry, and stores it in-memory.
 *   2. Client signs the nonce string with their wallet
 *      (`window.solana.signMessage(...)`).
 *   3. Client calls POST /api/wallet-auth/verify with the signature
 *      and the original nonce string. Server verifies the
 *      ed25519 signature against the address; on success issues a
 *      short-lived bearer token (HMAC-signed, 1 h expiry).
 *   4. Subsequent requests include `Authorization: Bearer <token>`;
 *      the `requireWalletSession` middleware validates the token
 *      and exposes `req.walletAddress`.
 *
 * Why HMAC instead of JWT? Same security guarantee for a single
 * server, much smaller dependency footprint. If we add horizontal
 * scaling later this should be swapped for JWTs signed with a shared
 * key (or moved to a Redis session store).
 */

'use strict';

const express = require('express');
const crypto = require('crypto');
const nacl = require('tweetnacl');
// bs58@6 ships as ESM with a `default` export shape when required
// from CJS. Normalise here so the rest of this file talks to the
// classic `{ encode, decode }` interface regardless of major version.
const bs58Module = require('bs58');
const bs58 = bs58Module.default || bs58Module;

const router = express.Router();

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 60 * 60 * 1000;
const MAX_PENDING_CHALLENGES = 5000;

// address -> { nonce, expiresAt }
const pendingChallenges = new Map();

function purgeExpiredChallenges() {
	const now = Date.now();
	for (const [address, entry] of pendingChallenges) {
		if (entry.expiresAt <= now) pendingChallenges.delete(address);
	}
}

// HMAC secret used to sign session tokens. Persistence isn't strictly
// required — restarting the server invalidates all sessions, which is
// fine for our scale. Derived from process env if present so the
// secret is stable across PM2 restarts; otherwise random per boot.
const SESSION_SECRET = (() => {
	const fromEnv = process.env.WALLET_SESSION_SECRET;
	if (typeof fromEnv === 'string' && fromEnv.length >= 32) return fromEnv;
	return crypto.randomBytes(32).toString('hex');
})();

function signSession(payload) {
	const json = JSON.stringify(payload);
	const b64 = Buffer.from(json, 'utf8').toString('base64url');
	const mac = crypto.createHmac('sha256', SESSION_SECRET).update(b64).digest('base64url');
	return `${b64}.${mac}`;
}

function verifySession(token) {
	if (typeof token !== 'string') return null;
	const dot = token.indexOf('.');
	if (dot < 0) return null;
	const b64 = token.slice(0, dot);
	const mac = token.slice(dot + 1);
	const expected = crypto.createHmac('sha256', SESSION_SECRET).update(b64).digest('base64url');
	if (mac.length !== expected.length) return null;
	if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
	try {
		const payload = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
		if (typeof payload?.expiresAt !== 'number') return null;
		if (payload.expiresAt < Date.now()) return null;
		return payload;
	} catch (_e) {
		return null;
	}
}

function isValidSolanaAddress(address) {
	if (typeof address !== 'string') return false;
	if (address.length < 32 || address.length > 44) return false;
	try {
		const decoded = bs58.decode(address);
		return decoded.length === 32;
	} catch (_e) {
		return false;
	}
}

router.post('/challenge', (req, res) => {
	try {
		purgeExpiredChallenges();
		const address = String(req.body?.address || '').trim();
		if (!isValidSolanaAddress(address)) {
			return res.status(400).json({ success: false, message: 'Invalid Solana address' });
		}
		if (pendingChallenges.size >= MAX_PENDING_CHALLENGES) {
			return res.status(503).json({ success: false, message: 'Too many open challenges' });
		}

		const nonce = crypto.randomBytes(16).toString('hex');
		const message = `Tetches advertiser sign-in\nnonce: ${nonce}\naddress: ${address}\nexpires: ${new Date(Date.now() + CHALLENGE_TTL_MS).toISOString()}`;
		pendingChallenges.set(address, {
			nonce,
			message,
			expiresAt: Date.now() + CHALLENGE_TTL_MS,
		});
		res.json({ success: true, message });
	} catch (err) {
		console.error('[WalletAuth] challenge error:', err);
		res.status(500).json({ success: false, message: 'Server error' });
	}
});

router.post('/verify', (req, res) => {
	try {
		purgeExpiredChallenges();
		const address = String(req.body?.address || '').trim();
		const signatureB58 = String(req.body?.signature || '').trim();
		if (!isValidSolanaAddress(address) || !signatureB58) {
			return res.status(400).json({ success: false, message: 'Address and signature required' });
		}

		const entry = pendingChallenges.get(address);
		if (!entry) {
			return res.status(400).json({ success: false, message: 'No active challenge for this address' });
		}

		let signature;
		try { signature = bs58.decode(signatureB58); }
		catch (_e) {
			return res.status(400).json({ success: false, message: 'Signature is not valid base58' });
		}
		if (signature.length !== 64) {
			return res.status(400).json({ success: false, message: 'Signature must be 64 bytes' });
		}

		const publicKey = bs58.decode(address);
		const messageBytes = Buffer.from(entry.message, 'utf8');
		const verified = nacl.sign.detached.verify(messageBytes, signature, publicKey);
		if (!verified) {
			return res.status(401).json({ success: false, message: 'Signature did not verify' });
		}

		pendingChallenges.delete(address);

		const token = signSession({
			address,
			issuedAt: Date.now(),
			expiresAt: Date.now() + SESSION_TTL_MS,
		});
		res.json({ success: true, token, expiresAt: Date.now() + SESSION_TTL_MS });
	} catch (err) {
		console.error('[WalletAuth] verify error:', err);
		res.status(500).json({ success: false, message: 'Server error' });
	}
});

function requireWalletSession(req, res, next) {
	const header = req.get('Authorization') || '';
	const m = /^Bearer\s+(.+)$/i.exec(header);
	const token = m ? m[1].trim() : null;
	if (!token) {
		return res.status(401).json({ success: false, message: 'Wallet session required' });
	}
	const payload = verifySession(token);
	if (!payload) {
		return res.status(401).json({ success: false, message: 'Wallet session invalid or expired' });
	}
	req.walletAddress = payload.address;
	next();
}

module.exports = { router, requireWalletSession, signSession, verifySession };
