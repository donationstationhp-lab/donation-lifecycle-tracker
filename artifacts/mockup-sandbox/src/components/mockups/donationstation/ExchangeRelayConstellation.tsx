import { useMemo, useState, type FormEvent } from "react";
import {
  ArrowDownLeft, ArrowRight, ArrowUpRight, Check, ChevronDown, CircleHelp,
  Clock3, Heart, MapPin, Package, Plus, Search, Sparkles, X,
} from "lucide-react";
import "./exchangerelayconstellation.css";

type Need = { id: string; person: string; initials: string; title: string; detail: string; place: string; due: string; category: string };
type Supply = { id: string; title: string; detail: string; place: string; donor: string; category: string; quantity: string };
type Pair = { need: Need; supply: Supply; status: string };

const initialNeeds: Need[] = [
  { id: "N-183", person: "Mara & two children", initials: "MC", title: "A warm start in a new home", detail: "Winter coats · sizes 4, 7, adult M", place: "Eastside family hub", due: "Today", category: "Clothing" },
  { id: "N-179", person: "Leon, senior neighbor", initials: "LW", title: "Safer steps at home", detail: "A sturdy mobility walker", place: "Central care network", due: "2:30 PM", category: "Mobility" },
  { id: "N-176", person: "The Alvarez family", initials: "AF", title: "A place to gather", detail: "Twin bed frame, no mattress needed", place: "South welcome center", due: "Friday", category: "Home" },
  { id: "N-168", person: "Northside after-school club", initials: "NC", title: "Stories for the reading nook", detail: "Picture books for ages 3–8", place: "Northside community room", due: "This week", category: "Learning" },
];

const initialSupplies: Supply[] = [
  { id: "D-412", title: "Coats for little ones", detail: "18 pieces · freshly laundered", place: "East station", donor: "Northside Mutual Aid", category: "Clothing", quantity: "18 pcs" },
  { id: "D-408", title: "Portable induction hob", detail: "Tested · excellent condition", place: "Central station", donor: "Jules R.", category: "Kitchen", quantity: "1 item" },
  { id: "D-401", title: "Solid wood twin bed frame", detail: "Disassembled, all fittings included", place: "South station", donor: "Mina's moving sale", category: "Home", quantity: "1 item" },
  { id: "D-398", title: "Picture books, ages 3–8", detail: "32 books · a few beloved classics", place: "West station", donor: "Little Lantern Library", category: "Learning", quantity: "32 books" },
];

