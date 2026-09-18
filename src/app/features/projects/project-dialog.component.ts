/**
 * Creating a project, and editing one.
 *
 * <p>One component for both because the form is identical and only the
 * heading, the submit label and the request differ — two components would be
 * the same six fields written twice, and would drift.
 */
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from "@angular/core";
import { FormsModule } from "@angular/forms";

import { problemMessage } from "../../core/handlers/problem-detail";
import { Project } from "../../core/models";
import { ProjectService } from "../../core/services/project.service";
import { LabelledFieldComponent } from "../../shared/components/labelled-field.component";
import { ModalDialogComponent } from "../../shared/components/modal-dialog.component";
import { PROJECT_PHASES, phaseLabel } from "./project-vocabulary";

@Component({
  selector: "app-project-dialog",
  standalone: true,
  imports: [FormsModule, ModalDialogComponent, LabelledFieldComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <app-modal-dialog
      [heading]="heading()"
      [error]="error()"
      [confirmLabel]="submitLabel()"
      [confirmDisabled]="saving()"
      (confirmed)="save()"
      (dismissed)="closed.emit()"
    >
      <div class="space-y-3 mb-5">
        <app-labelled-field
          for="project-name"
          i18n-label="The asterisk marks the field as required@@shell.projectNameLabel"
          label="Project Name *"
        >
          <input
            id="project-name"
            [(ngModel)]="form.name"
            name="projectName"
            class="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </app-labelled-field>
        <app-labelled-field
          for="project-description"
          i18n-label="@@shell.projectDescriptionLabel"
          label="Description"
        >
          <textarea
            id="project-description"
            [(ngModel)]="form.description"
            name="projectDescription"
            rows="2"
            class="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          ></textarea>
        </app-labelled-field>
        <div class="grid grid-cols-2 gap-2">
          <app-labelled-field
            for="project-phase"
            i18n-label="Which stage of its life a construction project is in@@shell.projectPhaseLabel"
            label="Phase"
          >
            <select
              id="project-phase"
              [(ngModel)]="form.phase"
              name="projectPhase"
              class="w-full px-2 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            >
              @for (phase of phases; track phase) {
                <option [value]="phase">{{ labelFor(phase) }}</option>
              }
            </select>
          </app-labelled-field>
          <app-labelled-field
            for="project-location"
            i18n-label="Where the project is being built@@shell.projectLocationLabel"
            label="Location"
          >
            <input
              id="project-location"
              [(ngModel)]="form.location"
              name="projectLocation"
              i18n-placeholder="Example of a place name — replace with one familiar in the target locale@@shell.projectLocationPlaceholder"
              placeholder="Manchester"
              class="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </app-labelled-field>
        </div>
      </div>

    </app-modal-dialog>
  `,
})
export class ProjectDialogComponent implements OnInit {
  /** The project being edited, or null when creating a new one. */
  editing = input<Project | null>(null);
  /** Raised when the dialog should go away — cancelled or saved. */
  closed = output<void>();

  private projects = inject(ProjectService);

  readonly phases = PROJECT_PHASES;
  labelFor = phaseLabel;

  saving = signal(false);
  error = signal("");

  /**
   * Copied from the input rather than bound to the live object, so cancelling
   * an edit leaves the sidebar entry as it was.
   */
  form: Partial<Project> = {};

  // Written where they are used, as in the sibling confirmation dialog:
  // a name for a constant that feeds exactly one expression is a second
  // place for it to go stale.
  heading = computed(() =>
    this.editing()
      ? $localize`:Heading of the dialog for editing a project@@shell.editProjectTitle:✎ Edit Project`
      : $localize`:Heading of the dialog for creating a project@@shell.newProjectTitle:📁 New Project`,
  );

  submitLabel = computed(() => {
    if (this.saving()) {
      return $localize`:Project dialog's submit button while the request is in flight@@shell.savingProject:Saving...`;
    }
    return this.editing()
      ? $localize`:Saves edits to an existing project@@shell.saveChanges:Save Changes`
      : $localize`:Creates the project@@shell.createProject:Create`;
  });

  ngOnInit(): void {
    // Not the constructor: a template binding is evaluated during the first
    // change detection pass, which is after the instance exists, so reading
    // `editing()` any earlier gives the default and every edit would open on
    // an empty create form.
    const project = this.editing();
    this.form = project
      ? {
          name: project.name,
          description: project.description,
          phase: project.phase,
          location: project.location,
        }
      : { phase: "DESIGN" };
  }

  save(): void {
    const name = this.form.name?.trim();
    if (!name) {
      this.error.set(
        $localize`:Validation message in the project dialog@@shell.projectNameRequired:Project name is required.`,
      );
      return;
    }

    const existing = this.editing();
    this.saving.set(true);
    this.error.set("");

    const request = existing
      ? this.projects.update(existing.id, { ...this.form, name })
      : this.projects.create({ ...this.form, name });

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.closed.emit();
      },
      error: (failure: unknown) => {
        this.saving.set(false);
        this.error.set(problemMessage(failure, this.saveFailedLabel(existing)));
      },
    });
  }

  /** Named for what the user pressed, for when the server explained nothing. */
  private saveFailedLabel(editing: Project | null): string {
    return editing
      ? $localize`:Fallback when saving edits to a project fails@@shell.updateProjectFailed:Could not update the project.`
      : $localize`:Fallback when creating a project fails@@shell.createProjectFailed:Could not create the project.`;
  }
}
