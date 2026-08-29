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
import { IfcTreeComponent, IfcNode } from "./ifc-tree.component";

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
          ← Back
        </button>
        <span class="text-sm font-semibold flex-1 truncate">{{ title() }}</span>
        <button
          (click)="resetCamera()"
          class="text-xs px-2 py-1 rounded border border-white/30 bg-white/10 hover:bg-white/20"
        >
          ⌂ Reset
        </button>
        <button
          (click)="toggleWireframe()"
          class="text-xs px-2 py-1 rounded border border-white/30 bg-white/10 hover:bg-white/20"
          [class.bg-accent]="wireframe()"
        >
          ⬡ Wire
        </button>
        <button
          (click)="snapView('top')"
          class="text-xs px-2 py-1 rounded border border-white/30 bg-white/10 hover:bg-white/20"
        >
          ⊤ Top
        </button>
        <button
          (click)="snapView('front')"
          class="text-xs px-2 py-1 rounded border border-white/30 bg-white/10 hover:bg-white/20"
        >
          ◫ Front
        </button>
        <button
          (click)="snapView('side')"
          class="text-xs px-2 py-1 rounded border border-white/30 bg-white/10 hover:bg-white/20"
        >
          ◧ Side
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
          [documentId]="docId()"
          [stats]="ifcStats()"
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
  layers = signal<{ name: string; color: string; visible: boolean }[]>([]);

  /** The rendered viewport: renderer, scene, camera, controls and mesh. */
  private viewport: any = null;

  /** The three.js module namespace, loaded on first use. */
  private threeJs: any = null;
  private animId: number | null = null;

  docId = signal(0);
  ifcStats = signal<{ schema: string; elementCount: number } | undefined>(
    undefined,
  );

  readonly IFC_COLORS: Record<string, [number, number, number]> = {
    IfcWall: [0.85, 0.82, 0.78],
    IfcWallStandardCase: [0.85, 0.82, 0.78],
    IfcSlab: [0.75, 0.75, 0.75],
    IfcRoof: [0.62, 0.45, 0.35],
    IfcColumn: [0.8, 0.75, 0.7],
    IfcBeam: [0.7, 0.65, 0.6],
    IfcDoor: [0.65, 0.45, 0.25],
    IfcWindow: [0.55, 0.75, 0.9],
    IfcStair: [0.8, 0.78, 0.75],
    IfcFurnishingElement: [0.6, 0.5, 0.4],
  };

  ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get("id"));
    this.docId.set(id);
    this.loadModel(id);
  }

  ngOnDestroy() {
    if (this.animId) cancelAnimationFrame(this.animId);
    this.viewport?.renderer?.dispose();
  }

  async loadModel(id: number) {
    await this.loadThreeJs();
    this.loadingMsg.set("Fetching model data...");

    this.service.get3DData(id).subscribe({
      next: (data: any) => {
        if (data?.type === "ifc3d") {
          this.loadingMsg.set("Building 3D scene...");
          setTimeout(() => this.buildIFCScene(data), 50);
        } else if (data?.type === "revit_binary") {
          this.loading.set(false);
          this.errorMsg.set(
            "Revit binary file — export to IFC first.\nFile → Export → IFC in Revit",
          );
        } else if (data?.success === false) {
          this.loading.set(false);
          this.errorMsg.set(data.error || "Conversion failed");
        } else {
          this.loading.set(false);
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

  buildIFCScene(data: any) {
    const T = this.threeJs;
    if (!T) return;
    const canvas = this.canvas.nativeElement;
    const W = this.wrap.nativeElement.clientWidth - 208;
    const H = this.wrap.nativeElement.clientHeight;

    const renderer = new T.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor(0x13151f);

    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(45, W / H, 0.01, 100000);
    camera.position.set(20, 15, 20);

    scene.add(new T.AmbientLight(0xffffff, 0.6));
    const dir = new T.DirectionalLight(0xffffff, 0.8);
    dir.position.set(50, 100, 50);
    scene.add(dir);

    const controls = new T.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const grid = new T.GridHelper(100, 20, 0x333344, 0x222233);
    scene.add(grid);

    const gd = data.gltfData;
    const b64 = (s: string) =>
      Uint8Array.from(atob(s), (c) => c.charCodeAt(0)).buffer;
    const geo = new T.BufferGeometry();
    geo.setAttribute(
      "position",
      new T.BufferAttribute(new Float32Array(b64(gd.positions)), 3),
    );
    geo.setAttribute(
      "normal",
      new T.BufferAttribute(new Float32Array(b64(gd.normals)), 3),
    );
    geo.setAttribute(
      "color",
      new T.BufferAttribute(new Float32Array(b64(gd.colors)), 3),
    );
    geo.setIndex(new T.BufferAttribute(new Uint32Array(b64(gd.indices)), 1));

    const mat = new T.MeshPhongMaterial({
      vertexColors: true,
      side: T.DoubleSide,
      shininess: 30,
    });
    const mesh = new T.Mesh(geo, mat);
    scene.add(mesh);

    // Fit camera
    const box = new T.Box3().expandByObject(mesh);
    const center = box.getCenter(new T.Vector3());
    const size = box.getSize(new T.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    camera.position.set(
      center.x + maxDim * 1.2,
      center.y + maxDim * 0.8,
      center.z + maxDim * 1.2,
    );
    controls.target.copy(center);
    camera.near = maxDim * 0.001;
    camera.far = maxDim * 100;
    camera.updateProjectionMatrix();
    grid.scale.setScalar(maxDim / 10);
    grid.position.y = box.min.y;

    this.viewport = {
      renderer,
      scene,
      camera,
      controls,
      mesh,
      wireframe: false,
    };
    this.loading.set(false);

    this.ifcStats.set({ schema: gd.schema, elementCount: gd.elementCount });
    this.stats.set([
      { label: "Elements", value: gd.elementCount.toLocaleString() },
      { label: "Triangles", value: gd.triangleCount.toLocaleString() },
      { label: "Schema", value: gd.schema },
    ]);

    this.layers.set(
      Object.entries(this.IFC_COLORS).map(([name, rgb]) => ({
        name: name.replace("Ifc", ""),
        color: `rgb(${rgb.map((v: number) => Math.round(v * 255)).join(",")})`,
        visible: true,
      })),
    );

    const animate = () => {
      this.animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    window.addEventListener("resize", () => {
      const W2 = this.wrap.nativeElement.clientWidth - 208;
      const H2 = this.wrap.nativeElement.clientHeight;
      camera.aspect = W2 / H2;
      camera.updateProjectionMatrix();
      renderer.setSize(W2, H2);
    });
  }

  onElementSelected(node: IfcNode) {
    // Highlight selected element in 3D scene
    console.log("Selected:", node.type, node.name);
  }

  onVisibilityChanged(event: { node: IfcNode; visible: boolean }) {
    // Toggle element type visibility in Three.js mesh
    console.log("Visibility changed:", event.node.type, event.visible);
  }

  resetCamera() {
    /* re-fit */
  }
  toggleWireframe() {
    if (!this.viewport) return;
    this.wireframe.update((w) => !w);
    this.viewport.mesh.material.wireframe = this.wireframe();
  }
  snapView(view: string) {
    /* set camera position */
  }
  toggleLayer(layer: any) {
    layer.visible = !layer.visible;
  }

  goBack() {
    this.router.navigate(["/"]);
  }
}
