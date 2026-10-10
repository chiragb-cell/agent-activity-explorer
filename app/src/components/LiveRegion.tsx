/**
 * A polite status region: screen readers announce its text whenever it changes.
 *
 * It must stay mounted and only its text should change. A region inserted together
 * with its message is often not announced at all, which is why there is one of these
 * per view instead of `role="status"` sprinkled on each transient message.
 */
export function LiveRegion({ message }: { message: string }) {
  return (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- <output> isn't announced as a live region consistently across screen readers; a div with role="status" is.
    <div role="status" aria-live="polite" aria-atomic="true" className="visually-hidden">
      {message}
    </div>
  )
}
