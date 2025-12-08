// Animation System - Timing, Easing, and Variants

// Timing Constants (in seconds)
export const TIMING = {
  eyebrow: 0.1,
  headline: 0.3,
  card: 0.4,
  subheadline: 0.5,
  shadow: 0.6,
  balance: 0.7,
  ctas: 0.7,
  indicator: 0.9,
  trustBadge: 0.9,
  progressBars: 1.0,
  stats: 1.5,
};

// Easing Functions
export const EASING = {
  smooth: [0.16, 1, 0.3, 1] as const,
  snappy: [0.65, 0, 0.35, 1] as const,
};

// Eyebrow Badge (Clip-path reveal)
export const eyebrowVariants = {
  hidden: {
    opacity: 0,
    clipPath: "inset(0 100% 0 0)",
  },
  visible: {
    opacity: 1,
    clipPath: "inset(0 0% 0 0)",
    transition: { duration: 0.6, ease: EASING.smooth, delay: TIMING.eyebrow },
  },
};

// Pulsing Indicator Dot
export const indicatorPulseVariants = {
  hidden: { scale: 0, opacity: 0 },
  visible: {
    scale: 1,
    opacity: 1,
    transition: {
      delay: 0.4,
      type: "spring",
      stiffness: 400,
      damping: 15,
    },
  },
  pulse: {
    boxShadow: [
      "0 0 0 0 rgba(107, 142, 107, 0.6)",
      "0 0 0 8px rgba(107, 142, 107, 0)",
    ],
    transition: {
      duration: 1.8,
      repeat: Infinity,
      ease: "easeOut",
    },
  },
};

// Headline Words (Staggered 3D reveal)
export const headlineContainerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.06,
      delayChildren: TIMING.headline,
    },
  },
};

export const wordVariants = {
  hidden: {
    opacity: 0,
    y: 40,
    filter: "blur(8px)",
    rotateX: -15,
  },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    rotateX: 0,
    transition: { duration: 0.5, ease: EASING.smooth },
  },
};

// Hero Card (3D entrance)
export const cardVariants = {
  hidden: {
    opacity: 0,
    x: 80,
    rotateY: -12,
    scale: 0.92,
  },
  visible: {
    opacity: 1,
    x: 0,
    rotateY: 0,
    scale: 1,
    transition: { duration: 0.9, ease: EASING.smooth, delay: TIMING.card },
  },
};

// Card Shadow (Delayed offset)
export const shadowVariants = {
  hidden: { x: 0, y: 0, opacity: 0 },
  visible: {
    x: 8,
    y: 8,
    opacity: 1,
    transition: { delay: TIMING.shadow, duration: 0.7, ease: EASING.smooth },
  },
};

// CTA Buttons (Staggered)
export const ctaContainerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.1,
      delayChildren: TIMING.ctas,
    },
  },
};

export const ctaVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: EASING.smooth },
  },
};

// Progress Bars (Staggered)
export const progressBarContainerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.18,
      delayChildren: TIMING.progressBars,
    },
  },
};

export const progressBarVariants = {
  hidden: { opacity: 0, scaleX: 0 },
  visible: {
    opacity: 1,
    scaleX: 1,
    transition: { duration: 0.6, ease: EASING.smooth },
  },
};

// Decorative Shapes (Breathing)
export const decorativeShapeVariants = {
  hidden: { scale: 0.8, opacity: 0 },
  visible: (delay: number) => ({
    scale: 1,
    opacity: 0.6,
    transition: { delay, duration: 1.2, ease: EASING.smooth },
  }),
};

export const breathingAnimation = (duration: number) => ({
  scale: [1, 1.08, 1],
  opacity: [0.5, 0.7, 0.5],
  transition: { duration, repeat: Infinity, ease: "easeInOut" },
});

// Floating Card (Subtle bob)
export const floatingAnimation = {
  y: [0, -8, 0],
  transition: {
    duration: 5,
    repeat: Infinity,
    ease: "easeInOut",
  },
};

// Fade In Up (Generic section animation)
export const fadeInUpVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: EASING.smooth },
  },
};

// Stagger Container (Generic)
export const staggerContainerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

// Card Hover (Hard shadow lift)
export const cardHoverAnimation = {
  rest: {
    x: 0,
    y: 0,
    boxShadow: "0px 0px 0px rgba(0,0,0,0.1)",
  },
  hover: {
    x: -4,
    y: -4,
    boxShadow: "8px 8px 0px rgba(0,0,0,0.1)",
    transition: { duration: 0.2, ease: EASING.snappy },
  },
};

// CTA Button Hover (Spring)
export const ctaButtonHover = {
  rest: {
    x: 0,
    y: 0,
    boxShadow: "0px 0px 0px #d4a574",
  },
  hover: {
    x: -3,
    y: -3,
    boxShadow: "6px 6px 0px #d4a574",
    transition: { type: "spring", stiffness: 400, damping: 25 },
  },
  tap: {
    x: 0,
    y: 0,
    boxShadow: "0px 0px 0px #d4a574",
  },
};

// Subheadline fade
export const subheadlineVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { delay: TIMING.subheadline, duration: 0.5, ease: EASING.smooth },
  },
};

// Trust badge fade
export const trustBadgeVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { delay: TIMING.trustBadge, duration: 0.5, ease: EASING.smooth },
  },
};

// Stats Container (Staggered)
export const statsContainerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.15,
      delayChildren: TIMING.stats,
    },
  },
};

// Stat Item
export const statItemVariants = {
  hidden: { opacity: 0, y: 25 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: EASING.smooth,
    },
  },
};

// Highlighted Word (special animation for the green word)
export const highlightedWordVariants = {
  hidden: {
    opacity: 0,
    y: 50,
    filter: "blur(10px)",
    scale: 0.9,
  },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    scale: 1,
    transition: {
      duration: 0.7,
      ease: EASING.smooth,
    },
  },
};

// Decorative Shape Variant 2 (different breathing params)
export const decorativeShapeVariants2 = {
  hidden: { scale: 0.8, opacity: 0 },
  visible: (delay: number) => ({
    scale: 1,
    opacity: 0.6,
    transition: { delay, duration: 1.2, ease: EASING.smooth },
  }),
  breathing: {
    scale: [1, 1.06, 1],
    opacity: [0.5, 0.65, 0.5],
    rotate: [0, 3, 0],
    transition: {
      duration: 7,
      repeat: Infinity,
      ease: "easeInOut",
    },
  },
};
