import '../styles/landing.css';

import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Bot,
  ChevronDown,
  CloudUpload,
  Cpu,
  FileText,
  Gauge,
  KeyRound,
  Layers,
  Lock,
  MessageSquareText,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
  UserCog,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext';
import {
  useCountUp,
  useElementScrollProgress,
  useInView,
  usePageScrollProgress,
  useRevealOnScroll,
} from '../hooks/useReveal';
import { homePathFor } from '../lib/routes';
import { useTheme } from '../theme/ThemeContext';

/* ---------- Hero chat demo (an illustration, labelled as an example) ---------- */

const DEMO = [
  {
    question: 'How long do I have to request a refund?',
    answer: 'You can request a refund within 14 calendar days of purchase. Please include your order number.',
    source: 'refund-policy.pdf',
  },
  {
    question: 'Can you process my refund right now?',
    answer: "I'm not able to do that — I can't access orders. Approved refunds are processed within 5 business days.",
    source: 'refund-policy.pdf',
  },
  {
    question: 'Do you price match competitors?',
    answer: "The available policy doesn't cover price matching, so I won't guess. Please contact support.",
    source: null,
  },
];

function useTypewriter(text: string, active: boolean, speed = 18) {
  const [shown, setShown] = useState('');
  useEffect(() => {
    if (!active) {
      setShown('');
      return;
    }
    let i = 0;
    const timer = window.setInterval(() => {
      i += 1;
      setShown(text.slice(0, i));
      if (i >= text.length) window.clearInterval(timer);
    }, speed);
    return () => window.clearInterval(timer);
  }, [text, active, speed]);
  return shown;
}

