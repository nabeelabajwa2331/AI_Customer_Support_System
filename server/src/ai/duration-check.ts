// Small models compare numbers unreliably (qwen2.5:3b answered that 10 days is
// outside a 14-day window). This module does the arithmetic in code and states
// the result as a plain fact. It never decides eligibility: whether the
// comparison is relevant is still up to the model and the policy text.

type DayUnit = 'calendar' | 'business';

interface Duration {
  text: string;
  minDays: number;
  maxDays: number;
  unit: DayUnit;
}

interface Limit {
  text: string;
  days: number;
  unit: DayUnit;
}

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  fourteen: 14,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
};

const UNIT_DAYS: Record<string, [number, number]> = {
  day: [1, 1],
  week: [7, 7],
  month: [28, 31],
  year: [365, 366],
};

const QUESTION_DURATION =
  /\b(\d{1,4}|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fourteen|fifteen|twenty|thirty)\s+(business\s+|working\s+|calendar\s+)?(day|week|month|year)s?\b/gi;

// Only explicit "within N [calendar|business] days" limits are used.
const POLICY_LIMIT = /\bwithin\s+(\d{1,4})\s+(calendar\s+|business\s+|working\s+)?days?\b/gi;

function toUnit(qualifier: string | undefined): DayUnit {
  return qualifier && /business|working/i.test(qualifier) ? 'business' : 'calendar';
}

function parseQuestionDurations(question: string): Duration[] {
  return [...question.matchAll(QUESTION_DURATION)].flatMap((match) => {
    const [text, rawCount, qualifier, rawUnit] = match;
    const count = /^\d+$/.test(rawCount!)
      ? Number(rawCount)
      : NUMBER_WORDS[rawCount!.toLowerCase()];
    const unitDays = UNIT_DAYS[rawUnit!.toLowerCase()];

    if (count === undefined || unitDays === undefined) return [];

    const unit = toUnit(qualifier);
    // Business days only make sense counted as days.
    if (unit === 'business' && rawUnit!.toLowerCase() !== 'day') return [];

    return [
      { text: text.trim(), minDays: count * unitDays[0], maxDays: count * unitDays[1], unit },
    ];
  });
}

function parsePolicyLimits(evidence: string): Limit[] {
  const seen = new Set<string>();

  return [...evidence.matchAll(POLICY_LIMIT)].flatMap((match) => {
    const days = Number(match[1]);
    const unit = toUnit(match[2]);
    const key = `${days}:${unit}`;

    if (seen.has(key)) return [];
    seen.add(key);

    return [{ text: `${days} ${unit === 'business' ? 'business' : 'calendar'} days`, days, unit }];
  });
}

/**
 * Returns plain-language comparisons between durations in the question and
 * "within N days" limits in the evidence, e.g. "10 days is within 14 calendar
 * days." Pairs with different day units, or where a month's length would change
 * the result, are skipped rather than guessed.
 */
export function buildDurationChecks(question: string, evidence: string): string[] {
  const durations = parseQuestionDurations(question);
  const limits = parsePolicyLimits(evidence);
  const checks: string[] = [];

  for (const duration of durations) {
    for (const limit of limits) {
      if (duration.unit !== limit.unit) continue;

      if (duration.maxDays <= limit.days) {
        checks.push(`${duration.text} is within ${limit.text}.`);
      } else if (duration.minDays > limit.days) {
        checks.push(`${duration.text} is more than ${limit.text}.`);
      }
    }
  }

  return checks;
}
