/**
 * Uploads encrypted binary data to Cloudinary
 * Returns a secure URL
 */
export async function uploadEncryptedToCloudinary(
  encryptedBlob: Blob
): Promise<string> {
  const formData = new FormData()

  formData.append("file", encryptedBlob)
  formData.append(
    "upload_preset",
    process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!
  )

  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME!

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`,
    {
      method: "POST",
      body: formData,
    }
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error("Cloudinary upload failed: " + err)
  }

  const data = await res.json()

  // This URL points to encrypted bytes (not an image)
  return data.secure_url as string
}
