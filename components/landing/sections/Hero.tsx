// Hero - Main hero section with split layout (text left, dashboard card right)

import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useRef, type ReactNode } from "react";
import {
  AnimatedBalance,
  AnimatedStatValue,
} from "../shared";
import { landingContent } from "../constants/content";
import {
  TIMING,
  EASING,
  eyebrowVariants,
  indicatorPulseVariants,
  headlineContainerVariants,
  wordVariants,
  highlightedWordVariants,
  ctaContainerVariants,
  ctaVariants,
  cardVariants,
  shadowVariants,
  progressBarContainerVariants,
  statsContainerVariants,
  statItemVariants,
  decorativeShapeVariants,
  decorativeShapeVariants2,
} from "../constants/animations";

interface HeroProps {
  onGetStarted: () => void;
}

// Live Progress Bar Component (matches original exactly)
function LiveProgressBar({
  color,
  baseWidth,
  variance,
  duration,
  delay,
}: {
  color: string;
  baseWidth: number;
  variance: number;
  duration: number;
  delay: number;
}) {
  const shouldReduceMotion = useReducedMotion();
  const displayPercent = Math.round(baseWidth);

  const widthKeyframes = [
    `${baseWidth}%`,
    `${baseWidth + variance}%`,
    `${baseWidth}%`,
    `${baseWidth - variance}%`,
    `${baseWidth}%`,
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5, ease: EASING.smooth }}
      className="flex items-center gap-4 group cursor-pointer"
    >
      {/* Indicator dot */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        whileHover={{
          scale: 1.5,
          boxShadow: `0 0 8px ${color}`,
        }}
        transition={{
          delay,
          type: "spring",
          stiffness: 400,
        }}
        className="w-2 h-2"
        style={{ backgroundColor: color }}
      />

      {/* Progress bar container */}
      <div className="flex-1 h-2 bg-[#e5e5e5] overflow-hidden rounded-sm">
        <motion.div
          initial={{ width: 0 }}
          animate={{
            width: widthKeyframes,
          }}
          transition={{
            times: [0, 0.25, 0.5, 0.75, 1],
            duration: duration,
            repeat: Infinity,
            ease: EASING.smooth,
            delay: delay,
          }}
          className="h-full"
          style={{ backgroundColor: color }}
        />
      </div>

      {/* Animated percentage label */}
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: delay + 0.3, duration: 0.3 }}
        className="text-sm font-mono tabular-nums w-12 text-right"
      >
        {displayPercent}%
      </motion.span>
    </motion.div>
  );
}

// Floating Card Wrapper
function FloatingCard({ children }: { children: ReactNode }) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      animate={
        shouldReduceMotion
          ? {}
          : {
              y: [0, -8, 0],
            }
      }
      transition={{
        duration: 5,
        repeat: Infinity,
        ease: EASING.smooth,
      }}
      whileHover={{
        y: -12,
        transition: { duration: 0.3, ease: EASING.snappy },
      }}
      className="relative"
    >
      {children}
    </motion.div>
  );
}

