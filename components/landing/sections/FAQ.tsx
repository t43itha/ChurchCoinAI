// FAQ - Card-style accordion FAQ section

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { landingContent } from "../constants/content";

export default function FAQ() {
  const { faq } = landingContent;
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <section id="faq" className="py-24 px-6 bg-[#fafaf9]">
      <div className="max-w-3xl mx-auto">
        {/* Section Header - Left aligned */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-16"
        >
          <div className="text-xs uppercase tracking-widest text-[#666666] mb-4">
            FAQ
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-black tracking-tight">
            Frequently asked<br />questions
          </h2>
        </motion.div>

        <div className="space-y-4">
          {faq.map((item, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
              className="bg-white border-2 border-black"
            >
              <button
                onClick={() => setOpenFaq(openFaq === index ? null : index)}
                className="w-full flex items-center justify-between p-6 text-left"
              >
                <span className="font-bold text-black pr-4">{item.question}</span>
                <ChevronDown
                  className={`w-5 h-5 text-black flex-shrink-0 transition-transform duration-200 ${
                    openFaq === index ? "rotate-180" : ""
                  }`}
                  strokeWidth={2}
                />
              </button>
              <AnimatePresence>
                {openFaq === index && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-6 pb-6 text-[#666666] border-t border-[#e5e5e5] pt-4">
                      {item.answer}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
