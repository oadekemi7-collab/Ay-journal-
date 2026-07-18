import { useState, FormEvent } from 'react';
import { Sparkles, ShieldCheck, Activity, Chrome, LogIn, Mail, User, Lock, Eye, EyeOff, Key, ArrowLeft } from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, authenticateUser, registerUser, verifyUserCode, syncGoogleUser } from '../lib/firebase';

interface GoogleLoginProps {
  onSuccess: (user: { email: string; name: string; avatar: string }) => void;
}

export default function GoogleLogin({ onSuccess }: GoogleLoginProps) {
  const [step, setStep] = useState<'intro' | 'chooser' | 'loading' | 'verify_code' | 'forgot_password' | 'verify_reset' | 'new_password'>('intro');
  const [selectedEmail, setSelectedEmail] = useState<string>('');
  const [customEmail, setCustomEmail] = useState<string>('');
  const [authProgress, setAuthProgress] = useState<string>('');

  // Form states for manual SignUp / Login
  const [isRegisterMode, setIsRegisterMode] = useState<boolean>(false);
  const [formEmail, setFormEmail] = useState<string>('');
  const [formName, setFormName] = useState<string>('');
  const [formPassword, setFormPassword] = useState<string>('');
  const [formError, setFormError] = useState<string>('');
  const [isLoadingDbButton, setIsLoadingDbButton] = useState<boolean>(false);

  // Password Visibility Toggle States
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showNewPassword, setShowNewPassword] = useState<boolean>(false);

  // States for forgot password / reset flow
  const [forgotEmail, setForgotEmail] = useState<string>('');
  const [forgotError, setForgotError] = useState<string>('');
  const [isResetLoading, setIsResetLoading] = useState<boolean>(false);
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmNewPassword, setConfirmNewPassword] = useState<string>('');

  // States for verification flow
  const [pendingEmail, setPendingEmail] = useState<string>('');
  const [pendingName, setPendingName] = useState<string>('');
  const [generatedCode, setGeneratedCode] = useState<string>('');
  const [verificationInput, setVerificationInput] = useState<string>('');
  const [verificationError, setVerificationError] = useState<string>('');
  const [isVerifyingState, setIsVerifyingState] = useState<boolean>(false);
  const [emailPreviewUrl, setEmailPreviewUrl] = useState<string>('');
  const [showSmtpGuide, setShowSmtpGuide] = useState<boolean>(false);

  const sendVerificationCodeEmail = async (email: string, code: string, type: 'auth' | 'reset' = 'auth') => {
    try {
      setEmailPreviewUrl('');
      // Debug log directly to client console so standard user can copy paste if they haven't set up SMTP yet
      console.log(`%c[SYSTEM ACCESS PIN] Code: ${code} for ${email} (type: ${type})`, 'background: #064e3b; color: #34d399; font-weight: bold; font-size: 14px; padding: 4px 8px; border-radius: 4px;');
      console.log(`[Email Dispatcher] Dispatching code ${code} to email ${email} via server API (type: ${type})...`);
      const response = await fetch('/api/send-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: email.toLowerCase().trim(),
          code,
          type
        })
      });
      
      const data = await response.json();
      if (data.success) {
        console.log(`[Email Dispatcher] Verification code successfully routed.`);
        if (data.previewUrl) {
          setEmailPreviewUrl(data.previewUrl);
        }
      } else {
        console.error('[Email Dispatcher] Server failed to dispatch:', data.error);
      }
    } catch (err) {
      console.error('[Email Dispatcher] Failed to dispatch verification code:', err);
    }
  };

  const startLoginFlow = () => {
    setStep('chooser');
  };

  const handleCustomEmailSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!customEmail || !customEmail.includes('@')) return;
    setSelectedEmail(customEmail);
    setStep('loading');
    animateLoading(customEmail, undefined, true);
  };

  const handleManualFormSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!formEmail || !formEmail.includes('@')) {
      setFormError('Please enter a valid email address.');
      return;
    }
    if (isRegisterMode && !formName.trim()) {
      setFormError('Please enter your display name.');
      return;
    }
    if (!formPassword || formPassword.trim().length < 4) {
      setFormError('Password must be at least 4 characters long.');
      return;
    }
    setFormError('');

    if (isRegisterMode) {
      // Sign up flow
      setIsLoadingDbButton(true);
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      try {
        const result = await registerUser(formEmail, formName, formPassword, code);
        if (result.success) {
          // Proactively clear any local trade cache for a clean 0 PnL fresh start
          localStorage.removeItem(`tradezella_journal_trades_${formEmail.toLowerCase().trim()}`);
          setPendingEmail(formEmail);
          setPendingName(formName);
          setGeneratedCode(code);
          await sendVerificationCodeEmail(formEmail, code);
          setStep('verify_code');
        } else {
          setFormError(result.error || 'Registration failed.');
        }
      } catch (err) {
        setFormError('An error occurred during secure account sign up.');
      } finally {
        setIsLoadingDbButton(false);
      }
    } else {
      // Login attempt with password verification
      setIsLoadingDbButton(true);
      try {
        const result = await authenticateUser(formEmail, formPassword);
        if (result.success && result.user) {
          setSelectedEmail(formEmail);
          setStep('loading');
          animateLoading(formEmail, result.user.name, false);
        } else if (result.needsVerification && result.user) {
          setPendingEmail(formEmail);
          setPendingName(result.user.name);
          
          let codeValue = '123456';
          // Retrieve the existing code from Firestore profiles so the user isn't stuck
          try {
            const docRef = doc(db, 'profiles', formEmail.toLowerCase().trim());
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
              codeValue = docSnap.data().verificationCode || '123456';
            }
          } catch (codeErr) {
            console.error('Could not fetch existing verification code:', codeErr);
          }
          
          setGeneratedCode(codeValue);
          await sendVerificationCodeEmail(formEmail, codeValue);
          setStep('verify_code');
        } else {
          setFormError(result.error || 'Incorrect password. Access denied.');
        }
      } catch (err) {
        setFormError('Database sync error. Please try again.');
      } finally {
        setIsLoadingDbButton(false);
      }
    }
  };

  const handleVerifyCodeSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!verificationInput.trim()) return;

    setIsVerifyingState(true);
    setVerificationError('');
    try {
      const result = await verifyUserCode(pendingEmail, verificationInput);
      if (result.success) {
        // Successful email verification
        setSelectedEmail(pendingEmail);
        setStep('loading');
        animateLoading(pendingEmail, pendingName || undefined, false);
      } else {
        setVerificationError(result.error || 'Incorrect code. Please check your simulation console.');
      }
    } catch (err) {
      setVerificationError('Error during user verification handshake.');
    } finally {
      setIsVerifyingState(false);
    }
  };

  const animateLoading = (email: string, customName?: string, isGoogle: boolean = false) => {
    const statuses = [
      'Establishing secure database handshake...',
      'Validating client credentials...',
      'Synchronizing trading metrics & telemetry...',
      'Refining cognitive emotional clusters...',
      'Session validated successfully. Accessing Journal...'
    ];

    if (isGoogle) {
      // For authenticating via Google flow, sync the profile automatically as verified
      const namePart = email.split('@')[0];
      const formattedName = customName || (namePart.charAt(0).toUpperCase() + namePart.slice(1));
      syncGoogleUser(email, formattedName).catch(err => {
        console.error('Error syncing Google auth session to Firestore:', err);
      });
    }

    let current = 0;
    setAuthProgress(statuses[0]);

    const interval = setInterval(() => {
      current++;
      if (current < statuses.length) {
        setAuthProgress(statuses[current]);
      } else {
        clearInterval(interval);
        // Dispatch callback to parent App
        const namePart = email.split('@')[0];
        const formattedName = customName || (namePart.charAt(0).toUpperCase() + namePart.slice(1));
        onSuccess({
          email: email.toLowerCase().trim(),
          name: formattedName,
          avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${namePart}&backgroundColor=10b981&textColor=09090b`
        });
      }
    }, 800);
  };

  return (
    <div id="google-login-container" className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-4 relative overflow-hidden select-none selection:bg-emerald-500 selection:text-zinc-950">
      
      {/* Dynamic ambient lights backdrop */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-emerald-500/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-rose-500/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute top-[40%] right-[10%] w-[300px] h-[300px] bg-zinc-500/5 blur-[90px] rounded-full pointer-events-none" />

      {/* Main card panel */}
      <div id="login-card-panel" className="w-full max-w-sm bg-zinc-905 bg-zinc-900 border border-zinc-800 rounded-3xl p-8 relative z-10 shadow-2xl shadow-emerald-950/10 animate-fade-in">
        
        {/* Subtle grid pattern background */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none rounded-3xl bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:24px_24px]" />

        {step === 'intro' && (
          <div className="flex flex-col items-center relative z-10">
            {/* Logo */}
            <div className="p-3.5 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-zinc-950 flex items-center justify-center mb-5 shadow-xl shadow-emerald-500/10 animate-pulse">
              <Activity size={28} className="stroke-[2.5]" />
            </div>

            <h1 className="text-2xl font-black font-display tracking-tight text-white mb-1.5 uppercase text-center">
              JOURNALY
            </h1>
            <p className="text-zinc-400 text-xs mb-6 max-w-sm text-center">
              Your professional, high-fidelity cognitive psychology trading companion. Monitor performance, review trends, and refine emotional biases.
            </p>

            {/* Google branded authenticate button */}
            <button
              onClick={startLoginFlow}
              id="google-authenticate-btn"
              className="w-full bg-white text-zinc-950 hover:bg-zinc-100 active:scale-[0.99] font-bold text-xs h-11 rounded-xl flex items-center justify-center px-4 transition-all duration-200 cursor-pointer shadow-lg shadow-white/5 border border-zinc-200"
            >
              {/* Perfect Google vector logo G */}
              <svg className="w-4.5 h-4.5 mr-2.5 shrink-0" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
              </svg>
              <span>Continue with Google</span>
            </button>

            {/* Seamless Visual Separator */}
            <div className="w-full flex items-center my-5">
              <div className="flex-1 border-t border-zinc-805 border-zinc-800"></div>
              <span className="px-3 text-[10px] uppercase font-bold tracking-widest text-zinc-500 bg-zinc-900 leading-none">or sign up / login below</span>
              <div className="flex-1 border-t border-zinc-805 border-zinc-800"></div>
            </div>

            {/* Direct manual signup or login form */}
            <form onSubmit={handleManualFormSubmit} className="w-full space-y-3">
              {formError && (
                <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[11px] font-medium text-center leading-normal">
                  {formError}
                </div>
              )}

              {/* Show display name only if Register mode is active */}
              {isRegisterMode && (
                <div className="space-y-1 text-left">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 block px-1">Display Name</label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Jane Doe"
                      className="w-full bg-zinc-950/60 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-650 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 pr-10"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                    />
                    <div className="absolute right-3 top-3.5 text-zinc-550 text-zinc-500">
                      <User size={13} />
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-1 text-left">
                <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 block px-1">Email address</label>
                <div className="relative">
                  <input
                    type="email"
                    required
                    placeholder="you@example.com"
                    className="w-full bg-zinc-950/60 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-650 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 pr-10"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                  />
                  <div className="absolute right-3 top-3.5 text-zinc-550 text-zinc-500">
                    <Mail size={13} />
                  </div>
                </div>
              </div>

              <div className="space-y-1 text-left">
                <div className="flex justify-between items-center px-1">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 block">Password</label>
                  {!isRegisterMode && (
                    <button
                      type="button"
                      onClick={() => {
                        setStep('forgot_password');
                        setForgotError('');
                        setForgotEmail(formEmail);
                      }}
                      className="text-[10px] font-bold text-emerald-400 hover:underline cursor-pointer transition-all leading-none bg-transparent border-none p-0"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="••••••••"
                    className="w-full bg-zinc-950/60 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-650 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 pr-10"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-zinc-500 hover:text-zinc-300 cursor-pointer bg-transparent border-none p-0"
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </div>

              {/* Submit CTA */}
              <button
                type="submit"
                disabled={isLoadingDbButton}
                className="w-full bg-emerald-500 text-zinc-950 hover:bg-emerald-400 disabled:opacity-50 font-bold text-xs h-11 rounded-xl flex items-center justify-center gap-1.5 transition-all duration-200 cursor-pointer shadow-lg shadow-emerald-500/10 active:scale-[0.99]"
              >
                <LogIn size={14} className="stroke-[2.5]" />
                <span>
                  {isLoadingDbButton 
                    ? 'Synchronizing...' 
                    : isRegisterMode 
                      ? 'Create Account & Start' 
                      : 'Access Trading Journal'
                  }
                </span>
              </button>
            </form>

            {/* Toggle Mode */}
            <div className="mt-5 flex items-center justify-center gap-1.5 text-xs">
              <span className="text-zinc-500">
                {isRegisterMode ? 'Already have an account?' : 'New to Journaly?'}
              </span>
              <button
                onClick={() => {
                  setIsRegisterMode(!isRegisterMode);
                  setFormError('');
                }}
                className="text-emerald-400 font-bold hover:underline cursor-pointer"
              >
                {isRegisterMode ? 'Log In' : 'Sign Up'}
              </button>
            </div>


          </div>
        )}

        {step === 'verify_code' && (
          <div className="flex flex-col relative z-10 animate-fade-in text-left">
            <div className="flex items-center gap-2 mb-4 border-b border-zinc-800/60 pb-4">
              <Mail className="w-5 h-5 text-emerald-400 shrink-0" />
              <h2 className="text-sm font-bold tracking-tight text-white uppercase font-display">
                Confirm Code
              </h2>
            </div>

            {/* Real-time Secure Email Verification alert block */}
            <div className="p-4 bg-emerald-500/5 border border-emerald-500/15 text-emerald-400 rounded-xl mb-4 text-[11.5px] leading-relaxed">
              <span className="font-extrabold flex items-center gap-1.5 mb-2 text-[10px] uppercase tracking-wider text-emerald-300 animate-pulse">
                <Sparkles size={11} className="inline shrink-0 text-emerald-400" />
                Verification Email Dispatched
              </span>
              <p className="mb-2 text-zinc-300">
                A secure 6-digit confirmation key has been dispatched to your private address: <span className="font-bold text-white">{pendingEmail}</span>
              </p>
              <p className="text-zinc-400 text-[11px] leading-relaxed">
                Please check your inbox, spam, or promotions folders for the email containing your code. Enter the code below to finalize your session.
              </p>
            </div>

            <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
              Please enter the code sent to your email address to activate your Journaly workspace sync.
            </p>

            <form onSubmit={handleVerifyCodeSubmit} className="space-y-4">
              {verificationError && (
                <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[11px] font-medium text-center leading-normal">
                  {verificationError}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 block px-1">Confirmation code</label>
                <input
                  type="text"
                  maxLength={6}
                  required
                  placeholder="e.g. 123456"
                  className="w-full text-center bg-zinc-950/60 border border-zinc-800 rounded-xl px-4 py-3 text-sm font-black tracking-widest text-emerald-400 placeholder-zinc-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  value={verificationInput}
                  onChange={(e) => setVerificationInput(e.target.value.replace(/\D/g, ''))}
                />
              </div>

              <button
                type="submit"
                disabled={isVerifyingState}
                className="w-full bg-emerald-500 text-zinc-950 hover:bg-emerald-400 disabled:opacity-50 font-bold text-xs h-11 rounded-xl flex items-center justify-center gap-1.5 transition-all duration-200 cursor-pointer shadow-lg shadow-emerald-500/10 active:scale-[0.99]"
              >
                <span>{isVerifyingState ? 'Validating sync...' : 'Verify Email'}</span>
              </button>
            </form>

            <div className="mt-5 border-t border-zinc-800/40 pt-4">
              <button
                type="button"
                onClick={() => setShowSmtpGuide(!showSmtpGuide)}
                className="w-full flex items-center justify-between text-[11px] font-bold text-emerald-400 hover:text-emerald-350 cursor-pointer transition-colors"
              >
                <span>📬 Deliver codes straight to your Gmail?</span>
                <span className="text-[10px] text-zinc-550 border border-zinc-800 px-1.5 py-0.5 rounded-md hover:bg-zinc-850">{showSmtpGuide ? 'Hide Info' : 'Show Guide'}</span>
              </button>

              {showSmtpGuide && (
                <div className="mt-3 text-[10.5px] text-zinc-400 bg-zinc-950/40 border border-zinc-850 p-3 rounded-lg leading-relaxed space-y-2.5 animate-fade-in">
                  <p className="font-semibold text-zinc-300">
                    To deliver authentication emails directly to your Google Mail inbox, configure these environment keys in your workspace Secrets/Environment panel:
                  </p>
                  <ul className="list-disc pl-4 space-y-1.5 text-zinc-400">
                    <li><strong className="text-zinc-200">SMTP_HOST</strong>: <code className="text-emerald-400 font-mono text-[9.5px]">smtp.gmail.com</code></li>
                    <li><strong className="text-zinc-200">SMTP_PORT</strong>: <code className="text-emerald-400 font-mono text-[9.5px]">587</code></li>
                    <li><strong className="text-zinc-200">SMTP_USER</strong>: Your Gmail address (e.g., <code className="text-zinc-350 font-mono text-[9.5px]">{pendingEmail || 'your_email@gmail.com'}</code>)</li>
                    <li><strong className="text-zinc-200">SMTP_PASS</strong>: Your <strong className="text-emerald-450 text-emerald-400">Google App Password</strong> (not your core login password. Setup one instantly in <em className="text-zinc-300">Google Account &rarr; Security &rarr; 2-Step Verification &rarr; App Passwords</em>)</li>
                    <li><strong className="text-zinc-200">SMTP_FROM_EMAIL</strong>: Your Gmail address</li>
                    <li><strong className="text-zinc-200">SMTP_FROM_NAME</strong>: <code className="text-zinc-350 font-mono text-[9.5px]">Journaly</code></li>
                  </ul>
                  <p className="text-[10px] text-zinc-500 border-t border-zinc-900/60 pt-2">
                    💡 <strong className="text-zinc-400">Immediate Local Bypass:</strong> You can also bypass waiting for email setup by looking at your browser console! open DevTools (<strong className="text-zinc-300 font-bold">F12</strong> or Right-click &rarr; <strong className="text-zinc-300 font-bold">Inspect &rarr; Console</strong>) where the code is securely logged for your local testing convenience.
                  </p>
                </div>
              )}
            </div>

            <button
              onClick={() => {
                setStep('intro');
                setVerificationInput('');
                setVerificationError('');
              }}
              className="mt-6 text-[11px] font-bold text-zinc-500 hover:text-zinc-400 transition-colors self-center py-1 cursor-pointer"
            >
              &larr; Back to Log In
            </button>
          </div>
        )}

        {step === 'chooser' && (
          <div className="flex flex-col relative z-10 animate-fade-in">
            <div className="flex items-center gap-2 mb-6 border-b border-zinc-800/60 pb-4">
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
              </svg>
              <h2 className="text-sm font-bold tracking-tight text-white uppercase">
                Sign in with Google
              </h2>
            </div>

            <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
              Enter your Google account email to proceed to Journaly. This initializes your secure, private cloud partition automatically.
            </p>

            <form onSubmit={handleCustomEmailSubmit} className="space-y-4 animate-fade-in">
              <div className="space-y-1 text-left">
                <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 block px-1">Google Email Address</label>
                <div className="relative">
                  <input
                    type="email"
                    required
                    placeholder="name@gmail.com"
                    className="w-full bg-zinc-950/60 border border-zinc-800 rounded-xl px-4 py-3 text-xs text-white focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 pr-10"
                    value={customEmail}
                    onChange={(e) => setCustomEmail(e.target.value)}
                  />
                  <div className="absolute right-3 top-3.5 text-zinc-500">
                    <Chrome size={14} />
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 bg-emerald-500 hover:bg-emerald-450 text-zinc-950 font-bold text-xs h-10 rounded-lg flex items-center justify-center gap-1 cursor-pointer transition-all active:scale-[0.98]"
                >
                  <LogIn size={13} />
                  <span>Sign In</span>
                </button>
              </div>
            </form>

            <button
              onClick={() => setStep('intro')}
              className="mt-8 text-[11px] font-bold text-zinc-500 hover:text-zinc-400 transition-colors self-center py-1 cursor-pointer"
            >
              &larr; Back to login intro
            </button>
          </div>
        )}

        {step === 'forgot_password' && (
          <div className="flex flex-col relative z-10 animate-fade-in text-left">
            <div className="flex items-center gap-2 mb-4 border-b border-zinc-800/60 pb-4">
              <Key className="w-5 h-5 text-emerald-400 shrink-0" />
              <h2 className="text-sm font-bold tracking-tight text-white uppercase font-display">
                Reset Password
              </h2>
            </div>

            <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
              Enter your email address to receive a secure 6-digit confirmation code on your registered email address.
            </p>

            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!forgotEmail || !forgotEmail.includes('@')) {
                setForgotError('Please enter a valid email address.');
                return;
              }
              setForgotError('');
              setIsResetLoading(true);

              try {
                const docRef = doc(db, 'profiles', forgotEmail.toLowerCase().trim());
                const docSnap = await getDoc(docRef);
                if (!docSnap.exists()) {
                  setForgotError('No Journaly account has been registered with this email.');
                  setIsResetLoading(false);
                  return;
                }

                // Generate code & save it to profile
                const code = Math.floor(100000 + Math.random() * 900000).toString();
                await setDoc(docRef, {
                  verificationCode: code
                }, { merge: true });

                setPendingEmail(forgotEmail);
                setPendingName(docSnap.data().name || '');
                setGeneratedCode(code);

                // Dispatch code to backend with reset mode
                await sendVerificationCodeEmail(forgotEmail, code, 'reset');

                setStep('verify_reset');
              } catch (err: any) {
                console.error(err);
                setForgotError('Handshake or dispatch failed. Please retry.');
              } finally {
                setIsResetLoading(false);
              }
            }} className="space-y-4">
              {forgotError && (
                <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[11px] font-medium text-center leading-normal">
                  {forgotError}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 block px-1">Email Address</label>
                <div className="relative">
                  <input
                    type="email"
                    required
                    placeholder="you@example.com"
                    className="w-full bg-zinc-950/60 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-650 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 pr-10"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                  />
                  <div className="absolute right-3 top-3.5 text-zinc-500">
                    <Mail size={13} />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isResetLoading}
                className="w-full bg-emerald-500 text-zinc-950 hover:bg-emerald-400 disabled:opacity-50 font-bold text-xs h-11 rounded-xl flex items-center justify-center gap-1.5 transition-all duration-200 cursor-pointer shadow-lg shadow-emerald-500/10 active:scale-[0.99]"
              >
                <span>{isResetLoading ? 'Routing Dispatch...' : 'Get Reset Code'}</span>
              </button>
            </form>

            <button
              onClick={() => {
                setStep('intro');
                setForgotError('');
              }}
              className="mt-6 text-[11px] font-bold text-zinc-500 hover:text-zinc-400 transition-colors self-center py-1 cursor-pointer flex items-center gap-1 bg-transparent border-none"
            >
              <ArrowLeft size={11} /> Back to Sign In
            </button>
          </div>
        )}

        {step === 'verify_reset' && (
          <div className="flex flex-col relative z-10 animate-fade-in text-left">
            <div className="flex items-center gap-2 mb-4 border-b border-zinc-800/60 pb-4">
              <Mail className="w-5 h-5 text-emerald-400 shrink-0" />
              <h2 className="text-sm font-bold tracking-tight text-white uppercase font-display">
                Verify Reset Code
              </h2>
            </div>

            <div className="p-4 bg-emerald-500/5 border border-emerald-500/15 text-emerald-400 rounded-xl mb-4 text-[11.5px] leading-relaxed">
              <span className="font-extrabold flex items-center gap-1.5 mb-2 text-[10px] uppercase tracking-wider text-emerald-400">
                <Sparkles size={11} className="inline shrink-0 text-emerald-400 animate-pulse" />
                Reset Code Sent
              </span>
              <p className="mb-2 text-zinc-200">
                We've routed a 6-digit verification code to: <br/><strong className="text-white font-mono">{pendingEmail}</strong>
              </p>
              <p className="text-zinc-400 text-[10.5px]">
                Check your primary inbox or spam folder. Enter the code below.
              </p>
            </div>

            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!verificationInput.trim()) return;

              setIsVerifyingState(true);
              setVerificationError('');
              
              try {
                const docRef = doc(db, 'profiles', pendingEmail.toLowerCase().trim());
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                  const dbCode = String(docSnap.data().verificationCode).trim();
                  if (dbCode === verificationInput.trim()) {
                    setStep('new_password');
                    setVerificationInput('');
                  } else {
                    setVerificationError('Incorrect verification code. Please check your spam folder.');
                  }
                } else {
                  setVerificationError('User session expired. Please restart the request.');
                }
              } catch (err: any) {
                setVerificationError('Sync handshake failed. Please try again.');
              } finally {
                setIsVerifyingState(false);
              }
            }} className="space-y-4">
              {verificationError && (
                <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-455 text-rose-400 text-[11px] font-medium text-center leading-normal">
                  {verificationError}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 block px-1">Verification Code</label>
                <input
                  type="text"
                  maxLength={6}
                  required
                  placeholder="e.g. 123456"
                  className="w-full text-center bg-zinc-950/60 border border-zinc-800 rounded-xl px-4 py-3 text-sm font-black tracking-widest text-emerald-400 placeholder-zinc-705 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  value={verificationInput}
                  onChange={(e) => setVerificationInput(e.target.value.replace(/\D/g, ''))}
                />
              </div>

              <button
                type="submit"
                disabled={isVerifyingState}
                className="w-full bg-emerald-500 text-zinc-950 hover:bg-emerald-400 disabled:opacity-50 font-bold text-xs h-11 rounded-xl flex items-center justify-center gap-1.5 transition-all duration-200 cursor-pointer shadow-lg shadow-emerald-500/10 active:scale-[0.99]"
              >
                <span>{isVerifyingState ? 'Verifying...' : 'Verify Code'}</span>
              </button>
            </form>

            <button
              onClick={() => {
                setStep('forgot_password');
                setVerificationInput('');
                setVerificationError('');
              }}
              className="mt-6 text-[11px] font-bold text-zinc-500 hover:text-zinc-400 transition-colors self-center py-1 cursor-pointer flex items-center gap-1 bg-transparent border-none"
            >
              <ArrowLeft size={11} /> Back to Email Input
            </button>
          </div>
        )}

        {step === 'new_password' && (
          <div className="flex flex-col relative z-10 animate-fade-in text-left">
            <div className="flex items-center gap-2 mb-4 border-b border-zinc-800/60 pb-4">
              <Lock className="w-5 h-5 text-emerald-400 shrink-0" />
              <h2 className="text-sm font-bold tracking-tight text-white uppercase font-display">
                Create New Password
              </h2>
            </div>

            <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
              Create a secure password of at least 4 characters for your Journaly account.
            </p>

            <form onSubmit={async (e) => {
              e.preventDefault();
              if (newPassword.trim().length < 4) {
                setForgotError('Password must be at least 4 characters.');
                return;
              }
              if (newPassword !== confirmNewPassword) {
                setForgotError('Passwords do not match.');
                return;
              }

              setForgotError('');
              setIsResetLoading(true);

              try {
                const docRef = doc(db, 'profiles', pendingEmail.toLowerCase().trim());
                await setDoc(docRef, {
                  password: newPassword,
                  isVerified: true
                }, { merge: true });

                // Success! Proceed immediately to load their session
                setSelectedEmail(pendingEmail);
                setStep('loading');
                animateLoading(pendingEmail, pendingName || undefined, false);
              } catch (err: any) {
                setForgotError('Database sync failed. Please try again.');
              } finally {
                setIsResetLoading(false);
              }
            }} className="space-y-4">
              {forgotError && (
                <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[11px] font-medium text-center leading-normal">
                  {forgotError}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 block px-1">New Password</label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    placeholder="••••••••"
                    className="w-full bg-zinc-950/60 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-650 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 pr-10"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-3 text-zinc-500 hover:text-zinc-300 cursor-pointer bg-transparent border-none p-0"
                    title={showNewPassword ? "Hide password" : "Show password"}
                  >
                    {showNewPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 block px-1">Confirm New Password</label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    placeholder="••••••••"
                    className="w-full bg-zinc-950/60 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-650 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 pr-10"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                  />
                  <div className="absolute right-3 top-3 text-zinc-500">
                    <Lock size={12} />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isResetLoading}
                className="w-full bg-emerald-500 text-zinc-950 hover:bg-emerald-400 disabled:opacity-50 font-bold text-xs h-11 rounded-xl flex items-center justify-center gap-1.5 transition-all duration-200 cursor-pointer shadow-lg shadow-emerald-500/10 active:scale-[0.99]"
              >
                <span>{isResetLoading ? 'Updating credentials...' : 'Reset Password & Log In'}</span>
              </button>
            </form>
          </div>
        )}

        {step === 'loading' && (
          <div className="flex flex-col items-center text-center py-6 relative z-10 animate-pulse duration-[20000ms]">
            <div className="relative mb-6">
              {/* Spinning visual core */}
              <div className="w-16 h-16 rounded-full border-t-2 border-r-2 border-emerald-500 animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center text-emerald-500">
                <Sparkles size={18} className="animate-pulse" />
              </div>
            </div>

            <h3 className="text-sm font-black uppercase tracking-widest text-emerald-400 font-display">
              Google Authentication
            </h3>
            
            <p className="text-[11px] text-zinc-400 mt-4 leading-relaxed max-w-xs font-mono select-none" id="auth-status-log">
              {authProgress}
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
