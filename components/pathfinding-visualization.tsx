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
} from "lucide-react";

interface PathfindingVisualizationProps {
  /** Single seat (existing usage) */
  seatId?: number | null;

  /** NEW: highlight multiple table numbers at once */
  seatIds?: number[];

  imageSrc?: string;
  showBackground?: boolean;

  /**
   * isVip:
   *  - true  → attendee is VIP → only VIP table(s) for these seatId(s)
   *  - false → attendee is regular → only regular table(s) for these seatId(s)
   *  - undefined → ADMIN MODE → both VIP and regular tables for these seatId(s)
   */
  isVip?: boolean;
}

export function PathfindingVisualization({
  seatId,
  seatIds,
  imageSrc,
  showBackground = false,
  isVip, // NOTE: no default! undefined means "admin mode"
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

  // pointer / gesture state (mouse + touch)
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(
    new Map(),
  );
  const lastPinchDistanceRef = useRef<number | null>(null);

  // dragging
  const dragPointerIdRef = useRef<number | null>(null);
  const lastDragPosRef = useRef<{ x: number; y: number } | null>(null);

  // double-tap / double-click
  const lastTapTimeRef = useRef<number | null>(null);
  const lastTapPosRef = useRef<{ x: number; y: number } | null>(null);

  // tuning
  const PAN_SPEED = 1.2;
  const WHEEL_ZOOM_IN = 1.08;
  const WHEEL_ZOOM_OUT = 0.92;
  const DOUBLE_TAP_ZOOM = 1.15;

  // ---------------------------------------------------------------------------
  // Mode helpers
  // ---------------------------------------------------------------------------
  type Mode = "vip" | "regular" | "admin";

  const mode: Mode =
    isVip === true ? "vip" : isVip === false ? "regular" : "admin";

  const isVipMode = mode === "vip";
  const isRegularMode = mode === "regular";
  const isAdminMode = mode === "admin";

  // ---------------------------------------------------------------------------
  // Normalize selected seat IDs (single + multiple)
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // Load venue nodes
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // Validate the requested seat(s) exist (VIP/regular/admin aware)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!hasSelectedSeats || venueNodes.length === 0) return;

    try {
      const allowedTypes =
        mode === "vip"
          ? ["vip-table"]
          : mode === "regular"
          ? ["table"]
          : ["table", "vip-table"]; // admin mode → both

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

  // ---------------------------------------------------------------------------
  // Zoom / pan helpers
  // ---------------------------------------------------------------------------
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

  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const toggleFullscreen = () => {
    setIsFullscreen((prev) => !prev);
    if (!isFullscreen) {
      handleResetView();
    }
  };

  // ---------------------------------------------------------------------------
  // Double-tap / double-click detection
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // Pointer handlers: drag + pinch
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // Native wheel listener (zoom, no page scroll)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? WHEEL_ZOOM_IN : WHEEL_ZOOM_OUT;
      zoomAtPoint(factor, e.clientX, e.clientY);
    };

    container.addEventListener("wheel", handleWheelNative, { passive: false });

    return () => {
      container.removeEventListener("wheel", handleWheelNative);
    };
  }, [isFullscreen]);

  // ---------------------------------------------------------------------------
  // Seat highlighting logic (VIP / regular / admin) – multi-seat aware
  // ---------------------------------------------------------------------------
  const isSeatNodeSelected = (node: VenueNode) => {
    const tableNum = node.label.match(/\d+/)?.[0];
    if (!tableNum || !seatIdSet.has(tableNum)) return false;

    if (mode === "vip") {
      return node.type === "vip-table";
    }
    if (mode === "regular") {
      return node.type === "table";
    }

    // admin mode
    return node.type === "table" || node.type === "vip-table";
  };

  // ---------------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------------
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

    // helper for rounded rectangles (used by VIP tables)
    const drawRoundedRect = (
      ctx: CanvasRenderingContext2D,
      x: number,
      y: number,
      w: number,
      h: number,
      r: number,
    ) => {
      const radius = Math.min(r, w / 2, h / 2);
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + w - radius, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
      ctx.lineTo(x + w, y + h - radius);
      ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
      ctx.lineTo(x + radius, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
    };

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
        // invisible
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
      }

      // regular tables (blue circles)
      else if (node.type === "table") {
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
      }

      // VIP tables (red long vertical rectangles)
      else if (node.type === "vip-table") {
        const tableNum = node.label.match(/\d+/)?.[0];
      
        // long vertical bar
        const width = 22 * contentScale;   // thinner
        const height = 90 * contentScale;  // taller
        const x = pos.x - width / 2;
        const y = pos.y - height / 2;
      
        // main red rectangle
        ctx.fillStyle = "#DC2626";
        ctx.fillRect(x, y, width, height);
      
        // yellow highlight border when selected
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
      
        // vertical label text, similar to BUFFET
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(-Math.PI / 2); // vertical
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
  }, [venueNodes, zoom, pan, selectedSeatIds, mode, seatIdSet]);

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------
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

  const headerLabelPrefix =
    mode === "vip" ? "VIP Seat Number " : "Seat Number ";

  const headerSeatLabel =
    !hasSelectedSeats
      ? ""
      : selectedSeatIds.length === 1
      ? `${headerLabelPrefix}${selectedSeatIds[0]}`
      : `${headerLabelPrefix}${selectedSeatIds.join(", ")}`;

  return (
    <>
      {/* Fullscreen overlay */}
      {isFullscreen && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
          <div className="flex items-center justify-between p-4 bg-card/90 border-b border-border">
            <h3 className="text-lg font-semibold">
              <h2 className="text-base md:text-lg font-semibold leading-tight">
                Venue Map
              </h2>
              {headerSeatLabel}
            </h3>
            <Button variant="ghost" size="sm" onClick={toggleFullscreen}>
              <Minimize2 className="w-5 h-5" />
            </Button>
          </div>
          <div
            ref={containerRef}
            className="relative flex-1 overflow-hidden bg-background overscroll-contain"
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
      )}

      {/* Normal embedded view */}
      <Card className="bg-card/95 border-border overflow-hidden shadow-lg">
        {error && (
          <div className="p-3 md:p-4 bg-destructive/10 border-b border-destructive/40 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 md:w-5 md:h-5 text-destructive flex-shrink-0" />
            <p className="text-xs md:text-sm text-destructive">{error}</p>
          </div>
        )}

        {hasSelectedSeats && !error && (
          <div className="p-3 md:p-4 bg-muted/40 border-b border-border flex items-center justify-between">
            <p className="text-xs md:text-sm text-foreground text-center leading-relaxed flex-1">
              <h3 className="font-semibold text-sm md:text-base">Venue Map</h3>
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

        <div className="w-full bg-[oklch(0.18_0.04_260)] p-3 md:p-4">
          <div
            ref={containerRef}
            className="relative w-full h-[75vh] md:h-[550px] lg:h-[650px] max-w-full overscroll-contain"
          >
            <canvas
              {...canvasProps}
              className="absolute inset-0 w-full h-full cursor-move touch-none"
            />
          </div>
        </div>
      </Card>
    </>
  );
}