export default function Hero({ onGetStarted }: HeroProps) {
  const { heroCard, progressBars } = landingContent;

  return (
    <section className="relative pt-32 pb-24 min-h-[90vh] flex items-center overflow-hidden">
      {/* Decorative shapes with breathing animation */}
      <motion.div
        custom={0.2}
        initial="hidden"
        animate={["visible", "breathing"]}
        variants={{
          ...decorativeShapeVariants,
          breathing: {
            scale: [1, 1.08, 1],
            opacity: [0.5, 0.7, 0.5],
            transition: {
              duration: 6,
              repeat: Infinity,
              ease: EASING.smooth,
            },
          },
        }}
        className="absolute top-40 right-20 w-32 h-32 rounded-full bg-[#e8f0e8]"
        style={{ willChange: "transform, opacity" }}
      />
      <motion.div
        custom={0.4}
        initial="hidden"
        animate={["visible", "breathing"]}
        variants={decorativeShapeVariants2}
        className="absolute bottom-40 left-10 w-20 h-20 bg-[#faefe6]"
        style={{ willChange: "transform, opacity" }}
      />
      {/* Additional subtle decorative element */}
      <motion.div
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{
          opacity: [0.2, 0.35, 0.2],
          scale: [1, 1.1, 1],
        }}
        transition={{
          delay: 0.8,
          duration: 9,
          repeat: Infinity,
          ease: EASING.smooth,
        }}
        className="absolute top-1/2 right-1/4 w-16 h-16 rounded-full border border-[#6b8e6b]/30"
      />

      <div className="max-w-7xl mx-auto px-6 relative">
        <div className="grid lg:grid-cols-12 gap-12 items-center">
          {/* Text content - 7 columns */}
          <div className="lg:col-span-7">
            {/* Eyebrow with clip-path reveal */}
            <motion.div
              initial="hidden"
              animate="visible"
              variants={eyebrowVariants}
              className="mb-6"
            >
              <span className="inline-flex items-center gap-2 border border-black px-3 py-1 text-xs uppercase tracking-widest font-medium">
                <motion.span
                  initial="hidden"
                  animate={["visible", "pulse"]}
                  variants={indicatorPulseVariants}
                  className="w-2 h-2 bg-[#6b8e6b]"
                />
                {landingContent.hero.eyebrow}
              </span>
            </motion.div>

            {/* Headline with staggered word reveal */}
            <motion.h1
              initial="hidden"
              animate="visible"
              variants={headlineContainerVariants}
              className="text-5xl md:text-6xl lg:text-7xl font-bold text-black leading-[1.05] mb-6 tracking-tight"
              style={{ perspective: "1000px" }}
            >
              {landingContent.hero.headline.split(" ").map((word, i) => (
                <motion.span
                  key={i}
                  variants={wordVariants}
                  className="inline-block mr-[0.25em]"
                  style={{ transformOrigin: "center bottom" }}
                >
                  {word}
                </motion.span>
              ))}
              <motion.span
                variants={highlightedWordVariants}
                className="inline-block text-[#6b8e6b]"
              >
                {landingContent.hero.highlightedWord}
              </motion.span>
            </motion.h1>

            {/* Subheadline */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: TIMING.subheadline,
                duration: 0.6,
                ease: EASING.smooth,
              }}
              className="text-xl text-[#1a1a1a] mb-8 leading-relaxed max-w-xl"
            >
              {landingContent.hero.subheadline}
            </motion.p>

            {/* CTAs with stagger and spring hover */}
            <motion.div
              initial="hidden"
              animate="visible"
              variants={ctaContainerVariants}
              className="flex flex-wrap gap-4 mb-8"
            >
              <motion.div variants={ctaVariants}>
                <motion.div
                  whileHover={{
                    x: -3,
                    y: -3,
                    boxShadow: "6px 6px 0px #d4a574",
                  }}
                  whileTap={{
                    x: 0,
                    y: 0,
                    boxShadow: "0px 0px 0px #d4a574",
                  }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                >
                  <button
                    onClick={onGetStarted}
                    className="group bg-black text-white px-8 py-4 font-medium text-lg flex items-center gap-2"
                  >
                    {landingContent.hero.primaryCta}
                    <motion.span
                      initial={{ x: 0 }}
                      whileHover={{ x: 4 }}
                      transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    >
                      <ArrowRight className="w-5 h-5" />
                    </motion.span>
                  </button>
                </motion.div>
              </motion.div>
              <motion.div variants={ctaVariants}>
                <motion.div
                  whileHover={{ backgroundColor: "#f0f0ed" }}
                  transition={{ duration: 0.2 }}
                >
                  <button
                    onClick={onGetStarted}
                    className="border-2 border-black text-black px-8 py-4 font-medium text-lg block"
                  >
                    {landingContent.hero.secondaryCta}
                  </button>
                </motion.div>
              </motion.div>
            </motion.div>

            {/* Trust Badge */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: TIMING.trustBadge, duration: 0.5 }}
              className="text-sm text-[#666666] font-mono"
            >
              {landingContent.hero.trustBadge}
            </motion.p>
          </div>

          {/* Visual - 5 columns with 3D card entrance */}
          <motion.div
            initial="hidden"
            animate="visible"
            variants={cardVariants}
            className="lg:col-span-5 relative"
            style={{ perspective: "1200px", transformStyle: "preserve-3d" }}
          >
            <FloatingCard>
              {/* Balance Card */}
              <div className="relative aspect-square">
                <motion.div
                  className="absolute inset-0 border-2 border-black p-8 bg-[#fafaf9]"
                  whileHover={{ scale: 1.02 }}
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                >
                  <div className="h-full flex flex-col justify-between">
                    {/* Header with balance */}
                    <div className="flex justify-between items-start">
                      <div>
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            delay: TIMING.balance - 0.1,
                            duration: 0.4,
                          }}
                          className="text-xs uppercase tracking-widest text-[#666666] mb-1"
                        >
                          Total Balance
                        </motion.div>
                        <AnimatedBalance
                          value={heroCard.balance}
                          delay={TIMING.balance}
                        />
                      </div>
                      {/* Live indicator with pulse */}
                      <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{
                          delay: TIMING.indicator,
                          type: "spring",
                          stiffness: 400,
                          damping: 15,
                        }}
                        className="relative"
                      >
                        <motion.div
                          animate={{
                            boxShadow: [
                              "0 0 0 0 rgba(107, 142, 107, 0.5)",
                              "0 0 0 10px rgba(107, 142, 107, 0)",
                            ],
                          }}
                          transition={{
                            duration: 2,
                            repeat: Infinity,
                            ease: EASING.smooth,
                            delay: TIMING.indicator + 0.5,
                          }}
                          className="w-8 h-8 bg-[#6b8e6b]"
                        />
                      </motion.div>
                    </div>

                    {/* Progress bars with live data animation */}
                    <motion.div
                      initial="hidden"
                      animate="visible"
                      variants={progressBarContainerVariants}
                      className="space-y-4"
                    >
                      {progressBars.map((bar, index) => (
                        <LiveProgressBar
                          key={index}
                          color={bar.color}
                          baseWidth={bar.baseWidth}
                          variance={bar.variance}
                          duration={bar.duration}
                          delay={TIMING.progressBars + index * 0.18}
                        />
                      ))}
                    </motion.div>

                    {/* Bottom stats with staggered reveal and counting */}
                    <motion.div
                      initial="hidden"
                      animate="visible"
                      variants={statsContainerVariants}
                      className="grid grid-cols-3 gap-4 pt-4 border-t border-[#e5e5e5]"
                    >
                      <motion.div variants={statItemVariants}>
                        <div className="text-xs uppercase tracking-widest text-[#666666]">
                          Income
                        </div>
                        <AnimatedStatValue
                          value={heroCard.income}
                          prefix="+"
                          color="#6b8e6b"
                          delay={TIMING.stats}
                        />
                      </motion.div>
                      <motion.div variants={statItemVariants}>
                        <div className="text-xs uppercase tracking-widest text-[#666666]">
                          Expenses
                        </div>
                        <AnimatedStatValue
                          value={heroCard.expenses}
                          prefix="-"
                          color="#000000"
                          delay={TIMING.stats + 0.15}
                        />
                      </motion.div>
                      <motion.div variants={statItemVariants}>
                        <div className="text-xs uppercase tracking-widest text-[#666666]">
                          Gift Aid
                        </div>
                        <AnimatedStatValue
                          value={heroCard.giftAid}
                          prefix=""
                          color="#d4a574"
                          delay={TIMING.stats + 0.3}
                        />
                      </motion.div>
                    </motion.div>
                  </div>
                </motion.div>

                {/* Animated hard shadow */}
                <motion.div
                  initial="hidden"
                  animate="visible"
                  variants={shadowVariants}
                  className="absolute inset-0 border-2 border-black -z-10 bg-[#fafaf9]"
                />
              </div>
            </FloatingCard>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
