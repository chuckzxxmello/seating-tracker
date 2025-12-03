"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
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

  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [hasLoadedAttendees, setHasLoadedAttendees] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  const [searchResults, setSearchResults] = useState<Attendee[]>([]);
  const [selectedAttendee, setSelectedAttendee] = useState<Attendee | null>(
    null,
  );

  const [isSearching, setIsSearching] = useState(false);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 🔥 NEW: multi-seat highlight state
  const [highlightSeats, setHighlightSeats] = useState<number[]>([]);
  const [highlightVipMode, setHighlightVipMode] = useState<boolean | null>(
    null,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleFirstInteraction = () => {
      if (audioRef.current) {
        audioRef.current.volume = 0.15;
        audioRef.current.play().catch(() => {});
      }
      window.removeEventListener("click", handleFirstInteraction);
    };

    window.addEventListener("click", handleFirstInteraction);
    return () => window.removeEventListener("click", handleFirstInteraction);
  }, []);

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
    loadAttendees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- helpers ----------
  const normalize = (value: string | null | undefined): string =>
    (value ?? "")
      .toString()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();

  // 🔢 Helper: get seat value like in admin (supports assignedSeat / seat)
  const getSeatValue = (att: Attendee): number | undefined => {
    const anyAtt = att as any;
    const val =
      typeof anyAtt.assignedSeat === "number"
        ? anyAtt.assignedSeat
        : typeof anyAtt.seat === "number"
        ? anyAtt.seat
        : undefined;

    if (typeof val === "number" && !Number.isNaN(val)) return val;
    return undefined;
  };

  // 🔍 Matching logic including category / team (PMT, Team Eunice, etc.)
  const matchesSearch = (att: Attendee, tokens: string[]): boolean => {
    if (tokens.length === 0) return true;

    const name = normalize(att.name);
    const ticket = normalize(att.ticketNumber);
    const category = normalize((att as any).category);

    // Full query phrase check first (so "Team Eunice" works nicely)
    const fullQuery = normalize(tokens.join(" "));
    if (
      fullQuery &&
      (name.includes(fullQuery) ||
        ticket.includes(fullQuery) ||
        category.includes(fullQuery))
    ) {
      return true;
    }

    // Then token-by-token
    return tokens.every((rawToken) => {
      const token = normalize(rawToken);
      if (!token) return true;

      // very short tokens (<=2) only checked against ticket (like your admin logic)
      if (token.length <= 2 && /\d/.test(token)) {
        return ticket.includes(token);
      }

      return (
        name.includes(token) ||
        ticket.includes(token) ||
        category.includes(token)
      );
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
    setHighlightSeats([]);
    setHighlightVipMode(null);

    try {
      if (!hasLoadedAttendees) {
        await loadAttendees();
      }

      const results = searchLocally(searchInput);

      if (results.length > 0) {
        setSearchResults(results);
        setSelectedAttendee(results[0]);

        // 🔥 NEW: compute all seats for this search term
        const seats = results
          .map((att) => getSeatValue(att))
          .filter(
            (seat): seat is number =>
              typeof seat === "number" && !Number.isNaN(seat),
          );
        const uniqueSeats = Array.from(new Set(seats));
        setHighlightSeats(uniqueSeats);

        // Determine VIP mode:
        // - if exactly 1 match and it has a seat -> VIP or regular depending on category
        // - if multiple matches -> admin mode (highlight both VIP and regular)
        if (results.length === 1) {
          const only = results[0];
          const seatVal = getSeatValue(only);
          if (typeof seatVal === "number") {
            const categoryRaw = normalize((only as any).category);
            setHighlightVipMode(
              categoryRaw === "vip" ? true : categoryRaw ? false : null,
            );
          } else {
            setHighlightVipMode(null);
          }
        } else {
          // multiple attendees -> admin mode (no VIP filter)
          setHighlightVipMode(null);
        }
      } else {
        setError(
          "No attendee found with that ticket number, name, or category. Please check the spelling and try again.",
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
          isVIP,
        );

        if (capacity.isFull) {
          setError(
            `Table ${selectedAttendee.assignedSeat} is at full capacity (${capacity.max}/${capacity.max} seats). Cannot check in.`,
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
      setIsCheckingIn(true);
      await checkInAttendee(selectedAttendee.id!);
      await logAudit(
        "check_in",
        user?.email || "",
        selectedAttendee.ticketNumber,
        selectedAttendee.assignedSeat,
        { name: selectedAttendee.name },
      );

      setSelectedAttendee({ ...selectedAttendee, checkedIn: true });
    } catch (err) {
      console.error("[checkin] Check-in failed:", err);
      setError("Failed to check in. Please try again.");
    } finally {
      setIsCheckingIn(false);
    }
  };

  // ---------- seat IDs for visualization ----------

  // Prefer multi-seat highlight from search (PMT / Team Eunice, etc.)
  const seatIds: number[] =
    highlightSeats.length > 0
      ? highlightSeats
      : selectedAttendee &&
        typeof selectedAttendee.assignedSeat === "number" &&
        !Number.isNaN(selectedAttendee.assignedSeat)
      ? [selectedAttendee.assignedSeat]
      : [];

  // VIP awareness:
  // - multi-seat highlight: VIP mode only when exactly 1 and we know it's VIP
  // - single attendee: use that attendee's category
  const isVipForVisualization =
    highlightSeats.length > 0
      ? highlightSeats.length === 1
        ? highlightVipMode === true
        : undefined // admin mode, allow both VIP + regular
      : selectedAttendee
      ? selectedAttendee.category === "VIP"
      : undefined;

  // --------- label helpers (VIP-aware) ----------
  let seatSummaryLabel: string | undefined;
  let seatSentence: string | undefined;

  if (seatIds.length > 0) {
    if (isVipForVisualization && seatIds.length === 1) {
      // VIP single table
      seatSummaryLabel = `VIP Table Number ${seatIds[0]}`;
      seatSentence = `Your assigned seat is on VIP Table ${seatIds[0]}`;
    } else if (isVipForVisualization && seatIds.length > 1) {
      seatSummaryLabel = `VIP Tables ${seatIds.join(", ")}`;
      seatSentence = `Your assigned seats are on VIP Tables ${seatIds.join(
        ", ",
      )}`;
    } else if (seatIds.length === 1) {
      seatSummaryLabel = `Seat ${seatIds[0]}`;
      seatSentence = `Your assigned seat is Seat ${
        seatIds[0]
      }. Look for the highlighted table on the map below.`;
    } else {
      seatSummaryLabel = `Seats ${seatIds.join(", ")}`;
      seatSentence = `Your assigned seats are Seats ${seatIds.join(
        ", ",
      )}. Look for the highlighted tables on the map below.`;
    }
  }

  return (
    <div className="relative min-h-screen bg-background text-foreground animate-page-fade">
      <div className="twinkle-layer" aria-hidden="true" />

      <audio
        ref={audioRef}
        src="/audio/legacy-night-bgm.mp3"
        loop
        preload="auto"
      />

      <header className="sticky top-0 z-20 border-b border-border bg-card/70 backdrop-blur-sm" />

      <main className="relative z-10 max-w-6xl mx-auto px-4 md:px-6 pt-10 md:pt-14 pb-0 space-y-8 md:space-y-10">
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

        {error && (
          <Card className="bg-destructive/10 border border-destructive/40 p-3 md:4 animate-slide-up">
            <p className="text-destructive text-xs md:text-sm">{error}</p>
          </Card>
        )}

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

        {seatIds.length > 0 && (
          <PathfindingVisualization
            seatIds={seatIds}
            isVip={isVipForVisualization}
            attendeeName={selectedAttendee?.name ?? undefined}
            seatSummaryLabel={seatSummaryLabel}
            seatSentence={seatSentence}
            isCheckedIn={!!selectedAttendee?.checkedIn}
            isCheckInLoading={isCheckingIn}
            onCheckIn={
              selectedAttendee && !selectedAttendee.checkedIn
                ? handleCheckin
                : undefined
            }
            autoFullscreenOnSeatChange
          />
        )}
      </main>
    </div>
  );
}
