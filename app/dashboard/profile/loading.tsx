export default function ProfileLoading() {
	return (
		<div className="animate-pulse space-y-6">
			{/* Header skeleton */}
			<div className="h-8 bg-gray-200 rounded w-1/3"></div>

			{/* Profile card skeleton */}
			<div className="bg-white p-6 rounded-lg shadow space-y-4">
				<div className="flex items-center space-x-4">
					<div className="h-20 w-20 bg-gray-200 rounded-full"></div>
					<div className="flex-1 space-y-2">
						<div className="h-6 bg-gray-200 rounded w-1/3"></div>
						<div className="h-4 bg-gray-200 rounded w-1/4"></div>
					</div>
				</div>

				<div className="space-y-3 pt-4">
					{[...Array(6)].map((_, i) => (
						<div key={i} className="flex items-center space-x-3">
							<div className="h-4 bg-gray-200 rounded w-1/4"></div>
							<div className="h-4 bg-gray-200 rounded flex-1"></div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
