import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useLang } from '../../context/LangContext'
import {
  LayoutDashboard,
  BookOpen,
  Zap,
  Target,
  FileText,
  BarChart2,
  CreditCard,
  Settings,
  LogOut,
} from 'lucide-react'

const navItems = [
  { path: '/dashboard', icon: LayoutDashboard, labelKey: 'dashboard' },
  { path: '/guidelines', icon: BookOpen, labelKey: 'guidelines' },
  { path: '/generate', icon: Zap, labelKey: 'generate' },
  { path: '/study', icon: Target, labelKey: 'study' },
  { path: '/exam', icon: FileText, labelKey: 'exam' },
  { path: '/results', icon: BarChart2, labelKey: 'results' },
  { path: '/flashcards', icon: CreditCard, labelKey: 'flashcards' },
]

export default function Sidebar() {
  const location = useLocation()
  const { profile, signOut } = useAuth()
  const { t } = useLang()

  return (
    <aside className="hidden md:flex flex-col w-60 min-h-screen bg-surface border-r border-gray-800 fixed left-0 top-0 z-30">
      {/* Logo */}
      <div className="flex items-center gap-2 px-6 py-5 border-b border-gray-800">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-blue to-accent-cyan flex items-center justify-center">
          <span className="text-white font-heading font-bold text-sm">E</span>
        </div>
        <span className="font-heading font-bold text-lg text-white">ENARM<span className="text-accent-cyan">•AI</span></span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ path, icon: Icon, labelKey }) => {
          const active = location.pathname === path
          return (
            <Link
              key={path}
              to={path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                active
                  ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/30'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon size={18} />
              <span>{t(labelKey)}</span>
            </Link>
          )
        })}

        {profile?.role === 'admin' && (
          <Link
            to="/admin"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
              location.pathname === '/admin'
                ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/30'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Settings size={18} />
            <span>{t('admin')}</span>
          </Link>
        )}
      </nav>

      {/* Sign out */}
      <div className="px-3 pb-4 border-t border-gray-800 pt-3">
        <button
          onClick={signOut}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-all duration-200 w-full"
        >
          <LogOut size={18} />
          <span>{t('logout')}</span>
        </button>
      </div>
    </aside>
  )
}
