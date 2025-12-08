// PricingCard - Pricing tier card with highlighted state

import React from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { fadeInUpVariants } from "../constants/animations";
import type { PricingTier } from "../constants/types";

interface PricingCardProps {
  key?: React.Key;
  tier: PricingTier;
  onCTAClick?: () => void;
}

export default function PricingCard({ tier, onCTAClick }: PricingCardProps) {
  return (
    <motion.div
      variants={fadeInUpVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      className={`relative p-8 border-2 h-full flex flex-col ${
        tier.highlighted
          ? "border-black bg-[#fafaf9] shadow-[8px_8px_0px_#d4a574]"
          : "border-black bg-white"
      }`}
    >
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
        <span className="text-5xl font-bold text-black font-mono">
          {tier.price === 0 ? "Free" : `£${tier.price}`}
        </span>
        {tier.price > 0 && (
          <span className="text-[#666666]">/{tier.period}</span>
        )}
      </div>

      {/* Features */}
      <ul className="space-y-3 mb-8 flex-grow">
        {tier.features.map((feature, index) => (
          <li
            key={index}
            className="flex items-center gap-2 text-[#1a1a1a] text-sm"
          >
            <Check className="w-4 h-4 text-[#6b8e6b] flex-shrink-0" strokeWidth={2} />
            {feature}
          </li>
        ))}
      </ul>

      {/* CTA */}
      <motion.button
        onClick={onCTAClick}
        className={`block w-full text-center py-3 font-medium transition-all ${
          tier.highlighted
            ? "bg-black text-white"
            : "border-2 border-black text-black hover:bg-[#f0f0ed]"
        }`}
        whileHover={
          tier.highlighted
            ? { x: -2, y: -2, boxShadow: "4px 4px 0px #d4a574" }
            : undefined
        }
        whileTap={{ scale: 0.98 }}
      >
        {tier.cta}
      </motion.button>
    </motion.div>
  );
}
