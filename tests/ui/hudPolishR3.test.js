/**
 * @jest-environment jsdom
 *
 * HUD polish (round 3, visual polisher round 2):
 *   • toasts are drawn above the dialogs, carry a drawn icon instead of
 *     the ⛵ emoji, and drop a hint that went stale while it waited;
 *   • a phone held upright gets its round buttons placed under the
 *     measured button strip (CSS variables), and nothing elsewhere;
 *   • the longship event notices name the icon, not an emoji.
 */

import { shipEventToast } from '../../public/js/longships/shipEventToasts.js';
import { longshipsInPlayText } from '../../public/js/battle/vikingRules.js';

beforeEach(() => {
	jest.resetModules();
	document.body.innerHTML = '';
	document.documentElement.removeAttribute('style');
});

describe('toasts', () => {
	test('drawn above the dialogs (12000-12500)', async () => {
		const T = await import('../../public/js/showToastMessage.js');
		T.showToastMessage('hello', 4000);
		const box = document.getElementById('toast-container');
		expect(Number(box.style.zIndex)).toBeGreaterThan(12500);
	});

	test('icon: longship adds the drawn-icon class; unknown icons are ignored', async () => {
		const T = await import('../../public/js/showToastMessage.js');
		T.showToastMessage('ships!', { icon: 'longship', duration: 4000 });
		T.showToastMessage('boats?', { icon: 'sailboat', duration: 4000 });
		const kids = [...document.querySelectorAll('#toast-container .toast-message')];
		expect(kids[0].classList.contains('toast-icon-longship')).toBe(true);
		expect(kids[1].className).not.toMatch(/toast-icon-/);
	});

	test('stillTrue: a toast whose news went stale is not shown', async () => {
		const T = await import('../../public/js/showToastMessage.js');
		T.showToastMessage('stale hint', { duration: 4000, stillTrue: () => false });
		T.showToastMessage('fresh hint', { duration: 4000, stillTrue: () => true });
		const text = document.getElementById('toast-container').textContent;
		expect(text).not.toMatch(/stale/);
		expect(text).toMatch(/fresh/);
	});
});

describe('copy', () => {
	test('no sailboat emoji in the longship notices', () => {
		expect(longshipsInPlayText(true)).not.toMatch(/⛵/);
		const built = shipEventToast({ kind: 'built', seatId: 'me' }, { localId: 'me' });
		expect(built).toEqual({ text: 'A new longship is built at your mooring.', variant: 'success', icon: 'longship' });
	});
});

describe('phone HUD layout', () => {
	const strip = (bottom) => {
		const el = document.createElement('div');
		el.className = 'debug-indicator';
		el.getBoundingClientRect = () => ({ left: 10, top: 52, right: 220, bottom, width: 210, height: bottom - 52 });
		document.body.appendChild(el);
	};

	test('upright phone: the strip folds into ☰, the round buttons go under the title', async () => {
		window.matchMedia = () => ({ matches: true });
		strip(129);
		const title = document.createElement('div');
		title.className = 'game-title';
		title.getBoundingClientRect = () => ({ left: 10, top: 10, right: 120, bottom: 42, width: 110, height: 32 });
		document.body.appendChild(title);
		const { layoutPhoneHud } = await import('../../public/js/phoneHudLayout.js');
		layoutPhoneHud();
		const root = document.documentElement.style;
		expect(root.getPropertyValue('--tx-phone-round-top')).toBe('50px');
		expect(root.getPropertyValue('--tx-phone-sea-top')).toBe('102px');
		expect(document.getElementById('hud-menu-toggle')).not.toBeNull();
	});

	test('☰ opens the strip as a menu; a choice, a tap elsewhere or Escape shuts it', async () => {
		jest.useFakeTimers();
		document.body.innerHTML = '';
		delete document.documentElement.dataset.hudMenu;
		const el = document.createElement('div');
		el.className = 'debug-indicator';
		el.innerHTML = '<button id="reset-camera-btn">Reset Camera</button><button id="paint" aria-haspopup="menu">Paintings</button>';
		document.body.appendChild(el);
		const { ensureMenuButton, isMenuOpen } = await import('../../public/js/phoneHudLayout.js');
		ensureMenuButton(document);
		const menu = document.getElementById('hud-menu-toggle');
		expect(menu.getAttribute('aria-controls')).toBe(el.id);
		menu.click();
		expect(isMenuOpen(document)).toBe(true);
		expect(menu.getAttribute('aria-expanded')).toBe('true');
		// a button with its own menu keeps it open
		document.getElementById('paint').click();
		jest.runAllTimers();
		expect(isMenuOpen(document)).toBe(true);
		document.getElementById('reset-camera-btn').click();
		jest.runAllTimers();
		expect(isMenuOpen(document)).toBe(false);
		menu.click();
		document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
		expect(isMenuOpen(document)).toBe(false);
		menu.click();
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		expect(isMenuOpen(document)).toBe(false);
		jest.useRealTimers();
	});

	test('anywhere else: no variables (the theme placement stands)', async () => {
		window.matchMedia = () => ({ matches: false });
		strip(129);
		const { layoutPhoneHud } = await import('../../public/js/phoneHudLayout.js');
		layoutPhoneHud();
		expect(document.documentElement.style.getPropertyValue('--tx-phone-round-top')).toBe('');
	});
});
