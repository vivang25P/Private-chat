import nacl from 'tweetnacl'

const STORAGE_KEY = 'private-chat.keys.v1'

interface StoredKeyPair {
  publicKey: string
  privateKey: string
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return globalThis.btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  const binary = globalThis.atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

export function toBase64(value: Uint8Array): string {
  return bytesToBase64(value)
}

export function fromBase64(value: string): Uint8Array {
  return base64ToBytes(value)
}

function getStorage(): Storage {
  return window.localStorage
}

export function getOrCreateUserKeyPair(): StoredKeyPair {
  const storage = getStorage()
  const raw = storage.getItem(STORAGE_KEY)
  if (raw) {
    return JSON.parse(raw) as StoredKeyPair
  }

  const keyPair = nacl.box.keyPair()
  const created: StoredKeyPair = {
    publicKey: bytesToBase64(keyPair.publicKey),
    privateKey: bytesToBase64(keyPair.secretKey),
  }
  storage.setItem(STORAGE_KEY, JSON.stringify(created))
  return created
}
