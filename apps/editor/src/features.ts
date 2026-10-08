/**
 * Whether the Cues view can be reached. It is not ready for the public, so
 * every build hides it, the Pages and Vercel deploys included, unless built
 * with VITE_CUES_VIEW=1. `pnpm dev` shows it, so it can be worked on.
 *
 * Read on every call, not once, so a test can turn it off with vi.stubEnv.
 */
export function cuesViewOn(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_CUES_VIEW === '1';
}
