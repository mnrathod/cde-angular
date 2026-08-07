/**
 * Global test setup.
 *
 * Angular's fakeAsync()/tick() need the ProxyZone, which is installed by
 * whichever test-framework patch zone.js loads. zone.js/testing only
 * auto-detects Jasmine, Mocha and Jest — this project runs Vitest, so no
 * patch was applied and every fakeAsync test failed with
 * "Expected to be running in 'ProxyZone', but it was not found."
 *
 * zone.js ships a Vitest patch but does not select it automatically, so it
 * has to be imported explicitly, after zone-testing has defined the
 * ProxyZone/FakeAsyncTestZone specs it builds on.
 */
import 'zone.js/testing';
import 'zone.js/plugins/vitest-patch';
