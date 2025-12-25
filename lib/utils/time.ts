import { Timestamp } from "firebase/firestore"

export function formatDeliveredTime(ts?: Timestamp) {
  if (!ts) return ""

  const d = ts.toDate()

  const day = String(d.getDate()).padStart(2, "0")
  const month = d.toLocaleString("en-US", { month: "short" })
  const hours = String(d.getHours()).padStart(2, "0")
  const minutes = String(d.getMinutes()).padStart(2, "0")

  return `${hours}:${minutes}`
}
