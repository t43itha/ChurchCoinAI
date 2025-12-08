// ContainerScroll - Scroll-based parallax animation for hero section

import React, { useRef, useState, useEffect, useMemo } from "react";
import { useScroll, useTransform, motion, MotionValue } from "framer-motion";

interface ContainerScrollProps {
  titleComponent: React.ReactNode;
  children: React.ReactNode;
}

export function ContainerScroll({ titleComponent, children }: ContainerScrollProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
  });
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => {
      window.removeEventListener("resize", checkMobile);
    };
  }, []);

  const scaleRange = useMemo(() => (isMobile ? [0.92, 1] : [1.05, 1]), [isMobile]);
  const rotateRange = useMemo(() => (isMobile ? [8, 0] : [20, 0]), [isMobile]);
  const translateRange = useMemo(() => (isMobile ? [0, -40] : [0, -100]), [isMobile]);

  const rotate = useTransform(scrollYProgress, [0, 1], rotateRange);
  const scale = useTransform(scrollYProgress, [0, 1], scaleRange);
  const translate = useTransform(scrollYProgress, [0, 1], translateRange);

  return (
    <div
      className="h-[46rem] sm:h-[60rem] lg:h-[80rem] flex items-center justify-center relative p-4 md:p-20"
      ref={containerRef}
    >
      <div
        className="py-12 md:py-40 w-full relative"
        style={{
          perspective: "1000px",
        }}
      >
        <Header translate={translate} titleComponent={titleComponent} />
        <Card rotate={rotate} translate={translate} scale={scale}>
          {children}
        </Card>
      </div>
    </div>
  );
}

function Header({
  translate,
  titleComponent,
}: {
  translate: MotionValue<number>;
  titleComponent: React.ReactNode;
}) {
  return (
    <motion.div
      style={{
        translateY: translate,
      }}
      className="max-w-5xl mx-auto text-center"
    >
      {titleComponent}
    </motion.div>
  );
}

function Card({
  rotate,
  scale,
  children,
}: {
  rotate: MotionValue<number>;
  scale: MotionValue<number>;
  translate: MotionValue<number>;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      style={{
        rotateX: rotate,
        scale,
        boxShadow:
          "0 0 #0000004d, 0 9px 20px #0000004a, 0 37px 37px #00000042, 0 84px 50px #00000026, 0 149px 60px #0000000a, 0 233px 65px #00000003",
      }}
      className="max-w-5xl -mt-12 mx-auto h-[22rem] sm:h-[30rem] md:h-[40rem] w-full border-4 border-[#6C6C6C] p-2 sm:p-4 md:p-6 bg-[#222222] rounded-[30px] shadow-2xl"
    >
      <div className="h-full w-full overflow-hidden rounded-2xl bg-gray-100 p-2 sm:p-4">
        {children}
      </div>
    </motion.div>
  );
}
