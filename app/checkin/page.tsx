"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Search, CheckCircle2, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { PathfindingVisualization } from "@/components/pathfinding-visualization"
import { searchAttendees, checkInAttendee, cancelCheckIn, logAudit, checkTableCapacity } from "@/lib/firebase-service"
import { useAuth } from "@/lib/auth-context"

export default function CheckinPage() {
  const { user } = useAuth()
  const [searchInput, setSearchInput] = useState("")
  const [selectedAttendee, setSelectedAttendee] = useState<any>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSearch = async () => {
    setIsSearching(true)
    setError(null)
    setSelectedAttendee(null)

    try {
      const results = await searchAttendees(searchInput)
      if (results.length > 0) {
        setSelectedAttendee(results[0])
      } else {
        setError("No attendee found with that search term.")
      }
    } catch (err) {
      console.error("[v0] Search failed:", err)
      setError("Failed to search attendees. Please try again.")
    } finally {
      setIsSearching(false)
    }
  }

  const handleCheckin = async () => {
    if (!selectedAttendee) return

    if (selectedAttendee.assignedSeat) {
      try {
        const isVIP = selectedAttendee.category === "VIP"
        const capacity = await checkTableCapacity(selectedAttendee.assignedSeat, isVIP)

        if (capacity.isFull) {
          setError(
            `Table ${selectedAttendee.assignedSeat} is at full capacity (${capacity.max}/${capacity.max} seats). Cannot check in.`,
          )
          return
        }
      } catch (err) {
        console.error("[v0] Error checking capacity:", err)
        setError("Failed to check table capacity. Please try again.")
        return
      }
    }

    try {
      setIsSearching(true)
      await checkInAttendee(selectedAttendee.id)
      await logAudit("check_in", user?.email || "", selectedAttendee.ticketNumber, selectedAttendee.assignedSeat, {
        name: selectedAttendee.name,
      })

      setSelectedAttendee({ ...selectedAttendee, checkedIn: true })
      setTimeout(() => {
        setSearchInput("")
        setSelectedAttendee(null)
      }, 2000)
    } catch (err) {
      console.error("[v0] Check-in failed:", err)
      setError("Failed to check in. Please try again.")
    } finally {
      setIsSearching(false)
    }
  }

  const handleCancelCheckIn = async () => {
    if (!selectedAttendee || !confirm("Are you sure you want to cancel this check-in?")) return

    try {
      setIsSearching(true)
      setError(null)

      await cancelCheckIn(selectedAttendee.id)
      await logAudit(
        "cancel_check_in",
        user?.email || "",
        selectedAttendee.ticketNumber,
        selectedAttendee.assignedSeat,
        {
          name: selectedAttendee.name,
        },
      )

      setSelectedAttendee({ ...selectedAttendee, checkedIn: false })
    } catch (err) {
      console.error("[v0] Error cancelling check-in:", err)
      setError("Failed to cancel check-in. Please try again.")
    } finally {
      setIsSearching(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50">
      <header className="border-b border-blue-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-4 md:py-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl md:text-3xl font-bold text-slate-900 truncate">Attendee Check-in</h1>
              <p className="text-slate-600 text-xs md:text-sm mt-1 hidden sm:block">
                Search and check in attendees with real-time seat tracking
              </p>
            </div>
            <Link href="/">
              <Button
                variant="outline"
                size="sm"
                className="border-blue-200 text-blue-600 hover:bg-blue-50 bg-transparent flex items-center gap-1 md:gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Back</span>
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-12 space-y-6 md:space-y-8">
        {error && (
          <Card className="bg-red-50 border-red-300 p-3 md:p-4">
            <p className="text-red-700 text-xs md:text-sm">{error}</p>
          </Card>
        )}

        <Card className="bg-white border-blue-200 p-4 md:p-8 shadow-sm">
          <h2 className="text-lg md:text-xl font-semibold text-slate-900 mb-4 md:mb-6">Find My Seat</h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 md:left-4 top-1/2 transform -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-slate-400" />
              <Input
                placeholder="Enter ticket number or name..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                className="pl-10 md:pl-12 bg-white border-blue-200 text-slate-900 placeholder:text-slate-400 h-11 md:h-12 text-base md:text-lg"
              />
            </div>
            <Button
              onClick={handleSearch}
              disabled={!searchInput || isSearching}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 md:px-8 h-11 md:h-12 w-full sm:w-auto"
            >
              {isSearching ? "Searching..." : "Search"}
            </Button>
          </div>
        </Card>

        {selectedAttendee && (
          <Card className="bg-white border-blue-200 p-4 md:p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 md:mb-6">
              <h2 className="text-base md:text-lg font-semibold text-slate-900 leading-tight">
                Venue Map
              </h2>
            <p className="text-xs md:text-sm text-slate-600 p-3 md:p-4 bg-blue-50 rounded-lg leading-relaxed">
              Your assigned seat is{" "}
              <strong className="text-blue-700">Seat {selectedAttendee.assignedSeat || "Not Yet Assigned"}</strong>.
              Look for the highlighted table with the orange circle on the map above.
            </p>
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                {!selectedAttendee.checkedIn ? (
                  <Button
                    onClick={handleCheckin}
                    disabled={isSearching}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white w-full sm:w-auto h-11"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    {isSearching ? "Processing..." : "Mark as Checked In"}
                  </Button>
                ) : (
                  <>
                    <div className="flex items-center justify-center gap-2 text-emerald-600 font-semibold py-2 bg-emerald-50 rounded-md sm:bg-transparent sm:py-0">
                      <CheckCircle2 className="w-5 h-5" />
                      <span className="text-sm md:text-base">Checked In</span>
                    </div>
                    <Button
                      onClick={handleCancelCheckIn}
                      disabled={isSearching}
                      variant="outline"
                      className="border-red-300 text-red-600 hover:bg-red-50 bg-transparent w-full sm:w-auto h-11"
                    >
                      {isSearching ? "Processing..." : "Cancel Check-in"}
                    </Button>
                  </>
                )}
              </div>
            </div>

            {selectedAttendee.assignedSeat && (
              <div className="mb-4">
                <PathfindingVisualization
                  seatId={selectedAttendee.assignedSeat}
                  isVip={selectedAttendee.category === "VIP"}
                  showBackground={false}
                />
              </div>
            )}


          </Card>
        )}
      </main>
    </div>
  )
}
