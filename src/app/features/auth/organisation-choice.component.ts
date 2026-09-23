/**
 * Whether the new account starts an organisation or joins one.
 *
 * <p>The only real decision on the registration form, so it is a single
 * explicit choice rather than two optional fields the reader has to work out
 * — sending both would ask them to understand the tenancy model to sign up.
 *
 * <p>Radios rather than a checkbox because they are exclusive alternatives
 * and both need a visible label, and inside a `fieldset` because without the
 * `legend` a screen reader reads two unrelated radios with no idea what the
 * choice is.
 */
import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, Output,
} from "@angular/core";

import { AuthTextFieldComponent } from "./auth-text-field.component";

@Component({
  selector: "app-organisation-choice",
  standalone: true,
  imports: [AuthTextFieldComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset class="border border-gray-200 rounded p-3">
      <legend i18n="Groups the choice between starting an organisation and joining one@@register.organisationLegend"
              class="text-xs font-medium text-gray-600 px-1">
        Organisation
      </legend>

      <div class="flex items-start gap-2 mb-2">
        <input id="join-new" type="radio" name="joining" value="new" class="mt-1"
               [checked]="!joiningExisting" (change)="newOrganisationChosen.emit()" />
        <label for="join-new" i18n="@@register.createOrganisation" class="text-sm text-gray-700">
          Create a new organisation
        </label>
      </div>

      @if (!joiningExisting) {
        <div class="ms-6 mb-3">
          <app-auth-text-field
            fieldId="organisation-name"
            [label]="organisationNameLabel"
            [optionalNote]="optionalNote"
            [value]="organisationName"
            (valueChange)="organisationNameChange.emit($event)"
            autocomplete="organization"
            [hint]="organisationNameHint"
          />
        </div>
      }

      <div class="flex items-start gap-2">
        <input id="join-existing" type="radio" name="joining" value="existing" class="mt-1"
               [checked]="joiningExisting" (change)="existingOrganisationChosen.emit()" />
        <label for="join-existing" i18n="@@register.joinOrganisation" class="text-sm text-gray-700">
          Join one I've been invited to
        </label>
      </div>

      @if (joiningExisting) {
        <div class="ms-6 mt-2">
          <!--
            A plain text input, so it pastes and autofills. The code is long
            and nobody types it; splitting it or blocking paste would be an
            accessibility failure (SC 3.3.8) as well as an annoyance.
          -->
          <app-auth-text-field
            fieldId="invitation-token"
            [label]="invitationCodeLabel"
            [value]="invitationToken"
            (valueChange)="invitationTokenChange.emit($event)"
            autocomplete="off"
            spellcheck="false"
            [hint]="invitationEmailHint"
            extraClass="font-mono"
          />
        </div>
      }
    </fieldset>
  `,
})
export class OrganisationChoiceComponent {
  @Input() joiningExisting = false;
  @Input() organisationName = "";
  @Input() invitationToken = "";

  @Output() newOrganisationChosen = new EventEmitter<void>();
  @Output() existingOrganisationChosen = new EventEmitter<void>();
  @Output() organisationNameChange = new EventEmitter<string>();
  @Output() invitationTokenChange = new EventEmitter<string>();

  /** Labels that reach a child as inputs, so `i18n` cannot mark them in place. */
  readonly organisationNameLabel = $localize`:Label of the optional organisation-name field@@register.organisationNameLabel:Organisation name`;
  readonly optionalNote = $localize`:Marks a field as not required. Shown after the field's label, so it reads as part of it.@@register.optionalNote:(optional)`;
  readonly organisationNameHint = $localize`:@@register.organisationNameHint:Leave blank and we'll name it after you — you can change it later.`;
  readonly invitationCodeLabel = $localize`:@@register.invitationCodeLabel:Invitation code`;
  readonly invitationEmailHint = $localize`:@@register.invitationEmailHint:Use the same email address the invitation was sent to.`;
}
