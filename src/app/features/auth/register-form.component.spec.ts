import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RegisterFormComponent } from './register-form.component';

/**
 * What registration puts on the wire.
 *
 * <p>The two shapes are not cosmetic: without an invitation the account gets a
 * new organisation of its own, and with one it joins the organisation that
 * issued it. Sending the wrong one silently puts somebody in the wrong place,
 * which is exactly the class of defect this replaced — registration used to
 * put every account into the deployment's shared default organisation, so
 * anyone who signed up could read everything in it.
 */
describe('RegisterFormComponent', () => {

  let component: RegisterFormComponent;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    });
    const fixture = TestBed.createComponent(RegisterFormComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);

    component.username = 'j.okafor';
    component.email = 'j.okafor@example.test';
    component.password = 'correct-horse-battery-staple-42';
  });

  afterEach(() => http.verify());

  const sentBody = () => {
    const request = http.expectOne('/api/auth/register');
    const body = request.request.body as Record<string, unknown>;
    request.flush({ token: 't', username: 'j.okafor', role: 'ADMIN' });
    return body;
  };

  it('founds a new organisation when no invitation is offered', () => {
    component.submit();

    const body = sentBody();
    // Absent, not empty. The server reads a blank invitation as none, but a
    // meaningless field on the wire makes the intent unreadable to anyone
    // debugging which of the two shapes was actually sent.
    expect(body['invitationToken']).toBeUndefined();
    expect(body['username']).toBe('j.okafor');
  });

  it('sends the organisation name when one is given', () => {
    component.organisationName = '  Okafor Engineering  ';
    component.submit();

    expect(sentBody()['organisationName']).toBe('Okafor Engineering');
  });

  it('sends the invitation when joining an existing organisation', () => {
    component.chooseExistingOrganisation();
    component.invitationToken = 'cdeinv_sample-token';
    component.submit();

    const body = sentBody();
    expect(body['invitationToken']).toBe('cdeinv_sample-token');
    // The organisation already has a name; sending one would be ignored, and
    // offering the field would suggest otherwise.
    expect(body['organisationName']).toBeUndefined();
  });

  it('drops a token that was typed and then abandoned', () => {
    // Switching back must clear it. Left in a hidden field it would still be
    // sent, and the account would be refused — or worse, quietly created — in
    // an organisation the user had stopped meaning to join.
    component.chooseExistingOrganisation();
    component.invitationToken = 'cdeinv_changed-my-mind';
    component.chooseNewOrganisation();
    component.submit();

    expect(sentBody()['invitationToken']).toBeUndefined();
  });

  it('asks for the code rather than sending an empty invitation', () => {
    component.chooseExistingOrganisation();

    let message = '';
    component.failed.subscribe(text => { message = text; });
    component.submit();

    // No request at all: an empty token would be refused by the server as an
    // unusable invitation, which reads to the user as "your invitation is
    // wrong" rather than "you did not enter one".
    http.expectNone('/api/auth/register');
    expect(message).toContain('invitation code');
  });

  it('refuses a password the server would refuse, without asking it', () => {
    component.password = 'short';

    let message = '';
    component.failed.subscribe(text => { message = text; });
    component.submit();

    http.expectNone('/api/auth/register');
    expect(message).toContain('12');
  });
});
