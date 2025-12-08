// Features - 4-column feature grid

import { motion } from "framer-motion";
import { landingContent } from "../constants/content";
import { FeatureCard } from "../ui";
import { staggerContainerVariants } from "../constants/animations";

export default function Features() {
  const { features } = landingContent;

  return (
    <section id="features" className="py-24 px-6 bg-[#fafaf9]">
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
            Features
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-black tracking-tight mb-4">
            Everything your<br />church needs
          </h2>
        </motion.div>

        <motion.div
          className="grid md:grid-cols-2 lg:grid-cols-4 gap-6"
          variants={staggerContainerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          {features.map((feature) => (
            <FeatureCard key={feature.id} feature={feature} />
          ))}
        </motion.div>
      </div>
    </section>
  );
}
