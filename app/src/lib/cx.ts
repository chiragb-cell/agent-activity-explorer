/** Joins class names, skipping falsy ones: `cx(styles.row, selected && styles.selected)`. */
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}
