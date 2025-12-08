// LiveProgressBar - Oscillating progress bar with indicator dot

import { useRef, useEffect, useState, useCallback } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { progressBarVariants } from "../constants/animations";

interface LiveProgressBarProps {
  color: string;
  baseWidth: number;
  variance: number;
  duration: number;
  delay?: number;
  label?: string;
}

export default function LiveProgressBar({
  color,
  baseWidth,
  variance,
  duration,
  delay = 0,
  label,
}: LiveProgressBarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });
  const prefersReducedMotion = useReducedMotion();
  const [currentWidth, setCurrentWidth] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const animationRef = useRef<number | null>(null);

  const startOscillation = useCallback(() => {
    if (prefersReducedMotion) return;

    let startTime: number | null = null;
    const cycleDuration = duration * 1000;

    const tick = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = (elapsed % cycleDuration) / cycleDuration;

      // Sine wave oscillation
      const oscillation = Math.sin(progress * Math.PI * 2) * variance;
      setCurrentWidth(baseWidth + oscillation);

      animationRef.current = requestAnimationFrame(tick);
    };

    animationRef.current = requestAnimationFrame(tick);
  }, [baseWidth, variance, duration, prefersReducedMotion]);

  useEffect(() => {
    if (!isInView) return;

    const startTimeout = setTimeout(() => {
      if (prefersReducedMotion) {
        setCurrentWidth(baseWidth);
        return;
      }

      // Initial animation to baseWidth
      let start = 0;
      const animDuration = 600;
      const startTimestamp = performance.now();

      const animateIn = (timestamp: number) => {
        const elapsed = timestamp - startTimestamp;
        const progress = Math.min(elapsed / animDuration, 1);
        // Ease out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        setCurrentWidth(eased * baseWidth);

        if (progress < 1) {
          requestAnimationFrame(animateIn);
        } else {
          startOscillation();
        }
      };

      requestAnimationFrame(animateIn);
    }, delay * 1000);

    return () => {
      clearTimeout(startTimeout);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isInView, baseWidth, delay, prefersReducedMotion, startOscillation]);

  return (
    <motion.div
      ref={ref}
      variants={progressBarVariants}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      className="relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Track */}
      <div className="h-2 bg-[#e5e5e5] relative overflow-hidden">
        {/* Progress fill */}
        <div
          className="h-full origin-left transition-[width] duration-100"
          style={{
            backgroundColor: color,
            width: `${currentWidth}%`,
          }}
        />

        {/* Indicator dot */}
        <motion.div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white"
          style={{
            backgroundColor: color,
            left: `calc(${currentWidth}% - 6px)`,
            boxShadow: isHovered
              ? `0 0 8px ${color}`
              : "0 2px 4px rgba(0,0,0,0.2)",
          }}
          animate={{
            scale: isHovered ? 1.2 : 1,
          }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
        />
      </div>

      {/* Label */}
      {label && (
        <div className="flex justify-between items-center mt-1">
          <span className="text-xs text-[#666666] uppercase tracking-widest">
            {label}
          </span>
          <span
            className="text-xs font-mono font-bold"
            style={{ color }}
          >
            {Math.round(currentWidth)}%
          </span>
        </div>
      )}
    </motion.div>
  );
}
