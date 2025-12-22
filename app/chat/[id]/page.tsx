"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { ArrowLeft, Send, Trash2, Download } from "lucide-react";

import { auth } from "@/lib/firebase";
import {
  getUserProfile,
  getChatDetails,
  sendMessage,
  subscribeToMessages,
  sendLockedImage,
  type UserProfile,
  type Chat,
  type Message,
  clearChatMessagesClient,
} from "@/lib/firebase-utils";

import { decryptImage } from "@/lib/crypto/imageCrypto";
import { hashPassword } from "@/lib/crypto/passwordCrypto";

import PasswordModal from "@/components/PasswordModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default function ChatConversationPage() {
  const { id: chatId } = useParams<{ id: string }>();
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [chat, setChat] = useState<Chat | null>(null);
  const [otherUser, setOtherUser] = useState<UserProfile | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const [decryptedImages, setDecryptedImages] = useState<
    Record<string, string>
  >({});
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [clickCounts, setClickCounts] = useState<Record<string, number>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  /* ================= LOAD CHAT ================= */

  useEffect(() => {
    if (!currentUser || !chatId) return;

    const load = async () => {
      const chatData = await getChatDetails(chatId);
      if (!chatData) {
        router.push("/chat");
        return;
      }
      setChat(chatData);

      const otherId = chatData.participants.find((id) => id !== currentUser.id);
      if (otherId) setOtherUser(await getUserProfile(otherId));
    };

    load();
  }, [currentUser, chatId, router]);

  /* ================= SUBSCRIBE ================= */

  useEffect(() => {
    if (!chatId) return;
    return subscribeToMessages(chatId, (msgs) => {
      setMessages(msgs);
      scrollToBottom();
    });
  }, [chatId]);

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 0);
  };

  /* ================= SEND TEXT ================= */

  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !currentUser || !chat || sending) return;

    setSending(true);
    await sendMessage(chat.id, currentUser.id, text.trim());
    setText("");
    setSending(false);
    inputRef.current?.focus();
  };

  /* ================= SEND IMAGE ================= */

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !chat || !currentUser) return;

    const password = prompt("Set password for this image");
    if (!password) return;

    setSending(true);
    await sendLockedImage(chat.id, currentUser.id, file, password);
    setSending(false);
    e.target.value = "";
  };

  /* ================= UNLOCK IMAGE ================= */

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

    setDecryptedImages((prev) => ({
      ...prev,
      [selectedMessage.id]: url,
    }));
    setShowPasswordModal(false);
  };

  /* ================= CLEAR CHAT (UI ONLY) ================= */

  const clearChatUI = async () => {
    if (
      !confirm(
        "This will permanently delete all messages for both users. Continue?"
      )
    )
      return;

    await clearChatMessagesClient(chatId);
    if (!confirm("Clear chat for this session?")) return;
    setMessages([]);
    setDecryptedImages({});
  };

  if (!currentUser || !chat || !otherUser) return null;

  const initials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* ================= HEADER ================= */}
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/chat")}
          >
            <ArrowLeft />
          </Button>
          <Avatar>
            <AvatarFallback>{initials(otherUser.name)}</AvatarFallback>
          </Avatar>
          <div className="font-semibold">{otherUser.name}</div>
        </div>

        <Button
          variant="ghost"
          size="icon"
          title="Clear chat"
          onClick={clearChatUI}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </header>

      {/* ================= MESSAGES ================= */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {messages.map((msg) => {
          const isOwn = msg.senderId === currentUser.id;

          return (
            <div
              key={msg.id}
              className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
            >
              <div className="max-w-[75%] rounded-xl bg-muted px-4 py-2 space-y-1">
                {msg.type === "image" ? (
                  decryptedImages[msg.id] ? (
                    <>
                      <img
                        src={decryptedImages[msg.id]}
                        className="rounded-lg max-w-xs"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="flex gap-1"
                        onClick={() => {
                          const a = document.createElement("a");
                          a.href = decryptedImages[msg.id];
                          a.download = "image";
                          a.click();
                        }}
                      >
                        <Download className="h-4 w-4" />
                        Download
                      </Button>
                    </>
                  ) : (
                    <div
                      className="cursor-pointer select-none text-4xl"
                      onClick={() => {
                        setClickCounts((prev) => {
                          const count = (prev[msg.id] ?? 0) + 1;
                          if (count === 3) {
                            setSelectedMessage(msg);
                            setShowPasswordModal(true);
                            return { ...prev, [msg.id]: 0 };
                          }
                          return { ...prev, [msg.id]: count };
                        });
                      }}
                    >
                      😩
                    </div>
                  )
                ) : (
                  <p>{msg.text}</p>
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* ================= INPUT (FIXED BOTTOM) ================= */}
      <div className="sticky bottom-0 border-t bg-background px-4 py-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
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

          <Button type="submit" disabled={!text.trim() || sending}>
            <Send />
          </Button>
        </form>
      </div>

      {showPasswordModal && (
        <PasswordModal
          onSubmit={unlockImage}
          onClose={() => setShowPasswordModal(false)}
        />
      )}
    </div>
  );
}
