// FeatureCard - Feature card with icon and benefits list

import React from "react";
import { motion } from "framer-motion";
import { Wallet, Gift, FileText, Users, Check } from "lucide-react";
import { fadeInUpVariants } from "../constants/animations";
import type { Feature } from "../constants/types";

interface FeatureCardProps {
  key?: React.Key;
  feature: Feature;
}

const iconMap: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  Wallet,
  Gift,
  FileText,
  Users,
};

export default function FeatureCard({ feature }: FeatureCardProps) {
  const Icon = iconMap[feature.icon];

  return (
    <motion.div
      variants={fadeInUpVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      whileHover={{
        x: -4,
        y: -4,
        boxShadow: "8px 8px 0px rgba(0,0,0,0.1)",
      }}
      transition={{ duration: 0.2 }}
      className="bg-white p-6 border-2 border-black transition-all group h-full flex flex-col"
    >
      {/* Icon */}
      <div className="w-10 h-10 border-2 border-black flex items-center justify-center mb-6 group-hover:bg-[#e8f0e8] transition-colors">
        <Icon className="w-5 h-5 text-black" strokeWidth={1.5} />
      </div>

      <h3 className="text-xl font-bold text-black mb-3">{feature.title}</h3>
      <p className="text-[#666666] mb-6 text-sm flex-grow">{feature.description}</p>

      {/* Benefits list */}
      <ul className="space-y-2">
        {feature.benefits.map((benefit, index) => (
          <li
            key={index}
            className="flex items-center gap-2 text-sm text-[#1a1a1a]"
          >
            <Check className="w-4 h-4 text-[#6b8e6b] flex-shrink-0" strokeWidth={2} />
            {benefit}
          </li>
        ))}
      </ul>
    </motion.div>
  );
}
