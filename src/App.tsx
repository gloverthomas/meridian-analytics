import { AlertTriangle, PanelLeft, SquarePen } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { Organisation, SuggestedPrompt } from "../shared/contracts";
import { AccessGate } from "./components/AccessGate";
import { ChatThread } from "./components/ChatThread";
import { ConversationSidebar } from "./components/ConversationSidebar";
import { Composer } from "./components/Composer";
import { InsightsHero } from "./components/InsightsHero";
import { useConversations, type ConversationsApi } from "./hooks/useConversations";
import { useSidebar } from "./hooks/useSidebar";
import { abortConversation, useInsightsChat } from "./hooks/useInsightsChat";
import { api, ApiRequestError } from "./lib/api";

type Boot =
  | { status: "loading" }
  | { status: "locked" }
  | { status: "misconfigured" }
  | { status: "error" }
  | { status: "ready"; orgs: Organisation[]; prompts: SuggestedPrompt[] };

function useBootstrap(): [Boot, () => void] {
  const [boot, setBoot] = useState<Boot>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.orgs(), api.suggestedPrompts()])
      .then(([orgs, prompts]) => !cancelled && setBoot({ status: "ready", orgs, prompts }))
      .catch((error: unknown) => {
        if (cancelled) return;
        const status = error instanceof ApiRequestError ? error.status : 0;
        setBoot({ status: status === 401 ? "locked" : status === 503 ? "misconfigured" : "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const reload = useCallback(() => {
    setBoot({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);
  return [boot, reload];
}

function FullPageMessage({ title, body, onRetry }: { title: string; body: string; onRetry?: () => void }) {
  return (
    <main className="gate" role="alert">
      <AlertTriangle size={24} color="var(--status-bad)" aria-hidden="true" />
      <h1>{title}</h1>
      <p>{body}</p>
      {onRetry ? (
        <button type="button" className="text-button" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </main>
  );
}

interface ChatPaneProps {
  orgId: string | undefined;
  prompts: SuggestedPrompt[];
  conversationId: string;
  store: ConversationsApi;
}

/** One conversation's view. Remounted per conversation so the draft resets. */
function ChatPane({ orgId, prompts, conversationId, store }: ChatPaneProps) {
  const [draft, setDraft] = useState("");
  const chat = useInsightsChat(orgId, conversationId, store);
  const inThread = chat.entries.length > 0;
  const last = chat.entries.at(-1);
  // A question saved without an answer (page closed/reloaded mid-request).
  const interrupted = !chat.isSending && last?.role === "user" ? last.content : undefined;

  const ask = (query: string) => {
    setDraft("");
    void chat.send(query);
  };

  return (
    <div className="content" data-mode={inThread ? "thread" : "hero"}>
      <main className="main">
        {inThread ? (
          <>
            <h1 className="visually-hidden">Meridian Insights conversation</h1>
            <ChatThread
              entries={chat.entries}
              isSending={chat.isSending}
              progress={chat.progress}
              streaming={chat.streaming}
              interruptedQuestion={interrupted}
              onAsk={ask}
              onRetry={(q) => void chat.retry(q)}
              onConfirmAction={chat.confirmAction}
              onDismissAction={chat.dismissAction}
            />
          </>
        ) : (
          <InsightsHero draft={draft} onDraftChange={setDraft} onAsk={ask} prompts={prompts} disabled={chat.isSending} />
        )}
      </main>
      {inThread ? (
        <div className="dock">
          <Composer value={draft} onChange={setDraft} onSubmit={ask} disabled={chat.isSending} placeholder="Ask a follow-up…" />
        </div>
      ) : null}
    </div>
  );
}

function Workspace({ orgs, prompts }: { orgs: Organisation[]; prompts: SuggestedPrompt[] }) {
  // Single-org MVP: scope chat to the default org.
  const orgId = orgs[0]?.id;
  const history = useConversations();
  const sidebar = useSidebar();
  const { activeId, remove } = history;
  const isFresh = history.entriesOf(activeId).length === 0;
  const deleteConversation = useCallback(
    (id: string) => {
      abortConversation(id);
      remove(id);
    },
    [remove],
  );

  return (
    <div className="shell" data-sidebar={sidebar.collapsed ? "collapsed" : "expanded"}>
      <header className="topbar">
        <div className="topbar-start">
          <button
            type="button"
            className="icon-button menu-button"
            onClick={sidebar.show}
            aria-label="Open chat history"
            title="Open chat history"
            aria-expanded={sidebar.drawerOpen}
            aria-controls="history"
          >
            <PanelLeft size={18} aria-hidden="true" />
          </button>
          <a className="brand" href="/" aria-label="Meridian Insights home">
            <img src="/brand/liquid-mark.png" alt="" width={28} height={28} />
            <span className="brand-name">
              Liquid <span>Insights</span>
            </span>
          </a>
        </div>
        <button type="button" className="new-chat" onClick={history.startNew} disabled={isFresh}>
          <SquarePen size={16} aria-hidden="true" />
          <span className="new-chat-label">New conversation</span>
        </button>
      </header>

      <div className="layout">
        <ConversationSidebar
          conversations={history.conversations}
          activeId={activeId}
          onSelect={history.select}
          onDelete={deleteConversation}
          open={sidebar.drawerOpen}
          onClose={sidebar.closeDrawer}
          onHide={sidebar.hide}
          onShow={sidebar.show}
        />
        <ChatPane key={activeId} orgId={orgId} prompts={prompts} conversationId={activeId} store={history} />
      </div>
    </div>
  );
}

export default function App() {
  const [boot, reload] = useBootstrap();

  switch (boot.status) {
    case "loading":
      return (
        <main className="gate" aria-busy="true">
          <p className="kicker">
            <span className="kicker-dot" aria-hidden="true" />
            Loading Meridian Insights…
          </p>
        </main>
      );
    case "locked":
      return <AccessGate onUnlocked={reload} />;
    case "misconfigured":
      return <FullPageMessage title="Not set up yet" body="This deployment has no access control configured, so it's locked. An admin needs to set the access code and session secret." />;
    case "error":
      return <FullPageMessage title="Can't reach Insights" body="The Insights service didn't respond." onRetry={reload} />;
    case "ready":
      return <Workspace orgs={boot.orgs} prompts={boot.prompts} />;
  }
}
