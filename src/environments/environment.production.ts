/**
 * Production configuration. Swapped in for `environment.ts` by the
 * `fileReplacements` entry in `angular.json`.
 */
export const environment = {
  production: true,

  /** Never prefill credentials in a deployed build. */
  demoCredentials: null as { username: string; password: string } | null,
};
