export async function deriveChatKey(chatId: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
debugger
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(chatId),
    "PBKDF2",
    false,
    ["deriveKey"]
  )

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode("chat-e2ee"),
      iterations: 100000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  )
}
