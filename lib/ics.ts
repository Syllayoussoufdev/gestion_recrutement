/**
 * Générateur de fichiers de calendrier standard iCalendar (RFC 5545).
 * Utilisé pour joindre un événement .ics aux invitations d'entretien.
 */

export interface IcsEventOptions {
  uid: string;
  title: string;
  description: string;
  location?: string | null;
  startsAt: Date;
  endsAt: Date;
  organizerName?: string;
  organizerEmail?: string;
  attendeeEmail?: string;
  isCancelled?: boolean;
}

function formatDateToIcsUtc(date: Date): string {
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const y = date.getUTCFullYear();
  const m = pad(date.getUTCMonth() + 1);
  const d = pad(date.getUTCDate());
  const h = pad(date.getUTCHours());
  const min = pad(date.getUTCMinutes());
  const s = pad(date.getUTCSeconds());
  return `${y}${m}${d}T${h}${min}${s}Z`;
}

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

export function generateIcsCalendar(options: IcsEventOptions): string {
  const now = new Date();
  const dtStamp = formatDateToIcsUtc(now);
  const dtStart = formatDateToIcsUtc(options.startsAt);
  const dtEnd = formatDateToIcsUtc(options.endsAt);
  const method = options.isCancelled ? "CANCEL" : "REQUEST";
  const status = options.isCancelled ? "CANCELLED" : "CONFIRMED";

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Stratos Conseil//Plateforme Recrutement V2//FR",
    `METHOD:${method}`,
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${options.uid}@stratosconseil.ci`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcsText(options.title)}`,
    `DESCRIPTION:${escapeIcsText(options.description)}`,
    `STATUS:${status}`,
  ];

  if (options.location) {
    lines.push(`LOCATION:${escapeIcsText(options.location)}`);
  }

  if (options.organizerEmail) {
    const orgName = options.organizerName ? `CN=${escapeIcsText(options.organizerName)}:` : "";
    lines.push(`ORGANIZER;${orgName}mailto:${options.organizerEmail}`);
  }

  if (options.attendeeEmail) {
    lines.push(`ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED:mailto:${options.attendeeEmail}`);
  }

  lines.push("END:VEVENT", "END:VCALENDAR");

  return lines.join("\r\n") + "\r\n";
}
