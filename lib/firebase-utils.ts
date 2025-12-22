import { db } from "./firebase"
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  addDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  type Timestamp,
  writeBatch
} from "firebase/firestore"


import { uploadEncryptedToCloudinary } from "./cloudinary"
import { encryptImage } from "./crypto/imageCrypto"
import { hashPassword } from "./crypto/passwordCrypto"



export type UserProfile = {
  id: string
  name: string
  email: string
  createdAt: Timestamp
}

export type Message = {
  id: string
  senderId: string
  text?: string            // optional
  type?: "text" | "image"  // new
  imageUrl?: string        // encrypted image URL
  iv?: number[]            // crypto IV
  passwordHash?: string    // hashed password
  locked?: boolean         // UI flag
  timestamp: Timestamp
}

export type Chat = {
  id: string
  participants: string[]
  participantNames: Record<string, string>
  participantEmails: Record<string, string>
  lastMessage?: string
  lastMessageTime?: Timestamp
  createdAt: Timestamp

}

// Create user profile in Firestore
export async function createUserProfile(userId: string, name: string, email: string) {
  const userRef = doc(db, "users", userId)
  await setDoc(userRef, {
    id: userId,
    name,
    email,
    createdAt: serverTimestamp(),
  })
}

// Get user profile by ID
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const userRef = doc(db, "users", userId)
  const userSnap = await getDoc(userRef)

  if (userSnap.exists()) {
    return userSnap.data() as UserProfile
  }
  return null
}

// Search user by exact email
export async function searchUserByEmail(email: string): Promise<UserProfile | null> {
  const usersRef = collection(db, "users")
  const q = query(usersRef, where("email", "==", email))
  const querySnapshot = await getDocs(q)

  if (!querySnapshot.empty) {
    return querySnapshot.docs[0].data() as UserProfile
  }
  return null
}

// Create or get existing chat between two users
export async function createOrGetChat(
  currentUserId: string,
  currentUserName: string,
  currentUserEmail: string,
  otherUserId: string,
  otherUserName: string,
  otherUserEmail: string,
): Promise<string> {
  const chatsRef = collection(db, "chats")

  // Check if chat already exists
  const q = query(chatsRef, where("participants", "array-contains", currentUserId))
  const querySnapshot = await getDocs(q)

  for (const doc of querySnapshot.docs) {
    const chat = doc.data() as Chat
    if (chat.participants.includes(otherUserId)) {
      return doc.id
    }
  }

  // Create new chat
  const newChatRef = await addDoc(chatsRef, {
    participants: [currentUserId, otherUserId],
    participantNames: {
      [currentUserId]: currentUserName,
      [otherUserId]: otherUserName,
    },
    participantEmails: {
      [currentUserId]: currentUserEmail,
      [otherUserId]: otherUserEmail,
    },
    createdAt: serverTimestamp(),
  })

  return newChatRef.id
}

// Send a message
export async function sendMessage(chatId: string, senderId: string, text: string) {
  const messagesRef = collection(db, "chats", chatId, "messages")
  const chatRef = doc(db, "chats", chatId)

  // Add message
  await addDoc(messagesRef, {
    senderId,
    text,
    timestamp: serverTimestamp(),
  })

  // Update chat's last message
  await updateDoc(chatRef, {
    lastMessage: text,
    lastMessageTime: serverTimestamp(),
  })
}

// Subscribe to user's chats
export function subscribeToChats(userId: string, callback: (chats: Chat[]) => void) {
  const chatsRef = collection(db, "chats")
  const q = query(chatsRef, where("participants", "array-contains", userId), orderBy("lastMessageTime", "desc"))

  return onSnapshot(q, (snapshot) => {
    const chats: Chat[] = []
    snapshot.forEach((doc) => {
      chats.push({ id: doc.id, ...doc.data() } as Chat)
    })
    callback(chats)
  })
}

// Subscribe to messages in a chat
export function subscribeToMessages(chatId: string, callback: (messages: Message[]) => void) {
  const messagesRef = collection(db, "chats", chatId, "messages")
  const q = query(messagesRef, orderBy("timestamp", "asc"))

  return onSnapshot(q, (snapshot) => {
    const messages: Message[] = []
    snapshot.forEach((doc) => {
      messages.push({ id: doc.id, ...doc.data() } as Message)
    })
    callback(messages)
  })
}

// Get chat details
export async function getChatDetails(chatId: string): Promise<Chat | null> {
  const chatRef = doc(db, "chats", chatId)
  const chatSnap = await getDoc(chatRef)

  if (chatSnap.exists()) {
    return { id: chatSnap.id, ...chatSnap.data() } as Chat
  }
  return null
}

export async function sendLockedImage(
  chatId: string,
  senderId: string,
  file: File,
  password: string
) {
  // 1️⃣ Create Firestore message first
  const messagesRef = collection(db, "chats", chatId, "messages")

  const msgRef = await addDoc(messagesRef, {
    senderId,
    type: "image",
    locked: true,
    timestamp: serverTimestamp(),
  })

  // 2️⃣ Encrypt image locally (E2EE + password)
  const { encryptedBlob, iv } = await encryptImage(
    file,
    chatId,
    password
  )

  // 3️⃣ Upload encrypted blob to Cloudinary
  const imageUrl = await uploadEncryptedToCloudinary(encryptedBlob)

  // 4️⃣ Save metadata (NO PASSWORD STORED)
  await updateDoc(msgRef, {
    imageUrl,
    iv,
    passwordHash: await hashPassword(password),
  })
}




export async function clearChatMessagesClient(chatId: string) {
  const messagesRef = collection(db, "chats", chatId, "messages")
  const snapshot = await getDocs(messagesRef)

  if (snapshot.empty) return

  const batch = writeBatch(db)
  snapshot.forEach((doc) => batch.delete(doc.ref))
  await batch.commit()
}
