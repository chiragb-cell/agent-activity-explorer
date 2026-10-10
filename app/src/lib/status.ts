import { isKnownStatus, type KnownStatus } from '../api/schemas'

export const STATUS_LABELS: Record<KnownStatus, string> = {
  ok: 'OK',
  blocked: 'Blocked',
  error: 'Error',
}

/** Human label for any status, including ones the API might add later. */
export function statusLabel(status: string): string {
  return isKnownStatus(status) ? STATUS_LABELS[status] : status
}
