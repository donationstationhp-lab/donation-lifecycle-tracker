import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { HelpCircle } from "lucide-react";

export default function PublicFAQ() {
  return (
    <main className="py-12 px-4 sm:px-6 lg:px-8 max-w-3xl mx-auto w-full animate-fade-in">
      <div className="text-center space-y-4 mb-12">
        <div className="mx-auto w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center border border-primary/20">
          <HelpCircle className="w-6 h-6" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-foreground">Frequently Asked Questions</h1>
        <p className="text-base font-medium text-muted-foreground max-w-xl mx-auto leading-relaxed">
          Learn how Donation Station works, from scheduling and claims to privacy-safe tracking and volunteer opportunities.
        </p>
      </div>

      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="donations" className="px-6">
            <AccordionTrigger className="text-lg font-bold hover:no-underline hover:text-primary transition-colors">
              How do I donate items?
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground text-base leading-relaxed">
              We accept donations of food, clothing, and household goods. You can start by filling out our online donation form, which provides us with details about the items. Once reviewed by staff, you can schedule a drop-off or request a pickup for larger loads.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="scheduling" className="px-6">
            <AccordionTrigger className="text-lg font-bold hover:no-underline hover:text-primary transition-colors">
              How does scheduling work?
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground text-base leading-relaxed">
              Scheduling ensures our staff is prepared to receive your donation or hand off your claimed items. Use the "Schedule" page to find available time slots for drop-offs, pickups, volunteering, or market windows. All requests are reviewed and confirmed by our team.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="claims" className="px-6">
            <AccordionTrigger className="text-lg font-bold hover:no-underline hover:text-primary transition-colors">
              How can I claim or reserve items?
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground text-base leading-relaxed">
              Browse the "Available Resources" catalog to see a current preview. Catalog availability is not a reservation. Staff verifies requests, matches resources, and then coordinates an eligible pickup or reservation. No donor or recipient identities are public.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="tracking" className="px-6">
            <AccordionTrigger className="text-lg font-bold hover:no-underline hover:text-primary transition-colors">
              What is privacy-safe tracking?
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground text-base leading-relaxed">
              Published claims receive a tracking code that shows a limited service timeline without exposing personal information. Public tracking omits names, contact details, addresses, notes, internal IDs, storage locations, and exact event times.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="barter" className="px-6">
            <AccordionTrigger className="text-lg font-bold hover:no-underline hover:text-primary transition-colors">
              What is pay-what-you-can / barter preparation?
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground text-base leading-relaxed">
              Donation Station is preparing a dignified exchange path: offer received, request gained, trade matched, handoff scheduled, exchange verified, and acknowledgment recorded. This page is guidance only; no payment, credit, or barter ledger is currently offered through the public site.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="hours" className="px-6 border-b-0">
            <AccordionTrigger className="text-lg font-bold hover:no-underline hover:text-primary transition-colors">
              What are your operating hours?
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground text-base leading-relaxed">
              Market hours and drop-off windows vary with staff and volunteer availability. Check the "Schedule" page for the currently published slots; if no slots appear, none are open for online requests at that time.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </main>
  );
}
