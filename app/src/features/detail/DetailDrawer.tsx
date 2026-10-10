// On narrow screens (tablets) the detail panel is a modal drawer instead of a column.
//
// A native <dialog> opened with showModal() gives the hard parts for free: focus is
// trapped inside, everything behind it is inert, Escape is handled, and ::backdrop
// dims the page. Escape and backdrop clicks are routed through the URL (onClose) like
// every other close, so Back/Forward stay consistent.

import { useLayoutEffect, useRef, type ReactNode } from 'react'
import styles from './DetailDrawer.module.css'

interface DetailDrawerProps {
  onClose: () => void
  children: ReactNode
}

export function DetailDrawer({ onClose, children }: DetailDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  // A layout effect, so the dialog is modal before the panel's own effects run (the
  // panel focuses its heading; a plain effect here would open the dialog afterwards
  // and move focus away again).
  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  return (
    // The backdrop click is a mouse convenience: Escape and the panel's close button
    // are the keyboard paths.
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={dialogRef}
      className={styles.drawer}
      aria-label="Event details"
      onCancel={(event) => {
        // Escape: keep the dialog under React's control and close through the URL,
        // exactly once (the panel's own Escape handler is off in drawer mode).
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        // A click on the dialog element itself (not its content) is a click on the
        // backdrop area.
        if (event.target === event.currentTarget) onClose()
      }}
    >
      {children}
    </dialog>
  )
}
