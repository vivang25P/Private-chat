import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { UiMessage } from '../services/types'

interface MessageListProps {
  currentUserId: string
  messages: UiMessage[]
  onRetry: (messageId: string) => Promise<void>
  peerInitial: string
}

function getDayLabel(date: Date): string {
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (date.toDateString() === today.toDateString()) return 'Today'
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return date.toLocaleDateString()
}

export function MessageList({
  currentUserId,
  messages,
  onRetry,
  peerInitial,
}: MessageListProps) {
  const listRef = useRef<HTMLUListElement | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)
  const [isNearBottom, setIsNearBottom] = useState(true)

  useEffect(() => {
    // Always jump to bottom on first render.
    if (messages.length <= 1) {
      endRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' })
      return
    }
    // Smart autoscroll: only jump if user is already near bottom.
    if (isNearBottom) {
      endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [isNearBottom, messages.length])

  const rendered = useMemo(() => {
    let previousDay = ''
    let previousSender = ''
    return messages.map((message) => {
      const day = getDayLabel(message.createdAt)
      const showDateSeparator = day !== previousDay
      const groupedWithPrevious = previousSender === message.senderId
      previousDay = day
      previousSender = message.senderId
      return { message, day, showDateSeparator, groupedWithPrevious }
    })
  }, [messages])

  return (
    <ul
      ref={listRef}
      className="flex list-none flex-col gap-2 p-0"
      aria-label="Messages"
      onScroll={() => {
        const container = listRef.current?.parentElement
        if (!container) {
          return
        }
        const distanceFromBottom =
          container.scrollHeight - container.scrollTop - container.clientHeight
        setIsNearBottom(distanceFromBottom < 80)
      }}
    >
      {rendered.map(({ message, day, showDateSeparator, groupedWithPrevious }) => {
        const isOwn = message.senderId === currentUserId
        const status = message.status.seen
          ? 'Seen'
          : message.status.delivered
            ? 'Delivered'
            : message.status.sent
              ? 'Sent'
              : message.deliveryState === 'failed'
                ? 'Failed'
                : 'Sending...'
        return (
          <Fragment key={message.id}>
            {showDateSeparator ? (
              <li className="my-2 flex justify-center">
                <span className="rounded-full border border-borderc bg-card px-3 py-1 text-xs text-slate-300">
                  {day}
                </span>
              </li>
            ) : null}
            <li className={`flex ${isOwn ? 'justify-end' : 'justify-start'} ${groupedWithPrevious ? '-mt-1' : ''}`}>
              {!isOwn && !groupedWithPrevious ? (
                <div className="mr-2 grid h-6 w-6 min-w-6 place-items-center rounded-full border border-borderc bg-zinc-800 text-[11px] text-white">
                  {peerInitial}
                </div>
              ) : !isOwn ? (
                <div className="mr-2 h-6 w-6 min-w-6" />
              ) : null}
              <article
                className={`max-w-[80%] rounded-2xl border border-borderc px-3 py-2 ${
                  isOwn
                    ? 'border-transparent bg-gradient-to-b from-fuchsia-600 to-violet-600 text-white'
                    : 'bg-zinc-900 text-slate-100'
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{message.plaintext}</p>
                <div className="mt-1 flex items-center justify-end gap-2 text-xs text-slate-300">
                  <time dateTime={message.createdAt.toISOString()}>
                    {message.createdAt.toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                  {isOwn ? <span>{status}</span> : null}
                </div>
                {message.deliveryState === 'failed' ? (
                  <button
                    type="button"
                    className="mt-1 rounded-lg border border-borderc px-2 py-1 text-xs"
                    onClick={() => void onRetry(message.id)}
                  >
                    Retry
                  </button>
                ) : null}
              </article>
            </li>
          </Fragment>
        )
      })}
      <li aria-hidden="true">
        <div ref={endRef} />
      </li>
    </ul>
  )
}
