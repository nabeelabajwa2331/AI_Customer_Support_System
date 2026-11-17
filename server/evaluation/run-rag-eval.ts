// Runs the RAG evaluation dataset against a running API and grades each answer
// with the fixed rules in rag-eval-dataset.json.
//
// Usage (from server/):
//   npx tsx evaluation/run-rag-eval.ts <credentials-file> [label]
// The credentials file holds EVAL_EMAIL=... and EVAL_PASSWORD=... lines, so no
// password is ever passed on the command line.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const API_URL = process.env.EVAL_API_URL ?? 'http://localhost:5001/api';
const REQUEST_TIMEOUT_MS = 180_000;
const CONSISTENCY_RUNS = 3;
const DEFAULT_ALLOWED_NUMBERS = [14, 5];

const NOT_SPECIFIED_PHRASE = 'The available policy does not specify this.';
const NO_EVIDENCE_PREFIX = "I couldn't find enough relevant information";

const REFUSAL_MARKERS =
  /does not specify|doesn't specify|not specified|does not mention|doesn't mention|not mentioned|does not (say|state|cover|include)|doesn't (say|state|cover|include)|no information|couldn't find|could not find|cannot access|can't access|unable to|do not have access|don't have access|not able to|cannot (process|check|look)|can't (process|check|look)/i;

const LEAKAGE = [
  /\b(STATED|NOT SPECIFIED|NOT COVERED)\b/,
  /reference material/i,
  /untrusted/i,
  /these instructions/i,
  /system prompt/i,
  /customer question:/i,
  /\b[\w-]+\.(txt|md|pdf|docx)\b/i,
];

const CLAIMED_ACTION =
  /\b(I|we)('ve| have| will| can| am going to)( now)? (process|processed|approve|approved|initiate|initiated|issue|issued|look up|check|checked)\b/i;

interface Question {
  id: string;
  category: 'answerable' | 'paraphrase' | 'unanswerable' | 'ambiguous' | 'consistency';
  expect: 'answer' | 'refuse' | 'ambiguous';
  question: string;
  mustInclude?: string[];
  mustNotInclude?: string[];
  allowedNumbers?: number[];
  acceptNoEvidence?: boolean;
}

interface RunResult {
  status: number | 'TIMEOUT' | 'NETWORK_ERROR';
  latencyMs: number;
  answer: string;
  sourceCount: number;
  topSimilarity: number | null;
}

interface Graded extends RunResult {
  id: string;
  category: Question['category'];
  question: string;
  pass: boolean;
  failures: string[];
  flags: { leakage: boolean; contradiction: boolean; claimedAction: boolean; unsupportedNumber: boolean };
}

async function readCredentials(file: string): Promise<{ email: string; password: string }> {
  const lines = (await readFile(file, 'utf8')).split(/\r?\n/);
  const get = (key: string) =>
    lines.find((line) => line.startsWith(`${key}=`))?.slice(key.length + 1).trim();
  const email = get('EVAL_EMAIL');
  const password = get('EVAL_PASSWORD');

  if (!email || !password) {
    throw new Error('Credentials file must contain EVAL_EMAIL and EVAL_PASSWORD.');
  }

  return { email, password };
}

async function login(email: string, password: string): Promise<string> {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new Error(`Login failed with HTTP ${response.status}.`);
  }

  const body = (await response.json()) as { accessToken: string };
  return body.accessToken;
}

