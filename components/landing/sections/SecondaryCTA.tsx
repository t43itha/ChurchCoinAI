// SecondaryCTA - Black CTA bar before footer

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { secondaryCTAContent } from "../constants/content";

interface SecondaryCTAProps {
  onGetStarted: () => void;
}

export default function SecondaryCTA({ onGetStarted }: SecondaryCTAProps) {
  return (
    <section className="bg-black py-24 px-6">
      <div className="max-w-4xl mx-auto text-center">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-4xl md:text-5xl font-bold text-white mb-6 tracking-tight"
        >
          {secondaryCTAContent.headline}
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-xl text-[#999999] mb-8 max-w-2xl mx-auto"
        >
          {secondaryCTAContent.subheadline}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="flex flex-wrap gap-4 justify-center"
        >
          <motion.button
            onClick={onGetStarted}
            className="group bg-white text-black px-8 py-4 font-medium text-lg flex items-center gap-2"
            whileHover={{
              x: -3,
              y: -3,
              boxShadow: "6px 6px 0px #d4a574",
            }}
            whileTap={{
              x: 0,
              y: 0,
              boxShadow: "0px 0px 0px #d4a574",
            }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
          >
            {secondaryCTAContent.primaryCta}
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </motion.button>
          <motion.button
            onClick={onGetStarted}
            className="border-2 border-white text-white px-8 py-4 font-medium text-lg"
            whileHover={{ backgroundColor: "rgba(255,255,255,0.1)" }}
            transition={{ duration: 0.2 }}
          >
            {secondaryCTAContent.secondaryCta}
          </motion.button>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="text-[#666666] text-sm mt-6 font-mono"
        >
          {secondaryCTAContent.trustText}
        </motion.p>
      </div>
    </section>
  );
}
