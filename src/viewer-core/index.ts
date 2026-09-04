/**
 * The viewer's server-independent core.
 *
 * <p>Everything here renders, measures, searches and tracks state without
 * knowing a backend exists — verified by `viewer-core.boundary.spec.ts`,
 * which fails if anything in this directory imports from the application.
 *
 * <p>It sits outside `src/app` deliberately. ADR 12 ships the viewer as its
 * own product, and this is the part that already has no dependency to sever:
 * when the new repository exists, this directory is copied rather than
 * untangled. Until then it stays here and the application consumes it like
 * any other library, which is the arrangement that keeps it honest — an
 * import that should not exist breaks the build on the day it is written,
 * not on the day of the move.
 */

export * from './models';
export * from './viewer-state.service';
export * from './markup-engine.service';
export * from './measurement.service';
export * from './outline.service';
export * from './drawing-search.service';
export * from './pdf-engine.service';
