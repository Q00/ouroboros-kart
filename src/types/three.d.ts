declare module "three" {
  export const DoubleSide: number;

  export interface VectorLike {
    x: number;
    y: number;
    z: number;
    set(x: number, y: number, z: number): void;
    setScalar(value: number): void;
  }

  export class Object3D {
    name: string;
    visible: boolean;
    renderOrder: number;
    readonly position: VectorLike;
    readonly rotation: VectorLike;
    readonly scale: VectorLike;
    readonly up: VectorLike;
    add(...objects: Object3D[]): void;
    remove(...objects: Object3D[]): void;
    traverse(callback: (object: Object3D) => void): void;
  }

  export class Scene extends Object3D {}

  export class Group extends Object3D {}

  export class OrthographicCamera extends Object3D {
    left: number;
    right: number;
    top: number;
    bottom: number;
    constructor(
      left: number,
      right: number,
      top: number,
      bottom: number,
      near: number,
      far: number
    );
    lookAt(x: number, y: number, z: number): void;
    updateProjectionMatrix(): void;
  }

  export class WebGLRenderer {
    constructor(options: {
      canvas: HTMLCanvasElement;
      antialias?: boolean;
      alpha?: boolean;
      powerPreference?: WebGLPowerPreference;
    });
    setClearColor(color: number, alpha?: number): void;
    setPixelRatio(pixelRatio: number): void;
    setSize(width: number, height: number, updateStyle?: boolean): void;
    render(scene: Scene, camera: OrthographicCamera): void;
    dispose(): void;
  }

  export class BufferGeometry {
    setAttribute(name: string, attribute: Float32BufferAttribute): this;
    setIndex(index: readonly number[]): this;
    computeVertexNormals(): void;
    rotateX(radians: number): this;
    scale(x: number, y: number, z: number): this;
    translate(x: number, y: number, z: number): this;
    dispose(): void;
  }

  export class PlaneGeometry extends BufferGeometry {
    constructor(width: number, height: number);
  }

  export class CircleGeometry extends BufferGeometry {
    constructor(radius: number, segments?: number);
  }

  export class RingGeometry extends BufferGeometry {
    constructor(innerRadius: number, outerRadius: number, thetaSegments?: number);
  }

  export class ShapeGeometry extends BufferGeometry {
    constructor(shape: Shape, curveSegments?: number);
  }

  export class Float32BufferAttribute {
    constructor(array: readonly number[] | Float32Array, itemSize: number);
  }

  export class Color {
    constructor(color?: string | number);
    set(color: string | number): this;
  }

  export class Texture {
    needsUpdate: boolean;
    dispose(): void;
  }

  export class CanvasTexture extends Texture {
    constructor(canvas: HTMLCanvasElement);
  }

  export class Material {
    opacity: number;
    transparent: boolean;
    depthWrite: boolean;
    needsUpdate: boolean;
    dispose(): void;
  }

  export class MeshBasicMaterial extends Material {
    readonly color: Color;
    constructor(parameters?: Record<string, unknown>);
  }

  export class SpriteMaterial extends Material {
    map: Texture | null;
    needsUpdate: boolean;
    constructor(parameters?: Record<string, unknown>);
  }

  export class Mesh extends Object3D {
    geometry: BufferGeometry;
    material: Material | readonly Material[];
    constructor(geometry: BufferGeometry, material: Material);
  }

  export class Sprite extends Object3D {
    material: SpriteMaterial;
    constructor(material: SpriteMaterial);
  }

  export class Line extends Object3D {
    geometry: BufferGeometry;
    material: Material | readonly Material[];
  }

  export class Shape {
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    quadraticCurveTo(aCPx: number, aCPy: number, aX: number, aY: number): void;
    closePath(): void;
  }
}
