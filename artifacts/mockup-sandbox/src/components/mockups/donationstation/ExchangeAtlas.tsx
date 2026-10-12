import { useMemo, useState, type FormEvent } from "react";
import {
  ArrowDownLeft,
  ArrowRight,
  Bell,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Heart,
  MapPin,
  Package,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import "./exchange-atlas.css";

type Need = { id: string; person: string; initials: string; title: string; detail: string; place: string; due: string; category: string };
type Supply = { id: string; title: string; detail: string; place: string; donor: string; category: string; quantity: string };

const initialNeeds: Need[] = [
  { id: "N-183", person: "Mara & two children", initials: "MC", title: "A warm start in a new home", detail: "Winter coats · sizes 4, 7, adult M", place: "Eastside family hub", due: "Needed today", category: "Clothing" },
  { id: "N-179", person: "Leon, senior neighbor", initials: "LW", title: "Safer steps at home", detail: "A sturdy mobility walker", place: "Central care network", due: "Today · 2:30 PM", category: "Mobility" },
  { id: "N-176", person: "The Alvarez family", initials: "AF", title: "A place to gather", detail: "Twin bed frame, no mattress needed", place: "South welcome center", due: "By Friday", category: "Home" },
  { id: "N-168", person: "Northside after-school club", initials: "NC", title: "Stories for the reading nook", detail: "Picture books for ages 3–8", place: "Northside community room", due: "This week", category: "Learning" },
];

const initialSupplies: Supply[] = [
  { id: "D-412", title: "Coats for little ones", detail: "18 pieces · freshly laundered", place: "East station", donor: "Northside Mutual Aid", category: "Clothing", quantity: "18 pcs" },
  { id: "D-408", title: "Portable induction hob", detail: "Tested · excellent condition", place: "Central station", donor: "Jules R.", category: "Kitchen", quantity: "1 item" },
  { id: "D-401", title: "Solid wood twin bed frame", detail: "Disassembled, all fittings included", place: "South station", donor: "Mina's moving sale", category: "Home", quantity: "1 item" },
  { id: "D-398", title: "Picture books, ages 3–8", detail: "32 books · a few beloved classics", place: "West station", donor: "Little Lantern Library", category: "Learning", quantity: "32 books" },
];

export default function ExchangeAtlas() {
  const [needs, setNeeds] = useState(initialNeeds);
  const [supplies, setSupplies] = useState(initialSupplies);
  const [matches, setMatches] = useState<{ need: Need; supply: Supply }[]>([]);
  const [selectedNeed, setSelectedNeed] = useState<string | null>(initialNeeds[0].id);
  const [selectedSupply, setSelectedSupply] = useState<string | null>(initialSupplies[0].id);
  const [query, setQuery] = useState("");
  const [activeView, setActiveView] = useState<"Pairing desk" | "In motion">("Pairing desk");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const filteredNeeds = useMemo(() => needs.filter((item) => `${item.title} ${item.person} ${item.detail} ${item.category}`.toLowerCase().includes(query.toLowerCase())), [needs, query]);
  const filteredSupplies = useMemo(() => supplies.filter((item) => `${item.title} ${item.donor} ${item.detail} ${item.category}`.toLowerCase().includes(query.toLowerCase())), [supplies, query]);
  const need = needs.find((item) => item.id === selectedNeed);
  const supply = supplies.find((item) => item.id === selectedSupply);

  function makeMatch() {
    if (!need || !supply) return;
    setMatches((current) => [{ need, supply }, ...current]);
    setNeeds((current) => current.filter((item) => item.id !== need.id));
    setSupplies((current) => current.filter((item) => item.id !== supply.id));
    setSelectedNeed(null);
    setSelectedSupply(null);
    setNotice(`A handoff is underway for ${need.person}.`);
    window.setTimeout(() => setNotice(""), 2600);
  }

  function addNeed(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = draft.trim();
    if (!title) return;
    const fresh: Need = { id: `N-${190 + needs.length}`, person: "New community request", initials: "NC", title, detail: "Newly received · details to confirm", place: "Central welcome desk", due: "Needs review", category: "New request" };
    setNeeds((current) => [fresh, ...current]);
    setSelectedNeed(fresh.id);
    setDraft("");
    setAdding(false);
    setNotice("Request added to the pairing desk.");
    window.setTimeout(() => setNotice(""), 2600);
  }

  return (
    <main className="atlas">
      <aside className="atlas-rail">
        <div className="atlas-brand"><div className="brand-stamp"><Heart size={17} fill="currentColor" /></div><span>donation<br />station</span></div>
        <div className="rail-rule" />
        <span className="rail-label">WORKSPACE</span>
        <button className={`rail-link ${activeView === "Pairing desk" ? "is-current" : ""}`} onClick={() => setActiveView("Pairing desk")}><span className="rail-icon"><Package size={17} /></span><span>Pairing desk</span><b>{needs.length}</b></button>
        <button className={`rail-link ${activeView === "In motion" ? "is-current" : ""}`} onClick={() => setActiveView("In motion")}><span className="rail-icon"><ArrowDownLeft size={17} /></span><span>In motion</span><b>{matches.length}</b></button>
        <div className="rail-bottom"><div className="rail-station"><span className="station-pulse" /><div><b>Central station</b><small>Open · synced 4 min ago</small></div><ChevronDown size={14} /></div><button className="help-link" onClick={() => setNotice("The team is here if you need a hand.")}><CircleHelp size={15} /> Help & feedback</button></div>
      </aside>

      <section className="atlas-main">
        <header className="atlas-topbar">
          <div className="crumb"><span>Community exchange</span><span>/</span><b>{activeView}</b></div>
          <div className="top-actions"><button className="icon-button notification" aria-label="Notifications" onClick={() => setNotice("You’re all caught up.")}><Bell size={17} /><i /></button><div className="operator"><span className="operator-avatar">AM</span><span><b>Alex Morgan</b><small>Station coordinator</small></span><ChevronDown size={14} /></div></div>
        </header>

        <div className="atlas-content">
          <section className="welcome-row">
            <div><div className="eyebrow"><span className="eyebrow-line" /> TUESDAY, OCTOBER 24 <span className="eyebrow-dot">·</span> CENTRAL STATION</div><h1>Make a good<br className="mobile-break" /> handoff.</h1><p>Bring a real need together with something ready to give.</p></div>
            <div className="day-note"><div className="day-note-icon"><Sparkles size={17} /></div><span><b>{needs.length} open needs</b><small>Across 3 neighborhood stations</small></span><ArrowRight size={15} /></div>
          </section>

          <div className="desk-controls">
            <div className="view-tabs"><button onClick={() => setActiveView("Pairing desk")} className={activeView === "Pairing desk" ? "selected" : ""}>Pairing desk <span>{needs.length}</span></button><button onClick={() => setActiveView("In motion")} className={activeView === "In motion" ? "selected" : ""}>In motion <span>{matches.length}</span></button></div>
            <div className="desk-actions"><label className="search-box"><Search size={16} /><input aria-label="Search needs and donations" placeholder="Find a need or donation" value={query} onChange={(event) => setQuery(event.target.value)} /><kbd>⌘ K</kbd></label><button className={`filter-button ${showFilters ? "filter-on" : ""}`} onClick={() => setShowFilters((value) => !value)}><SlidersHorizontal size={15} /> Refine</button><button className="add-button" onClick={() => setAdding(true)}><Plus size={16} /> Add a need</button></div>
          </div>
          {showFilters && <div className="filter-strip"><span>Showing every neighborhood</span><button onClick={() => { setQuery(""); setShowFilters(false); }}>Clear filters <X size={13} /></button><span className="filter-note">Category and station refinements are ready for your next search.</span></div>}

          {activeView === "Pairing desk" ? (
            <div className="pairing-layout">
              <section className="match-column">
                <div className="column-heading"><div><span className="column-index">01</span><h2>People who need</h2></div><span className="column-count">{filteredNeeds.length} open</span></div>
                <p className="column-caption">Start with the person, then find what fits.</p>
                <div className="item-list">
                  {filteredNeeds.map((item) => <button key={item.id} className={`match-item ${selectedNeed === item.id ? "item-active" : ""}`} onClick={() => setSelectedNeed(item.id)}>
                    <span className="person-mark">{item.initials}</span><span className="item-copy"><span className="item-topline"><b>{item.person}</b><small>{item.due}</small></span><strong>{item.title}</strong><span className="item-detail">{item.detail}</span><span className="item-place"><MapPin size={12} />{item.place}</span></span><span className="item-check">{selectedNeed === item.id ? <Check size={15} /> : <ArrowRight size={14} />}</span>
                  </button>)}
                  {filteredNeeds.length === 0 && <div className="empty-list"><Users size={21} /><b>No needs found</b><span>Try another search or add a request.</span></div>}
                </div>
              </section>
              <section className="match-column supply-column">
                <div className="column-heading"><div><span className="column-index supply-index">02</span><h2>Things ready to give</h2></div><span className="column-count">{filteredSupplies.length} available</span></div>
                <p className="column-caption">Nearby resources, offered by neighbors.</p>
                <div className="item-list">
                  {filteredSupplies.map((item) => <button key={item.id} className={`match-item supply-item ${selectedSupply === item.id ? "item-active" : ""}`} onClick={() => setSelectedSupply(item.id)}>
                    <span className="supply-mark"><Package size={18} /></span><span className="item-copy"><span className="item-topline"><b>{item.donor}</b><small>{item.quantity}</small></span><strong>{item.title}</strong><span className="item-detail">{item.detail}</span><span className="item-place"><MapPin size={12} />{item.place}</span></span><span className="item-check">{selectedSupply === item.id ? <Check size={15} /> : <ArrowRight size={14} />}</span>
                  </button>)}
                  {filteredSupplies.length === 0 && <div className="empty-list"><Package size={21} /><b>No donations found</b><span>Try a different search term.</span></div>}
                </div>
              </section>
              <aside className="match-aside">
                <div className="match-recipe"><span className="recipe-overline"><Sparkles size={13} /> A POSSIBLE HANDOFF</span><h3>Good things<br />find each other.</h3><p>Pair a request with a resource when the details feel right.</p>
                  <div className="pair-preview">
                    <div className="preview-node"><span className="preview-icon need-color"><Users size={15} /></span><span><small>NEED</small><b>{need?.title ?? "Choose a request"}</b><em>{need?.person ?? "Select from the list"}</em></span></div>
                    <div className="connector"><span /><span /><span /></div>
                    <div className="preview-node"><span className="preview-icon give-color"><Package size={15} /></span><span><small>OFFER</small><b>{supply?.title ?? "Choose a donation"}</b><em>{supply?.donor ?? "Select from the list"}</em></span></div>
                  </div>
                  <button className="confirm-match" disabled={!need || !supply} onClick={makeMatch}>Start this handoff <ArrowRight size={15} /></button>
                  <div className="match-footnote"><Heart size={13} /> You can confirm details with both sides next.</div>
                </div>
                <div className="small-insight"><div className="insight-symbol"><Clock3 size={16} /></div><span><b>A timely nudge</b><small>Leon’s mobility request is due today at 2:30.</small></span><button aria-label="Select Leon's need" onClick={() => setSelectedNeed("N-179")}><ArrowRight size={14} /></button></div>
              </aside>
            </div>
          ) : (
            <section className="motion-view"><div className="motion-title"><span className="column-index">03</span><div><h2>Handoffs in motion</h2><p>Every good match starts the next part of its journey.</p></div></div>
              {matches.length ? <div className="motion-list">{matches.map((pair, index) => <article className="motion-card" key={`${pair.need.id}-${pair.supply.id}`}><div className="motion-number">0{index + 1}</div><div className="motion-who"><span className="motion-avatar">{pair.need.initials}</span><div><small>GOING TO</small><b>{pair.need.person}</b><span>{pair.need.title}</span></div></div><div className="motion-route"><span /><ArrowRight size={15} /><span /></div><div className="motion-who"><span className="motion-gift"><Package size={17} /></span><div><small>FROM</small><b>{pair.supply.donor}</b><span>{pair.supply.title}</span></div></div><div className="motion-status"><span className="status-dot" />Next: confirm pickup</div></article>)}</div> : <div className="motion-empty"><div className="empty-illustration"><Package size={28} /><Heart size={16} /></div><h3>Nothing in motion just yet.</h3><p>Choose a need and an available donation to start the first handoff.</p><button onClick={() => setActiveView("Pairing desk")}>Back to pairing desk <ArrowRight size={15} /></button></div>}
            </section>
          )}
          <footer className="atlas-footer"><span><Heart size={13} /> A second chapter for good things.</span><span>Community exchange <i>·</i> Central station</span><button onClick={() => setNotice("Your station is synced and up to date.")}>Station status <span className="footer-live" /> <ArrowRight size={13} /></button></footer>
        </div>
      </section>

      {adding && <div className="modal-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) setAdding(false); }}><form className="need-modal" onSubmit={addNeed}><div className="modal-head"><div><span className="eyebrow">A NEIGHBOR NEEDS SOMETHING</span><h2>Add a request</h2></div><button type="button" className="modal-close" onClick={() => setAdding(false)} aria-label="Close"><X size={17} /></button></div><label className="modal-label">What would make a difference?<input autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="e.g. A warm winter coat" /></label><p className="modal-helper">You can add the details and confirm the person with your team after saving.</p><div className="modal-actions"><button type="button" onClick={() => setAdding(false)}>Cancel</button><button type="submit" disabled={!draft.trim()}><Plus size={15} /> Add to desk</button></div></form></div>}
      {notice && <div className="atlas-toast"><Check size={15} />{notice}<button aria-label="Dismiss message" onClick={() => setNotice("")}><X size={14} /></button></div>}
    </main>
  );
}
