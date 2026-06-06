import defaultTheme from 'tailwindcss/defaultTheme'

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand accents
        accent: { DEFAULT: '#F26522', dark: '#a63b00' },

        // Material 3-style token set ported from prototype (Design-Frontend/code.html)
        primary: '#000000',
        'on-primary': '#ffffff',
        'primary-container': '#141b2b',
        'on-primary-container': '#7d8497',
        'primary-fixed-dim': '#c0c6db',

        secondary: '#a63b00',
        'on-secondary': '#ffffff',
        'secondary-container': '#fc6c29',
        'on-secondary-container': '#5a1c00',

        background: '#f9f9f9',
        'on-background': '#1a1c1c',

        surface: '#f9f9f9',
        'surface-bright': '#f9f9f9',
        'surface-dim': '#dadada',
        'surface-container-lowest': '#ffffff',
        'surface-container-low': '#f3f3f3',
        'surface-container': '#eeeeee',
        'surface-container-high': '#e8e8e8',
        'surface-container-highest': '#e2e2e2',
        'surface-section': '#F5F5F5',
        'surface-variant': '#e2e2e2',
        'on-surface': '#1a1c1c',
        'on-surface-variant': '#45464c',

        outline: '#76777d',
        'outline-variant': '#c6c6cd',

        error: '#ba1a1a',
        'on-error': '#ffffff',
        'error-container': '#ffdad6',

        'text-muted': '#4B5563',
      },
      spacing: {
        'sidebar-width': '280px',
        'topbar-height': '72px',
        'margin-mobile': '1.25rem',
        'margin-tablet': '2rem',
        'margin-desktop': '3rem',
        gutter: '1.5rem',
      },
      maxWidth: {
        'app-shell': '1440px',
      },
      fontFamily: {
        sans: ['Inter', ...defaultTheme.fontFamily.sans],
      },
      boxShadow: {
        card: '0px 2px 8px rgba(0,0,0,0.08)',
        'card-hover': '0px 4px 16px rgba(0,0,0,0.12)',
      },
      transitionTimingFunction: {
        bezier: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
      },
    },
  },
  plugins: [],
}
