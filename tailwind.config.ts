import type { Config } from 'tailwindcss'

export default {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        primary: '#7C3AED',
        'primary-hover': '#6D28D9',
        'bg-base': '#1E1E2E',
        'surface-1': '#181825',
        'surface-2': '#11111B',
        'surface-3': '#2A2A3E',
        'text-primary': '#CDD6F4',
        'text-muted': '#6C7086',
        border: '#3A3A5C',
        success: '#A6E3A1',
        warning: '#F9E2AF',
        error: '#F38BA8',
        info: '#89DCEB'
      },
      fontFamily: {
        heading: ['Inter', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace']
      },
      fontSize: {
        xs: '0.75rem',
        sm: '0.875rem',
        base: '1rem',
        lg: '1.125rem',
        xl: '1.25rem',
        '2xl': '1.5rem'
      },
      spacing: {
        1: '4px',
        2: '8px',
        3: '12px',
        4: '16px',
        6: '24px',
        8: '32px',
        12: '48px'
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '6px',
        md: '6px'
      },
      boxShadow: {
        panel: '0 4px 16px rgba(0,0,0,0.4)',
        sm: '0 1px 4px rgba(0,0,0,0.3)'
      },
      transitionDuration: {
        fast: '100',
        normal: '200',
        slow: '300'
      }
    }
  },
  plugins: []
} satisfies Config
