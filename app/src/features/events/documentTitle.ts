import { STATUS_LABELS } from '../../lib/status'
import type { ViewState } from '../../url/view'

/**
 * A title per view, so browser tabs, history and the Back/Forward menus say what each
 * entry is ("Event evt_01… · “refund”, Error · Agent Activity") instead of one name.
 */
export function documentTitle(view: ViewState): string {
  const filters = [
    view.q ? `“${view.q}”` : null,
    view.status ? STATUS_LABELS[view.status] : null,
    view.agents.length === 1 ? view.agents[0] : null,
    view.agents.length > 1 ? `${view.agents.length} agents` : null,
  ].filter(Boolean)
  return [view.event ? `Event ${view.event}` : null, filters.join(', ') || null, 'Agent Activity']
    .filter(Boolean)
    .join(' · ')
}
