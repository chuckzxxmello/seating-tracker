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

// Allowed values (must match your app)
const REGION_VALUES = ["Luzon", "Visayas", "Mindanao", "International"] as const
const CATEGORY_VALUES = [
  "PMT",
  "Doctors/Dentists",
  "Partner Churches/MTLs",
  "From other churches",
  "Major Donors",
  "Gideonites",
  "Paying Guests",
  "WEYJ",
  "VIP",
  "Others",
] as const

const REGION_LOOKUP: Record<string, string> = REGION_VALUES.reduce((acc, r) => {
  acc[r.toLowerCase()] = r
  return acc
}, {} as Record<string, string>)

const CATEGORY_LOOKUP: Record<string, string> = CATEGORY_VALUES.reduce((acc, c) => {
  acc[c.toLowerCase()] = c
  return acc
}, {} as Record<string, string>)

export function parseCSV(csvContent: string): ParseResult {
  const lines = csvContent.trim().split(/\r?\n/)
  const errors: string[] = []
  const data: AttendeeCSVData[] = []

  if (lines.length < 2) {
    return { valid: false, data: [], errors: ["CSV must have at least a header row and one data row"] }
  }

  // Header handling: allow exported headers like "Ticket Number"
  const rawHeaderLine = lines[0]
  const rawHeaders = rawHeaderLine.split(",").map((h) => h.trim())
  const normalizedHeaders = rawHeaders.map((h) => h.toLowerCase().replace(/\s+/g, ""))

  const requiredHeaders = ["ticketnumber", "name", "region", "category"]
  const missingHeaders = requiredHeaders.filter((h) => !normalizedHeaders.includes(h))

  if (missingHeaders.length > 0) {
    return {
      valid: false,
      data: [],
      errors: [
        `Missing required columns (by logical name): ${missingHeaders.join(
          ", ",
        )}. Expected something like: "Ticket Number, Name, Region, Category, ..."`,
      ],
    }
  }

  const getIndex = (key: string) => normalizedHeaders.indexOf(key)

  const ticketIdx = getIndex("ticketnumber")
  const nameIdx = getIndex("name")
  const emailIdx = getIndex("email") // optional
  const regionIdx = getIndex("region")
  const categoryIdx = getIndex("category")
  const tableIdx = getIndex("table") // optional
  const seatIdx = getIndex("seat") // optional
  // check-in status/time (optional, ignored for import)
  const checkInStatusIdx = getIndex("check-instatus") // "Check-in Status" → "check-instatus"
  const checkInTimeIdx = getIndex("check-intime") // "Check-in Time" → "check-intime"
  void checkInStatusIdx
  void checkInTimeIdx

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    // naive split; if you later need real CSV parsing, we can upgrade this
    const values = line
      .split(",")
      .map((v) => v.trim().replace(/^"|"$/g, "")) // strip surrounding quotes

    const rowNum = i + 1

    const ticket = ticketIdx >= 0 ? (values[ticketIdx] ?? "").toUpperCase() : ""
    const name = nameIdx >= 0 ? values[nameIdx] ?? "" : ""
    const emailRaw = emailIdx >= 0 ? values[emailIdx] ?? "" : ""
    const regionRaw = regionIdx >= 0 ? values[regionIdx] ?? "" : ""
    const categoryRaw = categoryIdx >= 0 ? values[categoryIdx] ?? "" : ""
    const tableRaw = tableIdx >= 0 ? values[tableIdx] ?? "" : ""
    const seatRaw = seatIdx >= 0 ? values[seatIdx] ?? "" : ""

    // Validate row
    if (!ticket) {
      errors.push(`Row ${rowNum}: Missing ticket number`)
      continue
    }
    if (!name) {
      errors.push(`Row ${rowNum}: Missing name`)
      continue
    }

    // Normalize region
    const regionKey = regionRaw.trim().toLowerCase()
    const region = REGION_LOOKUP[regionKey]
    if (!region) {
      errors.push(`Row ${rowNum}: Invalid region "${regionRaw}" (expected one of: ${REGION_VALUES.join(", ")})`)
      continue
    }

    // Normalize category
    const categoryKey = categoryRaw.trim().toLowerCase()
    const category = CATEGORY_LOOKUP[categoryKey]
    if (!category) {
      errors.push(
        `Row ${rowNum}: Invalid category "${categoryRaw}" (expected one of: ${CATEGORY_VALUES.join(", ")})`,
      )
      continue
    }

    const table =
      tableRaw && !Number.isNaN(Number.parseInt(tableRaw, 10)) ? Number.parseInt(tableRaw, 10) : undefined
    const seat =
      seatRaw && !Number.isNaN(Number.parseInt(seatRaw, 10)) ? Number.parseInt(seatRaw, 10) : undefined

    data.push({
      ticketNumber: ticket,
      name,
      email: emailRaw || `${ticket}@event.local`,
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

export function generateCSV(attendees: any[]): string {
  // This is the format your import will now accept
  const headers = [
    "Ticket Number",
    "Name",
    "Email",
    "Region",
    "Category",
    "Table",
    "Seat",
    "Check-in Status",
    "Check-in Time",
  ]

  const rows = attendees.map((a) => {
    const checkInStatus = a.checkedIn ? "Checked In" : "Pending"

    let checkInTime = ""
    const rawTime = a.checkedInTime
    if (rawTime) {
      let date: Date | null = null
      if (rawTime && typeof rawTime.toDate === "function") {
        date = rawTime.toDate()
      } else if (rawTime instanceof Date) {
        date = rawTime
      } else {
        const parsed = new Date(rawTime)
        if (!Number.isNaN(parsed.getTime())) {
          date = parsed
        }
      }
      if (date) {
        checkInTime = date.toISOString()
      }
    }

    return [
      a.ticketNumber ?? "",
      a.name ?? "",
      a.email ?? "",
      a.region ?? "",
      a.category ?? "",
      a.table ?? "",
      a.assignedSeat ?? "",
      checkInStatus,
      checkInTime,
    ]
  })

  const csvContent = [
    headers.join(","), // header row
    ...rows.map((r) =>
      r
        .map((v) => {
          const s = String(v ?? "")
          // wrap in quotes and escape inner quotes
          return `"${s.replace(/"/g, '""')}"`
        })
        .join(","),
    ),
  ].join("\n")

  return csvContent
}

export function downloadCSV(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
  const link = document.createElement("a")
  const url = URL.createObjectURL(blob)

  link.setAttribute("href", url)
  link.setAttribute("download", filename)
  link.style.visibility = "hidden"

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
