"use client";

import { MotionConfig, motion, useScroll, useSpring, type Variants } from "motion/react";

const ease = [0.22, 1, 0.36, 1] as const;

/** Site-wide motion settings. People who ask for reduced motion get fades only. */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

/** Fades and lifts its children into place the first time they scroll into view. */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
      transition={{ duration: 0.7, ease, delay }}
    >
      {children}
    </motion.div>
  );
}

const list: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease } },
};

type ListProps = { children: React.ReactNode; className?: string; id?: string };

/** A list whose items animate in one after another. Pair with <StaggerItem>. */
export function StaggerList({ as = "ul", ...props }: ListProps & { as?: "ul" | "ol" | "dl" }) {
  const Tag = as === "ol" ? motion.ol : as === "dl" ? motion.dl : motion.ul;
  return (
    <Tag
      variants={list}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      {...props}
    />
  );
}

/** `lift` raises the item slightly on hover, for cards that can be clicked. */
export function StaggerItem({
  as = "li",
  lift = false,
  ...props
}: ListProps & { as?: "li" | "div"; lift?: boolean }) {
  const Tag = as === "div" ? motion.div : motion.li;
  return (
    <Tag
      variants={item}
      whileHover={lift ? { y: -6, transition: { duration: 0.25, ease } } : undefined}
      {...props}
    />
  );
}

/** A thin bar across the top of the page showing how far the visitor has scrolled. */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 28, mass: 0.4 });
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-1 origin-left bg-(--event-accent)"
      style={{ scaleX }}
    />
  );
}
