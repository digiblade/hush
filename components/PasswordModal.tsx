"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type PasswordModalProps = {
  onSubmit: (password: string) => void
  onClose: () => void
}

export default function PasswordModal({
  onSubmit,
  onClose,
}: PasswordModalProps) {
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleUnlock = async () => {
    if (!password.trim()) {
      setError("Password is required")
      return
    }

    try {
      setLoading(true)
      setError("")
      await onSubmit(password)
    } catch {
      setError("Invalid password")
    } finally {
      setLoading(false)
      setPassword("")
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg">
        <h2 className="mb-2 text-lg font-semibold text-gray-900">
          Unlock Image
        </h2>

        <p className="mb-4 text-sm text-gray-500">
          Enter the password to view this image
        </p>

        <Input
          type="password"
          placeholder="Enter password"
          className="text-red-50"
          value={password}
          autoFocus
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleUnlock()
          }}
        />

        {error && (
          <p className="mt-2 text-sm text-red-500">
            {error}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>

          <Button
            onClick={handleUnlock}
            disabled={loading}
          >
            {loading ? "Unlocking..." : "Unlock"}
          </Button>
        </div>
      </div>
    </div>
  )
}
