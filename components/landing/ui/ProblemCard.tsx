// ProblemCard - Problem statement card with red stat

import React from "react";
import { motion } from "framer-motion";
import { fadeInUpVariants } from "../constants/animations";
import type { ProblemPoint } from "../constants/types";

interface ProblemCardProps {
  key?: React.Key;
  problem: ProblemPoint;
}

export default function ProblemCard({ problem }: ProblemCardProps) {
  return (
    <motion.div
      variants={fadeInUpVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      className="border-l-4 border-black pl-6"
    >
      <div className="text-5xl md:text-6xl font-bold text-[#cc3333] mb-4 font-mono">
        {problem.stat}
      </div>
      <div className="text-xl font-bold text-black mb-2">
        {problem.description}
      </div>
      <div className="text-[#666666]">{problem.impact}</div>
    </motion.div>
  );
}
