"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
  ArrowLeft,
  Send,
  Trash2,
  Download,
  Bell,
} from "lucide-react";

import { auth } from "@/lib/firebase";
import {
  getUserProfile,
  getChatDetails,
  sendMessage,
  subscribeToMessages,
  sendLockedImage,
  clearChatMessagesClient,
  sendNudge,
  subscribeToBrowserNudges,
  subscribeToNudges,
  setUserOnline,
  setUserOffline,
  subscribeToPresence,
  type UserProfile,
  type Chat,
  type Message,
} from "@/lib/firebase-utils";

import { decryptImage } from "@/lib/crypto/imageCrypto";
import { hashPassword } from "@/lib/crypto/passwordCrypto";

import PasswordModal from "@/components/PasswordModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

/* ================= TIME FORMAT (SAFE) ================= */

function formatTimeHHmm(ts?: any) {
  if (!ts) return "";

  const d =
    typeof ts.toDate === "function"
      ? ts.toDate() // Firestore Timestamp
      : ts instanceof Date
      ? ts // optimistic Date
      : null;

  if (!d) return "";

  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");

  return `${hh}:${mm}`;
}

/* ================= TYPES ================= */

type UIMessage = Message & {
  _optimistic?: boolean;
};

/* ================= COMPONENT ================= */

