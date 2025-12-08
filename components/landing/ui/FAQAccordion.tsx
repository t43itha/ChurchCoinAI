// FAQAccordion - Collapsible FAQ item with smooth animation

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { fadeInUpVariants } from "../constants/animations";
import type { FAQ } from "../constants/types";

interface FAQAccordionProps {
  key?: React.Key;
  faq: FAQ;
  isOpen?: boolean;
  onToggle?: () => void;
}

export default function FAQAccordion({
  faq,
  isOpen = false,
  onToggle,
}: FAQAccordionProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = onToggle ? isOpen : internalOpen;
  const toggle = onToggle || (() => setInternalOpen(!internalOpen));

  return (
    <motion.div
      variants={fadeInUpVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      className="border-b border-ledger"
    >
      <button
        onClick={toggle}
        className="w-full py-6 flex items-center justify-between text-left hover:bg-grey-light/50 transition-colors px-2 -mx-2"
      >
        <span className="font-bold text-ink pr-8">{faq.question}</span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="flex-shrink-0"
        >
          <ChevronDown className="w-5 h-5 text-grey-mid" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <p className="pb-6 text-grey-mid leading-relaxed px-2 -mx-2">
              {faq.answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
