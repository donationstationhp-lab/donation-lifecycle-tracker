import { useMemo, useState, type FormEvent } from "react";
import {
  ArrowLeft, ArrowRight, Bell, Check, ChevronDown, CircleHelp, Clock3,
  Heart, MapPin, Package, Plus, Search, SkipForward, Sparkles, Users, X,
} from "lucide-react";
import "./exchangerelay.css";

type Need = { id: string; person: string; initials: string; title: string; detail: string; place: string; due: string; category: string };
type Supply = { id: string; title: string; detail: string; place: string; donor: string; category: string; quantity: string };
type Handoff = { need: Need; supply: Supply; status: string };

const seedNeeds: Need[] = [
  { id: "N-183", person: "Mara & two children", initials: "MC", title: "A warm start in a new home", detail: "Winter coats · sizes 4, 7, adult M", place: "Eastside family hub", due: "Needed today", category: "Clothing" },
  { id: "N-179", person: "Leon, senior neighbor", initials: "LW", title: "Safer steps at home", detail: "A sturdy mobility walker", place: "Central care network", due: "Today · 2:30 PM", category: "Mobility" },
  { id: "N-176", person: "The Alvarez family", initials: "AF", title: "A place to gather", detail: "Twin bed frame, no mattress needed", place: "South welcome center", due: "By Friday", category: "Home" },
  { id: "N-168", person: "Northside after-school club", initials: "NC", title: "Stories for the reading nook", detail: "Picture books for ages 3–8", place: "Northside community room", due: "This week", category: "Learning" },
];

const seedSupplies: Supply[] = [
  { id: "D-412", title: "Coats for little ones", detail: "18 pieces · freshly laundered", place: "East station", donor: "Northside Mutual Aid", category: "Clothing", quantity: "18 pcs" },
  { id: "D-408", title: "Portable induction hob", detail: "Tested · excellent condition", place: "Central station", donor: "Jules R.", category: "Kitchen", quantity: "1 item" },
  { id: "D-401", title: "Solid wood twin bed frame", detail: "Disassembled, all fittings included", place: "South station", donor: "Mina's moving sale", category: "Home", quantity: "1 item" },
  { id: "D-398", title: "Picture books, ages 3–8", detail: "32 books · a few beloved classics", place: "West station", donor: "Little Lantern Library", category: "Learning", quantity: "32 books" },
];

