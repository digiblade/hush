"use client";

import type React from "react";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Search, LogOut, MessageSquare } from "lucide-react";
import { auth } from "@/lib/firebase";
import { signOut, onAuthStateChanged } from "firebase/auth";
import {
  searchUserByEmail,
  createOrGetChat,
  subscribeToChats,
  getUserProfile,
  type UserProfile,
  type Chat,
} from "@/lib/firebase-utils";
import { requestNotificationPermission } from "@/lib/utils";

export default function ChatPage() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [searchEmail, setSearchEmail] = useState("");
  const [searchResult, setSearchResult] = useState<UserProfile | null>(null);
  const [searchError, setSearchError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }

      // Get user profile from Firestore
      const profile = await getUserProfile(user.uid);
      if (profile) {
        setCurrentUser(profile);
      }
    });

    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (!currentUser) return;

    const unsubscribe = subscribeToChats(currentUser.id, (updatedChats) => {
      setChats(updatedChats);
    });

    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearchError("");
    setSearchResult(null);
    setLoading(true);

    try {
      const user = await searchUserByEmail(searchEmail.trim());

      if (user && user.id !== currentUser?.id) {
        setSearchResult(user);
      } else if (user && user.id === currentUser?.id) {
        setSearchError("You cannot chat with yourself");
      } else {
        setSearchError("No user found with that email");
      }
    } catch (error) {
      setSearchError("Failed to search user");
    } finally {
      setLoading(false);
    }
  };

  const startChat = async (user: UserProfile) => {
    if (!currentUser) return;

    try {
      const chatId = await createOrGetChat(
        currentUser.id,
        currentUser.name,
        currentUser.email,
        user.id,
        user.name,
        user.email
      );

      router.push(`/chat/${chatId}`);
    } catch (error) {
      setSearchError("Failed to start chat");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push("/login");
    } catch (error) {
      console.error("Failed to log out:", error);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  if (!currentUser) {
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col bg-(--color-background)">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-(--color-border) bg-(--color-surface) px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MessageSquare className="h-6 w-6 text-(--color-primary-light)" />
            <h1 className="text-xl font-bold text-(--color-text)">Chats</h1>
          </div>
          <Button
            onClick={handleLogout}
            variant="ghost"
            size="icon"
            className="text-(--color-text-muted) hover:text-(--color-text) hover:bg-(--color-surface-light)"
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {/* Search Section */}
      <div className="border-b border-(--color-border) bg-(--color-surface) p-4">
        <form onSubmit={handleSearch} className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--color-text-muted)" />
              <Input
                type="email"
                value={searchEmail}
                onChange={(e) => setSearchEmail(e.target.value)}
                placeholder="Search by exact email..."
                disabled={loading}
                className="w-full bg-(--color-background) border-(--color-border) text-(--color-text) placeholder:text-(--color-text-muted) pl-10"
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="bg-(--color-primary) hover:bg-(--color-primary-dark) text-white px-6"
            >
              {loading ? "..." : "Search"}
            </Button>
          </div>

          {searchError && (
            <div className="text-sm text-(--color-error)">{searchError}</div>
          )}

          {searchResult && (
            <div
              onClick={() => startChat(searchResult)}
              className="flex cursor-pointer items-center gap-3 rounded-lg bg-(--color-background) p-3 hover:bg-(--color-surface-light) transition-colors"
            >
              <Avatar className="h-10 w-10 bg-(--color-primary)">
                <AvatarFallback className="bg-(--color-primary) text-white text-sm">
                  {getInitials(searchResult.name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-(--color-text)">
                  {searchResult.name}
                </div>
                <div className="text-sm text-(--color-text-muted) truncate">
                  {searchResult.email}
                </div>
              </div>
              <Button
                size="sm"
                className="bg-(--color-primary) hover:bg-(--color-primary-dark) text-white"
              >
                Chat
              </Button>
            </div>
          )}
        </form>
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto">
        {chats.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <MessageSquare className="h-12 w-12 text-(--color-text-muted) mb-3" />
            <p className="text-(--color-text-muted) text-balance">
              No chats yet. Search for someone by email to start chatting!
            </p>
          </div>
        ) : (
          <div className="divide-y divide-(--color-border)">
            {chats.map((chat) => {
              const otherUserId = chat.participants.find(
                (id) => id !== currentUser.id
              );
              const otherUserName = otherUserId
                ? chat.participantNames[otherUserId]
                : "Unknown";
              const otherUserEmail = otherUserId
                ? chat.participantEmails[otherUserId]
                : "";

              return (
                <div
                  key={chat.id}
                  onClick={() => router.push(`/chat/${chat.id}`)}
                  className="flex cursor-pointer items-center gap-3 p-4 hover:bg-(--color-surface) transition-colors"
                >
                  <Avatar className="h-12 w-12 bg-(--color-primary)">
                    <AvatarFallback className="bg-(--color-primary) text-white">
                      {getInitials(otherUserName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-(--color-text)">
                      {otherUserName}
                    </div>
                    {/* <div className="text-sm text-(--color-text-muted) truncate">
                      {chat.lastMessage || "No messages yet"}
                    </div> */}
                  </div>
                  {chat.lastMessageTime && (
                    <div className="text-xs text-(--color-text-muted)">
                      {chat.lastMessageTime.toDate().toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
