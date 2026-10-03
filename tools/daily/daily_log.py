#!/usr/bin/env python3
"""
daily_log.py — Con-Scire Daily Log Viewer

Usage:
  python daily_log.py --show               # show last 10 entries
  python daily_log.py --show --all         # show all entries
  python daily_log.py --show --n 20        # show last N entries
  python daily_log.py --patterns           # show alignment patterns
  python daily_log.py --aligned            # show aligned days (method_b == 6)
  python daily_log.py --triple             # show triple alignment days
  python daily_log.py --date 2026-10-15    # show one entry by date
"""

import json
import argparse
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
LOG_FILE   = SCRIPT_DIR / ".daily_log.json"

SM_NAMES = {
    1: "Knowledge",        2: "Wisdom",           3: "Understanding",
    4: "Cultured Freedom", 5: "Powered Refinement", 6: "Equality",
    7: "Consciousness",    8: "Build/Destroy",    9: "Birth"
}


def load_log() -> list:
    if not LOG_FILE.exists():
        return []
    with open(LOG_FILE) as f:
        return json.load(f)


def sm_name(n) -> str:
    if n is None:
        return "—"
    return SM_NAMES.get(int(n), str(n))


def format_entry(e: dict, verbose: bool = False) -> str:
    lines = []
    date   = e.get("date", "?")
    addr   = e.get("address", "?")
    p      = e.get("purpose")
    stage  = e.get("stage")
    moon   = e.get("moon", "—")
    domain = e.get("domain", "—")
    value  = e.get("value", "—")
    refl   = e.get("reflection")
    aligned = e.get("aligned", False)
    triple  = e.get("triple", False)

    flags = ""
    if triple:
        flags += " ◈"
    if aligned:
        flags += " ✦"

    lines.append(f"  {date} · {addr}{flags}")
    lines.append(f"    Purpose {p} {sm_name(p)} · Stage {stage}/16")
    lines.append(f"    Moon: {moon}")
    if verbose:
        att  = e.get("attention")
        inte = e.get("intention")
        mb   = e.get("method_b")
        conv = e.get("convergence")
        lines.append(f"    Attention {att} {sm_name(att)} · Intention {inte} {sm_name(inte)}")
        lines.append(f"    Method B {mb} {sm_name(mb)} · Convergence {conv} {sm_name(conv)}")
        lines.append(f"    Domain: {domain} · Value: {value}")
        ax_p = e.get("axiom_p")
        ax_s = e.get("axiom_signal")
        if ax_p is not None:
            lines.append(f"    AXIOM P{p}: {ax_p} {ax_s}")
    if refl:
        lines.append(f"    ✎ {refl}")

    return "\n".join(lines)


def cmd_show(entries: list, n: int, all_entries: bool) -> None:
    if not entries:
        print("  No log entries found. Run: python unified_daily.py --log")
        return
    subset = entries if all_entries else entries[:n]
    w = 60
    print("=" * w)
    print(f"  Daily Log · {len(subset)} of {len(entries)} entries")
    print("=" * w)
    for e in subset:
        print(format_entry(e, verbose=True))
        print()


def cmd_patterns(entries: list) -> None:
    if not entries:
        print("  No log entries.")
        return

    total = len(entries)
    aligned_days  = [e for e in entries if e.get("aligned")]
    triple_days   = [e for e in entries if e.get("triple")]
    has_refl      = [e for e in entries if e.get("reflection")]

    purpose_counts: dict = {}
    stage_counts: dict   = {}
    domain_counts: dict  = {}

    for e in entries:
        p = e.get("purpose")
        s = e.get("stage")
        d = e.get("domain")
        if p:
            purpose_counts[p] = purpose_counts.get(p, 0) + 1
        if s:
            stage_counts[s] = stage_counts.get(s, 0) + 1
        if d:
            domain_counts[d] = domain_counts.get(d, 0) + 1

    w = 60
    print("=" * w)
    print(f"  Log Patterns · {total} entries")
    print("=" * w)

    pct = lambda n: f"{n/total*100:.0f}%" if total else "—"

    print(f"\n  Aligned days (✦ Method B = 6): {len(aligned_days)} ({pct(len(aligned_days))})")
    for e in aligned_days[:5]:
        print(f"    {e['date']} · {e.get('address','?')}")

    print(f"\n  Triple alignment (◈): {len(triple_days)} ({pct(len(triple_days))})")
    for e in triple_days:
        print(f"    {e['date']} · P{e.get('purpose')} = Stage {e.get('stage')}")

    print(f"\n  Reflections logged: {len(has_refl)} ({pct(len(has_refl))})")

    print("\n  Purpose distribution:")
    for p in sorted(purpose_counts, key=lambda x: -purpose_counts[x]):
        cnt = purpose_counts[p]
        print(f"    P{p} {sm_name(p):<22} {cnt:>3}  {pct(cnt)}")

    print("\n  Stage distribution (top 5):")
    for s, cnt in sorted(stage_counts.items(), key=lambda x: -x[1])[:5]:
        print(f"    Stage {s:>2}/16  {cnt:>3}  {pct(cnt)}")

    print("\n  Domain distribution:")
    for d, cnt in sorted(domain_counts.items(), key=lambda x: -x[1]):
        print(f"    {d:<30} {cnt:>3}  {pct(cnt)}")

    print()


def cmd_aligned(entries: list) -> None:
    subset = [e for e in entries if e.get("aligned")]
    print(f"\n  ✦ Aligned Days (Method B = 6 / Equality) · {len(subset)} of {len(entries)}\n")
    for e in subset:
        print(format_entry(e))
    if not subset:
        print("  None logged yet.")
    print()


def cmd_triple(entries: list) -> None:
    subset = [e for e in entries if e.get("triple")]
    print(f"\n  ◈ Triple Alignment Days · {len(subset)} of {len(entries)}\n")
    for e in subset:
        print(format_entry(e))
    if not subset:
        print("  None logged yet.")
    print()


def cmd_date(entries: list, iso_date: str) -> None:
    for e in entries:
        if e.get("date") == iso_date:
            print()
            print(format_entry(e, verbose=True))
            print()
            return
    print(f"  No entry for {iso_date}.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Con-Scire Daily Log Viewer")
    parser.add_argument("--show",     action="store_true", help="Show recent entries")
    parser.add_argument("--all",      action="store_true", help="Show all entries (with --show)")
    parser.add_argument("--n",        type=int, default=10, help="Number of entries to show (default 10)")
    parser.add_argument("--patterns", action="store_true", help="Show distribution patterns")
    parser.add_argument("--aligned",  action="store_true", help="Show aligned days (Method B = 6)")
    parser.add_argument("--triple",   action="store_true", help="Show triple alignment days")
    parser.add_argument("--date",     metavar="YYYY-MM-DD", help="Show a specific date")
    args = parser.parse_args()

    entries = load_log()

    if args.date:
        cmd_date(entries, args.date)
    elif args.patterns:
        cmd_patterns(entries)
    elif args.aligned:
        cmd_aligned(entries)
    elif args.triple:
        cmd_triple(entries)
    else:
        cmd_show(entries, args.n, args.all)


if __name__ == "__main__":
    main()
