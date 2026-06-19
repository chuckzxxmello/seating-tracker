<img src="https://readme-typing-svg.herokuapp.com?font=Anaheim&size=32&duration=3000&pause=2000&color=1F51FF&width=1000&lines=Legacy+Night;Seating+Tracker+and+Seat+Pathfinding" alt="Typing SVG" />

A web application for managing event check-ins and providing interactive venue navigation using custom pathfinding. It uses Firebase for real-time data synchronization.

## Key Features

### Guest Seat Searching
The search function (`app/page.tsx`) tokenizes input and performs localized multi-field matching against name, ticket number, and category. It normalizes strings to remove diacritics.

### Visual Pathfinding & Multi-seat Highlighting
Queries the `DijkstraGraph` to highlight specific seats or groups. The calculated path is rendered on an interactive canvas or SVG layer over the venue background image.

### Admin Analytics & Data Import
Leverages `lib/csv-service.ts` to parse CSV files locally, validate schema, and dispatch batch payloads to Firestore.

## Technical Components

### 1. Pathfinding Engine (lib/dijkstra-engine.ts)
Implements Dijkstra's algorithm for 2D spatial venue navigation.
- **Graph Representation**: Maps the venue as a network of nodes (entrances, tables, buffets, stages, crying-rooms) and edges with Euclidean distance weighting.
- **Priority Queue**: Resolves the shortest path from an entrance node to an assigned seat.
- **Navigational Instructions**: Translates coordinate paths into step-by-step text directions based on angles.
- **Edge Node Architecture**: Supports `edge-node` types to define walkable corridors and enforce 90-degree turns, preventing paths from crossing non-walkable areas.

### 2. Venue Map Service (lib/venue-map-service.ts)
Manages spatial layouts within the event space.
- **Dynamic Layouts**: Provides templates (Standard Tables, VIP Section, Wedding Reception, Conference Hall) and supports custom coordinates.
- **Graph Construction**: Dynamically builds node-edge graphs based on entrance proximity and edge-node alignments. Connects table nodes to the nearest walkable edge nodes.
- **State Persistence**: Serializes map data (node coordinates, types, labels) and stores it in Firestore.

### 3. Firebase Services (lib/firebase-service.ts)
Handles backend operations.
- **Attendee Management**: CRUD operations for attendees, with support for batch CSV importing utilizing Firestore write batches.
- **Check-ins**: Boolean state updates and timestamping for delegate check-ins.
- **Audit Logging**: Logs administrative actions (check-ins, overrides).
- **Analytics Aggregation**: Aggregates check-in statistics, region distributions, category breakdowns, and no-show counts.

## Project Structure

```text
seating-tracker-main/
├── app/
│   ├── admin/                # Analytics and map editor
│   ├── staff/                # General management portal
│   ├── checkin/              # Check-in interface
│   ├── login/                # Authentication
│   └── page.tsx              # Landing and search interface
├── components/
│   ├── ui/                   # Primitive components
│   ├── venue-map-editor.tsx  # Venue layout editor
│   ├── pathfinding-visualization.tsx # Dijkstra path rendering
│   ├── admin-attendees-list.tsx # Attendee management tables
│   └── csv-import-dialog.tsx # Client-side CSV parsing
├── lib/
│   ├── dijkstra-engine.ts    # Graph algorithms
│   ├── firebase-service.ts   # Firestore queries
│   ├── venue-map-service.ts  # Map graph generation
│   └── auth-context.tsx      # Firebase Authentication context
├── hooks/                    # Custom React hooks
└── styles/                   # Global CSS
```

## Tech Stack

- **Framework**: Next.js 16.0.0 (App Router)
- **UI Library**: React 19.2.0
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS 4.1.9, PostCSS
- **Component System**: Radix UI, shadcn/ui
- **Backend/Database**: Firebase (Firestore, Auth, Storage)
- **Icons**: Lucide React
- **Data Visualization**: Recharts
- **Graphing/Mapping**: @xyflow/react
