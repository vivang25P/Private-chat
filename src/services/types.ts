export interface UserProfile {
  id: string
  username: string
  email: string
  phone?: string
  publicKey: string
  createdAt: Date
}

export interface ChatDocument {
  participants: [string, string]
  lastMessage: string
  updatedAt: Date
}

export interface MessageStatus {
  sent: boolean
  delivered: boolean
  seen: boolean
}

export interface EncryptedPayload {
  encryptedText: string
  iv: string
  senderEphemeralPublicKey: string
  encryptionType: 'nacl'
}

export interface MessageDocument extends EncryptedPayload {
  senderId: string
  receiverId: string
  senderSelfEncryptedText?: string
  senderSelfIv?: string
  senderSelfEphemeralPublicKey?: string
  messageType: 'text'
  status: MessageStatus
  createdAt: Date
}

export type DeliveryState = 'sending' | 'sent' | 'delivered' | 'seen' | 'failed'

export interface UiMessage {
  id: string
  senderId: string
  receiverId: string
  messageType: 'text'
  status: MessageStatus
  createdAt: Date
  plaintext: string
  deliveryState?: DeliveryState
  isOptimistic?: boolean
}
