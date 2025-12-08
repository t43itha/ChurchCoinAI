// Testimonials - 3-column testimonial grid

import { motion } from "framer-motion";
import { landingContent } from "../constants/content";
import { TestimonialCard } from "../ui";
import { staggerContainerVariants } from "../constants/animations";

export default function Testimonials() {
  const { testimonials } = landingContent;

  return (
    <section id="testimonials" className="py-24 px-6 bg-white">
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
            Testimonials
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-black tracking-tight mb-4">
            Trusted by churches<br />across the UK
          </h2>
        </motion.div>

        <motion.div
          className="grid md:grid-cols-3 gap-6"
          variants={staggerContainerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          {testimonials.map((testimonial) => (
            <TestimonialCard key={testimonial.id} testimonial={testimonial} />
          ))}
        </motion.div>
      </div>
    </section>
  );
}
