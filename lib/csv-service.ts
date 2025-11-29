// CSV parsing and export service for attendee data

export interface AttendeeCSVData {
  ticketNumber: string;
  name: string;
  email: string;
  region: string;
  category: string;
  table?: number;
  seat?: number;
  checkedIn?: boolean;      // NEW
  checkedInTime?: string;   // NEW – stored as string (ISO or raw from CSV)
}

export interface ParseResult {
  valid: boolean;
  data: AttendeeCSVData[];
  errors: string[];
}

/**
 * Clean a single CSV cell:
 * - trim whitespace
 * - strip surrounding "..." or '...'
 * - unescape "" → "
 */
function cleanCell(value: string): string {
  let v = value.trim();

  // Strip surrounding quotes "..." or '...'
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
  const regionIdx = findIndex(["region"]);
  const categoryIdx = findIndex(["category"]);
  const tableIdx = findIndex(["table"]);
  const seatIdx = findIndex(["seat"]);

  // NEW: detect check-in columns (as exported by generateCSV)
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

  // Required columns
  const missingRequired: string[] = [];
  if (ticketIdx === -1) missingRequired.push("ticketNumber");
  if (nameIdx === -1) missingRequired.push("name");
  if (regionIdx === -1) missingRequired.push("region");
  if (categoryIdx === -1) missingRequired.push("category");

  if (missingRequired.length > 0) {
    return {
      valid: false,
      data: [],
      errors: [`Missing required columns: ${missingRequired.join(", ")}`],
    };
  }

  const validRegions = ["luzon", "visayas", "mindanao", "international"];

  const validCategories = [
    "pmt",
    "vip",
    "paying guests",
    "doctors/dentists",
    "partner churches/mtls",
    "from other churches",
    "major donors",
    "gideonites",
    "weyj",
    "others",
  ];

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
    const table =
      tableIdx >= 0 && values[tableIdx]
        ? Number.parseInt(values[tableIdx], 10)
        : undefined;
    const seat =
      seatIdx >= 0 && values[seatIdx]
        ? Number.parseInt(values[seatIdx], 10)
        : undefined;

    // NEW: read check-in columns if present
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

    const regionClean = regionRaw.trim();
    const regionLc = regionClean.toLowerCase();
    if (!regionClean || !validRegions.includes(regionLc)) {
      errors.push(`Row ${rowNum}: Invalid region "${regionRaw}"`);
      continue;
    }

    const categoryClean = categoryRaw.trim();
    const categoryLc = categoryClean.toLowerCase();
    if (!categoryClean || !validCategories.includes(categoryLc)) {
      errors.push(`Row ${rowNum}: Invalid category "${categoryRaw}"`);
      continue;
    }

    const email = rawEmail || `${ticket}@event.local`;

    // NEW: normalize check-in status to boolean
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
  // No Email column; include Check-in Time
  const headers = [
    "Ticket Number",
    "Name",
    "Region",
    "Category",
    "Table",
    "Seat",
    "Check-in Status",
    "Check-in Time",
  ];

  const rows = attendees.map((a) => [
    a.ticketNumber,
    a.name,
    a.region,
    a.category,
    a.table ?? "-",
    // support both `seat` and `assignedSeat`
    a.seat ?? a.assignedSeat ?? "-",
    a.checkedIn ? "Checked In" : "Pending",
    formatCheckInTime(a.checkedInTime),
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
