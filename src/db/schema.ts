import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const ts = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () =>
  ts("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ---------- Auth (Better Auth) ----------

export const roleEnum = pgEnum("role", ["USER", "ADMIN"]);

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: roleEnum("role").notNull().default("USER"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: ts("expires_at").notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: ts("access_token_expires_at"),
    refreshTokenExpiresAt: ts("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// ---------- Events ----------

export const eventStatusEnum = pgEnum("event_status", [
  "DRAFT",
  "PUBLISHED",
  "CLOSED",
  "CANCELLED",
]);

export const events = pgTable(
  "events",
  {
    id: id(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    tagline: text("tagline"),
    summary: text("summary"),
    coverImageUrl: text("cover_image_url"),
    accentColor: text("accent_color").notNull().default("#ff4d1c"),
    venueName: text("venue_name").notNull(),
    venueAddress: text("venue_address"),
    city: text("city"),
    mapUrl: text("map_url"),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    timezone: text("timezone").notNull().default("Asia/Kolkata"),
    capacity: integer("capacity"),
    maxTicketsPerOrder: integer("max_tickets_per_order").notNull().default(1),
    registrationOpensAt: ts("registration_opens_at"),
    registrationClosesAt: ts("registration_closes_at"),
    status: eventStatusEnum("status").notNull().default("DRAFT"),
    /** The one event the organiser has chosen to lead the home page. */
    featuredOnHome: boolean("featured_on_home").notNull().default(false),
    /** Google Sheet that registrations are synced to, and when that last happened. */
    sheetId: text("sheet_id"),
    sheetSyncedAt: ts("sheet_synced_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("events_status_starts_idx").on(t.status, t.startsAt)],
);

/**
 * A competition is something a person enters within an event: a race, a lift,
 * a challenge. An event with one competition is a single contest; an event
 * with several lets people enter each one separately.
 */
export const competitions = pgTable(
  "competitions",
  {
    id: id(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("competitions_event_idx").on(t.eventId)],
);

/**
 * The ordered levels of a competition (heats, semi-final, final...). Entrants
 * start at the first level and must qualify from each one to reach the next.
 * A competition with no levels, or just one, is a straight contest.
 */
export const competitionLevels = pgTable(
  "competition_levels",
  {
    id: id(),
    competitionId: text("competition_id")
      .notNull()
      .references(() => competitions.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("competition_levels_competition_idx").on(t.competitionId, t.sortOrder)],
);

export const ticketTypes = pgTable(
  "ticket_types",
  {
    id: id(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    /** The competition this ticket enters. null = general entry (e.g. spectators). */
    competitionId: text("competition_id").references(() => competitions.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    description: text("description"),
    pricePaise: integer("price_paise").notNull(),
    /** Price when an organiser registers someone at the desk. null = same as online. */
    offlinePricePaise: integer("offline_price_paise"),
    quota: integer("quota"),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("ticket_types_event_idx").on(t.eventId)],
);

export const eventSections = pgTable(
  "event_sections",
  {
    id: id(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    visible: boolean("visible").notNull().default(true),
    content: jsonb("content").notNull().$type<Record<string, unknown>>(),
  },
  (t) => [index("event_sections_event_idx").on(t.eventId, t.sortOrder)],
);

export const fieldTypeEnum = pgEnum("field_type", [
  "TEXT",
  "TEXTAREA",
  "NUMBER",
  "SELECT",
  "CHECKBOX",
]);

export const formFields = pgTable(
  "form_fields",
  {
    id: id(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    type: fieldTypeEnum("type").notNull().default("TEXT"),
    options: jsonb("options").notNull().$type<string[]>().default([]),
    required: boolean("required").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("form_fields_event_key_idx").on(t.eventId, t.key)],
);

// ---------- Orders, tickets, payments ----------

export const orderStatusEnum = pgEnum("order_status", [
  "PENDING",
  "PAID",
  "EXPIRED",
  "FAILED",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
]);

export const paymentMethodEnum = pgEnum("payment_method", ["ONLINE", "OFFLINE"]);

export const orders = pgTable(
  "orders",
  {
    id: id(),
    orderNumber: text("order_number").notNull().unique(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    buyerName: text("buyer_name").notNull(),
    buyerEmail: text("buyer_email").notNull(),
    buyerPhone: text("buyer_phone").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    currency: text("currency").notNull().default("INR"),
    status: orderStatusEnum("status").notNull().default("PENDING"),
    /** OFFLINE = money collected in person and recorded by an organiser. */
    paymentMethod: paymentMethodEnum("payment_method").notNull().default("ONLINE"),
    expiresAt: ts("expires_at").notNull(),
    razorpayOrderId: text("razorpay_order_id").unique(),
    razorpayPaymentId: text("razorpay_payment_id").unique(),
    paidAt: ts("paid_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("orders_event_status_idx").on(t.eventId, t.status),
    index("orders_user_idx").on(t.userId),
  ],
);

export const ticketStatusEnum = pgEnum("ticket_status", [
  "RESERVED",
  "VALID",
  "CANCELLED",
]);

export const tickets = pgTable(
  "tickets",
  {
    id: id(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id),
    ticketTypeId: text("ticket_type_id")
      .notNull()
      .references(() => ticketTypes.id),
    ticketCode: text("ticket_code").notNull().unique(),
    qrToken: text("qr_token").notNull().unique(),
    attendeeName: text("attendee_name").notNull(),
    attendeeEmail: text("attendee_email").notNull(),
    attendeePhone: text("attendee_phone").notNull(),
    organization: text("organization"),
    answers: jsonb("answers")
      .notNull()
      .$type<Record<string, string | boolean>>()
      .default({}),
    pricePaise: integer("price_paise").notNull(),
    status: ticketStatusEnum("status").notNull().default("RESERVED"),
    checkedInAt: ts("checked_in_at"),
    checkedInById: text("checked_in_by_id").references(() => user.id),
    createdAt: createdAt(),
  },
  (t) => [
    index("tickets_event_status_idx").on(t.eventId, t.status),
    index("tickets_order_idx").on(t.orderId),
    index("tickets_type_idx").on(t.ticketTypeId),
    index("tickets_attendee_email_idx").on(t.attendeeEmail),
  ],
);

export const levelOutcomeEnum = pgEnum("level_outcome", ["QUALIFIED", "ELIMINATED"]);

/** What happened to an entrant at one level. No row yet = still to compete there. */
export const levelResults = pgTable(
  "level_results",
  {
    id: id(),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    levelId: text("level_id")
      .notNull()
      .references(() => competitionLevels.id, { onDelete: "cascade" }),
    outcome: levelOutcomeEnum("outcome").notNull(),
    /** Free text: a time, a weight, a score, a rank. */
    result: text("result"),
    recordedById: text("recorded_by_id").references(() => user.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("level_results_ticket_level_idx").on(t.ticketId, t.levelId),
    index("level_results_level_idx").on(t.levelId),
  ],
);

/**
 * A sponsorship level an event offers (Title, Gold, Silver...). Sponsors
 * apply for one; the organiser approves them before they appear on the page.
 */
export const sponsorTiers = pgTable(
  "sponsor_tiers",
  {
    id: id(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** What the sponsor gets. One benefit per line. */
    benefits: text("benefits"),
    /** null = price on request. */
    pricePaise: integer("price_paise"),
    /** How many sponsors this level can take. null = no limit. */
    slots: integer("slots"),
    /** Whether sponsors at this level are also named in the event's hero. */
    showInHero: boolean("show_in_hero").notNull().default(true),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("sponsor_tiers_event_idx").on(t.eventId)],
);

export const sponsorStatusEnum = pgEnum("sponsor_status", ["PENDING", "APPROVED", "REJECTED"]);

export const sponsors = pgTable(
  "sponsors",
  {
    id: id(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    tierId: text("tier_id")
      .notNull()
      .references(() => sponsorTiers.id),
    /** The account that applied. null when the organiser added the sponsor directly. */
    userId: text("user_id").references(() => user.id),
    companyName: text("company_name").notNull(),
    contactName: text("contact_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    website: text("website"),
    logoUrl: text("logo_url"),
    message: text("message"),
    status: sponsorStatusEnum("status").notNull().default("PENDING"),
    /** Set by the organiser once the sponsorship money has been received. */
    paid: boolean("paid").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("sponsors_event_status_idx").on(t.eventId, t.status)],
);

/**
 * A personal access token an admin creates to let an AI assistant manage
 * events through the MCP endpoint. Only a hash is stored.
 */
export const apiTokens = pgTable(
  "api_tokens",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    /** The first characters of the token, so it can be recognised in a list. */
    prefix: text("prefix").notNull(),
    lastUsedAt: ts("last_used_at"),
    revokedAt: ts("revoked_at"),
    createdAt: createdAt(),
  },
  (t) => [index("api_tokens_user_idx").on(t.userId)],
);

/**
 * Counters for rate limiting. Kept in the database so a limit holds across
 * every server instance, not just the one that happened to take the request.
 */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: ts("window_start").notNull().defaultNow(),
  count: integer("count").notNull().default(0),
});

export const refundStatusEnum = pgEnum("refund_status", [
  "PENDING",
  "PROCESSED",
  "FAILED",
]);

export const refunds = pgTable(
  "refunds",
  {
    id: id(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    ticketId: text("ticket_id").references(() => tickets.id),
    razorpayRefundId: text("razorpay_refund_id").unique(),
    amountPaise: integer("amount_paise").notNull(),
    status: refundStatusEnum("status").notNull().default("PENDING"),
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (t) => [index("refunds_order_idx").on(t.orderId)],
);

export const webhookEvents = pgTable("webhook_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  receivedAt: ts("received_at").notNull().defaultNow(),
});

export const emailLogs = pgTable(
  "email_logs",
  {
    id: id(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    toEmail: text("to_email").notNull(),
    status: text("status").notNull(),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [index("email_logs_order_idx").on(t.orderId)],
);

// ---------- Relations ----------

export const eventsRelations = relations(events, ({ many }) => ({
  ticketTypes: many(ticketTypes),
  competitions: many(competitions),
  sponsorTiers: many(sponsorTiers),
  sponsors: many(sponsors),
  sections: many(eventSections),
  formFields: many(formFields),
  orders: many(orders),
  tickets: many(tickets),
}));

export const competitionsRelations = relations(competitions, ({ one, many }) => ({
  event: one(events, { fields: [competitions.eventId], references: [events.id] }),
  levels: many(competitionLevels),
  ticketTypes: many(ticketTypes),
}));

export const competitionLevelsRelations = relations(competitionLevels, ({ one, many }) => ({
  competition: one(competitions, {
    fields: [competitionLevels.competitionId],
    references: [competitions.id],
  }),
  results: many(levelResults),
}));

export const levelResultsRelations = relations(levelResults, ({ one }) => ({
  ticket: one(tickets, { fields: [levelResults.ticketId], references: [tickets.id] }),
  level: one(competitionLevels, {
    fields: [levelResults.levelId],
    references: [competitionLevels.id],
  }),
}));

export const ticketTypesRelations = relations(ticketTypes, ({ one, many }) => ({
  event: one(events, { fields: [ticketTypes.eventId], references: [events.id] }),
  competition: one(competitions, {
    fields: [ticketTypes.competitionId],
    references: [competitions.id],
  }),
  tickets: many(tickets),
}));

export const eventSectionsRelations = relations(eventSections, ({ one }) => ({
  event: one(events, { fields: [eventSections.eventId], references: [events.id] }),
}));

export const formFieldsRelations = relations(formFields, ({ one }) => ({
  event: one(events, { fields: [formFields.eventId], references: [events.id] }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  event: one(events, { fields: [orders.eventId], references: [events.id] }),
  user: one(user, { fields: [orders.userId], references: [user.id] }),
  tickets: many(tickets),
  refunds: many(refunds),
  emailLogs: many(emailLogs),
}));

export const ticketsRelations = relations(tickets, ({ one, many }) => ({
  order: one(orders, { fields: [tickets.orderId], references: [orders.id] }),
  event: one(events, { fields: [tickets.eventId], references: [events.id] }),
  ticketType: one(ticketTypes, {
    fields: [tickets.ticketTypeId],
    references: [ticketTypes.id],
  }),
  checkedInBy: one(user, {
    fields: [tickets.checkedInById],
    references: [user.id],
  }),
  refunds: many(refunds),
  levelResults: many(levelResults),
}));

export const sponsorTiersRelations = relations(sponsorTiers, ({ one, many }) => ({
  event: one(events, { fields: [sponsorTiers.eventId], references: [events.id] }),
  sponsors: many(sponsors),
}));

export const sponsorsRelations = relations(sponsors, ({ one }) => ({
  event: one(events, { fields: [sponsors.eventId], references: [events.id] }),
  tier: one(sponsorTiers, { fields: [sponsors.tierId], references: [sponsorTiers.id] }),
}));

export const refundsRelations = relations(refunds, ({ one }) => ({
  order: one(orders, { fields: [refunds.orderId], references: [orders.id] }),
  ticket: one(tickets, { fields: [refunds.ticketId], references: [tickets.id] }),
}));

export const emailLogsRelations = relations(emailLogs, ({ one }) => ({
  order: one(orders, { fields: [emailLogs.orderId], references: [orders.id] }),
}));

export type Event = typeof events.$inferSelect;
export type TicketType = typeof ticketTypes.$inferSelect;
export type SponsorTier = typeof sponsorTiers.$inferSelect;
export type Sponsor = typeof sponsors.$inferSelect;
export type Competition = typeof competitions.$inferSelect;
export type CompetitionLevel = typeof competitionLevels.$inferSelect;
export type LevelResult = typeof levelResults.$inferSelect;
export type EventSection = typeof eventSections.$inferSelect;
export type FormField = typeof formFields.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type Ticket = typeof tickets.$inferSelect;
export type Refund = typeof refunds.$inferSelect;
export type User = typeof user.$inferSelect;
