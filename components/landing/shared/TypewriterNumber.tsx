// TypewriterNumber - Character-by-character reveal with cursor

import { useEffect, useState, useRef } from "react";
import { useInView, useReducedMotion } from "framer-motion";

interface TypewriterNumberProps {
  value: string;
  suffix?: string;
  delay?: number;
}

export default function TypewriterNumber({
  value,
  suffix = "",
  delay = 0,
}: TypewriterNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });
  const prefersReducedMotion = useReducedMotion();
  const [displayedChars, setDisplayedChars] = useState(0);
  const [showCursor, setShowCursor] = useState(true);

  const fullText = value + suffix;

  useEffect(() => {
    if (!isInView) return;

    if (prefersReducedMotion) {
      setDisplayedChars(fullText.length);
      setShowCursor(false);
      return;
    }

    const startTimeout = setTimeout(() => {
      const interval = setInterval(() => {
        setDisplayedChars((prev) => {
          if (prev >= fullText.length) {
            clearInterval(interval);
            // Keep cursor blinking for a bit, then hide
            setTimeout(() => setShowCursor(false), 1000);
            return prev;
          }
          return prev + 1;
        });
      }, 100);

      return () => clearInterval(interval);
    }, delay * 1000);

    return () => clearTimeout(startTimeout);
  }, [isInView, fullText, delay, prefersReducedMotion]);

  // Cursor blink effect
  useEffect(() => {
    if (!showCursor) return;

    const blinkInterval = setInterval(() => {
      setShowCursor((prev) => !prev);
    }, 500);

    return () => clearInterval(blinkInterval);
  }, []);

  return (
    <span ref={ref} className="font-mono">
      {fullText.slice(0, displayedChars)}
      {displayedChars < fullText.length && showCursor && (
        <span className="inline-block w-[2px] h-[1em] bg-white ml-0.5 animate-pulse" />
      )}
    </span>
  );
}
