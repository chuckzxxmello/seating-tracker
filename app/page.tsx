"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, CheckCircle2 } from "lucide-react";
import Image from "next/image";
import { PathfindingVisualization } from "@/components/pathfinding-visualization";
import {
  getAttendees,
  checkInAttendee,
  logAudit,
  checkTableCapacity,
  type Attendee,
} from "@/lib/firebase-service";
import { useAuth } from "@/lib/auth-context";

export default function CheckinPage() {
  const { user } = useAuth();

  // 🔹 All attendees (loaded once)
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [hasLoadedAttendees, setHasLoadedAttendees] = useState(false);

  // 🔹 Search state
  const [searchInput, setSearchInput] = useState("");
  const [searchResults, setSearchResults] = useState<Attendee[]>([]);
  const [selectedAttendee, setSelectedAttendee] = useState<Attendee | null>(null);

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

  // 🔹 Load attendees once
  const loadAttendees = async () => {
    try {
      const data = await getAttendees();
      setAttendees(data);
      setHasLoadedAttendees(true);
    } catch (err) {
      console.error("[checkin] Error loading attendees:", err);
      setError("Failed to load attendees. Please try again.");
    }
  };

  useEffect(() => {
    // Preload attendees on first mount (optional but nice)
    loadAttendees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 🔹 Normalization helper for safer, case-insensitive matching
  const normalize = (value: string | null | undefined): string =>
    (value ?? "")
      .toString()
      .normalize("NFKD") // handle accents if any
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();

  // 🔹 Smart matching logic (same behavior intent as before, but fixed for full-phrase like "AJ Velasco")
  const matchesSearch = (att: Attendee, tokens: string[]): boolean => {
    if (tokens.length === 0) return true;

    const name = normalize(att.name);
    const ticket = normalize(att.ticketNumber);

    // ✅ NEW: full-phrase check — this is what makes "AJ Velasco" work
    // without changing the existing token-based behavior.
    const fullQuery = normalize(tokens.join(" "));
    if (
      fullQuery &&
      (name.includes(fullQuery) || ticket.includes(fullQuery))
    ) {
      return true;
    }

    // Existing per-token behavior kept as-is
    return tokens.every((rawToken) => {
      const token = normalize(rawToken);
      if (!token) return true;

      // If token is very short and has a digit (e.g. "B3"), treat it as ticket-focused search
      if (token.length <= 2 && /\d/.test(token)) {
        return ticket.includes(token);
      }

      // Otherwise, match against BOTH name and ticket
      return name.includes(token) || ticket.includes(token);
    });
  };

  const searchLocally = (query: string): Attendee[] => {
    const tokens = query
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (tokens.length === 0) return [];

    return attendees.filter((att) => matchesSearch(att, tokens));
  };

  const handleSearch = async () => {
    if (!searchInput.trim()) return;

    setIsSearching(true);
    setError(null);
    setSelectedAttendee(null);
    setSearchResults([]);

    try {
      // Ensure we have attendees loaded
      if (!hasLoadedAttendees) {
        await loadAttendees();
      }

      const results = searchLocally(searchInput);

      if (results.length > 0) {
        setSearchResults(results);
        setSelectedAttendee(results[0]); // ✅ triggers map + hides search card
      } else {
        setError(
          "No attendee found with that ticket number or name. Please check the spelling and try again."
        );
      }
    } catch (err) {
      console.error("[checkin] Search failed:", err);
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
        console.error("[checkin] Error checking capacity:", err);
        setError("Failed to check table capacity. Please try again.");
        return;
      }
    }

    try {
      setIsSearching(true);
      await checkInAttendee(selectedAttendee.id!);
      await logAudit(
        "check_in",
        user?.email || "",
        selectedAttendee.ticketNumber,
        selectedAttendee.assignedSeat,
        { name: selectedAttendee.name }
      );

      setSelectedAttendee({ ...selectedAttendee, checkedIn: true });
    } catch (err) {
      console.error("[checkin] Check-in failed:", err);
      setError("Failed to check in. Please try again.");
    } finally {
      setIsSearching(false);
    }
  };

  // 🔹 collect ALL seat numbers from matches (for PMT / Chuckz scenarios)
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

  // Only force VIP/regular if exactly one seat
  const isVipForVisualization =
    seatIds.length === 1 && selectedAttendee
      ? selectedAttendee.category === "VIP"
      : undefined;

  // Text helpers for seats (for the PMT copy you wanted)
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

      <header className="sticky top-0 z-20 border-b border-border bg-card/70 backdrop-blur-sm"></header>

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

        {/* Search card – hidden AFTER a match is selected */}
        {!selectedAttendee && (
          <Card className="bg-card/90 border border-border p-4 md:8 shadow-lg animate-hero-card backdrop-blur">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-muted-foreground" />
                <Input
                  placeholder="Enter name..."
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
          </Card>
        )}

        {/* Selected attendee info + check-in */}
        {selectedAttendee && (
          <Card className="bg-card/95 border border-border p-4 md:p-6 shadow-lg space-y-4 md:space-y-6 animate-slide-up">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="space-y-1">
                {/* Name only (e.g. Abbey Velasco, PMT) */}
                <p className="text-sm md:text-base font-semibold">
                  {selectedAttendee.name}
                </p>

                {/* Seats only (no Ticket: ...) */}
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

        {/* Map with multi-seat highlight */}
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
