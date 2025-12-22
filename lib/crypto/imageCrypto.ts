import { deriveChatKey } from "./chatKey"
import { derivePasswordKey } from "./passwordCrypto"

export async function encryptImage(
  file: File,
  chatId: string,
  password: string
) {
  const chatKey = await deriveChatKey(chatId)
  const passKey = await derivePasswordKey(password)

  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = await file.arrayBuffer()

  const e2ee = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    chatKey,
    data
  )

  const locked = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    passKey,
    e2ee
  )

  return {
    encryptedBlob: new Blob([locked]),
    iv: Array.from(iv),
  }
}

export async function decryptImage(
  url: string,
  iv: number[],
  chatId: string,
  password: string
): Promise<string> {
  const chatKey = await deriveChatKey(chatId)
  const passKey = await derivePasswordKey(password)

  const res = await fetch(url)
  const encrypted = await res.arrayBuffer()

  const unlocked = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(iv) },
    passKey,
    encrypted
  )

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(iv) },
    chatKey,
    unlocked
  )

  return URL.createObjectURL(new Blob([decrypted]))
}

