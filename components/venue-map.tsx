"use client"

import { useEffect, useRef } from "react"
import type { PathResult } from "@/lib/dijkstra"

interface VenueMapProps {
  highlightPath?: PathResult | null
  selectedSeat?: string | null
  onSeatClick?: (seatId: string) => void
  interactive?: boolean
}

// Logical design size (what the drawing is built for)
const DESIGN_WIDTH = 1000
const DESIGN_HEIGHT = 1200

// Table layout config (must match how you numbered seats)
const TABLE_RADIUS = 12
const TABLE_SPACING_X = 50
const TABLE_SPACING_Y = 50

const SECTION_CONFIGS = [
  { startTable: 1, endTable: 20, startX: 80, startY: 150 },
  { startTable: 21, endTable: 40, startX: 550, startY: 150 },
  { startTable: 41, endTable: 60, startX: 80, startY: 500 },
  { startTable: 61, endTable: 80, startX: 550, startY: 500 },
]

function getSeatPosition(seatNumber: number): { x: number; y: number } | null {
  if (seatNumber < 1 || seatNumber > 80) return null

  const section = SECTION_CONFIGS.find(
    (s) => seatNumber >= s.startTable && seatNumber <= s.endTable,
  )
  if (!section) return null

  const indexInSection = seatNumber - section.startTable
  const row = Math.floor(indexInSection / 5)
  const col = indexInSection % 5

  return {
    x: section.startX + col * TABLE_SPACING_X,
    y: section.startY + row * TABLE_SPACING_Y,
  }
}

export function VenueMap({
  highlightPath,
  selectedSeat,
  onSeatClick,
  interactive = false,
}: VenueMapProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // Draw + responsive scaling
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const draw = () => {
      const rect = canvas.getBoundingClientRect()

      const displayWidth = rect.width || DESIGN_WIDTH
      const displayHeight = rect.height || DESIGN_HEIGHT

      const dpr = window.devicePixelRatio || 1

      // Set backing store size
      canvas.width = displayWidth * dpr
      canvas.height = displayHeight * dpr

      // Reset any existing transform
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Coordinate system: scale DESIGN_WIDTH/HEIGHT into available size
      const scale = Math.min(
        displayWidth / DESIGN_WIDTH,
        displayHeight / DESIGN_HEIGHT,
      )
      const offsetX = (displayWidth - DESIGN_WIDTH * scale) / 2
      const offsetY = (displayHeight - DESIGN_HEIGHT * scale) / 2

      // Map logical units → CSS pixels (then DPR)
      ctx.save()
      ctx.scale(dpr, dpr)
      ctx.translate(offsetX, offsetY)
      ctx.scale(scale, scale)

      // Draw everything in logical coordinates (0–1000, 0–1200)
      drawVenue(ctx)

      if (highlightPath) {
        drawPath(ctx, highlightPath)
      }

      if (selectedSeat) {
        drawSelectedSeat(ctx, selectedSeat)
      }

      ctx.restore()
    }

    draw()
    window.addEventListener("resize", draw)
    return () => window.removeEventListener("resize", draw)
  }, [highlightPath, selectedSeat])

  // Seat clicking (optional)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !interactive || !onSeatClick) return

    const handleClick = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const displayWidth = rect.width || DESIGN_WIDTH
      const displayHeight = rect.height || DESIGN_HEIGHT

      // Same scale + offsets as in draw()
      const scale = Math.min(
        displayWidth / DESIGN_WIDTH,
        displayHeight / DESIGN_HEIGHT,
      )
      const offsetX = (displayWidth - DESIGN_WIDTH * scale) / 2
      const offsetY = (displayHeight - DESIGN_HEIGHT * scale) / 2

      const canvasX = event.clientX - rect.left
      const canvasY = event.clientY - rect.top

      // Convert back to logical coordinates
      const worldX = (canvasX - offsetX) / scale
      const worldY = (canvasY - offsetY) / scale

      const CLICK_RADIUS = TABLE_RADIUS + 8
      let clickedSeat: number | null = null

      for (let seat = 1; seat <= 80; seat++) {
        const pos = getSeatPosition(seat)
        if (!pos) continue
        const dx = worldX - pos.x
        const dy = worldY - pos.y
        const distance = Math.sqrt(dx * dx + dy * dy)
        if (distance <= CLICK_RADIUS) {
          clickedSeat = seat
          break
        }
      }

      if (clickedSeat !== null) {
        onSeatClick(String(clickedSeat))
      }
    }

    canvas.addEventListener("click", handleClick)
    return () => canvas.removeEventListener("click", handleClick)
  }, [interactive, onSeatClick])

  return (
    <canvas
      ref={canvasRef}
      /* Taller on mobile so the map really fills the viewport */
      className="border-2 border-blue-200 rounded-lg bg-white w-full h-[85vh] sm:h-[75vh] md:h-[650px] max-w-none mx-auto"
    />
  )
}

