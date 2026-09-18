/**
 * The frame every modal in the application sits in.
 *
 * <p>There were three of these written out longhand — the project dialog, the
 * delete confirmation and the upload dialog — and all three were a `div` with
 * a dark backdrop and nothing else. To a screen reader that is not a dialog:
 * nothing announces that a dialog opened, nothing names it, the page behind it
 * is still reachable by tab, and Escape does not close it. Three copies of the
 * same gap is the rule-of-three threshold, so the frame became one component
 * and the gap was fixed once.
 *
 * <p>What this adds over the markup it replaces: `role="dialog"` with
 * `aria-modal`, a name taken from the visible heading, focus moved into the
 * dialog on open and **put back where it came from on close** — otherwise
 * focus falls to the top of the document and a keyboard user has to tab all
 * the way back to where they were — Escape to dismiss, and a backdrop click
 * that does the same.
 */
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  OnInit,
  inject,
  input,
  output,
} from "@angular/core";

import { FocusTrapDirective } from "../directives/accessibility.directives";

/** Distinguishes one open dialog's heading from another's in the same page. */
let dialogSequence = 0;

@Component({
  selector: "app-modal-dialog",
  standalone: true,
  imports: [FocusTrapDirective],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <!-- The backdrop is not focusable and carries no role: it exists to dim
         the page and to catch a click outside. Keyboard users get Escape,
         which is the equivalent and is handled on the dialog itself. -->
    <div
      class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center"
      (click)="onBackdropClick($event)"
    >
      <div
        focusTrap
        role="dialog"
        aria-modal="true"
        [attr.aria-labelledby]="headingId"
        (keydown.escape)="dismissed.emit()"
        class="bg-white rounded-lg shadow-2xl p-7 w-96 max-w-[calc(100vw-2rem)]"
      >
        <h3 [id]="headingId" class="font-semibold text-gray-800 mb-5">
          {{ heading() }}
        </h3>
        <ng-content />
        <!-- Below the content and above the buttons, the same place in every
             dialog (SC 3.3.2), and role="alert" so it is announced rather
             than only appearing. -->
        @if (error()) {
          <div
            role="alert"
            class="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2 mb-3"
          >
            {{ error() }}
          </div>
        }
        <div class="flex gap-2 justify-end">
          <button
            type="button"
            (click)="dismissed.emit()"
            class="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
          >
            {{ cancelLabel }}
          </button>
          @if (confirmLabel()) {
            <button
              type="button"
              (click)="confirmed.emit()"
              [disabled]="confirmDisabled()"
              [class]="confirmClasses()"
            >
              {{ confirmLabel() }}
            </button>
          }
        </div>
      </div>
    </div>
  `,
})
export class ModalDialogComponent implements OnInit, OnDestroy {
  /** The dialog's visible heading, which also becomes its accessible name. */
  heading = input.required<string>();
  /**
   * What went wrong, if anything. Empty renders nothing — a dialog that
   * reserves space for an error it has not got shifts its buttons when one
   * arrives.
   */
  error = input("");
  /**
   * What the button that does the thing says — "Create", "Delete", "Upload".
   *
   * <p>Left empty by a dialog with no such button: a picker is confirmed by
   * choosing something from it, and an extra button beside the list would
   * have nothing to do.
   */
  confirmLabel = input("");
  /** Held while the request it starts is in flight. */
  confirmDisabled = input(false);
  /** Colours the confirm button as a destructive action rather than a normal one. */
  destructive = input(false);

  /** Escape, a click on the backdrop, or Cancel. All mean "not this". */
  dismissed = output<void>();
  /** The confirm button. */
  confirmed = output<void>();

  /**
   * One message for all three dialogs, not one each.
   *
   * <p>It is the same word doing the same job — dismiss this dialog — and
   * three ids for it asks a translator to translate "Cancel" three times,
   * with three chances to land on three different words.
   */
  readonly cancelLabel = $localize`:Dismisses a dialog without doing what it asked about@@dialog.cancel:Cancel`;

  confirmClasses = computed(
    () =>
      "px-4 py-2 text-sm text-white rounded disabled:opacity-50 font-semibold " +
      (this.destructive()
        ? "bg-red-600 hover:bg-red-700"
        : "bg-accent hover:bg-blue-700"),
  );

  readonly headingId = `modal-heading-${(dialogSequence += 1)}`;

  private host = inject(ElementRef<HTMLElement>);
  private returnFocusTo: HTMLElement | null = null;

  ngOnInit(): void {
    const active = this.host.nativeElement.ownerDocument?.activeElement;
    this.returnFocusTo = active instanceof HTMLElement ? active : null;
  }

  ngOnDestroy(): void {
    // Still in the document: an element removed while the dialog was open
    // cannot take focus, and calling focus() on it silently does nothing,
    // leaving focus on <body>.
    if (this.returnFocusTo?.isConnected) this.returnFocusTo.focus();
  }

  onBackdropClick(event: MouseEvent): void {
    // Only the backdrop itself. A click that started inside the dialog and
    // ended on the backdrop — a drag across a text selection — must not
    // close it and throw away what was typed.
    if (event.target === event.currentTarget) this.dismissed.emit();
  }
}
