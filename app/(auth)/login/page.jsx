'use client';
import { useState } from 'react';
import { createBrowserSupabaseClient } from '../../../src/utils/web/supabase-browser';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/Card';
import { validateEmail } from '../../../lib/utils';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [emailError, setEmailError] = useState('');

    const handleEmailChange = (e) => {
        const value = e.target.value;
        setEmail(value);
        setEmailError('');

        if (value && !validateEmail(value)) {
            setEmailError('Please enter a valid email address');
        }
    };

    const onSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        // Client-side validation
        if (!validateEmail(email)) {
            setEmailError('Please enter a valid email address');
            setLoading(false);
            return;
        }

        if (password.length < 6) {
            setError('Password must be at least 6 characters long');
            setLoading(false);
            return;
        }

        try {
            const supabase = createBrowserSupabaseClient();
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;

            // Announce success to screen readers
            const announcement = document.createElement('div');
            announcement.setAttribute('aria-live', 'polite');
            announcement.className = 'sr-only';
            announcement.textContent = 'Login successful, redirecting to dashboard';
            document.body.appendChild(announcement);

            window.location.href = '/';
        } catch (err) {
            setError(err.message || 'Login failed. Please check your credentials and try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8">
                <div className="text-center">
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">
                        Welcome to HRMIS
                    </h1>
                    <p className="text-gray-600">
                        Sign in to your account to continue
                    </p>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle level={2}>Sign In</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={onSubmit} className="space-y-6" noValidate>
                            <Input
                                label="Email Address"
                                type="email"
                                value={email}
                                onChange={handleEmailChange}
                                error={emailError}
                                required
                                autoComplete="email"
                                placeholder="Enter your email address"
                                aria-describedby="email-help"
                            />

                            <Input
                                label="Password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                autoComplete="current-password"
                                placeholder="Enter your password"
                                helpText="Password must be at least 6 characters long"
                            />

                            {error && (
                                <div
                                    role="alert"
                                    aria-live="polite"
                                    className="p-3 bg-red-50 border border-red-200 rounded-md"
                                >
                                    <p className="text-sm text-red-600">{error}</p>
                                </div>
                            )}

                            <Button
                                type="submit"
                                size="lg"
                                loading={loading}
                                disabled={loading || !!emailError}
                                className="w-full"
                            >
                                {loading ? 'Signing in...' : 'Sign In'}
                            </Button>
                        </form>

                        <div className="mt-6 text-center">
                            <p className="text-sm text-gray-600">
                                Need help? Contact your system administrator
                            </p>
                        </div>
                    </CardContent>
                </Card>

                {/* Screen reader instructions */}
                <div className="sr-only">
                    <p>
                        This is the HRMIS login page. Enter your email and password to access your account.
                        If you encounter any issues, please contact your system administrator for assistance.
                    </p>
                </div>
            </div>
        </main>
    );
}
