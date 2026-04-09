const SENSITIVE_ERROR_PATTERN =
  /prisma|invalid\s+`prisma|findmany|findfirst|can't\s+reach\s+database\s+server|database\s+server|postgres|mysql|mongodb|redis|neon\.tech|supabase|rds\.amazonaws\.com|connection\s+string|stack\s+trace|\sat\s+\w+\s*\(|\bat\s+`[^`]+`|\bECONN|\bENOTFOUND|\bETIMEDOUT|\bEHOSTUNREACH/i

export function toUserSafeErrorMessage(rawMessage, fallbackMessage) {
  const message = String(rawMessage ?? '').trim()

  if (!message) {
    return fallbackMessage
  }

  if (SENSITIVE_ERROR_PATTERN.test(message)) {
    return fallbackMessage
  }

  return message
}
