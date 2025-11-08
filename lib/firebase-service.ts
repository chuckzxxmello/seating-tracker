import { firestore, isFirebaseInitialized } from "./firebase"
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  writeBatch,
  Timestamp,
  getDoc,
  orderBy,
} from "firebase/firestore"

export interface Attendee {
  id: string
  ticketNumber: string
  name: string
  email: string
  region: string
  category: string
  assignedSeat: number | null
  table: number | null
  tableCapacity?: number
  checkedIn: boolean
  checkedInTime: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface SeatInfo {
  seatNumber: number
  assignedTo: string | null
  category: string
  available: boolean
  createdAt: Date
  updatedAt: Date
}

// Helper to convert Firestore timestamps to JS dates
function convertTimestamps(data: any): any {
  const converted = { ...data }
  Object.keys(converted).forEach((key) => {
    if (converted[key]?.toDate) {
      converted[key] = converted[key].toDate()
    }
  })
  return converted
}

const ensureFirebaseInitialized = () => {
  if (!firestore) {
    throw new Error(
      "Firebase is not initialized. Please configure Firebase environment variables in your Vercel project settings.",
    )
  }
}

// Attendee operations
export async function getAttendees(): Promise<Attendee[]> {
  try {
    ensureFirebaseInitialized()
    const q = query(collection(firestore!, "attendees"), orderBy("createdAt", "desc"))
    const snapshot = await getDocs(q)
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...convertTimestamps(doc.data()),
    })) as Attendee[]
  } catch (error) {
    console.error("[v0] Error fetching attendees:", error)
    throw error
  }
}

export async function searchAttendees(searchTerm: string): Promise<Attendee[]> {
  try {
    ensureFirebaseInitialized()
    const q = query(collection(firestore!, "attendees"))
    const snapshot = await getDocs(q)
    const allAttendees = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...convertTimestamps(doc.data()),
    })) as Attendee[]

    const lowerSearch = searchTerm.toLowerCase()
    return allAttendees.filter(
      (att) => att.name.toLowerCase().includes(lowerSearch) || att.ticketNumber.toLowerCase().includes(lowerSearch),
    )
  } catch (error) {
    console.error("[v0] Error searching attendees:", error)
    throw error
  }
}

export async function getAttendeeByTicket(ticketNumber: string): Promise<Attendee | null> {
  try {
    ensureFirebaseInitialized()
    const q = query(collection(firestore!, "attendees"), where("ticketNumber", "==", ticketNumber.toUpperCase()))
    const snapshot = await getDocs(q)
    if (snapshot.empty) return null

    const doc = snapshot.docs[0]
    return {
      id: doc.id,
      ...convertTimestamps(doc.data()),
    } as Attendee
  } catch (error) {
    console.error("[v0] Error fetching attendee by ticket:", error)
    throw error
  }
}

export async function createAttendee(attendeeData: Omit<Attendee, "id" | "createdAt" | "updatedAt">): Promise<string> {
  try {
    ensureFirebaseInitialized()
    const cleanData = Object.fromEntries(Object.entries(attendeeData).filter(([, value]) => value !== undefined))

    const docRef = await addDoc(collection(firestore!, "attendees"), {
      ...cleanData,
      ticketNumber: cleanData.ticketNumber.toUpperCase(),
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    })
    return docRef.id
  } catch (error) {
    console.error("[v0] Error creating attendee:", error)
    throw error
  }
}

export async function updateAttendee(id: string, updates: Partial<Omit<Attendee, "id" | "createdAt">>): Promise<void> {
  try {
    ensureFirebaseInitialized()
    const docRef = doc(firestore!, "attendees", id)
    await updateDoc(docRef, {
      ...updates,
      updatedAt: Timestamp.now(),
    })
  } catch (error) {
    console.error("[v0] Error updating attendee:", error)
    throw error
  }
}

export async function deleteAttendee(id: string): Promise<void> {
  try {
    ensureFirebaseInitialized()
    const docRef = doc(firestore!, "attendees", id)
    await deleteDoc(docRef)
  } catch (error) {
    console.error("[v0] Error deleting attendee:", error)
    throw error
  }
}

// Check-in operations
export async function checkInAttendee(id: string): Promise<void> {
  try {
    ensureFirebaseInitialized()
    const docRef = doc(firestore!, "attendees", id)
    await updateDoc(docRef, {
      checkedIn: true,
      checkedInTime: Timestamp.now(),
      updatedAt: Timestamp.now(),
    })
  } catch (error) {
    console.error("[v0] Error checking in attendee:", error)
    throw error
  }
}

export async function cancelCheckIn(id: string): Promise<void> {
  try {
    ensureFirebaseInitialized()
    const docRef = doc(firestore!, "attendees", id)
    await updateDoc(docRef, {
      checkedIn: false,
      checkedInTime: null,
      updatedAt: Timestamp.now(),
    })
    console.log("[v0] Check-in cancelled successfully")
  } catch (error) {
    console.error("[v0] Error cancelling check-in:", error)
    throw error
  }
}

// Seat operations
export async function getSeatInfo(seatNumber: number): Promise<SeatInfo | null> {
  try {
    ensureFirebaseInitialized()
    const docRef = doc(firestore!, "seats", String(seatNumber))
    const snapshot = await getDoc(docRef)
    if (!snapshot.exists()) return null

    return {
      seatNumber,
      ...convertTimestamps(snapshot.data()),
    } as SeatInfo
  } catch (error) {
    console.error("[v0] Error fetching seat info:", error)
    throw error
  }
}

