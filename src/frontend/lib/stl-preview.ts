import { evaluateAutoQuoteDimensions } from "@/shared/modelGeometry";

export const MAX_AUTO_STL_PREVIEW_BYTES = 50 * 1024 * 1024;

export type StlDimensions = {
  x: number;
  y: number;
  z: number;
};

export type StlPreviewSource = {
  file?: File;
  url?: string;
  signal?: AbortSignal;
};

export type StlViewerHandle = {
  resetView: () => void;
  dispose: () => void;
};

type ThreeModule = typeof import("three");
type BufferGeometry = import("three").BufferGeometry;
type Material = import("three").Material;
type Mesh = import("three").Mesh;
type PerspectiveCamera = import("three").PerspectiveCamera;
type Scene = import("three").Scene;
type WebGLRenderer = import("three").WebGLRenderer;

type ThreeModules = {
  THREE: ThreeModule;
  STLLoader: typeof import("three/addons/loaders/STLLoader.js").STLLoader;
  OrbitControls: typeof import("three/addons/controls/OrbitControls.js").OrbitControls;
};

let modulesPromise: Promise<ThreeModules> | null = null;

export function isStlFilename(filename: string | null | undefined) {
  return filename?.toLowerCase().endsWith(".stl") || false;
}

export function shouldAutoLoadStlPreview(filename: string, filesize: number) {
  return isStlFilename(filename) && filesize > 0 && filesize <= MAX_AUTO_STL_PREVIEW_BYTES;
}

export async function loadStlGeometry(source: StlPreviewSource) {
  const { STLLoader } = await loadThreeModules();
  const buffer = await readSourceArrayBuffer(source);
  const geometry = new STLLoader().parse(buffer);

  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return geometry;
}

export function readStlDimensions(geometry: BufferGeometry): StlDimensions | null {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;

  if (!box) {
    return null;
  }

  const x = box.max.x - box.min.x;
  const y = box.max.y - box.min.y;
  const z = box.max.z - box.min.z;

  if (![x, y, z].every((value) => Number.isFinite(value) && value >= 0)) {
    return null;
  }

  return {
    x: roundDimension(x),
    y: roundDimension(y),
    z: roundDimension(z),
  };
}

export function formatStlDimensions(dimensions: StlDimensions | null | undefined) {
  if (!hasCompleteDimensions(dimensions)) {
    return "尺寸解析失败，请人工确认。";
  }

  return `${dimensions.x.toFixed(2)} × ${dimensions.y.toFixed(2)} × ${dimensions.z.toFixed(2)} mm`;
}

export function getStlDimensionNotice(dimensions: StlDimensions | null | undefined) {
  if (!hasCompleteDimensions(dimensions)) {
    return "";
  }

  const eligibility = evaluateAutoQuoteDimensions(dimensions);
  return eligibility.eligible ? "" : eligibility.message;
}

export async function renderStlThumbnail(canvas: HTMLCanvasElement, geometry: BufferGeometry) {
  const { THREE } = await loadThreeModules();
  const width = Math.max(120, Math.floor(canvas.clientWidth || 150));
  const height = Math.max(100, Math.floor(canvas.clientHeight || 116));
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "low-power",
  });
  const { scene, camera } = createModelScene(THREE, geometry, width, height);

  renderer.setPixelRatio(getSafePixelRatio());
  renderer.setSize(width, height, false);
  renderer.render(scene, camera);

  return () => {
    disposeScene(scene);
    disposeRenderer(renderer, false);
  };
}

export async function createStlViewer(
  container: HTMLElement,
  geometry: BufferGeometry,
): Promise<StlViewerHandle> {
  const { THREE, OrbitControls } = await loadThreeModules();
  const canvas = document.createElement("canvas");
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "low-power",
  });
  const { scene, camera, mesh } = createModelScene(THREE, geometry, 640, 480);
  const controls = new OrbitControls(camera, renderer.domElement);
  let animationFrame = 0;
  let disposed = false;

  container.innerHTML = "";
  canvas.className = "h-full w-full";
  container.append(canvas);
  renderer.setPixelRatio(getSafePixelRatio());

  controls.enableDamping = true;
  controls.enablePan = true;
  controls.enableZoom = true;
  controls.target.set(0, 0, 0);
  controls.update();

  const resize = () => {
    const rect = container.getBoundingClientRect();
    const width = Math.max(240, Math.floor(rect.width || 640));
    const height = Math.max(260, Math.floor(rect.height || 480));

    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  };
  const tick = () => {
    if (disposed) {
      return;
    }

    controls.update();
    renderer.render(scene, camera);
    animationFrame = requestAnimationFrame(tick);
  };
  const resizeObserver = new ResizeObserver(resize);

  resizeObserver.observe(container);
  resize();
  tick();

  return {
    resetView() {
      resetCamera(THREE, camera, mesh.geometry);
      controls.target.set(0, 0, 0);
      controls.update();
      renderer.render(scene, camera);
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      controls.dispose();
      disposeScene(scene);
      disposeRenderer(renderer);
      canvas.remove();
    },
  };
}

