// Footer - 5-column footer with links and compliance badges (dark theme)

import { motion } from "framer-motion";
import { landingContent } from "../constants/content";

export default function Footer() {
  const { footer } = landingContent;
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-[#0a0a0a] py-16 px-6">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="grid md:grid-cols-5 gap-12 mb-12"
        >
          {/* Brand column */}
          <div className="md:col-span-2">
            <div className="mb-4">
              <img
                src="/ChurchCoin-Variation 01-transparent-s.png"
                alt="ChurchCoin Finance Platform"
                className="h-14 brightness-0 invert"
              />
            </div>
            <p className="text-sm text-[#666666] max-w-xs mb-4">
              AI-powered financial management built specifically for UK churches.
            </p>
            {/* Compliance badges */}
            <div className="flex gap-2 flex-wrap">
              <span className="text-xs border border-[#333333] text-[#666666] px-2 py-1 font-mono">
                ICO REG
              </span>
              <span className="text-xs border border-[#333333] text-[#666666] px-2 py-1 font-mono">
                GDPR
              </span>
              <span className="text-xs border border-[#333333] text-[#666666] px-2 py-1 font-mono">
                UK DATA
              </span>
            </div>
          </div>

          {/* Link columns */}
          {footer.map((column, index) => (
            <div key={index}>
              <h4 className="text-white text-xs uppercase tracking-widest mb-4 font-medium">
                {column.title}
              </h4>
              <ul className="space-y-3">
                {column.links.map((link, linkIndex) => (
                  <li key={linkIndex}>
                    <a
                      href={link.href}
                      className="text-sm text-[#666666] hover:text-white transition-colors"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </motion.div>

        {/* Bottom bar */}
        <div className="border-t border-[#1a1a1a] pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs text-[#666666] font-mono">
            &copy; {currentYear} ChurchCoin. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
