"use client"
import { useCallback, useEffect, useState, useRef } from "react"
import type React from "react"

import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  addEdge,
  type Connection,
  useNodesState,
  useEdgesState,
  SelectionMode,
  type OnSelectionChangeParams,
  useReactFlow,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import {
  type VenueNode,
  type NodeGroup,
  getVenueMap,
  saveVenueMap,
  LAYOUT_TEMPLATES,
  loadLayoutTemplate,
} from "@/lib/venue-map-service"
import {
  Trash2,
  Save,
  Plus,
  Undo,
  Redo,
  Group,
  Ungroup,
  ImageIcon,
  RefreshCw,
  Layout,
  ZoomIn,
  CheckCircle,
  AlertCircle,
  Eraser,
} from "lucide-react"
import VenueNodeComponent from "./venue-node"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"

const NODE_TYPES: Record<string, { color: string; label: string }> = {
  entrance: { color: "#3B82F6", label: "Entrance" },
  table: { color: "#1E40AF", label: "Table" },
  "vip-table": { color: "#DC2626", label: "VIP Table" },
  buffet: { color: "#059669", label: "Buffet" },
  "carving-table": { color: "#7C3AED", label: "Carving Table" },
  "photo-exhibit": { color: "#F59E0B", label: "Photo Exhibit" },
  "crying-room": { color: "#06B6D4", label: "Crying Room" },
  stage: { color: "#1F2937", label: "Stage" },
  "edge-node": { color: "#10B981", label: "Edge Node" },
  custom: { color: "#8B5CF6", label: "Custom Node" },
}

type HistoryState = {
  nodes: Node<VenueNode>[]
  edges: Edge[]
}

