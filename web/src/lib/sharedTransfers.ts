// Shares each tab's transfers with the user's other open tabs (same browser), so a duplicated
// tab shows uploads and downloads that are running somewhere else.
//
// Messages on the "chunky:transfers" BroadcastChannel:
//   hello – a tab just opened; every other tab replies with its current state
//   state – a tab's full transfer list (sent at most 4 times a second)
//   bye   – a tab is closing; its transfers disappear from the others

import { useEffect, useRef, useState } from "react";
import type { Transfer } from "../components/TransferPanel";

type Message =
  | { type: "hello" | "bye"; tabId: string; userId: string }
  | { type: "state"; tabId: string; userId: string; transfers: Transfer[] };

const CHANNEL = "chunky:transfers";
const SEND_EVERY_MS = 250;

export function useSharedTransfers(userId: string, local: Transfer[], onRemoteUploadDone: () => void) {
  const [tabId] = useState(() => crypto.randomUUID());
  const [remote, setRemote] = useState<Record<string, Transfer[]>>({});
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const channel = useRef<BroadcastChannel | null>(null);
  const latest = useRef(local);
  latest.current = local;
  const onDone = useRef(onRemoteUploadDone);
  onDone.current = onRemoteUploadDone;
  const finishedUploads = useRef(new Set<string>());
  const sendTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(CHANNEL);
    channel.current = ch;
    const post = (message: Message) => ch.postMessage(message);

    ch.onmessage = ({ data }: MessageEvent<Message>) => {
      // Ignore our own echoes and tabs signed in as someone else.
      if (data.tabId === tabId || data.userId !== userId) return;

      if (data.type === "hello") {
        post({ type: "state", tabId, userId, transfers: latest.current });
      } else if (data.type === "bye") {
        setRemote(({ [data.tabId]: _closed, ...rest }) => rest);
      } else if (data.type === "state") {
        // An upload finished in another tab: reload this tab's file list so the file appears here too.
        for (const t of data.transfers) {
          if (t.kind === "upload" && t.status === "done" && !finishedUploads.current.has(t.id)) {
            finishedUploads.current.add(t.id);
            onDone.current();
          }
        }
        setRemote((all) => ({ ...all, [data.tabId]: data.transfers }));
      }
    };

    post({ type: "hello", tabId, userId });
    const sayBye = () => post({ type: "bye", tabId, userId });
    addEventListener("pagehide", sayBye);
    return () => {
      sayBye();
      removeEventListener("pagehide", sayBye);
      ch.close();
      channel.current = null;
    };
  }, [tabId, userId]);

  // Tell the other tabs whenever this tab's transfers change, a few times a second at most.
  useEffect(() => {
    if (!channel.current || sendTimer.current) return;
    sendTimer.current = setTimeout(() => {
      sendTimer.current = null;
      channel.current?.postMessage({ type: "state", tabId, userId, transfers: latest.current } satisfies Message);
    }, SEND_EVERY_MS);
  }, [local, tabId, userId]);

  const remoteTransfers = Object.values(remote)
    .flat()
    .filter((t) => !dismissed.has(t.id))
    .map((t) => ({ ...t, remote: true }));

  // Hides other tabs' finished transfers from this tab's panel (they keep their own copy).
  const dismissFinished = () =>
    setDismissed(
      (all) =>
        new Set([...all, ...remoteTransfers.filter((t) => t.status === "done" || t.status === "error").map((t) => t.id)]),
    );

  return { remoteTransfers, dismissFinished };
}
