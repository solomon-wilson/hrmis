'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';

export default function Error({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		// Log the error to an error reporting service
		console.error('Application error:', error);
	}, [error]);

	return (
		<div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
			<div className="max-w-md w-full text-center">
				<div className="mb-6">
					<svg
						className="mx-auto h-16 w-16 text-red-500"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						aria-hidden="true"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
						/>
					</svg>
				</div>

				<h1 className="text-2xl font-bold text-gray-900 mb-2">
					Something went wrong
				</h1>

				<p className="text-gray-600 mb-6">
					We're sorry for the inconvenience. An unexpected error occurred.
				</p>

				{error.digest && (
					<p className="text-sm text-gray-500 mb-6 font-mono">
						Error ID: {error.digest}
					</p>
				)}

				<div className="flex flex-col sm:flex-row gap-3 justify-center">
					<Button onClick={reset} variant="primary">
						Try again
					</Button>
					<Button
						onClick={() => (window.location.href = '/')}
						variant="secondary"
					>
						Go home
					</Button>
				</div>
			</div>
		</div>
	);
}
