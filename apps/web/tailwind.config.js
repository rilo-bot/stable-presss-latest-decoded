/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      /*
       * THE UI-CHROME TYPE SCALE — three sizes, floor 14px.
       *
       * The magazine studio had seven (9 · 10 · 11 · 12 · 12.5 · 15 · 16) and all
       * but four sites were 12px or smaller: 58 uses of 11px and 48 of 10px. The
       * distinction between 10 and 11 carries no information a reader can perceive,
       * so it was noise that read as inconsistency. `ui-sm` is the floor and
       * nothing in application chrome should go below it.
       *
       * Raised +2px across all three sizes (was 12/13/15) for the low-vision /
       * first-time-user accessibility pass — see the Aug 2026 audit. A uniform
       * shift keeps the original rhythm (1px gap ui-sm→ui, 2px gap ui→ui-lg)
       * instead of inventing a new one. The one fixed-size container that held
       * ui-sm text (AiPanel's proposal-count badge) was widened to match.
       */
      fontSize: {
        'ui-lg': ['1.0625rem', { lineHeight: '1.35' }], // 17px — panel + dialog titles
        ui: ['0.9375rem', { lineHeight: '1.45' }], //       15px — body, chat, inputs
        'ui-sm': ['0.875rem', { lineHeight: '1.4' }], //    14px — labels, meta, buttons
      },
      colors: {
        /*
         * Magazine studio chrome. Values in index.css; see the block there for why
         * ink is parchment rather than white and why there are exactly four levels.
         * Referenced as bg-studio-panel / text-studio-ink-3 / border-studio-hair.
         */
        studio: {
          bg: 'var(--studio-bg)',
          panel: { DEFAULT: 'var(--studio-panel)', 2: 'var(--studio-panel-2)' },
          raise: { DEFAULT: 'var(--studio-raise)', 2: 'var(--studio-raise-2)' },
          hair: 'var(--studio-hair)',
          edge: { DEFAULT: 'var(--studio-edge)', strong: 'var(--studio-edge-strong)' },
          ink: {
            DEFAULT: 'var(--studio-ink)',
            2: 'var(--studio-ink-2)',
            3: 'var(--studio-ink-3)',
            4: 'var(--studio-ink-4)',
          },
          /* The studio's ONE accent. Blue (sky-*) is retired: it belonged to no
             palette in this product and competed with gold for "primary". */
          gold: 'var(--gold-bright)',
          /* Selection lands on the PAGE, not the chrome — see index.css. */
          select: { DEFAULT: 'var(--studio-select)', soft: 'var(--studio-select-soft)', wash: 'var(--studio-select-wash)' },
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        /* Surface ladder — see docs/THEME-DIRECTION.md.
           `surface` is the SUNKEN plane (wells, list panes, rails). The page is
           `background` and the raised work surface is `card`. Anything that
           floats above the page is `bg-card`, never `bg-muted`. */
        surface: 'hsl(var(--surface-sunken))',
        /* Edges split by job: `hair` is decorative (card edges, dividers),
           `edge` is a control boundary and clears 3:1 (inputs, selects). */
        hair: 'hsl(var(--hair))',
        edge: 'hsl(var(--edge))',
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        brand: {
          DEFAULT: 'hsl(var(--brand))',
          foreground: 'hsl(var(--brand-foreground))',
          /* FILLS AND RULES ONLY — 2.19:1 as text on card. For gold text use
             `text-brand-accent-ink`. */
          accent: 'hsl(var(--brand-accent))',
          'accent-foreground': 'hsl(var(--brand-accent-foreground))',
          'accent-ink': 'hsl(var(--brand-accent-ink))',
        },
        chart: {
          1: 'hsl(var(--chart-1))',
          2: 'hsl(var(--chart-2))',
          3: 'hsl(var(--chart-3))',
          4: 'hsl(var(--chart-4))',
          5: 'hsl(var(--chart-5))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        display: ['var(--font-display)', 'serif'],
        body: ['var(--font-body)', 'sans-serif'],
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
