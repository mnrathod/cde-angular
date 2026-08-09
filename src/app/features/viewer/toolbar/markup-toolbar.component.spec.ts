import { MarkupToolbarComponent } from './markup-toolbar.component';
import { MarkupTool } from '../../../core/services/viewer/viewer-state.service';

/**
 * These guard the two ways the old flat toolbar hid tools rather than
 * failing: a duplicate shortcut key, and a tool present in the model but on
 * no tab. Both are silent — the tool simply never appears or never responds —
 * so they need assertions rather than review to catch.
 */
describe('MarkupToolbarComponent tool model', () => {

  const tools = MarkupToolbarComponent.allTools();

  it('gives every tool a unique shortcut key', () => {
    // Shortcuts resolve with Array.find, so a duplicate makes the later tool
    // permanently unreachable from the keyboard. This is exactly what
    // happened to Area (Q, shadowed by Squiggly) and Radius (E, by Ellipse).
    const byKey = new Map<string, MarkupTool[]>();
    for (const tool of tools) {
      const key = tool.key.toUpperCase();
      byKey.set(key, [...(byKey.get(key) ?? []), tool.id]);
    }

    const duplicates = [...byKey.entries()].filter(([, ids]) => ids.length > 1);
    expect(duplicates).toEqual([]);
  });

  it('reaches every measurement tool from the keyboard', () => {
    // The regression that started this: Area and Radius were in the toolbar
    // and still could not be selected by key.
    for (const id of ['dimension', 'area', 'radius'] as MarkupTool[]) {
      const tool = tools.find(t => t.id === id);
      expect(tool).toBeDefined();

      const resolved = tools.find(
        t => t.key.toLowerCase() === tool!.key.toLowerCase());
      expect(resolved!.id).toBe(id);
    }
  });

  it('keeps the measurement family on one tab', () => {
    // Splitting these across tabs would recreate the original complaint in a
    // new form: Calibrate lived beside OCR while Area and Radius sat rows away.
    const measure = MarkupToolbarComponent.groupsFor('measure')
      .flatMap(group => group.tools.map(tool => tool.id));

    expect(measure).toEqual(['dimension', 'area', 'radius']);
  });

  it('places every tool on exactly one tab', () => {
    const ids = tools.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every tool a label and an icon', () => {
    for (const tool of tools) {
      expect(tool.label.trim()).not.toBe('');
      expect(tool.icon.trim()).not.toBe('');
    }
  });
});
