import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        // Temas visuais (24/10): card acima de card e item selecionado (src/index.css, src/lib/aparencia).
        "surface-elevated": "hsl(var(--surface-elevated))",
        selection: "hsl(var(--selection))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        // Redesign visual, item 2 — linguagem de cor de status única em
        // todo o app (bg-status-x / text-status-x), em vez de cada tela
        // escolher sua própria classe Tailwind solta (ex.: text-orange-400).
        status: {
          success: "hsl(var(--status-success))",
          info: "hsl(var(--status-info))",
          warning: "hsl(var(--status-warning))",
          danger: "hsl(var(--status-danger))",
          paused: "hsl(var(--status-paused))",
          notes: "hsl(var(--status-notes))",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      boxShadow: {
        'sm': 'var(--shadow-sm)',
        'md': 'var(--shadow-md)',
        'lg': 'var(--shadow-lg)',
      },
      backgroundImage: {
        'gradient-primary': 'var(--gradient-primary)',
        'gradient-accent': 'var(--gradient-accent)',
      },
      transitionProperty: {
        'smooth': 'var(--transition-smooth)',
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        empolgado: { "0%, 100%": { transform: "translateY(0) rotate(-2deg) scale(1)" }, "50%": { transform: "translateY(-8px) rotate(2deg) scale(1.05)" } },
        "desenhar-linha": { from: { strokeDashoffset: "1" }, to: { strokeDashoffset: "0" } },
        "ponto-entra": { from: { transform: "scale(0)", opacity: "0" }, to: { transform: "scale(1)", opacity: "1" } },
        "fluxo-traco": { to: { strokeDashoffset: "-12" } },
        // Abertura do quiz: foguete chega com o mascote, ele pula, o foguete vai embora e ele desce de paraquedas.
        "foguete-entra": { from: { transform: "translateY(220px)", opacity: "0" }, to: { transform: "translateY(0)", opacity: "1" } },
        "foguete-flutua": { "0%, 100%": { transform: "translateY(0) rotate(-1deg)" }, "50%": { transform: "translateY(-8px) rotate(1deg)" } },
        "foguete-voa": { from: { transform: "translateY(0)", opacity: "1" }, "80%": { opacity: "1" }, to: { transform: "translateY(-720px)", opacity: "0" } },
        "mascote-pula": { "0%": { transform: "translateY(0) scale(1)", opacity: "1" }, "60%": { transform: "translateY(-70px) scale(1.04)", opacity: "1" }, "100%": { transform: "translateY(-40px) scale(1)", opacity: "0" } },
        "paraquedas-desce": { from: { transform: "translateY(-250px)", opacity: "0" }, "12%": { opacity: "1" }, to: { transform: "translateY(-30px)", opacity: "1" } },
        "paraquedas-balanca": { "0%, 100%": { transform: "rotate(-4deg)" }, "50%": { transform: "rotate(4deg)" } },
        "paraquedas-some": { from: { transform: "translateY(-30px) scaleY(1)", opacity: "1" }, to: { transform: "translateY(30px) scaleY(0.7)", opacity: "0" } },
        // Mascote do quiz (estilo Duolingo): entra quicando, depois respira e balança sem parar.
        "mascote-entra": {
          "0%": { transform: "translateY(40px) scale(0.6)", opacity: "0" },
          "55%": { transform: "translateY(-14px) scale(1.06, 0.96)", opacity: "1" },
          "75%": { transform: "translateY(0) scale(0.97, 1.04)" },
          "100%": { transform: "translateY(0) scale(1)", opacity: "1" },
        },
        "mascote-flutua": {
          "0%, 100%": { transform: "translateY(0) rotate(-1.2deg) scale(1, 1)" },
          "50%": { transform: "translateY(-7px) rotate(1.2deg) scale(0.995, 1.015)" },
        },
        "mascote-sombra": {
          "0%, 100%": { transform: "scaleX(1)", opacity: "0.25" },
          "50%": { transform: "scaleX(0.82)", opacity: "0.15" },
        },
        "balao-entra": {
          "0%": { transform: "scale(0.4)", opacity: "0" },
          "70%": { transform: "scale(1.08)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        // Shirley brava (16/10): o balão chacoalha.
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "20%, 60%": { transform: "translateX(-4px)" },
          "40%, 80%": { transform: "translateX(4px)" },
        },
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
        // Rodada 7, item 3: respiração bem suave — scale 1 → 1.025 → 1,
        // 4s, ease-in-out infinite (era 3.5s/1.035, sutilmente mais rápido
        // e mais intenso do que o pedido).
        "orb-glow-pulse": {
          "0%, 100%": {
            filter: "drop-shadow(0 0 8px rgba(34,211,238,0.45)) drop-shadow(0 0 2px rgba(34,211,238,0.6))",
            transform: "scale(1)",
          },
          "50%": {
            filter: "drop-shadow(0 0 16px rgba(34,211,238,0.75)) drop-shadow(0 0 4px rgba(34,211,238,0.85))",
            transform: "scale(1.025)",
          },
        },
        // Disparado por 1 ciclo só (ver AssistantOrb `pulse="green"`) quando
        // uma tarefa é concluída — mesma ideia do glow ciano, cor diferente.
        "orb-glow-green": {
          "0%": {
            filter: "drop-shadow(0 0 8px rgba(34,211,238,0.45)) drop-shadow(0 0 2px rgba(34,211,238,0.6))",
            transform: "scale(1)",
          },
          "30%": {
            filter: "drop-shadow(0 0 26px rgba(34,197,94,0.95)) drop-shadow(0 0 8px rgba(34,197,94,1))",
            transform: "scale(1.08)",
          },
          "100%": {
            filter: "drop-shadow(0 0 8px rgba(34,211,238,0.45)) drop-shadow(0 0 2px rgba(34,211,238,0.6))",
            transform: "scale(1)",
          },
        },
      },
      animation: {
        empolgado: "empolgado 1.1s ease-in-out infinite",
        "desenhar-linha": "desenhar-linha 1.8s ease-out 0.3s both",
        "ponto-entra": "ponto-entra 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both",
        "fluxo-traco": "fluxo-traco 1.2s linear infinite",
        "foguete-entra": "foguete-entra 0.9s cubic-bezier(0.2, 0.9, 0.3, 1) both",
        "foguete-flutua": "foguete-flutua 0.7s ease-in-out infinite",
        "foguete-voa": "foguete-voa 1s cubic-bezier(0.5, 0, 0.9, 0.4) forwards",
        "mascote-pula": "mascote-pula 0.8s ease-out forwards",
        "paraquedas-desce": "paraquedas-desce 2.4s cubic-bezier(0.25, 0.6, 0.35, 1) both",
        "paraquedas-balanca": "paraquedas-balanca 1.6s ease-in-out infinite",
        "paraquedas-some": "paraquedas-some 0.35s ease-in forwards",
        "mascote-entra": "mascote-entra 0.8s cubic-bezier(0.34, 1.4, 0.64, 1) both",
        "mascote-flutua": "mascote-flutua 4.5s ease-in-out 0.8s 1",
        "mascote-sombra": "mascote-sombra 4.5s ease-in-out 0.8s 1",
        "balao-entra": "balao-entra 0.45s ease-out 0.7s both",
        shake: "shake 0.5s ease-in-out 3",
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "orb-glow-pulse": "orb-glow-pulse 4s ease-in-out infinite",
        // Item 7 do refinamento: celebração dura ~2s (dentro da faixa
        // pedida de 1.5-2.5s), acompanhando confete + som.
        "orb-glow-green": "orb-glow-green 2s ease-out 1",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
