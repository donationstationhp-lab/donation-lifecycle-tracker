# Claude Code Context — Donation Station™ Pickup Verification System

## PROJECT OVERVIEW

**System:** Donation Station™ operations platform
**URL:** scc.donationsstations.com
**Purpose:** Community resource center managing donation intake, classification, distribution, and delivery routing

---

## CURRENT SYSTEM (What Exists)

### Stack (confirmed)
- **Frontend:** React + Vite
- **Development:** Replit
- **Version control:** GitHub
- **Deployment:** Netlify
- **Database:** confirm before building (likely Supabase, Firebase, or similar — check Replit project)

### Current Navigation Structure
- **Dashboard** — Operations overview with key metrics
- **Items** — Inventory management
- **Expiring** — Items flagging within 14 days
- **Routes** — Delivery route management
- **Pending Review** — Donor submissions awaiting processing

### Current Dashboard Metrics
- Total Active Items (currently 21)
- Items Distributed (currently 13)
- Expiring Soon (currently 4, flagged within 14 days)
- Pending Review (currently 0 donor submissions)

### T.I.E.R. Classification System
Items classified into four tiers:
- **T** — Tactical (time-sensitive)
- **I** — Immediate (urgent need)
- **E** — Essential (core resources)
- **R** — Reserve (available when needed)

### Item Types Tracked
- Physical goods (food, clothing, household items)
- Time donations (volunteer hours)
- Intelligence donations (study sessions, skills)

### Current Item Fields (visible from dashboard)
- Item ID (format: DS-XXXX)
- Item name
- Category/type tag
- Date and time logged
- Condition (Good, etc.)
- Status (Distributed, Pending, etc.)

### Current Route Fields (visible from Routes view)
- Route name
- Date
- Number of stops
- Status: Planned / In Progress / Completed
- Notes field

### Donor Intake
- Public form at: https://scc.donationsstations.com/donation-station/donate
- No login required for donors
- Submissions land in Pending Review

---

## FEATURE REQUEST: PICKUP VERIFICATION SYSTEM

### Problem
Pickups are being requested via phone/text with incomplete information. System currently has no way to:
- Track verification status of a pickup request
- Flag false addresses or fake requests
- Enforce a minimum verification standard before dispatching a driver
- Record patterns of no-shows or bad addresses

### Solution
Add a pickup request workflow with verification stages and a flag system.

---

## REQUIRED DATA MODEL ADDITIONS

### New: Pickup Request Record

```
PickupRequest {
  id: string (format: PU-XXXX)
  status: enum (see Status Flow below)
  
  // Contact Info
  phone: string
  name: string (nullable — collected during verification)
  address: string
  address_confirmed: boolean (did they state it unprompted?)
  address_verified: boolean (confirmed exists on Google Maps)
  address_type: enum (Residence / Business / Other)
  
  // Scheduling
  requested_window: string (e.g. "Wednesday after 6:30 PM")
  confirmed_datetime: datetime (nullable)
  
  // Items
  items_described: string (what donor says they have)
  items_received: string (nullable — filled at completion)
  
  // Confirmation
  confirmation_sent: boolean
  confirmation_replied: boolean
  
  // Outcome
  outcome: enum (Completed / No Show / False Address / Cancelled / Flagged)
  outcome_notes: string
  
  // Flags
  phone_flagged: boolean
  address_flagged: boolean
  requires_supervisor_approval: boolean
  
  // Meta
  created_at: datetime
  updated_at: datetime
  assigned_driver: string (nullable)
  linked_route_id: string (nullable)
}
```

### Status Flow (Enum)

```
Unverified → Contact Made → Confirmed → Dispatched → Completed
                                                    → No Show
                                                    → False Address
                                                    → Cancelled
```

### Flag Records (separate table for pattern tracking)

```
Flag {
  id: string
  type: enum (Phone / Address)
  value: string (the phone number or address flagged)
  reason: string
  pickup_request_id: string
  created_at: datetime
  count: integer (auto-increments when same value flagged again)
}
```

---

## VERIFICATION RULES (Business Logic)

### Four requirements before dispatch is allowed

A pickup request cannot move to **Dispatched** status unless ALL four are true:

