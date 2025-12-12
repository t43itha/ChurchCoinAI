// FloatingCard - Wrapper component with subtle floating animation

import { motion } from "framer-motion";
import { floatingAnimation, EASING } from "../constants/animations";
import type { ReactNode } from "react";

interface FloatingCardProps {
  children: ReactNode;
  className?: string;
  disableFloat?: boolean;
}

export default function FloatingCard({
  children,
  className = "",
  disableFloat = false,
}: FloatingCardProps) {
  return (
    <motion.div
      className={className}
      animate={disableFloat ? undefined : floatingAnimation}
      whileHover={{
        y: -12,
        transition: { duration: 0.3, ease: EASING.snappy },
      }}
    >
      {children}
    </motion.div>
  );
}
