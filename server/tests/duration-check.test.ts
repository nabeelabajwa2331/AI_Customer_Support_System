import { describe, expect, it } from 'vitest';

import { buildDurationChecks } from '../src/ai/duration-check.js';

const POLICY =
  'Customers may request a refund within 14 calendar days of purchase. Approved refunds are processed within 5 business days.';

describe('buildDurationChecks', () => {
  it.each([
    ['Can I request a refund 10 days after purchase?', ['10 days is within 14 calendar days.']],
    ['I bought it 3 days ago. Can I get reimbursed?', ['3 days is within 14 calendar days.']],
    ['Can I get a refund 14 days after purchase?', ['14 days is within 14 calendar days.']],
    ['Can I get a refund 20 days after purchase?', ['20 days is more than 14 calendar days.']],
    ['I bought something two weeks ago.', ['two weeks is within 14 calendar days.']],
    ['I bought it 3 weeks ago.', ['3 weeks is more than 14 calendar days.']],
    ["It's been a month since my purchase.", ['a month is more than 14 calendar days.']],
  ])('%s', (question, expected) => {
    expect(buildDurationChecks(question, POLICY)).toEqual(expected);
  });

  it('compares business days only with business-day limits', () => {
    expect(buildDurationChecks('It has been 7 business days since approval.', POLICY)).toEqual([
      '7 business days is more than 5 business days.',
    ]);
  });

  it('skips a month when its length would change the result', () => {
    const policy = 'Returns are accepted within 30 days.';

    expect(buildDurationChecks('I bought it a month ago.', policy)).toEqual([]);
    expect(buildDurationChecks('I bought it 2 months ago.', policy)).toEqual([
      '2 months is more than 30 calendar days.',
    ]);
  });

  it('returns nothing without a duration in the question or a limit in the policy', () => {
    expect(buildDurationChecks('What is the refund window?', POLICY)).toEqual([]);
    expect(
      buildDurationChecks('Can I return it after 10 days?', 'Refunds require an order number.'),
    ).toEqual([]);
  });

  it('ignores unrelated numbers such as order numbers', () => {
    expect(buildDurationChecks('Can you process order 12345?', POLICY)).toEqual([]);
  });
});
