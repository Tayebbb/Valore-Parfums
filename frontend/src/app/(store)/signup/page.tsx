"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/store/auth";
import { Eye, EyeOff, ArrowRight } from "lucide-react";

export default function SignupPage() {
  const router = useRouter();
  const { signup, googleSignIn } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name || !email || !password) { setError("Name, email, and password are required"); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters"); return; }
    if (password !== confirm) { setError("Passwords do not match"); return; }
    setLoading(true);
    try {
      const error = await signup(name, email, phone, password);
      if (error) { setError(error); setLoading(false); return; }
      router.push("/");
    } catch {
      setError("Something went wrong");
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError("");
    setGoogleLoading(true);
    try {
      const { signInWithGooglePopup } = await import("@/lib/firebase-client");
      const idToken = await signInWithGooglePopup();
      const authError = await googleSignIn(idToken);
      if (authError) {
        setError(authError);
        setGoogleLoading(false);
        return;
      }
      router.push("/");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Google sign-in failed";
      setError(message);
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 sm:px-6 md:px-[5%] py-10 sm:py-16">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8 sm:mb-10">
          <p className="text-[10px] uppercase tracking-[0.4em] text-[var(--gold)] mb-3">Join Valore Parfums</p>
          <h1 className="font-serif text-3xl sm:text-4xl font-light italic">Create Account</h1>
          <p className="text-sm text-[var(--text-muted)] mt-2">
            Sign up to track orders, save favorites, and more
          </p>
        </div>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading || googleLoading}
          className="w-full rounded border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-sm font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--gold)] disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-4 w-4" aria-hidden>
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.73 1.22 9.25 3.6l6.9-6.9C35.96 2.3 30.38 0 24 0 14.64 0 6.54 5.38 2.56 13.22l8.03 6.24C12.5 13.4 17.76 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.5 24.5c0-1.64-.15-3.21-.43-4.72H24v9.03h12.65c-.55 2.97-2.23 5.49-4.76 7.2l7.37 5.73C43.54 37.8 46.5 31.72 46.5 24.5z"/>
            <path fill="#FBBC05" d="M10.6 28.54A14.45 14.45 0 0 1 9.8 24c0-1.58.28-3.12.8-4.54l-8.03-6.24A23.88 23.88 0 0 0 0 24c0 3.84.92 7.48 2.57 10.78l8.03-6.24z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.92-2.13 15.89-5.8l-7.37-5.73c-2.05 1.37-4.68 2.18-8.52 2.18-6.24 0-11.5-3.9-13.4-9.46l-8.03 6.24C6.54 42.62 14.64 48 24 48z"/>
          </svg>
          {googleLoading ? "Connecting Google..." : "Continue with Google"}
        </button>

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-[var(--border)]" />
          <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">or</span>
          <div className="h-px flex-1 bg-[var(--border)]" />
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="bg-[rgba(248,113,113,0.08)] border border-[var(--error)] text-[var(--error)] text-sm px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div>
            <label className="text-[10px] uppercase tracking-[0.15em] text-[var(--text-muted)] mb-1.5 block">
              Full Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              className="w-full bg-[var(--bg-card)] border border-[var(--border)] rounded px-4 py-3 text-sm outline-none focus:border-[var(--gold)] transition-colors placeholder:text-[var(--text-muted)]"
            />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-[0.15em] text-[var(--text-muted)] mb-1.5 block">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full bg-[var(--bg-card)] border border-[var(--border)] rounded px-4 py-3 text-sm outline-none focus:border-[var(--gold)] transition-colors placeholder:text-[var(--text-muted)]"
            />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-[0.15em] text-[var(--text-muted)] mb-1.5 block">
              Phone Number <span className="normal-case tracking-normal text-[var(--text-muted)]">(optional)</span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+880 1XXX-XXXXXX"
              className="w-full bg-[var(--bg-card)] border border-[var(--border)] rounded px-4 py-3 text-sm outline-none focus:border-[var(--gold)] transition-colors placeholder:text-[var(--text-muted)]"
            />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-[0.15em] text-[var(--text-muted)] mb-1.5 block">
              Password
            </label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 6 characters"
                className="w-full bg-[var(--bg-card)] border border-[var(--border)] rounded px-4 py-3 text-sm outline-none focus:border-[var(--gold)] transition-colors placeholder:text-[var(--text-muted)] pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-[0.15em] text-[var(--text-muted)] mb-1.5 block">
              Confirm Password
            </label>
            <input
              type={showPw ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat your password"
              className="w-full bg-[var(--bg-card)] border border-[var(--border)] rounded px-4 py-3 text-sm outline-none focus:border-[var(--gold)] transition-colors placeholder:text-[var(--text-muted)]"
            />
          </div>

          <button
            type="submit"
            disabled={loading || googleLoading}
            className="w-full bg-[var(--gold)] text-black py-3 rounded text-sm uppercase tracking-wider font-medium hover:bg-[var(--gold-hover)] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? "Creating Account..." : <>Create Account <ArrowRight size={14} /></>}
          </button>
        </form>

        <div className="gold-line my-6 sm:my-8" />

        <p className="text-center text-sm text-[var(--text-muted)]">
          Already have an account?{" "}
          <Link href="/login" className="text-[var(--gold)] hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
