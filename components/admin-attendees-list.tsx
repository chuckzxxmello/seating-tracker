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
import { RealTimeStatistics } from "@/components/real-time-statistics"

interface AdminAttendeesListProps {
  adminEmail?: string
}

type StatusFilter = "All" | "Checked In" | "Pending"

const CATEGORY_OPTIONS = [
  { value: "PMT", label: "PMT" },
  { value: "Doctors/Dentists", label: "Doctors/Dentists" },
  { value: "Partner Churches/MTLs", label: "Partner Churches/MTLs" },
  { value: "From other churches", label: "From other churches" },
  { value: "Major Donors", label: "Major Donors" },
  { value: "Gideonites", label: "Gideonites" },
  { value: "Paying Guests", label: "Paying Guests" },
  { value: "WEYJ", label: "WEYJ" },
  { value: "VIP", label: "VIP" },
  { value: "Others", label: "Others" }, // custom category option
]

const regions = ["All Regions", "Luzon", "Visayas", "Mindanao", "International"]

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

export function AdminAttendeesList({ adminEmail = "" }: AdminAttendeesListProps) {
  const [attendees, setAttendees] = useState<Attendee[]>([])
  const [filteredAttendees, setFilteredAttendees] = useState<Attendee[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [exactMatch, setExactMatch] = useState(false)
  const [selectedRegion, setSelectedRegion] = useState("All Regions")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All")
  const [categoryFilter, setCategoryFilter] = useState("All Categories")
  const [isLoading, setIsLoading] = useState(true)
  const [editingAttendee, setEditingAttendee] = useState<Attendee | null>(null)
  const [selectedSeatForPath, setSelectedSeatForPath] = useState<number | null>(null)
  const [selectedAttendeeIsVip, setSelectedAttendeeIsVip] = useState(false)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showCSVImport, setShowCSVImport] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)

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

      filterAttendees(data, {
        search: searchQuery,
        region: selectedRegion,
        exactMatch,
        status: statusFilter,
        category: categoryFilter,
      })
    } catch (error) {
      console.error("[v0] Error loading attendees:", error)
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * Smart matching logic.
   * - Exact mode: full string must equal full name OR full ticket.
   * - Default: query is split into tokens; every token must match
   *   either name or ticket.
   *   - VERY short tokens (<=2 chars) are **only** checked against ticket
   *     to avoid "Kuya B" → "Kuya Bernard Macas" type matches.
   */
  const matchesSearch = (att: Attendee, tokens: string[], isExact: boolean): boolean => {
    if (tokens.length === 0) return true

    const name = (att.name ?? "").toLowerCase()
    const ticket = (att.ticketNumber ?? "").toLowerCase()

    if (isExact) {
      const q = tokens.join(" ")
      return name === q || ticket === q
    }

    return tokens.every((token) => {
      if (token.length <= 2) {
        return ticket.includes(token)
      }
      return name.includes(token) || ticket.includes(token)
    })
  }

  const filterAttendees = (
    attendeeList: Attendee[],
    opts: {
      search: string
      region: string
      exactMatch: boolean
      status: StatusFilter
      category: string
    },
  ): Attendee[] => {
    const { search, region, exactMatch: isExact, status, category } = opts

    const tokens = search
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)

    let filtered = attendeeList

    // search filter
    if (tokens.length > 0) {
      filtered = filtered.filter((att) => matchesSearch(att, tokens, isExact))
    }

    // region filter
    if (region !== "All Regions") {
      filtered = filtered.filter((att) => att.region === region)
    }

    // category filter
    if (category !== "All Categories") {
      filtered = filtered.filter((att) => (att.category ?? "") === category)
    }

    // status filter
    if (status === "Checked In") {
      filtered = filtered.filter((att) => !!att.checkedIn)
    } else if (status === "Pending") {
      filtered = filtered.filter((att) => !att.checkedIn)
    }

    setFilteredAttendees(filtered)
    return filtered
  }

  const syncPathSelection = (list: Attendee[], search: string, isExact: boolean) => {
    const tokens = search
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)

    if (tokens.length === 0) {
      setSelectedSeatForPath(null)
      setSelectedAttendeeIsVip(false)
      return
    }

    const match = list.find((att) => matchesSearch(att, tokens, isExact))
    setSelectedSeatForPath(match?.assignedSeat ?? null)
    setSelectedAttendeeIsVip(match?.category === "VIP")
  }

  const recomputeFilters = (
    overrides?: Partial<{
      search: string
      region: string
      exactMatch: boolean
      status: StatusFilter
      category: string
    }>,
  ) => {
    const opts = {
      search: overrides?.search ?? searchQuery,
      region: overrides?.region ?? selectedRegion,
      exactMatch: overrides?.exactMatch ?? exactMatch,
      status: overrides?.status ?? statusFilter,
      category: overrides?.category ?? categoryFilter,
    }

    const filtered = filterAttendees(attendees, opts)
    syncPathSelection(filtered, opts.search, opts.exactMatch)
    setCurrentPage(1)
  }

  const handleSearch = (query: string) => {
    setSearchQuery(query)
    recomputeFilters({ search: query })
  }

  const handleRegionChange = (region: string) => {
    setSelectedRegion(region)
    recomputeFilters({ region })
  }

  const handleExactMatchToggle = (value: boolean) => {
    setExactMatch(value)
    recomputeFilters({ exactMatch: value })
  }

  const handleStatusChange = (value: StatusFilter) => {
    setStatusFilter(value)
    recomputeFilters({ status: value })
  }

  const handleCategoryChange = (value: string) => {
    setCategoryFilter(value)
    recomputeFilters({ category: value })
  }

  const handleDelete = async (attendeeId: string) => {
    if (!confirm("Are you sure you want to delete this attendee?")) return

    try {
      await deleteAttendee(attendeeId)
      const updated = attendees.filter((att) => att.id !== attendeeId)
      setAttendees(updated)

      const filtered = filterAttendees(updated, {
        search: searchQuery,
        region: selectedRegion,
        exactMatch,
        status: statusFilter,
        category: categoryFilter,
      })

      if (!filtered.some((att) => att.assignedSeat === selectedSeatForPath)) {
        setSelectedSeatForPath(null)
        setSelectedAttendeeIsVip(false)
      }
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

  const totalPages = Math.ceil(filteredAttendees.length / ITEMS_PER_PAGE) || 1
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const endIndex = startIndex + ITEMS_PER_PAGE
  const paginatedAttendees = filteredAttendees.slice(startIndex, endIndex)

  const handleFirstPage = () => setCurrentPage(1)
  const handlePrevPage = () => setCurrentPage((prev) => Math.max(1, prev - 1))
  const handleNextPage = () => setCurrentPage((prev) => Math.min(totalPages, prev + 1))
  const handleLastPage = () => setCurrentPage(totalPages)

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
      <div className="flex gap-3 flex-wrap">
        <Button onClick={() => setShowCSVImport(true)} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
          <Upload className="w-4 h-4" />
          Import CSV
        </Button>
        <Button onClick={() => setShowAddDialog(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
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
      </div>

      {/* Filters + stats */}
      <Card className="bg-white border-slate-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-slate-900 mb-2">
              Search by Name or Ticket
            </label>
            <Input
              placeholder="Search attendees..."
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
              <span>Exact match (full name or ticket only)</span>
            </label>
          </div>

          {/* Region filter */}
          <div>
            <label className="block text-sm font-medium text-slate-900 mb-2">Filter by Region</label>
            <select
              value={selectedRegion}
              onChange={(e) => handleRegionChange(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {regions.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </select>
          </div>

          {/* Category filter */}
          <div>
            <label className="block text-sm font-medium text-slate-900 mb-2">Filter by Category</label>
            <select
              value={categoryFilter}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="All Categories">All Categories</option>
              {CATEGORY_OPTIONS.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          {/* Status filter */}
          <div>
            <label className="block text-sm font-medium text-slate-900 mb-2">Filter by Status</label>
            <select
              value={statusFilter}
              onChange={(e) => handleStatusChange(e.target.value as StatusFilter)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="All">All</option>
              <option value="Checked In">Checked In</option>
              <option value="Pending">Pending</option>
            </select>
          </div>
        </div>

      </Card>

      {/* Pathfinding preview */}
      {selectedSeatForPath && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-slate-900">Venue Map with Shortest Path</h3>
          <PathfindingVisualization
            seatId={selectedSeatForPath}
            isVip={selectedAttendeeIsVip}
            imagesrc="/images/design-mode/9caa3868-4cd5-468f-9fe7-4dc613433d03.jfif.jpeg"
            showBackground={true}
          />
        </div>
      )}

      {/* Table */}
      <Card className="bg-white border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Name</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Ticket</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Check-in Time</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Region</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Category</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Table</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Status</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedAttendees.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-slate-600">
                    No attendees found
                  </td>
                </tr>
              ) : (
                paginatedAttendees.map((attendee) => (
                  <tr key={attendee.id} className="border-b border-slate-200 hover:bg-slate-50">
                    <td className="px-6 py-4 text-sm text-slate-900 font-medium">{attendee.name}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{attendee.ticketNumber}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {formatCheckInTime((attendee as any).checkedInTime)}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">{attendee.region}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{attendee.category || "-"}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {attendee.assignedSeat ? `Table ${attendee.assignedSeat}` : "Unassigned"}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          attendee.checkedIn ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
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
                          onClick={() => handleDelete(attendee.id!)}
                          className="text-red-600 hover:text-red-700 p-1"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex items-center justify-between">
          <div className="text-sm text-slate-600">
            Showing {startIndex + 1}-{Math.min(endIndex, filteredAttendees.length)} of{" "}
            {filteredAttendees.length} delegates
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
