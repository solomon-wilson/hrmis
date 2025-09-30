'use client'

import { useState } from 'react'
import { createBrowserSupabaseClient } from '../../../src/utils/web/supabase-browser'

export default function SignupPage() {
	const [email, setEmail] = useState('')
	const [password, setPassword] = useState('')
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [message, setMessage] = useState<string | null>(null)

	const onSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		setLoading(true)
		setError(null)
		setMessage(null)
		try {
			const supabase = createBrowserSupabaseClient()
			const { error } = await supabase.auth.signUp({ email, password })
			if (error) throw error
			setMessage('Check your email for verification link.')
		} catch (err: any) {
			setError(err.message || 'Signup failed')
		} finally {
			setLoading(false)
		}
	}

	return (
		<main style={{ maxWidth: 360, margin: '64px auto', padding: 16 }}>
			<h1>Create account</h1>
			<form onSubmit={onSubmit}>
				<label>Email</label>
				<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required style={{ width: '100%', marginBottom: 8 }} />
				<label>Password</label>
				<input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required style={{ width: '100%', marginBottom: 12 }} />
				<button type="submit" disabled={loading}>
					{loading ? 'Creating...' : 'Sign up'}
				</button>
				{error && <p style={{ color: 'red' }}>{error}</p>}
				{message && <p style={{ color: 'green' }}>{message}</p>}
			</form>
		</main>
	)
}


