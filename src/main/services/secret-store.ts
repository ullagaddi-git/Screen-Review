import { safeStorage } from 'electron'

/**
 * Wraps Electron's safeStorage for at-rest encryption of user secrets
 * (currently the optional OpenAI API key). The encrypted bytes are returned
 * as base64 strings so they fit cleanly into electron-store's JSON values.
 *
 * On Windows, safeStorage uses DPAPI which is keyed to the current OS user.
 * On Linux without a keyring it can fail. We handle that gracefully:
 * `encryptSecret` returns null and `decryptSecret` returns null, so callers
 * can decide whether to refuse to store or surface a warning.
 */

export function isEncryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

export function encryptSecret(plaintext: string): string | null {
  if (!plaintext) return null
  if (!isEncryptionAvailable()) return null
  try {
    const buf = safeStorage.encryptString(plaintext)
    return buf.toString('base64')
  } catch {
    return null
  }
}

export function decryptSecret(encryptedBase64: string | null | undefined): string | null {
  if (!encryptedBase64) return null
  if (!isEncryptionAvailable()) return null
  try {
    const buf = Buffer.from(encryptedBase64, 'base64')
    return safeStorage.decryptString(buf)
  } catch {
    return null
  }
}
