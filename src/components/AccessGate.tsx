import { useState, type FormEvent } from "react";
import { api, ApiRequestError } from "../lib/api";

interface AccessGateProps {
  onUnlocked: () => void;
}

/** Hosted deploys only: exchanges the shared access code for an HttpOnly session cookie. */
export function AccessGate({ onUnlocked }: AccessGateProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.createSession(code);
      onUnlocked();
    } catch (err) {
      const status = err instanceof ApiRequestError ? err.status : 0;
      setError(
        status === 401
          ? "That access code isn't right."
          : status === 429
            ? "Too many attempts. Wait a minute."
            : status === 403
              ? "This browser request was blocked as cross-site. Open the site directly at its address and try again."
              : "Couldn't sign in. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="gate">
      <p className="kicker">
        <span className="kicker-dot" aria-hidden="true" />
        Meridian demo · private
      </p>
      <h1>Meridian Insights</h1>
      <p>Enter the access code you were given to continue.</p>
      <form onSubmit={submit}>
        <label htmlFor="access-code" className="visually-hidden">
          Access code
        </label>
        <input
          id="access-code"
          className="field"
          type="password"
          autoComplete="current-password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? "access-error" : undefined}
          autoFocus
        />
        {error ? (
          <p id="access-error" className="field-error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="ask-button" disabled={busy || !code.trim()}>
          {busy ? "Checking…" : "Continue"}
        </button>
      </form>
    </main>
  );
}
