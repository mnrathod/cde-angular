import { Component, Input, ChangeDetectionStrategy, computed, signal } from '@angular/core';

/** Every icon this application draws. Compile-time checked at each call site. */
export type IconName =
  // Navigation and view
  | 'pan' | 'select' | 'zoom-in' | 'zoom-out' | 'fit' | 'rotate'
  | 'chevron-left' | 'chevron-right' | 'arrow-left' | 'panel'
  // Drawing
  | 'line' | 'arrow' | 'rect' | 'circle' | 'ellipse'
  | 'polygon' | 'polyline' | 'freehand' | 'cloud'
  // Text and notes
  | 'text' | 'callout' | 'note' | 'stamp'
  // Text markup
  | 'highlight' | 'underline' | 'strikeout' | 'squiggly'
  // Measurement
  | 'calibrate' | 'length' | 'area' | 'radius'
  // Document processing
  | 'redact' | 'form-field' | 'flatten' | 'ocr'
  // Commands
  | 'undo' | 'redo' | 'trash' | 'save' | 'print' | 'export' | 'import'
  | 'check' | 'close' | 'warning'
  // Sidebar panels
  | 'pen' | 'comment' | 'signature' | 'pages' | 'search' | 'outline' | 'history';

/**
 * Outlines for every icon, as SVG path data on a 24×24 grid.
 *
 * All of them are stroke-only and carry no colour of their own, which is what
 * lets a single definition sit on a light rail, a dark header and a selected
 * accent-filled button without a second variant. They replaced a mix of emoji
 * and typographic glyphs (`✋`, `⬭`, `S̶`, `🔎`): emoji are rendered by the
 * operating system, so the toolbar was drawn in three different styles,
 * weights and baselines depending on who opened it — the single strongest
 * signal that a web application is not a finished product.
 */