export default function ChatConversationPage() {
  const { id: chatId } = useParams<{ id: string }>();
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [chat, setChat] = useState<Chat | null>(null);
  const [otherUser, setOtherUser] = useState<UserProfile | null>(null);

  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [text, setText] = useState("");

  const [isOnline, setIsOnline] = useState(false);
  const [lastSeen, setLastSeen] = useState<any>(null);

  const [nudgeFrom, setNudgeFrom] = useState<string | null>(null);
  const [lastNudgeAt, setLastNudgeAt] = useState(0);

  const [decryptedImages, setDecryptedImages] = useState<Record<string, string>>(
    {}
  );
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [clickCounts, setClickCounts] = useState<Record<string, number>>({});

  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ================= AUTH ================= */

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }
      setCurrentUser(await getUserProfile(user.uid));
    });
  }, [router]);

  /* ================= PRESENCE ================= */

  useEffect(() => {
    if (!currentUser) return;

    setUserOnline(currentUser.id);

    const goOffline = () => setUserOffline(currentUser.id);

    window.addEventListener("beforeunload", goOffline);
    document.addEventListener("visibilitychange", () => {
      document.hidden ? goOffline() : setUserOnline(currentUser.id);
    });

    return () => {
      goOffline();
      window.removeEventListener("beforeunload", goOffline);
    };
  }, [currentUser]);

  useEffect(() => {
    if (!otherUser) return;

    return subscribeToPresence(otherUser.id, (p) => {
      setIsOnline(p.online);
      setLastSeen(p.lastSeen);
    });
  }, [otherUser]);

  /* ================= LOAD CHAT ================= */

  useEffect(() => {
    if (!currentUser || !chatId) return;

    (async () => {
      const chatData = await getChatDetails(chatId);
      if (!chatData) {
        router.push("/chat");
        return;
      }

      setChat(chatData);
      const otherId = chatData.participants.find(
        (id) => id !== currentUser.id
      );
      if (otherId) setOtherUser(await getUserProfile(otherId));
    })();
  }, [currentUser, chatId, router]);

  /* ================= MESSAGES ================= */

  useEffect(() => {
    if (!chatId) return;

    return subscribeToMessages(chatId, (msgs) => {
      setMessages(msgs as UIMessage[]);
    });
  }, [chatId]);

  /* ================= NUDGES ================= */

  useEffect(() => {
    if (!chat || !currentUser) return;

    return subscribeToNudges(chat.id, currentUser.id, (from) => {
      setNudgeFrom(from);
      if (navigator.vibrate) navigator.vibrate(200);
      setTimeout(() => setNudgeFrom(null), 3000);
    });
  }, [chat, currentUser]);

  useEffect(() => {
    if (!chat || !currentUser || !otherUser) return;

    return subscribeToBrowserNudges(chat.id, currentUser.id, () => {
      if (Notification.permission === "granted") {
        new Notification("👋 Nudge", {
          body: `${otherUser.name} wants to chat`,
        });
      }
    });
  }, [chat, currentUser, otherUser]);

  /* ================= ACTIONS ================= */

  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !currentUser || !chat) return;

    const optimistic: UIMessage = {
      id: `tmp-${Date.now()}`,
      senderId: currentUser.id,
      text,
      type: "text",
      timestamp: new Date() as any,
      _optimistic: true,
    };

    setMessages((p) => [...p, optimistic]);
    setText("");
    inputRef.current?.focus();

    await sendMessage(chat.id, currentUser.id, optimistic.text!);
  };

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !chat || !currentUser) return;

    const password = prompt("Set password for image");
    if (!password) return;

    await sendLockedImage(chat.id, currentUser.id, file, password);
    e.target.value = "";
  };

  const unlockImage = async (password: string) => {
    if (!selectedMessage || !chat) return;

    const enteredHash = await hashPassword(password);
    if (enteredHash !== selectedMessage.passwordHash) {
      alert("Wrong password");
      return;
    }

    const url = await decryptImage(
      selectedMessage.imageUrl!,
      selectedMessage.iv!,
      chat.id,
      password
    );

    setDecryptedImages((p) => ({ ...p, [selectedMessage.id]: url }));
    setShowPasswordModal(false);
  };

  const clearChatUI = async () => {
    if (!confirm("Delete all messages for everyone?")) return;
    await clearChatMessagesClient(chatId);
    setMessages([]);
    setDecryptedImages({});
  };

  const handleNudge = async () => {
    const now = Date.now();
    if (now - lastNudgeAt < 10000) return;
    if (!chat || !currentUser || !otherUser) return;

    setLastNudgeAt(now);
    await sendNudge(chat.id, currentUser.id, otherUser.id);
  };

  /* ================= RENDER ================= */

  if (!currentUser || !chat || !otherUser) {
    return <div className="flex h-dvh items-center justify-center">Loading…</div>;
  }

  const initials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

  return (
    <div className="grid h-dvh grid-rows-[auto,1fr,auto] bg-background">
      {/* HEADER */}
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/chat")}>
            <ArrowLeft />
          </Button>
          <Avatar>
            <AvatarFallback>{initials(otherUser.name)}</AvatarFallback>
          </Avatar>
          <div>
            <div className="font-semibold">{otherUser.name}</div>
            <div className="text-xs text-muted-foreground">
              {isOnline
                ? "Online"
                : lastSeen
                ? `Last seen ${lastSeen.toDate().toLocaleTimeString()}`
                : "Offline"}
            </div>
          </div>
        </div>

        <div className="flex gap-1">
          <Button variant="ghost" size="icon" onClick={clearChatUI}>
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleNudge}>
            <Bell className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {nudgeFrom && (
        <div className="mx-4 my-2 rounded bg-yellow-100 px-3 py-2 text-sm">
          👋 {otherUser.name} nudged you
        </div>
      )}

      {/* MESSAGES */}
      <div className="overflow-y-auto px-4 py-3 space-y-4">
        {messages.map((msg) => {
          const isOwn = msg.senderId === currentUser.id;

          return (
            <div
              key={msg.id}
              className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
            >
              <div className="max-w-[75%] rounded-xl bg-muted px-4 py-2">
                {msg.type === "image" ? (
                  decryptedImages[msg.id] ? (
                    <>
                      <img
                        src={decryptedImages[msg.id]}
                        className="rounded-lg max-w-xs"
                      />
                      <div className="mt-1 flex justify-end gap-1 text-[10px] text-muted-foreground">
                        <span>{formatTimeHHmm(msg.timestamp)}</span>
                        {isOwn && <span>✓✓</span>}
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            const a = document.createElement("a");
                            a.href = decryptedImages[msg.id];
                            a.download = "image";
                            a.click();
                          }}
                        >
                          <Download className="h-3 w-3" />
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div
                      className="cursor-pointer text-4xl select-none"
                      onClick={() => {
                        setClickCounts((p) => {
                          const c = (p[msg.id] ?? 0) + 1;
                          if (c === 3) {
                            setSelectedMessage(msg);
                            setShowPasswordModal(true);
                            return { ...p, [msg.id]: 0 };
                          }
                          return { ...p, [msg.id]: c };
                        });
                      }}
                    >
                      😂😂😂
                    </div>
                  )
                ) : (
                  <>
                    <p>{msg.text}</p>
                    <div className="mt-1 flex justify-end gap-1 text-[10px] text-muted-foreground">
                      <span>{formatTimeHHmm(msg.timestamp)}</span>
                      {isOwn && (
                        <span>{msg._optimistic ? "✓" : "✓✓"}</span>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* INPUT */}
      <footer className="border-t px-4 py-3">
        <input
          ref={fileInputRef}
          type="file"
          hidden
          accept="image/*"
          onChange={handleImagePick}
        />

        <form onSubmit={handleSendText} className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => fileInputRef.current?.click()}
          >
            📷
          </Button>

          <Input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type a message"
          />

          <Button type="submit">
            <Send />
          </Button>
        </form>
      </footer>

      {showPasswordModal && (
        <PasswordModal
          onSubmit={unlockImage}
          onClose={() => setShowPasswordModal(false)}
        />
      )}
    </div>
  );
}
