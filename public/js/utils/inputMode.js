/**
 * Is the PRIMARY pointer a finger? Phones and tablets: yes. Touch
 * laptops: no — they have a keyboard, so keyboard hints still apply
 * (the touch pad itself uses a looser "any touch" check).
 */
export function isTouchPrimary() {
	try {
		return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
	} catch (_e) {
		return false;
	}
}
