/**
 * Can the route actually start?
 *
 * Every other spec in this directory builds its own injector and lists each
 * service in it. That exercises the code and not the wiring, and it hid a real
 * fault for as long as it existed: `ViewerStateService` is deliberately not a
 * root service — one instance per viewer, so two viewers never share a zoom
 * level — and nothing provided it on the embed route. `/embed` threw NG0201
 * before it rendered anything, while every unit test here passed.
 *
 * So this one provides nothing. It instantiates the component the router
 * loads, through the component's own `providers`, which is the only
 * arrangement that tells you the route works. It is deliberately shallow:
 * what is under test is the injector graph, not what the component draws.
 */
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { EmbedViewerComponent } from './embed-viewer.component';
import { EmbedSession } from './embed-session.service';
import { HostChannel } from './host-channel.service';
import { ViewerStateService } from '../../../viewer-core/viewer-state.service';

describe('the embed route, wired as the router wires it', () => {

  it('creates without anything being provided for it', () => {
    TestBed.configureTestingModule({ imports: [EmbedViewerComponent] });

    // Not a smoke test. This is the assertion that fails with NG0201 when a
    // service the component injects has no provider anywhere it can see.
    expect(() => TestBed.createComponent(EmbedViewerComponent)).not.toThrow();
  });

  it('gives the session and the component the same viewer state', () => {
    TestBed.configureTestingModule({ imports: [EmbedViewerComponent] });
    const fixture = TestBed.createComponent(EmbedViewerComponent);

    // The failure this guards is subtler than a missing provider and survives
    // one: if EmbedSession resolved a different ViewerStateService from the
    // one the template renders, the host's page changes and zoom would be
    // applied to an instance nobody is looking at, and the viewer would
    // simply ignore the host.
    const fromComponent = fixture.componentInstance.state;
    const fromSession = fixture.debugElement.injector.get(ViewerStateService);

    expect(fromSession).toBe(fromComponent);
  });

  it('gives each viewer its own state, session and channel', () => {
    TestBed.configureTestingModule({ imports: [EmbedViewerComponent] });
    const first = TestBed.createComponent(EmbedViewerComponent);
    const second = TestBed.createComponent(EmbedViewerComponent);

    // Root-scoped, these would carry one host's configured parent origin and
    // one document's session state into the next viewer — which is a leak
    // across two integrators as easily as across two documents.
    //
    // ViewerStateService is listed here and not only in the test above,
    // because the two failures are different: that one catches a provider
    // missing, this one catches it moved to root. Moving it to root also
    // makes the route work, which is why it is the tempting fix and why it
    // needs an assertion of its own.
    expect(second.debugElement.injector.get(ViewerStateService))
      .not.toBe(first.debugElement.injector.get(ViewerStateService));
    expect(second.debugElement.injector.get(EmbedSession))
      .not.toBe(first.debugElement.injector.get(EmbedSession));
    expect(second.debugElement.injector.get(HostChannel))
      .not.toBe(first.debugElement.injector.get(HostChannel));
  });
});