function VenueMapEditorContent() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<VenueNode>>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [showBackgroundImage, setShowBackgroundImage] = useState(true)
  const [backgroundOpacity, setBackgroundOpacity] = useState(0.3)
  const [editingLabel, setEditingLabel] = useState("")
  const [newNodeType, setNewNodeType] = useState<VenueNode["type"] | null>(null)

  const [customX, setCustomX] = useState("")
  const [customY, setCustomY] = useState("")
  const [xError, setXError] = useState("")
  const [yError, setYError] = useState("")

  const [history, setHistory] = useState<HistoryState[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)

  const [groups, setGroups] = useState<NodeGroup[]>([])
  const [groupDialogOpen, setGroupDialogOpen] = useState(false)
  const [newGroupName, setNewGroupName] = useState("")
  const [newGroupColor, setNewGroupColor] = useState("#8B5CF6")

  const [backgroundImageUrl, setBackgroundImageUrl] = useState(
    "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/9caa3868-4cd5-468f-9fe7-4dc613433d03.jfif-bjuGNoSEEOVtEQdwylS2JSfEkM6Jhy.jpeg",
  )
  const [customImageDialogOpen, setCustomImageDialogOpen] = useState(false)
  const [customImageInput, setCustomImageInput] = useState("")

  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<string>("")

  const [defaultZoom, setDefaultZoom] = useState(0.8)
  const { fitView, zoomTo, setCenter } = useReactFlow()

  const { toast } = useToast()

  const isAltPressed = useRef(false)
  const isDraggingForDuplication = useRef(false)
  const originalNodeForDuplication = useRef<{ id: string; x: number; y: number } | null>(null)

  const hasLoadedInitially = useRef(false)
  const historySaveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (!hasLoadedInitially.current) {
      loadVenueMap()
      hasLoadedInitially.current = true
    }
  }, []) // Empty dependency array - only run once on mount

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Alt") {
        isAltPressed.current = true
      }

      // Undo: Ctrl+Z (or Cmd+Z on Mac)
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        handleUndo()
      }

      // Redo: Ctrl+Y or Ctrl+Shift+Z (or Cmd+Y, Cmd+Shift+Z on Mac)
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault()
        e.stopPropagation()
        handleRedo()
      }

      if (e.key === "Delete" && selectedNodeIds.length > 0) {
        e.preventDefault()
        handleDeleteSelectedNodes()
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Alt") {
        isAltPressed.current = false
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
    }
  }, [selectedNodeIds, historyIndex, history]) // Now depends on selectedNodeIds, historyIndex, and history

  const saveToHistory = useCallback(() => {
    setHistory((prevHistory) => {
      const newState: HistoryState = {
        nodes: JSON.parse(JSON.stringify(nodes)),
        edges: JSON.parse(JSON.stringify(edges)),
      }
      const newHistory = prevHistory.slice(0, historyIndex + 1)
      newHistory.push(newState)
      // Keep only last 50 states
      if (newHistory.length > 50) {
        newHistory.shift()
      }
      return newHistory
    })
    setHistoryIndex((prev) => Math.min(prev + 1, 49))
  }, [nodes, edges]) // Now depends on nodes and edges for deep copy

  useEffect(() => {
    // Only save to history after initial load is complete and not currently loading
    if (!hasLoadedInitially.current || isLoading) {
      return
    }

    // Clear existing timeout
    if (historySaveTimeoutRef.current) {
      clearTimeout(historySaveTimeoutRef.current)
    }

    // Set new timeout for debounced save
    historySaveTimeoutRef.current = setTimeout(() => {
      // Only save if we have nodes
      if (nodes.length > 0) {
        saveToHistory()
      }
    }, 1000) // Increased debounce to 1 second to prevent loops

    return () => {
      if (historySaveTimeoutRef.current) {
        clearTimeout(historySaveTimeoutRef.current)
      }
    }
  }, [nodes, edges]) // Depend on nodes and edges to trigger the effect on changes

  const loadVenueMap = async () => {
    try {
      setIsLoading(true)
      console.log("[v0] Loading venue map from Firebase...")

      const venueMap = await getVenueMap()

      if (venueMap) {
        console.log("[v0] Venue map loaded with", venueMap.nodes.length, "nodes")

        const flowNodes: Node<VenueNode>[] = venueMap.nodes.map((node) => ({
          id: node.id,
          data: node,
          position: { x: node.x, y: node.y },
          type: "venue",
          draggable: true,
          selectable: true,
        }))

        setNodes(flowNodes)
        setGroups(venueMap.groups || [])

        if (venueMap.customImageUrl) {
          setBackgroundImageUrl(venueMap.customImageUrl)
        }
        if (venueMap.backgroundOpacity !== undefined) {
          setBackgroundOpacity(venueMap.backgroundOpacity)
        }
        if (venueMap.defaultZoom) {
          setDefaultZoom(venueMap.defaultZoom)
          setTimeout(() => {
            zoomTo(venueMap.defaultZoom || 0.8)
            if (venueMap.defaultCenter) {
              setCenter(venueMap.defaultCenter.x, venueMap.defaultCenter.y, { zoom: venueMap.defaultZoom })
            }
          }, 100)
        }

        toast({
          title: "Venue Map Loaded",
          description: `Loaded ${venueMap.nodes.length} nodes successfully`,
        })
      } else {
        console.log("[v0] No existing venue map found")
        toast({
          title: "No Existing Map",
          description: "Start by loading a template or adding nodes",
          variant: "default",
        })
      }
    } catch (error) {
      console.error("[v0] Error loading venue map:", error)
      toast({
        title: "Failed to Load Venue Map",
        description: error instanceof Error ? error.message : "Please check your connection and try again",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
      console.log("[v0] Venue map loading complete")
    }
  }

  const handleLoadTemplate = () => {
    if (!selectedTemplate) return

    const template = loadLayoutTemplate(selectedTemplate)
    if (!template) return

    const flowNodes: Node<VenueNode>[] = template.nodes.map((node) => ({
      id: node.id,
      data: {
        ...node,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      position: { x: node.x, y: node.y },
      type: "venue",
      draggable: true,
      selectable: true,
    }))

    setNodes(flowNodes)
    if (template.groups) {
      setGroups(template.groups)
    }
    setTemplateDialogOpen(false)

    toast({
      title: "Template Loaded",
      description: `Applied "${template.name}" with ${template.nodes.length} nodes`,
    })

    setTimeout(() => fitView({ padding: 0.2 }), 100)
  }

  const handleSaveChanges = async () => {
    try {
      setIsSaving(true)

      // Validate that we have nodes to save
      if (nodes.length === 0) {
        toast({
          title: "Nothing to Save",
          description: "Add some nodes to the map before saving",
          variant: "destructive",
        })
        return
      }

      const venueNodes = nodes.map((node) => {
        const cleanedNode: VenueNode = {
          id: node.data.id,
          x: Math.round(node.position.x),
          y: Math.round(node.position.y),
          type: node.data.type,
          label: node.data.label || `Node ${node.data.id}`,
          createdAt: node.data.createdAt || new Date(),
          updatedAt: new Date(),
        }

        // Only add optional fields if they have actual values
        if (node.data.description) {
          cleanedNode.description = node.data.description
        }
        if (node.data.customLabel) {
          cleanedNode.customLabel = node.data.customLabel
        }
        if (node.data.seats !== undefined && node.data.seats !== null) {
          cleanedNode.seats = node.data.seats
        }
        if (node.data.groupId) {
          cleanedNode.groupId = node.data.groupId
        }

        return cleanedNode
      })

      const venueMapData = {
        name: "Main Event Venue",
        imageUrl:
          "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/9caa3868-4cd5-468f-9fe7-4dc613433d03.jfif-bjuGNoSEEOVtEQdwylS2JSfEkM6Jhy.jpeg",
        width: 1200,
        height: 1400,
        nodes: venueNodes,
        ...(backgroundImageUrl && { customImageUrl: backgroundImageUrl }),
        ...(backgroundOpacity !== undefined && { backgroundOpacity }),
        ...(defaultZoom !== undefined && { defaultZoom }),
        ...(groups.length > 0 && { groups }),
        defaultCenter: { x: 600, y: 700 },
      }

      await saveVenueMap(venueMapData)

      toast({
        title: "Venue Map Saved Successfully",
        description: `Saved ${venueNodes.length} nodes and ${groups.length} groups to Firebase. Pathfinding will use this layout.`,
      })
    } catch (error) {
      console.error("[v0] Error saving venue map:", error)

      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred"
      toast({
        title: "Failed to Save Venue Map",
        description: `${errorMessage}. Please ensure all nodes have valid data and try again. If the issue persists, check your Firebase connection.`,
        variant: "destructive",
        action: (
          <Button variant="outline" size="sm" onClick={handleSaveChanges}>
            Retry
          </Button>
        ),
      })
    } finally {
      setIsSaving(false)
    }
  }

  const validateNumericInput = (value: string, fieldName: string): { isValid: boolean; error: string } => {
    // Allow empty string (user might be clearing input)
    if (value === "" || value === "-") {
      return { isValid: true, error: "" }
    }

    // Check if it's a valid number
    const numValue = Number(value)
    if (Number.isNaN(numValue)) {
      return { isValid: false, error: `${fieldName} must be a valid number` }
    }

    // Check reasonable bounds for venue coordinates
    if (numValue < -1000 || numValue > 5000) {
      return { isValid: false, error: `${fieldName} must be between -1000 and 5000` }
    }

    return { isValid: true, error: "" }
  }

  const handleXChange = (value: string) => {
    const sanitized = value.replace(/[^0-9.-]/g, "")
    setCustomX(sanitized)

    const validation = validateNumericInput(sanitized, "X coordinate")
    setXError(validation.error)

    // Update node position if valid
    if (validation.isValid && sanitized !== "" && sanitized !== "-" && selectedNodeIds.length === 1) {
      const numValue = Number(sanitized)
      if (!Number.isNaN(numValue)) {
        updateNodePosition(selectedNodeIds[0], numValue, null)
      }
    }
  }

  const handleYChange = (value: string) => {
    const sanitized = value.replace(/[^0-9.-]/g, "")
    setCustomY(sanitized)

    const validation = validateNumericInput(sanitized, "Y coordinate")
    setYError(validation.error)

    // Update node position if valid
    if (validation.isValid && sanitized !== "" && sanitized !== "-" && selectedNodeIds.length === 1) {
      const numValue = Number(sanitized)
      if (!Number.isNaN(numValue)) {
        updateNodePosition(selectedNodeIds[0], null, numValue)
      }
    }
  }

  const updateNodePosition = (nodeId: string, newX: number | null, newY: number | null) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === nodeId) {
          return {
            ...n,
            position: {
              x: newX !== null ? newX : n.position.x,
              y: newY !== null ? newY : n.position.y,
            },
            data: { ...n.data, updatedAt: new Date() },
          }
        }
        return n
      }),
    )
  }

  const handleAddNode = () => {
    if (!newNodeType) return

    const newNode: Node<VenueNode> = {
      id: `node-${Date.now()}`,
      type: "venue",
      data: {
        id: `node-${Date.now()}`,
        x: 600,
        y: 300,
        type: newNodeType,
        label: `${NODE_TYPES[newNodeType].label} ${nodes.filter((n) => n.data.type === newNodeType).length + 1}`,
        description: "",
        seats: newNodeType === "table" || newNodeType === "vip-table" ? 8 : undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      position: { x: 600, y: 300 },
      draggable: true,
      selectable: true,
    }

    setNodes((nds) => [...nds, newNode])
    setEditingLabel(newNode.data.label)
    setSelectedNodeIds([newNode.id])

    setCustomX("600")
    setCustomY("300")
    setXError("")
    setYError("")

    toast({
      title: "Node Added",
      description: `Added ${newNode.data.label} to the map`,
    })
  }

  const handleSelectionChange = useCallback((params: OnSelectionChangeParams) => {
    setSelectedNodeIds(params.nodes.map((n) => n.id))
    if (params.nodes.length === 1) {
      setEditingLabel(params.nodes[0].data.label)
      const actualX = Math.round(params.nodes[0].position.x)
      const actualY = Math.round(params.nodes[0].position.y)
      setCustomX(actualX.toString())
      setCustomY(actualY.toString())
      setXError("")
      setYError("")
      console.log("[v0] Node selected - Position:", { x: actualX, y: actualY })
    } else {
      setCustomX("")
      setCustomY("")
      setXError("")
      setYError("")
    }
  }, [])

  const handleDeleteSelectedNodes = () => {
    if (selectedNodeIds.length === 0) return
    setNodes((nds) => nds.filter((n) => !selectedNodeIds.includes(n.id)))
    setSelectedNodeIds([])
    setEditingLabel("")
    // Clear coordinate inputs when nodes are deleted
    setCustomX("")
    setCustomY("")
    setXError("")
    setYError("")
  }

  const handleUpdateLabel = (newLabel: string) => {
    if (selectedNodeIds.length !== 1) return
    const selectedId = selectedNodeIds[0]
    setNodes((nds) =>
      nds.map((n) =>
        n.id === selectedId
          ? {
              ...n,
              data: { ...n.data, label: newLabel, updatedAt: new Date() },
            }
          : n,
      ),
    )
    setEditingLabel(newLabel)
  }

  const handleUndo = () => {
    if (historyIndex > 0) {
      const previousState = history[historyIndex - 1]
      setNodes(previousState.nodes)
      setEdges(previousState.edges)
      setHistoryIndex(historyIndex - 1)
    }
  }

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const nextState = history[historyIndex + 1]
      setNodes(nextState.nodes)
      setEdges(nextState.edges)
      setHistoryIndex(historyIndex + 1)
    }
  }

  const handleCreateGroup = () => {
    if (selectedNodeIds.length < 2) {
      alert("Please select at least 2 nodes to create a group")
      return
    }
    if (!newGroupName.trim()) {
      alert("Please enter a group name")
      return
    }

    const newGroup: NodeGroup = {
      id: `group-${Date.now()}`,
      name: newGroupName,
      color: newGroupColor,
      nodeIds: selectedNodeIds,
    }

    setGroups([...groups, newGroup])

    // Update nodes with group ID
    setNodes((nds) =>
      nds.map((n) => (selectedNodeIds.includes(n.id) ? { ...n, data: { ...n.data, groupId: newGroup.id } } : n)),
    )

    setGroupDialogOpen(false)
    setNewGroupName("")
    setNewGroupColor("#8B5CF6")
    toast({
      title: "Group Created",
      description: `"${newGroupName}" group created with ${selectedNodeIds.length} nodes`,
    })
  }

  const handleUngroup = () => {
    if (selectedNodeIds.length === 0) return

    setNodes((nds) =>
      nds.map((n) => (selectedNodeIds.includes(n.id) ? { ...n, data: { ...n.data, groupId: undefined } } : n)),
    )

    // Remove groups that no longer have nodes
    setGroups((grps) => grps.filter((g) => !g.nodeIds.every((id) => selectedNodeIds.includes(id))))
    toast({
      title: "Nodes Ungrouped",
      description: `${selectedNodeIds.length} nodes have been removed from their groups.`,
    })
  }

  const handleApplyCustomImage = async () => {
    if (customImageInput.trim()) {
      try {
        try {
          new URL(customImageInput)
        } catch {
          toast({
            title: "Invalid URL",
            description: "Please enter a valid image URL (e.g., https://example.com/image.jpg)",
            variant: "destructive",
          })
          return
        }

        setBackgroundImageUrl(customImageInput)
        setShowBackgroundImage(true)

        const venueMap = await getVenueMap()
        if (venueMap) {
          await saveVenueMap({
            ...venueMap,
            customImageUrl: customImageInput,
          })

          toast({
            title: "Custom Background Applied",
            description: "Custom image has been set and saved as the background",
          })
        }

        setCustomImageDialogOpen(false)
        setCustomImageInput("")
      } catch (error) {
        console.error("[v0] Error saving custom image URL:", error)
        toast({
          title: "Failed to Save Background",
          description: "Image URL updated locally but failed to save to database",
          variant: "destructive",
        })
      }
    } else {
      toast({
        title: "URL Required",
        description: "Please enter an image URL to apply as background",
        variant: "destructive",
      })
    }
  }

  const handleResetZoom = () => {
    fitView({ padding: 0.2, duration: 300 })
  }

  const handleSetDefaultZoom = () => {
    zoomTo(defaultZoom, { duration: 300 })
  }

  const handleClearAll = async () => {
    if (!confirm("Are you sure you want to clear ALL nodes? This action cannot be undone.")) return

    try {
      setNodes([])
      setEdges([])
      setGroups([])
      setSelectedNodeIds([])
      setEditingLabel("")
      setCustomX("")
      setCustomY("")

      toast({
        title: "Canvas Cleared",
        description: "All nodes have been removed from the canvas",
      })
    } catch (err) {
      console.error("[v0] Error clearing canvas:", err)
      toast({
        title: "Clear Failed",
        description: "Failed to clear canvas. Please try again.",
        variant: "destructive",
      })
    }
  }

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge(connection, eds))
    },
    [setEdges],
  )

  const handleNodeDragStart = useCallback((event: React.MouseEvent, node: Node<VenueNode>) => {
    if (isAltPressed.current) {
      isDraggingForDuplication.current = true
      originalNodeForDuplication.current = {
        id: node.id,
        x: node.position.x,
        y: node.position.y,
      }
      console.log("[v0] Alt+Drag started for duplication:", node.data.label)
    } else {
      isDraggingForDuplication.current = false
      originalNodeForDuplication.current = null
    }
  }, [])

  const handleNodeDrag = useCallback(
    (event: React.MouseEvent, node: Node<VenueNode>) => {
      if (selectedNodeIds.length === 1 && selectedNodeIds[0] === node.id && !isDraggingForDuplication.current) {
        setCustomX(Math.round(node.position.x).toString())
        setCustomY(Math.round(node.position.y).toString())
      }
    },
    [selectedNodeIds],
  )

  const handleNodeDragStop = useCallback(
    (event: React.MouseEvent, node: Node<VenueNode>) => {
      if (isDraggingForDuplication.current && originalNodeForDuplication.current) {
        const newPosition = { x: Math.round(node.position.x), y: Math.round(node.position.y) }

        setNodes((nds) =>
          nds.map((n) =>
            n.id === originalNodeForDuplication.current!.id
              ? {
                  ...n,
                  position: {
                    x: originalNodeForDuplication.current!.x,
                    y: originalNodeForDuplication.current!.y,
                  },
                }
              : n,
          ),
        )

        const duplicateId = `node-${Date.now()}-duplicate`
        const duplicateNode: Node<VenueNode> = {
          id: duplicateId,
          type: "venue",
          data: {
            ...node.data,
            id: duplicateId,
            label: `${node.data.label} (Copy)`,
            createdAt: new Date(),
            updatedAt: new Date(),
            x: newPosition.x,
            y: newPosition.y,
          },
          position: newPosition,
          draggable: true,
          selectable: true,
        }

        // Add the duplicate to the nodes array
        setTimeout(() => {
          setNodes((nds) => [...nds, duplicateNode])
          toast({
            title: "Node Duplicated",
            description: `Created a copy of "${node.data.label}" at (${newPosition.x}, ${newPosition.y})`,
          })
        }, 50)

        console.log("[v0] Duplication complete:", { original: node.data.label, duplicate: duplicateNode.data.label })

        isDraggingForDuplication.current = false
        originalNodeForDuplication.current = null
      } else {
        if (selectedNodeIds.length === 1 && selectedNodeIds[0] === node.id) {
          const finalX = Math.round(node.position.x)
          const finalY = Math.round(node.position.y)
          setCustomX(finalX.toString())
          setCustomY(finalY.toString())
          console.log("[v0] Node drag complete - Final position:", { x: finalX, y: finalY })
        }
      }
    },
    [selectedNodeIds, setNodes, toast],
  )

  const selectedNode = selectedNodeIds.length === 1 ? nodes.find((n) => n.id === selectedNodeIds[0]) : null

  if (isLoading) {
    return (
      <Card className="bg-white border-blue-200 p-6 shadow-sm">
        <p className="text-slate-600">Loading venue map...</p>
      </Card>
    )
  }

  return (
    <Card className="bg-white border-blue-200 shadow-sm overflow-hidden">
      <div className="space-y-4 p-6">
        <div className="border-b pb-4">
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Interactive Venue Map Editor</h3>
          <p className="text-slate-600 text-sm mb-3">
            Create precise venue layouts with circular nodes, load templates, and integrate with pathfinding algorithms.
          </p>

          <div className="mb-3">
            <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full gap-2 bg-gradient-to-r from-purple-50 to-blue-50 border-purple-300"
                >
                  <Layout className="w-4 h-4" />
                  Load Predefined Layout Template
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Choose Layout Template</DialogTitle>
                  <DialogDescription>Select a predefined venue layout to start quickly</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a template..." />
                    </SelectTrigger>
                    <SelectContent>
                      {LAYOUT_TEMPLATES.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          <div className="flex flex-col">
                            <span className="font-medium">{template.name}</span>
                            <span className="text-xs text-slate-500">{template.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedTemplate && (
                    <div className="bg-blue-50 p-3 rounded border border-blue-200">
                      <p className="text-sm font-medium text-blue-900 mb-1">
                        {LAYOUT_TEMPLATES.find((t) => t.id === selectedTemplate)?.name}
                      </p>
                      <p className="text-xs text-blue-700">
                        {LAYOUT_TEMPLATES.find((t) => t.id === selectedTemplate)?.description}
                      </p>
                    </div>
                  )}
                  <Button onClick={handleLoadTemplate} disabled={!selectedTemplate} className="w-full">
                    Load Template
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="space-y-3 p-3 bg-blue-50 rounded border border-blue-200 mb-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="bgToggle"
                  checked={showBackgroundImage}
                  onChange={(e) => setShowBackgroundImage(e.target.checked)}
                  className="w-4 h-4 cursor-pointer"
                />
                <label htmlFor="bgToggle" className="text-sm text-slate-700 cursor-pointer font-medium">
                  Show floor plan background
                </label>
              </div>
              <Dialog open={customImageDialogOpen} onOpenChange={setCustomImageDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" className="gap-2 bg-white">
                    <ImageIcon className="w-4 h-4" />
                    Custom Image
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Set Custom Background Image</DialogTitle>
                    <DialogDescription>
                      Enter an image URL to use as the venue map background. The image should be publicly accessible.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Image URL</Label>
                      <Input
                        value={customImageInput}
                        onChange={(e) => setCustomImageInput(e.target.value)}
                        placeholder="https://example.com/image.jpg"
                        className="mt-1"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Paste a direct link to your venue floor plan image (JPG, PNG, etc.)
                      </p>
                    </div>
                    <div className="bg-blue-50 p-3 rounded border border-blue-200">
                      <p className="text-xs text-blue-900 font-medium mb-1">How to get an image URL:</p>
                      <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
                        <li>Upload your image to a free service like Imgur, ImgBB, or Cloudinary</li>
                        <li>Right-click the uploaded image and select "Copy image address"</li>
                        <li>Paste the URL here and click Apply Image</li>
                      </ul>
                    </div>
                    <Button onClick={handleApplyCustomImage} className="w-full" disabled={!customImageInput.trim()}>
                      Apply Image
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            {showBackgroundImage && (
              <div>
                <Label className="text-xs text-slate-600">
                  Background Opacity: {Math.round(backgroundOpacity * 100)}%
                </Label>
                <Slider
                  value={[backgroundOpacity]}
                  onValueChange={(value) => setBackgroundOpacity(value[0])}
                  min={0}
                  max={1}
                  step={0.05}
                  className="mt-2"
                />
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <Button onClick={handleResetZoom} size="sm" variant="outline" className="flex-1 gap-2 bg-transparent">
              <ZoomIn className="w-4 h-4" />
              Fit to View
            </Button>
            <div className="flex-1 flex items-center gap-2">
              <Label className="text-xs whitespace-nowrap">Default Zoom:</Label>
              <Input
                type="number"
                value={defaultZoom}
                onChange={(e) => setDefaultZoom(Number.parseFloat(e.target.value) || 0.8)}
                min={0.1}
                max={2}
                step={0.1}
                className="h-8"
              />
              <Button onClick={handleSetDefaultZoom} size="sm" variant="outline">
                Apply
              </Button>
            </div>
          </div>

          <p className="font-medium mb-1">Keyboard Shortcuts:</p>
          <ul className="list-disc list-inside space-y-1 text-slate-600 text-xs">
            <li>
              <kbd className="px-1.5 py-0.5 text-xs font-semibold bg-white border border-slate-300 rounded">Ctrl</kbd> +{" "}
              <kbd className="px-1.5 py-0.5 text-xs font-semibold bg-white border border-slate-300 rounded">Z</kbd>:
              Undo
            </li>
            <li>
              <kbd className="px-1.5 py-0.5 text-xs font-semibold bg-white border border-slate-300 rounded">Ctrl</kbd> +{" "}
              <kbd className="px-1.5 py-0.5 text-xs font-semibold bg-white border border-slate-300 rounded">Y</kbd> or{" "}
              <kbd className="px-1.5 py-0.5 text-xs font-semibold bg-white border border-slate-300 rounded">Ctrl</kbd> +{" "}
              <kbd className="px-1.5 py-0.5 text-xs font-semibold bg-white border border-slate-300 rounded">Shift</kbd>{" "}
              + <kbd className="px-1.5 py-0.5 text-xs font-semibold bg-white border border-slate-300 rounded">Z</kbd>:
              Redo
            </li>
            <li>
              <kbd className="px-1.5 py-0.5 text-xs font-semibold bg-white border border-slate-300 rounded">Delete</kbd>
              : Delete selected node(s)
            </li>
            <li>
              <kbd className="px-1.5 py-0.5 text-xs font-semibold bg-white border border-slate-300 rounded">Ctrl</kbd> +
              Click: Multi-select nodes
            </li>
          </ul>

          <div className="bg-emerald-50 border border-emerald-200 rounded p-3 text-sm text-slate-700 mt-3">
            <p className="font-medium mb-1 text-emerald-900">How to use:</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>Load predefined templates for quick setup (Standard Tables, VIP Section, Wedding, Conference)</li>
              <li>Nodes are rendered as small circles (32px diameter) for precise seating visualization</li>
              <li>Use default zoom controls to set initial scale for real-world dimensions</li>
              <li>All node positions are saved for pathfinding algorithm integration</li>
              <li>Click Save to persist changes and make them available for shortest path calculations</li>
            </ul>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button
            onClick={handleUndo}
            disabled={historyIndex <= 0}
            variant="outline"
            size="sm"
            className="gap-2 bg-transparent"
          >
            <Undo className="w-4 h-4" />
            Undo
          </Button>
          <Button
            onClick={handleRedo}
            disabled={historyIndex >= history.length - 1}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <Redo className="w-4 h-4" />
            Redo
          </Button>
          <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
            <DialogTrigger asChild>
              <Button
                disabled={selectedNodeIds.length < 2}
                variant="outline"
                size="sm"
                className="gap-2 bg-transparent"
              >
                <Group className="w-4 h-4" />
                Group ({selectedNodeIds.length})
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Node Group</DialogTitle>
                <DialogDescription>Group {selectedNodeIds.length} selected nodes together</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Group Name</Label>
                  <Input
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="e.g., VIP Section"
                  />
                </div>
                <div>
                  <Label>Group Color</Label>
                  <Input type="color" value={newGroupColor} onChange={(e) => setNewGroupColor(e.target.value)} />
                </div>
                <Button onClick={handleCreateGroup} className="w-full">
                  Create Group
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Button
            onClick={handleUngroup}
            disabled={selectedNodeIds.length === 0}
            variant="outline"
            size="sm"
            className="gap-2 bg-transparent"
          >
            <Ungroup className="w-4 h-4" />
            Ungroup
          </Button>
          <Button
            onClick={handleClearAll}
            disabled={nodes.length === 0}
            variant="outline"
            size="sm"
            className="gap-2 bg-red-50 border-red-300 text-red-600 hover:bg-red-100"
          >
            <Eraser className="w-4 h-4" />
            Clear All
          </Button>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-900">Select Node Type</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 mb-2">
            {Object.entries(NODE_TYPES).map(([type, { color }]) => (
              <button
                key={type}
                onClick={() =>
                  setNewNodeType(
                    (newNodeType === (type as VenueNode["type"]) ? null : type) as VenueNode["type"] | null,
                  )
                }
                className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                  newNodeType === type ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-900 hover:bg-slate-300"
                }`}
              >
                {NODE_TYPES[type as VenueNode["type"]].label}
              </button>
            ))}
          </div>
          <Button
            onClick={handleAddNode}
            disabled={!newNodeType}
            className="w-full bg-green-600 hover:bg-green-700 text-white gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Node to Map
          </Button>
        </div>

        <div className="border-2 border-slate-300 rounded-lg overflow-hidden bg-slate-50 h-[500px] sm:h-[600px] md:h-[700px]">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onSelectionChange={handleSelectionChange}
            onNodeDragStart={handleNodeDragStart}
            onNodeDrag={handleNodeDrag}
            onNodeDragStop={handleNodeDragStop}
            nodeTypes={{ venue: VenueNodeComponent }}
            selectionMode={SelectionMode.Partial}
            panOnScroll
            selectionKeyCode={null}
            multiSelectionKeyCode="Control"
            defaultViewport={{ x: 0, y: 0, zoom: defaultZoom }}
            minZoom={0.1}
            maxZoom={2}
            fitViewOptions={{ padding: 0.2 }}
          >
            <Background color="#ccc" gap={12} size={2} />
            {showBackgroundImage && (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  backgroundImage: `url(${backgroundImageUrl})`,
                  backgroundSize: "contain",
                  backgroundPosition: "center",
                  backgroundRepeat: "no-repeat",
                  opacity: backgroundOpacity,
                  pointerEvents: "none",
                  zIndex: 0,
                }}
              />
            )}
            <Controls />
            <MiniMap nodeColor={(node) => NODE_TYPES[node.data.type]?.color || "#8B5CF6"} />
          </ReactFlow>
        </div>

        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
          {selectedNode ? (
            <div className="space-y-3">
              <h4 className="font-semibold text-slate-900">Node Properties</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-slate-600 mb-1">Custom Label</p>
                  <Input
                    value={editingLabel}
                    onChange={(e) => {
                      handleUpdateLabel(e.target.value)
                    }}
                    placeholder="Enter custom label..."
                    className="bg-white border-slate-300 text-sm"
                  />
                  <p className="text-slate-500 text-xs mt-1">Enter any meaningful name for this node</p>
                </div>
                <div>
                  <p className="text-slate-600 mb-1">Node Type</p>
                  <div className="bg-white px-3 py-2 rounded border border-slate-300 text-slate-900 font-medium">
                    {selectedNode.data.type}
                  </div>
                </div>
              </div>
              <div className="space-y-3 bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-lg border border-blue-200">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">Position Coordinates</p>
                  <span className="text-xs text-slate-500 bg-white px-2 py-1 rounded border">Real-time validation</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="coord-x" className="text-xs font-medium text-slate-700 flex items-center gap-1">
                      X Coordinate (Horizontal)
                    </Label>
                    <Input
                      id="coord-x"
                      type="text"
                      value={customX}
                      onChange={(e) => handleXChange(e.target.value)}
                      placeholder="e.g., 300"
                      className={`bg-white text-sm font-mono ${xError ? "border-red-500 focus-visible:ring-red-500" : "border-blue-300"}`}
                    />
                    {xError ? (
                      <div className="flex items-center gap-1.5 mt-1">
                        <AlertCircle className="w-3.5 h-3.5 text-red-600 flex-shrink-0" />
                        <p className="text-xs text-red-600 font-medium">{xError}</p>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">Enter value between -1000 and 5000</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="coord-y" className="text-xs font-medium text-slate-700 flex items-center gap-1">
                      Y Coordinate (Vertical)
                    </Label>
                    <Input
                      id="coord-y"
                      type="text"
                      value={customY}
                      onChange={(e) => handleYChange(e.target.value)}
                      placeholder="e.g., 450"
                      className={`bg-white text-sm font-mono ${yError ? "border-red-500 focus-visible:ring-red-500" : "border-blue-300"}`}
                    />
                    {yError ? (
                      <div className="flex items-center gap-1.5 mt-1">
                        <AlertCircle className="w-3.5 h-3.5 text-red-600 flex-shrink-0" />
                        <p className="text-xs text-red-600 font-medium">{yError}</p>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">Enter value between -1000 and 5000</p>
                    )}
                  </div>
                </div>
                <div className="flex items-start gap-2 bg-white/80 p-2.5 rounded border border-blue-200/60">
                  <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-600" />
                  <div className="text-xs text-slate-700 space-y-0.5">
                    <p className="font-medium">Input Format Guidelines:</p>
                    <ul className="list-disc list-inside space-y-0.5 text-slate-600">
                      <li>Only numeric values accepted (integers or decimals)</li>
                      <li>Negative values allowed (e.g., -50)</li>
                      <li>Updates apply instantly to the node position</li>
                      <li>Invalid characters are automatically removed</li>
                    </ul>
                  </div>
                </div>
              </div>
              {selectedNode.data.groupId && (
                <div className="bg-purple-50 p-2 rounded border border-purple-200 text-sm">
                  <p className="text-purple-900 font-medium">
                    Group: {groups.find((g) => g.id === selectedNode.data.groupId)?.name || "Unknown"}
                  </p>
                </div>
              )}
              <Button
                onClick={handleDeleteSelectedNodes}
                className="w-full bg-red-600 hover:bg-red-700 text-white gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Delete Node
              </Button>
            </div>
          ) : selectedNodeIds.length > 1 ? (
            <div className="space-y-3">
              <h4 className="font-semibold text-slate-900">Multiple Nodes Selected</h4>
              <p className="text-slate-600 text-sm">{selectedNodeIds.length} nodes selected</p>
              <Button
                onClick={handleDeleteSelectedNodes}
                className="w-full bg-red-600 hover:bg-red-700 text-white gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Delete {selectedNodeIds.length} Nodes
              </Button>
            </div>
          ) : (
            <p className="text-slate-600 text-sm">
              Click on a node to view and edit its properties. Drag on canvas to select multiple nodes.
            </p>
          )}
        </div>

        {groups.length > 0 && (
          <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
            <h4 className="font-semibold text-slate-900 mb-2">Active Groups</h4>
            <div className="space-y-2">
              {groups.map((group) => (
                <div
                  key={group.id}
                  className="flex items-center justify-between bg-white p-2 rounded border"
                  style={{ borderColor: group.color }}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded" style={{ backgroundColor: group.color }} />
                    <span className="font-medium text-sm">{group.name}</span>
                    <span className="text-xs text-slate-600">({group.nodeIds.length} nodes)</span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setGroups(groups.filter((g) => g.id !== group.id))
                      setNodes((nds) =>
                        nds.map((n) =>
                          n.data.groupId === group.id ? { ...n, data: { ...n.data, groupId: undefined } } : n,
                        ),
                      )
                    }}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            onClick={handleSaveChanges}
            disabled={isSaving || nodes.length === 0}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
          >
            <Save className="w-4 h-4" />
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
          <Button
            onClick={loadVenueMap}
            variant="outline"
            className="flex-1 border-slate-300 text-slate-700 bg-white hover:bg-slate-50 gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Reload
          </Button>
        </div>
      </div>
    </Card>
  )
}

export function VenueMapEditor() {
  return (
    <ReactFlowProvider>
      <VenueMapEditorContent />
    </ReactFlowProvider>
  )
}
