import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Menu,
  Pause,
  Play,
  ShieldCheck,
  X,
} from "lucide-react";
import FundsPreview from "./FundsPreview";

interface LandingPageProps {
  onSignIn: () => void;
  onGetStarted: (plan?: "starter" | "growing" | "thriving") => void;
  onBookDemo: () => void;
}

type PricingPlan = {
  id: "starter" | "growing" | "thriving";
  name: string;
  price: string;
  description: string;
  features: string[];
  featured?: boolean;
};

const navigation = [
  { label: "How it works", href: "#how" },
  { label: "Why trust it", href: "#trust" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

const pricingPlans: PricingPlan[] = [
  {
    id: "starter",
    name: "Core",
    price: "£19",
    description: "For churches with under £100k annual income and straightforward finances.",
    features: [
      "All core fund accounting",
      "AI transaction categorisation",
      "Gift Aid records and schedules",
      "Self-service support",
    ],
  },
  {
    id: "growing",
    name: "Standard",
    price: "£29",
    description: "For churches with £100k–£500k annual income and more to manage.",
    features: [
      "Everything in Core",
      "Connected bank accounts",
      "Trustee-ready reports",
      "One onboarding session",
    ],
    featured: true,
  },
  {
    id: "thriving",
    name: "Plus",
    price: "£49",
    description: "For churches with £500k–£1m annual income and greater support needs.",
    features: [
      "Everything in Standard",
      "More connected bank accounts",
      "Advanced permissions",
      "Assisted onboarding and training",
    ],
  },
];

const faqs = [
  {
    question: "Do I need to know accounting?",
    answer:
      "No. If you can read a bank statement, you can use ChurchCoin. Fund accounting happens in the background so you don't have to think in debits and credits.",
  },
  {
    question: "Which banks work?",
    answer:
      "Direct bank feeds cover the major UK banks through Open Banking. And whichever bank your church uses — including CAF Bank, Unity Trust and other accounts churches typically hold — you can always import statements, so no church is left out.",
  },
  {
    question: "Is our data safe?",
    answer:
      "Yes. Your data is encrypted in transit, and ChurchCoin never has access to move money from your account — it works from statements, not from control of your bank.",
  },
  {
    question: "What if the AI gets something wrong?",
    answer:
      "You'll catch it, because nothing is posted without your approval. Correct it once and it learns for next time.",
  },
  {
    question: "Can we switch from a spreadsheet?",
    answer:
      "Yes — import your existing records and carry on from where you are.",
  },
  {
    question: "What denomination is this for?",
    answer:
      "Any. Anglican, Methodist, Baptist, URC, independent — fund accounting works the same way.",
  },
];

const reveal = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

function Logo({ light = false }: { light?: boolean }) {
  return (
    <img
      src="/ChurchCoin-Variation 01-transparent-s.png"
      alt="ChurchCoin"
      className={`h-11 w-auto sm:h-12 ${light ? "brightness-0 invert" : ""}`}
    />
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="mb-5 flex items-center gap-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-dark">
      <span className="h-px w-7 bg-amber" aria-hidden="true" />
      {children}
    </div>
  );
}

function ScreenshotFrame({
  src,
  alt,
  label,
  className = "",
  videoSrc,
  poster,
  children,
  disableHover = false,
}: {
  src?: string;
  alt: string;
  label: string;
  className?: string;
  videoSrc?: string;
  poster?: string;
  children?: ReactNode;
  disableHover?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoPlaying, setVideoPlaying] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!videoSrc || !video) return;

    if (reduceMotion) {
      video.pause();
      video.currentTime = 0;
      setVideoPlaying(false);
      return;
    }

    void video.play().catch(() => setVideoPlaying(false));
  }, [reduceMotion, videoSrc]);

  const toggleVideo = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      void video.play().catch(() => setVideoPlaying(false));
    } else {
      video.pause();
    }
  };

  return (
    <motion.figure
      whileHover={reduceMotion || disableHover ? undefined : { y: -3 }}
      transition={{ duration: 0.24, ease: "easeOut" }}
      className={`group overflow-hidden rounded-[14px] border border-ledger bg-white shadow-soft-lg ${className}`}
    >
      <div className="flex h-10 items-center gap-2 border-b border-ledger bg-[#fcfbf9] px-4">
        <span className="h-2.5 w-2.5 rounded-full bg-[#c64545] transition-transform group-hover:scale-110" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#c79a5f] transition-transform delay-75 group-hover:scale-110" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#6b8e6b] transition-transform delay-150 group-hover:scale-110" />
        <span className="ml-2 truncate font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-grey-mid">
          {label}
        </span>
      </div>
      {children ?? (videoSrc ? (
        <div className="relative">
          <video
            ref={videoRef}
            src={videoSrc}
            poster={poster}
            aria-label={alt}
            className={`block aspect-video w-full object-cover object-top ${disableHover ? "" : "transition-transform duration-700 ease-out group-hover:scale-[1.008]"}`}
            autoPlay={!reduceMotion}
            muted
            loop={!reduceMotion}
            playsInline
            preload={reduceMotion ? "none" : "metadata"}
            onPlay={() => setVideoPlaying(true)}
            onPause={() => setVideoPlaying(false)}
            onEnded={() => setVideoPlaying(false)}
          />
          <button
            type="button"
            onClick={toggleVideo}
            className="absolute bottom-3 right-3 inline-flex h-10 w-10 items-center justify-center rounded-full border border-ink/10 bg-white/85 text-ink shadow-sm backdrop-blur-sm transition hover:border-ink/20 hover:bg-white hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2"
            aria-label={videoPlaying ? "Pause transaction preview" : "Play transaction preview"}
            aria-pressed={videoPlaying}
            title={videoPlaying ? "Pause" : "Play"}
          >
            {videoPlaying ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
          </button>
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          className={`block aspect-video w-full object-cover object-top ${disableHover ? "" : "transition-transform duration-700 ease-out group-hover:scale-[1.008]"}`}
          loading="lazy"
        />
      ))}
    </motion.figure>
  );
}