/* ---------- Drawing helpers (logical coordinates) ---------- */

function drawVenue(ctx: CanvasRenderingContext2D) {
  // Background
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT)

  ctx.strokeStyle = "#1e40af"
  ctx.lineWidth = 2

  // Stage
  ctx.fillStyle = "#001f3f"
  ctx.fillRect(150, 30, 700, 80)
  ctx.fillStyle = "#ffffff"
  ctx.font = "bold 24px Arial"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText("STAGE", 500, 70)

  // Circular table sections
  const drawSeatingSection = (
    startX: number,
    startY: number,
    rows: number,
    cols: number,
    startTableNumber: number,
  ) => {
    let tableNumber = startTableNumber

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = startX + col * TABLE_SPACING_X
        const y = startY + row * TABLE_SPACING_Y

        ctx.beginPath()
        ctx.arc(x, y, TABLE_RADIUS, 0, Math.PI * 2)
        ctx.fillStyle = "#1d4ed8"
        ctx.fill()
        ctx.strokeStyle = "#1e3a8a"
        ctx.stroke()

        ctx.fillStyle = "#ffffff"
        ctx.font = "bold 12px Arial"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText(tableNumber.toString(), x, y)

        tableNumber++
      }
    }
  }

  // 4 blocks of tables (1–80)
  drawSeatingSection(80, 150, 4, 5, 1) // 1–20
  drawSeatingSection(550, 150, 4, 5, 21) // 21–40
  drawSeatingSection(80, 500, 4, 5, 41) // 41–60
  drawSeatingSection(550, 500, 4, 5, 61) // 61–80

  // Buffet blocks
  const drawBuffet = (x: number, y: number, label: string) => {
    ctx.fillStyle = "#000000"
    ctx.fillRect(x, y, 80, 80)
    ctx.fillStyle = "#ffffff"
    ctx.font = "bold 10px Arial"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(label, x + 40, y + 40)
  }

  drawBuffet(50, 250, "BUFFET 1")
  drawBuffet(900 - 80, 250, "BUFFET 4")
  drawBuffet(50, 600, "BUFFET 2")
  drawBuffet(900 - 80, 600, "BUFFET 3")

  // Entrance
  ctx.fillStyle = "#059669"
  ctx.fillRect(400, 1150, 200, 30)
  ctx.fillStyle = "#ffffff"
  ctx.font = "bold 12px Arial"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText("MAIN ENTRANCE", 500, 1165)

  // Photo exhibit
  ctx.fillStyle = "#1e3a8a"
  ctx.fillRect(250, 1000, 500, 60)
  ctx.fillStyle = "#ffffff"
  ctx.font = "bold 14px Arial"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText("PHOTO EXHIBIT", 500, 1030)
}

function drawPath(ctx: CanvasRenderingContext2D, result: PathResult) {
  if (!result.path || result.path.length === 0) return

  ctx.strokeStyle = "#ef4444"
  ctx.lineWidth = 4
  ctx.setLineDash([5, 5])
  ctx.lineJoin = "round"
  ctx.lineCap = "round"

  ctx.beginPath()
  result.path.forEach((node, index) => {
    if (index === 0) {
      ctx.moveTo(node.x, node.y)
    } else {
      ctx.lineTo(node.x, node.y)
    }
  })
  ctx.stroke()
  ctx.setLineDash([])

  // Start/end markers
  result.path.forEach((node, index) => {
    ctx.beginPath()
    ctx.arc(node.x, node.y, index === 0 ? 8 : 5, 0, Math.PI * 2)
    ctx.fillStyle = index === 0 ? "#22c55e" : "#f97316"
    ctx.fill()
  })
}

function drawSelectedSeat(ctx: CanvasRenderingContext2D, seatId: string) {
  const seatNumber = Number.parseInt(seatId, 10)
  if (!Number.isFinite(seatNumber)) return

  const pos = getSeatPosition(seatNumber)
  if (!pos) return

  ctx.save()
  ctx.beginPath()
  ctx.arc(pos.x, pos.y, TABLE_RADIUS + 6, 0, Math.PI * 2)
  ctx.strokeStyle = "#facc15"
  ctx.lineWidth = 4
  ctx.shadowColor = "rgba(250, 204, 21, 0.7)"
  ctx.shadowBlur = 12
  ctx.stroke()
  ctx.restore()
}
