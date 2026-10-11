import "dotenv/config";
import { eq } from "drizzle-orm";
import { SECTIONS, type SectionType } from "../sections/registry";
import { db } from "./index";
import {
  competitionLevels,
  competitions,
  eventSections,
  events,
  formFields,
  orders,
  sponsorTiers,
  ticketTypes,
} from "./schema";

/**
 * Sample events. Details that were not supplied (exact dates, venues, and
 * for the marathon the name, prices and timings) are placeholders: edit them
 * in Admin > Events.
 */
const SLUG = "rynox-ranchi-2026";
const MARATHON_SLUG = "first-light-marathon-2027";

const img = (id: string, w = 1600) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=70`;

/** Removes an event so it can be rebuilt. Returns false when it has registrations. */
async function clear(slug: string) {
  const [existing] = await db.select().from(events).where(eq(events.slug, slug));
  if (!existing) return true;
  const [order] = await db.select().from(orders).where(eq(orders.eventId, existing.id)).limit(1);
  if (order) {
    console.log(`"${existing.title}" already has registrations, leaving it untouched.`);
    return false;
  }
  await db.delete(events).where(eq(events.id, existing.id));
  return true;
}

async function addSections(eventId: string, sections: [SectionType, Record<string, unknown>][]) {
  await db.insert(eventSections).values(
    sections.map(([type, content], i) => ({
      eventId,
      type,
      sortOrder: i,
      content: SECTIONS[type].schema.parse(content) as Record<string, unknown>,
    })),
  );
}

type CompetitionSeed = {
  name: string;
  description: string;
  /** In order. Entrants must qualify from each level to reach the next. */
  levels: { name: string; description: string }[];
  /** Names of the event's ticket types that enter this competition. */
  ticketTypes: string[];
};

/**
 * Adds competitions to an event that has none. Safe to run on an event that
 * already has registrations: nothing existing is changed or removed.
 */
async function ensureCompetitions(slug: string, defs: CompetitionSeed[]) {
  const [event] = await db.select().from(events).where(eq(events.slug, slug));
  if (!event) return;
  const [existing] = await db.select().from(competitions).where(eq(competitions.eventId, event.id)).limit(1);
  if (existing) return;
  const types = await db.select().from(ticketTypes).where(eq(ticketTypes.eventId, event.id));
  for (const [i, def] of defs.entries()) {
    const [competition] = await db
      .insert(competitions)
      .values({ eventId: event.id, name: def.name, description: def.description, sortOrder: i })
      .returning();
    if (def.levels.length) {
      await db.insert(competitionLevels).values(
        def.levels.map((l, n) => ({ competitionId: competition.id, sortOrder: n, ...l })),
      );
    }
    for (const type of types.filter((t) => def.ticketTypes.includes(t.name))) {
      await db.update(ticketTypes).set({ competitionId: competition.id }).where(eq(ticketTypes.id, type.id));
    }
  }
  console.log(`Added ${defs.length} competition(s) to "${event.title}"`);
}

/**
 * Sponsorship levels for an event that has none. The level names and their
 * limits are placeholders; amounts are left as "on request".
 */
async function ensureSponsorTiers(slug: string) {
  const [event] = await db.select().from(events).where(eq(events.slug, slug));
  if (!event) return;
  const [existing] = await db.select().from(sponsorTiers).where(eq(sponsorTiers.eventId, event.id)).limit(1);
  if (existing) return;
  await db.insert(sponsorTiers).values([
    {
      eventId: event.id,
      sortOrder: 0,
      name: "Title sponsor",
      slots: 1,
      showInHero: true,
      benefits: "Named in the event page hero\nEvent branding\nProduct integration\nOn-ground activation\nPhoto and video visibility\nSocial media promotion",
    },
    {
      eventId: event.id,
      sortOrder: 1,
      name: "Powered by",
      slots: 3,
      showInHero: true,
      benefits: "Logo in the event page hero\nEvent branding\nOn-ground activation\nSocial media promotion",
    },
    {
      eventId: event.id,
      sortOrder: 2,
      name: "Associate partner",
      slots: null,
      showInHero: false,
      benefits: "Logo in the sponsors section\nAthlete and audience exposure\nSocial media promotion",
    },
  ]);
  console.log(`Added sponsorship levels to "${event.title}"`);
}

/** Level-wise: one competition, and every athlete works through its levels in order. */
const RYNOX_COMPETITIONS: CompetitionSeed[] = [
  {
    name: "RYNOX Challenge",
    description: "One course. Complete each stage to move on to the next.",
    levels: [
      { name: "Run", description: "800 m per round for men, 400 m for women." },
      { name: "Sandbag", description: "Five sandbag efforts." },
      { name: "Farmer walk", description: "Five loaded carries." },
      { name: "Tyre flip", description: "Five tyre flips." },
      { name: "Crawl", description: "The crawl to the finish." },
    ],
    ticketTypes: ["Men", "Women"],
  },
];

/** Separate: four competitions entered independently, each a straight race. */
const MARATHON_COMPETITIONS: CompetitionSeed[] = [
  ["Full Marathon", "42.195 km. Starts 4:30 AM.", "Full Marathon · 42.195 km"],
  ["Half Marathon", "21.1 km. Starts 5:30 AM.", "Half Marathon · 21.1 km"],
  ["10K Run", "10 km. Starts 6:30 AM.", "10K Run"],
  ["5K Fun Run", "5 km. Starts 7:15 AM.", "5K Fun Run"],
].map(([name, description, type]) => ({
  name,
  description,
  levels: [{ name: "Race", description: "Cross the finish line inside the cut-off." }],
  ticketTypes: [type],
}));

/**
 * A running festival of independent races. Unlike RYNOX, where every athlete
 * works through the same stations in order, each distance here is its own
 * race with its own start time, price and seats: runners enter whichever
 * ones they want.
 */
async function seedMarathon() {
  if (!(await clear(MARATHON_SLUG))) return;

  const startsAt = new Date("2026-12-31T23:00:00Z"); // 1 Jan 2027, 4:30 AM IST
  const [event] = await db
    .insert(events)
    .values({
      slug: MARATHON_SLUG,
      title: "First Light Marathon",
      tagline: "5K • 10K • Half • Full",
      summary:
        "Start the year running. Four separate road races through Bhubaneswar on New Year's morning: pick the distance that suits you, or enter more than one.",
      coverImageUrl: img("1594882645126-14020914d58d", 2400),
      accentColor: "#f5b800",
      venueName: "Kalinga Stadium",
      city: "Bhubaneswar",
      startsAt,
      endsAt: new Date("2027-01-01T05:30:00Z"), // 11:00 AM IST
      registrationClosesAt: new Date("2026-12-28T18:29:00Z"),
      maxTicketsPerOrder: 6,
      status: "PUBLISHED",
    })
    .returning();

  await db.insert(ticketTypes).values([
    { eventId: event.id, sortOrder: 0, name: "Full Marathon · 42.195 km", description: "Starts 4:30 AM. Cut-off 6 hours 30 minutes.", pricePaise: 180_000, quota: 300 },
    { eventId: event.id, sortOrder: 1, name: "Half Marathon · 21.1 km", description: "Starts 5:30 AM. Cut-off 3 hours 30 minutes.", pricePaise: 140_000, quota: 600 },
    { eventId: event.id, sortOrder: 2, name: "10K Run", description: "Starts 6:30 AM. Cut-off 1 hour 45 minutes.", pricePaise: 90_000, quota: 1000 },
    { eventId: event.id, sortOrder: 3, name: "5K Fun Run", description: "Starts 7:15 AM. Untimed, all ages welcome.", pricePaise: 50_000, quota: 1500 },
  ]);

  await db.insert(formFields).values([
    { eventId: event.id, sortOrder: 0, key: "dob", label: "Date of birth (DD/MM/YYYY)", type: "TEXT", required: true },
    { eventId: event.id, sortOrder: 1, key: "gender", label: "Gender", type: "SELECT", options: ["Female", "Male", "Other"], required: true },
    { eventId: event.id, sortOrder: 2, key: "tshirt", label: "T-shirt size", type: "SELECT", options: ["XS", "S", "M", "L", "XL", "XXL"], required: true },
    { eventId: event.id, sortOrder: 3, key: "emergency_contact", label: "Emergency contact number", type: "TEXT", required: true },
    { eventId: event.id, sortOrder: 4, key: "medical", label: "Medical conditions we should know about", type: "TEXTAREA", required: false },
    { eventId: event.id, sortOrder: 5, key: "waiver", label: "I am fit to run and accept the participation waiver", type: "CHECKBOX", required: true },
  ]);

  await addSections(event.id, [
    [
      "cards",
      {
        heading: "Four races, one morning",
        cards: [
          { imageUrl: img("1486218119243-13883505764c", 900), title: "Full Marathon", subtitle: "42.195 km · 4:30 AM" },
          { imageUrl: img("1552674605-db6ffd4facb5", 900), title: "Half Marathon", subtitle: "21.1 km · 5:30 AM" },
          { imageUrl: img("1461896836934-ffe607ba8211", 900), title: "10K Run", subtitle: "10 km · 6:30 AM" },
          { imageUrl: img("1476480862126-209bfaa8edc8", 900), title: "5K Fun Run", subtitle: "5 km · 7:15 AM" },
        ],
      },
    ],
    ["countdown", { label: "Countdown to the first start", target: "start" }],
    [
      "richtext",
      {
        heading: "Pick your race",
        body: "First Light is a running festival, not a single course. Each distance is its **own race**, with its own start time, its own field and its own finish.\n\nYou do not have to finish one to enter another. Register for the one distance you have trained for, or add more than one race to the same order if you want a bigger morning: the 5K Fun Run starts late enough to jog after a 10K.\n\nEvery race starts and finishes at the same venue, so friends and family running different distances can meet at one finish line.",
      },
    ],
    [
      "stats",
      {
        heading: "",
        items: [
          { value: "4", label: "Separate races" },
          { value: "42.195 KM", label: "Longest distance" },
          { value: "5 KM", label: "Shortest distance" },
          { value: "1 JAN", label: "New Year's morning" },
        ],
      },
    ],
    [
      "schedule",
      {
        heading: "Race morning",
        items: [
          { time: "3:30 AM", title: "Venue opens", description: "Bag drop and warm-up area open." },
          { time: "4:30 AM", title: "Full Marathon start", description: "42.195 km." },
          { time: "5:30 AM", title: "Half Marathon start", description: "21.1 km." },
          { time: "6:30 AM", title: "10K Run start", description: "" },
          { time: "7:15 AM", title: "5K Fun Run start", description: "Untimed. Walkers welcome." },
          { time: "9:30 AM", title: "Prize ceremony", description: "" },
          { time: "11:00 AM", title: "Course closes", description: "" },
        ],
      },
    ],
    [
      "highlights",
      {
        heading: "Every runner gets",
        intro: "",
        items: [
          { title: "Race bib", description: "With a timing chip for the Full, Half and 10K." },
          { title: "Finisher medal", description: "For everyone who crosses the line, in every race." },
          { title: "Race T-shirt", description: "In the size you choose when registering." },
          { title: "Aid stations", description: "Water and electrolytes along the course." },
          { title: "Medical support", description: "On the course and at the finish." },
          { title: "Timing certificate", description: "Emailed after the results are published." },
        ],
      },
    ],
    [
      "tickets",
      {
        heading: "Register for a race",
        note: "Each race is a separate entry. To run more than one, add a ticket for each race in the same order.",
      },
    ],
    [
      "steps",
      {
        heading: "How it works",
        intro: "",
        items: [
          { title: "Choose your race", description: "One distance, or several. Each has its own start time and seats." },
          { title: "Register and pay", description: "Fill in the runner's details and pay online." },
          { title: "Get your QR ticket", description: "One ticket per race, emailed and saved under My tickets." },
          { title: "Collect your bib and run", description: "Show the QR code at bib collection, then line up for your start." },
        ],
      },
    ],
    [
      "faq",
      {
        heading: "Questions",
        items: [
          { question: "Can I enter more than one race?", answer: "Yes. Each race is separate. Add a ticket for each race you want to run and enter the same runner's details on each one. Check the start times first so they do not overlap." },
          { question: "Do I have to run the shorter races to enter the longer ones?", answer: "No. The races are independent. Enter whichever distance you like." },
          { question: "Can I register my family in one go?", answer: "Yes. Add a ticket for each runner in the same order and pay once. Everyone gets their own QR ticket." },
          { question: "What do I need on race morning?", answer: "Your QR ticket, on your phone or printed, and a photo ID to collect your bib." },
        ],
      },
    ],
    [
      "cta",
      {
        heading: "Start the year running",
        text: "Registration closes on 28 December, or when a race fills up.",
        buttonLabel: "Register now",
        buttonUrl: "",
      },
    ],
  ]);
  console.log(`Seeded sample event: /events/${MARATHON_SLUG}`);
}

async function main() {
  await clear("iron-mile-2027");
  await seedMarathon();
  await seedRynox();
  await ensureCompetitions(SLUG, RYNOX_COMPETITIONS);
  await ensureCompetitions(MARATHON_SLUG, MARATHON_COMPETITIONS);
  await ensureSponsorTiers(SLUG);
  await ensureSponsorTiers(MARATHON_SLUG);
}

async function seedRynox() {
  if (!(await clear(SLUG))) return;

  // Placeholder date: the deck only says "December 2026". 6:00 AM IST.
  const startsAt = new Date("2026-12-20T00:30:00Z");
  const [event] = await db
    .insert(events)
    .values({
      slug: SLUG,
      title: "RYNOX",
      tagline: "Run • Lift • Carry • Flip • Crawl",
      summary:
        "Test your limits. RYNOX is a HYROX-inspired functional fitness challenge: one course that combines running with functional stations, raced against the clock.",
      coverImageUrl:
        "https://images.unsplash.com/photo-1552674605-db6ffd4facb5?auto=format&fit=crop&w=2400&q=70",
      accentColor: "#dc1e2d",
      venueName: "Venue to be announced",
      city: "Ranchi",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 10 * 3_600_000),
      maxTicketsPerOrder: 4,
      status: "PUBLISHED",
    })
    .returning();

  await db.insert(ticketTypes).values([
    {
      eventId: event.id,
      sortOrder: 0,
      name: "Men",
      description: "800 m × 5 (4 km total) with sandbag, farmer walk, tyre flips and crawl.",
      pricePaise: 250_000,
      offlinePricePaise: 300_000,
    },
    {
      eventId: event.id,
      sortOrder: 1,
      name: "Women",
      description: "400 m × 5 (2 km total) with sandbag, farmer walk, small tyre flips and crawl.",
      pricePaise: 250_000,
      offlinePricePaise: 300_000,
    },
  ]);

  await db.insert(formFields).values([
    { eventId: event.id, sortOrder: 0, key: "tshirt", label: "T-shirt size", type: "SELECT", options: ["S", "M", "L", "XL"], required: true },
    { eventId: event.id, sortOrder: 1, key: "emergency_contact", label: "Emergency contact number", type: "TEXT", required: true },
    { eventId: event.id, sortOrder: 2, key: "background", label: "Your fitness background", type: "SELECT", options: ["Gym athlete", "Functional fitness", "Runner", "Powerlifter", "Sports athlete", "Fitness enthusiast", "College student", "Other"], required: false },
    { eventId: event.id, sortOrder: 3, key: "medical", label: "Medical conditions we should know about", type: "TEXTAREA", required: false },
    { eventId: event.id, sortOrder: 4, key: "waiver", label: "I am fit to take part and accept the participation waiver", type: "CHECKBOX", required: true },
  ]);

  const sections: [SectionType, Record<string, unknown>][] = [
    ["countdown", { label: "Countdown to RYNOX", target: "start" }],
    [
      "richtext",
      {
        heading: "What is RYNOX?",
        body: "RYNOX is a high-intensity functional fitness event designed to test the complete athlete.\n\nThe event combines running with functional stations to create a fast, demanding race experience. It is **fast, simple and spectator-friendly**: a competition where different fitness backgrounds meet on the same course.",
      },
    ],
    [
      "highlights",
      {
        heading: "Four things it tests",
        intro: "",
        items: [
          { title: "Strength", description: "Move heavy. Stay strong." },
          { title: "Endurance", description: "Keep moving under fatigue." },
          { title: "Speed", description: "Race against the clock." },
          { title: "Grit", description: "Finish when your body says stop." },
        ],
      },
    ],
    [
      "steps",
      {
        heading: "One course. Multiple tests.",
        intro: "Five rounds of running, each followed by a functional station.",
        items: [
          { title: "Run", description: "800 m per round for men, 400 m per round for women." },
          { title: "Sandbag", description: "Five sandbag efforts." },
          { title: "Farmer walk", description: "Five loaded carries." },
          { title: "Tyre flip", description: "Five tyre flips. Women flip a smaller tyre." },
          { title: "Crawl", description: "The crawl to finish the course." },
        ],
      },
    ],
    [
      "stats",
      {
        heading: "Race format",
        items: [
          { value: "4 KM", label: "Men · 800 m × 5" },
          { value: "2 KM", label: "Women · 400 m × 5" },
          { value: "5", label: "Tests on the course" },
          { value: "₹30,600", label: "Total cash prize" },
        ],
      },
    ],
    [
      "richtext",
      {
        heading: "Men & women",
        body: "### Men\n\n- 800 m × 5 — total run 4 km\n- 5 × Sandbag\n- 5 × Farmer walk\n- 5 × Tyre flips\n- Crawling\n\n### Women\n\n- 400 m × 5 — total run 2 km\n- 5 × Sandbag\n- 5 × Farmer walk\n- 5 × Small tyre flips\n- Crawling",
      },
    ],
    [
      "highlights",
      {
        heading: "Who is RYNOX for?",
        intro: "Built for people who want to test themselves.",
        items: [
          { title: "Gym athletes", description: "" },
          { title: "Functional fitness athletes", description: "" },
          { title: "Runners", description: "" },
          { title: "Powerlifters", description: "" },
          { title: "Sports athletes", description: "" },
          { title: "Fitness enthusiasts", description: "" },
          { title: "College students", description: "" },
          { title: "Challenge seekers", description: "" },
        ],
      },
    ],
    [
      "prizes",
      {
        heading: "Cash prizes + sponsor goodies",
        note: "₹30,600 total cash prize, plus TGD and sponsor goodies. Prize structure as per the current event plan.",
        items: [
          { place: "1st", amount: "₹7,100", description: "" },
          { place: "2nd", amount: "₹5,100", description: "" },
          { place: "3rd", amount: "₹3,100", description: "" },
        ],
      },
    ],
    [
      "tickets",
      {
        heading: "Enter the challenge",
        note: "Limited slots. Register online for ₹2,500, or offline with the organisers for ₹3,000.",
      },
    ],
    [
      "highlights",
      {
        heading: "More than a race",
        intro: "",
        items: [
          { title: "Athlete zone", description: "Registration, warm-up and recovery." },
          { title: "Competition arena", description: "Clearly marked stations and timed heats." },
          { title: "Spectator experience", description: "Music, announcements and crowd energy." },
          { title: "Brand experience", description: "Stalls, product activation and sampling." },
          { title: "Media", description: "Photography, videography and social content." },
          { title: "Safety", description: "Medical support, officials and course management." },
        ],
      },
    ],
    [
      "steps",
      {
        heading: "Built for a smooth race day",
        intro: "Proposed heat model. Final heat size and timing will be confirmed during event planning.",
        items: [
          { title: "About 20 athletes per heat", description: "You race in a timed heat." },
          { title: "5 per station", description: "Each heat is divided across the stations." },
          { title: "Rotate", description: "Athletes rotate through the course flow." },
          { title: "Finish", description: "You cross the line with a timed result." },
        ],
      },
    ],
    [
      "faq",
      {
        heading: "Questions",
        items: [
          { question: "How do I register?", answer: "Register and pay online on this page for ₹2,500. You can also register offline with the organisers for ₹3,000." },
          { question: "Where is my ticket?", answer: "Your QR ticket is emailed as soon as payment is confirmed, and it stays under **My tickets** on this site. Show it at the entrance." },
          { question: "Are the men's and women's courses the same?", answer: "The stations are the same. Men run 800 m per round (4 km in total) and women run 400 m per round (2 km in total), and women flip a smaller tyre." },
        ],
      },
    ],
    [
      "richtext",
      {
        heading: "Put your brand where the action is",
        body: "RYNOX aims to create a recurring fitness competition that brings athletes, brands and the community together.\n\n**Sponsor benefits**\n\n- Event branding\n- Athlete and audience exposure\n- Social media promotion\n- Product integration\n- On-ground activation\n- Photo and video visibility",
      },
    ],
    [
      "cta",
      {
        heading: "Test your limits.",
        text: "Limited slots. Ranchi, December 2026.",
        buttonLabel: "Register now",
        buttonUrl: "",
      },
    ],
  ];
  await addSections(event.id, sections);
  console.log(`Seeded sample event: /events/${SLUG}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
