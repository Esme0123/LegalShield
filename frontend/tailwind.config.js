/**
 * LegalShield · Sistema de diseno
 *
 * Toda la paleta se expone en dos capas:
 *  1. Colores literales (`steel`, `mint`, `pastel`, ...) -> uso puntual, siempre iguales.
 *  2. Colores semanticos basados en variables CSS (`bg`, `surface`, `text`, ...)
 *     -> re-mapean al instante en modo claro / oscuro sin duplicar clases.
 */

const semantic = (variable) => `rgb(var(${variable}) / <alpha-value>)`

/** @type {import('tailwindcss').Config} */
export default {
  // El tema real vive en variables CSS (ver src/index.css). Este ajuste solo
  // habilita el helper `dark:` sobre el atributo data-theme del <html>.
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // Escala de opacidad completa (0..100). Tailwind 3 solo acepta modificadores
      // presentes en el tema, y la paleta translucida de LegalShield usa pasos finos.
      opacity: Object.fromEntries(
        Array.from({ length: 101 }, (_, i) => [i, String(Math.round((i / 100) * 10000) / 10000)]),
      ),
      colors: {
        steel: '#344d67',
        mint: '#6eccaf',
        pastel: '#ade792',
        cream: '#f3ecb0',
        navy: '#112e81',
        indigo: '#4647ae',
        electric: '#4382df',
        ice: '#aaccd6',

        bg: semantic('--ls-bg'),
        bgdeep: semantic('--ls-bg-deep'),
        surface: semantic('--ls-surface'),
        surface2: semantic('--ls-surface-2'),
        overlay: semantic('--ls-overlay'),
        line: semantic('--ls-border'),
        lineSoft: semantic('--ls-border-soft'),
        ink: semantic('--ls-text'),
        muted: semantic('--ls-text-muted'),
        accent: semantic('--ls-accent'),
        accentInk: semantic('--ls-accent-ink'),
        info: semantic('--ls-info'),
        highlight: semantic('--ls-highlight'),
        danger: semantic('--ls-danger'),
        onAccent: semantic('--ls-on-accent'),
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Space Grotesk', 'Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 0 0 rgb(var(--ls-border) / 0.35), 0 18px 40px -24px rgb(0 0 0 / 0.55)',
        lift: '0 26px 60px -30px rgb(var(--ls-accent) / 0.45)',
        glow: '0 0 0 1px rgb(var(--ls-accent) / 0.4), 0 0 28px -4px rgb(var(--ls-accent) / 0.55)',
        inset: 'inset 0 1px 0 0 rgb(255 255 255 / 0.06)',
      },
      backgroundImage: {
        'grid-fine':
          'linear-gradient(to right, rgb(var(--ls-border) / 0.16) 1px, transparent 1px), linear-gradient(to bottom, rgb(var(--ls-border) / 0.16) 1px, transparent 1px)',
        'scanlines': 'repeating-linear-gradient(0deg, rgb(0 0 0 / 0.16) 0px, rgb(0 0 0 / 0.16) 1px, transparent 1px, transparent 4px)',
      },
      backgroundSize: {
        grid: '32px 32px',
      },
      keyframes: {
        floaty: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(200%)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.85)', opacity: '0.65' },
          '100%': { transform: 'scale(1.9)', opacity: '0' },
        },
        'scan-y': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        'caret-blink': {
          '0%, 45%': { opacity: '1' },
          '55%, 100%': { opacity: '0.15' },
        },
      },
      animation: {
        floaty: 'floaty 5s ease-in-out infinite',
        shimmer: 'shimmer 2.2s ease-in-out infinite',
        'pulse-ring': 'pulse-ring 1.8s ease-out infinite',
        'scan-y': 'scan-y 3.4s linear infinite',
        'caret-blink': 'caret-blink 1s steps(1) infinite',
      },
      transitionTimingFunction: {
        shield: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
}