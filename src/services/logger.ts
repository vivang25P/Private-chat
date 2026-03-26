export function logError(scope: string, error: unknown): void {
  console.error(`[${scope}]`, error)
}