const ICON_PATHS: Readonly<Record<IconName, ReadonlyArray<string>>> = {
  // ── Navigation and view ──────────────────────────────────────
  'pan': ['M12 3v18', 'M3 12h18', 'M12 3 9.5 5.5M12 3l2.5 2.5',
          'M12 21l-2.5-2.5M12 21l2.5-2.5', 'M3 12l2.5-2.5M3 12l2.5 2.5',
          'M21 12l-2.5-2.5M21 12l-2.5 2.5'],
  'select': ['M5 3l13.5 7.8-6.2 1.4L9.4 18z'],
  'zoom-in': ['M11 4a7 7 0 1 0 0 14 7 7 0 1 0 0-14', 'M16.2 16.2 21 21',
              'M11 8.2v5.6', 'M8.2 11h5.6'],
  'zoom-out': ['M11 4a7 7 0 1 0 0 14 7 7 0 1 0 0-14', 'M16.2 16.2 21 21',
               'M8.2 11h5.6'],
  'fit': ['M4 9V4h5', 'M20 9V4h-5', 'M4 15v5h5', 'M20 15v5h-5'],
  'rotate': ['M20.5 12a8.5 8.5 0 1 1-2.5-6', 'M20.5 4v5h-5'],
  'chevron-left': ['M14.5 5 8 12l6.5 7'],
  'chevron-right': ['M9.5 5 16 12l-6.5 7'],
  'arrow-left': ['M20 12H4', 'M10 6l-6 6 6 6'],
  'panel': ['M3.5 5h17v14h-17z', 'M10 5v14'],

  // ── Drawing ──────────────────────────────────────────────────
  'line': ['M5 19 19 5'],
  'arrow': ['M4 20 18.5 5.5', 'M19 5h-6.5', 'M19 5v6.5'],
  'rect': ['M4 6.5h16v11H4z'],
  'circle': ['M12 4a8 8 0 1 0 0 16 8 8 0 1 0 0-16'],
  'ellipse': ['M12 6.5c5 0 9 2.5 9 5.5s-4 5.5-9 5.5-9-2.5-9-5.5 4-5.5 9-5.5'],
  'polygon': ['M12 3.2l8.8 6.4-3.4 10.4H6.6L3.2 9.6z'],
  'polyline': ['M3.5 17.5 8.5 10l4 3 3.5-6.5 4.5 5'],
  'freehand': ['M4.5 19.5l1-4L16.6 4.4a2 2 0 0 1 2.9 2.9L8.5 18.5z',
               'M14.6 6.4l3 3'],
  'cloud': ['M6.5 17.5a3.4 3.4 0 0 1-.4-6.8 4.6 4.6 0 0 1 8.2-2.4 3.6 3.6 0 0 1 5 3.3 3.2 3.2 0 0 1-.4 5.9z'],

  // ── Text and notes ───────────────────────────────────────────
  'text': ['M5 6.5V4.5h14v2', 'M12 4.5v15', 'M8.5 19.5h7'],
  'callout': ['M3.5 5h17v10.5h-9L7 20v-4.5H3.5z'],
  'note': ['M6 3.5h8.5L19 8v12.5H6z', 'M14.5 3.5V8H19', 'M9 12h7', 'M9 15.5h5'],
  'stamp': ['M8.5 10.5V7a3.5 3.5 0 0 1 7 0v3.5', 'M4.5 14h15v3.5h-15z',
            'M4.5 20.5h15', 'M6.5 14l1.2-3.5h8.6L17.5 14'],

  // ── Text markup ──────────────────────────────────────────────
  'highlight': ['M14.5 3.5 20.5 9.5l-8.5 8.5H6.5v-5.5z', 'M11.5 6.5l6 6',
                'M4 21h16'],
  'underline': ['M7 4v6.5a5 5 0 0 0 10 0V4', 'M5 20.5h14'],
  'strikeout': ['M4 12h16', 'M7.5 6.5h9', 'M7.5 17.5h9'],
  'squiggly': ['M6 7.5h12', 'M3.5 16c1.4-3 2.8-3 4.2 0s2.8 3 4.2 0 2.8-3 4.2 0 2.8 3 4.2 0'],

  // ── Measurement ──────────────────────────────────────────────
  'calibrate': ['M3 8h18v8H3z', 'M7 8v3.5', 'M11 8v3.5', 'M15 8v3.5', 'M19 8v3.5'],
  'length': ['M3 12h18', 'M3 12l3.5-3M3 12l3.5 3', 'M21 12l-3.5-3M21 12l-3.5 3',
             'M3 6.5v11', 'M21 6.5v11'],
  'area': ['M3.2 7.5 10 3l10.8 4.2-2.4 11L6 20z', 'M8 11h7', 'M8 14.5h5'],
  'radius': ['M12 4a8 8 0 1 0 0 16 8 8 0 1 0 0-16', 'M12 12l5.7-5.7',
             'M11.4 12a.6.6 0 1 0 1.2 0 .6.6 0 1 0-1.2 0'],

  // ── Document processing ──────────────────────────────────────
  'redact': ['M4 5.5h16v5.5H4z', 'M4 14h10v5.5H4z', 'M17 14h3v5.5h-3z'],
  'form-field': ['M3 7h18v10H3z', 'M8 10v8', 'M6.2 10h3.6', 'M6.2 18h3.6'],
  'flatten': ['M12 3l8.5 4.6L12 12.2 3.5 7.6z', 'M3.5 12.4 12 17l8.5-4.6',
              'M3.5 16.8 12 21.4l8.5-4.6'],
  'ocr': ['M4 7.5V4h3.5', 'M16.5 4H20v3.5', 'M20 16.5V20h-3.5', 'M7.5 20H4v-3.5',
          'M8 10h8', 'M8 14h5'],

  // ── Commands ─────────────────────────────────────────────────
  'undo': ['M9 14.5 4 9.5l5-5', 'M4 9.5h10.5a5.5 5.5 0 0 1 0 11H9'],
  'redo': ['M15 14.5l5-5-5-5', 'M20 9.5H9.5a5.5 5.5 0 0 0 0 11H15'],
  'trash': ['M4 7h16', 'M9.5 7V4.5h5V7', 'M6 7l1 13.5h10L18 7',
            'M10 10.5v7', 'M14 10.5v7'],
  'save': ['M5 3.5h11L19.5 7v13.5H5z', 'M8.5 3.5v6h7v-6', 'M8 13.5h8v7H8z'],
  'print': ['M7 9.5V3.5h10v6', 'M4.5 9.5h15v7h-3v4h-9v-4h-3z', 'M7.5 16.5h9'],
  'export': ['M12 3v12.5', 'M8 7l4-4 4 4', 'M4 16.5V21h16v-4.5'],
  'import': ['M12 15.5V3', 'M8 11.5l4 4 4-4', 'M4 16.5V21h16v-4.5'],
  'check': ['M5 12.5 9.5 17 19 7'],
  'close': ['M6 6l12 12', 'M18 6 6 18'],
  'warning': ['M12 3.5 21.5 20H2.5z', 'M12 9.5v5', 'M11.9 17.4h.2'],

  // ── Sidebar panels ───────────────────────────────────────────
  'pen': ['M4.5 19.5l1-4L16.6 4.4a2 2 0 0 1 2.9 2.9L8.5 18.5z'],
  'comment': ['M3.5 4.5h17v11h-9L7 20v-4.5H3.5z'],
  'signature': ['M3.5 17c3-1 4-8 6-8s1 6 3 6 3-4 5-4', 'M3.5 20.5h17'],
  'pages': ['M3.5 4h7v7h-7z', 'M13.5 4h7v7h-7z', 'M3.5 13h7v7h-7z',
            'M13.5 13h7v7h-7z'],
  'search': ['M10.5 3.5a7 7 0 1 0 0 14 7 7 0 1 0 0-14', 'M15.6 15.6 20.5 20.5'],
  'outline': ['M4 6h3', 'M10 6h10', 'M7 12h3', 'M13 12h7', 'M4 18h3', 'M10 18h10'],
  'history': ['M12 4a8 8 0 1 0 8 8', 'M20 4v5h-5', 'M12 7.5V12l3.5 2'],
};

