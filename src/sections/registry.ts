import { z } from "zod";

/**
 * Landing-page sections. Each type declares its content schema, default
 * content and the fields the admin editor shows. Renderers live in
 * `render.tsx`; adding a section type means one entry here and one there.
 */

export type FieldDef =
  | {
      key: string;
      label: string;
      kind: "text" | "textarea" | "markdown" | "image" | "url";
      placeholder?: string;
      help?: string;
    }
  | { key: string; label: string; kind: "select"; options: { value: string; label: string }[] }
  | { key: string; label: string; kind: "boolean" }
  | { key: string; label: string; kind: "list"; itemLabel: string; fields: FieldDef[] };

export type SectionDef<T extends z.ZodType = z.ZodType> = {
  type: string;
  label: string;
  description: string;
  schema: T;
  defaults: z.input<T>;
  fields: FieldDef[];
};

const str = (max = 300) => z.string().trim().max(max).default("");
const long = () => z.string().trim().max(20_000).default("");

const cards = z.object({
  heading: str(),
  cards: z
    .array(z.object({ imageUrl: str(2000), title: str(), subtitle: str() }))
    .max(24)
    .default([]),
});

const countdown = z.object({
  label: str(),
  target: z.enum(["start", "registrationClose"]).default("start"),
});

const richtext = z.object({ heading: str(), body: long() });

const feature = z.object({
  eyebrow: str(),
  heading: str(),
  body: long(),
  imageUrl: str(2000),
  imageSide: z.enum(["left", "right"]).default("left"),
  buttonLabel: str(60),
  buttonUrl: str(2000),
});

const schedule = z.object({
  heading: str(),
  items: z
    .array(z.object({ time: str(60), title: str(), description: str(1000) }))
    .max(60)
    .default([]),
});

const ticketsSection = z.object({ heading: str(), note: str(500) });

const stats = z.object({
  heading: str(),
  items: z.array(z.object({ value: str(40), label: str(80) })).max(8).default([]),
});

const faq = z.object({
  heading: str(),
  items: z.array(z.object({ question: str(400), answer: long() })).max(40).default([]),
});

const gallery = z.object({
  heading: str(),
  images: z.array(z.object({ imageUrl: str(2000), caption: str() })).max(30).default([]),
});

const sponsors = z.object({
  heading: str(),
  logos: z
    .array(z.object({ imageUrl: str(2000), name: str(), url: str(2000) }))
    .max(40)
    .default([]),
});

const embed = z.object({ heading: str(), url: str(2000), caption: str(500) });

const steps = z.object({
  heading: str(),
  intro: str(600),
  items: z.array(z.object({ title: str(), description: str(600) })).max(8).default([]),
});

const highlights = z.object({
  heading: str(),
  intro: str(600),
  items: z.array(z.object({ title: str(), description: str(600) })).max(12).default([]),
});

const prizes = z.object({
  heading: str(),
  note: str(600),
  items: z
    .array(z.object({ place: str(60), amount: str(60), description: str(400) }))
    .max(12)
    .default([]),
});

const testimonials = z.object({
  heading: str(),
  items: z
    .array(z.object({ quote: str(800), name: str(120), role: str(160), imageUrl: str(2000) }))
    .max(12)
    .default([]),
});

const cta = z.object({
  heading: str(),
  text: str(600),
  buttonLabel: str(60),
  buttonUrl: str(2000),
});

export const SECTION_SCHEMAS = {
  cards,
  countdown,
  richtext,
  feature,
  schedule,
  tickets: ticketsSection,
  stats,
  faq,
  gallery,
  sponsors,
  embed,
  steps,
  highlights,
  prizes,
  testimonials,
  cta,
} as const;

export type SectionType = keyof typeof SECTION_SCHEMAS;
export type SectionContent<K extends SectionType> = z.output<(typeof SECTION_SCHEMAS)[K]>;

