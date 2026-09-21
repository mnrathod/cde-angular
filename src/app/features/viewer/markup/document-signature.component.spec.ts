/**
 * The stamp a signer is shown after signing.
 *
 * <p>This panel confirmed a signature by binding the server's SVG through
 * `[innerHTML]`. Angular's HTML sanitiser has no `<svg>` in its element
 * allow-list, so it dropped every element of the stamp and kept only their
 * text nodes, concatenated with nothing between them. What a signer actually
 * saw was a single unstyled line reading
 * `DIGITALLY SIGNEDSigned by: A. SurveyorRole: …`, with the raw ISO timestamp
 * and no border, no layout and no spacing. Not an error — just wrong, quietly,
 * on every signing.
 *
 * <p>That shape of failure is what the assertions here are built around, and
 * getting them right took two corrections. An early draft tested only that the
 * signer's name appeared somewhere in `textContent`; reintroducing the old
 * binding passed it, because the name does survive sanitisation. The draft
 * after that asserted on the formatted date but against the whole component,
 * so the signatures list below satisfied it instead of the stamp. Both are
 * fixed here: every assertion is scoped to the stamp region by its accessible
 * name, and the load-bearing one is that each field is its own labelled
 * element — structure the stripped SVG cannot produce.
 */
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { describe, beforeEach, afterEach, expect, it } from 'vitest';

import { DocumentSignatureComponent } from './document-signature.component';
import { SignatureRecord, SignResult } from '../../../core/services/signature.service';
import { ViewerStateService } from '../../../../viewer-core/viewer-state.service';

const SIGNATURE: SignatureRecord = {
  id: 7,
  signatureId: 'ab12cd34-5678-90ef-ghij-klmnopqrstuv',
  signerName: 'A. Surveyor',
  signerEmail: 'surveyor@example.invalid',
  role: 'Approver',
  reason: 'Approved for construction',
  status: 'VALID',
  signedAt: '2026-03-04T09:30:00Z',
  version: 3,
};

/** The stamp the server draws into the document, in the shape it sends it. */
const STAMP_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="70">' +
  '<text x="8" y="18">DIGITALLY SIGNED</text>' +
  '<text x="8" y="34">Signed by: A. Surveyor</text>' +
  '<text x="8" y="56">Date: 2026-03-04 09:30:00</text>' +
  '<text x="8" y="67">Ref: AB12CD34</text></svg>';

describe('the stamp shown after signing', () => {
  let fixture: ComponentFixture<DocumentSignatureComponent>;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DocumentSignatureComponent],
      // ViewerStateService is deliberately not root-provided — it is scoped
      // per viewer instance — so the panel's host normally supplies it and a
      // test has to stand in for that host.
      providers: [provideHttpClient(), provideHttpClientTesting(), ViewerStateService],
    });
    fixture = TestBed.createComponent(DocumentSignatureComponent);
    fixture.componentRef.setInput('documentId', 42);
    httpMock = TestBed.inject(HttpTestingController);

    fixture.detectChanges();
    httpMock.expectOne('/api/signatures/document/42').flush([]);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  /** Sign, and settle the signature reload that follows it. */
  function signAndRespond(reply: Partial<SignResult> = {}) {
    fixture.componentInstance.signReq = { role: 'Approver', reason: 'Approved for construction' };
    fixture.componentInstance.signDocument();

    httpMock.expectOne('/api/signatures/document/42/sign').flush({
      signature: SIGNATURE,
      stampSvg: STAMP_SVG,
      version: 3,
      embedded: true,
      documentStatus: 'APPROVED',
      ...reply,
    });
    httpMock.expectOne('/api/signatures/document/42').flush([SIGNATURE]);
    fixture.detectChanges();
  }

  /**
   * The stamp region, by its accessible name.
   *
   * <p>Scoped deliberately. Asserting against the whole component let the
   * signatures list below satisfy assertions meant for the stamp — the date
   * check passed under a deliberately reintroduced bug because the list
   * renders the same date. A test that can be satisfied by the wrong element
   * is not testing the right one.
   */
  function stamp(): HTMLElement | null {
    return fixture.nativeElement.querySelector('[aria-label="Signature just applied"]');
  }

  /** The stamp's field labels, each as its own element. */
  function fieldLabels(): string[] {
    return [...(stamp()?.querySelectorAll('dt') ?? [])]
      .map((term) => (term as HTMLElement).textContent?.trim() ?? '');
  }

  it('labels each field separately, rather than running them together', () => {
    // The assertion the old binding fails. Sanitised SVG yields one text run
    // with no element boundaries, so there are no terms to find.
    signAndRespond();

    expect(fieldLabels()).toEqual(['Signed by:', 'Role:', 'Date:', 'Ref:']);
  });

  it('names the signer', () => {
    signAndRespond();

    expect(stamp()?.textContent).toContain('A. Surveyor');
  });

  it('gives the role and the reason it was signed for', () => {
    signAndRespond();
    expect(stamp()?.textContent).toContain('Approver');
    expect(stamp()?.textContent).toContain('Approved for construction');
  });

  it('shows the date in the reader\'s locale, not as a raw timestamp', () => {
    // The server's SVG carries "2026-03-04 09:30:00". Formatting it here is
    // both better reading and a second thing the stripped SVG cannot fake.
    //
    // "4 Mar 2026" is the en-AU rendering, which is what the source locale
    // declares (angular.json `i18n.sourceLocale`). It read "Mar 4, 2026"
    // until translations were introduced, because an application with no
    // declared locale falls back to en-US — so this literal moving is the
    // locale being honoured rather than a regression.
    signAndRespond();
    expect(stamp()?.textContent).toContain('4 Mar 2026');
    expect(stamp()?.textContent).toContain('Ref:');
    expect(stamp()?.textContent).not.toContain('2026-03-04 09:30:00');
  });

  it('carries the same short reference the document is stamped with', () => {
    // Eight characters, upper-cased, matching what the server draws. Someone
    // ringing up about a signature has to be able to quote one and be
    // understood about the other.
    signAndRespond();

    expect(stamp()?.textContent).toContain('AB12CD34');
  });

  it('shows nothing before anything has been signed', () => {
    expect(stamp()).toBeNull();
    expect(fieldLabels()).toEqual([]);
  });

  it('renders the stamp as text, not as an image of text', () => {
    // §1A.4. An <svg> or <img> here would be unreadable to a screen reader
    // and unselectable by anyone wanting to copy the reference.
    signAndRespond();

    expect(stamp()!.querySelector('svg')).toBeNull();
    expect(stamp()!.querySelector('img')).toBeNull();
  });
});

