// ProblemSection - Pain points with stats

import { motion } from "framer-motion";
import { landingContent } from "../constants/content";
import { ProblemCard } from "../ui";
import { staggerContainerVariants } from "../constants/animations";

export default function ProblemSection() {
  const { problems } = landingContent;

  return (
    <section className="py-24 px-6 bg-[#fafaf9]">
      <div className="max-w-7xl mx-auto">
        {/* Section Header - Left aligned */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-16"
        >
          <div className="text-xs uppercase tracking-widest text-[#666666] mb-4">
            The Problem
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-black tracking-tight mb-4">
            Still wrestling<br />with spreadsheets?
          </h2>
        </motion.div>

        <motion.div
          className="grid md:grid-cols-3 gap-12"
          variants={staggerContainerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          {problems.map((problem, index) => (
            <ProblemCard key={index} problem={problem} />
          ))}
        </motion.div>

        {/* Transition */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-16 border-t-2 border-black pt-8"
        >
          <p className="text-2xl font-bold text-black">
            There's a better way.{" "}
            <span className="text-[#6b8e6b]">We built it.</span>
          </p>
        </motion.div>
      </div>
    </section>
  );
}
