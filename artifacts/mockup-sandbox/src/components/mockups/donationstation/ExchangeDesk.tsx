import { useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  Command,
  HeartHandshake,
  Leaf,
  MapPin,
  MoreHorizontal,
  Package,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Truck,
  UsersRound,
  X,
} from "lucide-react";
import "./exchangedesk.css";

type Stage = "New intake" | "Needs review" | "Ready to match" | "In motion";
type QueueItem = {
  id: string;
  name: string;
  category: string;
  tier: "T" | "I" | "E" | "R";
  stage: Stage;
  detail: string;
  place: string;
  age: string;
  urgent?: boolean;
};

const initialItems: QueueItem[] = [
  { id: "DS-2841", name: "Winter coats, assorted", category: "Apparel · 18 pieces", tier: "T", stage: "Needs review", detail: "Donated by Northside Mutual Aid", place: "East station", age: "12 min ago", urgent: true },
  { id: "DS-2838", name: "Portable induction hob", category: "Kitchen · 1 item", tier: "I", stage: "New intake", detail: "Tested, excellent condition", place: "Central station", age: "38 min ago" },
  { id: "DS-2832", name: "Twin bed frame", category: "Home · 1 item", tier: "E", stage: "Ready to match", detail: "Request match: family of four", place: "South station", age: "1 hr ago" },
  { id: "DS-2827", name: "Children's picture books", category: "Learning · 32 books", tier: "R", stage: "In motion", detail: "Pickup window confirmed", place: "West station", age: "2 hrs ago" },
  { id: "DS-2822", name: "Mobility walker", category: "Accessibility · 1 item", tier: "T", stage: "Needs review", detail: "Priority request · senior services", place: "Central station", age: "3 hrs ago", urgent: true },
  { id: "DS-2819", name: "Desk lamps", category: "Home · 4 items", tier: "E", stage: "New intake", detail: "Bulbs included · ready to use", place: "East station", age: "4 hrs ago" },
];

const stages: Stage[] = ["New intake", "Needs review", "Ready to match", "In motion"];
const tierMeta = {
  T: { label: "Today", color: "coral" },
  I: { label: "Hours", color: "ochre" },
  E: { label: "Essential", color: "sage" },
  R: { label: "Next week", color: "slate" },
};

