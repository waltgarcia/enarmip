import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Mail, Lock, User, Building } from 'lucide-react'

export default function Signup() {
  const { user } = useAuth()
  const [form, setForm] = useState({ name: '', institution: '', email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  if (user) return <Navigate to="/dashboard" replace />

  const handleChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const handleSignup = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { data, error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: { name: form.name, institution: form.institution },
      },
    })
    if (error) {
      setError(error.message)
    } else {
      if (data.user) {
        await supabase.from('profiles').upsert({
          id: data.user.id,
          name: form.name,
          institution: form.institution,
          email: form.email,
          role: 'student',
        })
      }
      setSuccess(true)
    }
    setLoading(false)
  }

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center bg-surface border border-gray-800 rounded-2xl p-8">
          <div className="w-14 h-14 rounded-full bg-success/20 flex items-center justify-center mx-auto mb-4">
            <span className="text-success text-2xl">✓</span>
          </div>
          <h2 className="font-heading font-bold text-xl text-white mb-2">¡Registro exitoso!</h2>
          <p className="text-gray-400 text-sm mb-6">Revisa tu correo para confirmar tu cuenta.</p>
          <Link to="/login" className="text-accent-blue hover:underline text-sm font-medium">
            Ir al inicio de sesión
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-accent-blue to-accent-cyan mb-4">
            <span className="text-white font-heading font-bold text-2xl">E</span>
          </div>
          <h1 className="font-heading font-bold text-3xl text-white">ENARM<span className="text-accent-cyan">•AI</span></h1>
          <p className="text-gray-400 mt-1 text-sm">Crea tu cuenta para comenzar</p>
        </div>

        <div className="bg-surface border border-gray-800 rounded-2xl p-8">
          <h2 className="font-heading font-semibold text-xl text-white mb-6">Crear cuenta</h2>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-error/10 border border-error/30 text-error text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Nombre completo</label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input type="text" name="name" value={form.name} onChange={handleChange} placeholder="Dr. Ana García" required
                  className="w-full pl-9 pr-4 py-2.5 bg-background border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-accent-blue text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Institución</label>
              <div className="relative">
                <Building size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input type="text" name="institution" value={form.institution} onChange={handleChange} placeholder="IMSS, ISSSTE, UNAM..."
                  className="w-full pl-9 pr-4 py-2.5 bg-background border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-accent-blue text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Correo electrónico</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input type="email" name="email" value={form.email} onChange={handleChange} placeholder="tu@correo.com" required
                  className="w-full pl-9 pr-4 py-2.5 bg-background border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-accent-blue text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Contraseña</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input type="password" name="password" value={form.password} onChange={handleChange} placeholder="••••••••" required minLength={6}
                  className="w-full pl-9 pr-4 py-2.5 bg-background border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-accent-blue text-sm" />
              </div>
            </div>
            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-accent-blue hover:bg-blue-600 disabled:opacity-50 text-white font-medium rounded-xl transition-colors text-sm">
              {loading ? <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-white"></div> : 'Crear cuenta'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-400 mt-5">
            ¿Ya tienes cuenta?{' '}
            <Link to="/login" className="text-accent-blue hover:underline font-medium">Iniciar sesión</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
