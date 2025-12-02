"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Pencil,
  Trash2,
  Plus,
  Download,
  Upload,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react"
import { AttendeeEditor } from "@/components/attendee-editor"
import { getAttendees, deleteAttendee, type Attendee } from "@/lib/firebase-service"
import { PathfindingVisualization } from "@/components/pathfinding-visualization"
import { AddAttendeeDialog } from "@/components/add-attendee-dialog"
import { CSVImportDialog } from "@/components/csv-import-dialog"
import { generateCSV, downloadCSV } from "@/lib/csv-service"
import { RealTimeStatistics } from "@/components/real-time-statistics" // kept in case you use it elsewhere

interface AdminAttendeesListProps {
  adminEmail?: string
}

// Safely format Firestore Timestamp / Date / string
const formatCheckInTime = (raw: any): string => {
  if (!raw) return "-"
  let date: Date | null = null

  if (raw && typeof raw.toDate === "function") {
    date = raw.toDate()
  } else if (raw instanceof Date) {
    date = raw
  } else {
    const parsed = new Date(raw)
    if (!Number.isNaN(parsed.getTime())) {
      date = parsed
    }
  }

  if (!date) return String(raw)

  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })
}

// 🔢 Helper: get numeric value for ticket sorting (works with "VIP-001", "T-12", etc.)
const getTicketSortValue = (ticketRaw: string | number | null | undefined): number => {
  if (ticketRaw == null) return Number.POSITIVE_INFINITY
  const str = String(ticketRaw)
  const match = str.match(/\d+/)
  if (!match) return Number.POSITIVE_INFINITY
  return Number.parseInt(match[0], 10)
}

// 🔁 Helper: get a numeric seat/table value from attendee, supporting both
// `assignedSeat` and `seat` (to match CSV service behavior).
const getSeatValue = (att: Attendee): number | undefined => {
  const anyAtt = att as any
  const val =
    typeof anyAtt.assignedSeat === "number"
      ? anyAtt.assignedSeat
      : typeof anyAtt.seat === "number"
        ? anyAtt.seat
        : undefined

  if (typeof val === "number" && !Number.isNaN(val)) return val
  return undefined
}

