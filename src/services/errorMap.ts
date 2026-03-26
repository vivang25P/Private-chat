const MESSAGE_MAP: Record<string, string> = {
  'auth/invalid-credential': 'Incorrect login credentials. Please try again.',
  'auth/email-already-in-use': 'This email is already registered.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/weak-password': 'Password is too weak. Use at least 6 characters.',
  'permission-denied': 'Access denied. Please verify Firestore rules.',
  unavailable: 'Service is temporarily unavailable. Please retry.',
  'failed-precondition':
    'Database is not ready. Ensure Firestore is created in Firebase console.',
}

export function toUserError(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error && 'code' in error) {
    const code = String((error as { code?: string }).code)
    if (MESSAGE_MAP[code]) {
      return MESSAGE_MAP[code]
    }
  }
  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallback
}
