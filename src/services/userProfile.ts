import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore'
import { db } from './firebase'
import { getOrCreateUserKeyPair } from './keyManager'
import type { UserProfile } from './types'

interface EnsureUserProfileParams {
  userId: string
  email: string | null
  username?: string
  phone?: string
  publicKey?: string
}

export async function ensureUserProfile({
  userId,
  email,
  username,
  phone,
  publicKey,
}: EnsureUserProfileParams): Promise<void> {
  const fallbackKeys = getOrCreateUserKeyPair()
  const userRef = doc(db, 'users', userId)
  const existingSnapshot = await getDoc(userRef)
  const existingData = existingSnapshot.exists() ? existingSnapshot.data() : null
  await setDoc(
    userRef,
    {
      id: userId,
      email: existingData?.email ?? email ?? '',
      username:
        username?.trim() || existingData?.username || (email ? email.split('@')[0] : 'user'),
      phone: phone?.trim() || existingData?.phone || '',
      publicKey: publicKey ?? existingData?.publicKey ?? fallbackKeys.publicKey,
      createdAt: existingData?.createdAt ?? serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

export async function getEmailByLoginIdentifier(
  identifierInput: string,
): Promise<string | null> {
  const value = identifierInput.trim()
  if (!value) {
    return null
  }
  if (value.includes('@')) {
    return value
  }

  const usersRef = collection(db, 'users')
  const byUsername = query(usersRef, where('username', '==', value), limit(1))
  const usernameSnap = await getDocs(byUsername)
  if (!usernameSnap.empty) {
    return String(usernameSnap.docs[0].data().email || null)
  }

  const byPhone = query(usersRef, where('phone', '==', value), limit(1))
  const phoneSnap = await getDocs(byPhone)
  if (!phoneSnap.empty) {
    return String(phoneSnap.docs[0].data().email || null)
  }

  return null
}

export async function getUserProfileById(userId: string): Promise<UserProfile | null> {
  const snapshot = await getDoc(doc(db, 'users', userId))
  if (!snapshot.exists()) {
    return null
  }
  const data = snapshot.data()
  const createdAt = data.createdAt as Timestamp | undefined
  return {
    id: data.id as string,
    email: data.email as string,
    username: data.username as string,
    phone: (data.phone as string) || undefined,
    publicKey: data.publicKey as string,
    createdAt: createdAt?.toDate() ?? new Date(),
  }
}
