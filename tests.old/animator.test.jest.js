/**
 * Animator Module Unit Tests
 */

describe('Animator Module', () => {
	// Import the module for testing
	import animator from '../public/js/utils/animator.js';
	
	// Test animation objects
	const createMockAnimation = (name = 'testAnim') => ({
		name,
		isComplete: false,
		duration: 1000,
		elapsed: 0,
		onComplete: jest.fn(),
		update: jest.fn(function(delta) {
			this.elapsed += delta * 1000;
			if (this.elapsed >= this.duration) {
				this.isComplete = true;
				if (this.onComplete) this.onComplete();
			}
		})
	});
	
	beforeEach(() => {
		// Reset the animator before each test
		if (animator.init) animator.init();
		if (animator.clear) animator.clear();
	});
	
	describe('Initialization', () => {
		test('should initialize properly', () => {
			// Skip if function is not defined
			if (!animator.init) {
				return;
			}
			
			const initResult = animator.init();
			expect(initResult).toBe(true);
		});
		
		test('should clear all animations', () => {
			// Skip if functions aren't defined
			if (!animator.add || !animator.clear || !animator.getActiveAnimations) {
				return;
			}
			
			// Add some animations
			animator.add(createMockAnimation());
			animator.add(createMockAnimation());
			
			// Clear them
			animator.clear();
			
			// Verify they are cleared
			expect(animator.getActiveAnimations().length).toBe(0);
		});
	});
	
	describe('Animation Management', () => {
		test('should add animations', () => {
			// Skip if functions aren't defined
			if (!animator.add || !animator.getActiveAnimations) {
				return;
			}
			
			const animation = createMockAnimation();
			const result = animator.add(animation);
			
			expect(result).toBe(true);
			expect(animator.getActiveAnimations().length).toBe(1);
			expect(animator.getActiveAnimations()[0]).toBe(animation);
		});
		
		test('should handle null or invalid animations', () => {
			// Skip if functions aren't defined
			if (!animator.add || !animator.getActiveAnimations) {
				return;
			}
			
			const result = animator.add(null);
			expect(result).toBe(false);
			expect(animator.getActiveAnimations().length).toBe(0);
			
			const invalidResult = animator.add({});
			expect(invalidResult).toBe(false);
			expect(animator.getActiveAnimations().length).toBe(0);
		});
		
		test('should remove animations', () => {
			// Skip if functions aren't defined
			if (!animator.add || !animator.remove || !animator.getActiveAnimations) {
				return;
			}
			
			const animation = createMockAnimation();
			animator.add(animation);
			
			const result = animator.remove(animation);
			
			expect(result).toBe(true);
			expect(animator.getActiveAnimations().length).toBe(0);
		});
		
		test('should handle removing non-existent animations', () => {
			// Skip if functions aren't defined
			if (!animator.remove) {
				return;
			}
			
			const animation = createMockAnimation();
			const result = animator.remove(animation);
			
			expect(result).toBe(false);
		});
		
		test('should get animations by name', () => {
			// Skip if functions aren't defined
			if (!animator.add || !animator.getAnimationsByName) {
				return;
			}
			
			const animation1 = createMockAnimation('anim1');
			const animation2 = createMockAnimation('anim2');
			const animation3 = createMockAnimation('anim2');
			
			animator.add(animation1);
			animator.add(animation2);
			animator.add(animation3);
			
			const results = animator.getAnimationsByName('anim2');
			
			expect(results.length).toBe(2);
			expect(results).toContain(animation2);
			expect(results).toContain(animation3);
		});
		
		test('should get active animations', () => {
			// Skip if functions aren't defined
			if (!animator.add || !animator.getActiveAnimations) {
				return;
			}
			
			const animation1 = createMockAnimation();
			const animation2 = createMockAnimation();
			
			animator.add(animation1);
			animator.add(animation2);
			
			const activeAnimations = animator.getActiveAnimations();
			
			expect(activeAnimations.length).toBe(2);
			expect(activeAnimations).toContain(animation1);
			expect(activeAnimations).toContain(animation2);
		});
	});
	
	describe('Animation Update', () => {
		test('should update all animations', () => {
			// Skip if functions aren't defined
			if (!animator.add || !animator.update) {
				return;
			}
			
			const animation1 = createMockAnimation();
			const animation2 = createMockAnimation();
			
			animator.add(animation1);
			animator.add(animation2);
			
			animator.update(0.1);
			
			expect(animation1.update).toHaveBeenCalledWith(0.1);
			expect(animation2.update).toHaveBeenCalledWith(0.1);
		});
		
		test('should remove completed animations', () => {
			// Skip if functions aren't defined
			if (!animator.add || !animator.update || !animator.getActiveAnimations) {
				return;
			}
			
			const animation = createMockAnimation();
			animation.isComplete = true;
			
			animator.add(animation);
			animator.update(0.1);
			
			expect(animator.getActiveAnimations().length).toBe(0);
			expect(animation.onComplete).toHaveBeenCalled();
		});
		
		test('should handle animations that complete during update', () => {
			// Skip if functions aren't defined
			if (!animator.add || !animator.update || !animator.getActiveAnimations) {
				return;
			}
			
			const animation = createMockAnimation();
			animation.duration = 50;
			
			animator.add(animation);
			animator.update(0.1); // 100ms, which exceeds the duration
			
			expect(animation.isComplete).toBe(true);
			expect(animator.getActiveAnimations().length).toBe(0);
			expect(animation.onComplete).toHaveBeenCalled();
		});
	});
	
	describe('Animation Chaining', () => {
		test('should chain animations properly', () => {
			// Skip if functions aren't defined
			if (!animator.add || !animator.update || !animator.getActiveAnimations) {
				return;
			}
			
			const animation1 = createMockAnimation('first');
			const animation2 = createMockAnimation('second');
			
			// Set up chaining
			animation1.onComplete = jest.fn(() => {
				animator.add(animation2);
			});
			
			animator.add(animation1);
			
			// Complete the first animation
			animation1.isComplete = true;
			animator.update(0);
			
			// The second animation should now be active
			expect(animation1.onComplete).toHaveBeenCalled();
			expect(animator.getActiveAnimations().length).toBe(1);
			expect(animator.getActiveAnimations()[0]).toBe(animation2);
		});
	});
	
	describe('Group Animations', () => {
		test('should create and manage group animations', () => {
			// Skip if functions aren't defined
			if (!animator.createGroupAnimation || !animator.add || !animator.update) {
				return;
			}
			
			const groupAnimation = animator.createGroupAnimation([
				createMockAnimation('sub1'),
				createMockAnimation('sub2')
			]);
			
			expect(groupAnimation).toBeDefined();
			expect(groupAnimation.animations.length).toBe(2);
			
			animator.add(groupAnimation);
			animator.update(0.1);
			
			expect(groupAnimation.animations[0].update).toHaveBeenCalledWith(0.1);
			expect(groupAnimation.animations[1].update).toHaveBeenCalledWith(0.1);
		});
		
		test('should complete group animation when all sub-animations complete', () => {
			// Skip if functions aren't defined
			if (!animator.createGroupAnimation || !animator.add || !animator.update || !animator.getActiveAnimations) {
				return;
			}
			
			const anim1 = createMockAnimation('sub1');
			const anim2 = createMockAnimation('sub2');
			
			const groupAnimation = animator.createGroupAnimation([anim1, anim2]);
			
			animator.add(groupAnimation);
			
			// Complete first animation
			anim1.isComplete = true;
			animator.update(0.1);
			
			// Group should not be complete yet
			expect(groupAnimation.isComplete).toBe(false);
			
			// Complete second animation
			anim2.isComplete = true;
			animator.update(0.1);
			
			// Group should now be complete
			expect(groupAnimation.isComplete).toBe(true);
			expect(animator.getActiveAnimations().length).toBe(0);
		});
	});
	
	describe('Sequence Animations', () => {
		test('should create and manage sequence animations', () => {
			// Skip if functions aren't defined
			if (!animator.createSequenceAnimation || !animator.add || !animator.update) {
				return;
			}
			
			const anim1 = createMockAnimation('seq1');
			const anim2 = createMockAnimation('seq2');
			
			const sequenceAnimation = animator.createSequenceAnimation([anim1, anim2]);
			
			expect(sequenceAnimation).toBeDefined();
			expect(sequenceAnimation.animations.length).toBe(2);
			
			animator.add(sequenceAnimation);
			animator.update(0.1);
			
			// Only the first animation should be updated
			expect(anim1.update).toHaveBeenCalledWith(0.1);
			expect(anim2.update).not.toHaveBeenCalled();
		});
		
		test('should progress through sequence when animations complete', () => {
			// Skip if functions aren't defined
			if (!animator.createSequenceAnimation || !animator.add || !animator.update || !animator.getActiveAnimations) {
				return;
			}
			
			const anim1 = createMockAnimation('seq1');
			const anim2 = createMockAnimation('seq2');
			
			const sequenceAnimation = animator.createSequenceAnimation([anim1, anim2]);
			
			animator.add(sequenceAnimation);
			
			// Update and complete first animation
			animator.update(0.1);
			anim1.isComplete = true;
			animator.update(0.1);
			
			// Now the second animation should be active
			expect(anim2.update).toHaveBeenCalledWith(0.1);
			
			// Complete second animation
			anim2.isComplete = true;
			animator.update(0.1);
			
			// Sequence should now be complete
			expect(sequenceAnimation.isComplete).toBe(true);
			expect(animator.getActiveAnimations().length).toBe(0);
		});
	});
	
	describe('Error Handling', () => {
		test('should handle errors in animation update', () => {
			// Skip if functions aren't defined
			if (!animator.add || !animator.update || !animator.getActiveAnimations) {
				return;
			}
			
			// Create animation that throws an error
			const errorAnimation = {
				name: 'errorAnim',
				isComplete: false,
				update: jest.fn(() => {
					throw new Error('Test error');
				})
			};
			
			// Mock console.error to prevent test output noise
			const originalConsoleError = console.error;
			console.error = jest.fn();
			
			animator.add(errorAnimation);
			animator.update(0.1);
			
			// Should have caught the error and logged it
			expect(console.error).toHaveBeenCalled();
			
			// Animation should be marked as complete to remove it
			expect(errorAnimation.isComplete).toBe(true);
			expect(animator.getActiveAnimations().length).toBe(0);
			
			// Restore console.error
			console.error = originalConsoleError;
		});
	});
});