export default function ExchangeRelay() {
  const [needs, setNeeds] = useState(seedNeeds);
  const [supplies, setSupplies] = useState(seedSupplies);
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [activeId, setActiveId] = useState(seedNeeds[0].id);
  const [view, setView] = useState<"queue" | "handoffs">("queue");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [selectedOffer, setSelectedOffer] = useState("");

  const visibleNeeds = useMemo(() => needs.filter((n) => `${n.title} ${n.person} ${n.detail} ${n.category}`.toLowerCase().includes(query.toLowerCase())), [needs, query]);
  const active = visibleNeeds.find((n) => n.id === activeId) ?? visibleNeeds[0];
  const recommendations = useMemo(() => active ? [...supplies].sort((a, b) => Number(b.category === active.category) - Number(a.category === active.category)) : [], [active, supplies]);
  const chosenOffer = recommendations.find((offer) => offer.id === selectedOffer) ?? recommendations[0];

  function startHandoff() {
    if (!active || !chosenOffer) return;
    setHandoffs((current) => [{ need: active, supply: chosenOffer, status: "Waiting to confirm pickup" }, ...current]);
    setNeeds((current) => current.filter((item) => item.id !== active.id));
    setSupplies((current) => current.filter((item) => item.id !== chosenOffer.id));
    setSelectedOffer("");
    setNotice(`A handoff is underway for ${active.person}.`);
    window.setTimeout(() => setNotice(""), 2800);
  }

  function skipRequest() {
    const next = visibleNeeds.find((item) => item.id !== active?.id);
    if (next) setActiveId(next.id);
    else setNotice("You’ve reached the end of this queue.");
  }

  function addNeed(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = draft.trim();
    if (!title) return;
    const fresh: Need = { id: `N-${190 + needs.length}`, person: "New community request", initials: "NC", title, detail: "Newly received · details to confirm", place: "Central welcome desk", due: "Needs review", category: "New request" };
    setNeeds((current) => [fresh, ...current]);
    setActiveId(fresh.id);
    setDraft("");
    setAdding(false);
  }

  function advanceHandoff(index: number) {
    setHandoffs((current) => current.map((handoff, i) => i === index ? { ...handoff, status: handoff.status === "Waiting to confirm pickup" ? "Pickup confirmed" : "Completed" } : handoff));
  }

  return (
    <main className="relay">
      <header className="relay-header">
        <div className="relay-brand"><span className="relay-mark"><Heart size={17} fill="currentColor" /></span><span>donation<br />station</span><i /></div>
        <nav className="relay-nav" aria-label="Workspace">
          <button className={view === "queue" ? "active" : ""} onClick={() => setView("queue")}><span>01</span> Triage queue <b>{needs.length}</b></button>
          <button className={view === "handoffs" ? "active" : ""} onClick={() => setView("handoffs")}><span>02</span> Handoffs <b>{handoffs.length}</b></button>
        </nav>
        <div className="relay-user"><button className="relay-bell" aria-label="Notifications" onClick={() => setNotice("You’re all caught up.")}><Bell size={17} /><i /></button><span className="relay-avatar">AM</span><span><b>Alex Morgan</b><small>Station coordinator</small></span><ChevronDown size={14} /></div>
      </header>

      <div className="relay-page">
        <div className="relay-heading">
          <div><div className="relay-eyebrow"><span /> CENTRAL STATION <i>·</i> TUESDAY, OCTOBER 24</div><h1>{view === "queue" ? <>Route the good<br /><em>where it’s needed.</em></> : <>A little help,<br /><em>already in motion.</em></>}</h1><p>{view === "queue" ? "One request at a time. Find a fitting offer, then move the handoff forward." : "Every request you’ve paired, ready for its next step."}</p></div>
          <div className="relay-shift"><div className="shift-art"><span /><span /><span /></div><span><small>YOUR SHIFT</small><b>{needs.length} requests to review</b><em><Clock3 size={13} /> Updated just now</em></span></div>
        </div>

        <div className="relay-tools">
          <label className="relay-search"><Search size={16} /><input aria-label="Search requests" placeholder="Find someone or something…" value={query} onChange={(event) => setQuery(event.target.value)} /><kbd>⌘ K</kbd></label>
          <button className="relay-add" onClick={() => setAdding(true)}><Plus size={15} /> New request</button>
        </div>

        {view === "queue" ? (
          <section className="triage-layout">
            <aside className="queue-panel">
              <div className="queue-top"><div><small>UP NEXT</small><h2>Requests</h2></div><span>{visibleNeeds.length.toString().padStart(2, "0")}</span></div>
              <div className="queue-list">
                {visibleNeeds.map((item, index) => <button key={item.id} onClick={() => { setActiveId(item.id); setSelectedOffer(""); }} className={`queue-item ${active?.id === item.id ? "chosen" : ""}`}>
                  <span className="queue-number">{String(index + 1).padStart(2, "0")}</span><span className="queue-person">{item.initials}</span><span className="queue-copy"><b>{item.person}</b><strong>{item.title}</strong><small>{item.due}</small></span><ArrowRight size={15} />
                </button>)}
                {!visibleNeeds.length && <div className="queue-empty"><Users size={20} /><b>No requests in this search</b><span>Try another name or clear your search.</span></div>}
              </div>
              <div className="queue-note"><Sparkles size={15} /><span><b>Small steps count.</b><br />A thoughtful match starts with listening.</span></div>
            </aside>

            {active ? <article className="request-focus">
              <div className="focus-label"><span>REQUEST {active.id}</span><span className="urgency"><i /> {active.due}</span></div>
              <div className="focus-person"><span className="focus-avatar">{active.initials}</span><div><span>FOR THE NEIGHBORHOOD</span><b>{active.person}</b></div><button aria-label="More request help" onClick={() => setNotice("Ask your station lead if you need more details.")}><CircleHelp size={17} /></button></div>
              <div className="focus-copy"><span className="focus-category">{active.category.toUpperCase()}</span><h2>{active.title}</h2><p>{active.detail}</p></div>
              <div className="focus-location"><MapPin size={15} /><span><small>HANDOFF POINT</small><b>{active.place}</b></span><button onClick={() => setNotice(`Pickup point: ${active.place}`)}>Details <ArrowRight size={13} /></button></div>
              <div className="focus-bottom"><span>REQUEST RECEIVED <b>Today, 9:14 AM</b></span><span>REF <b>{active.id}</b></span></div>
            </article> : <div className="request-done"><div><Check size={25} /></div><span>QUEUE COMPLETE</span><h2>That’s the whole list.<br /><em>Good work, neighbor.</em></h2><p>New requests will appear here as they come in.</p><button onClick={() => setAdding(true)}><Plus size={15} /> Add a request</button></div>}

            <aside className="offer-panel">
              <div className="offer-heading"><div><small>GOOD FITS NEARBY</small><h2>Available offers</h2></div><span>{recommendations.length}</span></div>
              {active ? <p className="offer-intro">A few things that could help. Choose one to start a handoff.</p> : <p className="offer-intro">Your offers are ready for the next request.</p>}
              <div className="offer-list">
                {recommendations.map((offer) => <button key={offer.id} onClick={() => setSelectedOffer(offer.id)} className={`offer-card ${chosenOffer?.id === offer.id ? "offer-picked" : ""}`}>
                  <span className="offer-icon"><Package size={18} /></span><span className="offer-copy"><span><b>{offer.title}</b>{offer.category === active?.category && <i>GOOD FIT</i>}</span><small>{offer.donor} · {offer.quantity}</small><em><MapPin size={11} /> {offer.place}</em></span><span className="offer-radio">{chosenOffer?.id === offer.id && <Check size={12} />}</span>
                </button>)}
                {!recommendations.length && <div className="offers-empty"><Package size={20} /><b>No offers available</b><span>There are no available donations to pair right now.</span></div>}
              </div>
              {active && <div className="offer-actions"><button className="skip-request" onClick={skipRequest}><SkipForward size={15} /> Review next</button><button className="start-relay" disabled={!chosenOffer} onClick={startHandoff}>Start handoff <ArrowRight size={15} /></button></div>}
              <div className="offer-assurance"><Heart size={13} /> You can confirm the details with both sides next.</div>
            </aside>
          </section>
        ) : (
          <section className="handoff-board">
            <div className="handoff-board-head"><div><small>THE ROUTE SO FAR</small><h2>Handoffs</h2></div><span>{handoffs.length} in motion</span></div>
            {handoffs.length ? <div className="handoff-list">{handoffs.map((handoff, index) => <article className="handoff-card" key={handoff.need.id}>
              <div className="handoff-count">0{index + 1}</div><div className="handoff-side"><span className="handoff-face">{handoff.need.initials}</span><span><small>GOING TO</small><b>{handoff.need.person}</b><em>{handoff.need.title}</em></span></div>
              <div className="handoff-path"><span /><ArrowRight size={16} /><span /></div>
              <div className="handoff-side"><span className="handoff-box"><Package size={17} /></span><span><small>FROM {handoff.supply.donor}</small><b>{handoff.supply.title}</b><em>{handoff.supply.place}</em></span></div>
              <div className="handoff-state"><i className={handoff.status === "Completed" ? "is-done" : ""} /><span><small>NEXT STEP</small><b>{handoff.status}</b></span><button onClick={() => advanceHandoff(index)}>{handoff.status === "Waiting to confirm pickup" ? "Confirm pickup" : handoff.status === "Pickup confirmed" ? "Mark completed" : "Completed"} {handoff.status !== "Completed" && <ArrowRight size={13} />}</button></div>
            </article>)}</div> : <div className="handoff-empty"><div className="empty-mark"><Package size={22} /><Heart size={13} /></div><h3>No handoffs yet.</h3><p>When a request meets the right offer, its next steps will live here.</p><button onClick={() => setView("queue")}><ArrowLeft size={14} /> Back to triage</button></div>}
          </section>
        )}
        <footer className="relay-footer"><span><Heart size={13} /> A second chapter for good things.</span><span>COMMUNITY EXCHANGE <i>·</i> CENTRAL STATION</span><button onClick={() => setNotice("Central station is open and synced.")}><i /> Station online <ArrowRight size={13} /></button></footer>
      </div>

      {adding && <div className="relay-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) setAdding(false); }}><form className="relay-modal" onSubmit={addNeed}><div className="relay-modal-head"><div><small>A NEIGHBOR NEEDS SOMETHING</small><h2>Add to the queue</h2></div><button type="button" aria-label="Close" onClick={() => setAdding(false)}><X size={17} /></button></div><label>What would make a difference?<input autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="e.g. A warm winter coat" /></label><p>Start with the need. Your team can confirm the details after saving.</p><div><button type="button" onClick={() => setAdding(false)}>Cancel</button><button type="submit" disabled={!draft.trim()}><Plus size={14} /> Add request</button></div></form></div>}
      {notice && <div className="relay-toast"><Check size={15} />{notice}<button aria-label="Dismiss message" onClick={() => setNotice("")}><X size={14} /></button></div>}
    </main>
  );
}
