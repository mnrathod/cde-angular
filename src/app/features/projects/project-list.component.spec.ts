/**
 * The sidebar list of projects.
 *
 * <p>Two things here are rules rather than styling, and both are asserted
 * against the rendered DOM rather than against the component's fields.
 *
 * <p>The first is §1.1: never render a control the current user cannot use —
 * hide it, do not disable it, unless the disabled state teaches something. The
 * three write controls on this list teach nothing when disabled ("Edit project"
 * greyed out tells a viewer only that somebody else can edit), so they are
 * absent for an account without `project:write`. That is a presentation rule
 * and not a security one — §5.5 is explicit that client-side checks are UX only
 * and the server re-validates — but a list that offers a reader three buttons
 * that all end in 403 is a list that has taught them to distrust it.
 *
 * <p>The second is §1A.2: everything works from the keyboard. The row keeps a
 * click for pointer convenience and cannot itself be a button, because it
 * contains buttons and a button inside a button is invalid HTML that browsers
 * recover from differently. So selection has a real `button` on the project
 * name, and the row's click handler is the convenience rather than the path.
 * A test that called `projects.select()` directly would pass with the button
 * removed.
 */
import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";

import { Project } from "../../core/models";
import { AuthService } from "../../core/services/auth.service";
import { ProjectService } from "../../core/services/project.service";
import { Permission, RoleService } from "../../core/services/role.service";
import { ProjectListComponent } from "./project-list.component";

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 7,
    name: "Tyne Crossing",
    description: "Replacement deck",
    location: "Newcastle",
    phase: "DESIGN",
    documentCount: 3,
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  } as Project;
}