function HeroProductPreview() {
  const reduceMotion = useReducedMotion();
  const [balance, setBalance] = useState(reduceMotion ? 127450 : 0);

  useEffect(() => {
    if (reduceMotion) {
      setBalance(127450);
      return;
    }

    const startedAt = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min((now - startedAt) / 1200, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setBalance(Math.round(127450 * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduceMotion]);

  const bars = [
    { value: "75%", colour: "#1c1917", widths: [0, 78, 71, 80, 75], delay: 0 },
    { value: "50%", colour: "#6b8e6b", widths: [0, 54, 47, 62, 50], delay: 0.16 },
    { value: "25%", colour: "#d4a574", widths: [0, 31, 23, 34, 25], delay: 0.32 },
  ];

  return (
    <motion.div
      initial={reduceMotion ? undefined : { opacity: 0, x: 34, scale: 0.985 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ duration: 0.9, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="relative mx-auto w-full max-w-[520px] p-3 sm:p-5 lg:ml-auto"
    >
      <div className="absolute right-0 top-0 -z-10 h-36 w-36 rounded-full bg-sage-light/70 blur-sm" aria-hidden="true" />
      <motion.div
        className="relative aspect-square"
        animate={reduceMotion ? undefined : { y: [0, -8, 0] }}
        transition={reduceMotion ? undefined : { duration: 4, repeat: Infinity, ease: "easeInOut" }}
      >
        <motion.div
          className="absolute inset-0 -z-10 border-2 border-ink bg-paper"
          initial={reduceMotion ? { x: 8, y: 8 } : { x: 0, y: 0, opacity: 0 }}
          animate={{ x: 8, y: 8, opacity: 1 }}
          transition={{ duration: 0.55, delay: 0.55, ease: [0.16, 1, 0.3, 1] }}
        />
        <motion.div
          className="absolute inset-0 flex flex-col justify-between border-2 border-ink bg-paper p-6 will-change-transform sm:p-8"
          whileHover={reduceMotion ? undefined : { scale: 1.02, transition: { type: "spring", stiffness: 280, damping: 24 } }}
          transition={{ type: "spring", stiffness: 280, damping: 24 }}
        >
          <div className="flex items-start justify-between">
            <div>
              <motion.p initial={reduceMotion ? undefined : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }} className="text-[10px] font-medium uppercase tracking-[0.16em] text-grey-mid sm:text-xs">Total balance</motion.p>
              <p className="mt-1 font-mono text-[2rem] font-bold tracking-[-0.05em] text-ink sm:text-[2.6rem]">£{balance.toLocaleString("en-GB")}</p>
            </div>
            <motion.span animate={reduceMotion ? undefined : { scale: [1, 1.08, 1], rotate: [0, 3, 0] }} transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut" }} className="flex h-10 w-10 items-center justify-center bg-sage-light sm:h-12 sm:w-12"><span className="h-6 w-6 bg-sage sm:h-7 sm:w-7" /></motion.span>
          </div>

          <div className="space-y-5 sm:space-y-6">
            {bars.map((bar) => (
              <motion.div key={bar.value} initial={reduceMotion ? undefined : { opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.65 + bar.delay, duration: 0.45 }} className="flex cursor-pointer items-center gap-3 sm:gap-4">
                <span className="h-2 w-2 shrink-0" style={{ backgroundColor: bar.colour }} />
                <span className="h-2 flex-1 overflow-hidden rounded-sm bg-[#e5e5e5]">
                  <motion.span
                    className="block h-full"
                    style={{ backgroundColor: bar.colour }}
                    initial={{ width: reduceMotion ? `${bar.value}` : "0%" }}
                    animate={{ width: reduceMotion ? `${bar.value}` : bar.widths.map((width) => `${width}%`) }}
                    transition={reduceMotion ? undefined : { duration: 6.2, delay: 0.8 + bar.delay, times: [0, 0.28, 0.55, 0.82, 1], repeat: Infinity, repeatDelay: 0.4, ease: "easeInOut" }}
                  />
                </span>
                <span className="w-9 text-right font-mono text-[10px] font-medium text-ink sm:text-xs">{bar.value}</span>
              </motion.div>
            ))}
          </div>

          <motion.div initial={reduceMotion ? undefined : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.05, duration: 0.5 }} className="grid grid-cols-3 gap-3 border-t border-ledger pt-5 sm:gap-6 sm:pt-6">
            <div><p className="text-[8px] uppercase tracking-[0.12em] text-grey-mid sm:text-[10px]">Income</p><p className="mt-1 font-mono text-sm font-bold text-sage sm:text-base">+£8,240</p></div>
            <div><p className="text-[8px] uppercase tracking-[0.12em] text-grey-mid sm:text-[10px]">Expenses</p><p className="mt-1 font-mono text-sm font-bold text-ink sm:text-base">−£3,120</p></div>
            <div><p className="text-[8px] uppercase tracking-[0.12em] text-grey-mid sm:text-[10px]">Gift Aid</p><p className="mt-1 font-mono text-sm font-bold text-amber sm:text-base">£1,240</p></div>
          </motion.div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

function TourModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusableElements = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), video[controls], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.getAttribute("aria-hidden") !== "true");

      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;
      const currentIndex = focusableElements.findIndex((element) => element === activeElement);
      const nextElement = event.shiftKey
        ? currentIndex <= 0
          ? lastElement
          : focusableElements[currentIndex - 1]
        : currentIndex < 0 || activeElement === lastElement
          ? firstElement
          : focusableElements[currentIndex + 1];

      event.preventDefault();
      nextElement.focus();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/75 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
          role="dialog"
          aria-modal="true"
          aria-label="ChurchCoin one-minute demo"
        >
          <motion.div
            ref={dialogRef}
            className="w-full max-w-5xl overflow-hidden rounded-2xl border border-white/15 bg-ink shadow-2xl"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.22 }}
          >
            <div className="flex items-center justify-between border-b border-white/15 px-5 py-4 text-white">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/50">
                  One-minute demo
                </p>
                <p className="mt-1 text-sm font-semibold">
                  From bank statement to clean records
                </p>
              </div>
              <button
                ref={closeButtonRef}
                onClick={onClose}
                className="rounded-lg border border-white/20 p-2 text-white/80 transition hover:bg-white/10 hover:text-white"
                aria-label="Close demo"
              >
                <X size={20} />
              </button>
            </div>
            <video
              src="/landing-v2/guided-demo.mp4"
              className="max-h-[calc(100vh-9rem)] w-full bg-black object-contain"
              controls
              autoPlay
              muted
              playsInline
              tabIndex={0}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function LandingPage({
  onSignIn,
  onGetStarted,
  onBookDemo,
}: LandingPageProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const reduceMotion = useReducedMotion();
  const closeTour = useCallback(() => setTourOpen(false), []);

  const motionProps = reduceMotion
    ? {}
    : {
        initial: "hidden" as const,
        whileInView: "visible" as const,
        viewport: { once: true, amount: 0.18 },
        variants: reveal,
        transition: { duration: 0.65, ease: "easeOut" as const },
      };

  const selectPlan = (plan: PricingPlan["id"]) => {
    onGetStarted(plan);
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-paper text-ink selection:bg-amber-light selection:text-amber-dark">
      <TourModal open={tourOpen} onClose={closeTour} />

      <header className="fixed inset-x-0 top-0 z-50 border-b border-ledger bg-paper/95 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-5 sm:px-8">
          <a href="#top" aria-label="ChurchCoin home">
            <Logo />
          </a>

          <nav className="hidden items-center gap-8 lg:flex" aria-label="Main navigation">
            {navigation.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-sm font-medium text-grey-dark transition-colors hover:text-amber-dark"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="hidden items-center gap-3 sm:flex">
            <button
              onClick={onSignIn}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-grey-dark transition hover:bg-white hover:text-ink"
            >
              Sign in
            </button>
            <button
              onClick={() => onGetStarted()}
              className="btn-primary px-5 py-2.5 text-sm font-semibold"
            >
              Start free
            </button>
          </div>

          <button
            onClick={() => setMenuOpen((value) => !value)}
            className="rounded-lg border border-ledger bg-white p-2.5 text-ink sm:hidden"
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden border-t border-ledger bg-paper sm:hidden"
            >
              <nav className="space-y-1 px-5 py-5" aria-label="Mobile navigation">
                {navigation.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className="block rounded-lg px-3 py-3 text-sm font-semibold text-grey-dark hover:bg-white hover:text-ink"
                  >
                    {item.label}
                  </a>
                ))}
                <div className="grid grid-cols-2 gap-3 pt-4">
                  <button onClick={onSignIn} className="btn-outline px-4 py-3 text-sm font-semibold">
                    Sign in
                  </button>
                  <button
                    onClick={() => onGetStarted()}
                    className="btn-primary px-4 py-3 text-sm font-semibold"
                  >
                    Start free
                  </button>
                </div>
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main>
        <section id="top" className="relative overflow-hidden pb-20 pt-32 sm:pb-24 sm:pt-36 lg:pb-20 lg:pt-32">
          <div
            className="pointer-events-none absolute inset-0 opacity-60 ledger-grid-bg [mask-image:linear-gradient(to_bottom,black,transparent_85%)]"
            aria-hidden="true"
          />
          <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 sm:px-8 lg:grid-cols-[0.88fr_1.12fr] lg:gap-12 xl:gap-16">
            <div className="max-w-2xl text-left">
              <motion.h1
                initial={reduceMotion ? undefined : { opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
                className="text-balance text-[3rem] font-bold leading-[0.98] tracking-[-0.055em] text-ink sm:text-6xl lg:text-[3.65rem] xl:text-[4.3rem]"
              >
                Stop chasing spreadsheets. Start growing <span className="relative whitespace-nowrap text-sage">ministry.</span>
              </motion.h1>

              <motion.p
                initial={reduceMotion ? undefined : { opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.65, delay: 0.2 }}
                className="mt-7 max-w-xl text-lg leading-8 text-grey-dark sm:text-xl sm:leading-9"
              >
                ChurchCoin sorts every bank transaction into the right fund and category,
                keeps restricted funds restricted, and has your year-end figures ready — so
                the church&apos;s time goes into the church, not the books.
              </motion.p>

              <motion.div
                initial={reduceMotion ? undefined : { opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
                className="mt-9 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center"
              >
                <button
                  onClick={() => onGetStarted()}
                  className="btn-primary group inline-flex min-h-12 shrink-0 items-center justify-center gap-2 whitespace-nowrap px-5 py-3.5 font-semibold"
                >
                  Start free
                  <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" />
                </button>
                <button
                  onClick={() => setTourOpen(true)}
                  className="btn-outline inline-flex min-h-12 items-center justify-center gap-2 whitespace-nowrap px-5 py-3.5 font-semibold"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-light text-amber-dark">
                    <Play size={13} fill="currentColor" />
                  </span>
                  Watch the 1-minute demo
                </button>
              </motion.div>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.42 }}
                className="mt-5 text-sm text-grey-mid"
              >
                Built for UK churches. Restricted funds, Gift Aid and year-end reporting handled properly.
              </motion.p>
            </div>

            <HeroProductPreview />
          </div>
        </section>

        <section className="border-y border-ledger bg-white py-20 sm:py-24">
          <motion.div {...motionProps} className="mx-auto max-w-4xl px-5 sm:px-8">
            <SectionLabel>The reality</SectionLabel>
            <h2 className="text-balance text-4xl font-bold tracking-[-0.04em] sm:text-5xl">
              You didn&apos;t sign up to be an accountant.
            </h2>
            <div className="mt-8 grid gap-6 text-base leading-7 text-grey-dark sm:text-lg sm:leading-8">
              <p>
                Most UK church treasurers are volunteers. Every month: download the statement,
                work through hundreds of transactions, match each one to the right fund,
                reconcile, repeat. Then at year end, turn twelve months of that into accounts
                and an annual return — restricted funds correct, Gift Aid claimed properly.
              </p>
              <p>
                It&apos;s hours of careful, unpaid work — and it&apos;s regulated charity money,
                filed under the church&apos;s name.
              </p>
              <p>
                The tools haven&apos;t helped: a spreadsheet, software built for businesses, or
                a church package designed twenty years ago.
              </p>
            </div>
          </motion.div>
        </section>

        <section id="how" className="py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <motion.div {...motionProps} className="max-w-3xl">
              <SectionLabel>How it works</SectionLabel>
              <h2 className="text-balance text-4xl font-bold tracking-[-0.04em] sm:text-5xl lg:text-6xl">
                Four things that used to take an evening.
              </h2>
            </motion.div>

            <div className="mt-20 space-y-24 sm:space-y-32">
              <motion.article {...motionProps} className="grid items-center gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:gap-16">
                <div>
                  <span className="font-mono text-xs font-semibold tracking-[0.14em] text-amber">01</span>
                  <h3 className="mt-4 text-3xl font-bold tracking-[-0.035em]">Transactions sort themselves</h3>
                  <div className="mt-6 space-y-4 text-base leading-7 text-grey-dark">
                    <p>
                      Connect your church bank account and transactions arrive already categorised — each with a suggested fund and category, and the reason behind it. Prefer to import statements instead? That works too.
                    </p>
                    <p>
                      You approve. Nothing goes on the books until you do, and anything ChurchCoin isn&apos;t confident about is flagged for you to check rather than guessed at.
                    </p>
                    <p className="font-semibold text-ink">Correct it once and it remembers.</p>
                  </div>
                </div>
                <ScreenshotFrame
                  videoSrc="/landing-v2/transaction-live-15-35.mp4"
                  poster="/landing-v2/transaction-live-15-35-poster.webp"
                  alt="ChurchCoin transaction workflow showing church payments being reviewed, categorised and approved"
                  label="Transactions · Review in motion"
                />
              </motion.article>

              <motion.article {...motionProps} className="grid items-center gap-10 lg:grid-cols-[1.18fr_0.82fr] lg:gap-16">
                <ScreenshotFrame
                  alt="ChurchCoin Funds and Balances page showing restricted, designated and unrestricted balances"
                  label="Funds & balances · At a glance"
                  className="lg:order-1"
                >
                  <FundsPreview />
                </ScreenshotFrame>
                <div className="lg:order-2">
                  <span className="font-mono text-xs font-semibold tracking-[0.14em] text-amber">02</span>
                  <h3 className="mt-4 text-3xl font-bold tracking-[-0.035em]">Restricted funds stay restricted</h3>
                  <div className="mt-6 space-y-4 text-base leading-7 text-grey-dark">
                    <p>
                      Every designated gift is tracked against the fund it was given to, so you always know what&apos;s genuinely available to spend.
                    </p>
                    <p>
                      Building appeal, youth work, general fund — each with its own balance, visible at a glance instead of buried in a separate tab of a spreadsheet.
                    </p>
                  </div>
                </div>
              </motion.article>

              <motion.article {...motionProps} className="grid items-center gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:gap-16">
                <div>
                  <span className="font-mono text-xs font-semibold tracking-[0.14em] text-amber">03</span>
                  <h3 className="mt-4 text-3xl font-bold tracking-[-0.035em]">Giving and Gift Aid in one place</h3>
                  <p className="mt-6 text-base leading-7 text-grey-dark">
                    Regular donors, one-off gifts and campaign contributions all sit together. Annual giving statements come from the system, and Gift Aid claims are prepared from the records you already have — not rebuilt from scratch each January.
                  </p>
                </div>
                <ScreenshotFrame
                  src="/landing-v2/donors-content.webp"
                  alt="ChurchCoin donor record showing Gift Aid status and giving history"
                  label="Donors · Giving history"
                />
              </motion.article>

              <motion.article {...motionProps} className="grid items-center gap-10 lg:grid-cols-[1.18fr_0.82fr] lg:gap-16">
                <ScreenshotFrame
                  src="/landing-v2/reports-content.webp"
                  alt="ChurchCoin monthly report showing income, expenditure, net bankable amount and Gift Aid summary"
                  label="Reports · Monthly accounts"
                  className="lg:order-1"
                />
                <div className="lg:order-2">
                  <span className="font-mono text-xs font-semibold tracking-[0.14em] text-amber">04</span>
                  <h3 className="mt-4 text-3xl font-bold tracking-[-0.035em]">Year-end figures, ready when you are</h3>
                  <div className="mt-6 space-y-4 text-base leading-7 text-grey-dark">
                    <p>
                      When it&apos;s time for the annual return, the numbers are already there: fund balances, income and expenditure, a year of approved transactions behind every figure.
                    </p>
                    <p>
                      You (or your independent examiner) work from clean records — not a fortnight of evenings reconstructing them.
                    </p>
                  </div>
                </div>
              </motion.article>
            </div>
          </div>
        </section>

        <section id="trust" className="relative overflow-hidden bg-ink py-24 text-white sm:py-32">
          <div className="absolute inset-0 ledger-grid-bg opacity-[0.045]" aria-hidden="true" />
          <motion.div {...motionProps} className="relative mx-auto grid max-w-6xl gap-12 px-5 sm:px-8 lg:grid-cols-[0.7fr_1.3fr] lg:gap-20">
            <div>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-sage-light">
                <ShieldCheck size={28} strokeWidth={1.7} />
              </div>
              <p className="mt-7 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-light">Why trust it</p>
              <h2 className="mt-4 text-4xl font-bold tracking-[-0.04em] sm:text-5xl">Careful by design.</h2>
            </div>
            <div className="space-y-5 text-lg leading-8 text-white/70">
              <p>ChurchCoin uses AI to do the sorting — and that only works if you can trust it.</p>
              <p>
                So it&apos;s built the other way round from most AI tools. <strong className="font-semibold text-white">The system suggests. You approve.</strong> Nothing posts to your books automatically, ever.
              </p>
              <p>
                Every suggestion shows where it came from and how confident it is. When it isn&apos;t sure, it says so and asks you — because in church finance, a wrong guess is worse than no guess.
              </p>
              <div className="mt-8 flex items-start gap-3 rounded-xl border border-sage/30 bg-sage/10 p-5 text-base text-sage-light">
                <Check className="mt-0.5 shrink-0" size={19} />
                <p>ChurchCoin works from your bank statements — it never has access to move money from your account.</p>
              </div>
            </div>
          </motion.div>
        </section>

        <section id="pricing" className="border-b border-ledger bg-white py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <motion.div {...motionProps} className="mx-auto max-w-3xl text-center">
              <SectionLabel>Pricing</SectionLabel>
              <h2 className="text-balance text-4xl font-bold tracking-[-0.04em] sm:text-5xl">Priced for churches, not corporates.</h2>
              <p className="mt-5 text-lg text-grey-dark">Start free. No card required.</p>
            </motion.div>

            <motion.div {...motionProps} className="mx-auto mt-14 grid max-w-5xl gap-5 md:grid-cols-3">
              {pricingPlans.map((plan) => (
                <article
                  key={plan.id}
                  className={`relative flex min-h-[430px] flex-col rounded-2xl border p-6 transition duration-200 hover:-translate-y-1 hover:shadow-soft-md ${
                    plan.featured
                      ? "border-amber bg-amber-light/45 ring-1 ring-amber/20"
                      : "border-ledger bg-white"
                  }`}
                >
                  {plan.featured && (
                    <span className="absolute right-5 top-5 rounded-full bg-ink px-3 py-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-white">
                      Most popular
                    </span>
                  )}
                  <h3 className="text-xl font-bold">{plan.name}</h3>
                  <div className="mt-7 flex items-end gap-1.5">
                    <span className="font-mono text-4xl font-bold tracking-[-0.05em]">{plan.price}</span>
                    <span className="pb-1 text-sm text-grey-mid">/month</span>
                  </div>
                  <p className="mt-4 min-h-12 text-sm leading-6 text-grey-dark">{plan.description}</p>
                  <ul className="mt-7 space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5 text-sm text-grey-dark">
                        <Check size={16} className="mt-0.5 shrink-0 text-sage" strokeWidth={2.4} />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => selectPlan(plan.id)}
                    className={`mt-auto min-h-11 rounded-lg px-4 py-3 text-sm font-semibold transition ${
                      plan.featured
                        ? "bg-ink text-white hover:bg-charcoal"
                        : "border border-ledger bg-white text-ink hover:border-ink"
                    }`}
                  >
                    Choose {plan.name}
                  </button>
                </article>
              ))}
            </motion.div>
            <p className="mt-7 text-center text-xs text-grey-mid">Paid plans billed monthly. Cancel at any time.</p>
          </div>
        </section>

        <section id="faq" className="py-24 sm:py-32">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 sm:px-8 lg:grid-cols-[0.65fr_1.35fr] lg:gap-20">
            <motion.div {...motionProps}>
              <SectionLabel>Questions</SectionLabel>
              <h2 className="text-4xl font-bold tracking-[-0.04em] sm:text-5xl">A straight answer.</h2>
              <p className="mt-5 max-w-sm leading-7 text-grey-dark">
                The practical details treasurers and trustees usually want to know first.
              </p>
            </motion.div>
            <motion.div {...motionProps} className="divide-y divide-ledger border-y border-ledger">
              {faqs.map((item, index) => {
                const isOpen = openFaq === index;
                return (
                  <div key={item.question}>
                    <button
                      onClick={() => setOpenFaq(isOpen ? null : index)}
                      className="flex w-full items-center justify-between gap-5 py-6 text-left font-semibold text-ink"
                      aria-expanded={isOpen}
                    >
                      <span>{item.question}</span>
                      <ChevronDown
                        size={19}
                        className={`shrink-0 text-grey-mid transition-transform ${isOpen ? "rotate-180" : ""}`}
                      />
                    </button>
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.22 }}
                          className="overflow-hidden"
                        >
                          <p className="max-w-2xl pb-6 pr-10 leading-7 text-grey-dark">{item.answer}</p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </motion.div>
          </div>
        </section>

        <section className="px-5 pb-24 sm:px-8 sm:pb-32">
          <motion.div
            {...motionProps}
            className="relative mx-auto max-w-7xl overflow-hidden rounded-3xl bg-amber-light px-6 py-16 text-center ring-1 ring-amber/20 sm:px-12 sm:py-20"
          >
            <div className="absolute inset-0 ledger-grid-bg opacity-40" aria-hidden="true" />
            <div className="relative mx-auto max-w-3xl">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-dark">Ready when you are</p>
              <h2 className="mt-5 text-4xl font-bold tracking-[-0.045em] sm:text-5xl lg:text-6xl">Get your evenings back.</h2>
              <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-grey-dark">
                Set up takes about ten minutes. Start free and see your own transactions sorted before you decide anything.
              </p>
              <button
                onClick={() => onGetStarted()}
                className="btn-primary group mt-9 inline-flex min-h-12 items-center justify-center gap-2 px-7 py-3.5 font-semibold"
              >
                Start free
                <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
          </motion.div>
        </section>
      </main>

      <footer className="bg-ink px-5 py-12 text-white sm:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-10 border-b border-white/10 pb-10 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <Logo light />
              <p className="mt-4 max-w-md text-sm leading-6 text-white/55">
                Calm, careful church finance software for the people who volunteer to keep the books straight.
              </p>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-white/65">
              <a href="#how" className="hover:text-white">How it works</a>
              <a href="#pricing" className="hover:text-white">Pricing</a>
              <button onClick={onBookDemo} className="hover:text-white">Book a demo</button>
              <a href="/privacy" className="hover:text-white">Privacy</a>
              <a href="/terms" className="hover:text-white">Terms</a>
            </div>
          </div>
          <div className="flex flex-col gap-3 pt-7 text-xs text-white/40 sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} ChurchCoin. All rights reserved.</p>
            <p className="font-mono uppercase tracking-[0.1em]">Built for UK churches</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
