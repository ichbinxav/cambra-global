/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  safelist: [
    "text-node-blue", "bg-node-blue", "bg-node-blue-subtle", "border-node-blue",
    "bg-blue-500", "bg-green-500", "bg-orange-500", "text-blue-500", "text-green-500",
  ],
  theme: {
    extend: {
      fontFamily: {
        inter: ['var(--font-inter)'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': '#7C6CFF',      // lilac
          '2': '#2FC9A6',      // mint
          '3': '#5B3A83',      // plum
          '4': 'hsl(var(--muted-foreground))',
          '5': 'hsl(var(--border))',
        },
        neon: {
          '1': 'hsl(var(--neon-1))',
          '2': 'hsl(var(--neon-2))',
          '3': 'hsl(var(--neon-3))',
          '4': 'hsl(var(--neon-4))',
          '5': 'hsl(var(--neon-5))',
          '6': 'hsl(var(--neon-6))',
          '7': 'hsl(var(--neon-7))',
          '8': 'hsl(var(--neon-8))',
          '9': 'hsl(var(--neon-9))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--background))',
          foreground: 'hsl(var(--foreground))',
          primary: 'hsl(var(--primary))',
          'primary-foreground': 'hsl(var(--primary-foreground))',
          accent: 'hsl(var(--secondary))',
          'accent-foreground': 'hsl(var(--foreground))',
          border: 'hsl(var(--border))',
          ring: 'hsl(var(--ring))',
        }
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
        'shimmer': { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        'pulse-slow': { '0%, 100%': { opacity: '0.4' }, '50%': { opacity: '1' } },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'shimmer': 'shimmer 2s linear infinite',
        'pulse-slow': 'pulse-slow 3s ease-in-out infinite',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}