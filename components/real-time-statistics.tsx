"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Users, Armchair, Clock, CheckCircle2 } from "lucide-react"
import { getEventStatistics, type EventStatistics } from "@/lib/statistics-service"

export function RealTimeStatistics() {
  const [stats, setStats] = useState<EventStatistics | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const loadStatistics = async () => {
    try {
      const data = await getEventStatistics()
      setStats(data)
    } catch (error) {
      console.error("[v0] Error loading statistics:", error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadStatistics()
    const interval = setInterval(loadStatistics, 5000) // Refresh every 5 seconds
    return () => clearInterval(interval)
  }, [])

  if (isLoading || !stats) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card
            key={i}
            className="bg-white/5 border-slate-800 p-6 shadow-sm animate-pulse"
          >
            <div className="h-4 bg-slate-700 rounded w-1/2 mb-2" />
            <div className="h-8 bg-slate-700 rounded w-1/3" />
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Total Delegates */}
      <Card className="bg-slate-900 border-slate-700 p-6 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-slate-300 text-sm font-medium">Total Delegates</p>
            <p className="text-3xl font-bold text-white mt-2">
              {stats.totalAttendees}
            </p>
            <p className="text-slate-500 text-xs mt-1">Registered</p>
          </div>
          <Users className="w-12 h-12 text-sky-400/30" />
        </div>
      </Card>

      {/* Pending Check-ins */}
      <Card className="bg-slate-900 border-amber-700 p-6 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-slate-300 text-sm font-medium">Pending Check-ins</p>
            <p className="text-3xl font-bold text-white mt-2">
              {stats.pendingCheckIns}
            </p>
            <p className="text-slate-500 text-xs mt-1">Not yet checked in</p>
          </div>
          <Clock className="w-12 h-12 text-amber-400/30" />
        </div>
      </Card>

      {/* Total Check-ins – to the RIGHT of Pending Check-ins */}
      <Card className="bg-slate-900 border-indigo-700 p-6 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-slate-300 text-sm font-medium">Total Check-ins</p>
            <p className="text-3xl font-bold text-white mt-2">
              {stats.checkedInCount}
            </p>
            <p className="text-slate-500 text-xs mt-1">
              Completed ({stats.checkInPercentage}%)
            </p>
          </div>
          <CheckCircle2 className="w-12 h-12 text-indigo-400/30" />
        </div>
      </Card>
    </div>
  )
}