/**
 * What the panel says when a request fails.
 *
 * <p>All three of these swallowed their error: listing set `loading` false
 * and said nothing, so a document whose signatures could not be read looked
 * exactly like one that had none; signing re-enabled its button and said
 * nothing, which reads as "nothing happened" rather than "refused"; and the
 * verify result appeared without being announced. §1.4 asks for what
 * happened, why, and what to do next — none of which is silence.
 */
describe('a signing request that fails', () => {
  let fixture: ComponentFixture<DocumentSignatureComponent>;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DocumentSignatureComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), ViewerStateService],
    });
    fixture = TestBed.createComponent(DocumentSignatureComponent);
    fixture.componentRef.setInput('documentId', 42);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  /** Whatever the panel is currently announcing, if anything. */
  function announced(): string {
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    return host.querySelector('[role="status"]')?.textContent?.trim() ?? '';
  }

  function listingFails() {
    fixture.detectChanges();
    httpMock.expectOne('/api/signatures/document/42')
      .flush({ detail: 'Storage unavailable' }, { status: 503, statusText: 'Unavailable' });
  }

  it('says so when the signatures cannot be listed', () => {
    listingFails();

    expect(announced()).not.toBe('');
  });

  it('does not claim the document has no signatures when it could not look', () => {
    listingFails();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).not.toContain('No signatures on this document yet');
  });

  it('says so when signing is refused', () => {
    fixture.detectChanges();
    httpMock.expectOne('/api/signatures/document/42').flush([]);

    fixture.componentInstance.signReq = { role: 'Approver', reason: 'Approved' };
    fixture.componentInstance.signDocument();
    httpMock.expectOne('/api/signatures/document/42/sign')
      .flush({ detail: 'Not permitted' }, { status: 403, statusText: 'Forbidden' });

    expect(announced()).not.toBe('');
  });

  it('announces what re-checking a signature found, rather than only showing it', () => {
    fixture.detectChanges();
    httpMock.expectOne('/api/signatures/document/42').flush([SIGNATURE]);
    fixture.detectChanges();

    fixture.componentInstance.verifySignature(SIGNATURE);
    httpMock.expectOne(`/api/signatures/${SIGNATURE.signatureId}/verify`)
      .flush({ valid: true, status: 'VALID', message: 'Signature is valid', embedded: true });
    httpMock.expectOne('/api/signatures/document/42').flush([SIGNATURE]);

    const host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    const region = host.querySelector('[role="status"]');
    expect(region?.getAttribute('aria-live')).toBe('polite');
    // The server's own English sentence is not what reaches the screen.
    expect(region?.textContent).not.toContain('Signature is valid');
    expect(region?.textContent).toContain('has not changed');
  });
});

/**
 * What Angular's sanitiser actually does to an SVG string.
 *
 * <p>Asserted rather than assumed, because the redesign above rests on it and
 * because the obvious guess is wrong in a way that matters: the elements go,
 * the text stays. Believing it rendered *nothing* would have made "the name is
 * on screen" look like a sufficient test, which is exactly the trap the first
 * draft of this file fell into.
 */
describe('Angular\'s HTML sanitiser, on an SVG string', () => {

  @Component({ standalone: true, template: '<div [innerHTML]="markup"></div>' })
  class BindsMarkup { markup = STAMP_SVG; }

  it('drops every svg element', () => {
    const bound = TestBed.createComponent(BindsMarkup);
    bound.detectChanges();

    expect(bound.nativeElement.querySelector('svg')).toBeNull();
    expect(bound.nativeElement.querySelector('text')).toBeNull();
  });

  it('keeps their text, with nothing between it', () => {
    const bound = TestBed.createComponent(BindsMarkup);
    bound.detectChanges();

    expect(bound.nativeElement.textContent).toBe(
      'DIGITALLY SIGNEDSigned by: A. SurveyorDate: 2026-03-04 09:30:00Ref: AB12CD34');
  });
});
