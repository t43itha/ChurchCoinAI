// Pricing - 3 pricing tiers

import { motion } from "framer-motion";
import { landingContent } from "../constants/content";
import { PricingCard } from "../ui";
import { staggerContainerVariants } from "../constants/animations";

interface PricingProps {
  onGetStarted: () => void;
}

export default function Pricing({ onGetStarted }: PricingProps) {
  const { pricing } = landingContent;

  return (
    <section id="pricing" className="py-24 px-6 bg-white">
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
            Pricing
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-black tracking-tight mb-4">
            Simple, transparent<br />pricing
          </h2>
          <p className="text-[#666666] max-w-2xl">
            Choose the plan that fits your church. Cancel anytime.
          </p>
        </motion.div>

        <motion.div
          className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto"
          variants={staggerContainerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          {pricing.map((tier) => (
            <PricingCard key={tier.id} tier={tier} onCTAClick={onGetStarted} />
          ))}
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 }}
          className="text-center text-sm text-[#666666] mt-8 font-mono"
        >
          All prices exclude VAT. Registered charities may be exempt.
        </motion.p>
      </div>
    </section>
  );
}
