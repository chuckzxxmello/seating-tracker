"use client";

import type React from "react";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getVenueMap, type VenueNode } from "@/lib/venue-map-service";
import {
  AlertCircle,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  CheckCircle2,
} from "lucide-react";

interface PathfindingVisualizationProps {
  seatId?: number | null;
  seatIds?: number[];
  imageSrc?: string;
  showBackground?: boolean;
  isVip?: boolean;

  attendeeName?: string;
  seatSummaryLabel?: string;
  seatSentence?: string;
  isCheckedIn?: boolean;
  isCheckInLoading?: boolean;
  onCheckIn?: () => void;

  autoFullscreenOnSeatChange?: boolean;
}

export function PathfindingVisualization({
  seatId,
  seatIds,
  imageSrc,
  showBackground = false,
  isVip,
  attendeeName,
  seatSummaryLabel,
  seatSentence,
  isCheckedIn,
  isCheckInLoading,
  onCheckIn,
  autoFullscreenOnSeatChange = false,
}: PathfindingVisualizationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [venueNodes, setVenueNodes] = useState<VenueNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // zoom / pan
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  // pointer / gesture state
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(
    new Map(),
  );
  const lastPinchDistanceRef = useRef<number | null>(null);

  const dragPointerIdRef = useRef<number | null>(null);
  const lastDragPosRef = useRef<{ x: number; y: number } | null>(null);

  const lastTapTimeRef = useRef<number | null>(null);
  const lastTapPosRef = useRef<{ x: number; y: number } | null>(null);

  // auto-center + auto-fullscreen bookkeeping
  const prevSeatKeyRef = useRef<string>("");
  const shouldAutoCenterRef = useRef<boolean>(false);
  const autoFullscreenRef = useRef<boolean>(false);

  // tuning
  const PAN_SPEED = 1.2;
  const WHEEL_ZOOM_IN = 1.08;
  const WHEEL_ZOOM_OUT = 0.92;
  const DOUBLE_TAP_ZOOM = 1.15;

  // modes
  type Mode = "vip" | "regular" | "admin";
  const mode: Mode =
    isVip === true ? "vip" : isVip === false ? "regular" : "admin";

  const isVipMode = mode === "vip";
  const isRegularMode = mode === "regular";

  // normalize seats
  const selectedSeatIds: number[] = (() => {
    if (Array.isArray(seatIds) && seatIds.length > 0) {
      const clean = seatIds
        .filter((s) => typeof s === "number" && !Number.isNaN(s))
        .map((s) => Math.trunc(s));
      return Array.from(new Set(clean));
    }
    if (typeof seatId === "number" && !Number.isNaN(seatId)) {
      return [Math.trunc(seatId)];
    }
    return [];
  })();

  const seatIdSet = new Set(selectedSeatIds.map((id) => String(id)));
  const hasSelectedSeats = selectedSeatIds.length > 0;
  const seatKey = selectedSeatIds.join(",");

  // ---------- load venue map ----------
  useEffect(() => {
    async function loadVenueData() {
      try {
        const venueMap = await getVenueMap();
        if (venueMap?.nodes) {
          setVenueNodes(venueMap.nodes);
          setError(null);
        } else {
          setError("No venue map configured");
        }
      } catch (err) {
        console.error("[v0] Error loading venue map:", err);
        setError("Failed to load venue map");
      } finally {
        setIsLoading(false);
      }
    }
    loadVenueData();
  }, []);

  // ---------- validate seat(s) ----------
  useEffect(() => {
    if (!hasSelectedSeats || venueNodes.length === 0) return;

    try {
      const allowedTypes =
        mode === "vip"
          ? ["vip-table"]
          : mode === "regular"
          ? ["table"]
          : ["table", "vip-table"];

      const matches = venueNodes.filter((node) => {
        if (!allowedTypes.includes(node.type)) return false;
        const tableNum = node.label.match(/\d+/)?.[0];
        if (!tableNum) return false;
        return seatIdSet.has(tableNum);
      });

      if (matches.length === 0) {
        if (selectedSeatIds.length === 1) {
          const id = selectedSeatIds[0];
          if (mode === "vip") {
            setError(`VIP table ${id} not found`);
          } else if (mode === "regular") {
            setError(`Table ${id} not found`);
          } else {
            setError(`No VIP or regular table ${id} found`);
          }
        } else {
          setError("No matching tables found for selected seats");
        }
      } else {
        setError(null);
      }
    } catch (err) {
      console.error("[v0] Error finding table:", err);
      setError("Error locating table");
    }
  }, [hasSelectedSeats, seatIdSet, selectedSeatIds, venueNodes, mode]);

  // ---------- auto fullscreen on seat change ----------
  useEffect(() => {
    if (!autoFullscreenOnSeatChange) return;
    if (!seatKey) return;
  
    if (seatKey !== prevSeatKeyRef.current) {
      prevSeatKeyRef.current = seatKey;
      // this fullscreen was triggered automatically
      autoFullscreenRef.current = true;
  
      // open fullscreen but start at TRUE "1:1" view
      setIsFullscreen(true);
      setZoom(1);           // 👈  was 2
      setPan({ x: 0, y: 0 }); // default centered view
  
      // let the auto-center logic move the map so the seat is in view,
      // but keep the zoom at 1:1
      shouldAutoCenterRef.current = true;
    }
  }, [seatKey, autoFullscreenOnSeatChange]);

  // ---------- zoom helpers ----------
  const clampZoom = (z: number) => Math.min(4, Math.max(0.5, z));

  const zoomAtPoint = (factor: number, clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    setZoom((prevZoom) => {
      const targetZoom = clampZoom(prevZoom * factor);
      const actualFactor = targetZoom / prevZoom;
      if (actualFactor === 1) return prevZoom;

      setPan((prevPan) => {
        const worldX = (x - prevPan.x) / prevZoom;
        const worldY = (y - prevPan.y) / prevZoom;

        return {
          x: x - worldX * targetZoom,
          y: y - worldY * targetZoom,
        };
      });

      return targetZoom;
    });
  };

  const zoomToCenter = (factor: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    zoomAtPoint(factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
  };

  const handleZoomIn = () => zoomToCenter(DOUBLE_TAP_ZOOM);
  const handleZoomOut = () => zoomToCenter(1 / DOUBLE_TAP_ZOOM);

  // 1:1 should ALWAYS reset to default view (whole map centered)
  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    // do NOT auto-center on seat when resetting
    shouldAutoCenterRef.current = false;
  };

  // manual maximize/minimize:
  // - entering fullscreen: keep current zoom/pan
  // - leaving an *auto* fullscreen: reset to 1:1 so embedded is full map
  const toggleFullscreen = () => {
    const wasFullscreen = isFullscreen;

    if (wasFullscreen && autoFullscreenRef.current) {
      // leaving auto-fullscreen -> go back to default view
      setZoom(1);
      setPan({ x: 0, y: 0 });
      shouldAutoCenterRef.current = false;
      autoFullscreenRef.current = false;
    }

    if (!wasFullscreen) {
      // entering fullscreen manually -> keep current zoom/pan
      autoFullscreenRef.current = false;
    }

    setIsFullscreen(!wasFullscreen);
  };

  // ---------- double tap / pointer handlers ----------
  const handleTouchDoubleTapCheck = (
    e: React.PointerEvent<HTMLCanvasElement>,
  ) => {
    if (e.pointerType !== "touch") return false;

    const now = performance.now();
    const lastTime = lastTapTimeRef.current;
    const lastPos = lastTapPosRef.current;

    const TAP_THRESHOLD_MS = 300;
    const TAP_DISTANCE_PX = 30;

    let isDoubleTap = false;

    if (lastTime && now - lastTime < TAP_THRESHOLD_MS && lastPos) {
      const dx = e.clientX - lastPos.x;
      const dy = e.clientY - lastPos.y;
      const dist = Math.hypot(dx, dy);
      if (dist < TAP_DISTANCE_PX) {
        isDoubleTap = true;
      }
    }

    if (isDoubleTap) {
      zoomAtPoint(DOUBLE_TAP_ZOOM, e.clientX, e.clientY);
      lastTapTimeRef.current = null;
      lastTapPosRef.current = null;
      return true;
    } else {
      lastTapTimeRef.current = now;
      lastTapPosRef.current = { x: e.clientX, y: e.clientY };
      return false;
    }
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    zoomAtPoint(DOUBLE_TAP_ZOOM, e.clientX, e.clientY);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === "touch") {
      const used = handleTouchDoubleTapCheck(e);
      if (used) return;
    }

    const id = e.pointerId;
    pointersRef.current.set(id, { x: e.clientX, y: e.clientY });
    (e.target as HTMLElement).setPointerCapture(id);

    const pointers = [...pointersRef.current.entries()];

    if (pointers.length === 1) {
      dragPointerIdRef.current = id;
      lastDragPosRef.current = { x: e.clientX, y: e.clientY };
      lastPinchDistanceRef.current = null;
    } else if (pointers.length === 2) {
      const [, p1] = pointers[0];
      const [, p2] = pointers[1];
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      lastPinchDistanceRef.current = dist;
      dragPointerIdRef.current = null;
      lastDragPosRef.current = null;
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const id = e.pointerId;
    if (!pointersRef.current.has(id)) return;

    pointersRef.current.set(id, { x: e.clientX, y: e.clientY });
    const pointers = [...pointersRef.current.values()];

    if (
      pointers.length === 1 &&
      dragPointerIdRef.current === id &&
      lastDragPosRef.current
    ) {
      const dx = (e.clientX - lastDragPosRef.current.x) * PAN_SPEED;
      const dy = (e.clientY - lastDragPosRef.current.y) * PAN_SPEED;

      lastDragPosRef.current = { x: e.clientX, y: e.clientY };

      setPan((prev) => ({
        x: prev.x + dx,
        y: prev.y + dy,
      }));
      shouldAutoCenterRef.current = false;
    } else if (pointers.length >= 2 && lastPinchDistanceRef.current) {
      e.preventDefault();
      const [p1, p2] = pointers;
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      if (dist === 0) return;

      const factor = dist / lastPinchDistanceRef.current;
      const centerX = (p1.x + p2.x) / 2;
      const centerY = (p1.y + p2.y) / 2;

      zoomAtPoint(factor, centerX, centerY);
      lastPinchDistanceRef.current = dist;
      shouldAutoCenterRef.current = false;
    }
  };

  const endPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const id = e.pointerId;
    pointersRef.current.delete(id);
    (e.target as HTMLElement).releasePointerCapture(id);

    const remaining = [...pointersRef.current.entries()];

    if (remaining.length === 0) {
      dragPointerIdRef.current = null;
      lastPinchDistanceRef.current = null;
      lastDragPosRef.current = null;
    } else if (remaining.length === 1) {
      const [remainingId, point] = remaining[0];
      dragPointerIdRef.current = remainingId;
      lastPinchDistanceRef.current = null;
      lastDragPosRef.current = { x: point.x, y: point.y };
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    endPointer(e);
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    endPointer(e);
  };

  // ---------- wheel zoom ----------
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? WHEEL_ZOOM_IN : WHEEL_ZOOM_OUT;
      zoomAtPoint(factor, e.clientX, e.clientY);
      shouldAutoCenterRef.current = false;
    };

    container.addEventListener("wheel", handleWheelNative, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleWheelNative);
    };
  }, [isFullscreen]);

  // ---------- seat highlighting ----------
  const isSeatNodeSelected = (node: VenueNode) => {
    const tableNum = node.label.match(/\d+/)?.[0];
    if (!tableNum || !seatIdSet.has(tableNum)) return false;

    if (mode === "vip") return node.type === "vip-table";
    if (mode === "regular") return node.type === "table";
    return node.type === "table" || node.type === "vip-table";
  };

  // ---------- drawing ----------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || venueNodes.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const allX = venueNodes.map((n) => n.x);
    const allY = venueNodes.map((n) => n.y);
    const rawMinX = Math.min(...allX);
    const rawMaxX = Math.max(...allX);
    const rawMinY = Math.min(...allY);
    const rawMaxY = Math.max(...allY);

    const margin = 40;
    const minX = rawMinX - margin;
    const maxX = rawMaxX + margin;
    const minY = rawMinY - margin;
    const maxY = rawMaxY + margin;

    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;

    const parent = canvas.parentElement as HTMLElement | null;
    const cssWidth = parent?.clientWidth ?? 1400;
    const cssHeight =
      parent?.clientHeight ??
      Math.ceil((contentHeight / contentWidth) * cssWidth);

    const dpr =
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    canvas.width = Math.floor(cssWidth * dpr);
    canvas.height = Math.floor(cssHeight * dpr);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#0b1020";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const scaleX = cssWidth / contentWidth;
    const scaleY = cssHeight / contentHeight;
    const contentScale = Math.min(scaleX, scaleY);

    const viewWidthWorld = cssWidth / contentScale;
    const viewHeightWorld = cssHeight / contentScale;

    const offsetXWorld = (viewWidthWorld - contentWidth) / 2;
    const offsetYWorld = (viewHeightWorld - contentHeight) / 2;

    const centeredMinX = minX - offsetXWorld;
    const centeredMinY = minY - offsetYWorld;

    const totalScale = zoom * dpr;

    ctx.save();
    ctx.scale(totalScale, totalScale);
    ctx.translate(pan.x / totalScale, pan.y / totalScale);

    const toCanvas = (x: number, y: number) => ({
      x: (x - centeredMinX) * contentScale,
      y: (y - centeredMinY) * contentScale,
    });

    const drawNode = (node: VenueNode) => {
      const highlight = isSeatNodeSelected(node);
      const pos = toCanvas(node.x, node.y);

      if (node.type === "stage") {
        ctx.fillStyle = "#1E3A8A";
        ctx.fillRect(
          pos.x - 100 * contentScale,
          pos.y - 20 * contentScale,
          200 * contentScale,
          40 * contentScale,
        );
        ctx.fillStyle = "#FFFFFF";
        ctx.font = `bold ${Math.max(12, 16 * contentScale)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("STAGE", pos.x, pos.y);
      } else if (node.type === "buffet") {
        ctx.fillStyle = "#1F2937";
        ctx.fillRect(
          pos.x - 15 * contentScale,
          pos.y - 30 * contentScale,
          30 * contentScale,
          60 * contentScale,
        );
        ctx.fillStyle = "#FFFFFF";
        ctx.font = `${Math.max(8, 10 * contentScale)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText("BUFFET", 0, 0);
        ctx.restore();
      } else if (node.type === "carving-table") {
        ctx.fillStyle = "#7C3AED";
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 25 * contentScale, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#FFFFFF";
        ctx.font = `${Math.max(8, 9 * contentScale)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("CT", pos.x, pos.y);
      } else if (node.type === "crying-room") {
        ctx.fillStyle = "#06B6D4";
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 20 * contentScale, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#FFFFFF";
        ctx.font = `${Math.max(6, 7 * contentScale)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("CRYING", pos.x, pos.y - 4 * contentScale);
        ctx.fillText("ROOM", pos.x, pos.y + 4 * contentScale);
      } else if (node.type === "photo-exhibit") {
        ctx.fillStyle = "#F59E0B";
        ctx.fillRect(
          pos.x - 30 * contentScale,
          pos.y - 20 * contentScale,
          60 * contentScale,
          40 * contentScale,
        );
        ctx.fillStyle = "#FFFFFF";
        ctx.font = `${Math.max(7, 8 * contentScale)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("PHOTO", pos.x, pos.y);
      } else if (node.type === "edge-node") {
        return;
      } else if (
        node.type === "custom" ||
        node.type === "waypoint" ||
        node.type === "intersection"
      ) {
        ctx.fillStyle = "#8B5CF6";
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 8 * contentScale, 0, Math.PI * 2);
        ctx.fill();
        if (node.label && node.type === "custom") {
          ctx.fillStyle = "#E5E7EB";
          ctx.font = `${Math.max(7, 8 * contentScale)}px sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText(
            node.label.substring(0, 8),
            pos.x,
            pos.y + 15 * contentScale,
          );
        }
      } else if (node.type === "entrance") {
        ctx.fillStyle = highlight ? "#FBBF24" : "#10B981";
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 12 * contentScale, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = "#FFFFFF";
        ctx.font = `bold ${Math.max(8, 10 * contentScale)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("E", pos.x, pos.y);
      } else if (node.type === "table") {
        const tableNum = node.label.match(/\d+/)?.[0];

        ctx.fillStyle = "#1E40AF";
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 12 * contentScale, 0, Math.PI * 2);
        ctx.fill();

        if (highlight) {
          ctx.strokeStyle = "#FBBF24";
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, 18 * contentScale, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.fillStyle = "#FFFFFF";
        ctx.font = `bold ${Math.max(8, 10 * contentScale)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(tableNum || "", pos.x, pos.y);
      } else if (node.type === "vip-table") {
        const tableNum = node.label.match(/\d+/)?.[0];

        const width = 22 * contentScale;
        const height = 90 * contentScale;
        const x = pos.x - width / 2;
        const y = pos.y - height / 2;

        ctx.fillStyle = "#DC2626";
        ctx.fillRect(x, y, width, height);

        if (highlight) {
          const pad = 4 * contentScale;
          ctx.strokeStyle = "#FBBF24";
          ctx.lineWidth = 4;
          ctx.strokeRect(
            x - pad,
            y - pad,
            width + pad * 2,
            height + pad * 2,
          );
        }

        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(-Math.PI / 2);
        ctx.fillStyle = "#FFFFFF";
        ctx.font = `bold ${Math.max(8, 10 * contentScale)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const labelText = tableNum ? `VIP TABLE ${tableNum}` : "VIP TABLE";
        ctx.fillText(labelText, 0, 0);
        ctx.restore();
      }
    };

    venueNodes.forEach(drawNode);
    ctx.restore();
  }, [venueNodes, zoom, pan, selectedSeatIds, mode, seatIdSet, isFullscreen]);

  // ---------- auto-center selected seat (ONLY when fullscreen + flag set) ----------
  useEffect(() => {
    if (
      !isFullscreen ||
      !shouldAutoCenterRef.current ||
      !hasSelectedSeats ||
      venueNodes.length === 0
    ) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const parent = canvas.parentElement as HTMLElement | null;
    const cssWidth = parent?.clientWidth ?? 1400;
    const cssHeight = parent?.clientHeight ?? 800;

    const allX = venueNodes.map((n) => n.x);
    const allY = venueNodes.map((n) => n.y);
    const rawMinX = Math.min(...allX);
    const rawMaxX = Math.max(...allX);
    const rawMinY = Math.min(...allY);
    const rawMaxY = Math.max(...allY);

    const margin = 40;
    const minX = rawMinX - margin;
    const maxX = rawMaxX + margin;
    const minY = rawMinY - margin;
    const maxY = rawMaxY + margin;

    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;

    const scaleX = cssWidth / contentWidth;
    const scaleY = cssHeight / contentHeight;
    const contentScale = Math.min(scaleX, scaleY);

    const viewWidthWorld = cssWidth / contentScale;
    const viewHeightWorld = cssHeight / contentScale;

    const offsetXWorld = (viewWidthWorld - contentWidth) / 2;
    const offsetYWorld = (viewHeightWorld - contentHeight) / 2;

    const centeredMinX = minX - offsetXWorld;
    const centeredMinY = minY - offsetYWorld;

    const target = venueNodes.find((node) => {
      const tableNum = node.label.match(/\d+/)?.[0];
      if (!tableNum || !seatIdSet.has(tableNum)) return false;
      if (mode === "vip") return node.type === "vip-table";
      if (mode === "regular") return node.type === "table";
      return node.type === "table" || node.type === "vip-table";
    });

    if (!target) return;

    const seatCanvasX = (target.x - centeredMinX) * contentScale;
    const seatCanvasY = (target.y - centeredMinY) * contentScale;

    const centerX = cssWidth / 2;
    const centerY = cssHeight / 2;

    setPan({
      x: centerX - seatCanvasX * zoom,
      y: centerY - seatCanvasY * zoom,
    });

    // only once
    shouldAutoCenterRef.current = false;
  }, [
    isFullscreen,
    zoom,
    hasSelectedSeats,
    venueNodes,
    seatIdSet,
    mode,
  ]);

  // ---------- header bits ----------
  const hasAttendeeInfo = !!attendeeName;

  const fallbackSeatLabel =
    !hasSelectedSeats
      ? ""
      : selectedSeatIds.length === 1
      ? (isVipMode ? "VIP Table Number " : "Seat ") + selectedSeatIds[0]
      : (isVipMode ? "VIP Tables " : "Seats ") + selectedSeatIds.join(", ");

  const fallbackSeatSentence =
    !hasSelectedSeats
      ? ""
      : selectedSeatIds.length === 1
      ? isVipMode
        ? `Your assigned seat is on VIP Table ${selectedSeatIds[0]}`
        : `Your assigned seat is Seat ${selectedSeatIds[0]}. Look for the highlighted table on the map below.`
      : isVipMode
        ? `Your assigned seats are on VIP Tables ${selectedSeatIds.join(", ")}`
        : `Your assigned seats are Seats ${selectedSeatIds.join(
            ", ",
          )}. Look for the highlighted tables on the map below.`;

  const headerSeatSummary = seatSummaryLabel || fallbackSeatLabel;
  const headerSeatSentence = seatSentence || fallbackSeatSentence;

  const HeaderContent = ({
    variant,
  }: {
    variant: "embedded" | "fullscreen";
  }) => {
    const isFull = variant === "fullscreen";

    return (
      <div
        className={`flex gap-3 ${
          isFull
            ? "items-start justify-between p-4 bg-card/90 border-b border-border"
            : "items-start justify-between p-3 md:p-4 bg-muted/40 border-b border-border"
        }`}
      >
        <div className="space-y-1 flex-1 min-w-0">
          <p className="text-sm md:text-base font-semibold truncate">
            {attendeeName || "Venue Map"}
          </p>

          {headerSeatSummary && (
            <p className="text-xs md:text-sm text-muted-foreground truncate">
              {headerSeatSummary}
            </p>
          )}

          {headerSeatSentence && (
            <p className="text-[11px] md:text-xs bg-muted/80 text-muted-foreground p-2 rounded-md leading-relaxed">
              {headerSeatSentence}
            </p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
          {/* Zoom buttons beside Check-In (embedded mode only) */}
          {!isFull && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={handleZoomOut}>
                <ZoomOut className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={handleResetView}>
                1:1
              </Button>
              <Button variant="outline" size="icon" onClick={handleZoomIn}>
                <ZoomIn className="w-4 h-4" />
              </Button>
            </div>
          )}

          {onCheckIn && !isCheckedIn && (
            <Button
              onClick={onCheckIn}
              disabled={isCheckInLoading}
              className="h-9 md:h-10 bg-emerald-600 hover:bg-emerald-700 text-white whitespace-nowrap"
            >
              <CheckCircle2 className="w-4 h-4 mr-1.5" />
              {isCheckInLoading ? "Processing..." : "Mark as Checked In"}
            </Button>
          )}

          {isCheckedIn && (
            <div className="flex items-center justify-center gap-2 px-3 h-9 md:h-10 rounded-md bg-emerald-900/30 text-emerald-300 whitespace-nowrap">
              <CheckCircle2 className="w-4 h-4" />
              <span className="text-xs md:text-sm">Checked In</span>
            </div>
          )}

          <Button
            variant="ghost"
            size={isFull ? "sm" : "icon"}
            onClick={toggleFullscreen}
            className={isFull ? "ml-1" : ""}
          >
            {isFull ? (
              <Minimize2 className="w-4 h-4 md:w-5 md:h-5" />
            ) : (
              <Maximize2 className="w-4 h-4 md:w-5 md:h-5" />
            )}
          </Button>
        </div>
      </div>
    );
  };

  // ---------- loading / error ----------
  if (isLoading) {
    return (
      <Card className="bg-card/80 border-border p-6 md:p-8 shadow-sm">
        <div className="flex items-center justify-center gap-3">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          <p className="text-muted-foreground text-center text-sm md:text-base">
            Loading venue map...
          </p>
        </div>
      </Card>
    );
  }

  if (venueNodes.length === 0) {
    return (
      <Card className="bg-destructive/10 border border-destructive/40 p-6 md:p-8">
        <div className="flex items-center gap-3 text-destructive">
          <AlertCircle className="w-5 h-5 md:w-6 md:h-6 flex-shrink-0" />
          <div>
            <p className="text-xs md:text-sm">
              Please set up the venue map in the admin panel first.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const canvasProps = {
    ref: canvasRef,
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onPointerCancel: handlePointerCancel,
    onPointerLeave: handlePointerUp,
    onDoubleClick: handleDoubleClick,
    style: { touchAction: "none" as const },
  } as const;

  // ---------- FULLSCREEN ONLY ----------
  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col min-h-0">
        {hasAttendeeInfo ? (
          <HeaderContent variant="fullscreen" />
        ) : (
          <div className="flex items-center justify-between p-4 bg-card/90 border-b border-border">
            <h3 className="text-lg font-semibold">Venue Map</h3>
            <Button variant="ghost" size="sm" onClick={toggleFullscreen}>
              <Minimize2 className="w-5 h-5" />
            </Button>
          </div>
        )}

        <div
          ref={containerRef}
          className="relative flex-1 min-h-0 overflow-hidden bg-[oklch(0.18_0.04_260)] overscroll-contain"
        >
          <canvas
            {...canvasProps}
            className="absolute inset-0 w-full h-full cursor-move touch-none"
          />
        </div>

        <div className="p-3 bg-card/90 border-t border-border flex items-center justify-center gap-3">
          <Button variant="outline" size="icon" onClick={handleZoomOut}>
            <ZoomOut className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={handleResetView}>
            1:1
          </Button>
          <Button variant="outline" size="icon" onClick={handleZoomIn}>
            <ZoomIn className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  // ---------- EMBEDDED ----------
  return (
    <Card className="bg-card/95 border-border overflow-hidden shadow-lg">
      {error && (
        <div className="p-3 md:p-4 bg-destructive/10 border-b border-destructive/40 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 md:w-5 md:h-5 text-destructive flex-shrink-0" />
          <p className="text-xs md:text-sm text-destructive">{error}</p>
        </div>
      )}

      {hasSelectedSeats && !error && (
        <>
          {hasAttendeeInfo ? (
            <HeaderContent variant="embedded" />
          ) : (
            <div className="p-3 md:p-4 bg-muted/40 border-b border-border flex items-center justify-between">
              <p className="text-xs md:text-sm text-foreground leading-relaxed">
                <span className="font-semibold text-sm md:text-base">
                  Venue Map
                </span>
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleFullscreen}
                className="ml-2"
              >
                <Maximize2 className="w-4 h-4 md:w-5 md:h-5" />
              </Button>
            </div>
          )}
        </>
      )}

      <div className="w-full bg-[oklch(0.18_0.04_260)] p-3 md:p-4">
        <div
          ref={containerRef}
          className="relative w-full h-[70vh] max-w-full overscroll-contain"
        >
          <canvas
            {...canvasProps}
            className="absolute inset-0 w-full h-full cursor-move touch-none"
          />
        </div>
      </div>
    </Card>
  );
}
