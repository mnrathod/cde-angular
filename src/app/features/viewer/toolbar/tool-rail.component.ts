import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ViewerStateService, MarkupTool } from '../../../../viewer-core/viewer-state.service';
import { MarkupEngineService } from '../../../../viewer-core/markup-engine.service';
import { IconComponent } from '../../../shared/components/icon.component';
import { TOOL_SECTIONS, Tool } from './tool-catalog';

/**
 * The vertical tool rail down the left edge of the viewer.
 *
 * A rail rather than a ribbon for the reason every drawing-review product
 * settles on one: a document is taller than it is wide relative to the screen,
 * so horizontal chrome is charged against the thing being read while vertical
 * chrome is nearly free. The previous tabbed ribbon spent two stacked rows —
 * roughly 70px of every page — and still had to hide two thirds of the tools
 * behind tabs. The rail gives that height back and shows all of them at once.
 */
@Component({
  selector: 'app-tool-rail',
  standalone: true,
  imports: [CommonModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!--
      min-h-0 is load-bearing. A flex item's default min-height is auto,
      which lets its content push it past the height of the row it sits in;
      the row clips with overflow-hidden, so the last tools in the rail were
      simply cut off the bottom of the window with no scrollbar to reach them
      — the same failure that once hid the left edge of the document.
    -->
    <nav aria-label="Markup tools"
         class="flex flex-col w-11 flex-shrink-0 min-h-0 overflow-y-auto overflow-x-hidden
                border-r border-gray-200 bg-white py-1">

      @for (section of sections; track section.name; let last = $last) {
        <div role="group" [attr.aria-label]="section.name"
             class="flex flex-col items-center gap-px px-1">
          @for (tool of section.tools; track tool.id) {
            <button type="button"
              (click)="selectTool(tool)"
              [disabled]="isDisabled(tool)"
              [title]="hintFor(tool)"
              [attr.aria-label]="tool.label"
              [attr.aria-pressed]="state.activeTool() === tool.id"
              class="w-9 h-7 flex-shrink-0 rounded-md flex items-center justify-center
                     transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
              [class]="state.activeTool() === tool.id
                ? 'bg-accent text-white'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'">
              <app-icon [name]="tool.icon" [size]="18" />
            </button>
          }
        </div>

        @if (!last) {
          <div class="mx-2.5 my-1 flex-shrink-0 border-t border-gray-200"></div>
        }
      }
    </nav>
  `
})
export class ToolRailComponent {
  readonly state = inject(ViewerStateService);
  private readonly engine = inject(MarkupEngineService);

  readonly sections = TOOL_SECTIONS;

  /**
   * Redaction and form fields rewrite PDF structure, so they have nothing to
   * act on in a DWG or an image.
   */
  isDisabled(tool: Tool): boolean {
    return !!tool.pdfOnly && !this.isPdf();
  }

  private isPdf(): boolean {
    return this.state.viewerData()?.type === 'pdf';
  }

  /**
   * Tooltip text: what the tool is, its shortcut, and — for tools built by
   * clicking a series of points — how to finish the shape. That last part
   * comes from the engine that implements the drawing, not from a list kept
   * here, because a list kept here is what previously left Area, Length and
   * Radius silently unexplained.
   */
  hintFor(tool: Tool): string {
    if (this.isDisabled(tool)) {
      return `${tool.label} is only available for PDF documents`;
    }

    const base = `${tool.label} (${tool.key})`;
    const completion = this.engine.completionHint(tool.id);
    return completion ? `${base} — ${completion}` : base;
  }

  selectTool(tool: Tool) {
    if (this.isDisabled(tool)) return;
    this.setTool(tool.id);
  }

  /** Also used by the keyboard map in the command bar. */
  setTool(id: MarkupTool) {
    this.state.activeTool.set(id);
  }
}
