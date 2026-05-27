/**
 * CAMBRA Motion Tokens — "calm intelligence".
 *
 * Use these EVERYWHERE instead of writing custom framer-motion props per file.
 * This prevents motion drift across the platform.
 *
 * Usage:
 *   import { fadeIn, slideUp, stagger } from "@/lib/motion";
 *   <motion.div {...slideUp}>...</motion.div>
 */

// Premium easing — smooth, never bouncy.
export const EASE = [0.22, 1, 0.36, 1];
export const EASE_OUT = [0.16, 1, 0.3, 1];

// Standard durations (seconds)
export const DURATION = {
  fast: 0.18,
  base: 0.36,
  slow: 0.6,
};

// Primitives
export const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: DURATION.base, ease: EASE },
};

export const slideUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: DURATION.base, ease: EASE },
};

export const slideUpSm = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: DURATION.fast, ease: EASE },
};

export const scaleIn = {
  initial: { opacity: 0, scale: 0.97 },
  animate: { opacity: 1, scale: 1 },
  transition: { duration: DURATION.base, ease: EASE },
};

// Stagger container helper
export const stagger = (delayChildren = 0.04, staggerChildren = 0.06) => ({
  initial: {},
  animate: {
    transition: { delayChildren, staggerChildren },
  },
});

// Hover patterns
export const hoverLift = {
  whileHover: { y: -2, transition: { duration: DURATION.fast, ease: EASE } },
  whileTap: { y: 0, scale: 0.99 },
};

// Page transition (use on top-level page wrappers in inner app)
export const pageEnter = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: DURATION.base, ease: EASE },
};