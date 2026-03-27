import { Suspense, lazy, useEffect, useState } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { auth } from './services/firebase'

const ChatScreen = lazy(() =>
  import('./screens/ChatScreen').then((module) => ({ default: module.ChatScreen })),
)
const AuthScreen = lazy(() =>
  import('./screens/AuthScreen').then((module) => ({ default: module.AuthScreen })),
)

function App() {
  const [authUser, setAuthUser] = useState<User | null>(null)
  const [isAuthResolved, setIsAuthResolved] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthUser(user)
      setIsAuthResolved(true)
    })

    return () => {
      unsubscribe()
    }
  }, [])

  return (
    <>
      {!isAuthResolved ? (
        <main className="grid min-h-screen place-items-center px-4">
          <p className="text-sm text-slate-300">Initializing secure chat...</p>
        </main>
      ) : authUser ? (
        <Suspense
          fallback={
            <main className="grid min-h-screen place-items-center px-4">
              <p className="text-sm text-slate-300">Loading chat...</p>
            </main>
          }
        >
          <ChatScreen user={authUser} onError={setErrorMessage} />
        </Suspense>
      ) : (
        <Suspense
          fallback={
            <main className="grid min-h-screen place-items-center px-4">
              <p className="text-sm text-slate-300">Loading auth...</p>
            </main>
          }
        >
          <AuthScreen onError={setErrorMessage} />
        </Suspense>
      )}
      {errorMessage ? (
        <aside
          className="fixed left-2 right-2 top-2 z-40 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100 md:left-auto md:right-4 md:w-[360px]"
          role="status"
          aria-live="polite"
        >
          {errorMessage}
        </aside>
      ) : null}
    </>
  )
}

export default App
