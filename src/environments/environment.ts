/**
 * Development configuration.
 *
 * `angular.json` replaces this file with `environment.production.ts` for
 * production builds, so anything here is absent from a production bundle
 * rather than merely unreachable in it.
 */
export const environment = {
  production: false,

  /**
   * Credentials the login form starts filled in with, to save retyping them
   * on every reload while developing against the local seed data.
   *
   * These are the seeded local accounts and nothing else — they are not valid
   * against any deployed environment. The production file sets this to null,
   * and the file replacement means the strings never appear in a production
   * bundle at all; a runtime `if (production)` guard would still ship them to
   * every browser that loaded the app.
   */
  demoCredentials: { username: 'admin', password: 'admin123' } as
    { username: string; password: string } | null,
};
