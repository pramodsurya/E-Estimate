import { Files, GitBranch, Route, Search } from 'lucide-react'
import { useStore, type ActivityView } from '../store/useStore'

const ITEMS: { key: ActivityView; Icon: typeof Files; title: string }[] = [
  { key: 'explorer', Icon: Files, title: 'Explorer' },
  { key: 'search', Icon: Search, title: 'Search' },
  { key: 'lead', Icon: Route, title: 'DTL Lead' },
  { key: 'sourcecontrol', Icon: GitBranch, title: 'Source Control' }
]

export default function ActivityBar(): JSX.Element {
  const activity = useStore((s) => s.activity)
  const setActivity = useStore((s) => s.setActivity)
  return (
    <div className="activitybar">
      {ITEMS.map(({ key, Icon, title }) => (
        <button
          key={key}
          className={`ab-btn ${activity === key ? 'active' : ''}`}
          title={title}
          onClick={() => setActivity(key)}
        >
          <Icon size={24} strokeWidth={1.6} />
        </button>
      ))}
    </div>
  )
}
