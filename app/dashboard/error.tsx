'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';

export default function DashboardError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		console.error('Dashboard error:', error);
	}, [error]);

	return (
		<div className="flex items-center justify-center min-h-[60vh] p-4">
			<div className="max-w-md w-full text-center">
				<div className="mb-6">
					<svg
						className="mx-auto h-12 w-12 text-red-500"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						aria-hidden="true"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
				</div>

				<h2 className="text-xl font-semibold text-gray-900 mb-2">
					Failed to load dashboard
				</h2>

				<p className="text-gray-600 mb-6">
					We encountered an error while loading this section. Please try again.
				</p>

				{error.digest && (
					<p className="text-xs text-gray-500 mb-6 font-mono">
						Error ID: {error.digest}
					</p>
				)}

				<Button onClick={reset} variant="primary">
					Try again
				</Button>
			</div>
		</div>
	);
}