/**
 * A single-colour outline icon.
 *
 * The icon inherits the surrounding text colour, so a button styles itself and
 * the icon follows — there is no second place to keep an active or disabled
 * variant in step. `aria-hidden` is deliberate: an icon here is always paired
 * with a label or a `title` on its control, so announcing it again would read
 * the same thing twice.
 */
@Component({
  selector: 'app-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.width]="pixelSize()" [attr.height]="pixelSize()" viewBox="0 0 24 24"
         fill="none" stroke="currentColor" [attr.stroke-width]="strokeWidth()"
         stroke-linecap="round" stroke-linejoin="round"
         aria-hidden="true" focusable="false" class="block">
      @for (d of paths(); track d) {
        <path [attr.d]="d"></path>
      }
    </svg>
  `,
  styles: [':host { display: inline-flex; align-items: center; justify-content: center; }']
})
export class IconComponent {
  private readonly nameSignal = signal<IconName | null>(null);
  readonly pixelSize = signal(18);

  @Input({ required: true })
  set name(value: IconName) { this.nameSignal.set(value); }

  /** Edge length in pixels. The grid is 24, so 18 keeps a 3px optical margin. */
  @Input()
  set size(value: number) { this.pixelSize.set(value); }

  readonly paths = computed(() => {
    const name = this.nameSignal();
    return name ? ICON_PATHS[name] ?? [] : [];
  });

  /**
   * Stroke weight scaled against the 24-unit grid, so an icon drawn at 14px
   * has the same apparent weight as one drawn at 22px. Without this the small
   * sidebar icons look heavier than the toolbar's and the set stops reading as
   * one family.
   */
  readonly strokeWidth = computed(() => (1.7 * 24) / this.pixelSize());

  /** Names, for tests that assert every referenced icon exists. */
  static names(): IconName[] {
    return Object.keys(ICON_PATHS) as IconName[];
  }
}
