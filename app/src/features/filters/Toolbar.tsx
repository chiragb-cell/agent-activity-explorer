import type { ViewState } from '../../url/view'
import { AgentFilter } from './AgentFilter'
import { FilterChips } from './FilterChips'
import { SearchBox } from './SearchBox'
import { StatusFilter } from './StatusFilter'
import styles from './Toolbar.module.css'

export function Toolbar({ view }: { view: ViewState }) {
  return (
    <div className={styles.toolbar}>
      <div className={styles.controls}>
        <SearchBox value={view.q} />
        <StatusFilter value={view.status} />
        <AgentFilter selected={view.agents} />
      </div>
      <FilterChips view={view} />
    </div>
  )
}
