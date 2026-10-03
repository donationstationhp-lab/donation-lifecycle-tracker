#!/usr/bin/env python3
"""
unified_daily.py — Con-Scire Unified Daily Reading
Bridges Supreme Mathematics, Cognitive Functions, AXIOM, and Donation Lifecycle.

Usage:
  python unified_daily.py                    # print today's frame
  python unified_daily.py --log              # print + append to .daily_log.json
  python unified_daily.py --reflect "text"   # add reflection to today's log entry
  python unified_daily.py --date 2026-10-15  # read a specific date
"""

import json
import math
import argparse
from datetime import date, datetime
from pathlib import Path

try:
    from zoneinfo import ZoneInfo
except ImportError:
    try:
        from backports.zoneinfo import ZoneInfo
    except ImportError:
        ZoneInfo = None

SCRIPT_DIR = Path(__file__).parent
DATA_DIR   = SCRIPT_DIR / "data"
LOG_FILE   = SCRIPT_DIR / ".daily_log.json"

# Address week anchor: Sep 8, 2026 = start of week 1
# Verified against 5 data points: Sep 14 (wk1), Sep 21 (wk2), Sep 28 (wk3),
# Oct 2 (wk4), Oct 3 (wk4). Formula: (date - anchor).days // 7 + 1
WEEK_ANCHOR = date(2026, 9, 8)


def chicago_today() -> date:
    if ZoneInfo is not None:
        return datetime.now(ZoneInfo("America/Chicago")).date()
    # Fallback if zoneinfo unavailable: subtract 5 or 6 hours from UTC
    utc_now = datetime.utcnow()
    return (utc_now.replace(hour=utc_now.hour - 6 if utc_now.hour >= 6 else utc_now.hour + 18)).date()


def reduce_sm(n: int) -> int:
    """Reduce to 1–10. Stops at 10 (Knowledge-Cipher, integration) or single digit. 0→9."""
    while n > 10:
        n = sum(int(d) for d in str(n))
    return n if n > 0 else 9


SM_NAMES = {
    1: "Knowledge",        2: "Wisdom",           3: "Understanding",
    4: "Cultured Freedom", 5: "Powered Refinement", 6: "Equality",
    7: "Consciousness",    8: "Build/Destroy",    9: "Birth",
    10: "Knowledge-Cipher",
}

SM_ROOTS = {
    1: "*ǵneh₃- — to know",
    2: "*weid- — to see",
    3: "*steh₂- — to stand among",
    4: "*kʷel- — to turn, to till",
    5: "posse + finis — capacity at its limit",
    6: "aequus — level, even",
    7: "*gudą — that which is invoked",
    8: "*bʰuH- + *strew- — to make arise and scatter",
    9: "*bʰer- — to carry, bring forth",
    10: "*ǵneh₃- + ṣifr — knowing through the void; the arc complete",
}

SM_ACTIONS = {
    1: "Track the trail. Attend to what can be learned.",
    2: "See clearly. Apply what was seen before.",
    3: "Stand on the common ground beneath the two.",
    4: "Work the freedom. Till it; it is freedom only once made.",
    5: "Show the full capacity. Name what bounds it.",
    6: "Measure what is level. Redistribute what is not.",
    7: "Hold the whole. Coordinate, not effort.",
    8: "Build what endures. Release what obstructs.",
    9: "Carry what is new. Bring it across the threshold.",
    10: "Close the arc. Return what was known through Cipher to begin again.",
}


def get_sm_frame(d: date) -> dict:
    attention  = reduce_sm(d.month)
    intention  = reduce_sm(d.day)
    purpose    = reduce_sm(d.month + d.day)
    year_arc   = reduce_sm(sum(int(c) for c in str(d.year)))

    # Method B: digit sum of all digits in M/D/YYYY
    digit_str  = f"{d.month}{d.day}{d.year}"
    method_b   = reduce_sm(sum(int(c) for c in digit_str))

    # Convergence = reduce(2 × purpose − 1)
    # Verified: P1→1, P3→5, P4→7, P5→9 against known readings
    convergence = reduce_sm(2 * purpose - 1)

    # Self-determination stage: day_of_year mod 16, 0 maps to 16
    doy   = d.timetuple().tm_yday
    stage = doy % 16 or 16

    # Address week from anchor Sep 8, 2026
    week_num = (d - WEEK_ANCHOR).days // 7 + 1

    # Address: YearArc · Attention · WeekNum · Intention
    # Verified against Sep14(1·9·1·5), Sep21(1·9·2·3), Sep28(1·9·3·1),
    # Oct2(1·1·4·2), Oct3(1·1·4·3)
    address = f"{year_arc}·{attention}·{week_num}·{intention}"

    # Day–Year Synthesis: Purpose + Year Arc
    day_year = reduce_sm(purpose + year_arc)

    return {
        "date":        d.isoformat(),
        "attention":   attention,
        "intention":   intention,
        "purpose":     purpose,
        "purpose_sum": d.month + d.day,
        "method_b":    method_b,
        "convergence": convergence,
        "year_arc":    year_arc,
        "day_year":    day_year,
        "stage":       stage,
        "week_num":    week_num,
        "address":     address,
    }


