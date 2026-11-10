'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import GoogleSignIn from '@/components/GoogleSignIn';
import {
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  Globe,
  UserRound,
  Building2,
  Mail,
  Check,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { api, User } from '@/lib/api';
import { ThemeToggle } from '@/components/ThemeProvider';

type AuthMode = 'login' | 'signup';
type AuthOptions = { emailSignupEnabled: boolean; googleEnabled: boolean; googleClientId: string | null };

export default function AuthWorkspace({ initialMode }: { initialMode: AuthMode }) {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [options, setOptions] = useState<AuthOptions | null>(null);
  const [optionsError, setOptionsError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState('');
  const [company, setCompany] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [devVerifyUrl, setDevVerifyUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    let active = true;
    setOptionsError(false);
    api<AuthOptions>('/auth/options')
      .then((data) => {
        if (active) setOptions(data);
      })
      .catch(() => {
        if (active) setOptionsError(true);
      });
    return () => {
      active = false;
    };
  }, [retryKey]);

  useEffect(() => {
    let active = true;
    api<{ user: User }>('/auth/me')
      .then(({ user }) => {
        if (active) router.replace(user.role === 'creditor' && !user.organizationId ? '/onboarding' : '/dashboard');
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    if (!loading) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), 9000);
    return () => clearTimeout(timer);
  }, [loading]);

  function switchMode(next: AuthMode) {
    if (loading) return;
    setMode(next);
    setError('');
    setSlow(false);
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setSignupSuccess(false);
    setDevVerifyUrl('');
    window.history.replaceState(null, '', next === 'signup' ? '/login?mode=signup' : '/login');
  }

  function onAuthenticated(user: User) {
    router.replace(user.role === 'creditor' && !user.organizationId ? '/onboarding' : '/dashboard');
  }

  async function signIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);
    let authenticated = false;
    try {
      await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      authenticated = true;
      const { user } = await api<{ user: User }>('/auth/me');
      onAuthenticated(user);
    } catch (err: unknown) {
      const problem = err as { message?: string; status?: number };
      setError(
        authenticated && problem?.status === 401
          ? 'Sign-in succeeded but your browser did not save the session. Allow cookies for this site and try again.'
          : problem?.message || 'Sign-in failed. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }

  async function register(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      setError('Use at least 12 characters, including uppercase and lowercase letters and a number.');
      return;
    }
    setLoading(true);
    try {
      const res = await api<{ message?: string; devToken?: string; devVerificationUrl?: string }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: fullName,
          organizationName: company,
          email,
          password,
        }),
      });

      if (res.devToken) {
        try {
          const verified = await api<{ user: User }>('/auth/verify-email', {
            method: 'POST',
            body: JSON.stringify({ token: res.devToken }),
          });
          onAuthenticated(verified.user);
          return;
        } catch {
          setDevVerifyUrl(res.devVerificationUrl || '');
          setSignupSuccess(true);
        }
      } else {
        setSignupSuccess(true);
      }
      setPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // Live password validation
  const hasMinLength = password.length >= 12;
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const passwordsMatch = password.length > 0 && password === confirmPassword;

  const emailSignupEnabled = options?.emailSignupEnabled === true;
  const googleEnabled = options?.googleEnabled === true;
  const isSignup = mode === 'signup';

  return (
    <div className="login-layout">
      {/* Left Showcase Panel */}
      <section className="login-story" aria-label="CollectDesk introduction">
        <Link className="story-brand" href="/" aria-label="CollectDesk home">
          <span className="brand-mark light">
            <BriefcaseBusiness size={22} />
          </span>
          <span>
            collect<span>desk</span>
          </span>
        </Link>

        <div className="story-content">
          <div className="story-tag">
            {isSignup ? '✨ CREDITOR WORKSPACE SETUP' : 'COMMERCIAL COLLECTIONS · CASE MANAGEMENT'}
          </div>

          <h2>
            {isSignup ? (
              <>
                Every overdue invoice deserves <em>a clearer path forward.</em>
              </>
            ) : (
              <>
                From overdue invoice<br />to <em>clear resolution.</em>
              </>
            )}
          </h2>

          <p>
            {isSignup
              ? 'Create a creditor workspace in under a minute. Submit overdue invoices, follow reviews, and track verified recovery.'
              : 'One focused place to review cases, coordinate next steps, and track verified recoveries with absolute transparency.'}
          </p>

          <div className="story-feature-list" aria-label="Workspace benefits">
            <div>
              <span>
                <BriefcaseBusiness size={20} />
              </span>
              <div>
                <b>{isSignup ? 'Private Creditor Workspace' : 'Submit Invoices'}</b>
                <small>
                  {isSignup
                    ? 'Your invoice drafts and records stay private to your company.'
                    : 'A creditor submits an overdue invoice case for review.'}
                </small>
              </div>
            </div>

            <div>
              <span>
                <ShieldCheck size={20} />
              </span>
              <div>
                <b>{isSignup ? 'Dedicated Operators' : 'Transparent Review'}</b>
                <small>
                  {isSignup
                    ? 'Administrators assign a named operator to follow each case.'
                    : 'Administrators review, approve, and assign named operators.'}
                </small>
              </div>
            </div>

            <div>
              <span>
                <CheckCircle2 size={20} />
              </span>
              <div>
                <b>{isSignup ? 'Verified Recovery Ledger' : 'Verified Recovery'}</b>
                <small>
                  {isSignup
                    ? 'Only verified receipts count toward recovery totals.'
                    : 'Receipts are verified by admins before counting toward totals.'}
                </small>
              </div>
            </div>
          </div>
        </div>

        <div className="story-footer">
          <span>SAMPLE PREVIEW ENVIRONMENT · NO REAL MONEY PROCESSED</span>
        </div>
      </section>

      {/* Right Form Panel */}
      <main className="login-panel">
        <div className="auth-header-actions">
          <Link href="/" className="button button-muted button-small" title="Return to home page">
            <Globe size={14} /> Site
          </Link>
          <ThemeToggle />
        </div>

        <div className="login-card auth-unified-card">
          {/* Mode Switcher Tabs */}
          <div className="auth-mode-switch" role="tablist" aria-label="Account access">
            <button
              type="button"
              role="tab"
              aria-selected={!isSignup}
              aria-controls="auth-panel-content"
              className={!isSignup ? 'active' : ''}
              disabled={loading}
              onClick={() => switchMode('login')}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={isSignup}
              aria-controls="auth-panel-content"
              className={isSignup ? 'active' : ''}
              disabled={loading}
              onClick={() => switchMode('signup')}
            >
              Create account
            </button>
          </div>

          <div id="auth-panel-content" role="tabpanel" aria-label={isSignup ? 'Create account' : 'Sign in'}>
            <span className="eyebrow">
              {isSignup ? 'CREDITOR ONBOARDING' : 'COLLECTDESK ACCESS'}
            </span>
            <h1>{isSignup ? 'Create your workspace' : 'Welcome back'}</h1>
            <p className="auth-panel-lead">
              {isSignup
                ? 'Fill in your details below to activate your commercial creditor workspace.'
                : 'Sign in to access your cases, operational timelines, and recovery totals.'}
            </p>

            {(!isSignup || (!optionsError && !!options && !signupSuccess && googleEnabled)) && (
              <GoogleSignIn showDivider={!isSignup || emailSignupEnabled} onAuthenticated={onAuthenticated} />
            )}

            {!isSignup ? (
              /* --- Sign In Form --- */
              <form className="form login-form" onSubmit={signIn}>
                <label className="auth-field">
                  <span>Work email address</span>
                  <div className="input-with-icon">
                    <Mail size={17} className="input-icon" />
                    <input
                      type="email"
                      autoComplete="username"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                    />
                  </div>
                </label>

                <label className="auth-field">
                  <span>Password</span>
                  <div className="input-with-icon password-wrap">
                    <LockKeyhole size={17} className="input-icon" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </label>

                <div className="auth-login-help">
                  <Link href="/forgot-password">Forgot password?</Link>
                </div>

                {error && (
                  <div className="message error" role="alert">
                    {error}
                  </div>
                )}

                <button className="button button-primary login-submit" type="submit" disabled={loading}>
                  {loading ? 'Signing in…' : 'Sign in'} <ArrowRight size={18} />
                </button>

                {slow && (
                  <p className="login-slow-notice" role="status">
                    The server is responding slowly. It may be waking up; please wait a moment.
                  </p>
                )}
              </form>
            ) : optionsError ? (
              <div className="auth-unavailable" role="alert">
                <LockKeyhole size={20} />
                <div>
                  <strong>Cannot check registration right now</strong>
                  <p>
                    The server may be waking up.{' '}
                    <button
                      className="auth-retry-link"
                      type="button"
                      onClick={() => {
                        setOptions(null);
                        setRetryKey((n) => n + 1);
                      }}
                    >
                      Try again
                    </button>
                  </p>
                </div>
              </div>
            ) : !options ? (
              <p className="auth-note" role="status">
                Checking registration availability…
              </p>
            ) : signupSuccess ? (
              <div className="auth-success" role="status">
                <CheckCircle2 size={26} />
                <div>
                  <strong>Account created successfully!</strong>
                  <p>
                    If an email address was configured, a verification link has been sent. In local development mode,
                    you can enter directly.
                  </p>
                  {devVerifyUrl && (
                    <a
                      href={devVerifyUrl}
                      className="button button-primary button-small"
                      style={{ marginTop: 14, display: 'inline-flex' }}
                    >
                      Verify & enter workspace <ArrowRight size={15} />
                    </a>
                  )}
                  <button
                    type="button"
                    className="auth-retry-link"
                    onClick={() => switchMode('login')}
                    style={{ marginTop: 12, display: 'block' }}
                  >
                    Back to sign in
                  </button>
                </div>
              </div>
            ) : emailSignupEnabled ? (
              /* --- Enhanced Create Account Form --- */
              <form className="auth-form auth-inline-form" onSubmit={register}>
                <div className="signup-grid">
                  <label className="auth-field">
                    <span>Your full name</span>
                    <div className="input-with-icon">
                      <UserRound size={17} className="input-icon" />
                      <input
                        autoComplete="name"
                        required
                        minLength={2}
                        maxLength={90}
                        placeholder="Avery Morgan"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                      />
                    </div>
                  </label>

                  <label className="auth-field">
                    <span>Company / Creditor name</span>
                    <div className="input-with-icon">
                      <Building2 size={17} className="input-icon" />
                      <input
                        autoComplete="organization"
                        required
                        minLength={3}
                        maxLength={140}
                        placeholder="Acme Industrial Ltd"
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                      />
                    </div>
                  </label>
                </div>

                <label className="auth-field">
                  <span>Work email address</span>
                  <div className="input-with-icon">
                    <Mail size={17} className="input-icon" />
                    <input
                      autoComplete="email"
                      type="email"
                      required
                      placeholder="avery@acme.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </label>

                <div className="signup-grid">
                  <label className="auth-field">
                    <span>Password</span>
                    <div className="input-with-icon password-wrap">
                      <LockKeyhole size={17} className="input-icon" />
                      <input
                        autoComplete="new-password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={12}
                        maxLength={128}
                        placeholder="Min. 12 characters"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </label>

                  <label className="auth-field">
                    <span>Confirm password</span>
                    <div className="input-with-icon password-wrap">
                      <ShieldCheck size={17} className="input-icon" />
                      <input
                        autoComplete="new-password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={12}
                        maxLength={128}
                        placeholder="Repeat password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                      />
                    </div>
                  </label>
                </div>

                {/* Interactive Password Requirements Checklist */}
                {password.length > 0 && (
                  <div className="password-checklist" aria-label="Password requirements">
                    <span className={`check-pill ${hasMinLength ? 'valid' : ''}`}>
                      <Check size={12} /> 12+ characters
                    </span>
                    <span className={`check-pill ${hasUpper && hasLower ? 'valid' : ''}`}>
                      <Check size={12} /> Upper & lowercase
                    </span>
                    <span className={`check-pill ${hasNumber ? 'valid' : ''}`}>
                      <Check size={12} /> At least 1 number
                    </span>
                    {confirmPassword.length > 0 && (
                      <span className={`check-pill ${passwordsMatch ? 'valid' : ''}`}>
                        <Check size={12} /> Passwords match
                      </span>
                    )}
                  </div>
                )}

                {error && (
                  <p role="alert" className="auth-error">
                    {error}
                  </p>
                )}

                <button className="button button-primary login-submit" type="submit" disabled={loading}>
                  {loading ? 'Creating workspace…' : 'Create creditor workspace'}{' '}
                  <ArrowRight size={18} />
                </button>

                <p className="auth-hint auth-verification-caption">
                  ⚡ Instant access for commercial creditors. Sample records only.
                </p>

                {slow && (
                  <p className="login-slow-notice" role="status">
                    The server is taking longer than expected. Please wait a moment.
                  </p>
                )}
              </form>
            ) : googleEnabled ? (
              <p className="auth-note">
                Continue with Google to create an account. Email and password registration is not currently available.
              </p>
            ) : (
              <div className="auth-unavailable" role="status">
                <LockKeyhole size={20} />
                <div>
                  <strong>Account registration is not available yet</strong>
                  <p>Please contact the workspace administrator for access.</p>
                </div>
              </div>
            )}
          </div>

          <p className="auth-account-toggle">
            {isSignup ? (
              <>
                Already have an account?{' '}
                <button type="button" onClick={() => switchMode('login')}>
                  Sign in
                </button>
              </>
            ) : (
              <>
                New to CollectDesk?{' '}
                <button type="button" onClick={() => switchMode('signup')}>
                  Create an account
                </button>
              </>
            )}
          </p>

          <div className="login-security">
            <LockKeyhole size={16} />
            <span>
              {isSignup
                ? 'Public signups receive Creditor role. Administrator and operator roles are provisioned separately.'
                : 'Role-based access. Every transaction ledger entry is verified.'}
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}
