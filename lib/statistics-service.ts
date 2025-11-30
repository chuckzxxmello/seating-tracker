import { firestore } from "./firebase"
import { collection, query, where, getDocs } from "firebase/firestore"

export interface EventStatistics {
  totalAttendees: number
  seatsFilled: number
  pendingCheckIns: number
  checkedInCount: number        // ✅ total check-ins
  checkInPercentage: number
  regionDistribution: Record<string, number>
  categoryDistribution: Record<string, number>
  lastUpdated: Date
}

interface AttendeeDoc {
  checkedIn?: boolean
  assignedSeat?: number | null
  region?: string
  category?: string
}

export async function getEventStatistics(): Promise<EventStatistics> {
  try {
    const q = query(collection(firestore, "attendees"))
    const snapshot = await getDocs(q)
    const attendees = snapshot.docs.map((doc) => doc.data() as AttendeeDoc)

    const totalAttendees = attendees.length
    const checkedInCount = attendees.filter((a) => a.checkedIn === true).length
    const seatsFilled = attendees.filter((a) => a.assignedSeat != null).length
    const pendingCheckIns = totalAttendees - checkedInCount
    const checkInPercentage =
      totalAttendees > 0 ? Math.round((checkedInCount / totalAttendees) * 100) : 0

    // Region distribution
    const regionDistribution: Record<string, number> = {
      Luzon: 0,
      Visayas: 0,
      Mindanao: 0,
      International: 0,
    }

    attendees.forEach((a) => {
      if (a.region && regionDistribution.hasOwnProperty(a.region)) {
        regionDistribution[a.region]++
      }
    })

    // Category distribution
    const categoryDistribution: Record<string, number> = {}
    attendees.forEach((a) => {
      if (!a.category) return
      categoryDistribution[a.category] = (categoryDistribution[a.category] || 0) + 1
    })

    return {
      totalAttendees,
      seatsFilled,
      pendingCheckIns,
      checkedInCount,
      checkInPercentage,
      regionDistribution,
      categoryDistribution,
      lastUpdated: new Date(),
    }
  } catch (error) {
    console.error("[v0] Error fetching event statistics:", error)
    throw error
  }
}

export async function getTotalAttendees(): Promise<number> {
  try {
    const q = query(collection(firestore, "attendees"))
    const snapshot = await getDocs(q)
    return snapshot.size
  } catch (error) {
    console.error("[v0] Error fetching total attendees:", error)
    return 0
  }
}

export async function getSeatsFilled(): Promise<number> {
  try {
    const q = query(collection(firestore, "attendees"), where("assignedSeat", "!=", null))
    const snapshot = await getDocs(q)
    return snapshot.size
  } catch (error) {
    console.error("[v0] Error fetching seats filled:", error)
    return 0
  }
}

export async function getPendingCheckIns(): Promise<number> {
  try {
    const q = query(collection(firestore, "attendees"), where("checkedIn", "==", false))
    const snapshot = await getDocs(q)
    return snapshot.size
  } catch (error) {
    console.error("[v0] Error fetching pending check-ins:", error)
    return 0
  }
}
