/** Calendar calculations use UTC dates, independent of server timezone and DST. */
export function digitalRoot(n: number): number {
  if (!Number.isSafeInteger(n) || n < 1) {
    throw new RangeError("digitalRoot requires a positive safe integer");
  }
  while (n > 9) {
    n = String(n).split("").reduce((sum, digit) => sum + Number(digit), 0);
  }
  return n;
}

function assertValidDate(date: Date): void {
  if (!Number.isFinite(date.getTime())) throw new RangeError("Invalid date");
}

export function fractionCalendar(date: Date): {
  attention: number;
  intention: number;
  purpose: number;
} {
  assertValidDate(date);
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  return {
    attention: digitalRoot(month),
    intention: digitalRoot(day),
    purpose: digitalRoot(month + day),
  };
}

export function stageForDate(date: Date): number {
  assertValidDate(date);
  const midnight = new Date(date);
  midnight.setUTCHours(0, 0, 0, 0);
  const yearStart = new Date(midnight);
  yearStart.setUTCMonth(0, 1);
  const dayOfYear = Math.round((midnight.getTime() - yearStart.getTime()) / 86_400_000) + 1;
  return ((dayOfYear - 1) % 16) + 1;
}

export const STAGE_NAMES: Record<number, { name: string; etymology: string }> = {
  1: { name: "Genesis", etymology: "beginning" },
  2: { name: "Impulse", etymology: "to drive forward" },
  3: { name: "Relation", etymology: "to carry back" },
  4: { name: "Stability", etymology: "to stand firm" },
  5: { name: "Inquiry", etymology: "to seek within" },
  6: { name: "Threshold", etymology: "to cross over" },
  7: { name: "Integration", etymology: "to make whole" },
  8: { name: "Pattern", etymology: "to spread out" },
  9: { name: "Recursion", etymology: "to run back" },
  10: { name: "Crystallization", etymology: "to become clear" },
  11: { name: "Tension", etymology: "to stretch" },
  12: { name: "Transmission", etymology: "to send across" },
  13: { name: "Dissolution", etymology: "to loosen apart" },
  14: { name: "Preparation", etymology: "to make ready beforehand" },
  15: { name: "Emergence", etymology: "to rise out" },
  16: { name: "Completion", etymology: "to fill completely" },
};

export const PURPOSE_NAMES: Record<number, string> = {
  1: "Knowledge", 2: "Wisdom", 3: "Understanding",
  4: "Culture/Freedom", 5: "Power/Refinement", 6: "Equality",
  7: "God", 8: "Build/Destroy", 9: "Born",
};

export const STAGE_TO_POSITIONS: Record<string, number[]> = {
  intake: [1, 9],
  qc: [2, 8],
  storage: [4, 3],
  matched: [5],
  scheduled: [6, 7],
  distributed: [6, 7],
  closed: [9],
};

export function isAligned(date: Date): boolean {
  const { attention, intention, purpose } = fractionCalendar(date);
  return digitalRoot(attention + intention + purpose) === 6;
}

export interface WhenWindow {
  date: string;
  purposePosition: number;
  purposeName: string;
  stage: number;
  stageName: string;
  stageEtymology: string;
  aligned: boolean;
  convergence: number;
}

export function whenWindows(
  lifecycleStage: string,
  startDate: Date,
  nDays: number,
): WhenWindow[] {
  if (!Object.hasOwn(STAGE_TO_POSITIONS, lifecycleStage)) return [];
  assertValidDate(startDate);
  if (!Number.isSafeInteger(nDays) || nDays < 0) {
    throw new RangeError("nDays must be a nonnegative safe integer");
  }
  const positions = STAGE_TO_POSITIONS[lifecycleStage];
  const date = new Date(startDate);
  date.setUTCHours(0, 0, 0, 0);
  const windows: WhenWindow[] = [];
  for (let i = 0; i < nDays; i++, date.setUTCDate(date.getUTCDate() + 1)) {
    const { attention, intention, purpose } = fractionCalendar(date);
    if (!positions.includes(purpose)) continue;
    const stage = stageForDate(date);
    const convergence = digitalRoot(attention + intention + purpose);
    windows.push({
      date: date.toISOString().slice(0, 10),
      purposePosition: purpose,
      purposeName: PURPOSE_NAMES[purpose],
      stage,
      stageName: STAGE_NAMES[stage].name,
      stageEtymology: STAGE_NAMES[stage].etymology,
      aligned: convergence === 6,
      convergence,
    });
  }
  return windows;
}

export function whenAllStages(startDate: Date, nDays: number): Record<string, WhenWindow[]> {
  return Object.fromEntries(
    Object.keys(STAGE_TO_POSITIONS).map((stage) => [stage, whenWindows(stage, startDate, nDays)]),
  );
}