/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // TODOS los colores salen de variables CSS definidas en src/index.css (claro y oscuro).
      // Nunca uses colores de Tailwind (slate-*, white, emerald-*…) en componentes: ver docs/DISENO.md
      colors: {
        paper: 'rgb(var(--c-paper) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
        ink: { DEFAULT: 'rgb(var(--c-ink) / <alpha-value>)', soft: 'rgb(var(--c-ink-soft) / <alpha-value>)', mute: 'rgb(var(--c-ink-mute) / <alpha-value>)' },
        brand: { DEFAULT: 'rgb(var(--c-brand) / <alpha-value>)', dark: 'rgb(var(--c-brand-dark) / <alpha-value>)', light: 'rgb(var(--c-brand-light) / <alpha-value>)', ring: 'rgb(var(--c-brand-ring) / <alpha-value>)' },
        chat: { sent: 'rgb(var(--c-chat-sent) / <alpha-value>)', bg: 'rgb(var(--c-chat-bg) / <alpha-value>)', accent: 'rgb(var(--c-chat-accent) / <alpha-value>)', dark: 'rgb(var(--c-chat-dark) / <alpha-value>)', tick: 'rgb(var(--c-chat-tick) / <alpha-value>)' },
        ok: { DEFAULT: 'rgb(var(--c-ok) / <alpha-value>)', soft: 'rgb(var(--c-ok-soft) / <alpha-value>)', ink: 'rgb(var(--c-ok-ink) / <alpha-value>)' },
        amber: { soft: 'rgb(var(--c-amber-soft) / <alpha-value>)', DEFAULT: 'rgb(var(--c-amber) / <alpha-value>)', ink: 'rgb(var(--c-amber-ink) / <alpha-value>)' },
        danger: { soft: 'rgb(var(--c-danger-soft) / <alpha-value>)', DEFAULT: 'rgb(var(--c-danger) / <alpha-value>)' },
      },
      fontFamily: {
        sans: ['"Segoe UI"', 'system-ui', '-apple-system', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        display: ['"Segoe UI"', 'system-ui', '-apple-system', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        pop: 'var(--shadow-pop)',
      },
      keyframes: {
        rise: { '0%': { opacity: 0, transform: 'translateY(8px)' }, '100%': { opacity: 1, transform: 'none' } },
        bounce3: { '0%,80%,100%': { transform: 'scale(.6)', opacity: 0.4 }, '40%': { transform: 'scale(1)', opacity: 1 } },
        progress: { from: { width: '0%' }, to: { width: '100%' } },
        scan: { '0%,100%': { top: '14%', opacity: 0.2 }, '50%': { top: '80%', opacity: 1 } },
        toast: { '0%': { opacity: 0, transform: 'translate(-50%, 12px)' }, '100%': { opacity: 1, transform: 'translate(-50%, 0)' } },
      },
      animation: {
        rise: 'rise .3s ease-out both',
        dot: 'bounce3 1.2s infinite ease-in-out both',
        progress: 'progress 4s linear forwards',
        scan: 'scan 1.6s ease-in-out infinite',
        toast: 'toast .25s ease-out both',
      },
    },
  },
  plugins: [],
};
