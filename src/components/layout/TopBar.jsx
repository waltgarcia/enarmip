import { useAuth } from '../../context/AuthContext'
import { useLang } from '../../context/LangContext'
import { ChevronDown, LogOut } from 'lucide-react'
import { useState } from 'react'

export default function TopBar({ title }) {
  const { user, profile, signOut } = useAuth()
  const { lang, toggleLang } = useLang()
  const [menuOpen, setMenuOpen] = useState(false)

  const avatarLabel = profile?.full_name?.[0] || user?.email?.[0] || 'U'

  return (
    <header className="fixed top-0 left-0 md:left-60 right-0 z-20 h-16 bg-surface/80 backdrop-blur border-b border-gray-800 flex items-center justify-between px-4 md:px-6">
      <h1 className="font-heading font-semibold text-lg text-white">{title}</h1>

      <div className="flex items-center gap-3">
        {/* Bilingual toggle */}
        <button
          onClick={toggleLang}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-sm font-medium text-gray-300 hover:text-white transition-all border border-gray-700"
        >
          <span className={lang === 'ES' ? 'text-white' : 'text-gray-500'}>ES</span>
          <span className="text-gray-600">|</span>
          <span className={lang === 'EN' ? 'text-white' : 'text-gray-500'}>EN</span>
        </button>

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-all border border-gray-700"
          >
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-accent-blue to-accent-cyan flex items-center justify-center">
              <span className="text-white text-xs font-semibold uppercase">{avatarLabel}</span>
            </div>
            <ChevronDown size={14} className="text-gray-400" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-52 bg-surface border border-gray-700 rounded-xl shadow-xl py-1 z-50">
              <div className="px-4 py-3 border-b border-gray-700">
                <p className="text-sm font-medium text-white truncate">{profile?.full_name || 'User'}</p>
                <p className="text-xs text-gray-400 truncate">{user?.email}</p>
              </div>
              <button
                onClick={() => { setMenuOpen(false); signOut() }}
                className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-all"
              >
                <LogOut size={15} />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
