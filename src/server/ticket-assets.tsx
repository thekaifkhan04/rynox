import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import QRCode from "qrcode";
import { render } from "takumi-pdf";
import { Badge } from "@/components/pdf/badge/badge";
import { Divider } from "@/components/pdf/divider/divider";
import { Heading } from "@/components/pdf/heading/heading";
import { KeyValue } from "@/components/pdf/key-value/key-value";
import { PdfQRCode } from "@/components/pdf/qrcode/qrcode";
import { Text } from "@/components/pdf/text/text";
import { PdfcnThemeProvider } from "@/components/pdf/theme-provider";
import type { Event, Ticket, TicketType } from "@/db/schema";
import { formatDateRange, formatTime } from "@/lib/dates";
import { env } from "@/lib/env";
import { Document, Page, View } from "@/lib/pdf-primitives";
import { professionalTheme } from "@/lib/pdf-themes/professional";
import type { PdfcnTheme } from "@/types/pdf-themes";

export type TicketBundle = { ticket: Ticket; ticketType: TicketType; event: Event };

const QR_OPTIONS = { errorCorrectionLevel: "M", margin: 2, width: 480 } as const;

/** QR as a PNG, for the confirmation email. */
export const qrPng = (token: string) => QRCode.toBuffer(token, QR_OPTIONS);
/** QR as inline SVG, for the on-screen ticket. */
export const qrSvg = (token: string) =>
  QRCode.toString(token, { type: "svg", errorCorrectionLevel: "M", margin: 1 });

export function ticketStatusLabel(ticket: Ticket) {
  if (ticket.status === "CANCELLED") return "Cancelled";
  if (ticket.status === "RESERVED") return "Awaiting payment";
  return ticket.checkedInAt ? "Checked in" : "Confirmed · Paid";
}

// The PDF engine does not read system fonts, so the site's two typefaces ship
// with the app (assets/fonts, SIL Open Font License) and are loaded once.
let fonts: Promise<{ name: string; data: Buffer }[]> | null = null;
function loadFonts() {
  fonts ??= Promise.all(
    [
      ["Anton", "Anton-Regular.ttf"],
      ["Manrope", "Manrope-Variable.ttf"],
    ].map(async ([name, file]) => ({
      name,
      data: await readFile(join(process.cwd(), "assets/fonts", file)),
    })),
  );
  return fonts;
}

// A5 landscape, in points. Each ticket fills exactly one page.
const PAGE = { width: 595, height: 419 };
const DARK = "#0b0b0d";

/** The site's dark look as a pdfcn theme, with the event's own accent colour. */
function ticketTheme(accent: string): PdfcnTheme {
  return {
    ...professionalTheme,
    name: "ticket",
    colors: {
      ...professionalTheme.colors,
      accent,
      background: DARK,
      border: "#2a2a2e",
      foreground: "#ffffff",
      muted: "#141417",
      mutedForeground: "#8b8b93",
      primary: accent,
      primaryForeground: DARK,
    },
    typography: {
      body: { ...professionalTheme.typography.body, fontFamily: "Manrope" },
      heading: { ...professionalTheme.typography.heading, fontFamily: "Anton", fontWeight: 400 },
    },
  };
}

function TicketPage({ ticket, ticketType, event, first }: TicketBundle & { first: boolean }) {
  const label = { color: "#8b8b93", letterSpacing: 1.5 };
  return (
    <Page
      style={{
        width: PAGE.width,
        height: PAGE.height,
        backgroundColor: DARK,
        padding: 18,
        // One ticket per page.
        ...(first ? {} : { breakBefore: "page" }),
      }}
    >
      <View
        style={{
          flexGrow: 1,
          flexDirection: "column",
          borderWidth: 1,
          borderColor: "#2a2a2e",
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        <View style={{ backgroundColor: event.accentColor, padding: 14, paddingLeft: 18, flexDirection: "column" }}>
          <Text variant="xs" weight="bold" color={DARK} transform="uppercase" noMargin style={{ letterSpacing: 2 }}>
            {`${env.siteName} · Entry ticket`}
          </Text>
          <Heading level={2} color={DARK} transform="uppercase" noMargin style={{ marginTop: 4 }}>
            {event.title}
          </Heading>
        </View>

        <View style={{ flexGrow: 1, flexShrink: 1, flexDirection: "row", padding: 16, paddingLeft: 18, gap: 18 }}>
          <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, flexDirection: "column" }}>
            <Text variant="xs" transform="uppercase" noMargin style={label}>
              Athlete
            </Text>
            <Text variant="lg" weight="bold" noMargin style={{ marginTop: 2, marginBottom: 8, lineHeight: 1.25 }}>
              {ticket.attendeeName}
            </Text>
            <KeyValue
              direction="vertical"
              size="sm"
              labelColor="#8b8b93"
              valueColor="#ffffff"
              boldValue
              items={[
                { key: "CATEGORY", value: ticketType.name },
                {
                  key: "DATE & TIME",
                  value: `${formatDateRange(event.startsAt, event.endsAt, event.timezone)} · ${formatTime(event.startsAt, event.timezone)}`,
                },
                { key: "VENUE", value: [event.venueName, event.city].filter(Boolean).join(", ") },
              ]}
            />
            <View style={{ flexDirection: "row", marginTop: 8 }}>
              <Badge
                label={ticketStatusLabel(ticket)}
                size="md"
                background={ticket.status === "VALID" ? "#12301f" : "#3a1616"}
                color={ticket.status === "VALID" ? "#6ee7a8" : "#fca5a5"}
              />
            </View>
          </View>

          <View style={{ width: 140, flexDirection: "column", alignItems: "center" }}>
            <PdfQRCode value={ticket.qrToken} size={132} errorLevel="M" margin={2} />
            <Text weight="bold" noMargin style={{ marginTop: 8, letterSpacing: 1.5 }}>
              {ticket.ticketCode}
            </Text>
          </View>
        </View>

        <View style={{ flexShrink: 0, paddingLeft: 18, paddingRight: 18, paddingBottom: 12, flexDirection: "column" }}>
          <Divider variant="dashed" spacing="sm" color="#2a2a2e" />
          <Text variant="xs" color="#8b8b93" noMargin>
            Show this QR code at the entrance. One scan per ticket. Bring a photo ID.
          </Text>
        </View>
      </View>
    </Page>
  );
}

function TicketDocument({ bundles }: { bundles: TicketBundle[] }) {
  return (
    <Document title="Tickets">
      {bundles.map((b, i) => (
        <TicketPage key={b.ticket.id} {...b} first={i === 0} />
      ))}
    </Document>
  );
}

/** One PDF with a page per ticket, built from pdfcn components on the Takumi engine. */
export async function ticketsPdf(bundles: TicketBundle[]): Promise<Buffer> {
  const accent = bundles[0]?.event.accentColor ?? "#ff4d1c";
  const pdf = await render(
    <PdfcnThemeProvider theme={ticketTheme(accent)}>
      <TicketDocument bundles={bundles} />
    </PdfcnThemeProvider>,
    {
      // Page size is given in CSS pixels (96 per inch); the layout above is in points (72 per inch).
      size: { width: (PAGE.width * 96) / 72, height: (PAGE.height * 96) / 72 },
      margin: 0,
      fonts: await loadFonts(),
    },
  );
  return Buffer.from(pdf);
}
