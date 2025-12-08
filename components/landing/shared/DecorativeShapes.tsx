// DecorativeShapes - Breathing decorative background elements

import { motion } from "framer-motion";
import { decorativeShapeVariants, breathingAnimation } from "../constants/animations";

interface Shape {
  type: "circle" | "square" | "ring";
  size: string;
  position: { top?: string; right?: string; bottom?: string; left?: string };
  color: string;
  delay: number;
  breathingDuration: number;
}

interface DecorativeShapesProps {
  shapes?: Shape[];
}

const defaultShapes: Shape[] = [
  {
    type: "circle",
    size: "w-32 h-32",
    position: { top: "10rem", right: "5rem" },
    color: "bg-sage-light",
    delay: 0.2,
    breathingDuration: 6,
  },
  {
    type: "square",
    size: "w-20 h-20",
    position: { bottom: "10rem", left: "2.5rem" },
    color: "bg-amber-light",
    delay: 0.4,
    breathingDuration: 5,
  },
  {
    type: "ring",
    size: "w-16 h-16",
    position: { top: "50%", right: "25%" },
    color: "border-sage/30",
    delay: 0.6,
    breathingDuration: 7,
  },
];

export default function DecorativeShapes({
  shapes = defaultShapes,
}: DecorativeShapesProps) {
  return (
    <>
      {shapes.map((shape, index) => (
        <motion.div
          key={index}
          className={`absolute ${shape.size} ${
            shape.type === "circle"
              ? "rounded-full"
              : shape.type === "ring"
              ? "rounded-full border"
              : ""
          } ${shape.type === "ring" ? shape.color : shape.color} pointer-events-none`}
          style={{
            ...shape.position,
          }}
          variants={decorativeShapeVariants}
          initial="hidden"
          animate={["visible", breathingAnimation(shape.breathingDuration)]}
          custom={shape.delay}
        />
      ))}
    </>
  );
}
