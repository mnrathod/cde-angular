import { MarkupTool } from './viewer-state.service';
import { IconComponent } from './icon.component';
import {
  TOOL_SECTIONS, allTools, toolForKey, MEASUREMENT_TOOLS, usesStrokeStyle
} from './tool-catalog';

/**
 * The catalog fails silently when it is wrong: a duplicate shortcut makes the
 * later tool unreachable, a missing icon draws an empty button, and a tool
 * left out of every section simply never appears. None of those throw, so
 * each one needs an assertion rather than a review.
 */
describe('tool catalog', () => {

  const tools = allTools();

  it('gives every tool a unique shortcut key', () => {
    // Shortcuts resolve by first match, so a duplicate makes the later tool
    // permanently unreachable from the keyboard. Exactly what happened to
    // Area (Q, shadowed by Squiggly) and Radius (E, by Ellipse).
    const byKey = new Map<string, MarkupTool[]>();
    for (const tool of tools) {
      const key = tool.key.toUpperCase();
      byKey.set(key, [...(byKey.get(key) ?? []), tool.id]);
    }

    const duplicates = [...byKey.entries()].filter(([, ids]) => ids.length > 1);
    expect(duplicates).toEqual([]);
  });

  it('resolves every tool from its own shortcut key', () => {
    for (const tool of tools) {
      expect(toolForKey(tool.key)?.id).toBe(tool.id);
      // Shortcuts are typed in whatever case the keyboard is in.
      expect(toolForKey(tool.key.toLowerCase())?.id).toBe(tool.id);
    }
  });

  it('lists every tool exactly once', () => {
    const ids = tools.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps the measurement family together and complete', () => {
    // Splitting these apart is what made Area and Radius read as missing:
    // they were present, but on a tab away from Calibrate.
    const measure = TOOL_SECTIONS.find(section => section.name === 'Measure');
    expect(measure).toBeDefined();

    const ids = measure!.tools.map(tool => tool.id);
    expect(ids).toEqual(['calibrate', 'dimension', 'area', 'radius']);
    for (const tool of MEASUREMENT_TOOLS) {
      expect(ids).toContain(tool);
    }
  });

  it('names an icon that actually exists for every tool', () => {
    // A name with no paths behind it renders an empty 18px box rather than
    // failing, so the button looks disabled instead of broken.
    const available = new Set(IconComponent.names());
    const missing = tools.filter(tool => !available.has(tool.icon));
    expect(missing.map(tool => `${tool.id}:${tool.icon}`)).toEqual([]);
  });

  it('gives every tool a label and a section', () => {
    for (const section of TOOL_SECTIONS) {
      expect(section.name.trim()).not.toBe('');
      expect(section.tools.length).toBeGreaterThan(0);
      for (const tool of section.tools) {
        expect(tool.label.trim()).not.toBe('');
      }
    }
  });

  it('offers stroke options only for tools that draw a stroke', () => {
    // The context bar shows colour and width from this predicate. Getting it
    // wrong offers a colour picker for Pan, or hides it for a tool that
    // genuinely draws.
    for (const tool of ['pan', 'select', 'redact', 'formfield'] as MarkupTool[]) {
      expect(usesStrokeStyle(tool)).toBe(false);
    }
    for (const tool of ['line', 'cloud', 'text', 'area', 'highlight'] as MarkupTool[]) {
      expect(usesStrokeStyle(tool)).toBe(true);
    }
  });

  it('marks as PDF-only exactly the tools that rewrite PDF structure', () => {
    const pdfOnly = tools.filter(tool => tool.pdfOnly).map(tool => tool.id);
    expect(pdfOnly).toEqual(['redact', 'formfield']);
  });
});
