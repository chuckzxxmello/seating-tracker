// CSV parsing and export service for attendee data

export interface AttendeeCSVData {
  ticketNumber: string;
  name: string;
  email: string;
  // region & category kept optional for backward compatibility,
  // but no longer required in CSV.
  region?: string;
  category?: string;
  table?: number;
  seat?: number;
  checkedIn?: boolean;
  // stored as string (ISO or raw from CSV)
  checkedInTime?: string;
}

export interface ParseResult {
  valid: boolean;
  data: AttendeeCSVData[];
  errors: string[];
}

/**
 * Clean a single CSV cell:
 * - trim whitespace
 * - strip surrounding "." or '.'
 * - unescape "" → "
 */
function cleanCell(value: string): string {
  let v = value.trim();

  // Strip surrounding quotes "." or '.'
  if (
    v.length >= 2 &&
    ((v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'")))
  ) {
    v = v.slice(1, -1);
  }

  // Unescape embedded double quotes from CSV ("" → ")
  v = v.replace(/""/g, '"');

  return v;
}

// How many VIP seat labels share the same VIP table.
// Example: VIP1 & VIP2 → VIP Table 1; VIP3 & VIP4 → VIP Table 2.
const VIP_SEATS_PER_TABLE = 2;

function parseIntSafe(value: string): number | undefined {
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? undefined : n;
}

/**
 * Interpret a "Seat" cell like:
 *  - "VIP1" → { seat: 1, tableFromSeat: 1, inferredCategory: "VIP" }
 *  - "VIP2" → { seat: 2, tableFromSeat: 1, inferredCategory: "VIP" }
 *  - "5"    → { seat: 5 }
 */
function interpretSeatField(seatRaw: string): {
  seat?: number;
  tableFromSeat?: number;
  inferredCategory?: string;
} {
  const trimmed = seatRaw.trim();
  if (!trimmed || trimmed === "-") return {};

  const upper = trimmed.toUpperCase();

  // VIP pattern e.g. "VIP1", "VIP 1"
  const vipMatch = upper.match(/^VIP\s*(\d+)$/);
  if (vipMatch) {
    const seatIndex = parseIntSafe(vipMatch[1]);
    if (seatIndex === undefined) return {};

    const tableFromSeat =
      VIP_SEATS_PER_TABLE > 0
        ? Math.ceil(seatIndex / VIP_SEATS_PER_TABLE)
        : seatIndex;

    return {
      seat: seatIndex,
      tableFromSeat,
      inferredCategory: "VIP",
    };
  }

  // Plain numeric seat, e.g. "5"
  const numericSeat = parseIntSafe(trimmed);
  if (numericSeat !== undefined) {
    return { seat: numericSeat };
  }

  // Unknown seat pattern → ignore (you can extend this later)
  return {};
}

export function parseCSV(csvContent: string): ParseResult {
  const lines = csvContent.trim().split("\n");
  const errors: string[] = [];
  const data: AttendeeCSVData[] = [];

  if (lines.length < 2) {
    return {
      valid: false,
      data: [],
      errors: ["CSV must have at least a header row and one data row"],
    };
  }

  // Use raw header for columns; lower-case for matching
  const headerRaw = lines[0];
  const headers = headerRaw.split(",").map((h) => h.trim().toLowerCase());

  // Helper: find index for any candidate header names
  const findIndex = (candidates: string[]): number => {
    for (const c of candidates) {
      const idx = headers.indexOf(c);
      if (idx !== -1) return idx;
    }
    return -1;
  };

  // Support "ticketNumber", "Ticket Number", "ticket_no", etc.
  const ticketIdx = findIndex([
    "ticketnumber",
    "ticket number",
    "ticket_no",
    "ticket no",
  ]);
  const nameIdx = findIndex(["name"]);
  const emailIdx = findIndex(["email"]); // optional
  const regionIdx = findIndex(["region"]); // optional now
  const categoryIdx = findIndex(["category"]); // optional now
  const tableIdx = findIndex(["table"]); // optional
  const seatIdx = findIndex(["seat"]);

  // detect check-in columns (as exported by generateCSV)
  const checkInStatusIdx = findIndex([
    "check-in status",
    "check in status",
    "checkin status",
  ]);
  const checkInTimeIdx = findIndex([
    "check-in time",
    "check in time",
    "checkin time",
  ]);

  // Required columns – ONLY ticket + name now
  const missingRequired: string[] = [];
  if (ticketIdx === -1) missingRequired.push("ticketNumber");
  if (nameIdx === -1) missingRequired.push("name");

  if (missingRequired.length > 0) {
    return {
      valid: false,
      data: [],
      errors: [`Missing required columns: ${missingRequired.join(", ")}`],
    };
  }

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue;

    // Basic split by comma (works with our own generated CSV, since we quote all fields)
    const values = rawLine.split(",").map((v) => cleanCell(v));
    const rowNum = i + 1;

    const ticket = (values[ticketIdx] ?? "").toUpperCase();
    const name = values[nameIdx] ?? "";
    const rawEmail = emailIdx >= 0 ? values[emailIdx] ?? "" : "";
    const regionRaw = regionIdx >= 0 ? values[regionIdx] ?? "" : "";
    const categoryRaw = categoryIdx >= 0 ? values[categoryIdx] ?? "" : "";

    const tableRaw = tableIdx >= 0 ? values[tableIdx] ?? "" : "";
    const seatRaw = seatIdx >= 0 ? values[seatIdx] ?? "" : "";

    const checkInStatusRaw =
      checkInStatusIdx >= 0 ? values[checkInStatusIdx] ?? "" : "";
    const checkInTimeRaw =
      checkInTimeIdx >= 0 ? values[checkInTimeIdx] ?? "" : "";

    // Validate row
    if (!ticket) {
      errors.push(`Row ${rowNum}: Missing ticket number`);
      continue;
    }

    if (!name) {
      errors.push(`Row ${rowNum}: Missing name`);
      continue;
    }

    // region is optional
    const regionClean = regionRaw.trim() || undefined;

    // Start with whatever category the CSV gives us
    let categoryClean = categoryRaw.trim() || undefined;

    // Parse table from "Table" column, if present
    let table: number | undefined;
    if (tableRaw && tableRaw !== "-") {
      table = parseIntSafe(tableRaw);
    }

    // Parse "Seat" column, including VIP mapping
    let seat: number | undefined;
    if (seatRaw) {
      const { seat: parsedSeat, tableFromSeat, inferredCategory } =
        interpretSeatField(seatRaw);

      if (parsedSeat !== undefined) {
        seat = parsedSeat;
      }

      // If there is no dedicated "Table" column or it's empty,
      // use the table inferred from the VIP seat code.
      if ((table === undefined || Number.isNaN(table)) && tableFromSeat !== undefined) {
        table = tableFromSeat;
      }

      // If category was not explicitly set, use VIP from the seat code.
      if (!categoryClean && inferredCategory) {
        categoryClean = inferredCategory;
      }
    }

    const email = rawEmail || `${ticket}@event.local`;

    // Normalize check-in status to boolean
    let checkedIn: boolean | undefined = undefined;
    if (checkInStatusRaw) {
      const s = checkInStatusRaw.trim().toLowerCase();
      if (
        s === "checked in" ||
        s === "check in" ||
        s === "true" ||
        s === "yes"
      ) {
        checkedIn = true;
      } else if (
        s === "pending" ||
        s === "false" ||
        s === "no" ||
        s === "-"
      ) {
        checkedIn = false;
      }
    }

    data.push({
      ticketNumber: ticket,
      name,
      email,
      region: regionClean,
      category: categoryClean,
      table,
      seat,
      checkedIn,
      checkedInTime: checkInTimeRaw || undefined,
    });
  }

  return {
    valid: errors.length === 0,
    data,
    errors,
  };
}

// Helper to stringify check-in time in a robust way
function formatCheckInTime(value: any): string {
  if (!value) return "-";

  // Firestore Timestamp
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as any).toDate === "function"
  ) {
    try {
      return (value as any).toDate().toISOString();
    } catch {
      // ignore
    }
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    return value;
  }

  return String(value);
}

export function generateCSV(attendees: any[]): string {
  // "Table" column removed from export headers.
  const headers = [
    "Ticket Number",
    "Name",
    "Seat",
    "Check-in Status",
    "Check-in Time",
  ];

  const rows = attendees.map((a) => [
    a.ticketNumber,
    a.name,
    // support both `seat` and `assignedSeat`
    a.seat ?? a.assignedSeat ?? "-",
    a.checkedIn ? "Checked In" : "Pending",
    formatCheckInTime((a as any).checkedInTime),
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map((r) =>
      r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","),
    ),
  ].join("\n");

  return csvContent;
}

export function downloadCSV(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