export function AdminAttendeesList({ adminEmail = "" }: AdminAttendeesListProps) {
  const [attendees, setAttendees] = useState<Attendee[]>([])
  const [filteredAttendees, setFilteredAttendees] = useState<Attendee[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [exactMatch, setExactMatch] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [editingAttendee, setEditingAttendee] = useState<Attendee | null>(null)

  // 🔥 NEW: support multiple seat highlights
  const [selectedSeatsForPath, setSelectedSeatsForPath] = useState<number[]>([])
  const [selectedAttendeeIsVip, setSelectedAttendeeIsVip] = useState<boolean | null>(null)

  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showCSVImport, setShowCSVImport] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)

  // 🔥 NEW: selection state for bulk delete
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const ITEMS_PER_PAGE = 50

  useEffect(() => {
    loadAttendees()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadAttendees = async () => {
    try {
      setIsLoading(true)
      const data = await getAttendees()
      setAttendees(data)

      const filtered = filterAttendees(data, {
        search: searchQuery,
        exactMatch,
      })

      // keep map selection in sync after loading
      syncPathSelection(filtered, searchQuery, exactMatch)

      // clear selection since data reloaded
      setSelectedIds([])
    } catch (error) {
      console.error("[v0] Error loading attendees:", error)
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * Smart matching logic.
   * - Exact mode: full string must equal full name OR full ticket OR full category.
   * - Default: query is split into tokens; every token must match
   *   either name or ticket or category.
   *   - VERY short tokens (<=2 chars) are **only** checked against ticket
   *     to avoid "Kuya B" → "Kuya Bernard Macas" type matches.
   */
  const matchesSearch = (att: Attendee, tokens: string[], isExact: boolean): boolean => {
    if (tokens.length === 0) return true

    const name = (att.name ?? "").toLowerCase()
    const ticket = (att.ticketNumber ?? "").toLowerCase()
    const category = (att as any).category ? String((att as any).category).toLowerCase() : ""

    if (isExact) {
      const q = tokens.join(" ")
      return name === q || ticket === q || category === q
    }

    return tokens.every((token) => {
      if (token.length <= 2) {
        return ticket.includes(token)
      }
      return name.includes(token) || ticket.includes(token) || category.includes(token)
    })
  }

  const filterAttendees = (
    attendeeList: Attendee[],
    opts: {
      search: string
      exactMatch: boolean
    },
  ): Attendee[] => {
    const { search, exactMatch: isExact } = opts

    const tokens = search
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)

    let filtered = attendeeList

    if (tokens.length > 0) {
      filtered = filtered.filter((att) => matchesSearch(att, tokens, isExact))
    }

    // 🔢 Ensure table is sorted numerically by ticket number
    const sorted = filtered.slice().sort((a, b) => {
      const aVal = getTicketSortValue(a.ticketNumber as any)
      const bVal = getTicketSortValue(b.ticketNumber as any)
      if (aVal !== bVal) return aVal - bVal
      // tie-breaker to keep things stable
      return (a.ticketNumber ?? "").toString().localeCompare((b.ticketNumber ?? "").toString())
    })

    setFilteredAttendees(sorted)
    return sorted
  }

  // 🔥 NEW: compute ALL seat numbers from current matches
  const syncPathSelection = (list: Attendee[], search: string, isExact: boolean) => {
    const tokens = search
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)

    if (tokens.length === 0) {
      setSelectedSeatsForPath([])
      setSelectedAttendeeIsVip(null)
      return
    }

    // all attendees that match the search
    const matches = list.filter((att) => matchesSearch(att, tokens, isExact))

    // collect all seat/table values (supporting both assignedSeat + seat)
    const seats = matches
      .map((att) => getSeatValue(att))
      .filter((seat): seat is number => typeof seat === "number" && !Number.isNaN(seat))

    const uniqueSeats = Array.from(new Set(seats))

    setSelectedSeatsForPath(uniqueSeats)

    // If *exactly one* attendee matched, we keep VIP/regular awareness.
    if (matches.length === 1) {
      const seatVal = getSeatValue(matches[0])
      if (typeof seatVal === "number") {
        const categoryRaw = ((matches[0] as any).category ?? "").toString().trim().toUpperCase()
        // Strict VIP check: only when the category is exactly "VIP"
        setSelectedAttendeeIsVip(categoryRaw === "VIP")
      } else {
        // No seat → no VIP route
        setSelectedAttendeeIsVip(null)
      }
    } else {
      // multiple attendees → admin mode (no VIP filter; treat as regular)
      setSelectedAttendeeIsVip(null)
    }
  }

  const recomputeFilters = (
    overrides?: Partial<{
      search: string
      exactMatch: boolean
    }>,
  ) => {
    const opts = {
      search: overrides?.search ?? searchQuery,
      exactMatch: overrides?.exactMatch ?? exactMatch,
    }

    const filtered = filterAttendees(attendees, opts)
    syncPathSelection(filtered, opts.search, opts.exactMatch)
    setCurrentPage(1)
  }

  const handleSearch = (query: string) => {
    setSearchQuery(query)
    recomputeFilters({ search: query })
  }

  const handleExactMatchToggle = (value: boolean) => {
    setExactMatch(value)
    recomputeFilters({ exactMatch: value })
  }

  const handleDelete = async (attendeeId: string) => {
    if (!confirm("Are you sure you want to delete this attendee?")) return

    try {
      await deleteAttendee(attendeeId)
      const updated = attendees.filter((att) => att.id !== attendeeId)
      setAttendees(updated)

      const filtered = filterAttendees(updated, {
        search: searchQuery,
        exactMatch,
      })

      // re-sync path selection after delete
      syncPathSelection(filtered, searchQuery, exactMatch)

      // remove from selection if present
      setSelectedIds((prev) => prev.filter((id) => id !== attendeeId))
    } catch (error) {
      console.error("[v0] Error deleting attendee:", error)
      alert("Failed to delete attendee")
    }
  }

  const handleEditComplete = () => {
    setEditingAttendee(null)
    loadAttendees()
  }

  const handleExportCSV = () => {
    try {
      const csvContent = generateCSV(attendees)
      const timestamp = new Date().toISOString().split("T")[0]
      downloadCSV(csvContent, `attendees-export-${timestamp}.csv`)
    } catch (error) {
      console.error("[v0] Error exporting CSV:", error)
      alert("Failed to export CSV data")
    }
  }

  // 🔥 NEW: bulk selection helpers
  const toggleSelectAttendee = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((existing) => existing !== id) : [...prev, id],
    )
  }

  const handleSelectAllOnPage = (checked: boolean, paginatedAttendees: Attendee[]) => {
    const idsOnPage = paginatedAttendees
      .map((a) => a.id)
      .filter((id): id is string => Boolean(id))

    if (!idsOnPage.length) return

    setSelectedIds((prev) => {
      if (checked) {
        // Add all ids on this page
        const set = new Set(prev)
        idsOnPage.forEach((id) => set.add(id))
        return Array.from(set)
      } else {
        // Remove all ids on this page
        return prev.filter((id) => !idsOnPage.includes(id))
      }
    })
  }

  // 🔥 NEW: delete ALL delegates
  const handleDeleteAll = async () => {
    if (!attendees.length) return

    const confirmed = confirm("Are you sure you want to delete all data?")
    if (!confirmed) return

    try {
      setIsLoading(true)
      const idsToDelete = attendees
        .map((a) => a.id)
        .filter((id): id is string => Boolean(id))

      await Promise.all(idsToDelete.map((id) => deleteAttendee(id)))

      setAttendees([])
      setFilteredAttendees([])
      setSelectedIds([])
      setSelectedSeatsForPath([])
      setSelectedAttendeeIsVip(null)
      setCurrentPage(1)
    } catch (error) {
      console.error("[v0] Error deleting all attendees:", error)
      alert("Failed to delete all attendees")
    } finally {
      setIsLoading(false)
    }
  }

  // 🔥 NEW: delete only selected delegates
  const handleDeleteSelected = async () => {
    if (!selectedIds.length) return

    const confirmed = confirm(
      "Are you sure you want to delete these selected delegates from the list?",
    )
    if (!confirmed) return

    try {
      setIsLoading(true)
      await Promise.all(selectedIds.map((id) => deleteAttendee(id)))

      const updated = attendees.filter((att) => !att.id || !selectedIds.includes(att.id))
      setAttendees(updated)

      const filtered = filterAttendees(updated, {
        search: searchQuery,
        exactMatch,
      })

      // re-sync path selection after bulk delete
      syncPathSelection(filtered, searchQuery, exactMatch)

      setSelectedIds([])
      setCurrentPage(1)
    } catch (error) {
      console.error("[v0] Error deleting selected attendees:", error)
      alert("Failed to delete selected attendees")
    } finally {
      setIsLoading(false)
    }
  }

  const totalPages = Math.ceil(filteredAttendees.length / ITEMS_PER_PAGE) || 1
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const endIndex = startIndex + ITEMS_PER_PAGE
  const paginatedAttendees = filteredAttendees.slice(startIndex, endIndex)

  const handleFirstPage = () => setCurrentPage(1)
  const handlePrevPage = () => setCurrentPage((prev) => Math.max(1, prev - 1))
  const handleNextPage = () => setCurrentPage((prev) => Math.min(totalPages, prev + 1))
  const handleLastPage = () => setCurrentPage(totalPages)

  // computed select-all checkbox state for current page
  const allOnPageSelected =
    paginatedAttendees.length > 0 &&
    paginatedAttendees.every((a) => a.id && selectedIds.includes(a.id))

  if (isLoading) {
    return (
      <Card className="bg-white border-slate-200 p-8 text-center">
        <p className="text-slate-600">Loading attendees...</p>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Top actions */}
      <div className="flex gap-3 flex-wrap items-center">
        <Button
          onClick={() => setShowCSVImport(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
        >
          <Upload className="w-4 h-4" />
          Import CSV
        </Button>
        <Button
          onClick={() => setShowAddDialog(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Delegate
        </Button>
        <Button
          onClick={handleExportCSV}
          variant="outline"
          className="border-slate-300 text-slate-700 gap-2 bg-transparent"
        >
          <Download className="w-4 h-4" />
          Export Data
        </Button>

        {/* Spacer to push destructive actions to the right on large screens */}
        <div className="flex-1" />

        {/* NEW: bulk delete buttons */}
        <Button
          onClick={handleDeleteSelected}
          variant="destructive"
          className="gap-2"
          disabled={selectedIds.length === 0}
        >
          <Trash2 className="w-4 h-4" />
          Delete Selected
        </Button>
        <Button
          onClick={handleDeleteAll}
          variant="destructive"
          className="gap-2"
          disabled={attendees.length === 0}
        >
          <Trash2 className="w-4 h-4" />
          Delete All
        </Button>
      </div>

      {/* Search only */}
      <Card className="bg-white border-slate-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-slate-900 mb-2">
              Search by Category - Name or Ticket
            </label>
            <Input
              placeholder="Search delegates..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="bg-white border-slate-300"
            />
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={exactMatch}
                onChange={(e) => handleExactMatchToggle(e.target.checked)}
                className="h-3 w-3 rounded border-slate-400"
              />
              <span>Exact match (full name, ticket, or category only)</span>
            </label>
          </div>
        </div>
      </Card>

      {/* Pathfinding preview */}
      {selectedSeatsForPath.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-slate-900">
            Venue Map with Shortest Path
          </h3>
          <PathfindingVisualization
            // 🔥 NEW: highlight multiple tables at once
            seatIds={selectedSeatsForPath}
            // Default to REGULAR unless we explicitly know it's VIP
            isVip={
              selectedSeatsForPath.length === 1
                ? !!selectedAttendeeIsVip // true only when we know it's VIP
                : false // multi-seat → treat as regular / non-VIP
            }
            imageSrc="/images/design-mode/9caa3868-4cd5-468f-9fe7-4dc613433d03.jfif.jpeg"
            showBackground={true}
          />
        </div>
      )}

      {/* Table */}
      <Card className="bg-white border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          {/* font-table forces the Noto Sans font only inside the table */}
          <table className="w-full font-table">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {/* NEW: checkbox column */}
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-400"
                    checked={allOnPageSelected}
                    onChange={(e) =>
                      handleSelectAllOnPage(e.target.checked, paginatedAttendees)
                    }
                  />
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                  Ticket
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                  Check-in Time
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                  Table
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedAttendees.length === 0 ? (
                <tr>
                  {/* updated colSpan from 6 -> 7 because of new checkbox column */}
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-600">
                    No attendees found
                  </td>
                </tr>
              ) : (
                paginatedAttendees.map((attendee) => {
                  const seatValue = getSeatValue(attendee)
                  return (
                    <tr
                      key={attendee.id}
                      className="border-b border-slate-200 hover:bg-slate-50"
                    >
                      {/* per-row selection checkbox */}
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-400"
                          checked={!!attendee.id && selectedIds.includes(attendee.id)}
                          onChange={() => attendee.id && toggleSelectAttendee(attendee.id)}
                        />
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-900 font-medium">
                        {attendee.name}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {attendee.ticketNumber}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {formatCheckInTime((attendee as any).checkedInTime)}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {seatValue ? `Table ${seatValue}` : "Unassigned"}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            attendee.checkedIn
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {attendee.checkedIn ? "Checked In" : "Pending"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <div className="flex gap-2">
                          <button
                            onClick={() => setEditingAttendee(attendee)}
                            className="text-blue-600 hover:text-blue-700 p-1"
                            title="Edit or assign seat"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => attendee.id && handleDelete(attendee.id)}
                            className="text-red-600 hover:text-red-700 p-1"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex items-center justify-between">
          <div className="text-sm text-slate-600">
            Showing{" "}
            {filteredAttendees.length === 0 ? 0 : startIndex + 1}-
            {Math.min(endIndex, filteredAttendees.length)} of {filteredAttendees.length} delegates
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button
                onClick={handleFirstPage}
                disabled={currentPage === 1}
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0 bg-transparent"
              >
                <ChevronsLeft className="w-4 h-4" />
              </Button>
              <Button
                onClick={handlePrevPage}
                disabled={currentPage === 1}
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0 bg-transparent"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm text-slate-700 font-medium px-3">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                onClick={handleNextPage}
                disabled={currentPage === totalPages}
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0 bg-transparent"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button
                onClick={handleLastPage}
                disabled={currentPage === totalPages}
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0 bg-transparent"
              >
                <ChevronsRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </Card>

      {editingAttendee && (
        <AttendeeEditor
          attendee={editingAttendee}
          onClose={() => setEditingAttendee(null)}
          onSave={handleEditComplete}
          adminEmail={adminEmail}
        />
      )}

      {showAddDialog && (
        <AddAttendeeDialog onClose={() => setShowAddDialog(false)} onSuccess={loadAttendees} />
      )}

      {showCSVImport && (
        <CSVImportDialog onClose={() => setShowCSVImport(false)} onSuccess={loadAttendees} />
      )}
    </div>
  )
}
