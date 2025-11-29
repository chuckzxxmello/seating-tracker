"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { X, Save } from "lucide-react";
import { createAttendee } from "@/lib/firebase-service";
import { getVenueMap } from "@/lib/venue-map-service";

interface AddAttendeeDialogProps {
  onClose: () => void;
  onSuccess: () => void;
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
];

export function AddAttendeeDialog({ onClose, onSuccess }: AddAttendeeDialogProps) {
  const [formData, setFormData] = useState({
    name: "",
    ticketNumber: "",
    region: "",
    category: "",
    customCategory: "",
    assignedSeat: null as number | null,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableTables, setAvailableTables] = useState<
    { id: number; label: string; type: string }[]
  >([]);
  const [isLoadingTables, setIsLoadingTables] = useState(true);

  useEffect(() => {
    async function loadTables() {
      try {
        console.log("[v0] AddAttendeeDialog: Loading venue map from Firebase...");
        const venueMap = await getVenueMap();
        if (venueMap && venueMap.nodes) {
          const tables = venueMap.nodes
            .filter((node) => node.type === "table" || node.type === "vip-table")
            .map((node) => {
              const tableNum = Number.parseInt(node.label.match(/\d+/)?.[0] || "0");
              return {
                id: tableNum,
                label: node.label,
                type: node.type === "vip-table" ? "VIP" : "Regular",
              };
            })
            .filter((t) => t.id > 0)
            .sort((a, b) => a.id - b.id);

          console.log("[v0] AddAttendeeDialog: Loaded", tables.length, "tables");
          setAvailableTables(tables);
        }
      } catch (error) {
        console.error("[v0] AddAttendeeDialog: Error loading tables:", error);
      } finally {
        setIsLoadingTables(false);
      }
    }
    loadTables();
  }, []);

  const handleSave = async () => {
    const trimmedCustom = formData.customCategory.trim();
    const categoryToSave =
      formData.category === "Others" ? trimmedCustom : formData.category;

    // Validation (email removed)
    if (
      !formData.name.trim() ||
      !formData.ticketNumber.trim() ||
      !formData.region ||
      !formData.category ||
      (formData.category === "Others" && !trimmedCustom)
    ) {
      setError(
        formData.category === "Others" && !trimmedCustom
          ? "Please specify the category in the textbox."
          : "Please fill in all required fields",
      );
      return;
    }

    try {
      setIsSaving(true);
      setError(null);

      await createAttendee({
        name: formData.name.trim(),
        ticketNumber: formData.ticketNumber.trim(),
        // email removed completely
        region: formData.region,
        category: categoryToSave,
        assignedSeat: formData.assignedSeat,
        table: formData.assignedSeat
          ? Math.ceil(formData.assignedSeat / 8)
          : null,
        checkedIn: false,
        checkedInTime: null,
      });

      onSuccess();
      onClose();
    } catch (err) {
      console.error("[v0] Error creating attendee:", err);
      setError("Failed to add attendee. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between p-6 border-b border-blue-200 sticky top-0 bg-white">
          <h2 className="text-2xl font-bold text-slate-900">
            Add New Attendee
          </h2>
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
              Attendee Personal Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-slate-700 text-sm font-medium block mb-2">
                  Full Name *
                </label>
                <Input
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="bg-white border-blue-200"
                  placeholder="Enter full name"
                />
              </div>
              <div>
                <label className="text-slate-700 text-sm font-medium block mb-2">
                  Ticket Number *
                </label>
                <Input
                  value={formData.ticketNumber}
                  onChange={(e) =>
                    setFormData({ ...formData, ticketNumber: e.target.value })
                  }
                  className="bg-white border-blue-200"
                  placeholder="e.g., T001"
                />
              </div>
              <div>
                <label className="text-slate-700 text-sm font-medium block mb-2">
                  Region *
                </label>
                <select
                  value={formData.region}
                  onChange={(e) =>
                    setFormData({ ...formData, region: e.target.value })
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
              <div className="md:col-span-2">
                <label className="text-slate-700 text-sm font-medium block mb-2">
                  Category *
                </label>
                <select
                  value={formData.category}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      category: e.target.value,
                      customCategory:
                        e.target.value === "Others"
                          ? formData.customCategory
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

                {formData.category === "Others" && (
                  <div className="mt-3">
                    <label className="text-slate-700 text-xs font-medium block mb-1">
                      Specify Category *
                    </label>
                    <Input
                      value={formData.customCategory}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
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

          {/* Seating Section */}
          <div className="border-t border-blue-200 pt-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">
              Seating Assignment
            </h3>
            {isLoadingTables ? (
              <p className="text-slate-500 text-sm">
                Loading available tables...
              </p>
            ) : availableTables.length === 0 ? (
              <p className="text-amber-600 text-sm">
                No tables configured. Please set up the venue map in the admin
                panel first.
              </p>
            ) : (
              <div>
                <label className="text-slate-700 text-sm font-medium block mb-2">
                  Assigned Seat (Optional)
                </label>
                <select
                  value={formData.assignedSeat || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      assignedSeat: e.target.value
                        ? Number.parseInt(e.target.value)
                        : null,
                    })
                  }
                  className="w-full px-3 py-2 bg-white border border-blue-200 rounded-md text-slate-900 text-sm max-h-[200px]"
                >
                  <option value="">No table assigned</option>
                  {availableTables.map((table) => (
                    <option key={table.id} value={table.id}>
                      {table.label} ({table.type})
                    </option>
                  ))}
                </select>
                <p className="text-slate-500 text-xs mt-1">
                  The assigned seat number represents the table number
                </p>
                <p className="text-emerald-600 text-xs mt-1">
                  ✓ Using saved venue layout ({availableTables.length} tables
                  from Firebase)
                </p>
              </div>
            )}
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
            {isSaving ? "Saving..." : "Save Attendee"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