export const SECTIONS: { [K in SectionType]: SectionDef<(typeof SECTION_SCHEMAS)[K]> } = {
  cards: {
    type: "cards",
    label: "Card row",
    description: "Image cards for categories, disciplines, athletes, coaches or judges.",
    schema: cards,
    defaults: {
      heading: "Categories",
      cards: [
        { imageUrl: "", title: "10K Run", subtitle: "Open · Men & Women" },
        { imageUrl: "", title: "Deadlift", subtitle: "Weight classes" },
        { imageUrl: "", title: "Endurance Circuit", subtitle: "Teams of two" },
      ],
    },
    fields: [
      { key: "heading", label: "Heading", kind: "text" },
      {
        key: "cards",
        label: "Cards",
        kind: "list",
        itemLabel: "Card",
        fields: [
          { key: "imageUrl", label: "Image", kind: "image" },
          { key: "title", label: "Title", kind: "text" },
          { key: "subtitle", label: "Subtitle", kind: "text" },
        ],
      },
    ],
  },
  countdown: {
    type: "countdown",
    label: "Countdown",
    description: "A live timer to the start of the event or the registration deadline.",
    schema: countdown,
    defaults: { label: "Countdown to race day", target: "start" },
    fields: [
      { key: "label", label: "Label", kind: "text" },
      {
        key: "target",
        label: "Counts down to",
        kind: "select",
        options: [
          { value: "start", label: "Event start" },
          { value: "registrationClose", label: "Registration closing" },
        ],
      },
    ],
  },
  richtext: {
    type: "richtext",
    label: "Text",
    description: "A heading with formatted text. Use it for About, Rules or What to bring.",
    schema: richtext,
    defaults: {
      heading: "About the event",
      body: "Describe the event here. **Markdown** is supported: lists, links and bold text.",
    },
    fields: [
      { key: "heading", label: "Heading", kind: "text" },
      { key: "body", label: "Body", kind: "markdown" },
    ],
  },
  feature: {
    type: "feature",
    label: "Feature",
    description: "An image beside a heading, text and an optional button.",
    schema: feature,
    defaults: {
      eyebrow: "Train with us",
      heading: "Official warm-up sessions",
      body: "Join the community sessions in the weeks before the event.",
      imageUrl: "",
      imageSide: "left",
      buttonLabel: "",
      buttonUrl: "",
    },
    fields: [
      { key: "eyebrow", label: "Small label", kind: "text" },
      { key: "heading", label: "Heading", kind: "text" },
      { key: "body", label: "Text", kind: "markdown" },
      { key: "imageUrl", label: "Image", kind: "image" },
      {
        key: "imageSide",
        label: "Image position",
        kind: "select",
        options: [
          { value: "left", label: "Left" },
          { value: "right", label: "Right" },
        ],
      },
      { key: "buttonLabel", label: "Button label", kind: "text", help: "Leave empty for no button." },
      {
        key: "buttonUrl",
        label: "Button link",
        kind: "url",
        help: "Leave empty to link to registration.",
      },
    ],
  },
  schedule: {
    type: "schedule",
    label: "Schedule",
    description: "Timed rows for the day's programme.",
    schema: schedule,
    defaults: {
      heading: "Schedule",
      items: [
        { time: "6:00 AM", title: "Check-in opens", description: "Bib collection and warm-up." },
        { time: "7:00 AM", title: "First heat", description: "" },
      ],
    },
    fields: [
      { key: "heading", label: "Heading", kind: "text" },
      {
        key: "items",
        label: "Rows",
        kind: "list",
        itemLabel: "Row",
        fields: [
          { key: "time", label: "Time", kind: "text", placeholder: "6:00 AM" },
          { key: "title", label: "Title", kind: "text" },
          { key: "description", label: "Description", kind: "textarea" },
        ],
      },
    ],
  },
  tickets: {
    type: "tickets",
    label: "Tickets",
    description: "Live ticket types with price and seats left. Filled in automatically.",
    schema: ticketsSection,
    defaults: { heading: "Pick your category", note: "" },
    fields: [
      { key: "heading", label: "Heading", kind: "text" },
      { key: "note", label: "Note under the heading", kind: "textarea" },
    ],
  },
  stats: {
    type: "stats",
    label: "Stats",
    description: "Big numbers with short labels.",
    schema: stats,
    defaults: {
      heading: "",
      items: [
        { value: "10K", label: "Distance" },
        { value: "500", label: "Athletes" },
        { value: "₹2L", label: "Prize pool" },
      ],
    },
    fields: [
      { key: "heading", label: "Heading", kind: "text" },
      {
        key: "items",
        label: "Numbers",
        kind: "list",
        itemLabel: "Stat",
        fields: [
          { key: "value", label: "Value", kind: "text" },
          { key: "label", label: "Label", kind: "text" },
        ],
      },
    ],
  },
  faq: {
    type: "faq",
    label: "FAQ",
    description: "Questions and answers in an accordion.",
    schema: faq,
    defaults: {
      heading: "Questions",
      items: [
        {
          question: "Can I get a refund?",
          answer: "Contact the organiser. Refunds go back to the original payment method.",
        },
      ],
    },
    fields: [
      { key: "heading", label: "Heading", kind: "text" },
      {
        key: "items",
        label: "Questions",
        kind: "list",
        itemLabel: "Question",
        fields: [
          { key: "question", label: "Question", kind: "text" },
          { key: "answer", label: "Answer", kind: "markdown" },
        ],
      },
    ],
  },
  gallery: {
    type: "gallery",
    label: "Gallery",
    description: "A grid of photos.",
    schema: gallery,
    defaults: { heading: "Gallery", images: [] },
    fields: [
      { key: "heading", label: "Heading", kind: "text" },
      {
        key: "images",
        label: "Photos",
        kind: "list",
        itemLabel: "Photo",
        fields: [
          { key: "imageUrl", label: "Image", kind: "image" },
          { key: "caption", label: "Caption", kind: "text" },
        ],
      },
    ],
  },
  sponsors: {
    type: "sponsors",
    label: "Sponsors",
    description: "A row of partner logos.",
    schema: sponsors,
    defaults: { heading: "Partners", logos: [] },
    fields: [
      { key: "heading", label: "Heading", kind: "text" },
      {
        key: "logos",
        label: "Logos",
        kind: "list",
        itemLabel: "Logo",
        fields: [
          { key: "imageUrl", label: "Logo image", kind: "image" },
          { key: "name", label: "Name", kind: "text" },
          { key: "url", label: "Link", kind: "url" },
        ],
      },
    ],
  },
  embed: {
    type: "embed",
    label: "Video or map",
    description: "A YouTube video or a Google Maps embed.",
    schema: embed,
    defaults: { heading: "", url: "", caption: "" },
    fields: [
      { key: "heading", label: "Heading", kind: "text" },
      {
        key: "url",
        label: "YouTube or Google Maps link",
        kind: "url",
        help: "For maps, use Share > Embed a map and paste the src link.",
      },
      { key: "caption", label: "Caption", kind: "text" },
    ],
  },
  steps: {
    type: "steps",
    label: "Steps",
    description: "Numbered steps, for example how the competition or registration works.",
    schema: steps,
    defaults: {
      heading: "How it works",
      intro: "",
      items: [
        { title: "Pick your category", description: "Choose the division that matches you." },
        { title: "Register and pay", description: "Your seat is confirmed the moment payment goes through." },
        { title: "Show your QR code", description: "Check in at the gate, collect your bib and compete." },
      ],
    },
    fields: [
      { key: "heading", label: "Heading", kind: "text" },
      { key: "intro", label: "Intro", kind: "textarea" },
      {
        key: "items",
        label: "Steps",
        kind: "list",
        itemLabel: "Step",
        fields: [
          { key: "title", label: "Title", kind: "text" },
          { key: "description", label: "Description", kind: "textarea" },
        ],
      },
    ],
  },
  highlights: {
    type: "highlights",
    label: "Highlights",
    description: "A grid of short points, such as what every athlete gets.",
    schema: highlights,
    defaults: {
      heading: "What you get",
      intro: "",
      items: [
        { title: "Chip timing", description: "Accurate splits and an official finish time." },
        { title: "Finisher medal", description: "For everyone who crosses the line." },
        { title: "Hydration and medical", description: "Aid stations and a medical team on site." },
      ],
    },
    fields: [
      { key: "heading", label: "Heading", kind: "text" },
      { key: "intro", label: "Intro", kind: "textarea" },
      {
        key: "items",
        label: "Points",
        kind: "list",
        itemLabel: "Point",
        fields: [
          { key: "title", label: "Title", kind: "text" },
          { key: "description", label: "Description", kind: "textarea" },
        ],
      },
    ],
  },
  prizes: {
    type: "prizes",
    label: "Prizes",
    description: "Podium places and what each one wins.",
    schema: prizes,
    defaults: {
      heading: "Prizes",
      note: "",
      items: [
        { place: "1st", amount: "₹50,000", description: "Trophy and champion's jersey" },
        { place: "2nd", amount: "₹25,000", description: "Trophy" },
        { place: "3rd", amount: "₹10,000", description: "Trophy" },
      ],
    },
    fields: [
      { key: "heading", label: "Heading", kind: "text" },
      { key: "note", label: "Note under the heading", kind: "textarea" },
      {
        key: "items",
        label: "Places",
        kind: "list",
        itemLabel: "Place",
        fields: [
          { key: "place", label: "Place", kind: "text", placeholder: "1st" },
          { key: "amount", label: "Prize", kind: "text", placeholder: "₹50,000" },
          { key: "description", label: "Description", kind: "text" },
        ],
      },
    ],
  },
  testimonials: {
    type: "testimonials",
    label: "Testimonials",
    description: "Quotes from past athletes or coaches.",
    schema: testimonials,
    defaults: {
      heading: "From the field",
      items: [
        {
          quote: "The best organised race I have run. Clear categories, fair judging, great crowd.",
          name: "Past finisher",
          role: "10K, 2026",
          imageUrl: "",
        },
      ],
    },
    fields: [
      { key: "heading", label: "Heading", kind: "text" },
      {
        key: "items",
        label: "Quotes",
        kind: "list",
        itemLabel: "Quote",
        fields: [
          { key: "quote", label: "Quote", kind: "textarea" },
          { key: "name", label: "Name", kind: "text" },
          { key: "role", label: "Role or category", kind: "text" },
          { key: "imageUrl", label: "Photo", kind: "image" },
        ],
      },
    ],
  },
  cta: {
    type: "cta",
    label: "Call to action",
    description: "A bold banner in the event colour with one button.",
    schema: cta,
    defaults: {
      heading: "Ready to test yourself?",
      text: "Seats are limited in every category.",
      buttonLabel: "Register now",
      buttonUrl: "",
    },
    fields: [
      { key: "heading", label: "Heading", kind: "text" },
      { key: "text", label: "Text", kind: "textarea" },
      { key: "buttonLabel", label: "Button label", kind: "text" },
      {
        key: "buttonUrl",
        label: "Button link",
        kind: "url",
        help: "Leave empty to link to registration.",
      },
    ],
  },
};

