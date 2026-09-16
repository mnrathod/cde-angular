/**
 * A glyph per IFC element type.
 *
 * <p>Decoration only. Every place one of these is rendered marks it
 * `aria-hidden`, because the type is already stated in text beside it and a
 * screen reader announcing "brick" adds nothing a reader can act on.
 *
 * <p>Its own module because the tree and the properties panel both draw them
 * and neither should own the table on the other's behalf.
 */

const IFC_ICONS: Readonly<Record<string, string>> = {
  IfcProject:           '🏢',
  IfcSite:              '🌍',
  IfcBuilding:          '🏛',
  IfcBuildingStorey:    '🏢',
  IfcWall:              '🧱',
  IfcWallStandardCase:  '🧱',
  IfcSlab:              '⬜',
  IfcRoof:              '🏠',
  IfcColumn:            '🏛',
  IfcBeam:              '━',
  IfcDoor:              '🚪',
  IfcWindow:            '🪟',
  IfcStair:             '🪜',
  IfcFurnishingElement: '🪑',
  IfcSpace:             '📐',
  IfcFlowTerminal:      '💡',
  IfcFlowSegment:       '〰',
  DEFAULT:              '🔷',
};

/**
 * The glyph for a type, or a neutral one for a type not in the table.
 *
 * <p>The fallback needs its own fallback: an index into a record is optional
 * under `noUncheckedIndexedAccess` even for a key the literal defines, and an
 * icon is decoration — an empty string beats an `undefined` reaching a
 * template.
 */
export function iconForType(type: string): string {
  return IFC_ICONS[type] ?? IFC_ICONS['DEFAULT'] ?? '';
}
