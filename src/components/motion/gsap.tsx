"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(useGSAP, ScrollTrigger);

const MOTION_OK = "(prefers-reduced-motion: no-preference)";

/**
 * Scroll-driven hero: the photo drifts and zooms while the text lifts away
 * and fades as the visitor scrolls. Mark the parts inside with
 * `data-hero-bg` and `data-hero-content`.
 */
export function HeroParallax({ children, className }: { children: React.ReactNode; className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const trigger = { trigger: root.current, start: "top top", end: "bottom top", scrub: true };
        gsap.to("[data-hero-bg]", { yPercent: 18, scale: 1.12, ease: "none", scrollTrigger: trigger });
        gsap.to("[data-hero-content]", { yPercent: -22, opacity: 0, ease: "none", scrollTrigger: trigger });
      });
    },
    { scope: root },
  );
  return (
    <div ref={root} className={className}>
      {children}
    </div>
  );
}

/**
 * A band of oversized words that slides sideways as the page scrolls.
 * Decorative: the same words appear as real text elsewhere on the page.
 */
export function ScrollMarquee({ words }: { words: string[] }) {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const scrollTrigger = { trigger: root.current, start: "top bottom", end: "bottom top", scrub: 0.6 };
        gsap.fromTo("[data-row='a']", { xPercent: 0 }, { xPercent: -30, ease: "none", scrollTrigger });
        gsap.fromTo("[data-row='b']", { xPercent: -30 }, { xPercent: 0, ease: "none", scrollTrigger });
      });
    },
    { scope: root },
  );
  if (words.length === 0) return null;
  // Repeated so the row is always wider than the screen.
  const loop = Array.from({ length: 6 }, () => words).flat();
  const row = (name: string, outlined: boolean) => (
    <div data-row={name} className="flex w-max gap-8 whitespace-nowrap will-change-transform">
      {loop.map((word, i) => (
        <span
          key={i}
          className={`display text-6xl sm:text-8xl ${
            outlined
              ? "text-transparent [-webkit-text-stroke:1px_rgba(255,255,255,0.35)]"
              : i % 2
                ? "text-(--event-accent)"
                : "text-white"
          }`}
        >
          {word}
        </span>
      ))}
    </div>
  );
  return (
    <div ref={root} aria-hidden className="space-y-3 overflow-hidden py-10 sm:py-14">
      {row("a", false)}
      {row("b", true)}
    </div>
  );
}

/**
 * Counts up to a figure such as "₹30,600", "4 KM" or "500" when it scrolls
 * into view. The server renders the final value, so it reads correctly
 * without JavaScript and for anyone who prefers reduced motion.
 */
export function CountUp({ value, className }: { value: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useGSAP(
    () => {
      const el = ref.current;
      const match = value.match(/^(\D*?)(\d[\d,]*(?:\.\d+)?)(.*)$/);
      if (!el || !match) return;
      const [, prefix, digits, suffix] = match;
      const target = Number(digits.replace(/,/g, ""));
      const decimals = digits.split(".")[1]?.length ?? 0;
      const grouped = digits.includes(",");
      const format = (n: number) =>
        prefix +
        (grouped
          ? n.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
          : n.toFixed(decimals)) +
        suffix;

      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const counter = { n: 0 };
        el.textContent = format(0);
        gsap.to(counter, {
          n: target,
          duration: 1.6,
          ease: "power2.out",
          scrollTrigger: { trigger: el, start: "top 88%", once: true },
          onUpdate: () => {
            el.textContent = format(counter.n);
          },
          onComplete: () => {
            el.textContent = value;
          },
        });
        return () => {
          el.textContent = value;
        };
      });
    },
    { scope: ref, dependencies: [value] },
  );
  return (
    <span ref={ref} className={className}>
      {value}
    </span>
  );
}
