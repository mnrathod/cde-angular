import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the routed outlet inside the main landmark', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    const main = compiled.querySelector('main#main-content');
    expect(main).toBeTruthy();
    expect(main!.querySelector('router-outlet')).toBeTruthy();
  });

  it('should render a skip link targeting the main landmark', async () => {
    // Keyboard-accessibility affordance — easy to delete by accident, so
    // it is asserted rather than assumed.
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    const skipLink = compiled.querySelector('a[href="#main-content"]');
    expect(skipLink).toBeTruthy();
    expect(skipLink!.textContent?.trim()).toBe('Skip to content');
  });

  it('should mount the global overlay components', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    for (const selector of ['app-offline-banner', 'app-error-toast', 'app-upload-progress']) {
      expect(compiled.querySelector(selector)).toBeTruthy();
    }
  });
});