export default function ExchangeRelayConstellation() {
  const [needs, setNeeds] = useState(initialNeeds);
  const [supplies, setSupplies] = useState(initialSupplies);
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [selectedNeed, setSelectedNeed] = useState(initialNeeds[0].id);
  const [selectedSupply, setSelectedSupply] = useState("");
  const [filter, setFilter] = useState("All needs");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"matching" | "routes">("matching");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");

  const categories = ["All needs", "Clothing", "Home", "Learning", "Mobility"];
  const filteredNeeds = useMemo(() => needs.filter((item) =>
    (filter === "All needs" || item.category === filter) &&
    `${item.title} ${item.person} ${item.detail} ${item.category}`.toLowerCase().includes(query.toLowerCase()),
  ), [needs, filter, query]);
  const activeNeed = needs.find((item) => item.id === selectedNeed);
  const selectedItem = supplies.find((item) => item.id === selectedSupply);
  const compatible = useMemo(() => [...supplies].sort((a, b) =>
    Number(b.category === activeNeed?.category) - Number(a.category === activeNeed?.category),
  ), [supplies, activeNeed]);

  function makePair() {
    if (!activeNeed || !selectedItem) return;
    setPairs((current) => [{ need: activeNeed, supply: selectedItem, status: "Awaiting pickup" }, ...current]);
    setNeeds((current) => current.filter((item) => item.id !== activeNeed.id));
    setSupplies((current) => current.filter((item) => item.id !== selectedItem.id));
    const nextNeed = needs.find((item) => item.id !== activeNeed.id);
    setSelectedNeed(nextNeed?.id ?? "");
    setSelectedSupply("");
    setNotice("The route is ready for a pickup check.");
  }

  function addRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim()) return;
    const item: Need = {
      id: `N-${190 + needs.length}`, person: "New community request", initials: "NC",
      title: draft.trim(), detail: "Newly received · details to confirm",
      place: "Central welcome desk", due: "Needs review", category: "Home",
    };
    setNeeds((current) => [item, ...current]);
    setSelectedNeed(item.id);
    setFilter("All needs");
    setDraft("");
    setAdding(false);
  }

  function advance(index: number) {
    setPairs((current) => current.map((pair, i) => i !== index ? pair : {
      ...pair, status: pair.status === "Awaiting pickup" ? "Pickup confirmed" : "Completed",
    }));
  }

  return (
    <main className="constellation">
      <header className="cx-header">
        <div className="cx-brand"><span><Heart size={16} fill="currentColor" /></span><b>donation<br />station</b><i /></div>
        <div className="cx-context"><small>COMMUNITY EXCHANGE</small><strong>Central station</strong><ChevronDown size={13} /></div>
        <nav className="cx-tabs" aria-label="Exchange workspace">
          <button className={view === "matching" ? "selected" : ""} onClick={() => setView("matching")}>Match pool <b>{needs.length}</b></button>
          <button className={view === "routes" ? "selected" : ""} onClick={() => setView("routes")}>Routes <b>{pairs.length}</b></button>
        </nav>
        <div className="cx-profile"><span>AM</span><div><b>Alex Morgan</b><small>Coordinator</small></div><button aria-label="Coordinator help" onClick={() => setNotice("Station support is available until 6 PM.")}><CircleHelp size={16} /></button></div>
      </header>

      <div className="cx-wrap">
        <section className="cx-intro">
          <div>
            <div className="cx-kicker"><span /> LIVE EXCHANGE BOARD <i> / </i> OCT 24</div>
            <h1>{view === "matching" ? <>Find the right<br /><em>things together.</em></> : <>Good things,<br /><em>on their way.</em></>}</h1>
            <p>{view === "matching" ? "Work across the whole pool. Connect a neighbor’s need with an offer that can meet it." : "A shared view of every route your station has set in motion."}</p>
          </div>
          <div className="cx-stats">
            <div><strong>{needs.length.toString().padStart(2, "0")}</strong><span>open needs</span></div>
            <i />
            <div><strong>{supplies.length.toString().padStart(2, "0")}</strong><span>offers nearby</span></div>
            <i />
            <div><strong>{pairs.length.toString().padStart(2, "0")}</strong><span>routes started</span></div>
          </div>
        </section>

        <div className="cx-toolbar">
          <label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people, items, places…" aria-label="Search the exchange pool" /><kbd>⌘ K</kbd></label>
          <button className="cx-add" onClick={() => setAdding(true)}><Plus size={15} /> Add a need</button>
        </div>

        {view === "matching" ? (
          <>
            <div className="cx-filterbar">
              <span>SHOWING</span>
              {categories.map((category) => <button key={category} className={filter === category ? "on" : ""} onClick={() => setFilter(category)}>{category}</button>)}
              <div className="cx-live"><i /> LIVE POOL <span>·</span> updated now</div>
            </div>
            <section className="cx-board">
              <div className="cx-pool cx-needs">
                <div className="cx-pool-head"><div><small>01 / PEOPLE FIRST</small><h2>Open needs</h2></div><span>{filteredNeeds.length} <i>requests</i></span></div>
                <div className="cx-card-stack">
                  {filteredNeeds.map((need, index) => (
                    <button key={need.id} className={`cx-need-card ${selectedNeed === need.id ? "active" : ""}`} onClick={() => { setSelectedNeed(need.id); setSelectedSupply(""); }}>
                      <span className="cx-card-index">0{index + 1}</span>
                      <span className="cx-person">{need.initials}</span>
                      <span className="cx-card-content"><span className="cx-card-meta">{need.category} <i>·</i> <b>{need.due}</b></span><strong>{need.title}</strong><small>{need.person}</small><em>{need.detail}</em></span>
                      <ArrowRight size={15} />
                    </button>
                  ))}
                  {!filteredNeeds.length && <div className="cx-empty">No needs in this view.<button onClick={() => { setFilter("All needs"); setQuery(""); }}>Show everything</button></div>}
                </div>
                <button className="cx-pool-add" onClick={() => setAdding(true)}><Plus size={13} /> Put a new need on the board</button>
              </div>

              <div className="cx-bridge">
                <div className="cx-bridge-label"><span>THE CONNECTION</span><Sparkles size={14} /></div>
                <div className={`cx-wire ${activeNeed && selectedItem ? "connected" : ""}`}><i /><span>{activeNeed && selectedItem ? "MATCH READY" : "SELECT BOTH SIDES"}</span><i /></div>
                {activeNeed && selectedItem ? (
                  <div className="cx-pair-preview">
                    <div><small>NEED</small><b>{activeNeed.title}</b><em>{activeNeed.person}</em></div>
                    <ArrowDownLeft size={16} />
                    <div><small>OFFER</small><b>{selectedItem.title}</b><em>{selectedItem.donor}</em></div>
                  </div>
                ) : <p>Choose one need and one offer. We’ll put the details side by side before you start a route.</p>}
                <button className="cx-create-route" disabled={!activeNeed || !selectedItem} onClick={makePair}>Create route <ArrowRight size={15} /></button>
                <div className="cx-match-note"><Check size={13} /> Details stay visible for both sides</div>
              </div>

              <div className="cx-pool cx-offers">
                <div className="cx-pool-head"><div><small>02 / GOOD THINGS NEARBY</small><h2>Available offers</h2></div><span>{supplies.length} <i>offers</i></span></div>
                <div className="cx-offer-stack">
                  {compatible.map((offer) => (
                    <button key={offer.id} className={`cx-offer-card ${selectedSupply === offer.id ? "active" : ""} ${activeNeed?.category === offer.category ? "is-fit" : ""}`} onClick={() => setSelectedSupply(selectedSupply === offer.id ? "" : offer.id)}>
                      <span className="cx-offer-icon"><Package size={17} /></span>
                      <span className="cx-offer-copy"><span>{offer.category === activeNeed?.category && <i>GOOD FIT</i>}<small>{offer.quantity}</small></span><strong>{offer.title}</strong><em>{offer.donor}</em><small className="cx-origin"><MapPin size={11} /> {offer.place}</small></span>
                      <span className="cx-select">{selectedSupply === offer.id && <Check size={12} />}</span>
                    </button>
                  ))}
                  {!supplies.length && <div className="cx-empty">No offers left to route.<span>New donations will appear here.</span></div>}
                </div>
                <div className="cx-offer-foot"><span><ArrowUpRight size={13} /> Offers can help more than one need over time.</span></div>
              </div>
            </section>
          </>
        ) : (
          <section className="cx-routes">
            <div className="cx-route-heading"><div><small>YOUR EXCHANGE, IN MOTION</small><h2>Routes in progress</h2></div><span>{pairs.length} total routes</span></div>
            {pairs.length ? <div className="cx-route-list">{pairs.map((pair, index) => <article key={pair.need.id} className="cx-route">
              <span className="cx-route-no">0{index + 1}</span>
              <div className="cx-route-party"><span className="cx-person">{pair.need.initials}</span><span><small>GOING TO</small><b>{pair.need.person}</b><em>{pair.need.title}</em></span></div>
              <div className="cx-route-line"><i /><ArrowRight size={15} /><i /></div>
              <div className="cx-route-party"><span className="cx-offer-icon"><Package size={16} /></span><span><small>FROM {pair.supply.donor}</small><b>{pair.supply.title}</b><em>{pair.supply.place}</em></span></div>
              <div className="cx-route-status"><i className={pair.status === "Completed" ? "done" : ""} /><span><small>STATUS</small><b>{pair.status}</b></span><button onClick={() => advance(index)} disabled={pair.status === "Completed"}>{pair.status === "Awaiting pickup" ? "Confirm pickup" : pair.status === "Pickup confirmed" ? "Mark complete" : "Completed"}{pair.status !== "Completed" && <ArrowRight size={13} />}</button></div>
            </article>)}</div> : <div className="cx-route-empty"><div><Package size={20} /><Heart size={12} /></div><h3>No routes yet.</h3><p>Pick a need and an offer from the exchange board to start the first one.</p><button onClick={() => setView("matching")}>Explore the match pool <ArrowRight size={14} /></button></div>}
          </section>
        )}

        <footer className="cx-footer"><span><Heart size={13} /> Nothing wasted. Nobody overlooked.</span><span><i /> STATION ONLINE <b>·</b> LAST SYNC 10:42 AM</span><button onClick={() => setNotice("Central station is open and synced.")}><Clock3 size={13} /> Activity log <ArrowRight size={13} /></button></footer>
      </div>

      {adding && <div className="cx-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) setAdding(false); }}><form className="cx-modal" onSubmit={addRequest}><div className="cx-modal-top"><div><small>PEOPLE FIRST</small><h2>Add a need to the pool</h2></div><button type="button" aria-label="Close" onClick={() => setAdding(false)}><X size={17} /></button></div><label>What would make a difference?<input autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="e.g. A warm winter coat" /></label><p>Start with the need. Your team can confirm the details after saving.</p><div className="cx-modal-actions"><button type="button" onClick={() => setAdding(false)}>Cancel</button><button type="submit" disabled={!draft.trim()}><Plus size={14} /> Add to pool</button></div></form></div>}
      {notice && <div className="cx-toast"><Check size={14} />{notice}<button aria-label="Dismiss message" onClick={() => setNotice("")}><X size={13} /></button></div>}
    </main>
  );
}
