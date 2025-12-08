// CTAButton - Primary and secondary CTA buttons with spring hover

import { ReactNode } from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { ctaButtonHover, ctaVariants } from "../constants/animations";

interface CTAButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "outline" | "outline-white";
  showArrow?: boolean;
  className?: string;
}

export default function CTAButton({
  children,
  onClick,
  variant = "primary",
  showArrow = false,
  className = "",
}: CTAButtonProps) {
  const baseClasses =
    "px-8 py-4 font-medium text-lg flex items-center gap-2 justify-center transition-colors";

  const variantClasses = {
    primary: "bg-ink text-white",
    secondary: "bg-white text-ink",
    outline: "border-2 border-ink text-ink hover:bg-grey-light",
    "outline-white": "border-2 border-white text-white hover:bg-white/10",
  };

  const useSpringAnimation = variant === "primary" || variant === "secondary";

  if (useSpringAnimation) {
    return (
      <motion.button
        onClick={onClick}
        className={`${baseClasses} ${variantClasses[variant]} ${className}`}
        variants={ctaVariants}
        initial="hidden"
        animate="visible"
        whileHover={ctaButtonHover.hover}
        whileTap={ctaButtonHover.tap}
      >
        <span>{children}</span>
        {showArrow && (
          <motion.span
            className="inline-block"
            whileHover={{ x: 4 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
          >
            <ArrowRight className="w-5 h-5" />
          </motion.span>
        )}
      </motion.button>
    );
  }

  return (
    <motion.button
      onClick={onClick}
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      variants={ctaVariants}
      initial="hidden"
      animate="visible"
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <span>{children}</span>
      {showArrow && <ArrowRight className="w-5 h-5" />}
    </motion.button>
  );
}