1. `name` is not null
2. `address_verified` is true
3. `items_described` is not null
4. `confirmation_replied` is true

**Enforce this as a hard block in the UI — disable dispatch button until all four conditions met.**

### Auto-flag triggers

Flag a phone number if:
- No response after two contact attempts (manual log)
- Two or more no-shows linked to same number

Flag an address if:
- Confirmed false or non-existent on verification check
- Two or more no-shows at same location

Flag records where `count >= 2` should trigger `requires_supervisor_approval = true` on any new request using that phone or address.

### Do not dispatch rule

If contact attempts reach 2 with no response, status moves to **Closed/No Response**. Do not allow scheduling.

---

## UI REQUIREMENTS

### New Nav Item: Pickups
Add **Pickups** to the left navigation between Items and Routes.

### Pickups List View
Show all pickup requests with:
- ID
- Name (or "Unverified" if not yet collected)
- Address
- Requested window
- Status badge (color coded)
- Flag indicator (if flagged)

Filter by: Status | Flagged | Date range

### Pickup Detail View
Full record with:
- All contact fields
- Verification checklist (visual checkboxes matching the five stages)
- Dispatch button (disabled until four requirements met, shows which are incomplete)
- Outcome selector
- Flag controls
- Notes field
- Link to route (if assigned)

### Verification Checklist Component (embedded in detail view)

```
Stage 1: Request Received          ✅ / ⬜
Stage 2: Contact Made              ✅ / ⬜
  - Name collected                 ✅ / ⬜
  - Address confirmed by donor     ✅ / ⬜
  - Items described                ✅ / ⬜
  - Window confirmed               ✅ / ⬜
Stage 3: Address Verified          ✅ / ⬜
  - Exists on Google Maps          ✅ / ⬜
  - No prior flags                 ✅ / ⬜
Stage 4: Written Confirmation      ✅ / ⬜
  - Confirmation sent              ✅ / ⬜
  - CONFIRM reply received         ✅ / ⬜
Stage 5: Dispatch Ready            ✅ / ⬜ (auto — all above complete)
```

### Dashboard Updates
Add to existing Operations Overview:
- Pickups Pending Verification (count + link)
- Pickups Confirmed This Week (count)
- Flagged Numbers/Addresses (count + link to flag management)

### Flag Management View
Simple admin view listing all flagged phone numbers and addresses with:
- Value (phone or address)
- Flag count
- Reason
- Associated pickup IDs
- Supervisor approval toggle

---

## CONFIRMATION MESSAGE TEMPLATE

Store as a configurable template in the system:

```
"Your donation pickup is confirmed for [confirmed_datetime]. 
Our team will be at [address]. 
Please reply CONFIRM to verify."
```

Log when sent (`confirmation_sent = true`) and when CONFIRM reply received (`confirmation_replied = true`).

---

## OPEN PICKUP TO LOG IMMEDIATELY

**Current pending pickup (Wednesday Aug 27, 2026 after 6:30 PM):**

```
Status: Unverified
Phone: [on file]
Address: [on file]
Name: null (not yet collected)
address_confirmed: false
address_verified: false
confirmation_sent: false
confirmation_replied: false
```

Action required before Wednesday: complete Stages 2–4 before dispatching.

---

## INTEGRATION WITH EXISTING SYSTEM

### Routes
When a pickup moves to **Confirmed**, allow assigning it to a Route. Pickup ID links to Route stop.

### Items
When a pickup moves to **Completed**, trigger item intake — items received during pickup should flow directly into Items inventory with pre-filled fields from the pickup record (donor name, date, condition noted at pickup).

### T.I.E.R. Classification
Items received from completed pickups still go through standard T.I.E.R. classification before entering active inventory.

---

## SUGGESTED BUILD ORDER

1. Data model (PickupRequest + Flag tables)
2. Pickups list view (basic CRUD)
3. Pickup detail view with verification checklist
4. Dispatch block logic (four requirements enforcement)
5. Flag system (auto-triggers + manual flagging)
6. Dashboard metric updates
7. Route integration (link pickup to route stop)
8. Item intake trigger on completion
9. Flag management admin view
10. Confirmation message template system