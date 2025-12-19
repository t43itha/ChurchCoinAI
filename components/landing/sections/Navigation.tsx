// Navigation - Fixed navigation with mobile menu

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import { navItems } from "../constants/content";

interface NavigationProps {
  onSignIn: () => void;
  onGetStarted: () => void;
}

export default function Navigation({ onSignIn, onGetStarted }: NavigationProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id.toLowerCase());
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
    setMobileMenuOpen(false);
  };

  return (
    <>
      <motion.nav
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="fixed top-0 left-0 right-0 z-50 bg-[#fafaf9]/95 backdrop-blur-sm border-b border-black"
      >
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
          {/* Logo */}
          <img
            src="/ChurchCoin-Variation 01-transparent-s.png"
            alt="ChurchCoin Finance Platform"
            className="h-14 md:h-20"
          />

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8">
            {navItems.map((item) => (
              <button
                key={item}
                onClick={() => scrollToSection(item.toLowerCase())}
                className="text-black hover:text-[#6b8e6b] transition-colors uppercase text-sm tracking-wider font-medium"
              >
                {item}
              </button>
            ))}
          </div>

          {/* Desktop CTAs */}
          <div className="hidden md:flex items-center gap-4">
            <button
              onClick={onSignIn}
              className="text-sm font-medium text-black hover:text-[#6b8e6b] transition-colors"
            >
              Sign In
            </button>
            <motion.button
              onClick={onGetStarted}
              className="bg-black text-white px-5 py-2.5 font-medium"
              whileHover={{
                x: -2,
                y: -2,
                boxShadow: "4px 4px 0px #d4a574",
              }}
              whileTap={{ scale: 0.98 }}
            >
              Get Started
            </motion.button>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="md:hidden p-2 border border-black"
          >
            <Menu className="w-5 h-5 text-black" />
          </button>
          </div>
        </div>
      </motion.nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/20 z-50 md:hidden"
            />

            {/* Menu Panel */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 w-72 bg-white border-l border-black z-50 md:hidden"
            >
              <div className="p-6">
                <div className="flex justify-between items-center mb-8">
                  <span className="font-bold text-black">Menu</span>
                  <button
                    onClick={() => setMobileMenuOpen(false)}
                    className="p-2 text-black hover:bg-[#f0f0ed] transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-4">
                  {navItems.map((item) => (
                    <button
                      key={item}
                      onClick={() => scrollToSection(item.toLowerCase())}
                      className="block w-full text-left py-3 text-black font-medium border-b border-[#e5e5e5] hover:pl-2 transition-all uppercase text-sm tracking-wider"
                    >
                      {item}
                    </button>
                  ))}
                </div>

                <div className="mt-8 space-y-3">
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onSignIn();
                    }}
                    className="block w-full text-center py-3 border-2 border-black text-black font-medium"
                  >
                    Sign In
                  </button>
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onGetStarted();
                    }}
                    className="block w-full text-center py-3 bg-black text-white font-medium"
                  >
                    Get Started
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
