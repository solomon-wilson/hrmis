export default function DashboardLoading() {
	return (
		<div className="animate-pulse space-y-6">
			{/* Header skeleton */}
			<div className="h-8 bg-gray-200 rounded w-1/4"></div>

			{/* Stats cards skeleton */}
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				{[...Array(3)].map((_, i) => (
					<div key={i} className="bg-white p-6 rounded-lg shadow">
						<div className="h-4 bg-gray-200 rounded w-3/4 mb-3"></div>
						<div className="h-8 bg-gray-200 rounded w-1/2"></div>
					</div>
				))}
			</div>

			{/* Content section skeleton */}
			<div className="bg-white p-6 rounded-lg shadow space-y-3">
				<div className="h-4 bg-gray-200 rounded w-1/3 mb-4"></div>
				{[...Array(5)].map((_, i) => (
					<div key={i} className="h-4 bg-gray-200 rounded"></div>
				))}
			</div>
		</div>
	);
}
