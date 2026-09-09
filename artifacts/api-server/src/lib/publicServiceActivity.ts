import type { ServiceActivity } from "@workspace/db";

const PUBLIC_ACTIVITY_LABELS: Record<string, string> = {
  "donation_intake:received": "Resource Recognized",
  "item_processing:qc": "Resource Recognized",
  "item_processing:storage": "Classified",
  "item_processing:matched": "Ready for Matching",
  "item_processing:scheduled": "Appointment Scheduled",
  "item_processing:distributed": "Distributed",
  "item_processing:closed": "Completed",
  "claim_request:submitted": "Request Received",
  "claim_request:verified": "Eligibility Verified",
  "claim_request:approved": "Eligibility Verified",
  "item_reservation:reserved": "Item Reserved",
  "item_reservation:confirmed": "Appointment Scheduled",
  "item_reservation:in_progress": "Ready for Pickup",
  "item_reservation:completed": "Distributed",
  "item_reservation:canceled": "Canceled",
  "item_reservation:no_show": "No-show",
  "item_reservation:expired": "Canceled",
  "distribution:planned": "Ready for Matching",
  "distribution:released": "Ready for Pickup",
  "distribution:completed": "Distributed",
  "distribution:cancelled": "Canceled",
  "appointment:requested": "Request Received",
  "appointment:confirmed": "Appointment Scheduled",
  "appointment:completed": "Completed",
  "appointment:canceled": "Canceled",
  "appointment:no_show": "No-show",
  "pickup:requested": "Request Received",
  "pickup:confirmed": "Appointment Scheduled",
  "pickup:in_progress": "Ready for Pickup",
  "pickup:completed": "Completed",
  "pickup:canceled": "Canceled",
  "pickup:no_show": "No-show",
  "dropoff:requested": "Request Received",
  "dropoff:confirmed": "Appointment Scheduled",
  "dropoff:completed": "Completed",
  "dropoff:canceled": "Canceled",
  "dropoff:no_show": "No-show",
  "barter_handoff:confirmed": "Appointment Scheduled",
  "barter_handoff:completed": "Completed",
  "acknowledgment:sent": "Acknowledged",
  "acknowledgment:acknowledged": "Acknowledged",
  "acknowledgment:completed": "Acknowledged",
};

export function buildPublicActivityTimeline(
  activities: Pick<ServiceActivity, "activityType" | "status" | "createdAt">[],
) {
  return activities.flatMap((activity) => {
    const label = PUBLIC_ACTIVITY_LABELS[`${activity.activityType}:${activity.status}`];
    return label ? [{
      label,
      timestamp: activity.createdAt,
    }] : [];
  });
}