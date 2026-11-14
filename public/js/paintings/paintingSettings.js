/**
 * The player's choice of painting size: Full, Small or Off.
 *
 * Remembered in localStorage (per device — it's about the screen, not
 * the kingdom). Storage can be blocked (private windows, some iframes),
 * in which case the choice lasts for the page only.
 */

export const PAINTING_SETTING_KEY = 'tetches_paintings';
export const PAINTING_SETTINGS = ['full', 'small', 'off'];
const LABELS = { full: 'Full', small: 'Small', off: 'Off' };

let sessionValue = null;

/** Anything unrecognised reads as the default, Full. */
export function parsePaintingSetting(value) {
	const v = String(value || '').trim().toLowerCase();
	return PAINTING_SETTINGS.includes(v) ? v : 'full';
}

export function getPaintingSetting() {
	try {
		const stored = localStorage.getItem(PAINTING_SETTING_KEY);
		if (stored != null) return parsePaintingSetting(stored);
	} catch (_e) { /* storage blocked: fall through */ }
	return sessionValue || 'full';
}

export function setPaintingSetting(value) {
	const v = parsePaintingSetting(value);
	sessionValue = v;
	try { localStorage.setItem(PAINTING_SETTING_KEY, v); } catch (_e) { /* this page only */ }
	return v;
}

export function paintingSettingLabel(value) {
	return `Paintings: ${LABELS[parsePaintingSetting(value)]}`;
}
