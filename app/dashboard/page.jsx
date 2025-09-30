'use client';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Tooltip } from '../../components/ui/Tooltip';

export default function DashboardPage() {
    // Mock data - in real implementation, this would come from API calls
    const pendingActions = [
        { id: 1, type: 'Document Upload', description: 'Upload your annual training certificate', dueDate: '2024-01-15', priority: 'high' },
        { id: 2, type: 'Leave Request', description: 'Submit your annual leave plan for approval', dueDate: '2024-01-20', priority: 'medium' }
    ];

    const recentActivities = [
        { id: 1, action: 'Document approved', description: 'Your W-4 form has been approved by HR', timestamp: '2024-01-10T10:30:00Z' },
        { id: 2, action: 'Leave request submitted', description: 'Time off request for Jan 25-26 submitted', timestamp: '2024-01-09T14:15:00Z' }
    ];

    const upcomingEvents = [
        { id: 1, title: 'Annual Performance Review', date: '2024-01-25', type: 'meeting' },
        { id: 2, title: 'Team Building Event', date: '2024-02-01', type: 'event' }
    ];

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    const formatTimeAgo = (dateString) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffInHours = Math.floor((now - date) / (1000 * 60 * 60));

        if (diffInHours < 24) {
            return `${diffInHours} hours ago`;
        } else {
            const diffInDays = Math.floor(diffInHours / 24);
            return `${diffInDays} days ago`;
        }
    };

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                    Good morning, John!
                </h1>
                <p className="text-lg text-gray-600">
                    Here's what's happening with your HR activities today.
                </p>
            </div>

            {/* Alert Section for Urgent Items */}
            {pendingActions.filter(action => action.priority === 'high').length > 0 && (
                <div
                    role="alert"
                    aria-live="polite"
                    className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-md"
                >
                    <div className="flex">
                        <div className="flex-shrink-0">
                            <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <div className="ml-3">
                            <h3 className="text-sm font-medium text-yellow-800">
                                Action Required
                            </h3>
                            <p className="text-sm text-yellow-700 mt-1">
                                You have {pendingActions.filter(action => action.priority === 'high').length} high-priority item(s) that need your attention.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Dashboard Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Pending Actions */}
                <div className="lg:col-span-2">
                    <Card>
                        <CardHeader>
                            <CardTitle level={2}>Pending Actions</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {pendingActions.length > 0 ? (
                                <div className="space-y-4">
                                    {pendingActions.map((action) => (
                                        <div
                                            key={action.id}
                                            className={`p-4 rounded-lg border-l-4 ${
                                                action.priority === 'high'
                                                    ? 'border-red-400 bg-red-50'
                                                    : 'border-yellow-400 bg-yellow-50'
                                            }`}
                                        >
                                            <div className="flex justify-between items-start">
                                                <div className="flex-1">
                                                    <h3 className="font-medium text-gray-900">
                                                        {action.type}
                                                    </h3>
                                                    <p className="text-sm text-gray-600 mt-1">
                                                        {action.description}
                                                    </p>
                                                    <p className="text-xs text-gray-500 mt-2">
                                                        Due: {formatDate(action.dueDate)}
                                                    </p>
                                                </div>
                                                <Tooltip content={`Complete ${action.type.toLowerCase()}`}>
                                                    <Button size="sm" variant="outline">
                                                        Take Action
                                                    </Button>
                                                </Tooltip>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-8">
                                    <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <h3 className="mt-2 text-sm font-medium text-gray-900">All caught up!</h3>
                                    <p className="mt-1 text-sm text-gray-500">No pending actions at this time.</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Quick Stats */}
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle level={2}>Leave Balance</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                <div className="flex justify-between">
                                    <span className="text-sm text-gray-600">Annual Leave</span>
                                    <span className="font-medium">15 days</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-sm text-gray-600">Sick Leave</span>
                                    <span className="font-medium">8 days</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-sm text-gray-600">Personal Days</span>
                                    <span className="font-medium">3 days</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle level={2}>Upcoming Events</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {upcomingEvents.map((event) => (
                                    <div key={event.id} className="flex items-start space-x-3">
                                        <div className="flex-shrink-0">
                                            <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-gray-900">
                                                {event.title}
                                            </p>
                                            <p className="text-sm text-gray-500">
                                                {formatDate(event.date)}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Recent Activity */}
            <Card>
                <CardHeader>
                    <CardTitle level={2}>Recent Activity</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flow-root">
                        <ul className="-mb-8">
                            {recentActivities.map((activity, index) => (
                                <li key={activity.id}>
                                    <div className="relative pb-8">
                                        {index !== recentActivities.length - 1 && (
                                            <span
                                                className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200"
                                                aria-hidden="true"
                                            />
                                        )}
                                        <div className="relative flex space-x-3">
                                            <div>
                                                <span className="h-8 w-8 rounded-full bg-green-500 flex items-center justify-center ring-8 ring-white">
                                                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                    </svg>
                                                </span>
                                            </div>
                                            <div className="min-w-0 flex-1 pt-1.5 flex justify-between space-x-4">
                                                <div>
                                                    <p className="text-sm font-medium text-gray-900">
                                                        {activity.action}
                                                    </p>
                                                    <p className="text-sm text-gray-500">
                                                        {activity.description}
                                                    </p>
                                                </div>
                                                <div className="text-right text-sm text-gray-500">
                                                    <time dateTime={activity.timestamp}>
                                                        {formatTimeAgo(activity.timestamp)}
                                                    </time>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
