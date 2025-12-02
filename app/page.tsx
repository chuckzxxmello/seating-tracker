"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, CheckCircle2 } from "lucide-react";
import Image from "next/image";
import { PathfindingVisualization } from "@/components/pathfinding-visualization";
import {
  searchAttendees,
  checkInAttendee,
  logAudit,
  checkTableCapacity,
} from "@/lib/firebase-service";
import { useAuth } from "@/lib/auth-context";

export default function CheckinPage() {
  const { user } = useAuth();
  const [searchInput, setSearchInput] = useState("");
  const [selectedAttendee, setSelectedAttendee] = useState<any>(null);
  const [searchResults, setSearchResults] = useState<any[]>([]); // all matches
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Background music (low volume, starts after first click)
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleFirstInteraction = () => {
      if (audioRef.current) {
        audioRef.current.volume = 0.15;
        audioRef.current.play().catch(() => {
          // ignore autoplay errors
        });
      }
      window.removeEventListener("click", handleFirstInteraction);
    };

    window.addEventListener("click", handleFirstInteraction);
    return () => window.removeEventListener("click", handleFirstInteraction);
  }, []);

  const handleSearch = async () => {
    if (!searchInput.trim()) return;

    setIsSearching(true);
    setError(null);
    setSelectedAttendee(null);
    setSearchResults([]);

    try {
      const results = await searchAttendees(searchInput.trim());

      if (results.length > 0) {
        setSearchResults(results);
        setSelectedAttendee(results[0]); // first result is the “active” one
      } else {
        setError(
          "No attendee found with that ticket number or name. Please check the spelling and try again."
        );
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
          isVIP
        );

        if (capacity.isFull) {
          setError(
            `Table ${selectedAttendee.assignedSeat} is at full capacity (${capacity.max}/${capacity.max} seats). Cannot check in.`
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
        { name: selectedAttendee.name }
      );

      setSelectedAttendee({ ...selectedAttendee, checkedIn: true });
    } catch (err) {
      console.error("[v0] Check-in failed:", err);
      setError("Failed to check in. Please try again.");
    } finally {
      setIsSearching(false);
    }
  };

  // 🔥 collect ALL seat numbers from matches (for PMT / Chuckz scenarios)
  const seatIds: number[] = Array.from(
    new Set(
      searchResults
        .map((att) => att.assignedSeat)
        .filter(
          (seat: any): seat is number =>
            typeof seat === "number" && !Number.isNaN(seat)
        )
    )
  );

  // For visualization: only force VIP/regular if exactly one seat
  const isVipForVisualization =
    seatIds.length === 1 && selectedAttendee
      ? selectedAttendee.category === "VIP"
      : undefined;

  // Text helpers for seats
  const seatsLabel =
    seatIds.length === 0
      ? ""
      : seatIds.length === 1
      ? `Seat ${seatIds[0]}`
      : `Seat ${seatIds.join(", ")}`;

  const seatSentence =
    seatIds.length === 0
      ? "Your seat is not yet assigned."
      : seatIds.length === 1
      ? `Your assigned seat is Seat ${seatIds[0]}. Look for the highlighted table on the map below.`
      : `Your assigned seats are Seats ${seatIds.join(
          ", "
        )}. Look for the highlighted tables on the map below.`;

  return (
    <div className="relative min-h-screen bg-background text-foreground animate-page-fade">
      {/* subtle star / twinkle overlay */}
      <div className="twinkle-layer" aria-hidden="true" />

      {/* background music */}
      <audio
        ref={audioRef}
        src="/audio/legacy-night-bgm.mp3"
        loop
        preload="auto"
      />

      {/* Sticky header */}
      <header className="sticky top-0 z-20 border-b border-border bg-card/70 backdrop-blur-sm"></header>

      {/* Main content */}
      <main className="relative z-10 max-w-6xl mx-auto px-4 md:px-6 py-10 md:py-14 space-y-8 md:space-y-10">
        {/* Logo */}
        <div className="flex justify-center mb-4 md:mb-6">
          <Image
            src="/images/home-mark.png"
            alt="Logo"
            width={120}
            height={120}
            className="h-auto w-auto animate-hero-logo drop-shadow-[0_0_40px_rgba(0,0,0,0.8)]"
            priority
          />
        </div>

        {/* Error banner */}
        {error && (
          <Card className="bg-destructive/10 border border-destructive/40 p-3 md:p-4 animate-slide-up">
            <p className="text-destructive text-xs md:text-sm">{error}</p>
          </Card>
        )}

        {/* Search card – always visible */}
        <Card className="bg-card/90 border border-border p-4 md:p-8 shadow-lg animate-hero-card backdrop-blur">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-muted-foreground" />
              <Input
                placeholder="Enter ticket number, name, or group (e.g. PMT)..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="pl-10 md:pl-12 h-11 md:h-12 text-base md:text-lg bg-background/40 border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-foreground focus-visible:border-foreground"
              />
            </div>
            <Button
              onClick={handleSearch}
              disabled={!searchInput || isSearching}
              className="w-full sm:w-auto h-11 md:h-12 px-6 md:px-8 btn-theme-light"
            >
              {isSearching ? "Searching..." : "Search"}
            </Button>
          </div>

          {searchResults.length > 0 && (
            <p className="mt-3 text-xs md:text-sm text-muted-foreground">
              Found <strong>{searchResults.length}</strong> delegate
              {searchResults.length > 1 ? "s" : ""} matching "
              <span className="font-semibold">{searchInput}</span>". All their
              assigned tables are highlighted on the map.
            </p>
          )}
        </Card>

        {/* Selected attendee info */}
        {selectedAttendee && (
          <Card className="bg-card/95 border border-border p-4 md:p-6 shadow-lg space-y-4 md:space-y-6 animate-slide-up">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="space-y-1">
                {/* Name only (e.g. PMT) */}
                <p className="text-sm md:text-base font-semibold">
                  {selectedAttendee.name}
                </p>

                {/* Seats only (no “Ticket: ...”) */}
                {seatIds.length > 0 && (
                  <p className="text-xs md:text-sm text-muted-foreground">
                    {seatsLabel}
                  </p>
                )}

                <p className="text-xs md:text-sm bg-muted/80 text-muted-foreground p-2 md:p-3 rounded-lg leading-relaxed">
                  {seatSentence}
                </p>
              </div>

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
                  <div className="flex items-center justify-center gap-2 w-full sm:w-auto py-2 rounded-md bg-emerald-900/30 text-emerald-300 animate-scale-in">
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="text-sm md:text-base">Checked In</span>
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* Venue map – multi-seat highlight, NO “Highlighted tables for this search” text */}
        {seatIds.length > 0 && (
          <Card className="bg-card/95 border border-border p-4 md:p-6 shadow-lg space-y-4 md:space-y-6 animate-slide-up">
            <div className="mb-2 animate-fade-in">
              <PathfindingVisualization
                seatIds={seatIds}
                isVip={isVipForVisualization}
                showBackground={false}
              />
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}
