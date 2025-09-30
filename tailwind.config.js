const config = {
    content: [
        './app/**/*.{js,ts,jsx,tsx,mdx}',
        './components/**/*.{js,ts,jsx,tsx,mdx}',
        './src/**/*.{js,ts,jsx,tsx,mdx}',
        './lib/**/*.{js,ts,jsx,tsx}'
    ],
    theme: {
        extend: {
            colors: {
                // Accessible color palette with proper contrast ratios
                primary: {
                    50: '#eff6ff',
                    100: '#dbeafe',
                    200: '#bfdbfe',
                    300: '#93c5fd',
                    400: '#60a5fa',
                    500: '#3b82f6', // Main blue - WCAG AA compliant
                    600: '#2563eb',
                    700: '#1d4ed8',
                    800: '#1e40af',
                    900: '#1e3a8a',
                },
                success: {
                    50: '#f0fdf4',
                    100: '#dcfce7',
                    500: '#22c55e', // WCAG AA compliant
                    600: '#16a34a',
                    700: '#15803d',
                },
                warning: {
                    50: '#fffbeb',
                    100: '#fef3c7',
                    500: '#f59e0b', // WCAG AA compliant
                    600: '#d97706',
                    700: '#b45309',
                },
                error: {
                    50: '#fef2f2',
                    100: '#fee2e2',
                    500: '#ef4444', // WCAG AA compliant
                    600: '#dc2626',
                    700: '#b91c1c',
                }
            },
            fontFamily: {
                sans: ['Inter', 'system-ui', 'sans-serif'], // Accessible font
            },
            fontSize: {
                xs: ['0.75rem', { lineHeight: '1.5' }], // Improved line height for readability
                sm: ['0.875rem', { lineHeight: '1.5' }],
                base: ['1rem', { lineHeight: '1.5' }],
                lg: ['1.125rem', { lineHeight: '1.5' }],
                xl: ['1.25rem', { lineHeight: '1.4' }],
                '2xl': ['1.5rem', { lineHeight: '1.3' }],
                '3xl': ['1.875rem', { lineHeight: '1.3' }],
            },
            spacing: {
                '18': '4.5rem', // Additional spacing for better touch targets
                '22': '5.5rem',
            },
            minHeight: {
                '44': '44px', // Minimum touch target size for accessibility
            },
            minWidth: {
                '44': '44px',
            }
        },
    },
    plugins: [
        // Plugin for screen reader utilities
        function({ addUtilities }) {
            addUtilities({
                '.sr-only': {
                    position: 'absolute',
                    width: '1px',
                    height: '1px',
                    padding: '0',
                    margin: '-1px',
                    overflow: 'hidden',
                    clip: 'rect(0, 0, 0, 0)',
                    whiteSpace: 'nowrap',
                    border: '0',
                },
                '.not-sr-only': {
                    position: 'static',
                    width: 'auto',
                    height: 'auto',
                    padding: '0',
                    margin: '0',
                    overflow: 'visible',
                    clip: 'auto',
                    whiteSpace: 'normal',
                },
                '.focus\\:not-sr-only:focus': {
                    position: 'static',
                    width: 'auto',
                    height: 'auto',
                    padding: '0',
                    margin: '0',
                    overflow: 'visible',
                    clip: 'auto',
                    whiteSpace: 'normal',
                },
                // High contrast focus indicators
                '.focus-visible': {
                    '&:focus-visible': {
                        outline: '2px solid #2563eb',
                        outlineOffset: '2px',
                    }
                },
                // Skip link utilities
                '.skip-link': {
                    position: 'absolute',
                    top: '-40px',
                    left: '6px',
                    background: '#2563eb',
                    color: 'white',
                    padding: '8px',
                    textDecoration: 'none',
                    transition: 'top 0.3s',
                    zIndex: '100',
                    '&:focus': {
                        top: '6px',
                    }
                }
            });
        }
    ],
};
export default config;
