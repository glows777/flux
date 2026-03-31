const SHELL_META_CHARS = /[;&|`$(){}<>!]/

export function createWhitelist(allowed?: string[]) {
  const patterns = allowed ?? ['scripts/']

  return ({ command }: { command: string }): { command: string } | undefined => {
    const trimmed = command.trim()

    // Block shell metacharacters first (prevents injection regardless of path)
    if (SHELL_META_CHARS.test(trimmed)) {
      return { command: 'exit 1' }
    }

    // Check if any allowed path appears in the command
    // Safe because metacharacters are already blocked above
    const referencesAllowedPath = patterns.some((p) => trimmed.includes(p))
    if (!referencesAllowedPath) {
      return { command: 'exit 1' }
    }

    return undefined
  }
}
