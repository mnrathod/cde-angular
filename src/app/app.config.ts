import {
  ApplicationConfig, provideZoneChangeDetection,
  ErrorHandler, APP_INITIALIZER, isDevMode
} from '@angular/core';
import { provideRouter, withViewTransitions, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { GlobalErrorHandler } from './core/handlers/global-error.handler';
import { provideServiceWorker } from '@angular/service-worker';

export const appConfig: ApplicationConfig = {
  providers: [
    // Zone change detection with event coalescing for better performance
    provideZoneChangeDetection({ eventCoalescing: true }),

    // Router with view transitions + input binding (Angular 17+)
    provideRouter(
      routes,
      withViewTransitions(),
      withComponentInputBinding()
    ),

    // HTTP with auth interceptor
    provideHttpClient(
      withInterceptors([authInterceptor])
    ),

    // Global error handler — catches all uncaught Angular errors
    { provide: ErrorHandler, useClass: GlobalErrorHandler },

    // Service worker (PWA) — only in production builds
    ...(isDevMode() ? [] : [
      { provide: 'SW_ENABLED', useValue: true }
      // provideServiceWorker('ngsw-worker.js', { enabled: !isDevMode() })
    ]), provideServiceWorker('ngsw-worker.js', {
            enabled: !isDevMode(),
            registrationStrategy: 'registerWhenStable:30000'
          }),
  ]
};
