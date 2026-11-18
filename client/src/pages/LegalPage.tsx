import { ArrowLeft, Bot } from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';

const UPDATED = '19 November 2026';

function PrivacyContent() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="legal-updated">Last updated {UPDATED}</p>

      <p>
        Support Desk is an AI customer support assistant that answers questions from documents uploaded by the
        service’s administrators. This policy explains what information the service handles and why.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li>
          <strong>Account details:</strong> your name, email address and role. Passwords are stored only as a
          one-way hash and can never be read back.
        </li>
        <li>
          <strong>Google sign-in:</strong> if you choose “Continue with Google”, we receive your name, email address
          and whether Google has verified that email. We do not receive your Google password or access to any other
          Google data.
        </li>
        <li>
          <strong>Questions you ask:</strong> each question, the answer, which documents were used and how long the
          answer took are recorded so staff can see which questions the documents do not cover yet.
        </li>
        <li>
          <strong>Sign-in sessions:</strong> a session token is stored in your browser so you stay signed in. It is
          revoked when you sign out.
        </li>
      </ul>

      <h2>How the information is used</h2>
      <ul>
        <li>To let you sign in and to show you the pages your role allows.</li>
        <li>To answer your questions from the uploaded support documents.</li>
        <li>To help staff improve those documents, using the question history.</li>
      </ul>
      <p>We do not sell your information or use it for advertising.</p>

      <h2>Services that process your information</h2>
      <ul>
        <li>
          <strong>Groq</strong> generates answers. Your question and the relevant document passages are sent to it.
        </li>
        <li>
          <strong>Google Gemini</strong> converts questions and documents into search vectors. Your question text is
          sent to it.
        </li>
        <li>
          <strong>Render</strong> hosts the server and database, and <strong>Vercel</strong> hosts the website.
        </li>
        <li>
          <strong>Google</strong> handles “Continue with Google” sign-in, if you use it.
        </li>
      </ul>
      <p>Avoid including passwords, payment card numbers or other sensitive details in your questions.</p>

      <h2>Who can see your information</h2>
      <p>
        Administrators can see account details and the question history. Support agents can see the question
        history and the documents. Customers can see only their own account.
      </p>

      <h2>Keeping and deleting information</h2>
      <p>
        Your account is kept until it is deleted. An administrator can delete your account at your request; when an
        account is deleted, its sessions are removed and its questions stay only without your name. You can change
        your name and password at any time in Settings.
      </p>

      <h2>Contact</h2>
      <p>
        For questions about this policy, or to ask for your account to be deleted, contact the administrator of this
        Support Desk service.
      </p>
    </>
  );
}

function TermsContent() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p className="legal-updated">Last updated {UPDATED}</p>

      <p>By creating an account or using Support Desk, you agree to these terms.</p>

      <h2>The service</h2>
      <p>
        Support Desk answers customer questions using documents uploaded by its administrators. Answers are generated
        automatically by an AI model and can be incomplete or wrong. Where an answer matters, confirm it with the
        support team. The assistant cannot place, change or cancel orders, issue refunds or access accounts.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>Keep your password private. You are responsible for activity under your account.</li>
        <li>Give accurate information when you register.</li>
        <li>Administrators may change your role or remove your account.</li>
      </ul>

      <h2>Acceptable use</h2>
      <ul>
        <li>Do not try to break, overload or bypass the security of the service.</li>
        <li>Do not try to make the assistant reveal its instructions or produce harmful content.</li>
        <li>Do not submit other people’s personal data or sensitive financial details.</li>
        <li>Automated requests are limited; heavy use can be temporarily blocked.</li>
      </ul>

      <h2>Availability</h2>
      <p>
        The service is provided as is, without guarantees of availability or accuracy. It may be paused, changed or
        discontinued at any time.
      </p>

      <h2>Privacy</h2>
      <p>
        How your information is handled is described in the <Link to="/privacy">Privacy Policy</Link>.
      </p>

      <h2>Changes</h2>
      <p>These terms may be updated. The date above shows the latest version.</p>
    </>
  );
}

export function LegalPage({ kind }: { kind: 'privacy' | 'terms' }) {
  useEffect(() => {
    document.title = `${kind === 'privacy' ? 'Privacy Policy' : 'Terms of Service'} · Support Desk`;
    window.scrollTo(0, 0);
  }, [kind]);

  return (
    <div className="legal">
      <header className="legal-header">
        <Link to="/" className="legal-brand">
          <span className="brand-mark" aria-hidden="true">
            <Bot size={16} />
          </span>
          Support Desk
        </Link>
        <Link to="/" className="link">
          <ArrowLeft size={14} aria-hidden="true" /> Home
        </Link>
      </header>
      <article className="legal-body">{kind === 'privacy' ? <PrivacyContent /> : <TermsContent />}</article>
      <footer className="legal-footer">
        <Link to="/privacy">Privacy Policy</Link>
        <Link to="/terms">Terms of Service</Link>
      </footer>
    </div>
  );
}
