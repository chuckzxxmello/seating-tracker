"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { X, Save } from "lucide-react"
import { updateAttendee, logAudit, checkTableCapacity, cancelCheckIn } from "@/lib/firebase-service"

interface Attendee {
  id: string
  name: string
  ticketNumber: string
  region: string
  category: string
  table?: number
  assignedSeat?: number
  checkedIn: boolean
  email?: string // keep optional, but we won't edit or validate it
}

interface AttendeeEditorProps {
  attendee: Attendee
  onClose: () => void
  onSave: () => void
  adminEmail: string
}

type EditData = Attendee & {
  customCategory?: string
}

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

export function AttendeeEditor({ attendee, onClose, onSave, adminEmail }: AttendeeEditorProps) {
  // Initialize state similar to AddAttendee, but mapping existing attendee data
  const [editData, setEditData] = useState<EditData>(() => {
    const isKnownCategory =
      !!attendee.category &&
      CATEGORY_OPTIONS.some(
        (opt) => opt.value === attendee.category && opt.value !== "Others",
      )

    // If category is one of our known options (except "Others"), no custom text
    if (isKnownCategory) {
      return {
        ...attendee,
        customCategory: "",
      }
    }

    // If category is empty
    if (!attendee.category) {
      return {
        ...attendee,
        category: "",
        customCategory: "",
      }
    }

    // Otherwise, treat as custom: show "Others" and put original value into textbox
    return {
      ...attendee,
      category: "Others",
      customCategory: attendee.category,
    }
  })

  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    const trimmedCustom = (editData.customCategory || "").trim()
    const categoryToSave =
      editData.category === "Others" ? trimmedCustom : editData.category

    // Extra validation for "Others" same as AddAttendee
    if (editData.category === "Others" && !trimmedCustom) {
      setError("Please specify the category in the textbox.")
      return
    }

    // Minimal manual validation – NO email validation here
    const errors: string[] = []
    if (!editData.name.trim()) errors.push("Full name is required")
    if (!editData.region) errors.push("Region is required")
    if (!categoryToSave) errors.push("Category is required")

    if (errors.length) {
      setError(errors.join(", "))
      return
    }

    // Only check capacity when assigned seat changes
    if (editData.assignedSeat && editData.assignedSeat !== attendee.assignedSeat) {
      try {
        const isVIP = categoryToSave === "VIP"
        const tableNumber = editData.assignedSeat
        const capacity = await checkTableCapacity(tableNumber, isVIP)

        if (capacity.isFull) {
          setError(
            `Table ${tableNumber} is at full capacity (${capacity.max} seats). Cannot assign seat.`,
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
      setIsSaving(true)
      setError(null)

      await updateAttendee(attendee.id, {
        name: editData.name.trim(),
        // email removed from update payload – we no longer edit it
        region: editData.region,
        category: categoryToSave, // store final category (custom if needed)
        assignedSeat: editData.assignedSeat || null,
      })

      await logAudit(
        "admin_edit_attendee",
        adminEmail,
        editData.ticketNumber,
        editData.assignedSeat || null,
        {
          changes: {
            name: editData.name !== attendee.name ? editData.name : undefined,
            region: editData.region !== attendee.region ? editData.region : undefined,
            category: categoryToSave !== attendee.category ? categoryToSave : undefined,
            assignedSeat:
              editData.assignedSeat !== attendee.assignedSeat
                ? editData.assignedSeat
                : undefined,
          },
        },
      )

      onSave()
      onClose()
    } catch (err) {
      console.error("[v0] Error saving attendee:", err)
      setError("Failed to save changes. Please try again.")
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancelCheckIn = async () => {
    if (!confirm("Are you sure you want to cancel this check-in?")) return

    try {
      setIsSaving(true)
      setError(null)

      await cancelCheckIn(attendee.id)
      await logAudit(
        "cancel_check_in",
        adminEmail,
        editData.ticketNumber,
        editData.assignedSeat || null,
        {
          reason: "Admin cancelled check-in",
        },
      )

      setEditData({ ...editData, checkedIn: false })
      onSave()
    } catch (err) {
      console.error("[v0] Error cancelling check-in:", err)
      setError("Failed to cancel check-in. Please try again.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between p-6 border-b border-blue-200 sticky top-0 bg-white">
          <h2 className="text-2xl font-bold text-slate-900">Edit Attendee</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-300 rounded-lg p-4">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          {/* Personal Information Section */}
          <div>
            <h3 className="text-lg font-semibold text-slate-900 mb-4">
              Personal Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-slate-700 text-sm font-medium block mb-2">
                  Full Name
                </label>
                <Input
                  value={editData.name}
                  onChange={(e) =>
                    setEditData({ ...editData, name: e.target.value })
                  }
                  className="bg-white border-blue-200"
                  placeholder="Enter full name"
                />
              </div>
              <div>
                <label className="text-slate-700 text-sm font-medium block mb-2">
                  Ticket Number
                </label>
                <Input
                  disabled
                  value={editData.ticketNumber}
                  className="bg-gray-50 border-blue-200"
                />
                <p className="text-slate-500 text-xs mt-1">
                  Ticket number cannot be changed
                </p>
              </div>
              <div>
                <label className="text-slate-700 text-sm font-medium block mb-2">
                  Region
                </label>
                <select
                  value={editData.region}
                  onChange={(e) =>
                    setEditData({ ...editData, region: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-white border border-blue-200 rounded-md text-slate-900 text-sm"
                >
                  <option value="">Select Region</option>
                  <option value="Luzon">Luzon</option>
                  <option value="Visayas">Visayas</option>
                  <option value="Mindanao">Mindanao</option>
                  <option value="International">International</option>
                </select>
              </div>

              {/* Category (mirrors AddAttendee behaviour) */}
              <div className="md:col-span-2">
                <label className="text-slate-700 text-sm font-medium block mb-2">
                  Category
                </label>
                <select
                  value={editData.category}
                  onChange={(e) =>
                    setEditData({
                      ...editData,
                      category: e.target.value,
                      // reset custom category if they leave "Others"
                      customCategory:
                        e.target.value === "Others"
                          ? editData.customCategory
                          : "",
                    })
                  }
                  className="w-full px-3 py-2 bg-white border border-blue-200 rounded-md text-slate-900 text-sm"
                >
                  <option value="">Select Category</option>
                  {CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>

                {editData.category === "Others" && (
                  <div className="mt-3">
                    <label className="text-slate-700 text-xs font-medium block mb-1">
                      Specify Category
                    </label>
                    <Input
                      value={editData.customCategory || ""}
                      onChange={(e) =>
                        setEditData({
                          ...editData,
                          customCategory: e.target.value,
                        })
                      }
                      className="bg-white border-blue-200"
                      placeholder="Enter custom category"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Seating Arrangement Section */}
          <div className="border-t border-blue-200 pt-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">
              Seating Arrangement
            </h3>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="text-slate-700 text-sm font-medium block mb-2">
                  Assigned Seat (Table Number)
                </label>
                <Input
                  type="number"
                  min="1"
                  max="80"
                  value={editData.assignedSeat || ""}
                  onChange={(e) =>
                    setEditData({
                      ...editData,
                      assignedSeat: e.target.value
                        ? Number.parseInt(e.target.value)
                        : undefined,
                    })
                  }
                  className="bg-white border-blue-200"
                  placeholder="Enter seat number (1-80)"
                />
                <p className="text-slate-500 text-xs mt-1">
                  {editData.category === "VIP"
                    ? "VIP tables have 30 seats capacity"
                    : "Normal tables have 10 seats capacity"}
                </p>
              </div>
            </div>
          </div>

          {/* Check-in Status */}
          <div className="border-t border-blue-200 pt-6">
            <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div>
                <p className="text-slate-900 font-medium text-sm">
                  Check-in Status
                </p>
                <p className="text-slate-600 text-xs mt-1">
                  {editData.checkedIn ? "Checked in" : "Pending check-in"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div
                  className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    editData.checkedIn
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {editData.checkedIn ? "Checked In" : "Pending"}
                </div>
                {editData.checkedIn && (
                  <Button
                    onClick={handleCancelCheckIn}
                    disabled={isSaving}
                    variant="outline"
                    size="sm"
                    className="border-red-300 text-red-600 hover:bg-red-50 bg-transparent"
                  >
                    Cancel Check-in
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-blue-200 bg-blue-50 flex gap-3 justify-end sticky bottom-0">
          <Button
            onClick={onClose}
            variant="outline"
            className="border-blue-200 text-blue-600 bg-transparent"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
          >
            <Save className="w-4 h-4" />
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
    </Card>
  )
}
