import type { User } from 'firebase/auth'
import { signOut } from 'firebase/auth'
import { useEffect, useMemo, useRef, useState } from 'react'
import { MessageComposer } from '../components/MessageComposer'
import { MessageList } from '../components/MessageList'
import {
  acknowledgeMessages,
  ensureChatDocument,
  sendEncryptedMessage,
  setChatScreenPresence,
  setTypingStatus,
  subscribeChatScreenPresence,
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
  const [isNetworkOnline, setIsNetworkOnline] = useState(navigator.onLine)
  const [isPeerPresentOnChatScreen, setIsPeerPresentOnChatScreen] = useState(false)
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
    const setOnline = () => setIsNetworkOnline(true)
    const setOffline = () => setIsNetworkOnline(false)
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
                  clientMessageId: message.clientMessageId,
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
                clientMessageId: message.clientMessageId,
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
    if (!chatId || !targetPeerUid) return
    return subscribeChatScreenPresence(chatId, targetPeerUid, setIsPeerPresentOnChatScreen, (error) => {
      logError('chat.presence.subscribe', error)
    })
  }, [chatId, targetPeerUid])

  useEffect(() => {
    if (!chatId) return
    const updatePresence = (isPresent: boolean) => {
      void setChatScreenPresence(chatId, user.uid, isPresent)
    }

    const pushCurrentState = () => {
      updatePresence(document.visibilityState === 'visible')
    }

    pushCurrentState()
    const heartbeat = window.setInterval(pushCurrentState, 20_000)

    const onVisibilityChange = () => {
      pushCurrentState()
      if (document.visibilityState !== 'visible') {
        void setTypingStatus(chatId, user.uid, false)
      }
    }
    const onPageHide = () => {
      updatePresence(false)
      void setTypingStatus(chatId, user.uid, false)
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('beforeunload', onPageHide)

    return () => {
      window.clearInterval(heartbeat)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('beforeunload', onPageHide)
      updatePresence(false)
      void setTypingStatus(chatId, user.uid, false)
    }
  }, [chatId, user.uid])

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
        clientMessageId: tempId,
        payload,
        senderPayload,
      })
      setPendingMessages((current) =>
        current.map((m) => (m.id === tempId ? { ...m, deliveryState: 'sent' } : m)),
      )
    } catch (error) {
      logError('chat.send', error)
      setPendingMessages((current) =>
        current.map((m) => (m.id === tempId ? { ...m, deliveryState: 'failed' } : m)),
      )
      onError(toUserError(error, 'Failed to send message'))
    }
  }

  async function handleSend(plaintext: string): Promise<void> {
    if (!isNetworkOnline) {
      onError('You are offline. Reconnect and try again.')
      return
    }
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const optimistic: UiMessage = {
      id: tempId,
      clientMessageId: tempId,
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

  const confirmedClientIds = new Set(
    messages.map((message) => message.clientMessageId).filter((value): value is string => Boolean(value)),
  )
  const visiblePendingMessages = pendingMessages.filter(
    (message) => !message.clientMessageId || !confirmedClientIds.has(message.clientMessageId),
  )

  const mergedMessages = [...messages, ...visiblePendingMessages].sort(
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
    <main className="mx-auto flex h-[100dvh] max-h-[100dvh] w-full max-w-5xl flex-col overflow-hidden bg-black md:my-4 md:h-[calc(100dvh-2rem)] md:max-h-[calc(100dvh-2rem)] md:rounded-2xl md:ring-1 md:ring-zinc-800">
      <header className="flex shrink-0 items-center gap-2 border-b border-zinc-800 bg-black px-3 pb-2.5 pt-[max(10px,env(safe-area-inset-top,0px))]">
        <button
          type="button"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-white transition-opacity hover:opacity-80 active:opacity-70"
          aria-label="Go back"
          onClick={() => {
            if (window.history.length > 1) {
              window.history.back()
            }
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M15 18l-6-6 6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <div className="flex flex-col items-center gap-1">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-zinc-700 bg-zinc-800 text-xs font-semibold text-white">
              {(displayName || peerName).slice(0, 1).toUpperCase()}
            </div>
            <span className="h-0.5 w-7 rounded-full bg-purple-500" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            {isEditingDisplayName ? (
              <div className="flex items-center gap-1">
                <input
                  className="h-8 w-full rounded-lg border border-borderc bg-zinc-900 px-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-purple-500"
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
              <h1 className="truncate text-base font-semibold tracking-tight text-white">
                {displayName || peerName}
              </h1>
            )}
            {!isEditingDisplayName ? (
              <p className="truncate text-[11px] text-zinc-500">
                {isPeerPresentOnChatScreen ? 'Active now' : 'Offline'}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              className="grid h-10 w-10 place-items-center rounded-full text-white transition-opacity hover:bg-white/5"
              aria-label="Chat options"
              onClick={() => setShowMenu((current) => !current)}
            >
              <span className="relative grid h-7 w-7 place-items-center" aria-hidden="true">
                <span className="absolute inset-0 rounded-full border-2 border-white/90" />
                <span className="absolute inset-[5px] rounded-full border-2 border-white/90" />
                <span className="relative text-[10px] leading-none">😊</span>
              </span>
            </button>
            {showMenu ? (
              <div className="absolute right-0 top-11 z-50 min-w-44 rounded-xl border border-zinc-700 bg-zinc-900 p-1 shadow-lg">
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
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-full text-white opacity-40"
            aria-label="Voice call unavailable"
            disabled
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-full text-white opacity-40"
            aria-label="Video call unavailable"
            disabled
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M23 7l-7 5 7 5V7z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <rect
                x="1"
                y="5"
                width="15"
                height="14"
                rx="2"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
          </button>
        </div>
      </header>
      {!targetPeerUid ? (
        <section className="shrink-0 px-3 pt-2">
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-100">
            <p className="text-sm">Missing peer UID. Set `VITE_FIXED_PEER_UID` (or owner/partner UIDs) in `.env`.</p>
          </div>
        </section>
      ) : null}
      {isPeerKeyMismatch ? (
        <section className="shrink-0 px-3 pt-2">
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-100">
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
          </div>
        </section>
      ) : null}
      {!isNetworkOnline ? (
        <section className="shrink-0 px-3 pt-2">
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-100">
            <p className="text-sm">You are offline. Messages will fail until connection is restored.</p>
          </div>
        </section>
      ) : null}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col px-3 pb-2 pt-2">
        {isChatLoading ? (
          <div className="grid min-h-0 flex-1 place-items-center text-sm text-zinc-400">
            <p>Connecting encrypted chat...</p>
          </div>
        ) : (
          <MessageList
            currentUserId={user.uid}
            messages={mergedMessages}
            onRetry={handleRetry}
            peerInitial={(displayName || peerName).slice(0, 1).toUpperCase()}
            isPeerTyping={isPeerTyping}
          />
        )}
      </section>
      <MessageComposer
        disabled={!chatId || !receiverPublicKey || !isNetworkOnline || isPeerKeyMismatch}
        onSend={handleSend}
        onTypingChange={(typing) => {
          if (!chatId) return
          void setTypingStatus(chatId, user.uid, typing)
        }}
      />
    </main>
  )
}