// Table operations
export async function checkTableCapacity(
  tableNumber: number,
  isVIP: boolean,
): Promise<{
  current: number
  max: number
  available: number
  isFull: boolean
}> {
  try {
    ensureFirebaseInitialized()
    const q = query(collection(firestore!, "attendees"), where("assignedSeat", "==", tableNumber))
    const snapshot = await getDocs(q)

    const maxCapacity = isVIP ? 30 : 10
    const currentOccupancy = snapshot.size
    const available = maxCapacity - currentOccupancy

    return {
      current: currentOccupancy,
      max: maxCapacity,
      available,
      isFull: available <= 0,
    }
  } catch (error) {
    console.error("[v0] Error checking table capacity:", error)
    throw error
  }
}

export async function assignSeatToAttendee(attendeeId: string, tableNumber: number, isVIP: boolean): Promise<void> {
  try {
    ensureFirebaseInitialized()
    const capacity = await checkTableCapacity(tableNumber, isVIP)
    if (capacity.isFull) {
      throw new Error(`Table ${tableNumber} is at full capacity (${capacity.max}/${capacity.max} seats occupied)`)
    }

    const batch = writeBatch(firestore!)

    const attendeeRef = doc(firestore!, "attendees", attendeeId)
    batch.update(attendeeRef, {
      table: tableNumber,
      tableCapacity: isVIP ? 30 : 10,
      updatedAt: Timestamp.now(),
    })

    await batch.commit()
    console.log(`[v0] Assigned attendee to table ${tableNumber}. Capacity: ${capacity.current + 1}/${capacity.max}`)
  } catch (error) {
    console.error("[v0] Error assigning seat:", error)
    throw error
  }
}

// Audit logging
export async function logAudit(
  action: string,
  performedBy: string,
  targetTicketNumber: string,
  seatNumber: number | null,
  details: any,
): Promise<void> {
  try {
    ensureFirebaseInitialized()
    await addDoc(collection(firestore!, "auditLogs"), {
      action,
      performedBy,
      targetTicketNumber,
      seatNumber,
      details,
      timestamp: Timestamp.now(),
    })
  } catch (error) {
    console.error("[v0] Error logging audit:", error)
  }
}

// Batch import function for CSV attendees
export async function batchImportAttendees(
  attendeesList: Array<{
    ticketNumber: string
    name: string
    email: string
    region: string
    category: string
    table?: number
    seat?: number
  }>,
): Promise<{ successful: number; failed: number; errors: string[] }> {
  try {
    ensureFirebaseInitialized()
    const batch = writeBatch(firestore!)
    const errors: string[] = []
    let successful = 0
    let failed = 0

    for (const attendee of attendeesList) {
      try {
        const docRef = doc(firestore!, "attendees", attendee.ticketNumber.toUpperCase())

        batch.set(docRef, {
          ticketNumber: attendee.ticketNumber.toUpperCase(),
          name: attendee.name,
          email: attendee.email,
          region: attendee.region,
          category: attendee.category,
          table: attendee.table || null,
          assignedSeat: attendee.seat || null,
          checkedIn: false,
          checkedInTime: null,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        })
        successful++
      } catch (err) {
        failed++
        errors.push(`Failed to import ${attendee.ticketNumber}: ${err}`)
      }
    }

    await batch.commit()
    return { successful, failed, errors }
  } catch (error) {
    console.error("[v0] Error batch importing attendees:", error)
    throw error
  }
}

// Analytics functions
export async function getCheckInStats(): Promise<{
  totalAttendees: number
  checkedIn: number
  pending: number
  checkInPercentage: number
}> {
  try {
    ensureFirebaseInitialized()
    const q = query(collection(firestore!, "attendees"))
    const snapshot = await getDocs(q)
    const attendees = snapshot.docs.map((doc) => doc.data())

    const totalAttendees = attendees.length
    const checkedIn = attendees.filter((a: any) => a.checkedIn).length
    const pending = totalAttendees - checkedIn
    const checkInPercentage = totalAttendees > 0 ? Math.round((checkedIn / totalAttendees) * 100) : 0

    return { totalAttendees, checkedIn, pending, checkInPercentage }
  } catch (error) {
    console.error("[v0] Error fetching check-in stats:", error)
    throw error
  }
}

export async function getRegionDistribution(): Promise<Record<string, number>> {
  try {
    ensureFirebaseInitialized()
    const q = query(collection(firestore!, "attendees"))
    const snapshot = await getDocs(q)
    const distribution: Record<string, number> = {
      Luzon: 0,
      Visayas: 0,
      Mindanao: 0,
      International: 0,
    }

    snapshot.docs.forEach((doc) => {
      const region = doc.data().region
      if (distribution.hasOwnProperty(region)) {
        distribution[region]++
      }
    })

    return distribution
  } catch (error) {
    console.error("[v0] Error fetching region distribution:", error)
    throw error
  }
}

export async function getCategoryDistribution(): Promise<Record<string, number>> {
  try {
    ensureFirebaseInitialized()
    const q = query(collection(firestore!, "attendees"))
    const snapshot = await getDocs(q)
    const distribution: Record<string, number> = {}

    snapshot.docs.forEach((doc) => {
      const category = doc.data().category
      distribution[category] = (distribution[category] || 0) + 1
    })

    return distribution
  } catch (error) {
    console.error("[v0] Error fetching category distribution:", error)
    throw error
  }
}

export async function getNoShowsCount(): Promise<number> {
  try {
    ensureFirebaseInitialized()
    const q = query(collection(firestore!, "attendees"), where("checkedIn", "==", false))
    const snapshot = await getDocs(q)
    return snapshot.size
  } catch (error) {
    console.error("[v0] Error fetching no-shows count:", error)
    throw error
  }
}

export { isFirebaseInitialized }
