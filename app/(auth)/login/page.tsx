'use client'

import { useState } from 'react'
import { createBrowserSupabaseClient } from '../../../src/utils/web/supabase-browser'

export default function LoginPage() {
	const [email, setEmail] = useState('')
	const [password, setPassword] = useState('')
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const onSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		setLoading(true)
		setError(null)
		try {
			const supabase = createBrowserSupabaseClient()
			const { error } = await supabase.auth.signInWithPassword({ email, password })
			if (error) throw error
			window.location.href = '/'
		} catch (err: any) {
			setError(err.message || 'Login failed')
		} finally {
			setLoading(false)
		}
	}

	return (
		<main style={{ maxWidth: 360, margin: '64px auto', padding: 16 }}>
			<h1>Login</h1>
			<form onSubmit={onSubmit}>
				<label>Email</label>
				<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required style={{ width: '100%', marginBottom: 8 }} />
				<label>Password</label>
				<input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required style={{ width: '100%', marginBottom: 12 }} />
				<button type="submit" disabled={loading}>
					{loading ? 'Signing in...' : 'Sign in'}
				</button>
				{error && <p style={{ color: 'red' }}>{error}</p>}
			</form>
		</main>
	)
}


