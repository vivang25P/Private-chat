import type { User } from 'firebase/auth'
import { signOut } from 'firebase/auth'
import { useEffect, useMemo, useRef, useState } from 'react'
import { MessageComposer } from '../components/MessageComposer'
import { MessageList } from '../components/MessageList'
import {
  acknowledgeMessages,
  ensureChatDocument,
  sendEncryptedMessage,
  setTypingStatus,
  subscribeToMessages,
  subscribeTypingStatus,
} from '../services/chat'
import { decryptMessage, encryptForUser } from '../services/encryption'
import { toUserError } from '../services/errorMap'
import { auth } from '../services/firebase'
import { getOrCreateUserKeyPair } from '../services/keyManager'
import { logError } from '../services/logger'
import type { UiMessage } from '../services/types'
import { ensureUserProfile, getUserProfileById } from '../services/userProfile'

interface ChatScreenProps {
  user: User
  onError: (message: string) => void
}

const ownerUid = import.meta.env.VITE_FIXED_OWNER_UID as string | undefined
const partnerUid = import.meta.env.VITE_FIXED_PARTNER_UID as string | undefined
const fixedPeerUid = import.meta.env.VITE_FIXED_PEER_UID as string | undefined

export function ChatScreen({ user, onError }: ChatScreenProps) {
  const isOwnerAccount = ownerUid === user.uid
  const [messages, setMessages] = useState<UiMessage[]>([])
  const [pendingMessages, setPendingMessages] = useState<UiMessage[]>([])
  const [isReady, setIsReady] = useState(false)
  const [isChatLoading, setIsChatLoading] = useState(false)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [isPeerTyping, setIsPeerTyping] = useState(false)
  const [peerName, setPeerName] = useState('Private Chat')
  const [displayName, setDisplayName] = useState('Private Chat')
  const [chatId, setChatId] = useState<string | null>(null)
  const [receiverPublicKey, setReceiverPublicKey] = useState<string | null>(null)
  const [isPeerKeyMismatch, setIsPeerKeyMismatch] = useState(false)
  const [pendingPeerKey, setPendingPeerKey] = useState<string | null>(null)
  const [showMenu, setShowMenu] = useState(false)
  const [isEditingDisplayName, setIsEditingDisplayName] = useState(false)
  const [displayNameDraft, setDisplayNameDraft] = useState('')

  const localKeyPair = useMemo(() => getOrCreateUserKeyPair(), [])
  const menuRef = useRef<HTMLDivElement | null>(null)
  const targetPeerUid = (fixedPeerUid ?? '').trim()
    ? (fixedPeerUid ?? '').trim()
    : isOwnerAccount
      ? (partnerUid ?? '').trim()
      : (ownerUid ?? '').trim()

  useEffect(() => {
    void ensureUserProfile({
      userId: user.uid,
      email: user.email,
      publicKey: localKeyPair.publicKey,
    })
      .then(() => setIsReady(true))
      .catch((error) => onError(toUserError(error, 'Failed to initialize your profile')))
  }, [localKeyPair.publicKey, onError, user.email, user.uid])

  useEffect(() => {
    const setOnline = () => setIsOnline(true)
    const setOffline = () => setIsOnline(false)
    window.addEventListener('online', setOnline)
    window.addEventListener('offline', setOffline)
    return () => {
      window.removeEventListener('online', setOnline)
      window.removeEventListener('offline', setOffline)
    }
  }, [])

  useEffect(() => {
    if (!isReady || !targetPeerUid || targetPeerUid === user.uid) return
    let stopListening = () => {}
    setIsChatLoading(true)
    void getUserProfileById(targetPeerUid)
      .then(async (peerProfile) => {
        if (!peerProfile?.publicKey) throw new Error('Receiver profile not found or missing public key')
        const trustKey = `private-chat.peerKey.${targetPeerUid}`
        const previousPeerKey = localStorage.getItem(trustKey)
        if (previousPeerKey && previousPeerKey !== peerProfile.publicKey) {
          setIsPeerKeyMismatch(true)
          setPendingPeerKey(peerProfile.publicKey)
          setReceiverPublicKey(null)
          onError('Security warning: peer key changed. Verify and tap "Trust new key" to continue.')
          return
        }
        localStorage.setItem(trustKey, peerProfile.publicKey)
        setIsPeerKeyMismatch(false)
        setPendingPeerKey(null)
        setReceiverPublicKey(peerProfile.publicKey)
        const baseName = peerProfile.username || peerProfile.email || 'Chat'
        setPeerName(baseName)
        const nickname = localStorage.getItem(`private-chat.nickname.${targetPeerUid}`) || baseName
        setDisplayName(nickname)
        setDisplayNameDraft(nickname)
        const resolvedChatId = await ensureChatDocument([user.uid, targetPeerUid] as [string, string])
        setChatId(resolvedChatId)
        stopListening = subscribeToMessages(
          resolvedChatId,
          (encryptedMessages) => {
            const uiMessages = encryptedMessages.map((message) => {
              if (message.senderId === user.uid) {
                const selfText =
                  message.senderSelfEncryptedText &&
                  message.senderSelfIv &&
                  message.senderSelfEphemeralPublicKey
                    ? decryptMessage(
                        message.senderSelfEncryptedText,
                        message.senderSelfIv,
                        message.senderSelfEphemeralPublicKey,
                        localKeyPair.privateKey,
                      )
                    : null
                return {
                  id: message.id,
                  senderId: message.senderId,
                  receiverId: message.receiverId,
                  createdAt: message.createdAt,
                  messageType: 'text' as const,
                  status: message.status,
                  plaintext: selfText ?? 'Encrypted message sent',
                }
              }
              const decrypted = decryptMessage(
                message.encryptedText,
                message.iv,
                message.senderEphemeralPublicKey,
                localKeyPair.privateKey,
              )
              return {
                id: message.id,
                senderId: message.senderId,
                receiverId: message.receiverId,
                createdAt: message.createdAt,
                messageType: 'text' as const,
                status: message.status,
                plaintext: decrypted ?? 'Unable to decrypt message',
              }
            })
            setMessages(uiMessages)
            void acknowledgeMessages(resolvedChatId, user.uid)
          },
          (error) => {
            logError('chat.messages.subscribe', error)
            onError(
              'Chat permissions are blocked. Deploy latest firestore.rules and make sure both UIDs are participants.',
            )
          },
        )
      })
      .catch((error) => {
        logError('chat.bootstrap', error)
        onError(toUserError(error, 'Failed to load chat'))
      })
      .finally(() => setIsChatLoading(false))
    return () => stopListening()
  }, [isReady, localKeyPair.privateKey, onError, targetPeerUid, user.uid])

  useEffect(() => {
    if (!chatId || !targetPeerUid) return
    return subscribeTypingStatus(chatId, targetPeerUid, setIsPeerTyping, (error) => {
      logError('chat.typing.subscribe', error)
    })
  }, [chatId, targetPeerUid])

  useEffect(() => {
    if (!showMenu) {
      return
    }
    function handleOutsideClick(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setShowMenu(false)
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [showMenu])

  async function sendOneMessage(plaintext: string, tempId: string): Promise<void> {
    if (!chatId || !receiverPublicKey || isPeerKeyMismatch) {
      onError('Connecting chat... please wait.')
      return
    }
    try {
      const payload = encryptForUser(plaintext, receiverPublicKey)
      const senderPayload = encryptForUser(plaintext, localKeyPair.publicKey)
      await sendEncryptedMessage({
        chatId,
        senderId: user.uid,
        receiverId: targetPeerUid,
        payload,
        senderPayload,
      })
      setPendingMessages((current) => current.filter((m) => m.id !== tempId))
    } catch (error) {
      logError('chat.send', error)
      setPendingMessages((current) =>
        current.map((m) => (m.id === tempId ? { ...m, deliveryState: 'failed' } : m)),
      )
      onError(toUserError(error, 'Failed to send message'))
    }
  }

  async function handleSend(plaintext: string): Promise<void> {
    if (!isOnline) {
      onError('You are offline. Reconnect and try again.')
      return
    }
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const optimistic: UiMessage = {
      id: tempId,
      senderId: user.uid,
      receiverId: targetPeerUid,
      messageType: 'text',
      status: { sent: false, delivered: false, seen: false },
      createdAt: new Date(),
      plaintext,
      deliveryState: 'sending',
      isOptimistic: true,
    }
    setPendingMessages((current) => [...current, optimistic])
    await sendOneMessage(plaintext, tempId)
  }

  async function handleRetry(messageId: string): Promise<void> {
    const retryItem = pendingMessages.find((message) => message.id === messageId)
    if (!retryItem) return
    setPendingMessages((current) =>
      current.map((message) =>
        message.id === messageId ? { ...message, deliveryState: 'sending' } : message,
      ),
    )
    await sendOneMessage(retryItem.plaintext, messageId)
  }

  const mergedMessages = [...messages, ...pendingMessages].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  )

  function saveDisplayName(): void {
    const trimmed = displayNameDraft.trim()
    const nextName = trimmed || peerName
    setDisplayName(nextName)
    if (targetPeerUid) {
      localStorage.setItem(`private-chat.nickname.${targetPeerUid}`, nextName)
    }
    setIsEditingDisplayName(false)
  }

  function trustNewPeerKey(): void {
    if (!targetPeerUid || !pendingPeerKey) {
      return
    }
    localStorage.setItem(`private-chat.peerKey.${targetPeerUid}`, pendingPeerKey)
    setReceiverPublicKey(pendingPeerKey)
    setPendingPeerKey(null)
    setIsPeerKeyMismatch(false)
    onError('')
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col bg-black pb-16 md:gap-3 md:bg-transparent md:px-4 md:py-4 md:pb-4">
      <header className="flex items-center gap-2 border-b border-borderc bg-black px-2 py-2 md:rounded-2xl md:border md:bg-card md:px-3 md:py-3">
        <div className="grid h-9 w-9 place-items-center rounded-full border border-borderc bg-zinc-800 text-xs font-semibold text-white">
          {(displayName || peerName).slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          {isEditingDisplayName ? (
            <div className="flex items-center gap-1">
              <input
                className="h-8 w-full rounded-lg border border-borderc bg-black/40 px-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-purple-500"
                value={displayNameDraft}
                onChange={(event) => setDisplayNameDraft(event.target.value)}
                maxLength={40}
              />
              <button
                type="button"
                className="grid h-8 w-8 place-items-center rounded-full border border-borderc text-slate-100"
                aria-label="Save display name"
                onClick={saveDisplayName}
              >
                ✓
              </button>
            </div>
          ) : (
            <h1 className="truncate text-lg font-semibold text-slate-100">{displayName || peerName}</h1>
          )}
          <p className="truncate text-xs text-slate-400">
            {isPeerTyping ? 'typing...' : isOnline ? 'Online' : 'Offline'}
          </p>
        </div>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            className="grid h-8 w-8 place-items-center rounded-full border border-borderc text-slate-200"
            aria-label="Chat options"
            onClick={() => setShowMenu((current) => !current)}
          >
            ⋮
          </button>
          {showMenu ? (
            <div className="absolute right-0 top-10 z-30 min-w-44 rounded-xl border border-borderc bg-card p-1 shadow-soft">
              <button
                type="button"
                className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-100 hover:bg-white/5"
                onClick={() => {
                  setIsEditingDisplayName(true)
                  setShowMenu(false)
                }}
              >
                Edit name
              </button>
              <button
                type="button"
                className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-100 hover:bg-white/5"
                onClick={() => {
                  void acknowledgeMessages(chatId ?? '', user.uid)
                  setShowMenu(false)
                }}
                disabled={!chatId}
              >
                Sync messages
              </button>
              <button
                type="button"
                className="block w-full rounded-lg px-3 py-2 text-left text-sm text-rose-300 hover:bg-white/5"
                onClick={() => void signOut(auth)}
              >
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </header>
      {!targetPeerUid ? (
        <section className="mx-2 mt-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-100 md:mx-0">
          <p>Missing peer UID. Set `VITE_FIXED_PEER_UID` (or owner/partner UIDs) in `.env`.</p>
        </section>
      ) : null}
      {isPeerKeyMismatch ? (
        <section className="mx-2 mt-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-100 md:mx-0">
          <p className="text-sm">
            Peer key changed. If you verified this change, trust the new key to unlock chat.
          </p>
          <button
            type="button"
            className="mt-2 rounded-lg border border-amber-300/40 px-3 py-1 text-sm text-amber-50"
            onClick={trustNewPeerKey}
            disabled={!pendingPeerKey}
          >
            Trust new key
          </button>
        </section>
      ) : null}
      {!isOnline ? (
        <section className="mx-2 mt-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-100 md:mx-0">
          <p>You are offline. Messages will fail until connection is restored.</p>
        </section>
      ) : null}
      <section className="hide-scrollbar mx-2 mt-2 flex-1 overflow-y-auto rounded-2xl border border-borderc bg-black px-3 py-3 md:mx-0 md:min-h-[58vh] md:max-h-[64vh] md:bg-card">
        {isChatLoading ? (
          <div className="grid min-h-[220px] place-items-center">
            <p>Connecting encrypted chat...</p>
          </div>
        ) : (
          <MessageList
            currentUserId={user.uid}
            messages={mergedMessages}
            onRetry={handleRetry}
            peerInitial={(displayName || peerName).slice(0, 1).toUpperCase()}
          />
        )}
      </section>
      <MessageComposer
        disabled={!chatId || !receiverPublicKey || !isOnline || isPeerKeyMismatch}
        onSend={handleSend}
        onTypingChange={(typing) => {
          if (!chatId) return
          void setTypingStatus(chatId, user.uid, typing)
        }}
      />
    </main>
  )
}
