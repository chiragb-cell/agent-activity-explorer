import { useEffect, useState } from 'react'
import { Button } from './Button'
import { LiveRegion } from './LiveRegion'

type CopyState = 'idle' | 'copied' | 'failed'

/**
 * Copies `text` to the clipboard and confirms it both visibly ("Copied") and to screen
 * readers, through a status region that stays mounted next to the button.
 */
export function CopyButton({
  text,
  label,
  idleText = 'Copy',
}: {
  text: string
  /** Accessible name; must start with the visible text, e.g. "Copy link to this event". */
  label: string
  idleText?: string
}) {
  const [state, setState] = useState<CopyState>('idle')

  useEffect(() => {
    if (state === 'idle') return
    const timer = setTimeout(() => setState('idle'), 2000)
    return () => clearTimeout(timer)
  }, [state])

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setState('copied')
    } catch {
      // Clipboard access can be denied (permissions, insecure context); say so.
      setState('failed')
    }
  }

  return (
    <>
      <Button size="sm" variant="ghost" aria-label={label} onClick={() => void copy()}>
        {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : idleText}
      </Button>
      <LiveRegion
        message={
          state === 'copied' ? 'Copied to clipboard' : state === 'failed' ? 'Couldn’t copy' : ''
        }
      />
    </>
  )
}
