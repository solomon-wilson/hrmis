'use client'

import { useState } from 'react'
import { createBrowserSupabaseClient } from '../../../src/utils/web/supabase-browser'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import Link from 'next/link'

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
		<main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
			<div className="w-full max-w-md">
				<div className="text-center mb-8">
					<h1 className="text-3xl font-bold text-gray-900">Create Account</h1>
					<p className="text-gray-600 mt-2">Sign up to get started with HRMIS</p>
				</div>

				<Card>
					<form onSubmit={onSubmit} className="space-y-6">
						{error && (
							<div
								className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-md text-sm"
								role="alert"
								aria-live="polite"
							>
								{error}
							</div>
						)}

						{message && (
							<div
								className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-md text-sm"
								role="alert"
								aria-live="polite"
							>
								{message}
							</div>
						)}

						<Input
							id="email"
							label="Email Address"
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							required
							autoComplete="email"
							placeholder="you@example.com"
							disabled={loading}
						/>

						<Input
							id="password"
							label="Password"
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							required
							autoComplete="new-password"
							placeholder="Create a strong password"
							helpText="Password must be at least 6 characters"
							disabled={loading}
						/>

						<Button
							type="submit"
							className="w-full"
							loading={loading}
							disabled={loading}
						>
							Sign up
						</Button>
					</form>

					<div className="mt-6 text-center text-sm">
						<span className="text-gray-600">Already have an account? </span>
						<Link href="/login" className="text-blue-600 hover:text-blue-700 font-medium">
							Sign in
						</Link>
					</div>
				</Card>
			</div>
		</main>
	)
}


