import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { loadTranslations } from '@angular/localize';
import { installTranslations } from './i18n/install-translations';

/**
 * Translations are installed before Angular boots, not after.
 *
 * <p>`loadTranslations` has to run before the first `$localize` tagged string
 * is evaluated, and component code starts evaluating them the moment the
 * application bootstraps. Doing this in an initialiser would be too late for
 * anything rendered on the first change-detection pass.
 *
 * <p>It never rejects — a missing or broken catalogue leaves the source text
 * in place — so there is no failure path to handle here beyond the one
 * bootstrap already had.
 */
installTranslations(fetch, document, navigator.languages, loadTranslations)
  .then(() => bootstrapApplication(App, appConfig))
  .catch(err => console.error(err));
