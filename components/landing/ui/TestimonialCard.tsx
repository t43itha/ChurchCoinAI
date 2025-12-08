// TestimonialCard - Testimonial card with hover lift effect

import React from "react";
import { motion } from "framer-motion";
import { fadeInUpVariants } from "../constants/animations";
import type { Testimonial } from "../constants/types";

interface TestimonialCardProps {
  key?: React.Key;
  testimonial: Testimonial;
}

export default function TestimonialCard({ testimonial }: TestimonialCardProps) {
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
      className="bg-white p-8 border-2 border-black relative transition-all h-full flex flex-col"
    >
      {/* Quote */}
      <p className="text-[#1a1a1a] mb-6 leading-relaxed flex-grow">
        "{testimonial.quote}"
      </p>

      {/* Result badge */}
      <div className="inline-block border border-[#6b8e6b] text-[#6b8e6b] px-3 py-1 text-xs uppercase tracking-widest font-medium font-mono mb-4 self-start">
        {testimonial.result}
      </div>

      {/* Author */}
      <div className="border-t border-[#e5e5e5] pt-4">
        <div className="font-bold text-black">{testimonial.author}</div>
        <div className="text-sm text-[#666666]">
          {testimonial.role}, {testimonial.church}
        </div>
      </div>
    </motion.div>
  );
}
