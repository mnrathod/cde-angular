import { Component, ChangeDetectionStrategy } from "@angular/core";
import { RouterOutlet } from "@angular/router";

@Component({
  selector: "app-project-list",
  standalone: true,
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: "<router-outlet />",
})
export class ProjectListComponent {}
