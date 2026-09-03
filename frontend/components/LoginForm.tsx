"use client";

import { useCallback, useEffect, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleProcessing, setIsGoogleProcessing] = useState(false);

  // On return from the Emergent Google auth redirect, the URL carries #session_id=...; exchange it
  // server-side (which enforces the @rumik.ai allowlist and sets the session cookie), then continue.
  useEffect(() => {
    const match = window.location.hash.match(/session_id=([^&]+)/);
    const rawSessionId = match?.[1];
    if (!rawSessionId) return;
    const sessionId = decodeURIComponent(rawSessionId);
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    setIsGoogleProcessing(true);
    void (async () => {
      try {
        const response = await fetch("/api/auth/google", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        const body = (await response.json()) as { ok: boolean; error?: { message: string } };
        if (!response.ok || !body.ok) {
          setError(body.error?.message ?? "Google sign-in failed.");
          setIsGoogleProcessing(false);
          return;
        }
        const next = searchParams.get("next") ?? "/";
        router.push(next);
        router.refresh();
      } catch {
        setError("Could not reach the server. Check your connection and try again.");
        setIsGoogleProcessing(false);
      }
    })();
  }, [router, searchParams]);

  const handleGoogleSignIn = useCallback(() => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/login";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  }, []);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      setIsSubmitting(true);
      try {
        const response = await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });
        const body = (await response.json()) as { ok: boolean; error?: { message: string } };
        if (!response.ok || !body.ok) {
          setError(body.error?.message ?? "Incorrect password.");
          return;
        }
        const next = searchParams.get("next") ?? "/";
        router.push(next);
        router.refresh();
      } catch {
        setError("Could not reach the server. Check your connection and try again.");
      } finally {
        setIsSubmitting(false);
      }
    },
    [password, router, searchParams],
  );

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-3xl border border-ink/10 bg-paper-surface p-8 shadow-sm">
      <h1 className="text-lg font-extrabold tracking-tight text-ink">ira arr/mrr dashboard</h1>
      <p className="mt-1 text-sm text-ink/60">enter the shared password to continue</p>

      <label htmlFor="password" className="mt-6 block text-sm font-medium text-ink/70">
        password
      </label>
      <input
        id="password"
        type="password"
        autoFocus
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        className="mt-1 w-full rounded-xl border border-ink/20 bg-paper px-3 py-2 text-sm text-ink focus:border-ink/60 focus:outline-none"
      />

      {error && <p className="mt-3 text-sm text-negative">{error}</p>}

      <button
        type="submit"
        disabled={isSubmitting || isGoogleProcessing || password.length === 0}
        data-testid="login-password-submit"
        className="mt-6 w-full rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper disabled:opacity-50"
      >
        {isSubmitting ? "checking..." : "unlock"}
      </button>

      <div className="my-5 flex items-center gap-3 text-xs text-ink/40">
        <span className="h-px flex-1 bg-ink/10" />
        or
        <span className="h-px flex-1 bg-ink/10" />
      </div>

      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={isSubmitting || isGoogleProcessing}
        data-testid="login-google-button"
        className="flex w-full items-center justify-center gap-2 rounded-full border border-ink/20 bg-paper px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-ink/5 disabled:opacity-50"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
          <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z" />
        </svg>
        {isGoogleProcessing ? "signing in..." : "sign in with google"}
      </button>

      <p className="mt-4 text-center text-xs text-ink/40">google access is limited to @rumik.ai accounts</p>

    </form>
  );
}
