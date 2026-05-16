import { useEffect, useRef, type ReactNode } from "react";
import { motion, useAnimationControls } from "motion/react";
import { EASE_OUT, useReducedMotion } from "../lib/motion";

interface FlashOnChangeProps {
  /** When this value changes, the wrapped content briefly pulses. */
  value: number;
  className?: string;
  children: ReactNode;
}

// Wraps a value (typically a headline number) and plays a short opacity pulse
// whenever `value` changes — just enough to draw the eye to a recalculated
// stat. Skips the pulse entirely when the user prefers reduced motion.
export default function FlashOnChange({
  value,
  className,
  children,
}: FlashOnChangeProps) {
  const controls = useAnimationControls();
  const reduced = useReducedMotion();
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Don't flash on the initial mount — only on genuine changes.
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (reduced) return;
    controls.start({
      opacity: [1, 0.55, 1],
      transition: { duration: 0.18, ease: EASE_OUT },
    });
  }, [value, reduced, controls]);

  return (
    <motion.span animate={controls} className={className}>
      {children}
    </motion.span>
  );
}
