import type { Config } from 'tailwindcss';
import { eventflowPlugin } from './src/lib/tailwindPlugin';

export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        status: {
          pending: '#f59e0b',
          inProgress: '#3b82f6',
          overdue: '#ef4444',
          done: '#10b981',
          cancelled: '#6b7280',
          planning: '#8b5cf6',
          preparation: '#06b6d4',
          running: '#3b82f6',
          finished: '#10b981',
        },
        priority: {
          low: '#6b7280',
          medium: '#f59e0b',
          high: '#f97316',
          urgent: '#ef4444',
        },
        critical: '#dc2626',
        slack: '#f59e0b',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [eventflowPlugin],
} satisfies Config;
