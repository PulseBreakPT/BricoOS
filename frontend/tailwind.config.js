/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html"
  ],
  theme: {
    extend: {
      // Breakpoint extra para ecrãs muito grandes (TV, monitores 4K) — o
      // conteúdo ganha mais respiração em vez de esticar até às margens.
      screens: {
        '3xl': '1920px',
      },
      fontFamily: {
        heading: ['"Cabinet Grotesk"', 'Manrope', 'sans-serif'],
        sans: ['Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      },
      // Escala tipográfica nomeada (aditiva ao scale Tailwind por omissão —
      // text-xs..text-5xl continuam a funcionar). Ver secção B do design
      // system: hierarquia clara entre título/subtítulo/label/valor/corpo/metadata.
      fontSize: {
        display: ['2.75rem', { lineHeight: '1.05', fontWeight: '800', letterSpacing: '-0.02em' }],
        h1: ['2rem', { lineHeight: '1.15', fontWeight: '800', letterSpacing: '-0.02em' }],
        h2: ['1.5rem', { lineHeight: '1.2', fontWeight: '700', letterSpacing: '-0.01em' }],
        h3: ['1.125rem', { lineHeight: '1.3', fontWeight: '700', letterSpacing: '-0.01em' }],
        label: ['0.75rem', { lineHeight: '1.3', fontWeight: '700', letterSpacing: '0.04em' }],
        'value-lg': ['1.75rem', { lineHeight: '1.1', fontWeight: '800', letterSpacing: '-0.01em' }],
        body: ['0.875rem', { lineHeight: '1.5', fontWeight: '500', letterSpacing: '0' }],
        meta: ['0.75rem', { lineHeight: '1.4', fontWeight: '500', letterSpacing: '0' }],
      },
      // Escala de elevação já definida em index.css (--shadow-e1..e4,
      // camadas com destaque interior); expor como utilities Tailwind
      // (shadow-e1..shadow-e4, shadow-chrome) para não depender de
      // arbitrary values repetidos por todo o código.
      boxShadow: {
        e1: 'var(--shadow-e1)',
        e2: 'var(--shadow-e2)',
        e3: 'var(--shadow-e3)',
        e4: 'var(--shadow-e4)',
        chrome: 'var(--shadow-chrome)',
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        // Trio semântico novo — mesma forma de --destructive, para que
        // sucesso/aviso/info sejam cidadãos de primeira classe em
        // Button/Badge/Alert em vez de hex ad hoc por ficheiro.
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
          bg: 'hsl(var(--success-bg))'
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
          bg: 'hsl(var(--warning-bg))'
        },
        info: {
          DEFAULT: 'hsl(var(--info))',
          foreground: 'hsl(var(--info-foreground))',
          bg: 'hsl(var(--info-bg))'
        },
        // Escala de contraste de texto (secção A) — degraus explícitos
        // entre foreground e muted-foreground.
        text: {
          primary: 'hsl(var(--text-primary))',
          secondary: 'hsl(var(--text-secondary))',
          body: 'hsl(var(--text-body))',
          tertiary: 'hsl(var(--text-tertiary))',
          disabled: 'hsl(var(--text-disabled))'
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chrome: {
          DEFAULT: 'var(--chrome)',
          deep: 'var(--chrome-deep)',
          raised: 'var(--chrome-raised)',
          overlay: 'var(--chrome-overlay)',
          edge: 'var(--chrome-edge)',
          text: 'var(--chrome-text)',
          muted: 'var(--chrome-muted)',
          faint: 'var(--chrome-faint)'
        },
        signal: {
          DEFAULT: 'var(--signal)',
          strong: 'var(--signal-strong)'
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))'
        }
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' }
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' }
        }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out'
      }
    }
  },
  plugins: [require("tailwindcss-animate")],
};
