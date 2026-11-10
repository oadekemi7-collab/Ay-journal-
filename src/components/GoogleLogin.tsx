import { useState, useEffect, FormEvent } from 'react';
import { Activity, Mail, AlertCircle, ArrowRight, CheckCircle2, Loader2, Globe, Send, ArrowLeft, ShieldCheck } from 'lucide-react';
import { 
  signInWithGoogle, 
  sendPasswordlessEmailLink, 
  completeEmailLinkSignIn, 
  checkIsSignInWithEmailLink,
  AppUser
} from '../lib/firebase';

interface GoogleLoginProps {
  onSuccess: (user: { uid?: string; email: string; name: string; avatar: string }) => void;
}

export default function GoogleLogin({ onSuccess }: GoogleLoginProps) {
  // Input fields
  const [email, setEmail] = useState<string>('');
  const [confirmEmail, setConfirmEmail] = useState<string>('');

  // UI Flow States
  const [linkSent, setLinkSent] = useState<boolean>(false);
  const [sentToEmail, setSentToEmail] = useState<string>('');
  const [noticeMessage, setNoticeMessage] = useState<string>('');
  const [isVerifyingLink, setIsVerifyingLink] = useState<boolean>(false);
  const [promptEmailForVerification, setPromptEmailForVerification] = useState<boolean>(false);

  // Loading & Error States
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');

  // 1. On page load, check if the user clicked an email sign-in link
  useEffect(() => {
    const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const magicToken = urlParams?.get('token');
    const paramEmail = urlParams?.get('email');

    // Case A: Real Firebase modular email link (signInWithEmailLink)
    if (checkIsSignInWithEmailLink()) {
      setIsVerifyingLink(true);
      setErrorMessage('');

      // Get saved email from localStorage or URL query param
      let emailForSignIn = typeof window !== 'undefined' ? window.localStorage.getItem('emailForSignIn') : null;
      if (!emailForSignIn && paramEmail) {
        emailForSignIn = paramEmail;
      }

      if (emailForSignIn) {
        completeEmailLinkSignIn(emailForSignIn)
          .then((result) => {
            if (result.user) {
              setSuccessMessage('Sign-in link verified! Loading your journal...');
              const cleanUrl = new URL(window.location.href);
              cleanUrl.search = '';
              window.history.replaceState({}, document.title, cleanUrl.toString());

              setTimeout(() => {
                onSuccess(result.user!);
              }, 400);
            } else if (result.error) {
              setErrorMessage(result.error);
              setIsVerifyingLink(false);
            }
          })
          .catch((err) => {
            setErrorMessage(err?.message || 'Failed to complete email link sign-in.');
            setIsVerifyingLink(false);
          });
      } else {
        // If email is missing from localStorage (opened on different device or private mode)
        setIsVerifyingLink(false);
        setPromptEmailForVerification(true);
      }
    } else if (magicToken && paramEmail) {
      // Case B: Direct 1-click passwordless sign-in link
      setIsVerifyingLink(true);
      setErrorMessage('');
      fetch('/api/auth/verify-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: paramEmail, token: magicToken })
      })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.user) {
          if (data.token) {
            localStorage.setItem('journaly_auth_token', data.token);
          }
          localStorage.setItem('tradezella_journal_user', JSON.stringify(data.user));
          setSuccessMessage('Sign-in link verified! Loading your journal...');
          const cleanUrl = new URL(window.location.href);
          cleanUrl.search = '';
          window.history.replaceState({}, document.title, cleanUrl.toString());
          setTimeout(() => {
            onSuccess(data.user);
          }, 400);
        } else {
          setErrorMessage(data.error || 'Invalid or expired sign-in link.');
          setIsVerifyingLink(false);
        }
      })
      .catch((err) => {
        setErrorMessage(err?.message || 'Failed to verify sign-in link.');
        setIsVerifyingLink(false);
      });
    }
  }, [onSuccess]);

  // Handle user completing email link on a device missing localStorage email
  const handlePromptEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    const cleanEmail = confirmEmail.trim();
    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setErrorMessage('Please enter the email address you requested the sign-in link for.');
      return;
    }

    setIsLoading(true);
    try {
      const result = await completeEmailLinkSignIn(cleanEmail);
      if (result.user) {
        setSuccessMessage('Sign-in link verified! Loading your journal...');
        const cleanUrl = new URL(window.location.href);
        cleanUrl.search = '';
        window.history.replaceState({}, document.title, cleanUrl.toString());

        setTimeout(() => {
          onSuccess(result.user!);
        }, 400);
      } else if (result.error) {
        setErrorMessage(result.error);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to verify sign-in link.');
    } finally {
      setIsLoading(false);
    }
  };

  // 2. One-click "Continue with Google"
  const handleGoogleSignIn = async () => {
    setErrorMessage('');
    setSuccessMessage('');
    setIsGoogleLoading(true);

    try {
      const result = await signInWithGoogle();
      if (result.user) {
        setSuccessMessage('Signed in with Google! Loading your journal...');
        setTimeout(() => {
          onSuccess(result.user!);
        }, 300);
      } else if (result.error) {
        setErrorMessage(result.error);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Google authentication error.');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  // 3. Passwordless email link submission
  const handleSendLinkSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await sendPasswordlessEmailLink(cleanEmail);
      if (res.success) {
        setSentToEmail(cleanEmail);
        setLinkSent(true);
        if (res.notice) {
          setNoticeMessage(res.notice);
        }
      } else if (res.error) {
        setErrorMessage(res.error);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to send login link.');
    } finally {
      setIsLoading(false);
    }
  };

  const isUnauthorizedDomain = errorMessage.toLowerCase().includes('authorized domain') || errorMessage.toLowerCase().includes('unauthorized-domain');
  const isOperationNotAllowed = errorMessage.toLowerCase().includes('operation-not-allowed') || errorMessage.toLowerCase().includes('email link (passwordless) sign-in is not enabled');
  const currentHostname = typeof window !== 'undefined' ? window.location.hostname : '';

  // STATE: Verifying link in progress
  if (isVerifyingLink) {
    return (
      <div id="journaly-auth-container" className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-4 relative overflow-hidden select-none">
        <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-8 relative z-10 shadow-2xl text-center space-y-4">
          <div className="inline-flex p-4 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 animate-spin">
            <Loader2 size={32} />
          </div>
          <h2 className="text-lg font-bold text-white uppercase tracking-tight">Verifying Your Sign-In Link</h2>
          <p className="text-xs text-zinc-400">Authenticating your passwordless session via Firebase...</p>
        </div>
      </div>
    );
  }

  // STATE: Link clicked on a different browser, prompt email confirmation
  if (promptEmailForVerification) {
    return (
      <div id="journaly-auth-container" className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-4 relative overflow-hidden select-none selection:bg-emerald-500 selection:text-zinc-950">
        <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-8 relative z-10 shadow-2xl space-y-5 text-center">
          <div className="p-3.5 mx-auto w-fit rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Mail size={28} />
          </div>
          <div>
            <h2 className="text-xl font-black text-white uppercase tracking-tight">Confirm Your Email</h2>
            <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
              You opened this sign-in link in a new browser window. Please confirm your email address to complete sign-in:
            </p>
          </div>

          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs text-left flex items-start gap-2">
              <AlertCircle size={15} className="shrink-0 text-rose-400 mt-0.5" />
              <div className="flex-1 leading-relaxed text-[11px]">{errorMessage}</div>
            </div>
          )}

          <form onSubmit={handlePromptEmailSubmit} className="space-y-3.5 text-left">
            <input
              type="email"
              required
              autoFocus
              placeholder="trader@journaly.com"
              className="w-full bg-zinc-950/70 border border-zinc-800 rounded-xl px-3.5 py-3 text-xs text-white placeholder-zinc-600 focus:border-emerald-500 focus:outline-none"
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
            />
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-emerald-500 text-zinc-950 hover:bg-emerald-400 font-black text-xs uppercase tracking-wider h-11 rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all"
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin text-zinc-950" />
                  <span>Verifying...</span>
                </div>
              ) : (
                <span>Complete Sign In</span>
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div id="journaly-auth-container" className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-4 relative overflow-hidden select-none selection:bg-emerald-500 selection:text-zinc-950">
      
      {/* Ambient background glow accents */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-emerald-500/10 blur-[140px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-teal-500/5 blur-[140px] rounded-full pointer-events-none" />
      <div className="absolute top-[40%] right-[10%] w-[300px] h-[300px] bg-emerald-950/20 blur-[100px] rounded-full pointer-events-none" />

      {/* Main Card Panel */}
      <div id="auth-card-panel" className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-8 relative z-10 shadow-2xl shadow-emerald-950/20">
        
        {/* Subtle grid pattern background */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none rounded-3xl bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:24px_24px]" />

        <div className="flex flex-col items-center relative z-10 text-center">
          
          {/* Brand Icon */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-zinc-950 flex items-center justify-center mb-4 shadow-xl shadow-emerald-500/15">
            <Activity size={26} className="stroke-[2.5]" />
          </div>

          {/* Heading */}
          <h1 className="text-2xl font-black font-display tracking-tight text-white mb-1 uppercase">
            JOURNALY
          </h1>
          <p className="text-zinc-400 text-xs mb-6 max-w-sm">
            Institutional-grade trade execution & psychology journal.
          </p>

          {/* Error Banner */}
          {errorMessage && (
            <div className="w-full p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs font-medium flex flex-col gap-2 text-left mb-4 animate-fade-in">
              <div className="flex items-start gap-2">
                <AlertCircle size={16} className="shrink-0 text-rose-400 mt-0.5" />
                <div className="flex-1 leading-relaxed text-[11px]">{errorMessage}</div>
              </div>

              {/* Helpful inline guidance for domain authorization */}
              {isUnauthorizedDomain && (
                <div className="mt-1 pt-2 border-t border-rose-500/20 text-[10px] text-zinc-300 space-y-1">
                  <div className="flex items-center gap-1 font-bold text-emerald-400">
                    <Globe size={11} />
                    <span>How to authorize domain in Firebase Console:</span>
                  </div>
                  <ol className="list-decimal pl-4 space-y-0.5 text-zinc-400">
                    <li>Open <strong>Firebase Console &gt; Authentication &gt; Settings</strong></li>
                    <li>Select <strong>Authorized Domains &gt; Add domain</strong></li>
                    <li>Paste: <code className="bg-zinc-950 text-emerald-300 px-1 py-0.5 rounded select-all font-mono">{currentHostname}</code></li>
                  </ol>
                </div>
              )}

              {/* Helpful inline guidance for enabling passwordless email link */}
              {isOperationNotAllowed && (
                <div className="mt-1 pt-2 border-t border-rose-500/20 text-[10px] text-zinc-300 space-y-1">
                  <div className="flex items-center gap-1 font-bold text-emerald-400">
                    <ShieldCheck size={11} />
                    <span>How to enable in Firebase Console:</span>
                  </div>
                  <ol className="list-decimal pl-4 space-y-0.5 text-zinc-400">
                    <li>Go to <strong>Authentication &gt; Sign-in method</strong></li>
                    <li>Click <strong>Email/Password</strong></li>
                    <li>Turn ON <strong>Email link (passwordless sign-in)</strong> and click <strong>Save</strong></li>
                  </ol>
                </div>
              )}
            </div>
          )}

          {/* Success Banner */}
          {successMessage && (
            <div className="w-full p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs font-medium flex items-start gap-2.5 text-left mb-4 animate-fade-in">
              <CheckCircle2 size={15} className="shrink-0 text-emerald-400 mt-0.5" />
              <div className="flex-1 leading-relaxed text-[11px]">{successMessage}</div>
            </div>
          )}

          {/* STATE: Link Sent Confirmation */}
          {linkSent ? (
            <div className="w-full space-y-5 animate-fade-in text-center py-2">
              <div className="p-4 mx-auto w-fit rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 animate-pulse duration-1000">
                <Send size={28} />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base font-black text-white uppercase tracking-tight">Check Your Inbox</h3>
                <p className="text-xs text-zinc-300 leading-relaxed max-w-xs mx-auto">
                  We sent a sign-in link to <span className="text-emerald-400 font-mono font-bold break-all">{sentToEmail}</span>.
                </p>
                <p className="text-[11px] text-zinc-400 leading-relaxed max-w-xs mx-auto pt-1">
                  Click the link in your email to log in instantly. No password required.
                </p>
                {noticeMessage && (
                  <div className="mt-2 p-2.5 rounded-xl bg-zinc-950/70 border border-emerald-500/20 text-emerald-300 text-[11px] leading-relaxed max-w-xs mx-auto">
                    {noticeMessage}
                  </div>
                )}
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setLinkSent(false);
                    setErrorMessage('');
                  }}
                  className="w-full py-2.5 px-4 bg-zinc-800 hover:bg-zinc-750 text-zinc-200 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft size={13} />
                  <span>Use a different email</span>
                </button>
              </div>
            </div>
          ) : (
            /* STATE: Initial Login Screen (One Email Field + Google Button) */
            <div className="w-full space-y-5">
              
              {/* 1. Continue with Google Button */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isGoogleLoading || isLoading}
                id="btn-google-signin"
                className="w-full bg-white hover:bg-zinc-100 text-zinc-900 font-bold text-xs h-11 rounded-xl flex items-center justify-center gap-3 transition-all cursor-pointer shadow-lg active:scale-[0.99] disabled:opacity-60"
              >
                {isGoogleLoading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin text-zinc-900" />
                    <span>Signing in with Google...</span>
                  </div>
                ) : (
                  <>
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
                    </svg>
                    <span>Continue with Google</span>
                  </>
                )}
              </button>

              {/* Divider */}
              <div className="w-full flex items-center gap-3">
                <div className="flex-1 h-px bg-zinc-800" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">or continue with email link</span>
                <div className="flex-1 h-px bg-zinc-800" />
              </div>

              {/* 2. Passwordless Email Link Form */}
              <form onSubmit={handleSendLinkSubmit} className="w-full space-y-4 text-left">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 block px-1">
                    Email Address
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      required
                      autoFocus
                      placeholder="trader@journaly.com"
                      className="w-full bg-zinc-950/70 border border-zinc-800 rounded-xl px-3.5 py-3 text-sm text-white placeholder-zinc-600 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 pr-10 transition-all"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                    <div className="absolute right-3.5 top-3.5 text-zinc-500 pointer-events-none">
                      <Mail size={16} />
                    </div>
                  </div>
                </div>

                {/* Send me a login link button */}
                <button
                  type="submit"
                  disabled={isLoading || isGoogleLoading}
                  id="btn-send-login-link"
                  className="w-full bg-emerald-500 text-zinc-950 hover:bg-emerald-400 active:scale-[0.99] disabled:opacity-50 font-black text-xs uppercase tracking-wider h-11 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-emerald-500/10"
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <Loader2 size={16} className="animate-spin text-zinc-950" />
                      <span>Sending sign-in link...</span>
                    </div>
                  ) : (
                    <>
                      <span>Send me a login link</span>
                      <ArrowRight size={15} />
                    </>
                  )}
                </button>
              </form>

              {/* Assurance note */}
              <div className="pt-1 flex items-center justify-center gap-1.5 text-[11px] text-zinc-500 text-center">
                <ShieldCheck size={13} className="text-emerald-400 shrink-0" />
                <span>Passwordless. No password to create, remember, or reset.</span>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