export const SECTION_TYPES = Object.keys(SECTIONS) as SectionType[];

export function isSectionType(type: string): type is SectionType {
  return type in SECTIONS;
}

/** Parse stored or submitted content; throws a ZodError when invalid. */
export function parseSection<K extends SectionType>(type: K, content: unknown): SectionContent<K> {
  return SECTION_SCHEMAS[type].parse(content) as SectionContent<K>;
}

/** Sections a new event starts with, so the page looks finished straight away. */
export const DEFAULT_SECTIONS: SectionType[] = [
  "cards",
  "countdown",
  "richtext",
  "highlights",
  "steps",
  "tickets",
  "faq",
  "cta",
];

/** Only http(s) links and site-relative paths are allowed in section content. */
export function safeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const v = url.trim();
  if (v.startsWith("/") && !v.startsWith("//")) return v;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Turn a YouTube or Google Maps link into an embeddable URL; anything else is rejected. */
export function embedUrl(url: string): string | null {
  const safe = safeUrl(url);
  if (!safe || safe.startsWith("/")) return null;
  const u = new URL(safe);
  const host = u.hostname.replace(/^www\./, "");
  if (host === "youtu.be") return `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}`;
  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname.startsWith("/embed/")) return `https://www.youtube-nocookie.com${u.pathname}`;
    const id = u.searchParams.get("v") ?? (u.pathname.startsWith("/shorts/") ? u.pathname.split("/")[2] : null);
    return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (host === "google.com" && u.pathname.startsWith("/maps/embed")) return u.toString();
  return null;
}
