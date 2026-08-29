import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: '#0D47A1',
          blue: '#2196F3',
          soft: '#90CAF9',
          tint: '#E3F2FD',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          canvas: '#F5F8FC',
          border: '#E2E8F0',
          low: '#F2F3FF',
          high: '#E2E7FF',
        },
        ink: {
          DEFAULT: '#0F172A',
          muted: '#64748B',
        },
        status: {
          success: '#16A34A',
          warning: '#F59E0B',
          danger: '#DC2626',
          info: '#2196F3',
        },
      },
      borderRadius: { card: '0.5rem', badge: '0.375rem' },
      boxShadow: {
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04)',
        overlay: '0 8px 24px -4px rgb(15 23 42 / 0.12)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
