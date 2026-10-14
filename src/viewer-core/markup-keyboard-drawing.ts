/**
 * Drawing a markup shape without a pointer: a cursor, and the keys that move
 * and press it.
 *
 * <p>§1A.2 wants every interaction available from the keyboard, and SC 2.5.7
 * wants a single-pointer alternative to every drag. Drawing had neither: no
 * shape could be created at all without a pointer, which made the whole markup
 * layer unusable for a reader who does not use one.
 *
 * <p>**This does not re-implement the gesture.** It holds one thing — where the
 * cursor is — and hands every action to the same press/move/release state
 * machine the pointer drives, through {@link KeyboardDrawingTarget}. A second
 * copy of the gesture for the keyboard is how the two come to disagree about
 * which tools work, which is the mistake `markup-drawing-session.ts` was
 * written to undo between the PDF page and the CAD drawing. One-way: this knows
 * about the session, the session does not know about the keys.
 *
 * <p>It lives in its own file because the session had grown past §3.3's
 * 400-line limit and this was the seam — a cohesive piece with a narrow
 * contract, rather than an abstraction invented for a single caller.
 */
import { MarkupEngineService, PointerPoint } from './markup-engine.service';
import { signal } from '@angular/core';

/**
 * What the keys need from the drawing session.
 *
 * <p>Narrow on purpose: everything here already existed for the pointer, so
 * the keyboard route adds no behaviour of its own that could drift.
 */
export interface KeyboardDrawingTarget {
  /** The overlay to aim at, or null when nothing here accepts a shape. */
  drawingOverlay(): SVGSVGElement | null;
  /** A press at a point — what a pointer going down does. */
  pressAt(point: PointerPoint): void;
  /** The point moving mid-gesture — what dragging does. */
  moveTo(point: PointerPoint): void;
  /** Whether a shape is half-drawn right now. */
  hasShapeInProgress(): boolean;
  /** Commit the half-drawn shape, by whichever route its tool finishes. */
  finishShape(): void;
  /** Throw the half-drawn shape away. */
  cancel(): void;
}

export class MarkupKeyboardDrawing {
  /**
   * Where the cursor is, or null when the keyboard is not drawing.
   *
   * <p>A signal because the surface draws it: a cursor the reader cannot see is
   * a cursor they cannot aim, and §1A.2 wants the keyboard route to be usable
   * rather than merely present.
   */
  readonly cursor = signal<PointerPoint | null>(null);

  constructor(
    private readonly markup: MarkupEngineService,
    private readonly target: KeyboardDrawingTarget,
  ) {}

  /**
   * Show the cursor, so arrow keys have something to move.
   *
   * <p>Returns whether it was shown, so a surface can leave the key alone when
   * drawing is not available — a tool like pan or select accepts no shapes, and
   * swallowing the key there would break scrolling.
   */
  show(): boolean {
    const overlay = this.target.drawingOverlay();
    if (!overlay) return false;
    if (this.cursor() === null) this.cursor.set(this.markup.centreOf(overlay));
    return true;
  }

  /**
   * Move the cursor by one step, and carry a half-drawn shape with it.
   *
   * <p>The second part is what makes this a drag alternative rather than just a
   * way to place a point: while a shape is being sized, moving the cursor is
   * the same event as moving the pointer.
   */
  move(dx: number, dy: number, coarse = false): boolean {
    if (!this.show()) return false;
    const step = this.markup.keyboardStep(coarse);
    const from = this.cursor()!;
    const to = { x: from.x + dx * step, y: from.y + dy * step };
    this.cursor.set(to);
    this.target.moveTo(to);
    return true;
  }

  /**
   * Press at the cursor — the keyboard's equivalent of a pointer going down.
   *
   * <p>For a dragged tool this starts the shape; the next arrow keys size it
   * and Enter commits it. For a click-placed tool it places it outright. For a
   * vertex tool it drops a vertex, which is what a click does.
   */
  press(): boolean {
    if (!this.show()) return false;
    this.target.pressAt(this.cursor()!);
    return true;
  }

  /** Put the cursor away, without touching a shape in progress. */
  hide(): void {
    this.cursor.set(null);
  }

  /**
   * Interpret a key pressed on a surface, and say whether it was used.
   *
   * <p>The caller suppresses the browser's own handling only when this returns
   * true, so arrow keys still scroll a page nobody is drawing on.
   *
   * <p>Space presses and Enter confirms, which is the convention everywhere
   * else (§1.3): Space activates the thing under the cursor, Enter commits the
   * thing in progress. Shift takes the coarse step.
   */
  handleKey(event: KeyboardEvent): boolean {
    switch (event.key) {
      case 'ArrowLeft':
        return this.move(-1, 0, event.shiftKey);
      case 'ArrowRight':
        return this.move(1, 0, event.shiftKey);
      case 'ArrowUp':
        return this.move(0, -1, event.shiftKey);
      case 'ArrowDown':
        return this.move(0, 1, event.shiftKey);
      case ' ':
        return this.press();
      case 'Enter': {
        if (!this.target.hasShapeInProgress()) return false;
        this.target.finishShape();
        return true;
      }
      case 'Escape': {
        if (this.target.hasShapeInProgress()) {
          this.target.cancel();
          return true;
        }
        if (this.cursor() !== null) {
          this.hide();
          return true;
        }
        return false;
      }
      default:
        return false;
    }
  }
}
