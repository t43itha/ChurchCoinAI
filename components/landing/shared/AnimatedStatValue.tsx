// AnimatedStatValue - Smaller stat counters with optional prefix

import { useEffect, useRef, useState } from "react";
import {
  motion,
  useSpring,
  useTransform,
  useInView,
  useReducedMotion,
} from "framer-motion";
import { EASING } from "../constants/animations";

interface AnimatedStatValueProps {
  value: number;
  prefix?: string;
  color?: string;
  delay?: number;
}

export default function AnimatedStatValue({
  value,
  prefix = "",
  color = "inherit",
  delay = 0,
}: AnimatedStatValueProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });
  const shouldReduceMotion = useReducedMotion();

  const springValue = useSpring(0, {
    stiffness: 50,
    damping: 20,
  });

  const displayValue = useTransform(springValue, (latest) =>
    Math.floor(latest).toLocaleString()
  );

  const [display, setDisplay] = useState("0");

  useEffect(() => {
    if (isInView) {
      const timer = setTimeout(() => {
        if (shouldReduceMotion) {
          setDisplay(value.toLocaleString());
        } else {
          springValue.set(value);
        }
      }, delay * 1000);
      return () => clearTimeout(timer);
    }
  }, [isInView, value, delay, springValue, shouldReduceMotion]);

  useEffect(() => {
    if (!shouldReduceMotion) {
      return displayValue.on("change", (v) => setDisplay(v));
    }
  }, [displayValue, shouldReduceMotion]);

  return (
    <div
      ref={ref}
      className="text-lg font-bold font-mono tabular-nums"
      style={{ color }}
    >
      <motion.span
        initial={{ opacity: 0, y: 10 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ delay, duration: 0.3, ease: EASING.smooth }}
      >
        {prefix}£{display}
      </motion.span>
    </div>
  );
}