function HeroChat() {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<'ask' | 'think' | 'answer'>('ask');
  const item = DEMO[index]!;
  const typed = useTypewriter(item.answer, phase === 'answer');
  const done = phase === 'answer' && typed.length === item.answer.length;

  useEffect(() => {
    const delays = { ask: 900, think: 1300, answer: 0 } as const;
    if (phase !== 'answer') {
      const t = window.setTimeout(() => setPhase(phase === 'ask' ? 'think' : 'answer'), delays[phase]);
      return () => window.clearTimeout(t);
    }
    if (done) {
      const t = window.setTimeout(() => {
        setIndex((i) => (i + 1) % DEMO.length);
        setPhase('ask');
      }, 3200);
      return () => window.clearTimeout(t);
    }
  }, [phase, done]);

  return (
    <div className="demo-window" aria-label="Example conversation" role="img">
      <div className="demo-bar">
        <span />
        <span />
        <span />
        <strong>AI Assistant</strong>
        <em>Example</em>
      </div>
      <div className="demo-body" key={index}>
        <div className="demo-msg demo-user">{item.question}</div>
        {phase === 'think' ? (
          <div className="demo-msg demo-bot">
            <span className="demo-typing">
              <i />
              <i />
              <i />
            </span>
          </div>
        ) : null}
        {phase === 'answer' ? (
          <div className="demo-msg demo-bot">
            <span className="demo-avatar">
              <Bot size={13} />
            </span>
            <div>
              <p>
                {typed}
                {!done ? <span className="demo-caret" /> : null}
              </p>
              {done ? (
                <span className={`demo-source ${item.source ? '' : 'none'}`}>
                  {item.source ? (
                    <>
                      <FileText size={11} /> {item.source}
                    </>
                  ) : (
                    'No matching source — not guessed'
                  )}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
      <div className="demo-input">
        <span>Ask about orders, refunds or policies…</span>
        <span className="demo-send">
          <ArrowRight size={14} />
        </span>
      </div>
    </div>
  );
}

/* ---------- Sections ---------- */

const FEATURES: Array<{ icon: LucideIcon; title: string; text: string }> = [
  {
    icon: ShieldCheck,
    title: 'Grounded answers',
    text: 'Every reply is built only from passages in your own documents — never from general web knowledge.',
  },
  {
    icon: FileText,
    title: 'Sources on every answer',
    text: 'Customers and agents see which document an answer came from, so it can always be checked.',
  },
  {
    icon: BadgeCheck,
    title: 'Honest when unsure',
    text: "When the documents don't cover a question, the assistant says so instead of inventing a policy.",
  },
  {
    icon: BookOpen,
    title: 'Knowledge base you control',
    text: 'Upload PDF, Word, Markdown or text. Duplicates are detected and documents can be removed any time.',
  },
  {
    icon: UserCog,
    title: 'Roles built in',
    text: 'Customers chat, agents see analytics and the knowledge base, admins also manage content and users.',
  },
  {
    icon: Cpu,
    title: 'Choose where the AI runs',
    text: 'Use hosted models (Groq for answers, Google Gemini for search), or run open models on your own server with Ollama.',
  },
];

const STEPS: Array<{ icon: LucideIcon; title: string; text: string }> = [
  { icon: CloudUpload, title: 'Upload', text: 'Add your policies, FAQs and guides. Text is extracted and split into passages.' },
  { icon: Layers, title: 'Index', text: 'Each passage is turned into a 768-dimension embedding and stored with pgvector.' },
  { icon: MessageSquareText, title: 'Answer', text: 'Questions retrieve the closest passages, and the model answers only from them.' },
];

const SECURITY = [
  { icon: KeyRound, text: 'Short-lived access tokens with rotating, server-revocable refresh tokens' },
  { icon: Lock, text: 'Passwords stored only as bcrypt hashes; reused tokens revoke every session' },
  { icon: Gauge, text: 'Per-user rate limits on the AI and upload endpoints' },
  { icon: ShieldCheck, text: 'Raw document text is visible to staff only; customers see answers and sources' },
];

const FAQ = [
  {
    q: 'What happens when the documents don’t answer a question?',
    a: 'The assistant says the policy does not cover it and suggests contacting support. It is instructed never to fill gaps with typical store policies or guesses.',
  },
  {
    q: 'Can the assistant process refunds or look up orders?',
    a: 'No. It has no access to orders or accounts, and it tells customers so instead of pretending.',
  },
  {
    q: 'Which file types can I upload?',
    a: 'PDF, DOCX, TXT and Markdown, up to 10 MB each. Uploading the same file twice is detected and rejected.',
  },
  {
    q: 'Where does the AI run?',
    a: 'On this site, Groq (Llama 3.1) writes the answers and Google Gemini powers document search, so questions and the relevant document passages are sent to those services — see the Privacy Policy. The same app can instead run entirely on your own server with open models served by Ollama.',
  },
];

function Metric({ value, suffix, label, active }: { value: number; suffix?: string; label: string; active: boolean }) {
  const shown = useCountUp(value, active);
  return (
    <div className="metric" data-reveal>
      <strong>
        {shown}
        {suffix}
      </strong>
      <span>{label}</span>
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`faq-item ${open ? 'is-open' : ''}`} data-reveal>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>{q}</span>
        <ChevronDown size={18} aria-hidden="true" />
      </button>
      <div className="faq-answer" role="region">
        <p>{a}</p>
      </div>
    </div>
  );
}

export function LandingPage() {
  const { user } = useAuth();
  const { resolved, toggle } = useTheme();
  const rootRef = useRevealOnScroll<HTMLDivElement>();
  const pageProgress = usePageScrollProgress();
  const [stepsRef, stepsProgress] = useElementScrollProgress<HTMLOListElement>();
  const [metricsRef, metricsInView] = useInView<HTMLDivElement>();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const primaryCta = user ? (
    <Link to={homePathFor(user.role)} className="l-btn l-btn-primary">
      Open dashboard <ArrowRight size={16} aria-hidden="true" />
    </Link>
  ) : (
    <Link to="/register" className="l-btn l-btn-primary">
      Get started free <ArrowRight size={16} aria-hidden="true" />
    </Link>
  );

  return (
    <div className="landing" ref={rootRef}>
      <div className="l-progress" style={{ transform: `scaleX(${pageProgress})` }} aria-hidden="true" />

      <header className={`l-nav ${scrolled ? 'is-scrolled' : ''}`}>
        <div className="l-container l-nav-inner">
          <Link to="/" className="l-brand">
            <span className="l-brand-mark">
              <Bot size={18} />
            </span>
            Support Desk
          </Link>
          <nav className="l-links" aria-label="Sections">
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
            <a href="#security">Security</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className="l-nav-actions">
            <button
              type="button"
              className="l-icon"
              onClick={toggle}
              aria-label={resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            >
              {resolved === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            {user ? null : (
              <Link to="/login" className="l-btn l-btn-ghost">
                Sign in
              </Link>
            )}
            {primaryCta}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="l-hero">
        <div className="l-hero-bg" aria-hidden="true">
          <span className="orb o1" />
          <span className="orb o2" />
          <span className="grid" />
        </div>
        <div className="l-container l-hero-inner">
          <div className="l-hero-copy">
            <span className="l-pill l-enter" style={{ animationDelay: '0ms' }}>
              <Sparkles size={14} aria-hidden="true" /> AI customer support, grounded in your documents
            </span>
            <h1 className="l-enter" style={{ animationDelay: '90ms' }}>
              Answers your customers can <span className="l-gradient">trust</span>.
            </h1>
            <p className="l-lead l-enter" style={{ animationDelay: '180ms' }}>
              Support Desk turns your policies and FAQs into an AI assistant that answers instantly, cites its sources, and
              says “I don’t know” instead of making things up.
            </p>
            <div className="l-cta l-enter" style={{ animationDelay: '270ms' }}>
              {primaryCta}
              <a href="#how" className="l-btn l-btn-outline">
                See how it works
              </a>
            </div>
            <ul className="l-checks l-enter" style={{ animationDelay: '360ms' }}>
              <li>
                <BadgeCheck size={15} aria-hidden="true" /> Source citations
              </li>
              <li>
                <BadgeCheck size={15} aria-hidden="true" /> Unanswered-question insights
              </li>
              <li>
                <BadgeCheck size={15} aria-hidden="true" /> Role-based access
              </li>
            </ul>
          </div>
          <div className="l-hero-visual l-enter" style={{ animationDelay: '200ms' }}>
            <HeroChat />
            <div className="l-float f1">
              <ShieldCheck size={15} /> Answered from your policy
            </div>
            <div className="l-float f2">
              <Layers size={15} /> 768-dim semantic search
            </div>
          </div>
        </div>
        <a href="#features" className="l-scroll-cue" aria-label="Scroll to features">
          <span />
        </a>
      </section>

      {/* Tech strip */}
      <section className="l-strip" aria-label="Built with">
        <div className="l-container l-strip-inner" data-reveal>
          <span>Built on</span>
          <strong>PostgreSQL + pgvector</strong>
          <strong>Groq + Gemini</strong>
          <strong>Express + TypeScript</strong>
          <strong>React</strong>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="l-section">
        <div className="l-container">
          <div className="l-heading" data-reveal>
            <span className="l-eyebrow">Features</span>
            <h2>Everything a support team needs from an AI — and nothing it shouldn’t do.</h2>
          </div>
          <div className="l-features">
            {FEATURES.map(({ icon: Icon, title, text }, i) => (
              <article key={title} className="l-feature" data-reveal style={{ transitionDelay: `${(i % 3) * 90}ms` }}>
                <span className="l-feature-icon">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="l-section l-section-alt">
        <div className="l-container l-how">
          <div className="l-heading" data-reveal>
            <span className="l-eyebrow">How it works</span>
            <h2>From document to trustworthy answer in three steps.</h2>
            <p>Retrieval-augmented generation: the model reads your passages first, then answers only from them.</p>
          </div>
          <ol className="l-steps" ref={stepsRef}>
            <span className="l-steps-track" aria-hidden="true">
              <span style={{ transform: `scaleY(${stepsProgress})` }} />
            </span>
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className={stepsProgress > i / STEPS.length ? 'is-active' : ''} data-reveal>
                <span className="l-step-dot">
                  <Icon size={18} aria-hidden="true" />
                </span>
                <div>
                  <span className="l-step-num">Step {i + 1}</span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Measured */}
      <section className="l-section">
        <div className="l-container">
          <div className="l-heading" data-reveal>
            <span className="l-eyebrow">Measured, not assumed</span>
            <h2>Tested against a fixed 50-question evaluation.</h2>
            <p>
              Answerable, paraphrased, unanswerable and ambiguous questions, graded by fixed rules on a sample policy.
              These results were measured with the self-hosted model (qwen2.5:3b); the hosted Groq model used on this
              site has not been re-evaluated yet.
            </p>
          </div>
          <div className="l-metrics" ref={metricsRef}>
            <Metric value={100} suffix="%" label="Answerable questions correct (12/12)" active={metricsInView} />
            <Metric value={15} suffix="/15" label="Unanswerable questions correctly declined" active={metricsInView} />
            <Metric value={0} label="Invented policies or prompt leaks" active={metricsInView} />
            <Metric value={45} suffix="/50" label="Overall, under strict grading" active={metricsInView} />
          </div>
        </div>
      </section>

      {/* Security */}
      <section id="security" className="l-section l-dark">
        <div className="l-container l-security">
          <div className="l-heading" data-reveal>
            <span className="l-eyebrow">Security</span>
            <h2>Secure by default, not as an afterthought.</h2>
            <p>Authentication, authorization and abuse protection are built into every endpoint.</p>
          </div>
          <ul className="l-security-list">
            {SECURITY.map(({ icon: Icon, text }, i) => (
              <li key={text} data-reveal style={{ transitionDelay: `${i * 80}ms` }}>
                <span>
                  <Icon size={18} aria-hidden="true" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="l-section">
        <div className="l-container l-faq">
          <div className="l-heading" data-reveal>
            <span className="l-eyebrow">FAQ</span>
            <h2>Questions, answered.</h2>
          </div>
          <div className="faq-list">
            {FAQ.map((item) => (
              <FaqItem key={item.q} {...item} />
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="l-section l-section-tight">
        <div className="l-container">
          <div className="l-final" data-reveal>
            <h2>Give your customers answers they can rely on.</h2>
            <p>Create an account in seconds and ask your first question.</p>
            <div className="l-cta">
              {primaryCta}
              {user ? null : (
                <Link to="/login" className="l-btn l-btn-outline-light">
                  Sign in
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      <footer className="l-footer">
        <div className="l-container l-footer-inner">
          <span className="l-brand">
            <span className="l-brand-mark">
              <Bot size={16} />
            </span>
            Support Desk
          </span>
          <span>AI customer support grounded in your own documents.</span>
          <nav className="l-footer-links" aria-label="Legal">
            <Link to="/privacy">Privacy Policy</Link>
            <Link to="/terms">Terms of Service</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
