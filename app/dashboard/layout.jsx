'use client';
import { RoleBasedNavigation } from '../../components/layout/RoleBasedNavigation';

// Note: In a real implementation, you would get the user role from your auth context
// This is a simplified example for demonstration purposes
export default function DashboardLayout({ children }) {
    // TODO: Replace with actual user data from auth context
    const userRole = 'EMPLOYEE'; // This should come from your auth system
    const userName = 'John Doe'; // This should come from your auth system

    return (
        <div className="flex h-screen bg-gray-50">
            <RoleBasedNavigation userRole={userRole} userName={userName} />

            <main className="flex-1 overflow-auto">
                <div className="p-6">
                    {/* Skip to content link for accessibility */}
                    <a
                        href="#main-content"
                        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-blue-600 text-white px-3 py-2 rounded-md text-sm z-50"
                    >
                        Skip to main content
                    </a>

                    <div id="main-content" tabIndex={-1}>
                        {children}
                    </div>
                </div>
            </main>
        </div>
    );
}
