import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export async function requestNotificationPermission() {
  if (!("Notification" in window)) return

  if (Notification.permission === "default") {
    await Notification.requestPermission()
  }
}
