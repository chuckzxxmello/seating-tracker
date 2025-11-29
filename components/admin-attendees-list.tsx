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

type SearchMode = "smart" | "exact"

export function AdminAttendeesList({ adminEmail = "" }: AdminAttendeesListProps) {
  const [attendees, setAttendees] = useState<Attendee[]>([])
  const [filteredAttendees, setFilteredAttendees] = useState<Attendee[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [searchMode, setSearchMode] = useState<SearchMode>("smart")
  const [selectedRegion, setSelectedRegion] = useState("All Regions")
  const [isLoading, setIsLoading] = useState(true)
  const [editingAttendee, setEditingAttendee] = useState<Attendee | null>(null)
  const [selectedSeatForPath, setSelectedSeatForPath] = useState<number | null>(null)
  const [selectedAttendeeIsVip, setSelectedAttendeeIsVip] = useState(false)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showCSVImport, setShowCSVImport] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)

  const ITEMS_PER_PAGE = 50
  const regions = ["All Regions", "Luzon", "Visayas", "Mindanao", "International"]

  useEffect(() => {
    loadAttendees()
  }, [])

  const loadAttendees = async () => {
    try {
      setIsLoading(true)
      const data = await getAttendees()
      setAttendees(data)
      filterAttendees(data, searchQuery, selectedRegion, searchMode)
    } catch (error) {
      console.error("[v0] Error loading attendees:", error)
    } finally {
      setIsLoading(false)
    }
  }

  // Helper: how to match based on search mode
  const matchesSearch = (att: Attendee, q: string, mode: SearchMode): boolean => {
    const name = att.name?.toLowerCase() ?? ""
    const ticket = att.ticketNumber?.toLowerCase() ?? ""

    if (!q) return true

    if (mode === "exact") {
      // Only match full name or full ticket
      return name === q || ticket === q
    }

    // smart mode → partial contains
    return name.includes(q) || ticket.includes(q)
  }

  /**
   * Filters attendees and updates state.
   * Returns the filtered list so callers can use it immediately (for pathfinding, etc.).
   */
  const filterAttendees = (
    attendeeList: Attendee[],
    search: string,
    region: string,
    mode: SearchMode,
  ): Attendee[] => {
    let filtered = attendeeList

    const q = search.trim().toLowerCase()

    if (q) {
      filtered = filtered.filter((att) => matchesSearch(att, q, mode))
    }

    if (region !== "All Regions") {
      filtered = filtered.filter((att) => att.region === region)
    }

    setFilteredAttendees(filtered)
    return filtered
  }

  const handleSearch = (query: string) => {
    setSearchQuery(query)
    setCurrentPage(1)

    const filtered = filterAttendees(attendees, query, selectedRegion, searchMode)

    if (!query.trim()) {
      setSelectedSeatForPath(null)
      setSelectedAttendeeIsVip(false)
      return
    }

    const q = query.trim().toLowerCase()
    const attendee = filtered.find((att) => matchesSearch(att, q, searchMode))

    setSelectedSeatForPath(attendee?.assignedSeat ?? null)
    setSelectedAttendeeIsVip(attendee?.category === "VIP")
  }

  const handleRegionChange = (region: string) => {
    setSelectedRegion(region)
    setCurrentPage(1)

    const filtered = filterAttendees(attendees, searchQuery, region, searchMode)

    if (!searchQuery.trim()) {
      setSelectedSeatForPath(null)
      setSelectedAttendeeIsVip(false)
      return
    }

    const q = searchQuery.trim().toLowerCase()
    const attendee = filtered.find((att) => matchesSearch(att, q, searchMode))

    setSelectedSeatForPath(attendee?.assignedSeat ?? null)
    setSelectedAttendeeIsVip(attendee?.category === "VIP")
  }

  const handleSearchModeChange = (mode: SearchMode) => {
    setSearchMode(mode)
    setCurrentPage(1)

    const filtered = filterAttendees(attendees, searchQuery, selectedRegion, mode)

    if (!searchQuery.trim()) {
      setSelectedSeatForPath(null)
      setSelectedAttendeeIsVip(false)
      return
    }

    const q = searchQuery.trim().toLowerCase()
    const attendee = filtered.find((att) => matchesSearch(att, q, mode))

    setSelectedSeatForPath(attendee?.assignedSeat ?? null)
    setSelectedAttendeeIsVip(attendee?.category === "VIP")
  }

  const handleDelete = async (attendeeId: string) => {
    if (confirm("Are you sure you want to delete this attendee?")) {
      try {
        await deleteAttendee(attendeeId)
        const updated = attendees.filter((att) => att.id !== attendeeId)
        setAttendees(updated)
        const filtered = filterAttendees(updated, searchQuery, selectedRegion, searchMode)

        if (!filtered.some((att) => att.assignedSeat === selectedSeatForPath)) {
          setSelectedSeatForPath(null)
          setSelectedAttendeeIsVip(false)
        }
      } catch (error) {
        console.error("[v0] Error deleting attendee:", error)
        alert("Failed to delete attendee")
      }
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

  const totalPages = Math.ceil(filteredAttendees.length / ITEMS_PER_PAGE)
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
      {/* Actions */}
      <div className="flex gap-3 flex-wrap">
        <Button onClick={() => setShowCSVImport(true)} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
          <Upload className="w-4 h-4" />
          Import CSV
        </Button>
        <Button onClick={() => setShowAddDialog(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
          <Plus className="w-4 h-4" />
          Add Attendee
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

      {/* Filters + Stats */}
      <Card className="bg-white border-slate-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Search + mode */}
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
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-slate-500">Search mode:</span>
              <select
                value={searchMode}
                onChange={(e) => handleSearchModeChange(e.target.value as SearchMode)}
                className="border border-slate-300 rounded-md bg-white text-xs px-2 py-1 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-600"
              >
                <option value="smart">Contains (Kuya B → Kuya Bernard)</option>
                <option value="exact">Exact (full name / ticket)</option>
              </select>
            </div>
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
        </div>

        <div className="mt-8">
          <RealTimeStatistics />
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
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Region</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Category</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Seat</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Status</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedAttendees.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-600">
                    No attendees found
                  </td>
                </tr>
              ) : (
                paginatedAttendees.map((attendee) => (
                  <tr key={attendee.id} className="border-b border-slate-200 hover:bg-slate-50">
                    <td className="px-6 py-4 text-sm text-slate-900 font-medium">{attendee.name}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{attendee.ticketNumber}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{attendee.region}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{attendee.category || "-"}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {attendee.assignedSeat ? `Seat ${attendee.assignedSeat}` : "Unassigned"}
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
            {filteredAttendees.length} attendees
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
