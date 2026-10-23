# Core User Flows

This document describes the Donation Station app's core user flows as they
actually work in the code today, reviewed against `main` and
`sync-live-schema`. Steps marked **(New Feature)** do not exist yet and are
proposed additions, not current behavior.

## 1. Donor & Recipient Access Flow

- **Donor authentication:** Donors sign in separately through Clerk
  (`Donor sign-in (Clerk)`). Today this is mainly used to link a signed-in
  person to their own donation record, not a full donor portal.
- **Public tracking page (claims):** Recipients look up a claim using two
  separate codes:
  - `DSC-000035` — the claim's own tracking code (one per claim, assigned
    sequentially).
  - A one-time code texted to the recipient's phone, used to verify
    identity before showing claim details. This is a **separate number**
    from the tracking code, not derived from it.
  - This feature is currently switched off pending Twilio Trust Hub
    approval.
  - Correction: there is no combined "tracking number + last 4 digits of
    phone" lookup. The two codes above are distinct and both required.

## 2. Logistics & Pickup Flow (Driver / Field Team)

- **Pre-dispatch rule (enforced):** Dispatch is strictly blocked until
  name, verified address, described items, and a confirmation reply are
  received on the driver route manifest.
- **On-site intake:** Driver inspects items and records details on
  device.
- **Weight capture:** Records a single weight field per item.
  **(New Feature: tracking a separate driver-estimated weight vs.
  scale-verified weight.)**

## 3. Warehouse, Quality Check & Inventory Flow

The 7 lifecycle stages:

1. **Received** — item logged at intake/drop-off/pickup.
2. **Quality Check** — inspection and triage of item condition.
3. **Ready for Matching** — staged in warehouse inventory for allocation.
4. **Matched** — paired with a specific recipient/partner request.
5. **Distribution Scheduled** — assigned to a transport/pickup route.
6. **Distributed** — physical handover completed.
7. **Completed** — lifecycle closed out in the system.

## 4. Allocation & Fulfillment Flow

- **Staff-only allocation (enforced):** Matching items to recipients is
  strictly handled by internal staff (authenticated via email/password)
  using the staff dashboard. There is no self-service catalog or public
  item selection.

## 5. Impact Reporting Flow

- **On-demand summary:** Generates live metrics tracking total items
  processed and claim speed.
  **(New Feature: quarterly automated report distribution and total
  weight aggregate tracking.)**

## Screen List

- **Staff Authentication Screen** — email/password login for internal
  staff and warehouse managers.
- **Donor sign-in (Clerk)** — login used mainly to link a signed-in
  person to their own donation record.
- **Public Recipient Tracking & Claim Screen** — code-entry interface for
  claim lookup using a `DSC-` claim tracking code plus a one-time code
  texted to the phone (held in an inactive state pending Twilio SMS
  approval).
- **Staff Dashboard (7-Stage Pipeline Table)** — operational command
  center tracking items across all 7 stages (Received, Quality Check,
  Ready for Matching, Matched, Distribution Scheduled, Distributed,
  Completed). Includes staff-only allocation controls to match inventory
  with recipients. Today this is a set of metrics/summary views, not a
  drag-and-drop Kanban board. **(New Feature: Kanban-style drag-and-drop
  staging.)**
- **Field Driver App / Route Manifest** — driver view featuring strict
  pre-dispatch verification checks, address validation, contact attempt
  logs, single weight entry, and item intake.
- **Impact Summary Dashboard** — on-demand reporting view showing
  real-time item counts, claim speed metrics, and distribution
  throughput.
