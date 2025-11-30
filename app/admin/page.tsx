"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, User } from "firebase/auth";

import { VenueMapEditor } from "@/components/venue-map-editor";
import { AdminAttendeesList } from "@/components/admin-attendees-list";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, AlertCircle, Users, TrendingUp, LogOut } from "lucide-react";
import { PathfindingVisualization } from "@/components/pathfinding-visualization";
import {
  getAttendees,
  getCheckInStats,
  updateAttendee,
} from "@/lib/firebase-service";
import { RealTimeStatistics } from "@/components/real-time-statistics";
import { auth } from "@/lib/firebase";

const AdminPage = () => {
  const router = useRouter();

  // 🔐 auth-related state
  const [authLoading, setAuthLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [activeTab, setActiveTab] = useState("attendees");

  const [searchSeat, setSearchSeat] = useState("");
  const [selectedAttendees, setSelectedAttendees] = useState<any[]>([]);
  const [searchedSeat, setSearchedSeat] = useState<number | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isReassigning, setIsReassigning] = useState<string | null>(null);
  const [newSeatNumber, setNewSeatNumber] = useState("");
  const [stats, setStats] = useState({
    checkedIn: 0,
    pending: 0,
    checkInRate: 0,
  });

  // ✅ Protect /admin on the client
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setCurrentUser(null);
        setAuthLoading(false);
        router.replace("/login");
      } else {
        setCurrentUser(user);
        setAuthLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (activeTab === "delegates") {
      loadStats();
      const interval = setInterval(loadStats, 30000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  const loadStats = async () => {
    try {
      const data = await getCheckInStats();
      setStats({
        checkedIn: data.checkedIn,
        pending: data.pending,
        checkInRate: data.checkInPercentage,
      });
    } catch (err) {
      console.error("Failed to load stats:", err);
    }
  };

  const handleSearch = async () => {
    setIsSearching(true);
    setError(null);
    setIsReassigning(null);

    try {
      const seatNumber = Number.parseInt(searchSeat);
      if (isNaN(seatNumber) || seatNumber < 1 || seatNumber > 80) {
        setError("Please enter a valid seat number (1-80)");
        setIsSearching(false);
        return;
      }

      const attendees = await getAttendees();

      // This will return BOTH VIP and regular if they share the same assignedSeat
      const seatedAttendees = attendees.filter(
        (a) => a.assignedSeat === seatNumber,
      );

      if (seatedAttendees.length > 0) {
        setSearchedSeat(seatNumber);
        setSelectedAttendees(seatedAttendees);
      } else {
        setError("No attendee assigned to that seat");
        setSelectedAttendees([]);
        setSearchedSeat(null);
      }
    } catch (err) {
      console.error("Seat lookup failed:", err);
      setError("Failed to lookup seat. Please try again.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleReassign = async (attendeeId: string) => {
    if (!newSeatNumber) return;

    const newSeat = Number.parseInt(newSeatNumber);
    if (isNaN(newSeat) || newSeat < 1 || newSeat > 80) {
      setError("Please enter a valid seat number (1-80)");
      return;
    }

    try {
      setIsSearching(true);
      setError(null);

      const attendee = selectedAttendees.find((a) => a.id === attendeeId);
      await updateAttendee(attendeeId, {
        assignedSeat: newSeat,
      });

      alert(`Successfully reassigned ${attendee?.name} to Seat ${newSeat}`);
      setIsReassigning(null);
      setNewSeatNumber("");

      await handleSearch();
    } catch (err) {
      console.error("Reassignment failed:", err);
      setError("Failed to reassign seat. Please try again.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Logout failed:", err);
    } finally {
      router.push("/login");
    }
  };

  // 🔄 While checking auth, don't render the dashboard
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-500 text-sm">Checking admin session…</p>
      </div>
    );
  }

  // Extra guard: if no user after loading, render nothing (redirect already triggered)
  if (!currentUser) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <header className="bg-white shadow-sm border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900">
                Admin
              </h1>
              <p className="text-slate-600 mt-1 text-xs md:text-sm">
                Manage attendees and seat assignments
              </p>
            </div>
            <Button
              onClick={handleLogout}
              variant="destructive"
              size="sm"
              className="w-full sm:w-auto"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
        <div className="mb-6">
          <div className="flex border-b border-slate-200 gap-4 md:gap-8 overflow-x-auto">
            <button
              onClick={() => setActiveTab("delegates")}
              className={`px-3 md:px-4 py-3 font-medium border-b-2 transition-colors whitespace-nowrap text-sm md:text-base ${
                activeTab === "delegates"
                  ? "text-blue-600 border-blue-600"
                  : "text-slate-600 border-transparent hover:text-slate-900"
              }`}
            >
              Dashboard
            </button>

            <button
              onClick={() => setActiveTab("attendees")}
              className={`px-3 md:px-4 py-3 font-medium border-b-2 transition-colors whitespace-nowrap text-sm md:text-base ${
                activeTab === "attendees"
                  ? "text-blue-600 border-blue-600"
                  : "text-slate-600 border-transparent hover:text-slate-900"
              }`}
            >
              Delegates
            </button>

            <button
              onClick={() => setActiveTab("venue-map")}
              className={`px-3 md:px-4 py-3 font-medium border-b-2 transition-colors whitespace-nowrap text-sm md:text-base ${
                activeTab === "venue-map"
                  ? "text-blue-600 border-blue-600"
                  : "text-slate-600 border-transparent hover:text-slate-900"
              }`}
            >
              Venue Map Editor
            </button>
          </div>
        </div>

        {activeTab === "attendees" && (
          <div className="space-y-6">
            <AdminAttendeesList adminEmail={currentUser?.email ?? ""} />
          </div>
        )}

        {activeTab === "venue-map" && (
          <div className="space-y-4">
            <div className="bg-blue-50 border-l-4 border-blue-600 p-3 md:p-4 rounded text-sm md:text-base">
              <h3 className="font-semibold text-blue-900 mb-1">
                Venue Map Editor
              </h3>
              <p className="text-blue-800 text-xs md:text-sm leading-relaxed">
                You are in the Venue Map Editor section. Here you can
                interactively add custom nodes, assign meaningful labels, and
                manage the venue layout. All changes are automatically persisted
                to Firebase and will be restored when you return to this page.
              </p>
            </div>
            <VenueMapEditor />
          </div>
        )}

        {activeTab === "delegates" && (
          <div className="space-y-6 md:space-y-8">
            <div className="mt-8">
              <RealTimeStatistics />
            </div>

            {error && (
              <Card className="bg-red-50 border-red-300 p-3 md:p-4">
                <p className="text-red-700 text-xs md:text-sm">{error}</p>
              </Card>
            )}

            {searchedSeat && selectedAttendees.length > 0 && (
              <div>
                <Card className="bg-white border-blue-200 p-4 md:p-6 shadow-sm">
                  <h2 className="text-base md:text-lg font-semibold text-slate-900 mb-4 md:mb-6">
                    Table {searchedSeat}
                  </h2>

                  {/* IMPORTANT: ADMIN VIEW → DO NOT pass isVip here */}
                  <PathfindingVisualization
                    seatId={searchedSeat}
                    showBackground={false}
                  />

                  <p className="text-xs md:text-sm text-slate-600 mt-4 p-3 md:p-4 bg-blue-50 rounded-lg leading-relaxed">
                    <strong>{selectedAttendees.length} attendee(s)</strong>{" "}
                    assigned to <strong>Table {searchedSeat}</strong>. VIP and
                    regular tables with this seat number are highlighted above.
                  </p>
                </Card>
              </div>
            )}

            {selectedAttendees.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg md:text-xl font-semibold text-slate-900">
                  All Attendees at Table {searchedSeat} (
                  {selectedAttendees.length} total)
                </h3>
                {selectedAttendees.map((attendee) => (
                  <Card
                    key={attendee.id}
                    className="bg-white border-blue-200 p-4 md:p-6 shadow-sm"
                  >
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
                      <div>
                        <h3 className="text-slate-600 text-xs md:text-sm font-medium mb-3 md:mb-4">
                          Attendee
                        </h3>
                        <p className="text-lg md:text-xl font-bold text-slate-900 mb-2">
                          {attendee.name}
                        </p>
                        <p className="text-slate-600 text-xs md:text-sm">
                          {attendee.ticketNumber}
                        </p>
                      </div>
                      <div>
                        <h3 className="text-slate-600 text-xs md:text-sm font-medium mb-3 md:mb-4">
                          Details
                        </h3>
                        <div className="space-y-1.5 md:space-y-2 text-sm md:text-base">
                          <p className="text-slate-900">
                            <span className="text-slate-600">Region:</span>{" "}
                            {attendee.region}
                          </p>
                          <p className="text-slate-900">
                            <span className="text-slate-600">Category:</span>{" "}
                            {attendee.category}
                          </p>
                          <p className="text-slate-900">
                            <span className="text-slate-600">Status:</span>
                            <span
                              className={
                                attendee.checkedIn
                                  ? "text-emerald-600"
                                  : "text-amber-600"
                              }
                            >
                              {" "}
                              {attendee.checkedIn ? "Checked In" : "Pending"}
                            </span>
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col justify-between">
                        <div>
                          <h3 className="text-slate-600 text-xs md:text-sm font-medium mb-3 md:mb-4">
                            Actions
                          </h3>
                        </div>
                        <div className="space-y-3">
                          {isReassigning !== attendee.id ? (
                            <Button
                              onClick={() => setIsReassigning(attendee.id)}
                              className="w-full bg-blue-600 hover:bg-blue-700 text-white h-10 md:h-11"
                            >
                              Reassign Seat
                            </Button>
                          ) : (
                            <div className="space-y-2">
                              <Input
                                type="number"
                                min="1"
                                max="80"
                                placeholder="New seat number (1-80)"
                                value={newSeatNumber}
                                onChange={(e) =>
                                  setNewSeatNumber(e.target.value)
                                }
                                className="bg-white border-blue-200 h-10 md:h-11"
                              />
                              <div className="flex gap-2">
                                <Button
                                  onClick={() => handleReassign(attendee.id)}
                                  disabled={isSearching}
                                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white h-10 md:h-11"
                                >
                                  Confirm
                                </Button>
                                <Button
                                  onClick={() => {
                                    setIsReassigning(null);
                                    setNewSeatNumber("");
                                  }}
                                  variant="outline"
                                  className="flex-1 border-slate-300 h-10 md:h-11"
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {searchSeat &&
              !isSearching &&
              selectedAttendees.length === 0 && (
                <Card className="bg-white border-blue-200 p-6 md:p-8 text-center shadow-sm">
                  <p className="text-slate-600 text-sm md:text-base">
                    No attendees found at that seat.
                  </p>
                </Card>
              )}
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminPage;