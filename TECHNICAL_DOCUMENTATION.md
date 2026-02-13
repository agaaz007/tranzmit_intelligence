# TRANZMIT - Comprehensive Technical Documentation

## Executive Summary

**Tranzmit** is an AI-powered customer research and churn recovery platform that combines quantitative session replay analysis with qualitative voice interviews to help product teams reduce churn and make data-driven decisions.

**Core Capabilities:**
- Session recording ingestion & replay (RRWeb format)
- AI-powered behavioral analysis (Google Gemini)
- Voice conversation AI (ElevenLabs)
- Multi-source analytics integration (PostHog, Mixpanel, Amplitude)
- Automated churn recovery outreach (Email via Resend, Calls via Twilio/ElevenLabs)
- Multi-tenant organization architecture

---

## Table of Contents

1. [Technology Stack](#1-technology-stack)
2. [Architecture Overview](#2-architecture-overview)
3. [Database Schema](#3-database-schema)
4. [Authentication Flow](#4-authentication-flow)
5. [Session Sync Pipeline](#5-session-sync-pipeline)
6. [RRWeb Event Parsing](#6-rrweb-event-parsing)
7. [Session Analysis (AI)](#7-session-analysis-ai)
8. [Insight Synthesis](#8-insight-synthesis)
9. [Analytics Integrations](#9-analytics-integrations)
10. [Recovery Outreach System](#10-recovery-outreach-system)
11. [Voice Conversations](#11-voice-conversations)
12. [API Reference](#12-api-reference)
13. [Frontend Architecture](#13-frontend-architecture)
14. [Data Storage & Latency](#14-data-storage--latency)
15. [Hosting & Deployment](#15-hosting--deployment)
16. [Security Considerations](#16-security-considerations)

---

## 1. Technology Stack

### Core Framework
| Component | Technology | Version |
|-----------|------------|---------|
| Framework | Next.js | 16.1.2 |
| Runtime | React | 19.2.3 |
| Language | TypeScript | 5.x |
| Styling | Tailwind CSS | 4.x |
| Animations | Framer Motion | 12.0.0 |

### Database & ORM
| Component | Technology | Purpose |
|-----------|------------|---------|
| Primary DB | PostgreSQL | Main data store (via Neon) |
| ORM | Prisma | 5.22.0 |
| Adapter | @prisma/adapter-libsql | LibSQL compatibility |

### Authentication
| Component | Technology | Purpose |
|-----------|------------|---------|
| Auth Provider | Clerk | 6.37.3 |
| Webhook Verification | Svix | 1.84.1 |

### AI/LLM Services
| Component | Technology | Purpose |
|-----------|------------|---------|
| Session Analysis | Google Gemini (gemini-2.5-flash-lite) | UX analysis |
| Insight Synthesis | OpenAI GPT-4o | Cross-session insights |
| Recovery Scripts | OpenAI GPT-5.2-chat-latest | Outreach generation |
| Voice AI | ElevenLabs Conversational AI | Recovery calls |

### External Services
| Service | Purpose | SDK |
|---------|---------|-----|
| PostHog | Session recordings & analytics | REST API |
| Mixpanel | Event analytics | REST API (Export) |
| Amplitude | Event analytics | REST API (Export) |
| Resend | Transactional email | resend@6.9.1 |
| Twilio | Phone calls | twilio@5.12.0 |
| ElevenLabs | Voice AI calls | REST API |

### Session Replay
| Component | Technology | Purpose |
|-----------|------------|---------|
| Recording Format | RRWeb | 2.0.0-alpha.4 |
| Player | rrweb-player | 1.0.0-alpha.4 |

### Additional Libraries
| Library | Purpose |
|---------|---------|
| zod@4.3.6 | Schema validation |
| ai@6.0.48 | Vercel AI SDK |
| @ai-sdk/google@3.0.13 | Google AI integration |
| @ai-sdk/openai@3.0.21 | OpenAI integration |
| @xyflow/react@12.10.0 | Flow diagrams (funnels) |

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  Dashboard  │  │  Sessions   │  │  Recovery   │  │  Interviews │    │
│  │    Page     │  │   Replay    │  │   Manager   │  │    Voice    │    │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘    │
└─────────┼────────────────┼────────────────┼────────────────┼───────────┘
          │                │                │                │
          ▼                ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           API LAYER (Next.js)                            │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Clerk Middleware (Auth)                       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐     │
│  │/sessions │ │/recovery │ │/projects │ │/dashboard│ │/webhooks │     │
│  │  sync    │ │ outreach │ │ settings │ │synthesize│ │  clerk   │     │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘     │
└───────┼────────────┼────────────┼────────────┼────────────┼───────────┘
        │            │            │            │            │
        ▼            ▼            ▼            ▼            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         SERVICE LAYER                                    │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐        │
│  │  Session   │  │  Recovery  │  │  Analysis  │  │  Synthesis │        │
│  │   Sync     │  │  Outreach  │  │  (Gemini)  │  │  (GPT-4o)  │        │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘        │
│        │               │               │               │               │
│  ┌─────▼──────┐  ┌─────▼──────┐  ┌─────▼──────┐  ┌─────▼──────┐        │
│  │  RRWeb     │  │  Email     │  │  RRWeb     │  │  Friction  │        │
│  │  Parser    │  │  (Resend)  │  │  Parser    │  │  Aggregator│        │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘        │
└───────────────────────────────────────────────────────────────────────┘
        │                │                │                │
        ▼                ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        EXTERNAL INTEGRATIONS                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ PostHog  │  │ Mixpanel │  │ Amplitude│  │ElevenLabs│  │  Twilio  │  │
│  │ Sessions │  │  Export  │  │  Export  │  │ Voice AI │  │  Calls   │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │
└───────────────────────────────────────────────────────────────────────┘
        │                │                │
        ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          DATA LAYER                                      │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    PostgreSQL (Neon)                             │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌───────────┐  │   │
│  │  │  User   │ │  Org    │ │ Project │ │ Session │ │ChurnedUser│  │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └───────────┘  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 3. Database Schema

### Entity Relationship Diagram

```
┌──────────────────┐      ┌──────────────────────┐      ┌──────────────────┐
│      User        │      │  OrganizationMember  │      │   Organization   │
├──────────────────┤      ├──────────────────────┤      ├──────────────────┤
│ id (PK)          │◄────┐│ id (PK)              │┌────►│ id (PK)          │
│ clerkId (unique) │     ││ userId (FK)          ││     │ name             │
│ email (unique)   │     ││ organizationId (FK)  ││     │ slug (unique)    │
│ firstName        │     ││ role                 ││     │ imageUrl         │
│ lastName         │     │└─────────────────────┘│     │ createdAt        │
│ imageUrl         │     │                       │     │ updatedAt        │
│ createdAt        │─────┘                       └─────┤                  │
│ updatedAt        │                                   │                  │
└──────────────────┘                                   └────────┬─────────┘
                                                                │
                                                                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                                Project                                    │
├──────────────────────────────────────────────────────────────────────────┤
│ id (PK)              │ organizationId (FK)    │ name                      │
│ apiKey (unique)      │ posthogKey             │ posthogHost               │
│ posthogProjId        │ mixpanelKey            │ mixpanelSecret            │
│ mixpanelProjId       │ mixpanelHost           │ amplitudeKey              │
│ amplitudeSecret      │ amplitudeProjId        │ elevenlabsAgentId         │
│ createdAt            │ updatedAt              │                           │
└──────────────────────┴───────────────────────┴───────────────────────────┘
         │                    │                          │
         │                    │                          │
         ▼                    ▼                          ▼
┌─────────────────┐  ┌─────────────────────┐  ┌──────────────────────┐
│    Session      │  │   ChurnedUser       │  │  SynthesizedInsight  │
├─────────────────┤  ├─────────────────────┤  ├──────────────────────┤
│ id (PK)         │  │ id (PK)             │  │ id (PK)              │
│ projectId (FK)  │  │ projectId (FK)      │  │ projectId (FK,unique)│
│ source          │  │ name                │  │ sessionCount         │
│ posthogSessionId│  │ email (unique)      │  │ criticalIssues (JSON)│
│ name            │  │ phone               │  │ patternSummary       │
│ distinctId      │  │ posthogDistinctId   │  │ topUserGoals (JSON)  │
│ startTime       │  │ sessionCount        │  │ immediateActions     │
│ endTime         │  │ analysisStatus      │  │ lastSyncedAt         │
│ duration        │  │ analysisResult      │  │ lastAnalyzedAt       │
│ events (TEXT)   │  │ recoveryEmail       │  │ lastSynthesizedAt    │
│ eventCount      │  │ callScript          │  │ syncStatus           │
│ analysis (TEXT) │  │ outreachStatus      │  │ syncError            │
│ analysisStatus  │  │ emailSentAt         │  │ createdAt            │
│ analyzedAt      │  │ emailMessageId      │  │ updatedAt            │
│ metadata (JSON) │  │ callCompletedAt     │  └──────────────────────┘
│ createdAt       │  │ callNotes           │
│ updatedAt       │  │ createdAt           │
└─────────────────┘  │ updatedAt           │
                     └─────────────────────┘
```

### Key Models Detail

#### Session Model
```prisma
model Session {
  id                String    @id @default(cuid())
  projectId         String
  project           Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)

  source            String    // 'upload' | 'posthog' | 'mixpanel' | 'amplitude'
  posthogSessionId  String?   // Dedup key (works for all sources)

  name              String
  distinctId        String?   // User identifier
  startTime         DateTime?
  endTime           DateTime?
  duration          Int?      // Duration in seconds

  events            String?   @db.Text  // JSON rrweb events
  eventCount        Int       @default(0)

  analysis          String?   @db.Text  // JSON analysis results
  analysisStatus    String    @default("pending") // pending|analyzing|completed|failed
  analyzedAt        DateTime?

  metadata          String?   // JSON: viewport, behavioral signals

  @@unique([projectId, posthogSessionId])
  @@index([projectId, createdAt])
}
```

#### Analysis Status State Machine
```
┌─────────┐    sync    ┌──────────┐   analyze   ┌───────────┐
│ (none)  │ ─────────► │ pending  │ ──────────► │ analyzing │
└─────────┘            └──────────┘             └─────┬─────┘
                                                      │
                              ┌────────────────┬──────┴──────┐
                              ▼                ▼             ▼
                        ┌───────────┐   ┌───────────┐   ┌────────┐
                        │ completed │   │  failed   │   │ error  │
                        └───────────┘   └───────────┘   └────────┘
```

---

## 4. Authentication Flow

### Clerk Integration Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER SIGNUP FLOW                             │
└─────────────────────────────────────────────────────────────────────┘

User ──► Clerk Sign-Up ──► Clerk Webhook ──► POST /api/webhooks/clerk
                                                     │
                                                     ▼
                               ┌─────────────────────────────────────┐
                               │      WEBHOOK HANDLER (Svix)         │
                               │  1. Verify signature (svix-*)       │
                               │  2. Parse event type                │
                               │  3. Extract user data               │
                               └──────────────┬──────────────────────┘
                                              │
                        ┌─────────────────────┴─────────────────────┐
                        │            user.created                   │
                        ▼                                           ▼
              ┌─────────────────┐                        ┌─────────────────┐
              │  Create User    │                        │  user.updated   │
              │  in Prisma DB   │                        │  user.deleted   │
              └────────┬────────┘                        └─────────────────┘
                       │
                       ▼
              ┌─────────────────┐
              │ Create Default  │
              │  Organization   │
              │  (with slug)    │
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │ Create Default  │
              │    Project      │
              │ (with API key)  │
              └─────────────────┘
```

### Middleware Protection

**File:** `src/middleware.ts`

```typescript
// Public routes (no auth required)
const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhooks(.*)',     // Clerk webhooks
  '/api/campaigns(.*)',    // External API (API key auth)
]);

// All other routes require Clerk authentication
if (!isPublicRoute(req)) {
  await auth.protect();
}
```

### Auth Helper Functions

| Function | Purpose | Returns |
|----------|---------|---------|
| `getCurrentUser()` | Get authenticated user (auto-creates if missing) | User with memberships |
| `getProjectWithAccess(projectId)` | Verify user can access project | Project + org + role |
| `getOrganizationWithAccess(orgId)` | Verify org membership | Organization + role |
| `getDefaultOrganization()` | Get user's primary org | Org with projects |
| `getUserProjects()` | Get all accessible projects | Array of projects |
| `requireAuth()` | Throw if not authenticated | User |
| `getProjectFromRequest(req)` | Get project from API key header | Project or null |

### API Key Authentication (External)

```typescript
// Header: X-Tranzmit-Api-Key: tranzmit_<32-char-hex>

const project = await prisma.project.findUnique({
  where: { apiKey: request.headers.get('x-tranzmit-api-key') }
});
```

---

## 5. Session Sync Pipeline

### Auto-Sync Flow (Complete Pipeline)

**Endpoint:** `POST /api/sessions/auto-sync`

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        AUTO-SYNC PIPELINE                                │
└─────────────────────────────────────────────────────────────────────────┘

Request: { projectId: string }
              │
              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 1: SYNC FROM ANALYTICS SOURCE                                       │
├─────────────────────────────────────────────────────────────────────────┤
│  Check project config:                                                   │
│  ├─ hasMixpanel? → syncSessionsFromMixpanel(projectId, 3 days, 5 max)   │
│  ├─ hasAmplitude? → syncSessionsFromAmplitude(projectId, 7 days)        │
│  └─ hasPostHog? → syncSessionsFromPostHog(projectId, 20 max)            │
│                                                                          │
│  Returns: { imported: N, skipped: N, failed: N, errors: [] }            │
└─────────────────────────────────────────────────────────────────────────┘
              │
              ▼ Update status: syncStatus = 'analyzing'
┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 2: ANALYZE PENDING SESSIONS                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  FOR EACH session WHERE analysisStatus = 'pending':                      │
│  ├─ Load events from DB                                                  │
│  ├─ Parse RRWeb → SemanticSession (behavioral metrics)                   │
│  ├─ Build context prompt (click/scroll/input/error metrics)              │
│  ├─ Call Gemini (gemini-2.5-flash-lite)                                  │
│  └─ Save analysis JSON to session record                                 │
│                                                                          │
│  Latency: ~2-5s per session (depends on event count)                     │
└─────────────────────────────────────────────────────────────────────────┘
              │
              ▼ Update status: syncStatus = 'synthesizing'
┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 3: SYNTHESIZE CROSS-SESSION INSIGHTS                                │
├─────────────────────────────────────────────────────────────────────────┤
│  ├─ Load all completed analyses                                          │
│  ├─ Aggregate friction points (with session ID linkage)                  │
│  ├─ Aggregate user intents & tags                                        │
│  ├─ Call GPT-4o for synthesis                                            │
│  └─ Save to SynthesizedInsight table                                     │
│                                                                          │
│  Latency: ~3-8s (depends on session count)                               │
└─────────────────────────────────────────────────────────────────────────┘
              │
              ▼ Update status: syncStatus = 'complete'
Response: { synced: N, analyzed: N, synthesized: boolean, insight: {...} }
```

### Source-Specific Sync Details

#### PostHog Sync
**File:** `src/lib/session-sync.ts`

```typescript
// API Endpoints (tries both patterns)
const urlPatterns = [
  `${host}/api/environments/${projectId}/session_recordings`,
  `${host}/api/projects/${projectId}/session_recordings`,
];

// Flow:
// 1. GET /session_recordings?limit=N → List of sessions
// 2. For each session:
//    a. GET /session_recordings/{id}/snapshots?blob_v2=true → Get blob sources
//    b. For each blob_key:
//       GET /session_recordings/{id}/snapshots?source=blob_v2&start_blob_key=X&end_blob_key=X
//    c. Parse NDJSON response (one event per line)
//    d. Decompress gzipped data (cv=compressed, base64 encoded)
//    e. Save to Session table
```

**Decompression Logic:**
```typescript
function decompressEvent(event) {
  // Event format: { type, timestamp, data, cv? }
  // If cv (compressed version) flag present:
  if (evt.cv && typeof evt.data === 'string') {
    // Try base64 decode + gunzip
    const buf = Buffer.from(evt.data, 'base64');
    const decompressed = zlib.gunzipSync(buf).toString('utf8');
    return JSON.parse(decompressed);
  }
  // Recursively decompress nested fields
  return decompressNestedFields(event);
}
```

#### Mixpanel Sync
**File:** `src/lib/mixpanel/sync.ts`

```typescript
// API: Export API (data.mixpanel.com/api/2.0/export)
// Auth: Service Account (username:secret) or API Secret (secret:)

// Date range: configurable (default 3 days back)
// Event limit: 50,000 max per fetch

// Flow:
// 1. Stream events via Export API (NDJSON)
// 2. Group events into sessions by $session_id or (distinct_id + 30min window)
// 3. Convert Mixpanel events → RRWeb format
// 4. Save to Session table (source: 'mixpanel', posthogSessionId: 'mp_...')
```

#### Amplitude Sync
**File:** `src/lib/amplitude/sync.ts`

```typescript
// API: Export API (amplitude.com/api/2/export)
// Auth: Basic (apiKey:secretKey)

// Date format: YYYYMMDDTHH
// Response: gzipped NDJSON

// Flow:
// 1. GET /api/2/export?start=...&end=...
// 2. Gunzip response buffer
// 3. Group events by (user_id|device_id)_session_id
// 4. Convert Amplitude events → RRWeb format
// 5. Save to Session table (source: 'amplitude', posthogSessionId: 'amp_...')
```

---

## 6. RRWeb Event Parsing

### Parser Architecture
**File:** `src/lib/rrweb-parser.ts`

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      RRWeb EVENT TYPES                                   │
├─────────────────────────────────────────────────────────────────────────┤
│  EventType.DomContentLoaded (0)  │  EventType.Load (1)                  │
│  EventType.FullSnapshot (2)      │  EventType.IncrementalSnapshot (3)   │
│  EventType.Meta (4)              │  EventType.Custom (5)                │
│  EventType.Plugin (6)            │                                      │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                  INCREMENTAL SOURCES (Type 3)                            │
├─────────────────────────────────────────────────────────────────────────┤
│  Mutation (0)         │  MouseMove (1)       │  MouseInteraction (2)    │
│  Scroll (3)           │  ViewportResize (4)  │  Input (5)               │
│  TouchMove (6)        │  MediaInteraction (7)│  StyleSheetRule (8)      │
│  CanvasMutation (9)   │  Font (10)           │  Log (11)                │
│  Drag (12)            │                      │                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Output: SemanticSession

```typescript
interface SemanticSession {
  totalDuration: string;       // "[MM:SS]"
  eventCount: number;
  pageUrl: string;
  pageTitle: string;
  viewportSize: { width: number; height: number };
  logs: SemanticLog[];         // Human-readable action log
  summary: {
    // Click metrics
    totalClicks: number;
    rageClicks: number;        // 3+ clicks on same element in 2s
    deadClicks: number;        // Click with no DOM mutation within 1s
    doubleClicks: number;
    rightClicks: number;

    // Input metrics
    totalInputs: number;
    abandonedInputs: number;   // Focus then blur with no input
    clearedInputs: number;     // Typed then deleted all

    // Scroll metrics
    totalScrolls: number;
    scrollDepthMax: number;    // Max scroll depth %
    rapidScrolls: number;      // Fast scrolling (frustration)
    scrollReversals: number;   // Going back up (searching)

    // Hover/attention
    totalHovers: number;
    hesitations: number;       // Hover >2s without action
    hoverTime: number;         // Total ms on interactive elements

    // Touch (mobile)
    totalTouches: number;
    swipes: number;
    pinchZooms: number;

    // Media
    totalMediaInteractions: number;
    videoPlays: number;
    videoPauses: number;

    // Clipboard
    totalSelections: number;
    copyEvents: number;
    pasteEvents: number;

    // Errors
    consoleErrors: number;     // From Log events
    networkErrors: number;     // From Plugin events (status >= 400)

    // Engagement
    tabSwitches: number;
    idleTime: number;          // Seconds with no interaction
    formSubmissions: number;

    // Viewport
    resizeEvents: number;
    orientationChanges: number;
  };

  behavioralSignals: {
    isExploring: boolean;      // Lots of scrolling, few clicks
    isFrustrated: boolean;     // Rage/dead clicks, rapid scrolls, errors
    isEngaged: boolean;        // Good interaction patterns
    isConfused: boolean;       // Hesitations, scroll reversals
    isMobile: boolean;         // Touch events detected
    completedGoal: boolean;    // Form submission detected
  };
}
```

### Semantic Log Entry

```typescript
interface SemanticLog {
  timestamp: string;    // "[MM:SS]"
  action: string;       // "Clicked", "Typed", "Scrolled", etc.
  details: string;      // "\"Submit\" button", "\"email\" field", etc.
  flags: string[];      // ["[RAGE CLICK]", "[NO RESPONSE]", "[CONSOLE ERROR]"]
}
```

### Detection Algorithms

#### Rage Click Detection
```typescript
// Rage click: 3+ clicks on same element within 2 seconds
const recentClicks = clickHistory.filter(
  (c) => c.id === nodeId && event.timestamp - c.timestamp < 2000
);
if (recentClicks.length >= 2) {
  flags.push('[RAGE CLICK]');
}
```

#### Dead Click Detection
```typescript
// Dead click: No DOM mutation within 1 second after click
const lookAheadLimit = Math.min(index + 100, events.length);
let responseFound = false;
for (let i = index + 1; i < lookAheadLimit; i++) {
  if (events[i].timestamp - event.timestamp > 1000) break;
  if (events[i].data.source === IncrementalSource.Mutation) {
    responseFound = true;
    break;
  }
}
if (!responseFound) {
  flags.push('[NO RESPONSE]');
}
```

#### Hesitation Detection
```typescript
// Hesitation: Hovering over interactive element for >2 seconds
const prevHover = hoverState.get(nodeId);
if (prevHover) {
  const hoverDuration = event.timestamp - prevHover;
  if (hoverDuration > 2000) {
    flags.push('[HESITATION]');
  }
}
```

#### Network Error Detection (from Plugin events)
```typescript
if (payload.requests && Array.isArray(payload.requests)) {
  const failedRequests = payload.requests.filter(
    (r) => r.responseStatus >= 400 || r.responseStatus === 0
  );
  if (failedRequests.length > 0) {
    flags.push('[NETWORK ERROR]');
  }
}
```

---

## 7. Session Analysis (AI)

### Analysis Pipeline
**File:** `src/lib/session-analysis.ts`

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       SESSION ANALYSIS FLOW                              │
└─────────────────────────────────────────────────────────────────────────┘

Input: sessionId
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. LOAD SESSION FROM DATABASE                                            │
│    SELECT events, analysisStatus FROM Session WHERE id = ?               │
└─────────────────────────────────────────────────────────────────────────┘
        │
        ▼ UPDATE analysisStatus = 'analyzing'
┌─────────────────────────────────────────────────────────────────────────┐
│ 2. PARSE RRWEB EVENTS                                                    │
│    const events = JSON.parse(session.events);                            │
│    const semanticSession = parseRRWebSession(events);                    │
│    → Returns: SemanticSession with logs, summary, behavioralSignals      │
└─────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 3. BUILD ANALYSIS PROMPT                                                 │
│                                                                          │
│    SESSION CONTEXT:                                                      │
│    - Page: hostname, title, duration, event count, viewport              │
│    - Click Metrics: total, rage, dead, double, right                     │
│    - Input Metrics: total, abandoned, cleared, form submissions          │
│    - Scroll Metrics: total, depth max%, rapid, reversals                 │
│    - Hover Metrics: total, hesitations, hover time                       │
│    - Touch Metrics: touches, swipes, pinch zooms                         │
│    - Error Metrics: console errors, network errors                       │
│    - Engagement: tab switches, idle time                                 │
│    - Behavioral Signals: isExploring, isFrustrated, isEngaged, etc.      │
│                                                                          │
│    SESSION LOG:                                                          │
│    [00:00] Session Started on example.com - "Page Title"                 │
│    [00:05] Clicked "Sign Up" button [RAGE CLICK]                         │
│    [00:08] Typed "john@..." in "email" field                             │
│    [00:15] Console Error: TypeError: undefined is not a function         │
│    ...                                                                   │
└─────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 4. CALL GEMINI API                                                       │
│                                                                          │
│    Model: gemini-2.5-flash-lite                                          │
│    SDK: @ai-sdk/google via generateObject()                              │
│    Output: Structured JSON (Zod schema enforced)                         │
│                                                                          │
│    Latency: 2-5 seconds typical                                          │
│    Cost: ~$0.001-0.005 per session (depending on log length)             │
└─────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 5. SAVE ANALYSIS RESULT                                                  │
│                                                                          │
│    UPDATE Session SET                                                    │
│      analysis = JSON.stringify(result),                                  │
│      analysisStatus = 'completed',                                       │
│      analyzedAt = NOW()                                                  │
│    WHERE id = ?                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Analysis Output Schema

```typescript
const UXAnalysisSchema = z.object({
  summary: z.string()
    .describe("A 2-3 sentence executive summary of what happened"),

  user_intent: z.string()
    .describe("What the user was trying to accomplish"),

  tags: z.array(z.string())
    .describe("3-5 relevant tags based ONLY on evidence in the logs"),

  went_well: z.array(z.string())
    .describe("List of things that worked smoothly for the user"),

  frustration_points: z.array(z.object({
    timestamp: z.string().describe("Exact timestamp [MM:SS]"),
    issue: z.string().describe("Specific description of what went wrong")
  })).describe("Friction points causing frustration"),

  ux_rating: z.number().min(1).max(10)
    .describe("1-10 rating where 10 is perfect UX"),

  description: z.string()
    .describe("Detailed narrative of user's journey chronologically")
});
```

### Example Analysis Output

```json
{
  "summary": "User attempted to sign up but encountered multiple errors during the checkout process. After three attempts to submit the form, they abandoned the page.",
  "user_intent": "Complete account registration and purchase a subscription",
  "tags": ["checkout-friction", "form-errors", "rage-clicking", "abandoned"],
  "went_well": [
    "Landing page loaded quickly",
    "User found the pricing page easily"
  ],
  "frustration_points": [
    {
      "timestamp": "[01:23]",
      "issue": "Form submission failed with no error message displayed"
    },
    {
      "timestamp": "[01:45]",
      "issue": "User rage-clicked submit button 4 times with no response"
    },
    {
      "timestamp": "[02:10]",
      "issue": "Network error 500 on /api/checkout endpoint"
    }
  ],
  "ux_rating": 3,
  "description": "The user landed on the homepage and navigated to pricing within 15 seconds. They selected the Pro plan and proceeded to checkout. During form completion, they entered their email and payment details. When they clicked Submit, nothing happened visually. They clicked again multiple times (rage clicking detected). A console error appeared indicating a server timeout. After waiting 30 seconds, they refreshed the page and lost their form data. They attempted once more before abandoning."
}
```

---

## 8. Insight Synthesis

### Synthesis Pipeline
**File:** `src/lib/session-synthesize.ts`

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     INSIGHT SYNTHESIS FLOW                               │
└─────────────────────────────────────────────────────────────────────────┘

Input: projectId
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. LOAD ALL COMPLETED ANALYSES                                           │
│    SELECT id, name, analysis FROM Session                                │
│    WHERE projectId = ? AND analysisStatus = 'completed'                  │
└─────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 2. AGGREGATE FRICTION DATA                                               │
│                                                                          │
│    frictionMap: Map<issueText, {                                         │
│      issue: string,                                                      │
│      count: number,                                                      │
│      sessionIds: string[],                                               │
│      sessionNames: string[]                                              │
│    }>                                                                    │
│                                                                          │
│    intentMap: Map<intent, { count, sessionIds }>                         │
│    tagMap: Map<tag, count>                                               │
└─────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 3. BUILD SYNTHESIS PROMPT                                                │
│                                                                          │
│    FRICTION POINTS (top 15):                                             │
│    - "Form submission failed" (occurred 5x, sessions: [a, b, c, d, e])   │
│    - "Rage clicking on Submit" (occurred 3x, sessions: [a, c, f])        │
│                                                                          │
│    USER INTENTS (top 10):                                                │
│    - "Complete checkout" (8 sessions)                                    │
│    - "Browse pricing" (5 sessions)                                       │
│                                                                          │
│    COMMON TAGS:                                                          │
│    - checkout-friction (7x)                                              │
│    - form-errors (6x)                                                    │
└─────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 4. CALL GPT-4o                                                           │
│                                                                          │
│    Model: gpt-4o                                                         │
│    SDK: @ai-sdk/openai via generateObject()                              │
│                                                                          │
│    Output: SynthesizedInsightsSchema                                     │
│    Latency: 3-8 seconds                                                  │
└─────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 5. POST-PROCESS & VALIDATE SESSION IDS                                   │
│                                                                          │
│    - Validate returned sessionIds exist in DB                            │
│    - Fuzzy-match issues to friction points if LLM missed IDs             │
│    - Sort by severity (critical > high > medium)                         │
│    - Attach session names for display                                    │
└─────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 6. PERSIST TO DATABASE                                                   │
│                                                                          │
│    UPSERT SynthesizedInsight                                             │
│    SET criticalIssues = JSON,                                            │
│        patternSummary = text,                                            │
│        topUserGoals = JSON,                                              │
│        immediateActions = JSON,                                          │
│        lastSynthesizedAt = NOW(),                                        │
│        syncStatus = 'complete'                                           │
│    WHERE projectId = ?                                                   │
└─────────────────────────────────────────────────────────────────────────┘
```

### Synthesis Output Schema

```typescript
const SynthesizedInsightsSchema = z.object({
  critical_issues: z.array(z.object({
    title: z.string(),
    description: z.string(),
    frequency: z.string(),           // "Affects 3 out of 5 sessions"
    severity: z.enum(["critical", "high", "medium"]),
    recommendation: z.string(),
    sessionIds: z.array(z.string()), // Links to source sessions
  })),

  pattern_summary: z.string(),       // 2-3 sentence overview

  top_user_goals: z.array(z.object({
    goal: z.string(),
    success_rate: z.string(),
  })),

  immediate_actions: z.array(z.string()), // 3-5 actionable items
});
```

---

## 9. Analytics Integrations

### PostHog Integration

**Configuration:**
| Field | Description |
|-------|-------------|
| `posthogKey` | Personal API Key (Bearer token) |
| `posthogHost` | Instance URL (default: https://us.posthog.com) |
| `posthogProjId` | Project ID (from settings) |

**API Calls:**
```
GET /api/environments/{projId}/session_recordings?limit=N
GET /api/environments/{projId}/session_recordings/{id}/snapshots?blob_v2=true
GET /api/environments/{projId}/session_recordings/{id}/snapshots?source=blob_v2&start_blob_key=X&end_blob_key=X
```

**Data Format:**
- Blob V2 format (NDJSON)
- Gzip compressed (base64 encoded in `data` field with `cv` flag)
- Events sorted by timestamp

### Mixpanel Integration

**Configuration:**
| Field | Description |
|-------|-------------|
| `mixpanelKey` | Service Account Username OR API Secret |
| `mixpanelSecret` | Service Account Secret (optional) |
| `mixpanelProjId` | Numeric Project ID (NOT token) |
| `mixpanelHost` | Instance URL (default: https://mixpanel.com) |

**API Call:**
```
GET https://data.mixpanel.com/api/2.0/export?from_date=YYYY-MM-DD&to_date=YYYY-MM-DD&project_id=N
Authorization: Basic base64(username:secret)
```

**Session Grouping:**
- By `$session_id` property if present
- Otherwise: `distinct_id` + 30-minute window

**Event Mapping (Mixpanel → RRWeb):**
- Click events → MouseInteraction (Click)
- Page views → Meta event
- Custom events → Custom event (type 5)

### Amplitude Integration

**Configuration:**
| Field | Description |
|-------|-------------|
| `amplitudeKey` | API Key |
| `amplitudeSecret` | Secret Key |
| `amplitudeProjId` | Project ID |

**API Call:**
```
GET https://amplitude.com/api/2/export?start=YYYYMMDDTHH&end=YYYYMMDDTHH
Authorization: Basic base64(apiKey:secretKey)
```

**Response:** Gzipped NDJSON

**Session Grouping:**
- By `session_id` field (epoch ms timestamp)
- Key: `{user_id|device_id}_{session_id}`

**Event Mapping (Amplitude → RRWeb):**
- `[Amplitude] Element Clicked` → MouseInteraction (Click)
- `[Amplitude] Page Viewed` → Meta event
- `[Amplitude] Form Submitted` → Custom event
- Other events → Custom event with original properties

---

## 10. Recovery Outreach System

### Recovery Pipeline

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     CHURN RECOVERY PIPELINE                              │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ STEP 1: UPLOAD CHURNED USERS                                             │
│ POST /api/recovery/users                                                 │
│                                                                          │
│ Input: CSV with columns: name, email, phone, posthog_id                  │
│ Creates: ChurnedUser records with outreachStatus = 'pending'             │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ STEP 2: ANALYZE USER SESSIONS                                            │
│ POST /api/recovery/users/{userId}/analyze                                │
│                                                                          │
│ - Lookup sessions by posthogDistinctId                                   │
│ - Run session analysis on each                                           │
│ - Aggregate frustration points, behavior patterns                        │
│ - Save analysisResult JSON to ChurnedUser                                │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ STEP 3: GENERATE OUTREACH                                                │
│ POST /api/recovery/generate-outreach                                     │
│                                                                          │
│ Input: { userId, companyName, productName }                              │
│                                                                          │
│ AI Model: gpt-5.2-chat-latest                                            │
│                                                                          │
│ Output:                                                                  │
│ - email: { subject, body, tone }                                         │
│ - callScript: { openingLine, keyPoints, objectionHandlers, closingCTA }  │
│ - personalizedReason: string                                             │
│                                                                          │
│ Saves: recoveryEmail, callScript to ChurnedUser                          │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
┌───────────────────────────────┐   ┌───────────────────────────────┐
│ STEP 4A: SEND EMAIL           │   │ STEP 4B: MAKE CALL            │
│ POST /api/recovery/send-email │   │ POST /api/recovery/call       │
│                               │   │ POST /api/recovery/call-      │
│ Service: Resend               │   │         elevenlabs            │
│                               │   │                               │
│ - Generates HTML template     │   │ Options:                      │
│ - Sends via Resend API        │   │ - Twilio (TwiML script)       │
│ - Tracks messageId            │   │ - ElevenLabs (Voice AI)       │
│                               │   │                               │
│ Updates:                      │   │ Updates:                      │
│ - outreachStatus='email_sent' │   │ - outreachStatus='called'     │
│ - emailSentAt, emailMessageId │   │ - callCompletedAt, callNotes  │
└───────────────────────────────┘   └───────────────────────────────┘
```

### Recovery Email Template

**File:** `src/app/api/recovery/send-email/route.ts`

```html
<table style="background-color: #ffffff; border-radius: 16px;">
  <!-- Header with gradient -->
  <tr>
    <td style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);">
      <h1>We miss you!</h1>
    </td>
  </tr>

  <!-- Body with AI-generated content -->
  <tr>
    <td>
      <p>Hi ${firstName},</p>
      ${bodyParagraphs}  <!-- AI-generated, personalized -->

      <!-- CTA Button -->
      <a href="mailto:...">Reply to this email</a>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td>
      <p>Simply reply to this email if you have any questions.</p>
    </td>
  </tr>
</table>
```

### ElevenLabs Recovery Call

**File:** `src/lib/elevenlabs.ts`

```typescript
// Initiate outbound call
async initiateCall(config: OutboundCallConfig): Promise<CallResponse> {
  const payload = {
    agent_id: config.agentId,
    agent_phone_number_id: process.env.ELEVENLABS_PHONE_NUMBER_ID,
    to_number: config.phoneNumber,
    conversation_initiation_client_data: {
      type: 'conversation_initiation_client_data',
      dynamic_variables: config.dynamicVariables,  // {{user_name}}, {{frustration_points}}, etc.
      conversation_config_override: {
        agent: {
          first_message: config.firstMessage,
          prompt: config.promptOverride,
        }
      }
    }
  };

  return this.request('/convai/twilio/outbound-call', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
```

**Dynamic Variables Available:**
| Variable | Description |
|----------|-------------|
| `user_name` | Recipient's name |
| `company_name` | Company name |
| `frustration_points` | Top 3 issues from session analysis |
| `drop_off_reason` | Primary drop-off point |
| `behavior_patterns` | Detected behavior patterns |
| `session_count` | Number of sessions analyzed |

---

## 11. Voice Conversations

### Conversation Sync (ElevenLabs)

**Endpoint:** `POST /api/conversations/sync`

```typescript
// Fetch successful conversations from ElevenLabs
const { conversations } = await client.listConversations(
  project.elevenlabsAgentId,
  'success'  // Filter to successful calls only
);

// For each conversation
for (const conv of conversations) {
  // Get full details with transcript
  const detail = await client.getConversation(conv.conversation_id);

  // Save to database
  await prisma.conversation.create({
    data: {
      projectId,
      source: 'elevenlabs',
      externalId: conv.conversation_id,
      participantPhone: detail.metadata.to_number,
      status: 'completed',
      duration: detail.duration_seconds,
      transcript: JSON.stringify(detail.transcript),
      metadata: JSON.stringify({
        agent_id: conv.agent_id,
        call_successful: detail.call_successful,
      }),
      conversedAt: new Date(conv.start_time),
    }
  });
}
```

### Manual Transcript Upload

**Endpoint:** `POST /api/conversations/upload`

Accepts JSON transcript array:
```json
{
  "transcript": [
    { "role": "agent", "message": "Hi, thanks for calling...", "timestamp": 0 },
    { "role": "user", "message": "I had some issues...", "timestamp": 5 }
  ],
  "participantName": "John Doe",
  "participantEmail": "john@example.com"
}
```

---

## 12. API Reference

### Session APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sessions` | List sessions for project |
| POST | `/api/sessions` | Upload new session (RRWeb JSON) |
| GET | `/api/sessions/[id]` | Get session details |
| GET | `/api/sessions/[id]/events` | Get session events |
| GET | `/api/sessions/[id]/summary` | Get analysis summary |
| POST | `/api/sessions/[id]/analyze` | Trigger AI analysis |
| POST | `/api/sessions/sync` | Sync from PostHog/Mixpanel/Amplitude |
| POST | `/api/sessions/auto-sync` | Full pipeline: sync → analyze → synthesize |
| GET | `/api/sessions/insights` | Get aggregated insights |

### Project APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects` | List user's projects |
| POST | `/api/projects` | Create new project |
| GET | `/api/projects/[id]` | Get project details |
| PATCH | `/api/projects/[id]` | Update project settings |

### Recovery APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/recovery/users` | List churned users |
| POST | `/api/recovery/users` | Bulk upload churned users (CSV) |
| GET | `/api/recovery/users/[id]` | Get churned user details |
| DELETE | `/api/recovery/users/[id]` | Delete churned user |
| POST | `/api/recovery/users/[id]/analyze` | Analyze user's sessions |
| POST | `/api/recovery/generate-outreach` | Generate email/call script |
| POST | `/api/recovery/send-email` | Send recovery email via Resend |
| POST | `/api/recovery/call` | Initiate Twilio call |
| POST | `/api/recovery/call-elevenlabs` | Initiate ElevenLabs call |

### Conversation APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/conversations` | List conversations |
| POST | `/api/conversations` | Create conversation record |
| GET | `/api/conversations/[id]` | Get conversation details |
| POST | `/api/conversations/sync` | Sync from ElevenLabs |
| POST | `/api/conversations/upload` | Upload transcript manually |

### Dashboard APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/synthesize` | Get/generate synthesized insights |
| GET | `/api/dashboard-stats` | Get dashboard statistics |

### Webhook Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/webhooks/clerk` | Clerk user lifecycle events |
| POST | `/api/webhooks/resend` | Resend email delivery status |

---

## 13. Frontend Architecture

### Page Structure

```
src/app/
├── page.tsx                      # Landing page (public)
├── layout.tsx                    # Root layout (ClerkProvider, ThemeProvider)
├── sign-in/[[...sign-in]]/       # Clerk sign-in
├── sign-up/[[...sign-up]]/       # Clerk sign-up
├── onboarding/                   # Org ID entry (redirects to dashboard)
└── dashboard/
    ├── layout.tsx                # Dashboard layout (Sidebar)
    ├── page.tsx                  # Main insights dashboard
    ├── projects/                 # Project management
    ├── settings/                 # Project settings (analytics config)
    ├── session-insights/         # Session recordings & analysis
    ├── interviews/               # Voice conversations
    ├── cohorts/                  # User cohorts
    ├── hypotheses/               # Qualitative insights
    ├── funnels/                  # Journey visualization
    ├── recovery/                 # Churn recovery
    ├── campaigns/                # Campaign management
    └── priority-queue/           # Interview prioritization
```

### Key Components

| Component | Purpose |
|-----------|---------|
| `Sidebar.tsx` | Navigation with dark mode toggle |
| `session-list.tsx` | Session listing with status badges |
| `session-player.tsx` | RRWeb replay viewer |
| `RecordingDrawer.tsx` | Session detail drawer |
| `VoiceInterviewWidget.tsx` | Voice interview interface |
| `FunnelVisualization.tsx` | Funnel chart |
| `InteractiveFunnelMap.tsx` | XYFlow network diagram |
| `IssueCard` | Expandable issue card with Jira export |

### Dashboard Data Flow

```typescript
// Dashboard page fetches synthesized insights
const loadDashboard = async (projectId) => {
  const response = await fetch(`/api/dashboard/synthesize?projectId=${projectId}`);
  const data = await response.json();
  // data.insights: { prioritized_issues, user_goals, quick_wins, product_health }
  // data.stats: { sessions_analyzed, conversations_analyzed, avg_ratings }
};

// Refresh triggers full auto-sync pipeline
const handleRefresh = () => {
  // This calls POST /api/sessions/auto-sync behind the scenes
  loadDashboard(projectId, true);
};
```

---

## 14. Data Storage & Latency

### Storage Breakdown

| Data Type | Storage Location | Size Estimate |
|-----------|------------------|---------------|
| Session Events | `Session.events` (TEXT) | 100KB - 5MB per session |
| Analysis Results | `Session.analysis` (TEXT) | 2KB - 10KB per session |
| Synthesized Insights | `SynthesizedInsight` (TEXT columns) | 5KB - 20KB per project |
| Transcripts | `Conversation.transcript` (TEXT) | 5KB - 50KB per conversation |
| Recovery Content | `ChurnedUser.recoveryEmail/callScript` (TEXT) | 2KB - 5KB per user |

### Latency Estimates

| Operation | Typical Latency | Factors |
|-----------|-----------------|---------|
| PostHog session list | 500ms - 2s | Network, PostHog load |
| PostHog session events (per session) | 1-5s | Event count, blob count |
| Mixpanel event export | 2-10s | Date range, event volume |
| Amplitude event export | 2-15s | Date range, gzip size |
| RRWeb parsing | 50-500ms | Event count |
| Gemini analysis | 2-5s | Log length |
| GPT-4o synthesis | 3-8s | Session count |
| Recovery outreach generation | 2-4s | Context length |
| Email send (Resend) | 200-500ms | - |
| ElevenLabs call initiation | 1-3s | - |

### Full Pipeline Latency

| Pipeline | Total Time | Breakdown |
|----------|------------|-----------|
| Sync 10 PostHog sessions | 30-60s | 3-6s per session (fetch + parse) |
| Analyze 10 sessions | 20-50s | 2-5s per session |
| Synthesize insights | 3-8s | Single GPT-4o call |
| **Full auto-sync (10 sessions)** | **60-120s** | Sync + Analyze + Synthesize |

---

## 15. Hosting & Deployment

### Recommended Deployment

| Component | Recommended Platform | Notes |
|-----------|---------------------|-------|
| Application | Vercel | Native Next.js 16 support |
| Database | Neon PostgreSQL | Serverless, auto-scaling |
| Environment | Vercel Environment Variables | Secure secrets management |

### Environment Variables

```bash
# Database
DATABASE_URL="postgresql://..."

# Authentication (Clerk)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_..."
CLERK_SECRET_KEY="sk_..."
CLERK_WEBHOOK_SECRET="whsec_..."

# AI Services
GOOGLE_GENERATIVE_AI_API_KEY="..."
OPENAI_API_KEY="sk-..."

# External Services
ELEVENLABS_API_KEY="..."
ELEVENLABS_PHONE_NUMBER_ID="..."
RESEND_API_KEY="re_..."
RESEND_FROM_EMAIL="noreply@yourdomain.com"
TWILIO_ACCOUNT_SID="AC..."
TWILIO_AUTH_TOKEN="..."
TWILIO_PHONE_NUMBER="+1..."

# Analytics (per-project, stored in DB)
# PostHog, Mixpanel, Amplitude credentials configured via UI
```

### Build & Deploy

```bash
# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma db push

# Build for production
npm run build

# Start production server
npm start
```

### Vercel Configuration

```json
// vercel.json (if needed)
{
  "functions": {
    "src/app/api/**/*.ts": {
      "maxDuration": 60  // For long-running sync operations
    }
  }
}
```

---

## 16. Security Considerations

### Authentication Security

- **Clerk handles all auth** - No custom password storage
- **Webhook verification** via Svix signatures
- **API key format**: `tranzmit_<32-char-hex>` (256-bit entropy)

### Data Protection

- **PII redaction** in RRWeb parser (emails, credit cards)
- **Password masking** in input logs
- **No raw event storage** for sensitive fields

### API Security

- **All dashboard routes** protected by Clerk middleware
- **External API routes** (`/api/campaigns`) use API key auth
- **Webhook routes** verify signatures before processing

### Third-Party Credentials

- **PostHog/Mixpanel/Amplitude** credentials stored encrypted in DB
- **Per-project isolation** - credentials scoped to organization
- **No credential exposure** in client-side code

### Rate Limiting Considerations

| Service | Rate Limit | Mitigation |
|---------|------------|------------|
| PostHog API | Varies by plan | Batch requests, caching |
| Mixpanel Export | 60 requests/hour | Daily sync, not real-time |
| Amplitude Export | 360 requests/hour | Configurable date ranges |
| Gemini API | 60 RPM (free tier) | Queue analysis jobs |
| OpenAI API | Varies by tier | Batch synthesis |
| Resend | 100 emails/day (free) | Upgrade for volume |
| ElevenLabs | Per-plan limits | Track call volume |

---

## Appendix: File Index

### Core Libraries (`src/lib/`)

| File | Lines | Purpose |
|------|-------|---------|
| `auth.ts` | 292 | Authentication helpers |
| `session-sync.ts` | 373 | PostHog session sync |
| `session-analysis.ts` | 193 | Gemini-powered analysis |
| `session-synthesize.ts` | 223 | GPT-4o cross-session synthesis |
| `rrweb-parser.ts` | 1202 | RRWeb → SemanticSession |
| `recovery-outreach-generator.ts` | 112 | AI outreach generation |
| `elevenlabs.ts` | 389 | ElevenLabs client |
| `mixpanel/sync.ts` | 363 | Mixpanel session sync |
| `amplitude/sync.ts` | 302 | Amplitude session sync |
| `prisma.ts` | 15 | Prisma client singleton |

### API Routes (`src/app/api/`)

| Route | Methods | Purpose |
|-------|---------|---------|
| `/sessions` | GET, POST | Session CRUD |
| `/sessions/[id]` | GET, PATCH | Session detail |
| `/sessions/[id]/analyze` | POST | Trigger analysis |
| `/sessions/sync` | POST | Sync from source |
| `/sessions/auto-sync` | POST | Full pipeline |
| `/recovery/users` | GET, POST | Churned user management |
| `/recovery/generate-outreach` | POST | Generate content |
| `/recovery/send-email` | POST | Send via Resend |
| `/recovery/call-elevenlabs` | POST | Initiate call |
| `/dashboard/synthesize` | GET | Get insights |
| `/webhooks/clerk` | POST | User lifecycle |

---

*Document generated: 2026-02-12*
*Version: 1.0*
*Platform: Tranzmit (VoiceJourneys)*