describe("ProjectListComponent", () => {
  let fixture: ComponentFixture<ProjectListComponent>;
  let projects: ProjectService;

  /** Builds the list for an account holding exactly these permissions. */
  function renderFor(held: string[]): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        RoleService,
        {
          provide: AuthService,
          useValue: {
            role: signal("ENGINEER"),
            permissions: signal(new Set(held)),
            isLoggedIn: signal(true),
          },
        },
      ],
    });
    projects = TestBed.inject(ProjectService);
    fixture = TestBed.createComponent(ProjectListComponent);
    fixture.detectChanges();
  }

  function buttonTitled(title: string): HTMLButtonElement | null {
    return fixture.nativeElement.querySelector(`button[title="${title}"]`);
  }

  function rows(): HTMLElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('[data-testid="project-item"]'));
  }

  function text(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? "";
  }

  beforeEach(() => renderFor([Permission.WriteProject]));

  describe("what it lists", () => {
    it("names every project it was given", () => {
      projects.projects.set([project(), project({ id: 8, name: "Quayside Depot" })]);
      fixture.detectChanges();

      expect(text()).toContain("Tyne Crossing");
      expect(text()).toContain("Quayside Depot");
      expect(rows()).toHaveLength(2);
    });

    it("says what a project's phase is in words, not as the enum", () => {
      projects.projects.set([project({ phase: "DESIGN" })]);
      fixture.detectChanges();

      expect(text()).not.toContain("DESIGN");
    });

    it("counts a single document in the singular", () => {
      // "1 docs" is the kind of thing that makes a product look unfinished in
      // the demo a procurement decision is made from.
      projects.projects.set([project({ documentCount: 1 })]);
      fixture.detectChanges();

      expect(text()).toContain("1 doc");
      expect(text()).not.toContain("1 docs");
    });

    it("counts several documents in the plural", () => {
      projects.projects.set([project({ documentCount: 4 })]);
      fixture.detectChanges();

      expect(text()).toContain("4 docs");
    });

    it("counts a project with no documents as none rather than as nothing", () => {
      // An absent count renders as a blank where a number should be, which
      // reads as a value still loading.
      projects.projects.set([project({ documentCount: undefined })]);
      fixture.detectChanges();

      expect(text()).toContain("0 docs");
    });
  });

  describe("the empty state", () => {
    it("teaches rather than apologises once loading has finished", () => {
      // §1.1: an empty state says what the object is and what to do next.
      projects.projects.set([]);
      projects.loading.set(false);
      fixture.detectChanges();

      expect(text()).toContain("No projects yet");
    });

    it("says nothing while the list is still loading", () => {
      // "No projects yet" during the first load tells the reader their projects
      // are gone. The absence of the message is the whole behaviour here.
      projects.projects.set([]);
      projects.loading.set(true);
      fixture.detectChanges();

      expect(text()).not.toContain("No projects yet");
    });

    it("does not show the empty state once there is something in the list", () => {
      projects.projects.set([project()]);
      projects.loading.set(false);
      fixture.detectChanges();

      expect(text()).not.toContain("No projects yet");
    });
  });

  describe("selecting a project", () => {
    it("can be done from the keyboard, through a real button on the name", () => {
      // The row's click is pointer convenience. If selection existed only
      // there, a keyboard user could not open a project at all — and the row
      // cannot be made a button because it contains three.
      projects.projects.set([project()]);
      fixture.detectChanges();

      const name = fixture.nativeElement.querySelector(
        '[data-testid="project-item"] button',
      ) as HTMLButtonElement;

      expect(name.textContent).toContain("Tyne Crossing");
      name.click();
      fixture.detectChanges();

      expect(projects.selected()?.id).toBe(7);
    });

    it("marks the open project for a screen reader, not only with a colour", () => {
      // §1A.2: colour is never the sole carrier of meaning. aria-current is what
      // tells a screen-reader user which project they are looking at.
      projects.projects.set([project(), project({ id: 8, name: "Quayside Depot" })]);
      projects.selected.set(project());
      fixture.detectChanges();

      const marked = fixture.nativeElement.querySelectorAll('button[aria-current="true"]');

      expect(marked).toHaveLength(1);
      expect(marked[0].textContent).toContain("Tyne Crossing");
    });

    it("marks nothing when no project is open", () => {
      projects.projects.set([project()]);
      projects.selected.set(null);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector("button[aria-current]")).toBeNull();
    });

    it("can also be done by clicking the row, for a pointer", () => {
      projects.projects.set([project()]);
      fixture.detectChanges();

      rows()[0]!.click();
      fixture.detectChanges();

      expect(projects.selected()?.id).toBe(7);
    });
  });

  describe("what it raises to the shell", () => {
    it("asks the shell to create, rather than opening a dialog itself", () => {
      // Presentation only: deciding what "new project" opens belongs to the
      // shell, which owns the dialogs.
      let asked = false;
      fixture.componentInstance.createRequested.subscribe(() => (asked = true));

      buttonTitled("New project")!.click();

      expect(asked).toBe(true);
    });

    it("names the project it is asking to edit", () => {
      let edited: Project | undefined;
      projects.projects.set([project({ id: 8, name: "Quayside Depot" })]);
      fixture.detectChanges();
      fixture.componentInstance.editRequested.subscribe((p) => (edited = p));

      buttonTitled("Edit project")!.click();

      expect(edited?.id).toBe(8);
    });

    it("names the project it is asking to delete", () => {
      let deleted: Project | undefined;
      projects.projects.set([project({ id: 9, name: "Riverside" })]);
      fixture.detectChanges();
      fixture.componentInstance.deleteRequested.subscribe((p) => (deleted = p));

      buttonTitled("Delete project")!.click();

      expect(deleted?.id).toBe(9);
    });

    it("editing a project does not also select it", () => {
      // Both handlers sit on nested elements, so the edit click has to stop
      // propagating. Without that, opening the edit dialog silently navigates
      // the reader away from whatever they were looking at.
      projects.projects.set([project(), project({ id: 8, name: "Quayside Depot" })]);
      projects.selected.set(project());
      fixture.detectChanges();

      const editOnSecondRow = rows()[1]!.querySelector(
        'button[title="Edit project"]',
      ) as HTMLButtonElement;
      editOnSecondRow.click();
      fixture.detectChanges();

      expect(projects.selected()?.id).toBe(7);
    });

    it("deleting a project does not also select it", () => {
      projects.projects.set([project(), project({ id: 8, name: "Quayside Depot" })]);
      projects.selected.set(project());
      fixture.detectChanges();

      (rows()[1]!.querySelector('button[title="Delete project"]') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(projects.selected()?.id).toBe(7);
    });
  });

  describe("controls an account cannot use", () => {
    it("offers no write controls at all without project:write", () => {
      // §1.1: hidden, not disabled. Three greyed-out buttons teach a reader
      // nothing except that somebody else can do this.
      renderFor([]);
      projects.projects.set([project()]);
      fixture.detectChanges();

      expect(buttonTitled("New project")).toBeNull();
      expect(buttonTitled("Edit project")).toBeNull();
      expect(buttonTitled("Delete project")).toBeNull();
    });

    it("still lists the projects and still lets them be opened", () => {
      // The read path is unaffected. Hiding the write controls must not turn a
      // read-only account's sidebar into an empty one.
      renderFor([]);
      projects.projects.set([project()]);
      fixture.detectChanges();

      expect(text()).toContain("Tyne Crossing");

      const name = fixture.nativeElement.querySelector(
        '[data-testid="project-item"] button',
      ) as HTMLButtonElement;
      name.click();
      fixture.detectChanges();

      expect(projects.selected()?.id).toBe(7);
    });

    it("offers the write controls to an account that holds the permission", () => {
      // The other half. Without this, removing every control would pass the
      // test above and nobody could create a project.
      renderFor([Permission.WriteProject]);
      projects.projects.set([project()]);
      fixture.detectChanges();

      expect(buttonTitled("New project")).not.toBeNull();
      expect(buttonTitled("Edit project")).not.toBeNull();
      expect(buttonTitled("Delete project")).not.toBeNull();
    });

    it("is not fooled by holding some other permission", () => {
      // A permission set is not a boolean. Reading "any permission at all" as
      // write access is the shape this check has to refuse.
      renderFor([Permission.ReadProject]);
      projects.projects.set([project()]);
      fixture.detectChanges();

      expect(buttonTitled("New project")).toBeNull();
    });
  });
});
