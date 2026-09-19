import {
  Component, signal, inject, OnInit, OnDestroy, ElementRef, ViewChild,
  AfterViewInit, ChangeDetectionStrategy,
} from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";

import { ViewerService } from "../../../core/services/viewer.service";
import { IfcTreeComponent } from "../../../../viewer-core/ifc-tree.component";
import { IfcNode } from "../../../../viewer-core/ifc-node";
import { ModelGeometry } from "../../../../viewer-core/model-geometry";
import {
  elementTypesIn,
  materialSlotsForTypes,
  treeFromGeometryGroups,
} from "../../../../viewer-core/model-visibility";
import { ModelDirection } from "./model-scene";
import { ModelCanvas } from "./model-canvas";
import { ModelLoading } from "./model-loading";
import {
  ModelFact, Viewer3dToolbarComponent, factsAbout,
} from "./viewer3d-toolbar.component";

@Component({
  selector: "app-viewer3d",
  standalone: true,
  imports: [IfcTreeComponent, Viewer3dToolbarComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  providers: [ModelLoading, ModelCanvas],
  template: `
    <div class="fixed inset-0 flex flex-col" style="background:#0a0c14;z-index:500">

      <app-viewer3d-toolbar
        [title]="title()"
        [facts]="facts()"
        [wireframe]="wireframe()"
        (backRequested)="goBack()"
        (viewReset)="canvas.resetView()"
        (wireframeToggled)="toggleWireframe()"
        (directionChosen)="canvas.lookFrom($event)"
      />

      <div class="flex flex-1 overflow-hidden relative">
        <div #canvasWrap class="flex-1 relative overflow-hidden">
          @if (model.loading()) {
            <div
              class="absolute inset-0 flex flex-col items-center justify-center text-white/60 z-10"
              style="background:#0a0c14"
            >
              <div
                class="w-10 h-10 border-3 border-white/20 border-t-accent rounded-full animate-spin mb-4"
                style="border-width:3px"
              ></div>
              <div class="text-sm">{{ model.progress() }}</div>
            </div>
          }
          @if (model.errorMsg()) {
            <div class="absolute inset-0 flex items-center justify-center z-10">
              <div
                class="max-w-md p-6 bg-red-900/30 rounded-lg border border-red-500/30 text-red-300 text-sm whitespace-pre-wrap"
                role="alert"
              >
                <span aria-hidden="true">⚠️</span> {{ model.errorMsg() }}
              </div>
            </div>
          }
          <canvas #threeCanvas class="block w-full h-full"></canvas>
        </div>

        <!-- The accessible route to a canvas some readers cannot use (§1A.4). -->
        <app-ifc-tree
          [nodes]="modelTree()"
          (elementVisibilityChanged)="onVisibilityChanged($event)"
        >
        </app-ifc-tree>
      </div>
    </div>
  `,
})
export class Viewer3dComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild("threeCanvas") canvasElement!: ElementRef<HTMLCanvasElement>;
  @ViewChild("canvasWrap") wrap!: ElementRef<HTMLElement>;

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private service = inject(ViewerService);
  model = inject(ModelLoading);
  canvas = inject(ModelCanvas);

  title = signal($localize`:Heading of the 3D model view@@viewer3d.title:3D Model`);
  wireframe = signal(false);
  /** What the model is: element count, triangle count and schema. */
  facts = signal<ModelFact[]>([]);

  // Fetched here rather than by the tree component: viewer-core does no I/O
  // (ADR 14), because a host embedding the viewer supplies this and there is
  // no same-origin /api for the component to reach.
  modelTree = signal<IfcNode[] | undefined>(undefined);

  ngAfterViewInit() {
    this.canvas.bindTo(() => ({
      canvas: this.canvasElement?.nativeElement,
      wrap: this.wrap?.nativeElement,
    }));
  }

  async ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get("id"));
    this.service.getModelTree(id).subscribe({
      next: (nodes) => this.modelTree.set(nodes),
      // A model with no tree endpoint is not an error the user can act on.
      // The empty array is the signal to derive the tree from the geometry's
      // groups instead — see treeFromGeometryGroups.
      error: () => this.modelTree.set([]),
    });

    await this.canvas.prepare();
    this.model.fetch(id, (geometry) => {
      // Deferred a frame so the progress message paints before the scene
      // build takes the main thread.
      setTimeout(() => this.show(geometry), 50);
    });
  }

  ngOnDestroy() {
    this.canvas.dispose();
  }

  private show(geometry: ModelGeometry) {
    this.canvas.show(geometry);
    this.model.finished();

    // A model with no hierarchy of its own still needs the tree, because
    // §1A.4 makes it the accessible route to a canvas some readers cannot
    // use. The groups are what the extractor genuinely found, so the
    // fallback is derived from them rather than invented.
    if (this.modelTree()?.length === 0) {
      this.modelTree.set(treeFromGeometryGroups(geometry.groups, geometry.schema));
    }

    this.facts.set(factsAbout(geometry));
  }

  /**
   * Show or hide everything a hierarchy node stands for.
   *
   * <p>A node whose types have no geometry toggles nothing, which is the
   * correct outcome rather than a failure — a synthetic hierarchy names
   * types this particular model need not contain.
   */
  onVisibilityChanged(event: { node: IfcNode; visible: boolean }) {
    this.canvas.setSlotsVisible(
      materialSlotsForTypes(this.canvas.groups, elementTypesIn(event.node)),
      event.visible,
    );
  }

  toggleWireframe() {
    this.wireframe.update((on) => !on);
    this.canvas.setWireframe(this.wireframe());
  }

  goBack() {
    this.router.navigate(["/"]);
  }
}
