// AnimatedBalance - Spring-based large number counter

import { useEffect, useRef, useState } from "react";
import {
  motion,
  useSpring,
  useTransform,
  useInView,
  useReducedMotion,
} from "framer-motion";
import { EASING } from "../constants/animations";

interface AnimatedBalanceProps {
  value: number;
  prefix?: string;
  delay?: number;
}

export default function AnimatedBalance({
  value,
  prefix = "£",
  delay = 0,
}: AnimatedBalanceProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });
  const shouldReduceMotion = useReducedMotion();

  const springValue = useSpring(0, {
    stiffness: 30,
    damping: 25,
    mass: 1,
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
    <div ref={ref} className="text-4xl font-bold font-mono tabular-nums">
      <motion.span
        initial={{ opacity: 0, scale: 0.9 }}
        animate={isInView ? { opacity: 1, scale: 1 } : {}}
        transition={{ delay: delay, duration: 0.4, ease: EASING.smooth }}
      >
        {prefix}{display}
      </motion.span>
    </div>
  );
}
