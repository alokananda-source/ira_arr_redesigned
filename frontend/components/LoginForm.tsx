"use client";

import { useCallback, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
        disabled={isSubmitting || password.length === 0}
        className="mt-6 w-full rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper disabled:opacity-50"
      >
        {isSubmitting ? "checking..." : "unlock"}
      </button>
    </form>
  );
}
