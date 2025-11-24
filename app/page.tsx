"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, CheckCircle2, Volume2, VolumeX } from "lucide-react";
import Image from "next/image";
import { PathfindingVisualization } from "@/components/pathfinding-visualization";
import {
  searchAttendees,
  checkInAttendee,
  cancelCheckIn,
  logAudit,
  checkTableCapacity,
} from "@/lib/firebase-service";
import { useAuth } from "@/lib/auth-context";

export default function CheckinPage() {
  const { user } = useAuth();
  const [searchInput, setSearchInput] = useState("");
  const [selectedAttendee, setSelectedAttendee] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ambience
  const [ambienceOn, setAmbienceOn] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!audioRef.current) return;
    const audio = audioRef.current;
    audio.volume = 0.15;

    if (ambienceOn) {
      audio
        .play()
        .catch(() => {
          /* ignore autoplay block */
        });
    } else {
      audio.pause();
    }
  }, [ambienceOn]);

  const handleSearch = async () => {
    setIsSearching(true);
    setError(null);
    setSelectedAttendee(null);

    try {
      const results = await searchAttendees(searchInput);
      if (results.length > 0) {
        setSelectedAttendee(results[0]);
      } else {
        setError("No attendee found with that search term.");
      }
    } catch (err) {
      console.error("[v0] Search failed:", err);
      setError("Failed to search attendees. Please try again.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleCheckin = async () => {
    if (!selectedAttendee) return;

    if (selectedAttendee.assignedSeat) {
      try {
        const isVIP = selectedAttendee.category === "VIP";
        const capacity = await checkTableCapacity(
          selectedAttendee.assignedSeat,
          isVIP,
        );

        if (capacity.isFull) {
          setError(
            `Table ${selectedAttendee.assignedSeat} is at full capacity (${capacity.max}/${capacity.max} seats). Cannot check in.`,
          );
          return;
        }
      } catch (err) {
        console.error("[v0] Error checking capacity:", err);
        setError("Failed to check table capacity. Please try again.");
        return;
      }
    }

    try {
      setIsSearching(true);
      await checkInAttendee(selectedAttendee.id);
      await logAudit(
        "check_in",
        user?.email || "",
        selectedAttendee.ticketNumber,
        selectedAttendee.assignedSeat,
        {
          name: selectedAttendee.name,
        },
      );

      setSelectedAttendee({ ...selectedAttendee, checkedIn: true });
      setTimeout(() => {
        setSearchInput("");
        setSelectedAttendee(null);
      }, 2000);
    } catch (err) {
      console.error("[v0] Check-in failed:", err);
      setError("Failed to check in. Please try again.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleCancelCheckIn = async () => {
    if (
      !selectedAttendee ||
      !confirm("Are you sure you want to cancel this check-in?")
    )
      return;

    try {
      setIsSearching(true);
      setError(null);

      await cancelCheckIn(selectedAttendee.id);
      await logAudit(
        "cancel_check_in",
        user?.email || "",
        selectedAttendee.ticketNumber,
        selectedAttendee.assignedSeat,
        {
          name: selectedAttendee.name,
        },
      );

      setSelectedAttendee({ ...selectedAttendee, checkedIn: false });
    } catch (err) {
      console.error("[v0] Error cancelling check-in:", err);
      setError("Failed to cancel check-in. Please try again.");
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="starfield relative min-h-screen bg-background text-foreground">
      {/* bgm (user-activated to avoid autoplay issues) */}
      <audio
        ref={audioRef}
        src="/audio/legacy-night-bgm.mp3" // put your own mp3 here
        loop
      />

      {/* Sticky header (kept simple / invisible) */}
      <header className="sticky top-0 z-20 border-b border-border bg-card/40 backdrop-blur-sm" />

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-10 space-y-6 md:space-y-8">
        <div className="flex justify-center animate-fade-in">
          <Image
            src="/images/home-mark.png"
            alt="Logo"
            width={80}
            height={80}
            className="h-auto w-auto drop-shadow-[0_0_30px_rgba(0,200,255,0.4)]"
          />
        </div>

        {/* Error banner */}
        {error && (
          <Card className="bg-destructive/10 border border-destructive/40 p-3 md:p-4 animate-slide-up">
            <p className="text-destructive text-xs md:text-sm">{error}</p>
          </Card>
        )}

        {/* Search card */}
        <Card className="bg-card/90 border border-border p-4 md:p-8 shadow-lg backdrop-blur-sm animate-slide-up">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-muted-foreground" />
              <Input
                placeholder="Enter ticket number or name..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="pl-10 md:pl-12 h-11 md:h-12 text-base md:text-lg bg-background/40 border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-foreground focus-visible:border-foreground"
              />
            </div>
            <Button
              onClick={handleSearch}
              disabled={!searchInput || isSearching}
              className="w-full sm:w-auto h-11 md:h-12 px-6 md:px-8 bg-primary-foreground text-primary hover:bg-primary-foreground/90 border border-border shadow-md transition-all"
            >
              {isSearching ? "Searching..." : "Search"}
            </Button>
          </div>
        </Card>

        {/* Selected attendee + map + check-in actions */}
        {selectedAttendee && (
          <Card className="bg-card/95 border border-border p-4 md:p-6 shadow-lg space-y-4 md:space-y-6 animate-scale-in">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <h2 className="text-base md:text-lg font-semibold leading-tight">
                Venue Map
              </h2>
              <p className="text-xs md:text-sm bg-muted text-muted-foreground p-3 md:p-4 rounded-lg leading-relaxed">
                Your assigned seat is{" "}
                <strong className="text-primary">
                  Seat {selectedAttendee.assignedSeat || "Not Yet Assigned"}
                </strong>
                . Look for the highlighted table with the orange circle on the
                map below.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                {!selectedAttendee.checkedIn ? (
                  <Button
                    onClick={handleCheckin}
                    disabled={isSearching}
                    className="w-full sm:w-auto h-11 bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    {isSearching ? "Processing..." : "Mark as Checked In"}
                  </Button>
                ) : (
                  <>
                    <div className="flex items-center justify-center gap-2 w-full sm:w-auto py-2 rounded-md bg-emerald-900/30 text-emerald-300">
                      <CheckCircle2 className="w-5 h-5" />
                      <span className="text-sm md:text-base">Checked In</span>
                    </div>
                    <Button
                      onClick={handleCancelCheckIn}
                      disabled={isSearching}
                      variant="outline"
                      className="w-full sm:w-auto h-11 border-destructive/40 text-destructive hover:bg-destructive/10"
                    >
                      {isSearching ? "Processing..." : "Cancel Check-in"}
                    </Button>
                  </>
                )}
              </div>
            </div>

            {selectedAttendee.assignedSeat && (
              <div className="mb-2">
                <PathfindingVisualization
                  seatId={selectedAttendee.assignedSeat}
                  isVip={selectedAttendee.category === "VIP"}
                  showBackground={false}
                />
              </div>
            )}
          </Card>
        )}

        {/* ambience toggle */}
        <div className="fixed bottom-4 right-4 flex items-center gap-2 text-xs md:text-sm text-muted-foreground bg-card/80 border border-border rounded-full px-3 py-2 backdrop-blur-md shadow-lg">
          <button
            type="button"
            onClick={() => setAmbienceOn((v) => !v)}
            className="inline-flex items-center gap-1"
          >
            {ambienceOn ? (
              <>
                <Volume2 className="w-4 h-4" />
                <span>Ambience on</span>
              </>
            ) : (
              <>
                <VolumeX className="w-4 h-4" />
                <span>Ambience off</span>
              </>
            )}
          </button>
        </div>
      </main>
    </div>
  );
}
