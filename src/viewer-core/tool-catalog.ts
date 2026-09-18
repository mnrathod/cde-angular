import { MarkupTool } from './viewer-state.service';
import { IconName } from './icon.component';

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

/**
 * A captioned run of related tools, drawn as one block in the rail.
 *
 * <p>The labels below use `$localize` rather than plain strings: they are in
 * a lookup table, so the template markup guard cannot see them, and they are
 * every tool's accessible name as well as its tooltip. Several are terms of
 * art on a drawing — a revision cloud is a specific convention, not any cloud
 * — which is why each carries a description rather than only a string.
 */
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
    name: $localize`:Groups the tools for moving around the document rather than marking it up@@toolSection.navigate:Navigate`,
    tools: [
      { id: 'pan',       icon: 'pan',        label: $localize`:Markup tool that moves the page rather than drawing@@markupTool.pan:Pan`,        key: 'V' },
      { id: 'select',    icon: 'select',     label: $localize`:Markup tool that picks existing markup to move or edit@@markupTool.select:Select`,     key: 'S' },
    ],
  },
  {
    name: $localize`:Groups the shape-drawing tools@@toolSection.draw:Draw`,
    tools: [
      { id: 'line',      icon: 'line',       label: $localize`:Markup tool that draws a straight line@@markupTool.line:Line`,       key: 'L' },
      { id: 'arrow',     icon: 'arrow',      label: $localize`:Markup tool that draws an arrow@@markupTool.arrow:Arrow`,      key: 'A' },
      { id: 'rect',      icon: 'rect',       label: $localize`:Markup tool that draws a rectangle@@markupTool.rect:Rectangle`,  key: 'R' },
      { id: 'circle',    icon: 'circle',     label: $localize`:Markup tool that draws a circle@@markupTool.circle:Circle`,     key: 'C' },
      { id: 'ellipse',   icon: 'ellipse',    label: $localize`:Markup tool that draws an ellipse@@markupTool.ellipse:Ellipse`,    key: 'E' },
      { id: 'polygon',   icon: 'polygon',    label: $localize`:Markup tool that draws a closed many-sided shape@@markupTool.polygon:Polygon`,    key: 'G' },
      { id: 'polyline',  icon: 'polyline',   label: $localize`:Markup tool that draws a chain of connected line segments@@markupTool.polyline:Polyline`,   key: 'Y' },
      { id: 'freehand',  icon: 'freehand',   label: $localize`:Markup tool that draws freely, as with a pen@@markupTool.freehand:Freehand`,   key: 'F' },
      { id: 'cloud',     icon: 'cloud',      label: $localize`:Markup tool that draws the scalloped outline used on drawings to ring a change@@markupTool.cloud:Revision cloud`, key: 'K' },
    ],
  },
  {
    name: $localize`:Groups the tools that add text and notes@@toolSection.notes:Notes`,
    tools: [
      { id: 'text',      icon: 'text',       label: $localize`:Markup tool that places a block of text on the page@@markupTool.text:Text`,       key: 'T' },
      { id: 'callout',   icon: 'callout',    label: $localize`:Markup tool that places text with a leader line pointing at something@@markupTool.callout:Callout`,    key: 'O' },
      { id: 'note',      icon: 'note',       label: $localize`:Markup tool that places a collapsed note, opened by clicking it@@markupTool.note:Sticky note`, key: 'N' },
      { id: 'stamp',     icon: 'stamp',      label: $localize`:Markup tool that places a pre-set mark such as APPROVED@@markupTool.stamp:Stamp`,      key: 'P' },
    ],
  },
  {
    name: $localize`:Groups the tools that mark existing text in the document@@toolSection.textmarkup:Text markup`,
    tools: [
      { id: 'highlight', icon: 'highlight',  label: $localize`:Text markup tool that colours behind selected text@@markupTool.highlight:Highlight`,  key: 'H' },
      { id: 'underline', icon: 'underline',  label: $localize`:Text markup tool that rules a line under selected text@@markupTool.underline:Underline`,  key: 'U' },
      { id: 'strikeout', icon: 'strikeout',  label: $localize`:Text markup tool that rules a line through selected text@@markupTool.strikeout:Strikeout`,  key: 'D' },
      // 'W' for wavy: 'Q' belongs to Area, and that collision made Area
      // unreachable from the keyboard entirely.
      { id: 'squiggly',  icon: 'squiggly',   label: $localize`:Text markup tool that draws a wavy line under selected text@@markupTool.squiggly:Squiggly`,   key: 'W' },
    ],
  },
  {
    name: $localize`:Groups the distance and area tools@@toolSection.measure:Measure`,
    tools: [
      { id: 'calibrate', icon: 'calibrate',  label: $localize`:Measurement tool that establishes what one pixel is worth in real units@@markupTool.calibrate:Set scale`,  key: 'Z' },
      { id: 'dimension', icon: 'length',     label: $localize`:Measurement tool for distance between two points@@markupTool.dimension:Length`,     key: 'M' },
      { id: 'area',      icon: 'area',       label: $localize`:Measurement tool for the area enclosed by a shape@@markupTool.area:Area`,       key: 'Q' },
      // 'I' because 'E' is Ellipse, which shadowed Radius entirely.
      { id: 'radius',    icon: 'radius',     label: $localize`:Measurement tool for the radius of a curve@@markupTool.radius:Radius`,     key: 'I' },
    ],
  },
  {
    name: $localize`:Groups the tools that change the document itself rather than annotate it@@toolSection.document:Document`,
    tools: [
      { id: 'redact',    icon: 'redact',     label: $localize`:Tool that marks content for permanent destruction@@markupTool.redact:Redact`,     key: 'X', pdfOnly: true },
      { id: 'formfield', icon: 'form-field', label: $localize`:Tool that draws a fillable field onto a PDF@@markupTool.formfield:Form field`, key: 'B', pdfOnly: true },
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