export default function ExchangeDesk() {
  const [items, setItems] = useState(initialItems);
  const [activeStage, setActiveStage] = useState<Stage | "All work">("All work");
  const [search, setSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState<string | null>(initialItems[0].id);
  const [showFilters, setShowFilters] = useState(false);
  const [showAlerts, setShowAlerts] = useState(true);
  const [toast, setToast] = useState("");

  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      const stageMatch = activeStage === "All work" || item.stage === activeStage;
      const queryMatch = !query || `${item.name} ${item.id} ${item.category} ${item.place}`.toLowerCase().includes(query);
      return stageMatch && queryMatch;
    });
  }, [activeStage, items, search]);
  const selected = items.find((item) => item.id === selectedItem);
  const countFor = (stage: Stage) => items.filter((item) => item.stage === stage).length;

  function advanceItem(item: QueueItem) {
    const next = stages[Math.min(stages.indexOf(item.stage) + 1, stages.length - 1)];
    if (next === item.stage) {
      setToast(`${item.id} is already moving`);
      return;
    }
    setItems((current) => current.map((row) => row.id === item.id ? { ...row, stage: next } : row));
    setToast(`${item.id} moved to ${next.toLowerCase()}`);
    window.setTimeout(() => setToast(""), 2600);
  }

  function addIntake() {
    const fresh: QueueItem = {
      id: `DS-${2850 + items.length}`,
      name: "New community donation",
      category: "Unsorted · details needed",
      tier: "E",
      stage: "New intake",
      detail: "Added to today's desk for triage",
      place: "Central station",
      age: "Just now",
    };
    setItems((current) => [fresh, ...current]);
    setSelectedItem(fresh.id);
    setActiveStage("All work");
    setToast("New intake added to the desk");
    window.setTimeout(() => setToast(""), 2600);
  }

  return (
    <main className="exchange">
      <aside className="exchange-rail">
        <div className="brand-mark" aria-label="Donation Station">
          <div className="brand-symbol"><Leaf size={21} strokeWidth={2.2} /></div>
          <div className="brand-word">donation<span>station</span></div>
        </div>
        <div className="rail-rule" />
        <p className="rail-caption">WORKSPACE</p>
        <nav className="rail-nav" aria-label="Workspace">
          <button className="rail-link active" onClick={() => setActiveStage("All work")}><Command size={17} /><span>Exchange desk</span><span className="rail-count">{items.length}</span></button>
          <button className="rail-link" onClick={() => setActiveStage("New intake")}><Package size={17} /><span>Intake</span></button>
          <button className="rail-link" onClick={() => setActiveStage("Ready to match")}><HeartHandshake size={17} /><span>Matching</span></button>
          <button className="rail-link" onClick={() => setActiveStage("In motion")}><Truck size={17} /><span>Dispatch</span></button>
        </nav>
        <div className="rail-bottom">
          <div className="rail-profile"><div className="profile-initials">MO</div><div><b>Maya Ortiz</b><small>Station lead</small></div><MoreHorizontal size={18} /></div>
          <div className="rail-live"><span className="live-dot" /> All stations reporting <span>·</span> 9:41 AM</div>
        </div>
      </aside>

      <section className="exchange-main">
        <header className="topbar">
          <div className="breadcrumb">Operations <span>/</span> <b>Exchange desk</b></div>
          <div className="top-actions">
            <button className="date-chip"><span className="date-dot" /> Tuesday, October 14 <ChevronDown size={14} /></button>
            <button className={`icon-button ${showAlerts ? "has-alert" : ""}`} aria-label="Toggle alerts" onClick={() => setShowAlerts(!showAlerts)}><Bell size={18} /></button>
            <div className="top-avatar">MO</div>
          </div>
        </header>
        <div className="content-wrap">
          <div className="desk-heading">
            <div>
              <div className="eyebrow"><span className="eyebrow-line" /> TUESDAY · WEEK 42 <span className="eyebrow-divider">/</span> CITYWIDE OPERATIONS</div>
              <h1>Make good things<br className="mobile-break" /> <em>move.</em></h1>
              <p className="heading-copy">A clear view of what needs attention, what can be matched, and what’s already on its way.</p>
            </div>
            <button className="primary-cta" onClick={addIntake}><Plus size={17} /> Log an intake</button>
          </div>

          <div className="pulse-strip">
            <div className="pulse-intro"><div className="pulse-icon"><Sparkles size={18} /></div><div><strong>Today’s exchange</strong><span>Small actions, moving the whole city forward.</span></div></div>
            <div className="pulse-stat"><b>28</b><span>resources received</span><div className="stat-trend"><ArrowUpRight size={13} /> 12% this week</div></div>
            <div className="pulse-stat"><b>16</b><span>neighbors supported</span><div className="stat-trend"><ArrowUpRight size={13} /> 4 since Monday</div></div>
            <div className="pulse-stat"><b>74<span className="stat-unit">%</span></b><span>matched to a need</span><div className="stat-trend neutral"><ArrowDownRight size={13} /> 3 awaiting review</div></div>
            <div className="pulse-note"><span className="note-topline">THE LOOP</span><div className="loop-graphic"><span>RECEIVE</span><i>→</i><span>MATCH</span><i>→</i><span>GIVE</span></div><span className="loop-caption">Keep resources in good hands.</span></div>
          </div>

          <div className="work-layout">
            <section className="queue-panel">
              <div className="queue-header">
                <div><div className="section-kicker">THE WORK, IN MOTION</div><h2>Exchange queue <span className="queue-total">{items.length}</span></h2></div>
                <div className="queue-tools">
                  <label className="search-box"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find an item…" /><kbd>⌘ K</kbd></label>
                  <button className={`filter-button ${showFilters ? "selected" : ""}`} onClick={() => setShowFilters(!showFilters)}><SlidersHorizontal size={15} /> Filter <ChevronDown size={13} /></button>
                </div>
              </div>
              {showFilters && <div className="filter-tray"><span>SHOWING</span>{["All work", ...stages].map((stage) => <button key={stage} className={activeStage === stage ? "filter-pill chosen" : "filter-pill"} onClick={() => setActiveStage(stage as Stage | "All work")}>{stage}{stage !== "All work" && <small>{countFor(stage as Stage)}</small>}</button>)}<button className="clear-filter" onClick={() => { setActiveStage("All work"); setSearch(""); }}>Clear all</button></div>}
              <div className="stage-tabs">
                <button className={activeStage === "All work" ? "stage-tab current" : "stage-tab"} onClick={() => setActiveStage("All work")}>All work <span>{items.length}</span></button>
                {stages.map((stage, index) => <button key={stage} className={activeStage === stage ? "stage-tab current" : "stage-tab"} onClick={() => setActiveStage(stage)}><i className={`stage-marker stage-${index}`} />{stage}<span>{countFor(stage)}</span></button>)}
              </div>

              <div className="queue-columns"><span>RESOURCE / COMMUNITY</span><span>PRIORITY</span><span>STATION</span><span>UPDATED</span><span /></div>
              <div className="queue-list">
                {visibleItems.map((item) => (
                  <button key={item.id} className={`queue-row ${selectedItem === item.id ? "row-selected" : ""}`} onClick={() => setSelectedItem(item.id)}>
                    <span className="item-main">
                      <span className={`item-symbol tier-${tierMeta[item.tier].color}`}><Package size={17} /></span>
                      <span className="item-titles"><span className="item-name">{item.name}{item.urgent && <span className="urgent-flag"><CircleAlert size={11} /> PRIORITY</span>}</span><span className="item-description">{item.id} <b>·</b> {item.category}</span></span>
                    </span>
                    <span className={`tier-tag tier-tag-${tierMeta[item.tier].color}`}>{item.tier} <span>{tierMeta[item.tier].label}</span></span>
                    <span className="station-cell"><MapPin size={12} />{item.place.replace(" station", "")}</span>
                    <span className="age-cell">{item.age}</span>
                    <span className="row-arrow"><ArrowRight size={16} /></span>
                  </button>
                ))}
                {visibleItems.length === 0 && <div className="empty-state"><Search size={19} /><strong>No work found</strong><span>Try another item name or clear your filters.</span><button onClick={() => { setSearch(""); setActiveStage("All work"); }}>Reset desk</button></div>}
              </div>
              <div className="queue-footer"><span>Showing <b>{visibleItems.length}</b> of <b>{items.length}</b> active resources</span><button onClick={() => setActiveStage("All work")}>View full inventory <ArrowRight size={14} /></button></div>
            </section>

            <aside className="right-column">
              {selected ? <div className="focus-card">
                <div className="focus-top"><div className="section-kicker">SELECTED RESOURCE</div><button aria-label="Close details" className="close-focus" onClick={() => setSelectedItem(null)}><X size={15} /></button></div>
                <div className="focus-title-row"><div className={`focus-icon tier-${tierMeta[selected.tier].color}`}><Package size={20} /></div><span className={`tier-tag tier-tag-${tierMeta[selected.tier].color}`}>{selected.tier} <span>{tierMeta[selected.tier].label}</span></span></div>
                <h3>{selected.name}</h3>
                <p className="focus-meta">{selected.id} <span>·</span> {selected.category}</p>
                <div className="focus-status"><span className={`status-bullet stage-${stages.indexOf(selected.stage)}`} /><div><small>CURRENT STEP</small><b>{selected.stage}</b></div><button aria-label="Change stage" onClick={() => advanceItem(selected)}><ArrowRight size={15} /></button></div>
                <p className="focus-detail">{selected.detail}</p>
                <div className="focus-facts"><div><MapPin size={14} /><span><small>At</small><b>{selected.place}</b></span></div><div><Clock3 size={14} /><span><small>Last update</small><b>{selected.age}</b></span></div></div>
                <button className="advance-button" onClick={() => advanceItem(selected)}>{selected.stage === "In motion" ? <><Check size={15} /> On its way</> : <>Move to {stages[stages.indexOf(selected.stage) + 1]} <ArrowRight size={15} /></>}</button>
                <div className="item-id-footer">A resource with a second chapter <span>↗</span></div>
              </div> : <div className="focus-empty"><Package size={22} /><strong>Pick a resource</strong><span>Select any row to see its next best step.</span></div>}

              {showAlerts && <div className="attention-card">
                <div className="attention-heading"><div className="attention-icon"><Bell size={15} /></div><div><b>Needs a human touch</b><span>Keep the handoff kind and timely.</span></div><button aria-label="Dismiss alert panel" onClick={() => setShowAlerts(false)}><X size={14} /></button></div>
                <button className="attention-item" onClick={() => { setActiveStage("Needs review"); setShowFilters(false); }}><span className="attention-number">03</span><span><b>Items waiting for review</b><small>Oldest request · 2h 16m</small></span><ArrowRight size={14} /></button>
                <button className="attention-item" onClick={() => { setActiveStage("In motion"); setShowFilters(false); }}><span className="attention-number quiet">01</span><span><b>Pickup window to confirm</b><small>Northside family support</small></span><ArrowRight size={14} /></button>
                <div className="attention-foot"><span className="live-dot" /> Station sync complete <span>·</span> 4 min ago</div>
              </div>}

              <div className="people-card"><div className="people-art"><div className="people-orbit orbit-a" /><div className="people-orbit orbit-b" /><div className="people-center"><UsersRound size={22} /></div><span className="orbit-dot dot-a" /><span className="orbit-dot dot-b" /><span className="orbit-dot dot-c" /></div><div className="people-copy"><span className="section-kicker">GOOD WORK, TOGETHER</span><b>3 stations, one shared table.</b><span>East, Central and South are open and ready.</span></div><button className="people-link" onClick={() => setToast("Station directory is up to date")}>See station pulse <ArrowRight size={14} /></button></div>
            </aside>
          </div>
          <footer className="desk-footer"><span><Leaf size={13} /> W.O.W. · We All Stop Trashing Earth</span><span>Every handoff makes room for the next.</span><button onClick={() => setToast("Your operations view is current")}>Help & feedback <ArrowRight size={13} /></button></footer>
        </div>
      </section>
      {toast && <div className="toast-message"><Check size={15} />{toast}</div>}
    </main>
  );
}
