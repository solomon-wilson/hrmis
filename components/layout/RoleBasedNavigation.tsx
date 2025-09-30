'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '../../lib/utils';
import { Tooltip } from '../ui/Tooltip';

interface NavigationItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  description: string;
  roles: string[];
}

interface RoleBasedNavigationProps {
  userRole: 'EMPLOYEE' | 'MANAGER' | 'HR_ADMIN';
  userName?: string;
}

const navigationItems: NavigationItem[] = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
      </svg>
    ),
    description: 'Overview of your work and recent activities',
    roles: ['EMPLOYEE', 'MANAGER', 'HR_ADMIN']
  },
  {
    href: '/dashboard/profile',
    label: 'My Profile',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
    description: 'View and update your personal information',
    roles: ['EMPLOYEE', 'MANAGER', 'HR_ADMIN']
  },
  {
    href: '/dashboard/documents',
    label: 'My Documents',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    description: 'Upload and manage your documents',
    roles: ['EMPLOYEE', 'MANAGER', 'HR_ADMIN']
  },
  {
    href: '/dashboard/leave',
    label: 'Leave Management',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    description: 'Request time off and view leave balance',
    roles: ['EMPLOYEE', 'MANAGER', 'HR_ADMIN']
  },
  {
    href: '/dashboard/team',
    label: 'My Team',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
    description: 'Manage your team members and approvals',
    roles: ['MANAGER', 'HR_ADMIN']
  },
  {
    href: '/dashboard/reports',
    label: 'Reports',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    description: 'Generate and view organizational reports',
    roles: ['MANAGER', 'HR_ADMIN']
  },
  {
    href: '/dashboard/admin',
    label: 'Administration',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    description: 'System administration and user management',
    roles: ['HR_ADMIN']
  }
];

const RoleBasedNavigation: React.FC<RoleBasedNavigationProps> = ({ userRole, userName }) => {
  const pathname = usePathname();

  const filteredItems = navigationItems.filter(item =>
    item.roles.includes(userRole)
  );

  const roleDisplayNames = {
    EMPLOYEE: 'Employee',
    MANAGER: 'Manager',
    HR_ADMIN: 'HR Administrator'
  };

  return (
    <aside
      className="w-64 bg-white shadow-lg border-r border-gray-200 h-full"
      aria-label="Main navigation"
    >
      {/* Logo and User Info */}
      <div className="p-6 border-b border-gray-200">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">HRMIS</h1>
        {userName && (
          <div className="text-sm text-gray-600">
            <p className="font-medium">{userName}</p>
            <p className="text-xs text-gray-500">{roleDisplayNames[userRole]}</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="mt-6 px-3" aria-label="Primary navigation">
        <ul className="space-y-1" role="list">
          {filteredItems.map((item) => {
            const isActive = pathname === item.href;

            return (
              <li key={item.href}>
                <Tooltip content={item.description} placement="right">
                  <Link
                    href={item.href}
                    className={cn(
                      'flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors group',
                      'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
                      isActive
                        ? 'bg-blue-50 text-blue-700 border-r-2 border-blue-700'
                        : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                    )}
                    aria-current={isActive ? 'page' : undefined}
                    aria-label={`${item.label} - ${item.description}`}
                  >
                    <span
                      className={cn(
                        'mr-3 flex-shrink-0',
                        isActive ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-500'
                      )}
                      aria-hidden="true"
                    >
                      {item.icon}
                    </span>
                    {item.label}
                  </Link>
                </Tooltip>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Quick Actions for Employees */}
      {userRole === 'EMPLOYEE' && (
        <div className="mt-8 px-3">
          <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Quick Actions
          </h3>
          <div className="mt-2 space-y-1">
            <Tooltip content="Submit a new leave request" placement="right">
              <button
                className="w-full text-left flex items-center px-3 py-2 text-sm text-gray-600 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Request time off"
              >
                <svg className="w-4 h-4 mr-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Request Time Off
              </button>
            </Tooltip>
          </div>
        </div>
      )}

      {/* Logout */}
      <div className="absolute bottom-4 left-4 right-4">
        <button
          className="w-full flex items-center px-3 py-2 text-sm text-gray-600 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Sign out of your account"
        >
          <svg className="w-4 h-4 mr-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sign Out
        </button>
      </div>
    </aside>
  );
};

export { RoleBasedNavigation };