/**
 * Development configuration.
 *
 * `angular.json` replaces this file with `environment.production.ts` for
 * production builds, so anything added here is absent from a production bundle
 * rather than merely unreachable in it.
 *
 * <p>This used to carry `demoCredentials`, which prefilled the login form with
 * the seeded account's username and password. The seeded account no longer
 * exists unless a deployment explicitly asks for one and supplies its own
 * password, so there is nothing left to prefill — and a credential that lives
 * in a source file is one file-replacement mistake away from being shipped.
 */
export const environment = {
  production: false,
};
