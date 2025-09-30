import Link from 'next/link';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen bg-gray-100">
      <div className="w-64 bg-white shadow-md">
        <div className="p-4">
          <h1 className="text-2xl font-semibold">HRMIS</h1>
        </div>
        <nav className="mt-4">
          <Link href="/dashboard" className="block p-4 text-sm text-gray-600 hover:bg-gray-200">Dashboard</Link>
          <Link href="/dashboard/profile" className="block p-4 text-sm text-gray-600 hover:bg-gray-200">Profile</Link>
          <Link href="/dashboard/team" className="block p-4 text-sm text-gray-600 hover:bg-gray-200">My Team</Link>
          <Link href="/dashboard/reports" className="block p-4 text-sm text-gray-600 hover:bg-gray-200">Reports</Link>
          <Link href="/dashboard/admin" className="block p-4 text-sm text-gray-600 hover:bg-gray-200">Admin</Link>
        </nav>
      </div>
      <div className="flex-1 p-6">
        {children}
      </div>
    </div>
  );
}