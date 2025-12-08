// EyebrowBadge - Clip-path animated badge with pulsing indicator

import { motion } from "framer-motion";
import { eyebrowVariants, indicatorPulseVariants } from "../constants/animations";

interface EyebrowBadgeProps {
  text: string;
}

export default function EyebrowBadge({ text }: EyebrowBadgeProps) {
  return (
    <motion.span
      className="inline-flex items-center gap-2 border border-ink px-3 py-1 text-xs uppercase tracking-widest font-medium"
      variants={eyebrowVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.span
        className="w-2 h-2 bg-sage"
        variants={indicatorPulseVariants}
        initial="hidden"
        animate={["visible", "pulse"]}
      />
      {text}
    </motion.span>
  );
}
