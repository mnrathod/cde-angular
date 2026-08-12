import { environment } from './environment';
import { environment as productionEnvironment } from './environment.production';

/**
 * The prefilled sign-in is a development convenience, and the only thing
 * keeping it out of a deployed build is the `fileReplacements` entry in
 * angular.json. That entry is easy to drop during an unrelated edit to the
 * build config, and nothing would fail loudly if it were — the application
 * would simply ship with a password typed into the login form. These
 * assertions are what fails instead.
 */
describe('environment', () => {

  it('prefills credentials for development', () => {
    expect(environment.production).toBe(false);
    expect(environment.demoCredentials).not.toBeNull();
    expect(environment.demoCredentials?.username).toBeTruthy();
  });

  it('carries no credentials in the production environment', () => {
    expect(productionEnvironment.production).toBe(true);
    expect(productionEnvironment.demoCredentials).toBeNull();
  });

  it('never names the seed password in the production environment', () => {
    // Belt and braces for the thing that actually matters: no credential
    // string reaching a deployed bundle by any route.
    expect(JSON.stringify(productionEnvironment)).not.toContain('admin');
  });

  it('keeps both files to the same shape', () => {
    // A key present in one and missing from the other reads as configured in
    // development and undefined in production, which fails at runtime rather
    // than at build time.
    expect(Object.keys(productionEnvironment).sort())
      .toEqual(Object.keys(environment).sort());
  });
});
