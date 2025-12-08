// TrustMetrics - Black bar with typewriter stats

import { motion } from "framer-motion";
import { landingContent } from "../constants/content";
import { TypewriterNumber } from "../shared";
import { staggerContainerVariants, fadeInUpVariants } from "../constants/animations";

export default function TrustMetrics() {
  const { trustMetrics } = landingContent;

  return (
    <section className="bg-black py-16 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-4"
          variants={staggerContainerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
        >
          {trustMetrics.map((metric, index) => (
            <motion.div
              key={index}
              variants={fadeInUpVariants}
              className="text-center"
            >
              <div className="text-4xl md:text-5xl font-bold text-white mb-2 font-mono">
                <TypewriterNumber value={metric.value} delay={0.3 + index * 0.2} />
              </div>
              <div className="text-sm text-[#999999] uppercase tracking-widest">
                {metric.label}
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
