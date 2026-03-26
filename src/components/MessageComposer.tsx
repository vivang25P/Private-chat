import { Suspense, lazy, useRef, useState, type FormEvent } from 'react'

const LazyEmojiPicker = lazy(() => import('emoji-picker-react'))

interface MessageComposerProps {
  disabled?: boolean
  onSend: (value: string) => Promise<void>
  onTypingChange: (isTyping: boolean) => void
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
      className="fixed bottom-0 left-0 right-0 z-30 flex items-center gap-2 border-t border-borderc bg-black px-2 pb-3 pt-2 md:static md:rounded-2xl md:border md:bg-card"
      onSubmit={handleSubmit}
      ref={formRef}
    >
      <button
        type="button"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-borderc bg-card text-slate-100"
        aria-label="Open camera"
        onClick={() => insertText('📷')}
        disabled={disabled || isSending}
      >
        📷
      </button>
      <div className="flex min-w-0 flex-1 items-center rounded-full border border-borderc bg-card px-2">
        <textarea
          id="message-input"
          className="min-h-[40px] max-h-32 min-w-0 flex-1 resize-none border-none bg-transparent px-2 py-2 text-base leading-6 text-slate-100 outline-none placeholder:text-slate-500 focus:ring-0"
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
        <button
          type="button"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-100"
          onClick={() => {
            setShowEmojiPicker((current) => !current)
            setShowMoreActions(false)
          }}
          disabled={disabled || isSending}
          aria-label="Open emoji picker"
        >
          😊
        </button>
        <button
          type="button"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-100"
          onClick={() => {
            setShowMoreActions((current) => !current)
            setShowEmojiPicker(false)
          }}
          disabled={disabled || isSending}
          aria-label="More actions"
        >
          +
        </button>
      </div>
      <button
        className="h-10 min-w-[64px] shrink-0 rounded-2xl bg-purple-700 px-3 font-medium text-slate-100 disabled:opacity-60"
        type="submit"
        disabled={disabled || isSending || !value.trim()}
      >
        {isSending ? 'Sending' : 'Send'}
      </button>
      {showEmojiPicker ? (
        <div className="absolute bottom-16 left-2 right-2 z-20 overflow-hidden rounded-2xl border border-borderc bg-card p-2">
          <Suspense fallback={<div className="p-3 text-sm text-slate-400">Loading emojis...</div>}>
            <LazyEmojiPicker
              width="100%"
              height={320}
              skinTonesDisabled
              lazyLoadEmojis
              searchPlaceHolder="Search emoji"
              onEmojiClick={(emojiData: { emoji: string }) => {
                insertText(emojiData.emoji)
                setShowEmojiPicker(false)
              }}
            />
          </Suspense>
        </div>
      ) : null}
      {showMoreActions ? (
        <div className="absolute bottom-16 left-2 right-2 z-20 flex flex-wrap gap-2 rounded-2xl border border-borderc bg-card p-2">
          {['🎉', '🔥', '💜', '🤍'].map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="h-9 min-w-9 rounded-lg border border-borderc bg-black/40"
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
