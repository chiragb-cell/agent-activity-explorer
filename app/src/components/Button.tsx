import type { ComponentProps } from 'react'
import { cx } from '../lib/cx'
import styles from './Button.module.css'

interface ButtonProps extends ComponentProps<'button'> {
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md'
}

/** The one button style. Always `type="button"` unless told otherwise, so it never submits. */
export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(styles.button, styles[variant], styles[size], className)}
      {...props}
    />
  )
}
