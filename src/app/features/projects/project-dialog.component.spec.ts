/**
 * Creating and editing a project.
 *
 * <p>Two things are worth guarding: that the form is a copy, so cancelling an
 * edit does not quietly rewrite the sidebar entry; and that a failed save
 * says something useful rather than closing as though it worked.
 */
import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { throwError } from "rxjs";

import { Project } from "../../core/models";
import { ProjectService } from "../../core/services/project.service";
import { ProjectDialogComponent } from "./project-dialog.component";

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 7,
    name: "Northern Depot",
    description: "A depot",
    phase: "CONSTRUCTION",
    location: "Manchester",
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("ProjectDialogComponent", () => {
  let fixture: ComponentFixture<ProjectDialogComponent>;
  let dialog: ProjectDialogComponent;
  let projects: ProjectService;

  /** Renders the dialog, editing the given project or creating a new one. */
  function render(editing: Project | null): void {
    fixture = TestBed.createComponent(ProjectDialogComponent);
    fixture.componentRef.setInput("editing", editing);
    dialog = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    projects = TestBed.inject(ProjectService);
  });

  it("starts a new project in the phase most are created in", () => {
    // A working default, per §1.2 — nobody should have to choose "Design" to
    // create the project they were already designing.
    render(null);

    expect(dialog.form.phase).toBe("DESIGN");
  });

  it("fills the form from the project being edited", () => {
    render(project({ name: "Southern Yard", location: "Leeds" }));

    expect(dialog.form.name).toBe("Southern Yard");
    expect(dialog.form.location).toBe("Leeds");
  });

  it("copies the project rather than binding to it", () => {
    // Typing into a cancelled edit must not reach the sidebar entry.
    const existing = project({ name: "Northern Depot" });
    render(existing);

    dialog.form.name = "Renamed while editing";

    expect(existing.name).toBe("Northern Depot");
  });

  it("refuses a project with no name, and says so", () => {
    const create = vi.spyOn(projects, "create");
    render(null);
    dialog.form.name = "   ";

    dialog.save();

    expect(create).not.toHaveBeenCalled();
    expect(dialog.error()).toContain("required");
  });

  it("trims the name it sends", () => {
    const create = vi.spyOn(projects, "create").mockReturnValue(throwError(() => ({})));
    render(null);
    dialog.form.name = "  Northern Depot  ";

    dialog.save();

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Northern Depot" }),
    );
  });

  it("updates rather than creates when editing", () => {
    const update = vi.spyOn(projects, "update").mockReturnValue(throwError(() => ({})));
    const create = vi.spyOn(projects, "create");
    render(project({ id: 7 }));

    dialog.save();

    expect(update).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ name: "Northern Depot" }),
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("repeats what the server said when it explained itself", () => {
    // RFC 9457 problem document (§3.4), which is what the API actually
    // returns. This component used to read `error` as a bare string, so the
    // server's own sentence was discarded every time.
    vi.spyOn(projects, "create").mockReturnValue(
      throwError(() => ({
        status: 409,
        error: { detail: "A project with that name already exists." },
      })),
    );
    render(null);
    dialog.form.name = "Northern Depot";

    dialog.save();

    expect(dialog.error()).toContain("A project with that name already exists.");
  });

  it("falls back to its own words when the server said nothing useful", () => {
    // A blank body would otherwise render an empty red box, which reads as a
    // rendering fault rather than a failed save.
    vi.spyOn(projects, "create").mockReturnValue(
      throwError(() => ({ status: 500, error: { detail: "  " } })),
    );
    render(null);
    dialog.form.name = "Northern Depot";

    dialog.save();

    expect(dialog.error()).toContain("Could not create");
  });

  it("distinguishes a failed edit from a failed creation", () => {
    vi.spyOn(projects, "update").mockReturnValue(throwError(() => ({})));
    render(project());

    dialog.save();

    expect(dialog.error()).toContain("Could not update");
  });

  it("lets go of the submit button after a failure, so it can be retried", () => {
    vi.spyOn(projects, "create").mockReturnValue(throwError(() => ({})));
    render(null);
    dialog.form.name = "Northern Depot";

    dialog.save();

    expect(dialog.saving()).toBe(false);
  });
});
