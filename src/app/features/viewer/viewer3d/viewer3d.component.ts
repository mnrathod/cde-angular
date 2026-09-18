import {
  Component,
  signal,
  inject,
  OnInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  ChangeDetectionStrategy,
} from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { CommonModule } from "@angular/common";
import { ViewerService } from "../../../core/services/viewer.service";
import { IfcTreeComponent, IfcNode } from "../../../../viewer-core/ifc-tree.component";
import {
  ModelGeometry,
  ModelGeometryGroup,
  decodeGeometryContainer,
} from "../../../../viewer-core/model-geometry";
import {
  elementTypesIn,
  materialSlotsForTypes,
  treeFromGeometryGroups,
} from "../../../../viewer-core/model-visibility";
import { ModelViewport, buildModelScene } from "./model-scene";

@Component({
  selector: "app-viewer3d",
  standalone: true,
  imports: [CommonModule, IfcTreeComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div
      class="fixed inset-0 flex flex-col"
      style="background:#0a0c14;z-index:500"
    >
      <!-- Top bar -->
      <div
        class="flex items-center h-11 px-3 gap-2 flex-shrink-0 text-white flex-wrap"
        style="background:var(--nav);box-shadow:0 2px 4px rgba(0,0,0,.15)"
      >
        <button
          (click)="goBack()"
          class="text-xs px-3 py-1 rounded border border-white/30 bg-white/10 hover:bg-white/20"
        >
          <span aria-hidden="true">←</span>
          <ng-container i18n="Leaves the 3D model view and returns to the document list@@viewer3d.back">Back</ng-container>
        </button>
        <span class="text-sm font-semibold flex-1 truncate">{{ title() }}</span>
        <button
          (click)="resetCamera()"
          class="text-xs px-2 py-1 rounded border border-white/30 bg-white/10 hover:bg-white/20"
        >
          <span aria-hidden="true">⌂</span>
          <ng-container i18n="Returns the camera to its starting position. Very short — it sits in a crowded toolbar.@@viewer3d.resetCamera">Reset</ng-container>
        </button>
        <button
          (click)="toggleWireframe()"
          class="text-xs px-2 py-1 rounded border border-white/30 bg-white/10 hover:bg-white/20"
          [class.bg-accent]="wireframe()"
        >
          <span aria-hidden="true">⬡</span>
          <ng-container i18n="Toggles wireframe rendering, showing edges rather than solid faces. Very short — it sits in a crowded toolbar.@@viewer3d.wireframe">Wire</ng-container>
        </button>
        <button
          (click)="snapView('top')"
          class="text-xs px-2 py-1 rounded border border-white/30 bg-white/10 hover:bg-white/20"
        >
          <span aria-hidden="true">⊤</span>
          <ng-container i18n="Snaps the camera to look straight down at the model. Very short — it sits in a crowded toolbar.@@viewer3d.viewTop">Top</ng-container>
        </button>
        <button
          (click)="snapView('front')"
          class="text-xs px-2 py-1 rounded border border-white/30 bg-white/10 hover:bg-white/20"
        >
          <span aria-hidden="true">◫</span>
          <ng-container i18n="Snaps the camera to look at the model from the front. Very short — it sits in a crowded toolbar.@@viewer3d.viewFront">Front</ng-container>
        </button>
        <button
          (click)="snapView('side')"
          class="text-xs px-2 py-1 rounded border border-white/30 bg-white/10 hover:bg-white/20"
        >
          <span aria-hidden="true">◧</span>
          <ng-container i18n="Snaps the camera to look at the model from the side. Very short — it sits in a crowded toolbar.@@viewer3d.viewSide">Side</ng-container>
        </button>
      </div>

      <!-- Body -->
      <div class="flex flex-1 overflow-hidden relative">
        <!-- Canvas wrap -->
        <div #canvasWrap class="flex-1 relative overflow-hidden">
          @if (loading()) {
            <div
              class="absolute inset-0 flex flex-col items-center justify-center text-white/60 z-10"
              style="background:#0a0c14"
            >
              <div
                class="w-10 h-10 border-3 border-white/20 border-t-accent rounded-full animate-spin mb-4"
                style="border-width:3px"
              ></div>
              <div class="text-sm">{{ loadingMsg() }}</div>
            </div>
          }
          @if (errorMsg()) {
            <div class="absolute inset-0 flex items-center justify-center z-10">
              <div
                class="max-w-md p-6 bg-red-900/30 rounded-lg border border-red-500/30 text-red-300 text-sm whitespace-pre-wrap"
              >
                ⚠️ {{ errorMsg() }}
              </div>
            </div>
          }
          <canvas #threeCanvas class="block w-full h-full"></canvas>
        </div>

        <!-- IFC Model Tree Sidebar -->
        <app-ifc-tree
          [nodes]="modelTree()"
          (elementSelected)="onElementSelected($event)"
          (elementVisibilityChanged)="onVisibilityChanged($event)"
        >
        </app-ifc-tree>
      </div>
    </div>
  `,
})
export class Viewer3dComponent implements OnInit, OnDestroy {
  @ViewChild("threeCanvas") canvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild("canvasWrap") wrap!: ElementRef;

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private service = inject(ViewerService);

  title = signal("3D Model");
  loading = signal(true);
  loadingMsg = signal("Loading the 3D renderer...");
  errorMsg = signal("");
  wireframe = signal(false);
  stats = signal<{ label: string; value: string }[]>([]);

  /**
   * The group table of the model on screen, in material-slot order.
   *
   * Held because the visibility handler needs to map an element type back to
   * the material drawing it, and the event that asks for it carries a tree
   * node rather than anything about the geometry.
   */
  private modelGroups: readonly ModelGeometryGroup[] = [];

  /** The rendered viewport: renderer, scene, camera, controls and mesh. */
  private viewport: ModelViewport | null = null;
  private stopWatchingResize?: () => void;

  /** The three.js module namespace, loaded on first use. */
  private threeJs: any = null;

  docId = signal(0);
  // Fetched here rather than by the tree component: viewer-core does no I/O
  // (ADR 14), because a host embedding the viewer supplies this and there is
  // no same-origin /api for the component to reach.
  modelTree = signal<IfcNode[] | undefined>(undefined);

  ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get("id"));
    this.docId.set(id);
    this.service.getModelTree(id).subscribe({
      next: nodes => this.modelTree.set(nodes),
      // A model with no tree endpoint is not an error the user can act on.
      // The empty array is the signal that buildIFCScene should derive the
      // tree from the geometry's groups instead — see treeFromGeometryGroups.
      error: () => this.modelTree.set([]),
    });
    this.loadModel(id);
  }

  ngOnDestroy() {
    this.stopWatchingResize?.();
    this.viewport?.dispose();
  }

  /**
   * Fetch the geometry, or find out why there is none.
   *
   * The geometry route answers with bytes for a model it could extract and
   * with JSON for anything else, so the content type is the branch. Only the
   * second case needs the JSON route, which is what names the specific
   * reason — a Revit binary, an unsupported format, a converter that is not
   * running. That keeps the common path to one request and one extraction.
   */
  async loadModel(id: number) {
    await this.loadThreeJs();
    this.loadingMsg.set("Fetching model data...");

    this.service.getModelGeometry(id).subscribe({
      next: (response) => {
        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.includes("application/octet-stream") || !response.body) {
          this.explainUnopenableModel(id);
          return;
        }
        try {
          const geometry = decodeGeometryContainer(response.body);
          this.loadingMsg.set("Building 3D scene...");
          setTimeout(() => this.buildIFCScene(geometry), 50);
        } catch (failure) {
          this.loading.set(false);
          this.errorMsg.set(
            failure instanceof Error ? failure.message : "Model data could not be read",
          );
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMsg.set(err.message);
      },
    });
  }

  /** Ask the JSON route why a document produced no geometry, and say so. */
  private explainUnopenableModel(id: number) {
    this.service.get3DData(id).subscribe({
      next: (data: any) => {
        this.loading.set(false);
        if (data?.type === "revit_binary") {
          this.errorMsg.set(
            "Revit binary file — export to IFC first.\nFile → Export → IFC in Revit",
          );
        } else if (data?.success === false) {
          this.errorMsg.set(data.error || "Conversion failed");
        } else {
          this.errorMsg.set("Unsupported 3D format");
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMsg.set(err.message);
      },
    });
  }

  /**
   * Loads the renderer from the bundle on first use.
   *
   * Three.js is ~600 KB, far past the 100 KB route-chunk budget, so it is
   * split into its own chunk with a dynamic import and fetched only when
   * someone actually opens a model — most sessions never do.
   *
   * It is imported rather than fetched from a CDN. A remote <script> runs
   * with full privileges on this origin, so a compromised or hijacked CDN
   * would own every session; there is no SRI to fall back on; the strict CSP
   * refuses the request anyway; and an air-gapped deployment has no route to
   * the CDN at all.
   */
  private async loadThreeJs(): Promise<void> {
    if (this.threeJs) return;
    const [three, orbit] = await Promise.all([
      import("three"),
      import("three/examples/jsm/controls/OrbitControls.js"),
    ]);
    this.threeJs = { ...three, OrbitControls: orbit.OrbitControls };
  }

  /** Sidebar width, which the canvas has to make room for. */
  private static readonly SIDEBAR_WIDTH_PX = 208;

  buildIFCScene(data: ModelGeometry) {
    if (!this.threeJs) return;

    // Kept in material-slot order: a group's position here is the
    // materialIndex the scene gave it, and the visibility handler resolves a
    // tree node to those same slots.
    this.modelGroups = data.groups;

    this.viewport = buildModelScene(
      this.threeJs,
      this.canvas.nativeElement,
      data,
      this.canvasSize(),
    );
    this.loading.set(false);

    // A model with no hierarchy of its own still needs the tree, because
    // §1A.4 makes it the accessible route to a canvas some readers cannot
    // use. The groups are what the extractor genuinely found, so the
    // fallback is derived from them rather than invented.
    if (this.modelTree()?.length === 0) {
      this.modelTree.set(treeFromGeometryGroups(data.groups, data.schema));
    }

    this.stats.set([
      {
        label: $localize`:How many building elements a model contains@@viewer3d.elementCount:Elements`,
        value: data.elementCount.toLocaleString(),
      },
      {
        label: $localize`:How many triangles the model's geometry is made of@@viewer3d.triangleCount:Triangles`,
        value: data.triangleCount.toLocaleString(),
      },
      {
        label: $localize`:Which version of the IFC data format the model uses. IFC and its schema names are identifiers, not words to translate.@@viewer3d.schema:Schema`,
        value: data.schema,
      },
    ]);

    this.watchForResize();
  }

  /** The space the canvas has, once the sidebar has taken its share. */
  private canvasSize(): { width: number; height: number } {
    const wrap = this.wrap.nativeElement;
    return {
      width: wrap.clientWidth - Viewer3dComponent.SIDEBAR_WIDTH_PX,
      height: wrap.clientHeight,
    };
  }

  /**
   * Keeps the canvas the size of its container.
   *
   * <p>Registered once and removed on destroy. It was added inside the scene
   * build and removed nowhere, so opening a second model left the first
   * still listening — and resizing a renderer that had been disposed.
   */
  private watchForResize(): void {
    if (this.stopWatchingResize) return;
    const onResize = () => {
      const size = this.canvasSize();
      this.viewport?.resize(size.width, size.height);
    };
    window.addEventListener('resize', onResize);
    this.stopWatchingResize = () =>
      window.removeEventListener('resize', onResize);
  }

  onElementSelected(node: IfcNode) {
    // Highlight selected element in 3D scene
    console.log("Selected:", node.type, node.name);
  }

  /**
   * Show or hide everything a hierarchy node stands for.
   *
   * Hiding a group's material is what stops three.js drawing that run — the
   * renderer skips any group whose material is not visible. Verified against
   * a real WebGL context before this was relied on: two groups drawn side by
   * side, one material hidden, and only that half of the canvas cleared.
   *
   * A node whose types have no geometry toggles nothing, which is the correct
   * outcome rather than a failure — a synthetic hierarchy names types this
   * particular model need not contain.
   */
  onVisibilityChanged(event: { node: IfcNode; visible: boolean }) {
    const materials = this.viewport?.mesh?.material;
    if (!Array.isArray(materials)) return;

    const slots = materialSlotsForTypes(this.modelGroups, elementTypesIn(event.node));
    for (const slot of slots) {
      materials[slot].visible = event.visible;
    }
  }

  resetCamera() {
    /* re-fit */
  }
  toggleWireframe() {
    if (!this.viewport) return;
    this.wireframe.update((w) => !w);
    // One material per element type now, so this sets all of them. It was a
    // single material while every vertex carried its own baked colour.
    const materials = this.viewport.mesh.material;
    for (const material of Array.isArray(materials) ? materials : [materials]) {
      material.wireframe = this.wireframe();
    }
  }
  snapView(view: string) {
    /* set camera position */
  }
  goBack() {
    this.router.navigate(["/"]);
  }
}
