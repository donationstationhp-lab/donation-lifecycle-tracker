#!/usr/bin/env python3
"""
look_ahead.py — Con-Scire Forward Planning View

Usage:
  python look_ahead.py                # next 7 days
  python look_ahead.py --days 14      # next N days
  python look_ahead.py --date 2026-11-01 --days 7   # starting from date
  python look_ahead.py --aligned      # next aligned day (Method B = 6)
  python look_ahead.py --month 11     # full month view (current year)
"""

import argparse
from datetime import date, timedelta
from pathlib import Path

try:
    from zoneinfo import ZoneInfo
except ImportError:
    try:
        from backports.zoneinfo import ZoneInfo
    except ImportError:
        ZoneInfo = None

# Import from unified_daily — same directory
import sys
sys.path.insert(0, str(Path(__file__).parent))
from unified_daily import (
    chicago_today, get_sm_frame, moon_phase, SM_NAMES, WEEK_ANCHOR
)


def sm_name(n: int) -> str:
    return SM_NAMES.get(n, str(n))


def format_row(d: date, frame: dict, moon: dict, mark_today: bool = False) -> str:
    p     = frame["purpose"]
    stage = frame["stage"]
    mb    = frame["method_b"]
    addr  = frame["address"]

    flags = ""
    if frame["triple"]:
        flags += " ◈"
    if frame["aligned"]:
        flags += " ✦"

    today_mark = " ← today" if mark_today else ""

    row = (
        f"  {d.isoformat()}  {addr:<12} "
        f"P{p} {sm_name(p):<22} "
        f"St{stage:>2}  "
        f"B{mb}  "
        f"{moon['emoji']}{flags}{today_mark}"
    )
    return row


def get_frame_with_flags(d: date) -> dict:
    frame = get_sm_frame(d)
    frame["aligned"] = frame["method_b"] == 6
    frame["triple"]  = frame["purpose"] == frame["stage"]
    return frame


def cmd_ahead(start: date, days: int) -> None:
    today = chicago_today()
    w = 60
    print("=" * w)
    print(f"  Look Ahead · {start.isoformat()} + {days} days")
    print("=" * w)
    print(f"  {'Date':<12}  {'Address':<12} {'Purpose':<26} {'Stg':>3}  {'B':>2}  Moon")
    print("  " + "-" * (w - 2))

    aligned_found = []
    triple_found  = []

    for i in range(days):
        d     = start + timedelta(days=i)
        frame = get_frame_with_flags(d)
        moon  = moon_phase(d)
        mark  = d == today
        print(format_row(d, frame, moon, mark_today=mark))
        if frame["aligned"]:
            aligned_found.append(d)
        if frame["triple"]:
            triple_found.append(d)

    print()
    if aligned_found:
        print(f"  ✦ Aligned days in window: {len(aligned_found)}")
        for d in aligned_found:
            print(f"    {d.isoformat()}")
    if triple_found:
        print(f"  ◈ Triple alignment in window: {len(triple_found)}")
        for d in triple_found:
            f = get_frame_with_flags(d)
            print(f"    {d.isoformat()} · P{f['purpose']} = Stage {f['stage']}")
    print()


def cmd_next_aligned(start: date, limit: int = 60) -> None:
    print(f"\n  ✦ Next aligned day (Method B = 6) after {start.isoformat()}:\n")
    for i in range(1, limit + 1):
        d     = start + timedelta(days=i)
        frame = get_frame_with_flags(d)
        if frame["aligned"]:
            moon = moon_phase(d)
            print(format_row(d, frame, moon))
            print()
            return
    print(f"  None found in next {limit} days.")
    print()


def cmd_month(year: int, month: int) -> None:
    import calendar
    days_in_month = calendar.monthrange(year, month)[1]
    start = date(year, month, 1)
    end   = date(year, month, days_in_month)
    today = chicago_today()

    w = 60
    print("=" * w)
    print(f"  {start.strftime('%B %Y')} · Monthly View")
    print("=" * w)
    print(f"  {'Date':<12}  {'Address':<12} {'Purpose':<26} {'Stg':>3}  {'B':>2}  Moon")
    print("  " + "-" * (w - 2))

    aligned_count = 0
    triple_count  = 0

    for i in range(days_in_month):
        d     = start + timedelta(days=i)
        frame = get_frame_with_flags(d)
        moon  = moon_phase(d)
        mark  = d == today
        print(format_row(d, frame, moon, mark_today=mark))
        if frame["aligned"]:
            aligned_count += 1
        if frame["triple"]:
            triple_count += 1

    print()
    print(f"  ✦ Aligned days: {aligned_count}   ◈ Triple alignment: {triple_count}")
    print()


def main() -> None:
    parser = argparse.ArgumentParser(description="Con-Scire Look Ahead")
    parser.add_argument("--days",    type=int, default=7, help="Number of days to show (default 7)")
    parser.add_argument("--date",    help="Start date ISO (default: today Chicago time)")
    parser.add_argument("--aligned", action="store_true", help="Show next aligned day only")
    parser.add_argument("--month",   type=int, metavar="MM", help="Show full month view (current year)")
    parser.add_argument("--year",    type=int, help="Year for --month (default: current year)")
    args = parser.parse_args()

    today = chicago_today()
    start = date.fromisoformat(args.date) if args.date else today

    if args.month:
        year = args.year or today.year
        cmd_month(year, args.month)
    elif args.aligned:
        cmd_next_aligned(start)
    else:
        cmd_ahead(start, args.days)


if __name__ == "__main__":
    main()
