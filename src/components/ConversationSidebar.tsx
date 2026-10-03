import { MessageSquare, PanelLeftClose, PanelLeftOpen, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { useNow } from "../hooks/useNow";
import { relativeTime, type Conversation } from "../lib/conversationStore";

interface ConversationSidebarProps {
  conversations: Array<Pick<Conversation, "id" | "title" | "updatedAt">>;
  activeId: string;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  /** Drawer state on small screens. */
  open: boolean;
  /** Closes the drawer (Esc, backdrop, picking a chat). */
  onClose: () => void;
  /** The collapse button next to "Recent": collapses on desktop, closes the drawer on phones. */
  onHide: () => void;
  /** Expand button shown on the collapsed desktop rail. */
  onShow: () => void;
}

export function ConversationSidebar({ conversations, activeId, onSelect, onDelete, open, onClose, onHide, onShow }: ConversationSidebarProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const now = useNow();

  return (
    <>
      <div className="sidebar-backdrop" data-open={open} onClick={onClose} aria-hidden="true" />
      <aside id="history" className="sidebar" data-open={open} aria-label="Chat history">
        <div className="sidebar-head">
          <h2 className="section-label">Recent</h2>
          <button type="button" className="icon-button sidebar-collapse" onClick={onHide} aria-label="Hide chat history" title="Hide chat history">
            <PanelLeftClose size={16} aria-hidden="true" />
          </button>
          {/* Only visible on the collapsed desktop rail (CSS), in the same spot as the collapse button. */}
          <button type="button" className="icon-button sidebar-expand" onClick={onShow} aria-label="Show chat history" title="Show chat history">
            <PanelLeftOpen size={16} aria-hidden="true" />
          </button>
        </div>
        {conversations.length ? (
          <ul className="history-list">
            {conversations.map((c) => (
              <li key={c.id} className="history-item" data-active={c.id === activeId}>
                <button
                  type="button"
                  className="history-open"
                  aria-current={c.id === activeId ? "page" : undefined}
                  onClick={() => {
                    onSelect(c.id);
                    onClose();
                  }}
                >
                  <span className="history-title">{c.title}</span>
                  <span className="history-time">{relativeTime(c.updatedAt, now)}</span>
                </button>
                <button type="button" className="icon-button history-delete" onClick={() => onDelete(c.id)} aria-label={`Delete "${c.title}"`}>
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="history-empty">
            <MessageSquare size={16} aria-hidden="true" />
            Your conversations will appear here. They're saved in this browser only.
          </p>
        )}
      </aside>
    </>
  );
}
