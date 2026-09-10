import { Link } from "wouter";
import { FileText, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type LegalPageKind = "privacy" | "terms";

export function PublicLegalPage({ kind }: { kind: LegalPageKind }) {
  const isPrivacy = kind === "privacy";

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-10 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
          {isPrivacy ? <ShieldCheck className="h-6 w-6" /> : <FileText className="h-6 w-6" />}
        </div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
          Donation Station
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-foreground">
          {isPrivacy ? "Privacy Policy" : "Terms of Service"}
        </h1>
        <p className="mt-3 text-sm font-medium text-muted-foreground">
          Effective September 10, 2026
        </p>
      </div>

      {isPrivacy ? <PrivacyContent /> : <TermsContent />}

      <div className="mt-10 text-center text-sm text-muted-foreground">
        <Link href="/faq" className="font-semibold text-primary hover:underline">
          Read the FAQ
        </Link>
        <span className="mx-3">·</span>
        <Link href="/resources" className="font-semibold text-primary hover:underline">
          Browse resources
        </Link>
      </div>
    </main>
  );
}

function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-border shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm leading-7 text-muted-foreground">
        {children}
      </CardContent>
    </Card>
  );
}

function PrivacyContent() {
  return (
    <div className="space-y-5">
      <LegalSection title="Information we collect">
        <p>
          Donation Station may collect information that you submit when you
          donate resources, request an appointment, volunteer, submit a service
          request, or use public tracking. This may include your name, email
          address, phone number, pickup or appointment details, item
          information, and tracking information needed to provide the service.
        </p>
        <p>
          Staff operations records may also include review, matching,
          scheduling, transfer, and acknowledgment information needed to
          coordinate service.
        </p>
      </LegalSection>

      <LegalSection title="How we use information">
        <p>
          We use submitted information to review donations, coordinate
          appointments and volunteer requests, match resources, provide
          privacy-safe tracking, communicate about a user-initiated service
          request, protect the service, and maintain service records.
        </p>
        <p>
          Donation Station does not use service information to send marketing
          or advertising messages.
        </p>
      </LegalSection>

      <LegalSection title="SMS verification messages">
        <p>
          If secure phone verification becomes available, Donation Station
          will send a one-time passcode only after a user enters their phone
          number and requests verification in the application. These messages
          are authentication messages, not marketing messages.
        </p>
        <p>
          Message frequency varies with user-initiated verification requests.
          Message and data rates may apply. Mobile numbers and SMS opt-in data
          are not shared with third parties for their marketing or advertising
          purposes.
        </p>
        <p>
          SMS verification is currently being rolled out only after required
          carrier registration and approval. Closing the verification flow
          stops a pending request for a code.
        </p>
      </LegalSection>

      <LegalSection title="Information sharing and retention">
        <p>
          We limit access to information to the staff, service providers, and
          systems needed to operate Donation Station, protect the service, or
          comply with law. We do not sell personal information or share mobile
          numbers for third-party marketing.
        </p>
        <p>
          We retain records for as long as reasonably necessary to provide
          services, maintain operational and safety records, resolve disputes,
          and meet legal or accounting obligations. Public tracking is
          intentionally limited and does not expose names, contact details,
          addresses, notes, internal IDs, or exact event times.
        </p>
      </LegalSection>

      <LegalSection title="Your choices">
        <p>
          You may choose not to submit optional information, although some
          services may not be available without the details needed to
          coordinate them. You may stop a user-initiated verification request
          by leaving the verification flow. You may also ask the Donation
          Station operator about information associated with a service request.
        </p>
      </LegalSection>

      <LegalSection title="Updates and questions">
        <p>
          We may update this policy as the service changes. The effective date
          above identifies the current version. Questions about this policy
          should be directed to the Donation Station operator through the
          service contact channel provided for your request.
        </p>
      </LegalSection>
    </div>
  );
}

function TermsContent() {
  return (
    <div className="space-y-5">
      <LegalSection title="Using Donation Station">
        <p>
          Donation Station helps coordinate donated resources, service
          requests, appointments, volunteer participation, and privacy-safe
          tracking. You agree to provide information that is accurate enough
          for the requested service and to use the service lawfully and
          respectfully.
        </p>
      </LegalSection>

      <LegalSection title="Requests, matching, and scheduling">
        <p>
          A public catalog is informational and does not reserve an item or
          guarantee availability. Donation, volunteer, appointment, claim, and
          pickup requests remain subject to staff review, capacity, safety,
          eligibility, and resource availability.
        </p>
        <p>
          A submitted request is not a confirmation unless Donation Station
          confirms it. Schedules, matches, and availability may change.
        </p>
      </LegalSection>

      <LegalSection title="Tracking and communications">
        <p>
          Public tracking codes provide a limited service timeline. They are
          not proof of identity or ownership and must not be used to access
          another person's private information.
        </p>
        <p>
          If SMS verification is enabled, messages are sent only in response
          to a user-initiated verification request. Message and data rates may
          apply. SMS is not used for marketing.
        </p>
      </LegalSection>

      <LegalSection title="Safe and respectful use">
        <p>
          Do not submit false information, impersonate another person, abuse
          public forms, interfere with the service, or use Donation Station to
          request or distribute unsafe, unlawful, or prohibited materials.
          Donation Station may pause or decline a request when needed to
          protect people, resources, or the service.
        </p>
      </LegalSection>

      <LegalSection title="Informational barter guidance">
        <p>
          Donation Station may describe future exchange or barter concepts for
          planning purposes. The public site does not currently provide a
          payment system, credit balance, direct barter ledger, or guarantee
          of an exchange.
        </p>
      </LegalSection>

      <LegalSection title="Changes and availability">
        <p>
          Services, content, schedules, and availability may change as
          Donation Station develops. We may update these terms by posting a
          revised version with a new effective date. We do not promise that
          every resource, time slot, or feature will always be available.
        </p>
      </LegalSection>
    </div>
  );
}