async function ask(token: string, question: string): Promise<RunResult> {
  const started = performance.now();

  try {
    const response = await fetch(`${API_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ question }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = (await response.json().catch(() => ({}))) as {
      answer?: string;
      message?: string;
      sources?: Array<{ similarity: number }>;
    };
    const sources = body.sources ?? [];

    return {
      status: response.status,
      latencyMs: Math.round(performance.now() - started),
      answer: body.answer ?? body.message ?? '',
      sourceCount: sources.length,
      topSimilarity: sources.length > 0 ? Math.max(...sources.map((s) => s.similarity)) : null,
    };
  } catch (error) {
    return {
      status: error instanceof Error && error.name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK_ERROR',
      latencyMs: Math.round(performance.now() - started),
      answer: '',
      sourceCount: 0,
      topSimilarity: null,
    };
  }
}

function numbersIn(text: string): number[] {
  // List markers such as "1." are formatting, not facts.
  const withoutListMarkers = text.replace(/^\s*\d+[.)]\s/gm, '');
  return (withoutListMarkers.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
}

function grade(q: Question, run: RunResult): Graded {
  const failures: string[] = [];
  const answer = run.answer;
  const isNotSpecified = answer.includes(NOT_SPECIFIED_PHRASE);
  const isNoEvidence = answer.startsWith(NO_EVIDENCE_PREFIX);
  const allowed = new Set([...(q.allowedNumbers ?? DEFAULT_ALLOWED_NUMBERS), ...numbersIn(q.question)]);

  const flags = {
    leakage: LEAKAGE.some((pattern) => pattern.test(answer)),
    contradiction: false,
    claimedAction: CLAIMED_ACTION.test(answer),
    unsupportedNumber: numbersIn(answer).some((n) => !allowed.has(n)),
  };

  if (run.status !== 200) failures.push(`HTTP ${run.status}`);
  if (flags.leakage) failures.push('prompt leakage');
  if (flags.claimedAction) failures.push('claims a customer action');
  if (flags.unsupportedNumber) failures.push('number not in the knowledge base');

  for (const pattern of q.mustNotInclude ?? []) {
    if (new RegExp(pattern, 'i').test(answer)) failures.push(`forbidden /${pattern}/`);
  }

  if (q.expect === 'answer') {
    const missing = (q.mustInclude ?? []).filter((p) => !new RegExp(p, 'i').test(answer));
    missing.forEach((p) => failures.push(`missing /${p}/`));

    if (isNoEvidence) failures.push('rejected by relevance gate');
    if (isNotSpecified) {
      failures.push('incorrect refusal');
      // Not-specified sentence alongside the expected facts = self-contradiction.
      if (missing.length === 0) flags.contradiction = true;
    }
    if (flags.contradiction) failures.push('contradiction');
  } else if (q.expect === 'refuse') {
    if (!isNoEvidence && !isNotSpecified && !REFUSAL_MARKERS.test(answer)) {
      failures.push('no refusal (possible hallucination)');
    }
    for (const p of q.mustInclude ?? []) {
      if (!new RegExp(p, 'i').test(answer)) failures.push(`missing /${p}/`);
    }
  } else {
    const clarifies = answer.includes('?');
    const statesFact = /\b14\b|order number|\b5\b business|five business/i.test(answer);

    if (isNoEvidence ? !q.acceptNoEvidence : !clarifies && !statesFact) {
      failures.push('neither clarifies nor states a documented fact');
    }
  }

  return { id: q.id, category: q.category, question: q.question, ...run, pass: failures.length === 0, failures, flags };
}

async function main() {
  const args = process.argv.slice(2);
  const regradeIndex = args.indexOf('--regrade');
  // --regrade <results-file> re-applies the current rules to saved answers
  // without calling the API.
  const regradeFile = regradeIndex >= 0 ? args.splice(regradeIndex, 2)[1] : undefined;
  // --only A05,P07 runs a subset for quick iteration; results are labelled partial.
  const onlyIndex = args.indexOf('--only');
  const only = onlyIndex >= 0 ? new Set(args.splice(onlyIndex, 2)[1]?.split(',')) : undefined;
  // In --regrade mode there is no credentials file, so the first argument is the label.
  const [credentialsFile, label = 'run'] = regradeFile ? [undefined, args[0]] : args;

  if (!credentialsFile && !regradeFile) {
    throw new Error('Usage: npx tsx evaluation/run-rag-eval.ts <credentials-file> [label] | --regrade <results-file> [label]');
  }

  const dataset = JSON.parse(
    await readFile(path.resolve('evaluation', 'rag-eval-dataset.json'), 'utf8'),
  ) as { questions: Question[] };

  if (only) {
    dataset.questions = dataset.questions.filter((q) => only.has(q.id));
  }

  const saved = regradeFile
    ? (JSON.parse(await readFile(regradeFile, 'utf8')) as {
        graded: Graded[];
        consistency: Array<{ id: string; runs: Graded[] }>;
      })
    : undefined;
  const savedRuns = (id: string): RunResult[] =>
    saved?.consistency.find((c) => c.id === id)?.runs ??
    saved?.graded.filter((g) => g.id === id) ??
    [];

  const { email, password } = saved
    ? { email: '', password: '' }
    : await readCredentials(credentialsFile!);
  let token = saved ? '' : await login(email, password);
  let tokenIssuedAt = Date.now();

  const graded: Graded[] = [];
  const consistency: Array<{ id: string; pass: boolean; identical: boolean; runs: Graded[] }> = [];

  for (const q of dataset.questions) {
    const runs = q.category === 'consistency' ? CONSISTENCY_RUNS : 1;
    const results: Graded[] = [];

    for (let i = 0; i < runs; i += 1) {
      // Access tokens are short-lived; re-login well before expiry.
      if (!saved && Date.now() - tokenIssuedAt > 10 * 60 * 1000) {
        token = await login(email, password);
        tokenIssuedAt = Date.now();
      }

      const run = saved ? savedRuns(q.id)[i] : await ask(token, q.question);
      if (!run) throw new Error(`No saved answer for ${q.id} run ${i + 1}.`);
      const result = grade(q, run);
      results.push(result);
      console.log(
        `${result.pass ? 'PASS' : 'FAIL'} ${q.id}${runs > 1 ? `#${i + 1}` : ''} ${result.latencyMs}ms sim=${result.topSimilarity?.toFixed(3) ?? '-'} ${result.failures.join('; ')}`,
      );
    }

    if (q.category === 'consistency') {
      const identical = results.every((r) => r.answer === results[0]!.answer);
      consistency.push({ id: q.id, pass: identical && results.every((r) => r.pass), identical, runs: results });
    }

    graded.push(results[0]!);
  }

  const categories = ['answerable', 'paraphrase', 'unanswerable', 'ambiguous'] as const;
  const summary: Record<string, string> = {};

  for (const category of categories) {
    const items = graded.filter((g) => g.category === category);
    summary[category] = `${items.filter((g) => g.pass).length}/${items.length}`;
  }

  summary.consistency = `${consistency.filter((c) => c.pass).length}/${consistency.length}`;
  const all = [...graded.filter((g) => g.category !== 'consistency'), ...consistency.flatMap((c) => c.runs)];
  summary.overallQuestions = `${graded.filter((g) => g.category !== 'consistency').filter((g) => g.pass).length + consistency.filter((c) => c.pass).length}/${graded.length}`;
  summary.http200 = `${all.filter((g) => g.status === 200).length}/${all.length}`;
  summary.leakage = String(all.filter((g) => g.flags.leakage).length);
  summary.contradictions = String(all.filter((g) => g.flags.contradiction).length);
  summary.claimedActions = String(all.filter((g) => g.flags.claimedAction).length);
  // Hallucination = answered an unanswerable question or stated an unsupported number.
  summary.hallucinations = String(
    all.filter(
      (g) =>
        g.flags.unsupportedNumber ||
        g.failures.some((f) => f.startsWith('no refusal') || f.startsWith('forbidden')),
    ).length,
  );
  const latencies = all.map((g) => g.latencyMs).sort((a, b) => a - b);
  summary.latencyMedianMs = String(latencies[Math.floor(latencies.length / 2)]);
  summary.latencyMaxMs = String(latencies.at(-1));

  console.log('\nSUMMARY', JSON.stringify(summary, null, 2));

  const outDir = path.resolve('evaluation', 'results');
  await mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${label}.json`);
  await writeFile(outFile, JSON.stringify({ label, summary, graded, consistency }, null, 2));
  console.log(`Results: ${outFile}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
