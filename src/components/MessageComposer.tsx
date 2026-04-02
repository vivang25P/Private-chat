import { Suspense, lazy, useRef, useState, type FormEvent } from 'react'
import { Theme } from 'emoji-picker-react'

const LazyEmojiPicker = lazy(() => import('emoji-picker-react'))

interface MessageComposerProps {
  disabled?: boolean
  onSend: (value: string) => Promise<void>
  onTypingChange: (isTyping: boolean) => void
}

function IconMic({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function IconGallery({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
      <path d="M21 15l-5-5L5 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconCamera({ className }: { className?: string }) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

export function MessageComposer({
  disabled,
  onSend,
  onTypingChange,
}: MessageComposerProps) {
  const [value, setValue] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showMoreActions, setShowMoreActions] = useState(false)
  const formRef = useRef<HTMLFormElement | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedValue = value.trim()
    if (!trimmedValue || disabled) return
    setIsSending(true)
    onTypingChange(false)
    try {
      await onSend(trimmedValue)
      setValue('')
    } finally {
      setIsSending(false)
    }
  }

  function insertText(insertValue: string) {
    setValue((current) => `${current}${current ? ' ' : ''}${insertValue}`)
    onTypingChange(true)
  }

  return (
    <form
      className="relative z-30 flex shrink-0 items-end gap-2 border-t border-zinc-800 bg-black px-3 pb-[max(10px,env(safe-area-inset-bottom,0px))] pt-2"
      onSubmit={handleSubmit}
      ref={formRef}
    >
      <button
        type="button"
        className="mb-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#1877f2] text-white shadow-md transition-transform active:scale-95 disabled:opacity-50"
        aria-label="Camera"
        onClick={() => insertText('📷')}
        disabled={disabled || isSending}
      >
        <IconCamera className="text-white" />
      </button>
      <div className="relative mb-0.5 flex min-h-[44px] min-w-0 flex-1 items-center rounded-full bg-zinc-800/95 px-1 ring-1 ring-zinc-700/80">
        <textarea
          id="message-input"
          className="min-h-[40px] max-h-32 min-w-0 flex-1 resize-none border-none bg-transparent px-3 py-2.5 text-[15px] leading-5 text-white outline-none placeholder:text-zinc-500 focus:ring-0"
          value={value}
          onChange={(event) => {
            const next = event.target.value
            setValue(next)
            onTypingChange(Boolean(next.trim()))
          }}
          onBlur={() => onTypingChange(false)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              formRef.current?.requestSubmit()
            }
          }}
          placeholder="Message..."
          disabled={disabled || isSending}
          rows={1}
        />
        <div className="flex shrink-0 items-center gap-0.5 pr-1.5">
          <button
            type="button"
            className="grid h-9 w-9 place-items-center rounded-full text-white/90 opacity-35"
            aria-label="Voice message unavailable"
            disabled
          >
            <IconMic />
          </button>
          <button
            type="button"
            className="grid h-9 w-9 place-items-center rounded-full text-white/90 opacity-35"
            aria-label="Attach image unavailable"
            disabled
          >
            <IconGallery />
          </button>
          <button
            type="button"
            className="grid h-9 w-9 place-items-center rounded-full text-white transition-colors hover:bg-white/10"
            onClick={() => {
              setShowEmojiPicker((current) => !current)
              setShowMoreActions(false)
            }}
            disabled={disabled || isSending}
            aria-label="Open emoji picker"
          >
            <span className="text-lg leading-none">😊</span>
          </button>
          <button
            type="button"
            className="grid h-9 w-9 place-items-center rounded-full text-white transition-colors hover:bg-white/10"
            onClick={() => {
              setShowMoreActions((current) => !current)
              setShowEmojiPicker(false)
            }}
            disabled={disabled || isSending}
            aria-label="More actions"
          >
            <span className="text-xl font-light leading-none">+</span>
          </button>
        </div>
      </div>
      {showEmojiPicker ? (
        <div className="absolute bottom-full left-2 right-2 z-40 mb-2 overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900 shadow-xl">
          <Suspense fallback={<div className="p-3 text-sm text-zinc-400">Loading emojis...</div>}>
            <LazyEmojiPicker
              width="100%"
              height={320}
              skinTonesDisabled
              lazyLoadEmojis
              searchPlaceHolder="Search emoji"
              theme={Theme.DARK}
              onEmojiClick={(emojiData: { emoji: string }) => {
                insertText(emojiData.emoji)
                setShowEmojiPicker(false)
              }}
            />
          </Suspense>
        </div>
      ) : null}
      {showMoreActions ? (
        <div className="absolute bottom-full left-2 right-2 z-40 mb-2 flex flex-wrap gap-2 rounded-2xl border border-zinc-700 bg-zinc-900 p-3 shadow-xl">
          {['🎉', '🔥', '💜', '🤍'].map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="grid h-10 w-10 place-items-center rounded-xl border border-zinc-700 bg-zinc-800/80 text-lg"
              onClick={() => {
                insertText(emoji)
                setShowMoreActions(false)
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      ) : null}
    </form>
  )
}
