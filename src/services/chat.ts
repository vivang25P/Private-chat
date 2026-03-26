import {
  Timestamp,
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from './firebase'
import type { EncryptedPayload, MessageDocument } from './types'

export function getDeterministicChatId(userIdA: string, userIdB: string): string {
  return [userIdA, userIdB].sort().join('__')
}

export async function ensureChatDocument(participants: [string, string]): Promise<string> {
  const chatId = getDeterministicChatId(participants[0], participants[1])
  await setDoc(
    doc(db, 'chats', chatId),
    {
      participants,
      lastMessage: '[encrypted]',
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
  return chatId
}

interface SendEncryptedMessageParams {
  chatId: string
  senderId: string
  receiverId: string
  payload: EncryptedPayload
  senderPayload: EncryptedPayload
}

export async function sendEncryptedMessage({
  chatId,
  senderId,
  receiverId,
  payload,
  senderPayload,
}: SendEncryptedMessageParams): Promise<string> {
  const messageCollectionRef = collection(db, 'chats', chatId, 'messages')
  const created = await addDoc(messageCollectionRef, {
    senderId,
    receiverId,
    encryptedText: payload.encryptedText,
    iv: payload.iv,
    senderEphemeralPublicKey: payload.senderEphemeralPublicKey,
    senderSelfEncryptedText: senderPayload.encryptedText,
    senderSelfIv: senderPayload.iv,
    senderSelfEphemeralPublicKey: senderPayload.senderEphemeralPublicKey,
    encryptionType: payload.encryptionType,
    messageType: 'text',
    status: { sent: true, delivered: false, seen: false },
    createdAt: serverTimestamp(),
  })

  await setDoc(
    doc(db, 'chats', chatId),
    { lastMessage: '[encrypted]', updatedAt: serverTimestamp() },
    { merge: true },
  )
  return created.id
}

export function subscribeToMessages(
  chatId: string,
  onUpdate: (messages: Array<MessageDocument & { id: string }>) => void,
  onError?: (error: unknown) => void,
): () => void {
  const messagesQuery = query(
    collection(db, 'chats', chatId, 'messages'),
    orderBy('createdAt', 'asc'),
  )
  return onSnapshot(
    messagesQuery,
    (snapshot) => {
      const messages = snapshot.docs.map((snapshotDoc) => {
        const data = snapshotDoc.data()
        const createdAt = data.createdAt as Timestamp | undefined
        return {
          id: snapshotDoc.id,
          senderId: data.senderId as string,
          receiverId: data.receiverId as string,
          encryptedText: data.encryptedText as string,
          iv: data.iv as string,
          senderEphemeralPublicKey: data.senderEphemeralPublicKey as string,
          senderSelfEncryptedText: data.senderSelfEncryptedText as string | undefined,
          senderSelfIv: data.senderSelfIv as string | undefined,
          senderSelfEphemeralPublicKey: data.senderSelfEphemeralPublicKey as string | undefined,
          encryptionType: data.encryptionType as 'nacl',
          messageType: 'text' as const,
          status: {
            sent: Boolean(data.status?.sent),
            delivered: Boolean(data.status?.delivered),
            seen: Boolean(data.status?.seen),
          },
          createdAt: createdAt?.toDate() ?? new Date(),
        }
      })
      onUpdate(messages)
    },
    (error) => {
      if (onError) {
        onError(error)
      }
    },
  )
}

export async function acknowledgeMessages(
  chatId: string,
  currentUserId: string,
): Promise<void> {
  const pendingQuery = query(
    collection(db, 'chats', chatId, 'messages'),
    where('receiverId', '==', currentUserId),
  )
  const pending = await getDocs(pendingQuery)
  if (pending.empty) {
    return
  }

  const batch = writeBatch(db)
  let changed = false
  pending.docs.forEach((item) => {
    const data = item.data()
    if (data.status?.delivered && data.status?.seen) {
      return
    }
    changed = true
    batch.update(doc(db, 'chats', chatId, 'messages', item.id), {
      'status.delivered': true,
      'status.seen': true,
    })
  })
  if (changed) {
    await batch.commit()
  }
}

export async function setTypingStatus(
  chatId: string,
  userId: string,
  isTyping: boolean,
): Promise<void> {
  try {
    await setDoc(
      doc(db, 'chats', chatId, 'typing', userId),
      { isTyping, updatedAt: serverTimestamp() },
      { merge: true },
    )
  } catch {
    // Typing is optional UX; do not block chat on rule mismatch.
  }
}

export function subscribeTypingStatus(
  chatId: string,
  peerUserId: string,
  onUpdate: (isTyping: boolean) => void,
  onError?: (error: unknown) => void,
): () => void {
  return onSnapshot(
    doc(db, 'chats', chatId, 'typing', peerUserId),
    (snapshot) => {
      onUpdate(snapshot.exists() ? Boolean(snapshot.data().isTyping) : false)
    },
    (error) => {
      onUpdate(false)
      if (onError) {
        onError(error)
      }
    },
  )
}
