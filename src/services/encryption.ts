import nacl from 'tweetnacl'
import { fromBase64, toBase64 } from './keyManager'
import type { EncryptedPayload } from './types'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export function encryptForUser(
  plaintext: string,
  receiverPublicKeyBase64: string,
): EncryptedPayload {
  const receiverPublicKey = fromBase64(receiverPublicKeyBase64)
  const ephemeral = nacl.box.keyPair()
  const nonce = nacl.randomBytes(nacl.box.nonceLength)
  const messageBytes = encoder.encode(plaintext)
  const encrypted = nacl.box(
    messageBytes,
    nonce,
    receiverPublicKey,
    ephemeral.secretKey,
  )

  return {
    encryptedText: toBase64(encrypted),
    iv: toBase64(nonce),
    senderEphemeralPublicKey: toBase64(ephemeral.publicKey),
    encryptionType: 'nacl',
  }
}

export function decryptMessage(
  encryptedTextBase64: string,
  ivBase64: string,
  senderEphemeralPublicKeyBase64: string,
  privateKeyBase64: string,
): string | null {
  const encryptedText = fromBase64(encryptedTextBase64)
  const nonce = fromBase64(ivBase64)
  const senderEphemeralPublicKey = fromBase64(senderEphemeralPublicKeyBase64)
  const privateKey = fromBase64(privateKeyBase64)

  const opened = nacl.box.open(
    encryptedText,
    nonce,
    senderEphemeralPublicKey,
    privateKey,
  )
  if (!opened) {
    return null
  }
  return decoder.decode(opened)
}
