// Node globals the game's server code touches, for the offline engine
// (injected by esbuild in place of the real ones).

function from(value, encoding) {
	if (value instanceof Uint8Array) return value;
	const s = String(value);
	if (encoding === 'hex') {
		const out = new Uint8Array(s.length >> 1);
		for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
		return out;
	}
	return new TextEncoder().encode(s);
}

/** Just what security/playerSession.js and adminGate.js use. */
export const Buffer = { from, isBuffer: (v) => v instanceof Uint8Array };

// Dev knobs ride on the worker script's URL (see offlineMode.js).
function envFromScriptUrl() {
	try {
		const scale = new URLSearchParams(self.location.search).get('seaScale');
		return scale ? { BATTLE_SEA_TIME_SCALE: scale } : {};
	} catch (_e) {
		return {};
	}
}

export const process = {
	env: { NODE_ENV: 'production', ...envFromScriptUrl() },
	on() {},
	once() {},
	exit() {},
	cwd: () => '/',
	platform: 'browser',
	versions: {},
};

export const setImmediate = (fn, ...args) => setTimeout(fn, 0, ...args);
