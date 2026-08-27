import { describe, expect, it } from 'vitest';
import { environment } from './environment';
import { environment as productionEnvironment } from './environment.production';

/**
 * The file-replacement entry in `angular.json` is the only thing that makes a
 * production build use `environment.production.ts`. That entry is easy to drop
 * during an unrelated edit to the build config, and nothing would fail loudly
 * if it were. These assertions are what fails instead.
 */
describe('environment', () => {

  it('marks the two builds apart', () => {
    expect(environment.production).toBe(false);
    expect(productionEnvironment.production).toBe(true);
  });

  it('carries no credential in either build', () => {
    // This file used to hold the seeded account's username and password so the
    // login form could arrive prefilled. Both are gone, and the assertion
    // stays: a credential added back here reaches every browser that loads the
    // application, and only the file replacement stands between it and a
    // deployed bundle.
    for (const built of [environment, productionEnvironment]) {
      const serialised = JSON.stringify(built).toLowerCase();
      expect(serialised).not.toContain('password');
      expect(serialised).not.toContain('credential');
      expect(serialised).not.toContain('secret');
      expect(serialised).not.toContain('admin');
    }
  });

  it('keeps both files to the same shape', () => {
    // A key present in one and missing from the other reads as configured in
    // development and undefined in production, which fails at runtime rather
    // than at build time.
    expect(Object.keys(productionEnvironment).sort())
      .toEqual(Object.keys(environment).sort());
  });
});
