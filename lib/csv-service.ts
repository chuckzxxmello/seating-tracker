// CSV parsing and export service for attendee data

export interface AttendeeCSVData {
  ticketNumber: string
  name: string
  email: string
  region: string
  category: string
  table?: number
  seat?: number
}

export interface ParseResult {
  valid: boolean
  data: AttendeeCSVData[]
  errors: string[]
}

export function parseCSV(csvContent: string): ParseResult {
  const lines = csvContent.trim().split("\n")
  const errors: string[] = []
  const data: AttendeeCSVData[] = []

  if (lines.length < 2) {
    return { valid: false, data: [], errors: ["CSV must have at least a header row and one data row"] }
  }

  const headerLine = lines[0].toLowerCase()
  const headers = headerLine.split(",").map((h) => h.trim())

  const requiredHeaders = ["ticketnumber", "name", "region", "category"]
  const missingHeaders = requiredHeaders.filter((h) => !headers.includes(h))

  if (missingHeaders.length > 0) {
    return {
      valid: false,
      data: [],
      errors: [`Missing required columns: ${missingHeaders.join(", ")}`],
    }
  }

  // Find column indices
  const ticketIdx = headers.indexOf("ticketnumber")
  const nameIdx = headers.indexOf("name")
  const emailIdx = headers.indexOf("email")
  const regionIdx = headers.indexOf("region")
  const categoryIdx = headers.indexOf("category")
  const tableIdx = headers.indexOf("table")
  const seatIdx = headers.indexOf("seat")

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const values = line.split(",").map((v) => v.trim())
    const rowNum = i + 1

    const ticket = values[ticketIdx]?.toUpperCase() || ""
    const name = values[nameIdx] || ""
    const email = values[emailIdx] || ""
    const region = values[regionIdx] || ""
    const category = values[categoryIdx] || ""
    const table = values[tableIdx] ? Number.parseInt(values[tableIdx]) : undefined
    const seat = values[seatIdx] ? Number.parseInt(values[seatIdx]) : undefined

    // Validate row
    if (!ticket) {
      errors.push(`Row ${rowNum}: Missing ticket number`)
      continue
    }
    if (!name) {
      errors.push(`Row ${rowNum}: Missing name`)
      continue
    }
    if (!region || !["Luzon", "Visayas", "Mindanao", "International"].includes(region)) {
      errors.push(`Row ${rowNum}: Invalid region "${region}"`)
      continue
    }
    if (!category || !["PMT", "VIP", "Paying Guests", "Doctors/Dentists"].includes(category)) {
      errors.push(`Row ${rowNum}: Invalid category "${category}"`)
      continue
    }

    data.push({
      ticketNumber: ticket,
      name,
      email: email || `${ticket}@event.local`,
      region,
      category,
      table,
      seat,
    })
  }

  return {
    valid: errors.length === 0,
    data,
    errors,
  }
}

// ---------- CSV EXPORT (with check-in time) ----------

function formatCheckInTime(raw: any): string {
  if (!raw) return ""

  // Firestore Timestamp
  if (raw && typeof raw.toDate === "function") {
    const d: Date = raw.toDate()
    return d.toISOString()
  }

  // JS Date
  if (raw instanceof Date) {
    return raw.toISOString()
  }

  // String or other primitive
  return String(raw)
}

export function generateCSV(attendees: any[]): string {
  // Order: Name | Check-in Time | other important fields
  const headers = [
    "Name",
    "Check-in Time",
    "Ticket Number",
    "Email",
    "Region",
    "Category",
    "Table",
    "Seat",
    "Check-in Status",
  ]

  const rows = attendees.map((a) => {
    const table = a.table || "-"
    const seat = a.assignedSeat || a.seat || "-"
    const status = a.checkedIn ? "Checked In" : "Pending"
    const checkInTime = formatCheckInTime(a.checkedInTime)

    return [
      a.name || "",
      checkInTime,
      a.ticketNumber || "",
      a.email || "",
      a.region || "",
      a.category || "",
      table,
      seat,
      status,
    ]
  })

  const csvContent = [
    headers.join(","),
    ...rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")),
  ].join("\n")

  return csvContent
}

export function downloadCSV(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")

  link.setAttribute("href", url)
  link.setAttribute("download", filename)
  link.style.visibility = "hidden"

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
