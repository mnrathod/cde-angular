import { MarkupTool } from '../../../../viewer-core/viewer-state.service';
import { IconName } from '../../../shared/components/icon.component';

/** One selectable tool in the rail. */
export interface Tool {
  id: MarkupTool;
  icon: IconName;
  label: string;
  /** Single-key shortcut. Unique across the whole catalog — see the spec. */
  key: string;
  /** True for tools that need a PDF rather than a drawing or an image. */
  pdfOnly?: boolean;
}

/** A captioned run of related tools, drawn as one block in the rail. */
export interface ToolSection {
  name: string;
  tools: ReadonlyArray<Tool>;
}

/**
 * Every markup tool, grouped the way a reviewer thinks about them.
 *
 * This is the single source of truth for the rail, the keyboard map and the
 * tests. It used to be split across ribbon tabs, which put the measurement
 * family on a tab of its own and stranded Calibrate beside OCR — so Area and
 * Radius read as missing features when they were simply one click out of
 * sight. A tool is now never more than a glance away, and the section it
 * belongs to is stated rather than implied by position.
 */
export const TOOL_SECTIONS: ReadonlyArray<ToolSection> = [
  {
    name: 'Navigate',
    tools: [
      { id: 'pan',       icon: 'pan',        label: 'Pan',        key: 'V' },
      { id: 'select',    icon: 'select',     label: 'Select',     key: 'S' },
    ],
  },
  {
    name: 'Draw',
    tools: [
      { id: 'line',      icon: 'line',       label: 'Line',       key: 'L' },
      { id: 'arrow',     icon: 'arrow',      label: 'Arrow',      key: 'A' },
      { id: 'rect',      icon: 'rect',       label: 'Rectangle',  key: 'R' },
      { id: 'circle',    icon: 'circle',     label: 'Circle',     key: 'C' },
      { id: 'ellipse',   icon: 'ellipse',    label: 'Ellipse',    key: 'E' },
      { id: 'polygon',   icon: 'polygon',    label: 'Polygon',    key: 'G' },
      { id: 'polyline',  icon: 'polyline',   label: 'Polyline',   key: 'Y' },
      { id: 'freehand',  icon: 'freehand',   label: 'Freehand',   key: 'F' },
      { id: 'cloud',     icon: 'cloud',      label: 'Revision cloud', key: 'K' },
    ],
  },
  {
    name: 'Notes',
    tools: [
      { id: 'text',      icon: 'text',       label: 'Text',       key: 'T' },
      { id: 'callout',   icon: 'callout',    label: 'Callout',    key: 'O' },
      { id: 'note',      icon: 'note',       label: 'Sticky note', key: 'N' },
      { id: 'stamp',     icon: 'stamp',      label: 'Stamp',      key: 'P' },
    ],
  },
  {
    name: 'Text markup',
    tools: [
      { id: 'highlight', icon: 'highlight',  label: 'Highlight',  key: 'H' },
      { id: 'underline', icon: 'underline',  label: 'Underline',  key: 'U' },
      { id: 'strikeout', icon: 'strikeout',  label: 'Strikeout',  key: 'D' },
      // 'W' for wavy: 'Q' belongs to Area, and that collision made Area
      // unreachable from the keyboard entirely.
      { id: 'squiggly',  icon: 'squiggly',   label: 'Squiggly',   key: 'W' },
    ],
  },
  {
    name: 'Measure',
    tools: [
      { id: 'calibrate', icon: 'calibrate',  label: 'Set scale',  key: 'Z' },
      { id: 'dimension', icon: 'length',     label: 'Length',     key: 'M' },
      { id: 'area',      icon: 'area',       label: 'Area',       key: 'Q' },
      // 'I' because 'E' is Ellipse, which shadowed Radius entirely.
      { id: 'radius',    icon: 'radius',     label: 'Radius',     key: 'I' },
    ],
  },
  {
    name: 'Document',
    tools: [
      { id: 'redact',    icon: 'redact',     label: 'Redact',     key: 'X', pdfOnly: true },
      { id: 'formfield', icon: 'form-field', label: 'Form field', key: 'B', pdfOnly: true },
    ],
  },
];

/** Every tool across every section, in rail order. */
export function allTools(): Tool[] {
  return TOOL_SECTIONS.flatMap(section => [...section.tools]);
}

/** The tool a single-key shortcut selects, or undefined. */
export function toolForKey(key: string): Tool | undefined {
  const wanted = key.toLowerCase();
  return allTools().find(tool => tool.key.toLowerCase() === wanted);
}

/** Tools whose readout depends on the drawing having a scale. */
export const MEASUREMENT_TOOLS: ReadonlyArray<MarkupTool> =
  ['dimension', 'area', 'radius'];

/** True when the tool draws with a stroke colour and width the user picks. */
export function usesStrokeStyle(tool: MarkupTool): boolean {
  return tool !== 'pan' && tool !== 'select' && tool !== 'redact'
      && tool !== 'formfield';
}