def moon_phase(d: date) -> dict:
    """Approximate lunar phase. Reference new moon: 2000-01-06."""
    reference = date(2000, 1, 6)
    days_since = (d - reference).days
    cycle = 29.53058867
    phase_day = days_since % cycle
    illumination = round((1 - math.cos(2 * math.pi * phase_day / cycle)) / 2 * 100, 1)

    if phase_day < 1.85:
        name, emoji = "New Moon",        "🌑"
    elif phase_day < 7.38:
        name, emoji = "Waxing Crescent", "🌒"
    elif phase_day < 9.22:
        name, emoji = "First Quarter",   "🌓"
    elif phase_day < 14.77:
        name, emoji = "Waxing Gibbous",  "🌔"
    elif phase_day < 16.61:
        name, emoji = "Full Moon",       "🌕"
    elif phase_day < 22.15:
        name, emoji = "Waning Gibbous",  "🌖"
    elif phase_day < 23.99:
        name, emoji = "Third Quarter",   "🌗"
    else:
        name, emoji = "Waning Crescent", "🌘"

    return {"name": name, "emoji": emoji, "illumination": illumination}


def get_doctrinal_frame(d: date) -> dict:
    """Doctrinal 13-moon / 28-day frame. Anchor: March 1 (original Roman new year).
    March names the first moon; October = 8th moon (octo), as the name still carries.
    Days 365-366 fall outside the 13-moon cycle (intercalary)."""
    anchor_year = d.year if d.month >= 3 else d.year - 1
    anchor = date(anchor_year, 3, 1)
    day_num = (d - anchor).days + 1  # 1-indexed from March 1

    if day_num > 364:
        return {
            "moon": None, "day": None,
            "intercalary": day_num - 364,
            "day_num": day_num,
            "attention": None, "intention": None, "purpose": None,
        }

    moon       = (day_num - 1) // 28 + 1   # 1–13
    day_in_moon = (day_num - 1) % 28 + 1   # 1–28

    return {
        "moon":        moon,
        "day":         day_in_moon,
        "intercalary": 0,
        "day_num":     day_num,
        "attention":   reduce_sm(moon),
        "intention":   reduce_sm(day_in_moon),
        "purpose":     reduce_sm(moon + day_in_moon),
    }


def load_json(path: Path) -> dict:
    if path.exists():
        with open(path) as f:
            return json.load(f)
    return {}


def load_bridge() -> dict:
    data = load_json(DATA_DIR / "cf_bridge.json")
    return data.get("positions", {})


def load_stages() -> dict:
    data = load_json(DATA_DIR / "stages.json")
    return data.get("stages", {})


def load_axiom() -> dict:
    return load_json(DATA_DIR / "axiom.json")


def load_log() -> list:
    if LOG_FILE.exists():
        with open(LOG_FILE) as f:
            return json.load(f)
    return []


def save_log(entries: list) -> None:
    with open(LOG_FILE, "w") as f:
        json.dump(entries, f, indent=2)


def find_log_entry(entries: list, iso_date: str) -> int:
    """Return index of entry for iso_date, or -1."""
    for i, e in enumerate(entries):
        if e.get("date") == iso_date:
            return i
    return -1


def sm_label(n) -> str:
    """Format an SM position number with its name (handles 10)."""
    if n is None:
        return "—"
    return f"{n} — {SM_NAMES.get(n, str(n))}"


