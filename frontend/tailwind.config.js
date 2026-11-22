/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: v("bg"), surface: v("surface"), surface2: v("surface-2"), fg: v("fg"), muted: v("muted"), line: v("line"),
        accent: v("accent"), "accent-ink": v("accent-ink"), "accent-soft": v("accent-soft"),
        good: v("good"), "good-soft": v("good-soft"), warn: v("warn"), "warn-soft": v("warn-soft"),
        bad: v("bad"), "bad-soft": v("bad-soft"), rec: v("rec"), stage: v("stage"), "stage-fg": v("stage-fg"), "stage-muted": v("stage-muted"),
      },
      fontFamily: {
        display: ["Manrope", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["IBM Plex Sans", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
  // score tones are picked at runtime (bg-${tone}-soft), so keep them in the build
  safelist: ["good", "warn", "bad"].flatMap((t) => [`bg-${t}-soft`, `text-${t}`]),
};
