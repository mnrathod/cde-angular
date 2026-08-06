import {
  Directive, ElementRef, HostListener, Input, OnInit,
  OnDestroy, inject, Renderer2
} from '@angular/core';

/**
 * FocusTrapDirective
 * Traps focus inside a container (modals, dialogs, drawers).
 * Usage: <div focusTrap>...</div>
 */
@Directive({
  selector: '[focusTrap]',
  standalone: true
})
export class FocusTrapDirective implements OnInit, OnDestroy {
  private el       = inject(ElementRef<HTMLElement>);
  private renderer = inject(Renderer2);
  private unlisten?: () => void;

  readonly FOCUSABLE = [
    'a[href]','button:not([disabled])','input:not([disabled])',
    'select:not([disabled])','textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  ngOnInit() {
    // Focus first focusable element
    setTimeout(() => {
      const first = this.el.nativeElement.querySelector(this.FOCUSABLE) as HTMLElement | null;
      first?.focus();
    }, 50);

    this.unlisten = this.renderer.listen(
      this.el.nativeElement, 'keydown', (e: KeyboardEvent) => this.onKeyDown(e)
    );
  }

  ngOnDestroy() { this.unlisten?.(); }

  private onKeyDown(e: KeyboardEvent) {
    if (e.key !== 'Tab') return;
    const focusable = Array.from(
      this.el.nativeElement.querySelectorAll(this.FOCUSABLE)
    ).filter((el: any) => el.offsetParent !== null) as HTMLElement[];

    if (!focusable.length) return;
    const first = focusable[0];
    const last  = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { last?.focus(); e.preventDefault(); }
    } else {
      if (document.activeElement === last) { first?.focus(); e.preventDefault(); }
    }
  }
}

/**
 * KeyboardClickDirective
 * Makes non-button elements keyboard-clickable (Enter/Space).
 * Usage: <div role="button" keyboardClick (click)="doSomething()">...</div>
 */
@Directive({
  selector: '[keyboardClick]',
  standalone: true,
  host: { '[tabindex]': '"0"' }
})
export class KeyboardClickDirective {
  private el = inject(ElementRef<HTMLElement>);

  @HostListener('keydown', ['$event'])
  onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.el.nativeElement.click();
    }
  }
}

/**
 * AriaLiveDirective
 * Announces dynamic content changes to screen readers.
 * Usage: <div ariaLive="polite">{{ message }}</div>
 */
@Directive({
  selector: '[ariaLive]',
  standalone: true
})
export class AriaLiveDirective implements OnInit {
  @Input('ariaLive') politeness: 'polite' | 'assertive' = 'polite';
  private el = inject(ElementRef<HTMLElement>);

  ngOnInit() {
    this.el.nativeElement.setAttribute('aria-live', this.politeness);
    this.el.nativeElement.setAttribute('aria-atomic', 'true');
  }
}

/**
 * SkipLinkDirective
 * Adds skip-to-content functionality for keyboard users.
 * Usage: add <a skipLink href="#main-content">Skip to content</a>
 */
@Directive({
  selector: '[skipLink]',
  standalone: true
})
export class SkipLinkDirective implements OnInit {
  private el = inject(ElementRef<HTMLAnchorElement>);

  ngOnInit() {
    const a = this.el.nativeElement;
    a.style.cssText = `
      position: absolute; top: -100%; left: 0; z-index: 99999;
      background: var(--accent); color: #fff; padding: 8px 16px;
      font-size: 14px; border-radius: 0 0 4px 0;
      transition: top .2s;
    `;
    a.addEventListener('focus',  () => a.style.top = '0');
    a.addEventListener('blur',   () => a.style.top = '-100%');
  }
}

// ── Export all for shared module ───────────────────────────────
export const ACCESSIBILITY_DIRECTIVES = [
  FocusTrapDirective,
  KeyboardClickDirective,
  AriaLiveDirective,
  SkipLinkDirective
] as const;