async function loadThreeModules() {
  if (!modulesPromise) {
    modulesPromise = Promise.all([
      import("three"),
      import("three/addons/loaders/STLLoader.js"),
      import("three/addons/controls/OrbitControls.js"),
    ]).then(([THREE, { STLLoader }, { OrbitControls }]) => ({
      THREE,
      STLLoader,
      OrbitControls,
    }));
  }

  return modulesPromise;
}

async function readSourceArrayBuffer(source: StlPreviewSource) {
  if (source.file) {
    return source.file.arrayBuffer();
  }

  if (!source.url) {
    throw new Error("STL source missing");
  }

  const response = await fetch(source.url, {
    credentials: "same-origin",
    signal: source.signal,
  });

  if (!response.ok) {
    throw new Error(`STL fetch failed: ${response.status}`);
  }

  return response.arrayBuffer();
}

function createModelScene(
  THREE: ThreeModule,
  sourceGeometry: BufferGeometry,
  width: number,
  height: number,
) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf8fafc);
  const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100000);
  const geometry = sourceGeometry.clone();
  const material = new THREE.MeshStandardMaterial({
    color: 0x2563eb,
    roughness: 0.64,
    metalness: 0.04,
  });
  const mesh = new THREE.Mesh(geometry, material);
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.45);
  const fillLight = new THREE.DirectionalLight(0xffffff, 0.7);
  const rimLight = new THREE.DirectionalLight(0xdbeafe, 0.45);
  const ambient = new THREE.AmbientLight(0xffffff, 0.92);

  centerGeometry(THREE, geometry);
  keyLight.position.set(2.5, 3, 4);
  fillLight.position.set(-3, -2, 2);
  rimLight.position.set(-2, 3, -3);
  scene.add(ambient, keyLight, fillLight, rimLight, mesh);
  resetCamera(THREE, camera, geometry);

  return { scene, camera, mesh };
}

function centerGeometry(THREE: ThreeModule, geometry: BufferGeometry) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;

  if (!box) {
    return;
  }

  const center = new THREE.Vector3();
  box.getCenter(center);
  geometry.translate(-center.x, -center.y, -center.z);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}

function resetCamera(THREE: ThreeModule, camera: PerspectiveCamera, geometry: BufferGeometry) {
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();

  const radius = Math.max(geometry.boundingSphere?.radius || 1, 1);
  const direction = new THREE.Vector3(1, 1, 0.7).normalize();
  const distance = Math.max(radius * 3, 80);

  camera.position.copy(direction.multiplyScalar(distance));
  camera.near = Math.max(distance / 1000, 0.1);
  camera.far = distance * 1000;
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
}

function disposeScene(scene: Scene) {
  scene.traverse((object) => {
    const maybeMesh = object as Mesh;
    if (maybeMesh.isMesh) {
      disposeMesh(maybeMesh);
    }
  });
  scene.clear();
}

function disposeMesh(mesh: Mesh) {
  mesh.geometry?.dispose();
  disposeMaterial(mesh.material);
}

function disposeMaterial(material: Material | Material[]) {
  if (Array.isArray(material)) {
    for (const item of material) {
      item.dispose();
    }
    return;
  }

  material.dispose();
}

function disposeRenderer(renderer: WebGLRenderer, forceContextLoss = true) {
  renderer.dispose();
  if (forceContextLoss) {
    renderer.forceContextLoss();
  }
}

function hasCompleteDimensions(
  dimensions: StlDimensions | null | undefined,
): dimensions is StlDimensions {
  return [dimensions?.x, dimensions?.y, dimensions?.z].every(
    (value) => typeof value === "number" && Number.isFinite(value) && value >= 0,
  );
}

function roundDimension(value: number) {
  return Math.round(value * 100) / 100;
}

function getSafePixelRatio() {
  return Math.min(window.devicePixelRatio || 1, 2);
}
