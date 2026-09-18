/**
 * How the shell turns stored values into words a person reads.
 *
 * <p>Project phases and document statuses arrive from the server as
 * `IN_REVIEW` and `CONSTRUCTION`. The shell used to render them by swapping
 * the underscore for a space — legible in English, meaningless anywhere else —
 * and they are now looked up in a table of translated messages.
 *
 * <p>The behaviour worth guarding is the fallback. The server can add a phase
 * or a status before this table knows about it, and the two possible failures
 * are very different: showing `HANDOVER` is untidy, showing an empty chip
 * looks like missing data.
 */
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { ShellComponent } from './shell.component';

describe('ShellComponent labels', () => {
  let shell: ShellComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    shell = TestBed.createComponent(ShellComponent).componentInstance;
  });

  it('gives every phase it knows a word rather than a stored value', () => {
    expect(shell.phaseLabel('CONSTRUCTION')).toBe('Construction');
    expect(shell.phaseLabel('HANDOVER')).toBe('Handover');
  });

  it('gives every status it knows a word rather than a stored value', () => {
    // The one that matters most: IN_REVIEW rendered by replacing the
    // underscore reads "IN REVIEW", which is not a sentence in any language.
    expect(shell.statusLabel('IN_REVIEW')).toBe('In review');
    expect(shell.statusLabel('SUPERSEDED')).toBe('Superseded');
  });

  it('shows an unrecognised phase rather than nothing', () => {
    // The server may add one before this table does. An untidy chip beats an
    // empty one, which reads as missing data.
    expect(shell.phaseLabel('DECOMMISSIONING')).toBe('DECOMMISSIONING');
  });

  it('shows an unrecognised status rather than nothing', () => {
    expect(shell.statusLabel('WITHDRAWN')).toBe('WITHDRAWN');
  });

  it('asks about the right thing when deleting', () => {
    // Two whole messages rather than "Delete {kind}?" with an English noun
    // dropped into the gap — gender and article agreement do not survive
    // that, and the translator never sees the word that lands there.
    expect(shell.deleteTitle('project')).toContain('project');
    expect(shell.deleteTitle('document')).toContain('document');
    expect(shell.deleteTitle('project')).not.toBe(shell.deleteTitle('document'));
  });
});