def format_reading(d: date) -> tuple[str, dict]:
    """Return (display_string, log_record)."""
    frame   = get_sm_frame(d)
    doc     = get_doctrinal_frame(d)
    moon    = moon_phase(d)
    bridge  = load_bridge()
    stages  = load_stages()
    axiom   = load_axiom()

    p       = frame["purpose"]
    p_key   = str(p)
    bf      = bridge.get(p_key, {})
    stage_d = stages.get(str(frame["stage"]), {})
    axiom_p = axiom.get("positions", {}).get(p_key, {})

    # Donation lifecycle: which stages are active today
    lifecycle_map = axiom.get("lifecycle_map", {})
    active_stages = [stage for stage, positions in lifecycle_map.items()
                     if p_key in positions]

    lines = []
    w = 60

    lines.append("=" * w)
    lines.append(f"  {d.strftime('%B %-d, %Y')} — Unified Daily Reading")
    lines.append("=" * w)

    # Primary frame
    lines.append("\n── Fraction Calendar · Primary Frame ──")
    lines.append(f"  Attention ({d.strftime('%B')} = {d.month})")
    lines.append(f"    {frame['attention']} — {SM_NAMES[frame['attention']]} · {SM_ROOTS[frame['attention']]}")
    lines.append(f"    › {SM_ACTIONS[frame['attention']]}")
    lines.append(f"  Intention (day {d.day})")
    lines.append(f"    {frame['intention']} — {SM_NAMES[frame['intention']]} · {SM_ROOTS[frame['intention']]}")
    lines.append(f"    › {SM_ACTIONS[frame['intention']]}")

    compound_str = f"{d.month} + {d.day} = {frame['purpose_sum']}"
    label = f"{p} — {SM_NAMES[p]}"
    if frame["purpose_sum"] >= 10:
        label += f" [compound: {frame['purpose_sum']} → {p}]"
    lines.append(f"  Purpose ({compound_str})  ← governing")
    lines.append(f"    {label} · {SM_ROOTS[p]}")
    lines.append(f"    › {SM_ACTIONS[p]}")

    # Secondary lens
    lines.append("\n── Secondary Lens · Three Paths ──")
    lines.append(f"  Method B (digit concat): {frame['method_b']} — {SM_NAMES[frame['method_b']]}")
    lines.append(f"  Numeric sum ({d.month}+{d.day}+{d.year}={d.month+d.day+d.year}): {frame['method_b']} — {SM_NAMES[frame['method_b']]}")
    lines.append(f"  Day–Year Synthesis (P{p}+Arc{frame['year_arc']}={p+frame['year_arc']}): {frame['day_year']} — {SM_NAMES[frame['day_year']]}")
    lines.append(f"  Convergence: {frame['convergence']} — {SM_NAMES[frame['convergence']]}")
    lines.append(f"  Address: {frame['address']}")

    # Moon
    lines.append(f"\n── 🌙 Moon ──")
    lines.append(f"  {moon['emoji']} {moon['name']} ({moon['illumination']}% illuminated)")
    lines.append("  outer/astronomical synodic calc (29.53-day cycle)")

    # Doctrinal frame
    lines.append(f"\n── Doctrinal Frame · March 1 Anchor · 13-Moon / 28-Day ──")
    if doc["intercalary"]:
        lines.append(f"  Intercalary Day {doc['intercalary']} — outside the 13-moon cycle")
    else:
        dp  = doc["purpose"]
        lines.append(f"  Moon {doc['moon']} · Day {doc['day']}  (day {doc['day_num']} from March 1)")
        lines.append(f"  Attention {sm_label(doc['attention'])}")
        lines.append(f"  Intention {sm_label(doc['intention'])}")
        lines.append(f"  Purpose   {sm_label(dp)}")
        # Cross-frame alignment check
        if dp == p:
            lines.append(f"  ◇ Purpose aligns across both frames — {SM_NAMES[p]}")
        if doc["intention"] == frame["intention"]:
            lines.append(f"  ◇ Intention aligns across both frames — {SM_NAMES[frame['intention']]}")

    # Year arc
    yr = frame['year_arc']
    lines.append(f"\n── Year Arc · {d.year} ──")
    lines.append(f"  {yr} — {SM_NAMES[yr]} · {SM_ROOTS[yr]}")

    # Cognitive bridge
    lines.append(f"\n── Cognitive Bridge · Purpose {p} — {SM_NAMES[p]} ──")
    if bf:
        funcs = bf.get("functions", [])
        if funcs:
            lines.append("  Process Functions Activated:")
            for fn in funcs:
                lines.append(f"    · {fn}")
        domain = bf.get("domain", "—")
        value  = bf.get("value", "—")
        lines.append(f"  Domain: {domain}")
        lines.append(f"  Value:  {value}")

    # Self-determination stage
    lines.append(f"\n── Self-Determination Stage {frame['stage']}/16 ──")
    if stage_d and stage_d.get("name") != "TODO":
        lines.append(f"  {stage_d['name']} · {stage_d['root']}")
        lines.append(f"  › {stage_d['prompt']}")
    else:
        lines.append(f"  Stage {frame['stage']} — not yet documented (see data/stages.json)")

    # AXIOM
    lines.append(f"\n── AXIOM · Donation Station HP ──")
    agg = axiom.get("aggregate")
    agg_lvl = axiom.get("aggregate_level", "")
    agg_sig = axiom.get("aggregate_signal", "")
    lines.append(f"  Aggregate: {agg} {agg_lvl} {agg_sig}")
    if axiom_p and axiom_p.get("score") is not None:
        lines.append(f"  P{p} {SM_NAMES[p]}: {axiom_p['score']} {axiom_p['level']} {axiom_p['signal']}")
    else:
        lines.append(f"  P{p} {SM_NAMES[p]}: not yet assessed")
    theme = axiom.get("theme", "")
    if theme:
        lines.append(f"  Theme: {theme}")

    # Lifecycle
    if active_stages:
        lines.append(f"\n── Donation Lifecycle · Active Today ──")
        for stage_name in active_stages:
            lines.append(f"  {stage_name}")

    # Planner
    lines.append("\n── Planner (Inked Commitments) ──")
    lines.append("  [ ] 1 clear priority for the day")
    lines.append("  [ ] 1 call or message to return")
    lines.append("  [ ] 1 system clean-up or put-away")

    # Triple alignment check
    if p == frame["stage"]:
        lines.append(f"\n  ◈ TRIPLE ALIGNMENT — Purpose {p} · Stage {frame['stage']} · AXIOM P{p}")
    if frame["method_b"] == 6:
        lines.append("  ✦ ALIGNED DAY — Method B converges to 6 (Equality)")

    lines.append("\n" + "=" * w)

    display = "\n".join(lines)

    # Log record (structured, for .daily_log.json)
    record = {
        "date":        d.isoformat(),
        "attention":   frame["attention"],
        "intention":   frame["intention"],
        "purpose":     frame["purpose"],
        "method_b":    frame["method_b"],
        "day_year":    frame["day_year"],
        "convergence": frame["convergence"],
        "address":     frame["address"],
        "stage":       frame["stage"],
        "moon":        f"{moon['emoji']} {moon['name']} ({moon['illumination']}%)",
        "doc_moon":    doc["moon"],
        "doc_day":     doc["day"],
        "doc_purpose": doc["purpose"],
        "doc_aligns":  doc["purpose"] == p if doc["purpose"] else False,
        "domain":      bf.get("domain") if bf else None,
        "value":       bf.get("value") if bf else None,
        "axiom_p":     axiom_p.get("score") if axiom_p else None,
        "axiom_signal": axiom_p.get("signal") if axiom_p else None,
        "aligned":     frame["method_b"] == 6,
        "triple":      p == frame["stage"],
        "reflection":  None,
    }

    return display, record


def cmd_today(args) -> None:
    d = date.fromisoformat(args.date) if args.date else chicago_today()
    display, record = format_reading(d)
    print(display)

    if args.log or args.reflect:
        entries = load_log()
        idx = find_log_entry(entries, record["date"])
        if args.reflect:
            record["reflection"] = args.reflect
        if idx >= 0:
            # Merge: keep existing reflection if not overwriting
            existing = entries[idx]
            if args.reflect:
                existing["reflection"] = args.reflect
            else:
                entries[idx] = {**record, "reflection": existing.get("reflection")}
        else:
            entries.insert(0, record)
        save_log(entries)
        action = "logged"
        if args.reflect:
            action = "logged with reflection"
        print(f"\n  [{action} → {LOG_FILE.name}]")


def main() -> None:
    parser = argparse.ArgumentParser(description="Con-Scire Unified Daily Reading")
    parser.add_argument("--date",    help="ISO date to read (default: today Chicago time)")
    parser.add_argument("--log",     action="store_true", help="Append to .daily_log.json")
    parser.add_argument("--reflect", metavar="TEXT", help="Add reflection and log")
    args = parser.parse_args()
    cmd_today(args)


if __name__ == "__main__":
    main()
