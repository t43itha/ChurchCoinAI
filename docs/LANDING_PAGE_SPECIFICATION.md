# Landing Page Specification
## Complete Design & Implementation Blueprint

**Purpose**: This document provides the exact specification to recreate the ChurchCoin landing page in a new application.

---

## Table of Contents

1. [Design System](#1-design-system)
2. [Animation System](#2-animation-system)
3. [Page Structure](#3-page-structure)
4. [Component Specifications](#4-component-specifications)
5. [Content Data Structure](#5-content-data-structure)
6. [Responsive Behavior](#6-responsive-behavior)
7. [Dependencies](#7-dependencies)

---

## 1. Design System

### 1.1 Color Palette

```typescript
const colors = {
  // Core colors
  ink: "#000000",           // Primary text, borders
  charcoal: "#1a1a1a",      // Secondary text
  paper: "#fafaf9",         // Main background
  white: "#ffffff",         // Card backgrounds

  // Brand accent - Sage Green
  sage: {
    base: "#6b8e6b",        // Primary accent (highlights, success)
    dark: "#557555",        // Darker variant
    light: "#e8f0e8",       // Light backgrounds
  },

  // Secondary accent - Amber
  amber: {
    base: "#d4a574",        // Secondary accent (shadows, CTAs)
    dark: "#b5895b",        // Darker variant
    light: "#faefe6",       // Light backgrounds
  },

  // Semantic
  muted: "#666666",         // Muted text
  border: "#e5e5e5",        // Default borders
  error: "#cc3333",         // Error/problem stats
};
```

### 1.2 Typography

```typescript
const typography = {
  // Font families
  fontFamily: {
    sans: "system-ui, -apple-system, sans-serif", // Body text
    mono: "'JetBrains Mono', monospace",          // Numbers, data, badges
  },

  // Scale
  scale: {
    // Headings
    h1: "text-5xl md:text-6xl lg:text-7xl",  // Hero headline
    h2: "text-4xl md:text-5xl",               // Section headings
    h3: "text-xl",                            // Card titles
    h4: "text-lg",                            // Subsection titles

    // Body
    bodyLg: "text-xl",                        // Hero subheadline
    body: "text-base",                        // Default body
    bodySm: "text-sm",                        // Secondary text

    // Special
    eyebrow: "text-xs uppercase tracking-widest", // Section labels
    stat: "text-4xl md:text-5xl font-mono",       // Trust metrics
    statLarge: "text-5xl md:text-6xl font-mono",  // Problem stats
  },

  // Weights
  weights: {
    normal: "font-normal",
    medium: "font-medium",
    bold: "font-bold",
  },

  // Tracking
  tracking: {
    tight: "tracking-tight",      // Headlines
    wider: "tracking-wider",      // Eyebrows
    widest: "tracking-widest",    // Labels
  },
};
```

### 1.3 Spacing & Layout

```typescript
const spacing = {
  // Section padding
  sectionY: "py-24",           // Vertical section padding
  sectionYSm: "py-16",         // Smaller sections

  // Container
  maxWidth: "max-w-7xl",
  paddingX: "px-6",

  // Grid
  gridCols: {
    hero: "lg:grid-cols-12",   // 7/5 split
    features: "md:grid-cols-2 lg:grid-cols-4",
    pricing: "md:grid-cols-3",
    testimonials: "md:grid-cols-3",
    transformation: "md:grid-cols-4",
    problems: "md:grid-cols-3",
    trustMetrics: "grid-cols-2 md:grid-cols-4",
    footer: "md:grid-cols-5",
  },

  // Gaps
  gaps: {
    cards: "gap-6",
    sections: "gap-12",
    items: "gap-4",
    small: "gap-2",
  },
};
```

### 1.4 Border & Shadow System

```css
/* Hard shadow system - signature Swiss Ledger style */
.shadow-hard-sm { box-shadow: 4px 4px 0px #d4a574; }
.shadow-hard-md { box-shadow: 6px 6px 0px #d4a574; }
.shadow-hard-lg { box-shadow: 8px 8px 0px #d4a574; }
.shadow-hard-black { box-shadow: 8px 8px 0px rgba(0,0,0,0.1); }

/* Borders */
.border-default { border: 2px solid #000000; }
.border-thin { border: 1px solid #000000; }
.border-accent { border: 1px solid #6b8e6b; }
```

### 1.5 Background Pattern

```jsx
// Ledger grid background - fixed, covers entire page
<div className="fixed inset-0 pointer-events-none">
  <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <pattern id="ledger-grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(0,0,0,0.03)" strokeWidth="1" />
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#ledger-grid)" />
  </svg>
</div>
```

---

## 2. Animation System

### 2.1 Timing Constants

```typescript
const TIMING = {
  eyebrow: 0.1,      // Eyebrow badge appears
  headline: 0.3,     // Headline words start staggering
  card: 0.4,         // Hero card slides in
  subheadline: 0.5,  // Subheadline fades in
  shadow: 0.6,       // Card shadow animates
  balance: 0.7,      // Balance number starts counting
  ctas: 0.7,         // CTA buttons appear
  indicator: 0.9,    // Live indicator appears
  trustBadge: 0.9,   // Trust badge fades in
  progressBars: 1.0, // Progress bars start animating
  stats: 1.5,        // Bottom stats start counting
};
```

### 2.2 Easing Functions

```typescript
const EASING = {
  smooth: [0.16, 1, 0.3, 1],      // Primary easing - smooth deceleration
  snappy: [0.65, 0, 0.35, 1],     // Quick interactions
};
```

### 2.3 Animation Variants

#### Eyebrow Badge (Clip-path reveal)
```typescript
const eyebrowVariants = {
  hidden: {
    opacity: 0,
    clipPath: "inset(0 100% 0 0)",
  },
  visible: {
    opacity: 1,
    clipPath: "inset(0 0% 0 0)",
    transition: { duration: 0.6, ease: EASING.smooth, delay: 0.1 }
  }
};
```

#### Pulsing Indicator Dot
```typescript
const indicatorPulseVariants = {
  hidden: { scale: 0, opacity: 0 },
  visible: {
    scale: 1,
    opacity: 1,
    transition: {
      delay: 0.4,
      type: "spring",
      stiffness: 400,
      damping: 15,
    }
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
    }
  }
};
```

#### Headline Words (Staggered 3D reveal)
```typescript
const headlineContainerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.06,  // Each word 60ms apart
      delayChildren: 0.3,
    }
  }
};

const wordVariants = {
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
    transition: { duration: 0.5, ease: EASING.smooth }
  }
};
```

#### Hero Card (3D entrance)
```typescript
const cardVariants = {
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
    transition: { duration: 0.9, ease: EASING.smooth, delay: 0.4 }
  }
};
```

#### Card Shadow (Delayed offset)
```typescript
const shadowVariants = {
  hidden: { x: 0, y: 0, opacity: 0 },
  visible: {
    x: 8,
    y: 8,
    opacity: 1,
    transition: { delay: 0.6, duration: 0.7, ease: EASING.smooth }
  }
};
```

#### CTA Buttons (Staggered)
```typescript
const ctaContainerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.7,
    }
  }
};

const ctaVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: EASING.smooth }
  }
};
```

#### Progress Bars (Staggered + Live animation)
```typescript
const progressBarContainerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.18,
      delayChildren: 1.0,
    }
  }
};

// Live progress bar oscillation
const widthKeyframes = [
  `${baseWidth}%`,
  `${baseWidth + variance}%`,
  `${baseWidth}%`,
  `${baseWidth - variance}%`,
  `${baseWidth}%`,
];
```

#### Decorative Shapes (Breathing)
```typescript
const decorativeShapeVariants = {
  hidden: { scale: 0.8, opacity: 0 },
  visible: (delay) => ({
    scale: 1,
    opacity: 0.6,
    transition: { delay, duration: 1.2, ease: EASING.smooth }
  }),
  breathing: (duration) => ({
    scale: [1, 1.08, 1],
    opacity: [0.5, 0.7, 0.5],
    transition: { duration, repeat: Infinity, ease: "easeInOut" }
  })
};
```

#### Floating Card (Subtle bob)
```typescript
const floatingAnimation = {
  y: [0, -8, 0],
  transition: {
    duration: 5,
    repeat: Infinity,
    ease: "easeInOut",
  }
};

// On hover
whileHover={{ y: -12, transition: { duration: 0.3, ease: EASING.snappy } }}
```

### 2.4 Animated Components

#### AnimatedBalance (Spring-based counting)
```typescript
function AnimatedBalance({ value, prefix = "£", delay = 0 }) {
  const springValue = useSpring(0, {
    stiffness: 30,
    damping: 25,
    mass: 1,
  });

  // When in view, spring from 0 to value
  // Respects reduced motion preferences
}
```

#### AnimatedStatValue (Smaller numbers)
```typescript
function AnimatedStatValue({ value, prefix = "", color, delay = 0 }) {
  const springValue = useSpring(0, {
    stiffness: 50,
    damping: 20,
  });
}
```

#### TypewriterNumber (Character by character)
```typescript
function TypewriterNumber({ value, suffix = "" }) {
  // Reveals characters one at a time, 100ms interval
  // Includes blinking cursor
}
```

#### LiveProgressBar (Oscillating width)
```typescript
function LiveProgressBar({ color, baseWidth, variance, duration, delay }) {
  // Progress bar that oscillates between baseWidth ± variance
  // Indicator dot with hover glow effect
  // Animated percentage label
}
```

---

## 3. Page Structure

### 3.1 Section Order

```
1. Navigation (fixed)
2. Hero Section
3. Trust Metrics (black background)
4. Testimonials (white background)
5. Problem Section (paper background)
6. Transformation Journey (white background)
7. Features (paper background)
8. Pricing (white background)
9. FAQ (paper background)
10. Secondary CTA (black background)
11. Footer (dark background)
```

### 3.2 Section Backgrounds

| Section | Background Color |
|---------|-----------------|
| Navigation | `#fafaf9/95` with backdrop blur |
| Hero | `#fafaf9` (paper) |
| Trust Metrics | `#000000` (black) |
| Testimonials | `#ffffff` (white) |
| Problem | `#fafaf9` (paper) |
| Transformation | `#ffffff` (white) |
| Features | `#fafaf9` (paper) |
| Pricing | `#ffffff` (white) |
| FAQ | `#fafaf9` (paper) |
| Secondary CTA | `#000000` (black) |
| Footer | `#0a0a0a` (darker black) |

---

## 4. Component Specifications

### 4.1 Navigation

```jsx
<nav className="fixed top-0 left-0 right-0 z-50 bg-[#fafaf9]/95 backdrop-blur-sm border-b border-black">
  <div className="max-w-7xl mx-auto px-6 py-4">
    <div className="flex items-center justify-between">
      {/* Logo */}
      <Link className="flex items-center gap-3">
        <div className="w-8 h-8 border-2 border-black flex items-center justify-center">
          <Calculator className="w-4 h-4 text-black" />
        </div>
        <span className="font-bold text-xl text-black tracking-tight">
          ChurchCoin
        </span>
      </Link>

      {/* Desktop Nav Links */}
      <div className="hidden md:flex items-center gap-8">
        <a className="text-black hover:text-[#6b8e6b] transition-colors uppercase text-sm tracking-wider font-medium">
          {navItem}
        </a>
      </div>

      {/* CTA Buttons */}
      <div className="hidden md:flex items-center gap-4">
        <Link className="text-black hover:text-[#6b8e6b]">Sign In</Link>
        <Link className="bg-black text-white px-5 py-2.5 font-medium hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[4px_4px_0px_#d4a574] transition-all">
          Get Started
        </Link>
      </div>

      {/* Mobile Menu Button */}
      <button className="md:hidden p-2 border border-black">
        <Menu / X icon />
      </button>
    </div>
  </div>
</nav>
```

**Nav Links**: Features, Pricing, Testimonials, FAQ

### 4.2 Hero Section

**Layout**: 12-column grid, text takes 7 columns, card takes 5

```jsx
<section className="relative pt-32 pb-24 min-h-[90vh] flex items-center overflow-hidden">
  {/* Decorative shapes */}
  <motion.div className="absolute top-40 right-20 w-32 h-32 rounded-full bg-[#e8f0e8]" />
  <motion.div className="absolute bottom-40 left-10 w-20 h-20 bg-[#faefe6]" />
  <motion.div className="absolute top-1/2 right-1/4 w-16 h-16 rounded-full border border-[#6b8e6b]/30" />

  <div className="max-w-7xl mx-auto px-6 relative">
    <div className="grid lg:grid-cols-12 gap-12 items-center">
      {/* Text - 7 columns */}
      <div className="lg:col-span-7">
        {/* Eyebrow badge */}
        {/* Headline with word animation */}
        {/* Subheadline */}
        {/* CTA buttons */}
        {/* Trust badge */}
      </div>

      {/* Card - 5 columns */}
      <motion.div className="lg:col-span-5">
        <FloatingCard>
          {/* Balance card with shadow */}
        </FloatingCard>
      </motion.div>
    </div>
  </div>
</section>
```

#### Eyebrow Badge
```jsx
<span className="inline-flex items-center gap-2 border border-black px-3 py-1 text-xs uppercase tracking-widest font-medium">
  <motion.span className="w-2 h-2 bg-[#6b8e6b]" /> {/* Pulsing indicator */}
  Built by treasurers
</span>
```

#### Headline Structure
```jsx
<h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-black leading-[1.05] mb-6 tracking-tight">
  {/* Each word wrapped in motion.span for stagger */}
  Stop chasing spreadsheets. Start growing
  <span className="text-[#6b8e6b]">ministry.</span> {/* Highlighted word */}
</h1>
```

#### CTA Button with Spring Hover
```jsx
<motion.div
  whileHover={{ x: -3, y: -3, boxShadow: "6px 6px 0px #d4a574" }}
  whileTap={{ x: 0, y: 0, boxShadow: "0px 0px 0px #d4a574" }}
  transition={{ type: "spring", stiffness: 400, damping: 25 }}
>
  <Link className="group bg-black text-white px-8 py-4 font-medium text-lg flex items-center gap-2">
    Start Free 30-Day Trial
    <ArrowRight className="w-5 h-5" />
  </Link>
</motion.div>
```

### 4.3 Hero Balance Card

**Structure**: Square aspect ratio with hard shadow

```jsx
<div className="relative aspect-square">
  {/* Main card */}
  <motion.div className="absolute inset-0 border-2 border-black p-8 bg-[#fafaf9]">
    <div className="h-full flex flex-col justify-between">
      {/* Header with balance */}
      <div className="flex justify-between items-start">
        <div>
          <div className="text-xs uppercase tracking-widest text-[#666666] mb-1">
            Total Balance
          </div>
          <AnimatedBalance value={127450} />
        </div>
        {/* Live indicator - green square with pulse */}
        <motion.div className="w-8 h-8 bg-[#6b8e6b]" />
      </div>

      {/* Progress bars */}
      <div className="space-y-4">
        <LiveProgressBar color="#000000" baseWidth={75} variance={8} duration={3} />
        <LiveProgressBar color="#6b8e6b" baseWidth={50} variance={12} duration={4} />
        <LiveProgressBar color="#d4a574" baseWidth={25} variance={10} duration={3.5} />
      </div>

      {/* Bottom stats */}
      <div className="grid grid-cols-3 gap-4 pt-4 border-t border-[#e5e5e5]">
        <div>
          <div className="text-xs uppercase tracking-widest text-[#666666]">Income</div>
          <AnimatedStatValue value={8240} prefix="+" color="#6b8e6b" />
        </div>
        <div>
          <div className="text-xs uppercase tracking-widest text-[#666666]">Expenses</div>
          <AnimatedStatValue value={3120} prefix="-" color="#000000" />
        </div>
        <div>
          <div className="text-xs uppercase tracking-widest text-[#666666]">Gift Aid</div>
          <AnimatedStatValue value={1240} color="#d4a574" />
        </div>
      </div>
    </div>
  </motion.div>

  {/* Shadow layer */}
  <motion.div
    variants={shadowVariants}
    className="absolute inset-0 border-2 border-black -z-10 bg-[#fafaf9]"
    style={{ transform: "translate(8px, 8px)" }}
  />
</div>
```

### 4.4 Trust Metrics Section

```jsx
<section className="py-16 bg-black">
  <div className="max-w-7xl mx-auto px-6">
    <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
      {metrics.map((metric) => (
        <div className="text-center">
          <div className="text-4xl md:text-5xl font-bold text-white mb-2 font-mono">
            <TypewriterNumber value={metric.value} />
          </div>
          <div className="text-[#999999] text-sm uppercase tracking-widest">
            {metric.label}
          </div>
        </div>
      ))}
    </div>
  </div>
</section>
```

**Metrics**:
- 500+ UK churches trust ChurchCoin
- £2.3M Gift Aid recovered
- 7,500 Hours saved monthly
- 99.9% Uptime reliability

### 4.5 Testimonial Card

```jsx
<motion.div
  whileInView={{ opacity: 1, y: 0 }}
  initial={{ opacity: 0, y: 20 }}
  className="bg-white p-8 border-2 border-black relative hover:translate-x-[-4px] hover:translate-y-[-4px] hover:shadow-[8px_8px_0px_rgba(0,0,0,0.1)] transition-all"
>
  {/* Quote */}
  <p className="text-[#1a1a1a] mb-6 leading-relaxed">
    "{testimonial.quote}"
  </p>

  {/* Result badge */}
  <div className="inline-block border border-[#6b8e6b] text-[#6b8e6b] px-3 py-1 text-xs uppercase tracking-widest font-medium font-mono mb-4">
    {testimonial.result}
  </div>

  {/* Author */}
  <div className="border-t border-[#e5e5e5] pt-4">
    <div className="font-bold text-black">{testimonial.author}</div>
    <div className="text-sm text-[#666666]">
      {testimonial.role}, {testimonial.church}
    </div>
  </div>
</motion.div>
```

### 4.6 Problem Card

```jsx
<motion.div className="border-l-4 border-black pl-6">
  <div className="text-5xl md:text-6xl font-bold text-[#cc3333] mb-4 font-mono">
    {problem.stat}
  </div>
  <div className="text-xl font-bold text-black mb-2">
    {problem.description}
  </div>
  <div className="text-[#666666]">
    {problem.impact}
  </div>
</motion.div>
```

### 4.7 Transformation Step Card

```jsx
<motion.div className="relative">
  {/* Step number - positioned outside */}
  <div className="absolute -top-4 -left-4 w-8 h-8 bg-black text-white flex items-center justify-center text-sm font-bold font-mono">
    {String(index + 1).padStart(2, "0")}
  </div>

  <div className="border border-black p-6 pt-8 h-full hover:bg-[#f0f0ed] transition-colors">
    <div className="text-xs uppercase tracking-widest text-[#d4a574] font-bold mb-2 font-mono">
      {step.timeframe}
    </div>
    <h3 className="text-lg font-bold text-black mb-2">
      {step.title}
    </h3>
    <p className="text-[#666666] text-sm">
      {step.description}
    </p>
  </div>
</motion.div>
```

### 4.8 Feature Card

```jsx
<motion.div className="bg-white p-6 border-2 border-black hover:translate-x-[-4px] hover:translate-y-[-4px] hover:shadow-[8px_8px_0px_rgba(0,0,0,0.1)] transition-all group">
  {/* Icon */}
  <div className="w-10 h-10 border-2 border-black flex items-center justify-center mb-6 group-hover:bg-[#e8f0e8] transition-colors">
    <Icon className="w-5 h-5 text-black" strokeWidth={1.5} />
  </div>

  <h3 className="text-xl font-bold text-black mb-3">
    {feature.title}
  </h3>
  <p className="text-[#666666] mb-6 text-sm">
    {feature.description}
  </p>

  {/* Benefits list */}
  <ul className="space-y-2">
    {feature.benefits.map((benefit) => (
      <li className="flex items-center gap-2 text-sm text-[#1a1a1a]">
        <Check className="w-4 h-4 text-[#6b8e6b] flex-shrink-0" strokeWidth={2} />
        {benefit}
      </li>
    ))}
  </ul>
</motion.div>
```

**Icons used**: Wallet, Gift, FileText, Users (from lucide-react)

### 4.9 Pricing Card

```jsx
<motion.div className={`relative p-8 border-2 ${
  tier.highlighted
    ? "border-black bg-[#fafaf9] shadow-[8px_8px_0px_#d4a574]"
    : "border-black bg-white"
}`}>
  {/* "Most Popular" badge for highlighted tier */}
  {tier.highlighted && (
    <div className="absolute -top-4 left-6 bg-black text-white px-3 py-1 text-xs uppercase tracking-widest font-bold">
      Most Popular
    </div>
  )}

  <h3 className="text-2xl font-bold text-black mb-2">{tier.name}</h3>
  <p className="text-[#666666] mb-4 text-sm">{tier.description}</p>

  {/* Price */}
  <div className="mb-6">
    <span className="text-5xl font-bold text-black font-mono">£{tier.price}</span>
    <span className="text-[#666666]">/{tier.period}</span>
  </div>

  {/* Features */}
  <ul className="space-y-3 mb-8">
    {tier.features.map((feature) => (
      <li className="flex items-center gap-2 text-[#1a1a1a] text-sm">
        <Check className="w-4 h-4 text-[#6b8e6b] flex-shrink-0" strokeWidth={2} />
        {feature}
      </li>
    ))}
  </ul>

  {/* CTA */}
  <Link className={`block text-center py-3 font-medium transition-all ${
    tier.highlighted
      ? "bg-black text-white hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[4px_4px_0px_#d4a574]"
      : "border-2 border-black text-black hover:bg-[#f0f0ed]"
  }`}>
    {tier.cta}
  </Link>
</motion.div>
```

### 4.10 FAQ Accordion

```jsx
<motion.div className="bg-white border-2 border-black">
  <button
    onClick={() => setOpenFaq(openFaq === index ? null : index)}
    className="w-full flex items-center justify-between p-6 text-left"
  >
    <span className="font-bold text-black pr-4">{item.question}</span>
    <ChevronDown
      className={`w-5 h-5 text-black flex-shrink-0 transition-transform ${
        openFaq === index ? "rotate-180" : ""
      }`}
      strokeWidth={2}
    />
  </button>
  {openFaq === index && (
    <div className="px-6 pb-6 text-[#666666] border-t border-[#e5e5e5] pt-4">
      {item.answer}
    </div>
  )}
</motion.div>
```

### 4.11 Secondary CTA Section

```jsx
<section className="py-24 bg-black">
  <div className="max-w-4xl mx-auto px-6 text-center">
    <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 tracking-tight">
      Ready to give your treasurer their weekends back?
    </h2>
    <p className="text-xl text-[#999999] mb-8 max-w-2xl mx-auto">
      Join 500+ UK churches who've already made the switch.
    </p>

    <div className="flex flex-wrap justify-center gap-4">
      <Link className="group bg-white text-black px-8 py-4 font-medium text-lg hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0px_#d4a574] transition-all flex items-center gap-2">
        Start Free 30-Day Trial
        <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
      </Link>
      <Link className="border-2 border-white text-white px-8 py-4 font-medium text-lg hover:bg-white/10 transition-colors">
        Book a Demo
      </Link>
    </div>

    <p className="text-sm text-[#666666] mt-6 font-mono">
      No credit card required • 10-minute setup • Cancel anytime
    </p>
  </div>
</section>
```

### 4.12 Footer

```jsx
<footer className="bg-[#0a0a0a] py-16">
  <div className="max-w-7xl mx-auto px-6">
    <div className="grid md:grid-cols-5 gap-12 mb-12">
      {/* Brand - 2 columns */}
      <div className="md:col-span-2">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 border-2 border-white flex items-center justify-center">
            <Calculator className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-xl text-white tracking-tight">ChurchCoin</span>
        </div>
        <p className="text-[#666666] mb-4 text-sm">
          AI-powered financial management built specifically for UK churches.
        </p>
        <div className="flex gap-2 flex-wrap">
          <span className="text-xs border border-[#333333] text-[#666666] px-2 py-1 font-mono">ICO REG</span>
          <span className="text-xs border border-[#333333] text-[#666666] px-2 py-1 font-mono">GDPR</span>
          <span className="text-xs border border-[#333333] text-[#666666] px-2 py-1 font-mono">UK DATA</span>
        </div>
      </div>

      {/* Link columns */}
      <div>
        <h4 className="font-bold text-white mb-4 uppercase text-xs tracking-widest">Product</h4>
        <ul className="space-y-2 text-[#666666] text-sm">
          <li><a className="hover:text-white transition-colors">Features</a></li>
          <li><a className="hover:text-white transition-colors">Pricing</a></li>
          <li><a className="hover:text-white transition-colors">Demo</a></li>
        </ul>
      </div>

      <div>
        <h4 className="font-bold text-white mb-4 uppercase text-xs tracking-widest">Resources</h4>
        <ul className="space-y-2 text-[#666666] text-sm">
          <li><a>Help Centre</a></li>
          <li><a>Blog</a></li>
          <li><a>Guides</a></li>
        </ul>
      </div>

      <div>
        <h4 className="font-bold text-white mb-4 uppercase text-xs tracking-widest">Company</h4>
        <ul className="space-y-2 text-[#666666] text-sm">
          <li><a>About</a></li>
          <li><a>Contact</a></li>
          <li><a>Privacy</a></li>
          <li><a>Terms</a></li>
        </ul>
      </div>
    </div>

    <div className="border-t border-[#1a1a1a] pt-8 text-center text-[#666666] text-sm font-mono">
      © {new Date().getFullYear()} ChurchCoin. All rights reserved.
    </div>
  </div>
</footer>
```

---

## 5. Content Data Structure

### 5.1 TypeScript Types

```typescript
interface HeroContent {
  eyebrow: string;
  headline: string;
  highlightedWord: string;
  subheadline: string;
  primaryCta: string;
  secondaryCta: string;
  trustBadge: string;
}

interface Testimonial {
  id: string;
  quote: string;
  author: string;
  role: string;
  church: string;
  result: string;
}

interface Feature {
  id: string;
  title: string;
  description: string;
  icon: string;  // "Wallet" | "Gift" | "FileText" | "Users"
  benefits: string[];
}

interface ProblemPoint {
  stat: string;
  description: string;
  impact: string;
}

interface TransformationStep {
  timeframe: string;
  title: string;
  description: string;
}

interface TrustMetric {
  value: string;
  label: string;
}

interface PricingTier {
  id: string;
  name: string;
  price: number;
  period: string;
  description: string;
  features: string[];
  highlighted?: boolean;
  cta: string;
}

interface FAQ {
  question: string;
  answer: string;
}

interface LandingContent {
  hero: HeroContent;
  testimonials: Testimonial[];
  features: Feature[];
  problems: ProblemPoint[];
  transformation: TransformationStep[];
  trustMetrics: TrustMetric[];
  pricing: PricingTier[];
  faq: FAQ[];
}
```

### 5.2 Content Data

See `src/components/landing/shared/content.ts` for full content data. Key values:

**Hero Card Values**:
- Total Balance: £127,450
- Income: +£8,240
- Expenses: -£3,120
- Gift Aid: £1,240

**Progress Bar Config**:
| Color | Base Width | Variance | Duration |
|-------|------------|----------|----------|
| Black (#000000) | 75% | ±8% | 3s |
| Sage (#6b8e6b) | 50% | ±12% | 4s |
| Amber (#d4a574) | 25% | ±10% | 3.5s |

---

## 6. Responsive Behavior

### 6.1 Breakpoints

```typescript
const breakpoints = {
  sm: "640px",   // Mobile landscape
  md: "768px",   // Tablet
  lg: "1024px",  // Desktop
  xl: "1280px",  // Large desktop
};
```

### 6.2 Mobile Adaptations

**Navigation**:
- Desktop: Full nav links + CTA buttons
- Mobile: Hamburger menu with slide-down panel

**Hero**:
- Desktop: 7/5 grid columns
- Mobile: Single column, card below text

**Trust Metrics**:
- Desktop: 4 columns
- Mobile: 2 columns

**Features**:
- Desktop: 4 columns
- Tablet: 2 columns
- Mobile: 1 column

**Pricing**:
- Desktop: 3 columns
- Mobile: 1 column

**Footer**:
- Desktop: 5 columns
- Mobile: Stacked

### 6.3 Font Size Scaling

| Element | Mobile | Desktop |
|---------|--------|---------|
| Hero H1 | text-5xl | text-7xl |
| Section H2 | text-4xl | text-5xl |
| Problem Stats | text-5xl | text-6xl |
| Trust Metrics | text-4xl | text-5xl |
| Price | text-5xl | text-5xl |

---

## 7. Dependencies

### 7.1 NPM Packages

```json
{
  "framer-motion": "^11.x",
  "lucide-react": "^0.x",
  "next": "^15.x",
  "react": "^19.x"
}
```

### 7.2 Icons Used (lucide-react)

- `Calculator` - Logo
- `Wallet` - Fund Management feature
- `Gift` - Gift Aid feature
- `FileText` - Reporting feature
- `Users` - Donor Insights feature
- `Check` - Checkmark for lists
- `ArrowRight` - CTA arrows
- `ChevronDown` - FAQ accordion
- `Menu` - Mobile menu open
- `X` - Mobile menu close

### 7.3 Framer Motion Hooks

- `motion` - Animation wrapper
- `useInView` - Trigger animations on scroll
- `useSpring` - Spring-based value animation
- `useTransform` - Transform spring values
- `useReducedMotion` - Accessibility check
- `Variants` - Animation variant typing

---

## 8. Implementation Checklist

### Phase 1: Foundation
- [ ] Set up design tokens (colors, typography, spacing)
- [ ] Create background grid pattern
- [ ] Implement animation timing constants and easing
- [ ] Set up content data structure and types

### Phase 2: Core Components
- [ ] Create AnimatedBalance component
- [ ] Create AnimatedStatValue component
- [ ] Create TypewriterNumber component
- [ ] Create LiveProgressBar component
- [ ] Create FloatingCard wrapper

### Phase 3: Section Components
- [ ] Navigation (desktop + mobile)
- [ ] Hero section with all animations
- [ ] Hero balance card
- [ ] Trust metrics bar
- [ ] Testimonial cards
- [ ] Problem cards
- [ ] Transformation steps
- [ ] Feature cards
- [ ] Pricing cards
- [ ] FAQ accordion
- [ ] Secondary CTA
- [ ] Footer

### Phase 4: Polish
- [ ] Verify all animation timings
- [ ] Test reduced motion preferences
- [ ] Responsive testing (mobile/tablet/desktop)
- [ ] Accessibility audit
- [ ] Performance optimization

---

## Appendix: Full Animation Timing Sequence

```
0.0s  - Page loads
0.1s  - Eyebrow badge clip-path reveal starts
0.3s  - Headline words begin staggering (60ms each)
0.4s  - Hero card slides in from right with 3D rotation
0.5s  - Subheadline fades in
0.6s  - Card shadow animates to offset
0.7s  - Balance number starts spring counting
0.7s  - CTA buttons stagger in (100ms apart)
0.9s  - Live indicator appears with pulse
0.9s  - Trust badge fades in
1.0s  - Progress bars start staggered animation (180ms apart)
1.5s  - Bottom stats start counting (150ms apart)
2.0s  - All entrance animations complete
∞     - Continuous animations:
        - Decorative shapes breathing
        - Card floating bob (5s cycle)
        - Progress bars oscillating
        - Indicator pulse effect
```

---

*This specification provides everything needed to recreate the ChurchCoin landing page exactly as deployed.*
