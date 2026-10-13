import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

// Rohlík OAuth tokens at rest (rohlik-connections): AES-256-GCM with a key
// derived from PAYLOAD_SECRET, so no new env var and a database dump alone
// can't fill anybody's Rohlík cart. Format "v1.<iv>.<tag>.<ciphertext>",
// base64url parts; the version prefix leaves room for a key rotation.

const VERSION = 'v1'

function keyFor(secret: string): Buffer {
  return createHash('sha256').update(`${secret}:rohlik-tokens`).digest()
}

export function encryptToken(plain: string, secret: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keyFor(secret), iv)
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, iv, tag, ciphertext]
    .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
    .join('.')
}

/** The plain token, or null for anything malformed, tampered or keyed differently. */
export function decryptToken(sealed: string | null | undefined, secret: string): string | null {
  if (typeof sealed !== 'string') return null
  const parts = sealed.split('.')
  if (parts.length !== 4 || parts[0] !== VERSION) return null
  try {
    const [, iv, tag, ciphertext] = parts.map((part) => Buffer.from(part, 'base64url'))
    if (iv.length !== 12 || tag.length !== 16) return null
    const decipher = createDecipheriv('aes-256-gcm', keyFor(secret), iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}
