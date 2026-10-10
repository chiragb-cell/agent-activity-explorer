/** About 1,500 lines of pretty JSON: past this, laying out a <pre> starts to block the page. */
export const JSON_PREVIEW_CHARS = 50_000

/** Pretty JSON for display; `undefined` (a missing field) is said in words. */
export function toPrettyJson(value: unknown): string {
  if (value === undefined) return 'Not provided'
  return JSON.stringify(value, null, 2)
}
