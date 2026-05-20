import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getMessages, sendMessage } from "@/api/messages";
import type { Message, MessageThreadProps } from "@/types";
import styles from "./MessageThread.module.scss";

export function MessageThread({
  offerId,
  currentUsername,
}: MessageThreadProps) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

  /*
   * Why refetchInterval: 3000?
   * We're using polling instead of WebSockets (Phase 1 simplicity decision).
   * Every 3 seconds the browser asks "any new messages?" — small payload,
   * acceptable latency for a negotiation chat. refetchIntervalInBackground:
   * false means we stop polling when the browser tab is hidden (saves requests).
   *
   * Why not `?since=` on the poll?
   * We could track the latest message timestamp and only fetch new ones.
   * For Phase 1 the thread is short enough that fetching all is fine. The
   * `since` param is there on the backend for future optimisation.
   */
  const { data: messages = [] } = useQuery({
    queryKey: ["messages", offerId],
    queryFn: () => getMessages(offerId),
    refetchInterval: 3000,
    refetchIntervalInBackground: false,
    staleTime: 0,
  });

  // Auto-scroll to the bottom whenever new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const { mutate: submit, isPending } = useMutation({
    mutationFn: () => sendMessage(offerId, { content: draft.trim() }),
    onSuccess: () => {
      setDraft("");
      setSendError(null);
      void queryClient.invalidateQueries({ queryKey: ["messages", offerId] });
    },
    onError: (err: Error) => {
      setSendError(err.message ?? t("messages.sendError"));
    },
  });

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Ctrl/Cmd + Enter sends (keeps Shift+Enter for newlines intuitive)
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      if (canSend) submit();
    }
  }

  const canSend = draft.trim().length > 0 && !isPending;

  return (
    <div className={styles.thread}>
      <h3 className={styles.title}>{t("messages.title")}</h3>

      <div
        className={styles.messageList}
        aria-live="polite"
        aria-label={t("messages.title")}
      >
        {messages.length === 0 && (
          <p className={styles.empty}>{t("messages.empty")}</p>
        )}

        {messages.map((msg: Message) => {
          const isOwn = msg.sender_username === currentUsername;
          const isSystem = msg.is_system_message;

          if (isSystem) {
            return (
              <div key={msg.id} className={styles.systemMsg}>
                {msg.content}
              </div>
            );
          }

          return (
            <div
              key={msg.id}
              className={`${styles.message} ${isOwn ? styles.own : styles.other}`}
            >
              {!isOwn && (
                <span className={styles.sender}>{msg.sender_username}</span>
              )}
              <div className={styles.bubble}>{msg.content}</div>
              <span className={styles.time}>
                {new Date(msg.created_at).toLocaleTimeString(undefined, {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>

      {sendError && <p className={styles.error}>{sendError}</p>}

      <div className={styles.compose}>
        <textarea
          className={styles.textarea}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("messages.placeholder")}
          rows={2}
          maxLength={2000}
          aria-label={t("messages.title")}
        />
        <button
          className={styles.sendBtn}
          onClick={() => submit()}
          disabled={!canSend}
          aria-label={t("messages.send")}
        >
          {t("messages.send")}
        </button>
      </div>
    </div>
  );
}
