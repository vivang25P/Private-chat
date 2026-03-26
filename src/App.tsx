import { useEffect, useState } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { ChatScreen } from './screens/ChatScreen'
import { AuthScreen } from './screens/AuthScreen'
import { auth } from './services/firebase'

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
        <ChatScreen user={authUser} onError={setErrorMessage} />
      ) : (
        <AuthScreen onError={setErrorMessage} />
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
