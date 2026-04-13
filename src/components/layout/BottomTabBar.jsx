import { Link, useLocation } from 'react-router-dom'
import { useLang } from '../../context/LangContext'
import {
  LayoutDashboard,
  BookOpen,
  Zap,
  FileText,
  BarChart2,
} from 'lucide-react'

const tabItems = [
  { path: '/dashboard', icon: LayoutDashboard, labelKey: 'dashboard' },
  { path: '/guidelines', icon: BookOpen, labelKey: 'guidelines' },
  { path: '/generate', icon: Zap, labelKey: 'generate' },
  { path: '/exam', icon: FileText, labelKey: 'exam' },
  { path: '/results', icon: BarChart2, labelKey: 'results' },
]

export default function BottomTabBar() {
  const location = useLocation()
  const { t } = useLang()

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-surface border-t border-gray-800 flex">
      {tabItems.map(({ path, icon: Icon, labelKey }) => {
        const active = location.pathname === path
        return (
          <Link
            key={path}
            to={path}
            className={`flex-1 flex flex-col items-center gap-1 py-2 text-xs font-medium transition-colors ${
              active ? 'text-accent-blue' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <Icon size={20} />
            <span className="truncate">{t(labelKey)}</span>
          </Link>
        )
      })}
    </nav>
  )
}
