// TransformationJourney - 4-step cards with step number badges

import { motion } from "framer-motion";
import { landingContent } from "../constants/content";
import { fadeInUpVariants, staggerContainerVariants } from "../constants/animations";

export default function TransformationJourney() {
  const { transformation } = landingContent;

  return (
    <section className="py-24 px-6 bg-white">
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
            The Journey
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-black tracking-tight mb-4">
            Your path to<br />financial clarity
          </h2>
        </motion.div>

        <motion.div
          className="grid md:grid-cols-4 gap-6"
          variants={staggerContainerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          {transformation.map((step, index) => (
            <motion.div key={index} variants={fadeInUpVariants} className="relative">
              {/* Step number badge outside card */}
              <div className="absolute -top-4 -left-4 w-8 h-8 bg-black text-white flex items-center justify-center text-sm font-bold font-mono z-10">
                {String(index + 1).padStart(2, "0")}
              </div>

              <div className="border border-black p-6 pt-8 h-full hover:bg-[#f0f0ed] transition-colors">
                <div className="text-xs uppercase tracking-widest text-[#d4a574] font-bold mb-2 font-mono">
                  {step.timeframe}
                </div>
                <h3 className="text-lg font-bold text-black mb-2">
                  {step.title}
                </h3>
                <p className="text-[#666666] text-sm">
                  {step.description}
                </p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
