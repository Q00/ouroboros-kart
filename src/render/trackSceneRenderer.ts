import * as THREE from "three";
import type { Vector3 } from "../config/aiRacers";
import type {
  TrackBounds,
  TrackRoadGeometry,
  TrackStartGridSlot
} from "../config/tracks";
import { createTrackViewport } from "./trackViewport";

export interface TrackSceneRendererOptions {
  readonly canvas: HTMLCanvasElement;
  readonly road: TrackRoadGeometry;
  readonly bounds: TrackBounds;
  readonly startGrid?: readonly TrackStartGridSlot[];
}

export type TrackSceneRacerRole = "local-human" | "remote-human" | "ai";
export type TrackSceneRacerHitItemType = "shell" | "banana";

export interface TrackSceneRacerEffectRenderState {
  readonly boostSeconds: number;
  readonly shieldSeconds: number;
  readonly stunSeconds: number;
  readonly spinoutSeconds: number;
  readonly spinoutAngularVelocity: number;
  readonly spinoutRotationRadians: number;
  readonly itemHitImmunitySeconds: number;
  readonly hitFeedbackSeconds: number;
  readonly lastHitItemType: TrackSceneRacerHitItemType | null;
  readonly recovering: boolean;
}

export interface TrackSceneRacerRenderState {
  readonly racerId: string;
  readonly slotIndex: number;
  readonly role: TrackSceneRacerRole;
  readonly displayName: string;
  readonly color: string;
  readonly accentColor: string;
  readonly position: Vector3;
  readonly headingRadians: number;
  readonly speed: number;
  readonly boostActive: boolean;
  readonly heldItem: string | null;
  readonly indicatorLabel: string | null;
  readonly racingNumber: number | null;
  readonly effectState: TrackSceneRacerEffectRenderState;
}

export interface TrackSceneBananaHazardRenderState {
  readonly id: string;
  readonly active: boolean;
  readonly position: Vector3;
  readonly stablePosition: Vector3;
  readonly radius: number;
  readonly orientationRadians: number;
}

export interface TrackSceneVisibleBananaHazardRenderState {
  readonly id: string;
  readonly position: Vector3;
  readonly radius: number;
  readonly orientationRadians: number;
}

const CAMERA_HEIGHT = 120;
const TERRAIN_PADDING = 18;
const TERRAIN_Y = -0.06;
const OFF_ROAD_Y = -0.025;
const OFF_ROAD_DETAIL_Y = -0.015;
const ROAD_Y = 0;
const ROAD_MARKING_Y = 0.035;
const EDGE_LINE_Y = 0.045;
const START_GRID_FILL_Y = 0.048;
const CURB_Y = 0.06;
const START_GRID_LINE_Y = 0.064;
const START_GRID_FRONT_BAR_Y = 0.067;
const BARRIER_Y = 0.075;
const START_LINE_Y = 0.055;
const START_LINE_DEPTH = 1.65;
const START_LINE_COLUMNS = 10;
const START_LINE_ROWS = 2;
const START_GRID_SLOT_LENGTH = 3.25;
const START_GRID_SLOT_WIDTH_FACTOR = 0.28;
const START_GRID_SLOT_MAX_WIDTH = 4.35;
const START_GRID_SLOT_OUTLINE_WIDTH = 0.16;
const START_GRID_FRONT_BAR_DEPTH = 0.34;
const OFF_ROAD_DETAIL_SPACING = 6.5;
const OFF_ROAD_DETAIL_WIDTH = 0.08;
const OFF_ROAD_EDGE_INSET = 0.42;
const CURB_EDGE_OFFSET = 0.32;
const CURB_WIDTH = 0.86;
const CURB_BLOCK_LENGTH = 2.35;
const BARRIER_SHOULDER_GAP = 0.18;
const BARRIER_WIDTH = 0.95;
const BARRIER_ACCENT_WIDTH = 0.16;
const RACER_RENDER_Y = 0.42;
const RACER_SHADOW_Y = 0.16;
const RACER_RING_Y = 0.18;
const RACER_BODY_WIDTH = 1.7;
const RACER_BODY_LENGTH = 2.55;
const RACER_ACCENT_WIDTH = 0.38;
const RACER_ACCENT_LENGTH = 1.72;
const RACER_WINDSCREEN_WIDTH = 0.82;
const RACER_WINDSCREEN_LENGTH = 0.42;
const RACER_ROLE_RING_RADIUS = 1.75;
const RACER_ROLE_RING_THICKNESS = 0.11;
const RACER_ARROW_WIDTH = 0.84;
const RACER_ARROW_LENGTH = 0.7;
const RACER_LABEL_Y = 2.4;
const RACER_LABEL_OFFSET_Z = -2.35;
const RACER_LABEL_WIDTH = 5.9;
const RACER_LABEL_HEIGHT = 1.45;
const RACER_LABEL_TEXTURE_WIDTH = 256;
const RACER_LABEL_TEXTURE_HEIGHT = 96;
const RACER_MIN_BOOST_SCALE = 1;
const RACER_MAX_BOOST_SCALE = 1.11;
const RACER_BOOST_RING_Y = 0.27;
const RACER_BOOST_RING_RADIUS = 2.12;
const RACER_BOOST_RING_THICKNESS = 0.13;
const RACER_BOOST_WAKE_Y = 0.24;
const RACER_BOOST_WAKE_WIDTH = 2.35;
const RACER_BOOST_WAKE_LENGTH = 3.45;
const RACER_BOOST_WAKE_REAR_Z = RACER_BODY_LENGTH / 2 + 0.1;
const RACER_BOOST_FLAME_Y = 0.48;
const RACER_BOOST_FLAME_REAR_Z = RACER_BODY_LENGTH / 2 + 0.14;
const RACER_BOOST_FLAME_LATERAL_OFFSET = 0.46;
const RACER_SHIELD_RING_Y = 0.31;
const RACER_SHIELD_RING_RADIUS = 2.56;
const RACER_SHIELD_RING_THICKNESS = 0.12;
const RACER_IMMUNITY_RING_Y = 0.3;
const RACER_IMMUNITY_RING_RADIUS = 2.38;
const RACER_IMMUNITY_RING_THICKNESS = 0.08;
const RACER_HIT_FEEDBACK_RING_Y = 0.32;
const RACER_HIT_FEEDBACK_RING_RADIUS = 2.28;
const RACER_HIT_FEEDBACK_RING_THICKNESS = 0.16;
const RACER_SHELL_HIT_RING_Y = 0.34;
const RACER_SHELL_HIT_RING_RADIUS = 2.66;
const RACER_SHELL_HIT_RING_THICKNESS = 0.12;
const RACER_SHELL_HIT_SPARK_Y = 0.82;
const RACER_SHELL_HIT_SPARK_COUNT = 6;
const RACER_SHELL_HIT_SPARK_ORBIT_RADIUS = 2.52;
const RACER_SPINOUT_RING_Y = 0.28;
const RACER_SPINOUT_RING_RADIUS = 2.18;
const RACER_SPINOUT_RING_THICKNESS = 0.14;
const RACER_SPINOUT_SPARK_Y = 0.7;
const RACER_SPINOUT_SPARK_COUNT = 5;
const RACER_SPINOUT_SPARK_ORBIT_RADIUS = 2.18;
const RACER_SPINOUT_MAX_TILT_RADIANS = 0.16;
const RACER_SPINOUT_MAX_LIFT = 0.18;
const RACER_BANANA_SLIP_RING_Y = 0.33;
const RACER_BANANA_SLIP_RING_RADIUS = 2.44;
const RACER_BANANA_SLIP_RING_THICKNESS = 0.1;
const RACER_BANANA_SLIP_SKID_Y = 0.2;
const RACER_BANANA_SLIP_SKID_WIDTH = 0.2;
const RACER_BANANA_SLIP_SKID_LENGTH = 1.32;
const RACER_BANANA_SLIP_SKID_LATERAL_OFFSET = 0.54;
const RACER_BANANA_SLIP_SKID_REAR_Z = RACER_BODY_LENGTH / 2 + 0.42;
const RACER_BANANA_SLIP_MAX_LATERAL_OFFSET = 0.24;
const BANANA_HAZARD_SHADOW_Y = 0.12;
const BANANA_HAZARD_RING_Y = 0.17;
const BANANA_HAZARD_RENDER_Y = 0.3;
const BANANA_HAZARD_STEM_Y = 0.33;
const BANANA_HAZARD_REFERENCE_RADIUS = 0.78;
const BANANA_HAZARD_MIN_SCALE = 0.64;
const BANANA_HAZARD_MAX_SCALE = 1.55;
const BANANA_HAZARD_RING_RADIUS = 1.04;
const BANANA_HAZARD_RING_THICKNESS = 0.08;

interface TrackSceneRacerObject {
  readonly group: THREE.Group;
  readonly bodyGroup: THREE.Group;
  readonly body: THREE.Mesh;
  readonly accent: THREE.Mesh;
  readonly windscreen: THREE.Mesh;
  readonly roleRing: THREE.Mesh;
  readonly roleArrow: THREE.Mesh;
  readonly boostRing: THREE.Mesh;
  readonly boostWake: THREE.Mesh;
  readonly boostFlames: readonly THREE.Mesh[];
  readonly shieldRing: THREE.Mesh;
  readonly immunityRing: THREE.Mesh;
  readonly hitFeedbackRing: THREE.Mesh;
  readonly shellHitRing: THREE.Mesh;
  readonly shellHitSparks: readonly THREE.Mesh[];
  readonly spinoutRing: THREE.Mesh;
  readonly spinoutSparks: readonly THREE.Mesh[];
  readonly bananaSlipRing: THREE.Mesh;
  readonly bananaSlipSkids: readonly THREE.Mesh[];
  readonly label: THREE.Sprite;
  labelTexture: THREE.CanvasTexture;
  labelKey: string;
}

interface TrackSceneBananaHazardObject {
  readonly group: THREE.Group;
}

export interface TrackSceneRacerSpinoutReactionFrame {
  readonly active: boolean;
  readonly bodyRotationRadians: number;
  readonly bodyLift: number;
  readonly bodyScale: number;
  readonly bodyTiltX: number;
  readonly bodyTiltZ: number;
  readonly ringScale: number;
  readonly ringOpacity: number;
  readonly sparkScale: number;
  readonly sparkRotationRadians: number;
}

export interface TrackSceneRacerBananaSlipVisualFrame {
  readonly active: boolean;
  readonly color: string;
  readonly intensity: number;
  readonly bodyLateralOffset: number;
  readonly ringOpacity: number;
  readonly ringScale: number;
  readonly ringRotationRadians: number;
  readonly skidOpacity: number;
  readonly skidScale: number;
  readonly skidSpread: number;
  readonly skidRotationRadians: number;
}

export interface TrackSceneRacerBoostVisualFrame {
  readonly active: boolean;
  readonly color: string;
  readonly intensity: number;
  readonly ringOpacity: number;
  readonly ringScale: number;
  readonly wakeOpacity: number;
  readonly wakeScale: number;
  readonly flameOpacity: number;
  readonly flameScale: number;
}

export interface TrackSceneRacerSharedEffectFrame {
  readonly boostActive: boolean;
  readonly boostVisual: TrackSceneRacerBoostVisualFrame;
  readonly shieldActive: boolean;
  readonly shieldOpacity: number;
  readonly shieldScale: number;
  readonly immunityActive: boolean;
  readonly immunityOpacity: number;
  readonly immunityScale: number;
  readonly hitFeedbackActive: boolean;
  readonly hitFeedbackOpacity: number;
  readonly hitFeedbackScale: number;
  readonly hitFeedbackColor: string;
  readonly bodyLift: number;
  readonly bodyScale: number;
}

export interface TrackSceneRacerShellHitVisualFrame {
  readonly active: boolean;
  readonly color: string;
  readonly intensity: number;
  readonly bodyLift: number;
  readonly bodyScale: number;
  readonly ringOpacity: number;
  readonly ringScale: number;
  readonly sparkOpacity: number;
  readonly sparkScale: number;
  readonly sparkRotationRadians: number;
}

const INACTIVE_SPINOUT_REACTION_FRAME: TrackSceneRacerSpinoutReactionFrame = {
  active: false,
  bodyRotationRadians: 0,
  bodyLift: 0,
  bodyScale: 1,
  bodyTiltX: 0,
  bodyTiltZ: 0,
  ringScale: 1,
  ringOpacity: 0,
  sparkScale: 0,
  sparkRotationRadians: 0
};

const INACTIVE_BANANA_SLIP_VISUAL_FRAME: TrackSceneRacerBananaSlipVisualFrame = {
  active: false,
  color: "#ffd166",
  intensity: 0,
  bodyLateralOffset: 0,
  ringOpacity: 0,
  ringScale: 1,
  ringRotationRadians: 0,
  skidOpacity: 0,
  skidScale: 0,
  skidSpread: 0,
  skidRotationRadians: 0
};

const INACTIVE_SHELL_HIT_VISUAL_FRAME: TrackSceneRacerShellHitVisualFrame = {
  active: false,
  color: "#7cf8a5",
  intensity: 0,
  bodyLift: 0,
  bodyScale: 1,
  ringOpacity: 0,
  ringScale: 1,
  sparkOpacity: 0,
  sparkScale: 0,
  sparkRotationRadians: 0
};

export class TrackSceneRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 250);
  private readonly bananaHazardLayer = new THREE.Group();
  private readonly racerLayer = new THREE.Group();
  private readonly racerObjects = new Map<string, TrackSceneRacerObject>();
  private readonly bananaHazardObjects =
    new Map<string, TrackSceneBananaHazardObject>();

  public constructor(private readonly options: TrackSceneRendererOptions) {
    this.renderer = new THREE.WebGLRenderer({
      canvas: options.canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance"
    });
    this.renderer.setClearColor(0x101418, 1);
    this.scene.add(createTerrainMesh(options.bounds));
    this.scene.add(createOffRoadTerrainGroup(options.road));
    this.scene.add(createRoadSurfaceMesh(options.road));
    this.scene.add(createEdgeLineMesh(options.road.leftBoundary));
    this.scene.add(createEdgeLineMesh(options.road.rightBoundary));
    this.scene.add(createTrackBoundaryGroup(options.road));
    this.scene.add(createCenterDashMesh(options.road));
    this.scene.add(
      createStartGridGroup(options.road, options.startGrid ?? [])
    );
    this.scene.add(createStartFinishLineMesh(options.road));
    this.scene.add(this.bananaHazardLayer);
    this.scene.add(this.racerLayer);
  }

  public updateBananaHazards(
    hazards: readonly TrackSceneBananaHazardRenderState[]
  ): void {
    const visibleHazards = createVisibleBananaHazardRenderStates(hazards);
    const visibleHazardIds = new Set<string>();

    for (const hazard of visibleHazards) {
      visibleHazardIds.add(hazard.id);
      this.updateBananaHazardObject(hazard);
    }

    for (const [hazardId, hazardObject] of this.bananaHazardObjects) {
      if (visibleHazardIds.has(hazardId)) {
        continue;
      }

      this.bananaHazardLayer.remove(hazardObject.group);
      disposeObjectTree(hazardObject.group);
      this.bananaHazardObjects.delete(hazardId);
    }
  }

  public updateRacers(racers: readonly TrackSceneRacerRenderState[]): void {
    const visibleRacerIds = new Set<string>();
    const orderedRacers = [...racers].sort(
      (left, right) => left.slotIndex - right.slotIndex
    );

    for (const racer of orderedRacers) {
      visibleRacerIds.add(racer.racerId);
      this.updateRacerObject(racer);
    }

    for (const [racerId, racerObject] of this.racerObjects) {
      if (visibleRacerIds.has(racerId)) {
        continue;
      }

      this.racerLayer.remove(racerObject.group);
      disposeObjectTree(racerObject.group);
      this.racerObjects.delete(racerId);
    }
  }

  public render(
    width: number,
    height: number,
    pixelRatio: number,
    fovMultiplier = 1
  ): void {
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.configureCamera(width, height, fovMultiplier);
    this.renderer.render(this.scene, this.camera);
  }

  public dispose(): void {
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
        object.geometry.dispose();
        disposeMaterial(object.material);
      } else if (object instanceof THREE.Sprite) {
        disposeMaterial(object.material);
      }
    });
    this.renderer.dispose();
  }

  private updateRacerObject(racer: TrackSceneRacerRenderState): void {
    const racerObject =
      this.racerObjects.get(racer.racerId) ?? this.createRacerObject(racer);
    const spinoutFrame = createTrackSceneRacerSpinoutReactionFrame(racer);
    const bananaSlipFrame = createTrackSceneRacerBananaSlipVisualFrame(racer);
    const shellHitFrame = createTrackSceneRacerShellHitVisualFrame(racer);

    racerObject.group.position.set(
      racer.position.x,
      Number.isFinite(racer.position.y) ? racer.position.y : 0,
      racer.position.z
    );
    racerObject.group.rotation.y = Number.isFinite(racer.headingRadians)
      ? racer.headingRadians
      : 0;
    const sharedEffectFrame = createTrackSceneRacerSharedEffectFrame(racer);
    racerObject.group.scale.setScalar(
      sharedEffectFrame.boostActive ? RACER_MAX_BOOST_SCALE : RACER_MIN_BOOST_SCALE
    );
    racerObject.group.renderOrder = 100 + racer.slotIndex;
    racerObject.bodyGroup.position.set(
      bananaSlipFrame.bodyLateralOffset,
      Math.max(
        spinoutFrame.bodyLift,
        sharedEffectFrame.bodyLift,
        shellHitFrame.bodyLift
      ),
      0
    );
    racerObject.bodyGroup.rotation.set(
      spinoutFrame.bodyTiltX,
      spinoutFrame.bodyRotationRadians,
      spinoutFrame.bodyTiltZ
    );
    racerObject.bodyGroup.scale.setScalar(
      Math.max(
        spinoutFrame.active ? spinoutFrame.bodyScale : sharedEffectFrame.bodyScale,
        shellHitFrame.bodyScale
      )
    );

    setMeshColor(racerObject.body, racer.color);
    setMeshColor(racerObject.accent, racer.accentColor);
    setMeshColor(racerObject.roleRing, getRacerRoleColor(racer));
    setMeshColor(racerObject.roleArrow, getRacerRoleColor(racer));
    setMeshColor(
      racerObject.windscreen,
      racer.role === "remote-human" ? "#9ad7ff" : "#dfe6ee"
    );
    updateRacerRoleArrow(racerObject.roleArrow, racer);
    updateRacerSharedEffectReaction(racerObject, sharedEffectFrame);
    updateRacerShellHitReaction(racerObject, shellHitFrame);
    updateRacerBananaSlipReaction(racerObject, bananaSlipFrame);
    updateRacerSpinoutReaction(racerObject, racer, spinoutFrame);
    updateRacerLabel(racerObject, racer);
  }

  private createRacerObject(
    racer: TrackSceneRacerRenderState
  ): TrackSceneRacerObject {
    const group = new THREE.Group();
    const bodyGroup = new THREE.Group();
    const shadow = new THREE.Mesh(
      createRacerOvalGeometry(1.38, 0.82, RACER_SHADOW_Y),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        opacity: 0.28,
        transparent: true,
        side: THREE.DoubleSide
      })
    );
    const roleRing = new THREE.Mesh(
      createRacerRingGeometry(
        RACER_ROLE_RING_RADIUS,
        RACER_ROLE_RING_THICKNESS,
        RACER_RING_Y
      ),
      new THREE.MeshBasicMaterial({
        color: getRacerRoleColor(racer),
        opacity: 0.86,
        transparent: true,
        side: THREE.DoubleSide
      })
    );
    const spinoutRing = new THREE.Mesh(
      createRacerRingGeometry(
        RACER_SPINOUT_RING_RADIUS,
        RACER_SPINOUT_RING_THICKNESS,
        RACER_SPINOUT_RING_Y
      ),
      new THREE.MeshBasicMaterial({
        color: 0xff8bd1,
        opacity: 0,
        transparent: true,
        side: THREE.DoubleSide
      })
    );
    const shieldRing = new THREE.Mesh(
      createRacerRingGeometry(
        RACER_SHIELD_RING_RADIUS,
        RACER_SHIELD_RING_THICKNESS,
        RACER_SHIELD_RING_Y
      ),
      new THREE.MeshBasicMaterial({
        color: 0x74f7ff,
        opacity: 0,
        transparent: true,
        side: THREE.DoubleSide
      })
    );
    const boostRing = new THREE.Mesh(
      createRacerRingGeometry(
        RACER_BOOST_RING_RADIUS,
        RACER_BOOST_RING_THICKNESS,
        RACER_BOOST_RING_Y
      ),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(racer.accentColor),
        opacity: 0,
        transparent: true,
        side: THREE.DoubleSide
      })
    );
    const boostWake = new THREE.Mesh(
      createRacerBoostWakeGeometry(
        RACER_BOOST_WAKE_WIDTH,
        RACER_BOOST_WAKE_LENGTH,
        RACER_BOOST_WAKE_Y
      ),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(racer.accentColor),
        opacity: 0,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    const boostFlames = createRacerBoostFlameMeshes();
    const immunityRing = new THREE.Mesh(
      createRacerRingGeometry(
        RACER_IMMUNITY_RING_RADIUS,
        RACER_IMMUNITY_RING_THICKNESS,
        RACER_IMMUNITY_RING_Y
      ),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        opacity: 0,
        transparent: true,
        side: THREE.DoubleSide
      })
    );
    const hitFeedbackRing = new THREE.Mesh(
      createRacerRingGeometry(
        RACER_HIT_FEEDBACK_RING_RADIUS,
        RACER_HIT_FEEDBACK_RING_THICKNESS,
        RACER_HIT_FEEDBACK_RING_Y
      ),
      new THREE.MeshBasicMaterial({
        color: 0xff8bd1,
        opacity: 0,
        transparent: true,
        side: THREE.DoubleSide
      })
    );
    const shellHitRing = new THREE.Mesh(
      createRacerRingGeometry(
        RACER_SHELL_HIT_RING_RADIUS,
        RACER_SHELL_HIT_RING_THICKNESS,
        RACER_SHELL_HIT_RING_Y
      ),
      new THREE.MeshBasicMaterial({
        color: 0x7cf8a5,
        opacity: 0,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    const shellHitSparks = createRacerShellHitSparkMeshes();
    const spinoutSparks = createRacerSpinoutSparkMeshes();
    const bananaSlipRing = new THREE.Mesh(
      createRacerRingGeometry(
        RACER_BANANA_SLIP_RING_RADIUS,
        RACER_BANANA_SLIP_RING_THICKNESS,
        RACER_BANANA_SLIP_RING_Y
      ),
      new THREE.MeshBasicMaterial({
        color: 0xffd166,
        opacity: 0,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    const bananaSlipSkids = createRacerBananaSlipSkidMeshes();
    const body = new THREE.Mesh(
      createRacerPlaneGeometry(RACER_BODY_WIDTH, RACER_BODY_LENGTH, RACER_RENDER_Y),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(racer.color),
        side: THREE.DoubleSide
      })
    );
    const accent = new THREE.Mesh(
      createRacerPlaneGeometry(
        RACER_ACCENT_WIDTH,
        RACER_ACCENT_LENGTH,
        RACER_RENDER_Y + 0.02
      ),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(racer.accentColor),
        side: THREE.DoubleSide
      })
    );
    const windscreen = new THREE.Mesh(
      createRacerPlaneGeometry(
        RACER_WINDSCREEN_WIDTH,
        RACER_WINDSCREEN_LENGTH,
        RACER_RENDER_Y + 0.04
      ),
      new THREE.MeshBasicMaterial({
        color: 0xdfe6ee,
        side: THREE.DoubleSide
      })
    );
    const roleArrow = new THREE.Mesh(
      createRacerArrowGeometry(RACER_ARROW_WIDTH, RACER_ARROW_LENGTH, RACER_RENDER_Y + 0.06),
      new THREE.MeshBasicMaterial({
        color: getRacerRoleColor(racer),
        side: THREE.DoubleSide
      })
    );
    const labelTexture = createRacerLabelTexture(racer);
    const label = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: labelTexture,
        transparent: true,
        depthTest: false
      })
    );
    const racerObject: TrackSceneRacerObject = {
      group,
      bodyGroup,
      body,
      accent,
      windscreen,
      roleRing,
      roleArrow,
      boostRing,
      boostWake,
      boostFlames,
      shieldRing,
      immunityRing,
      hitFeedbackRing,
      shellHitRing,
      shellHitSparks,
      spinoutRing,
      spinoutSparks,
      bananaSlipRing,
      bananaSlipSkids,
      label,
      labelTexture,
      labelKey: getRacerLabelKey(racer)
    };

    windscreen.position.z = -0.58;
    label.position.set(0, RACER_LABEL_Y, RACER_LABEL_OFFSET_Z);
    label.scale.set(RACER_LABEL_WIDTH, RACER_LABEL_HEIGHT, 1);
    label.renderOrder = 220 + racer.slotIndex;

    group.name = `racer:${racer.racerId}`;
    bodyGroup.add(body, accent, windscreen, roleArrow);
    group.add(
      shadow,
      boostWake,
      boostRing,
      ...boostFlames,
      roleRing,
      shieldRing,
      immunityRing,
      hitFeedbackRing,
      shellHitRing,
      bananaSlipRing,
      ...bananaSlipSkids,
      spinoutRing,
      ...shellHitSparks,
      ...spinoutSparks,
      bodyGroup,
      label
    );
    updateRacerRoleArrow(roleArrow, racer);
    updateRacerSharedEffectReaction(
      racerObject,
      createTrackSceneRacerSharedEffectFrame(racer)
    );
    updateRacerShellHitReaction(
      racerObject,
      createTrackSceneRacerShellHitVisualFrame(racer)
    );
    updateRacerBananaSlipReaction(
      racerObject,
      createTrackSceneRacerBananaSlipVisualFrame(racer)
    );
    updateRacerSpinoutReaction(
      racerObject,
      racer,
      createTrackSceneRacerSpinoutReactionFrame(racer)
    );
    this.racerLayer.add(group);
    this.racerObjects.set(racer.racerId, racerObject);

    return racerObject;
  }

  private updateBananaHazardObject(
    hazard: TrackSceneVisibleBananaHazardRenderState
  ): void {
    const hazardObject =
      this.bananaHazardObjects.get(hazard.id) ??
      this.createBananaHazardObject(hazard);
    const scale = clampNumber(
      hazard.radius / BANANA_HAZARD_REFERENCE_RADIUS,
      BANANA_HAZARD_MIN_SCALE,
      BANANA_HAZARD_MAX_SCALE
    );

    hazardObject.group.position.set(
      hazard.position.x,
      Number.isFinite(hazard.position.y) ? hazard.position.y : 0,
      hazard.position.z
    );
    hazardObject.group.rotation.y = hazard.orientationRadians;
    hazardObject.group.scale.setScalar(scale);
    hazardObject.group.renderOrder = 80;
  }

  private createBananaHazardObject(
    hazard: TrackSceneVisibleBananaHazardRenderState
  ): TrackSceneBananaHazardObject {
    const group = new THREE.Group();
    const shadow = new THREE.Mesh(
      createRacerOvalGeometry(0.95, 0.64, BANANA_HAZARD_SHADOW_Y),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        opacity: 0.32,
        transparent: true,
        side: THREE.DoubleSide
      })
    );
    const ring = new THREE.Mesh(
      createRacerRingGeometry(
        BANANA_HAZARD_RING_RADIUS,
        BANANA_HAZARD_RING_THICKNESS,
        BANANA_HAZARD_RING_Y
      ),
      new THREE.MeshBasicMaterial({
        color: 0xffd166,
        opacity: 0.82,
        transparent: true,
        side: THREE.DoubleSide
      })
    );
    const body = new THREE.Mesh(
      createBananaHazardBodyGeometry(BANANA_HAZARD_RENDER_Y),
      new THREE.MeshBasicMaterial({
        color: 0xffd23f,
        side: THREE.DoubleSide
      })
    );
    const stem = new THREE.Mesh(
      createRacerPlaneGeometry(0.24, 0.18, BANANA_HAZARD_STEM_Y),
      new THREE.MeshBasicMaterial({
        color: 0x73501c,
        side: THREE.DoubleSide
      })
    );

    stem.position.set(0.76, 0, -0.08);
    group.name = `banana-hazard:${hazard.id}`;
    group.add(shadow, ring, body, stem);
    this.bananaHazardLayer.add(group);
    const hazardObject = { group };

    this.bananaHazardObjects.set(hazard.id, hazardObject);

    return hazardObject;
  }

  private configureCamera(
    width: number,
    height: number,
    fovMultiplier: number
  ): void {
    const viewport = createTrackViewport(this.options.bounds, width, height, {
      fovMultiplier
    });
    const visibleWidth = width / viewport.scale;
    const visibleHeight = height / viewport.scale;

    this.camera.left = -visibleWidth / 2;
    this.camera.right = visibleWidth / 2;
    this.camera.top = visibleHeight / 2;
    this.camera.bottom = -visibleHeight / 2;
    this.camera.position.set(viewport.centerX, CAMERA_HEIGHT, viewport.centerZ);
    this.camera.up.set(0, 0, 1);
    this.camera.lookAt(viewport.centerX, 0, viewport.centerZ);
    this.camera.updateProjectionMatrix();
  }
}

export function createVisibleBananaHazardRenderStates(
  hazards: readonly TrackSceneBananaHazardRenderState[]
): readonly TrackSceneVisibleBananaHazardRenderState[] {
  const visibleHazards: TrackSceneVisibleBananaHazardRenderState[] = [];

  for (const hazard of hazards) {
    if (!hazard.active) {
      continue;
    }

    const position = getFiniteTrackPosition(hazard.stablePosition);

    if (position === null) {
      continue;
    }

    visibleHazards.push({
      id: hazard.id,
      position,
      radius: Math.max(0.001, getFiniteNumber(hazard.radius, 0.001)),
      orientationRadians: getFiniteNumber(hazard.orientationRadians, 0)
    });
  }

  return visibleHazards.sort((left, right) => left.id.localeCompare(right.id));
}

export function createTrackSceneRacerEffectRenderState(
  effectState: Partial<TrackSceneRacerEffectRenderState> = {}
): TrackSceneRacerEffectRenderState {
  const spinoutSeconds = getFiniteNonNegativeNumber(
    effectState.spinoutSeconds ?? 0
  );
  const stunSeconds = getFiniteNonNegativeNumber(effectState.stunSeconds ?? 0);
  const hitFeedbackSeconds = getFiniteNonNegativeNumber(
    effectState.hitFeedbackSeconds ?? 0
  );

  return {
    boostSeconds: getFiniteNonNegativeNumber(effectState.boostSeconds ?? 0),
    shieldSeconds: getFiniteNonNegativeNumber(effectState.shieldSeconds ?? 0),
    stunSeconds,
    spinoutSeconds,
    spinoutAngularVelocity: getFiniteNumber(
      effectState.spinoutAngularVelocity ?? 0,
      0
    ),
    spinoutRotationRadians: getFiniteNumber(
      effectState.spinoutRotationRadians ?? 0,
      0
    ),
    itemHitImmunitySeconds: getFiniteNonNegativeNumber(
      effectState.itemHitImmunitySeconds ?? 0
    ),
    hitFeedbackSeconds,
    lastHitItemType: normalizeTrackSceneHitItemType(
      effectState.lastHitItemType ?? null
    ),
    recovering:
      effectState.recovering === true ||
      stunSeconds > 0 ||
      spinoutSeconds > 0 ||
      hitFeedbackSeconds > 0
  };
}

export function createTrackSceneRacerSharedEffectFrame(
  racer: TrackSceneRacerRenderState
): TrackSceneRacerSharedEffectFrame {
  const effectState = createTrackSceneRacerEffectRenderState(racer.effectState);
  const boostVisual = createTrackSceneRacerBoostVisualFrame(racer);
  const boostActive = boostVisual.active;
  const shieldIntensity = clampNumber(effectState.shieldSeconds / 1.25, 0, 1);
  const immunityIntensity = clampNumber(
    effectState.itemHitImmunitySeconds / 1.15,
    0,
    1
  );
  const hitFeedbackIntensity = Math.max(
    clampNumber(effectState.hitFeedbackSeconds / 0.48, 0, 1),
    clampNumber(effectState.stunSeconds / 0.4, 0, 1)
  );
  const recoveryIntensity =
    effectState.recovering || effectState.spinoutSeconds > 0
      ? Math.max(hitFeedbackIntensity, 0.42)
      : hitFeedbackIntensity;

  return {
    boostActive,
    boostVisual,
    shieldActive: shieldIntensity > 0,
    shieldOpacity: 0.2 + shieldIntensity * 0.46,
    shieldScale: 1 + shieldIntensity * 0.14,
    immunityActive: immunityIntensity > 0,
    immunityOpacity: 0.12 + immunityIntensity * 0.24,
    immunityScale: 0.94 + immunityIntensity * 0.2,
    hitFeedbackActive: recoveryIntensity > 0,
    hitFeedbackOpacity: 0.16 + recoveryIntensity * 0.42,
    hitFeedbackScale: 0.88 + recoveryIntensity * 0.32,
    hitFeedbackColor: getRacerSharedEffectColor(racer, effectState),
    bodyLift: recoveryIntensity * 0.12,
    bodyScale: 1 + recoveryIntensity * 0.035
  };
}

export function createTrackSceneRacerBoostVisualFrame(
  racer: TrackSceneRacerRenderState
): TrackSceneRacerBoostVisualFrame {
  const effectState = createTrackSceneRacerEffectRenderState(racer.effectState);
  const active = racer.boostActive || effectState.boostSeconds > 0;
  const timerIntensity =
    effectState.boostSeconds > 0
      ? clampNumber(effectState.boostSeconds / 0.9, 0.44, 1)
      : 0;
  const speedIntensity = active ? clampNumber(racer.speed / 30, 0, 1) * 0.14 : 0;
  const explicitBoostIntensity = racer.boostActive ? 0.7 : 0;
  const intensity = active
    ? clampNumber(
        Math.max(timerIntensity, explicitBoostIntensity) + speedIntensity,
        0.48,
        1
      )
    : 0;

  return {
    active,
    color: racer.accentColor,
    intensity,
    ringOpacity: active ? 0.22 + intensity * 0.34 : 0,
    ringScale: active ? 0.94 + intensity * 0.18 : 1,
    wakeOpacity: active ? 0.16 + intensity * 0.28 : 0,
    wakeScale: active ? 0.82 + intensity * 0.42 : 1,
    flameOpacity: active ? 0.58 + intensity * 0.32 : 0,
    flameScale: active ? 0.86 + intensity * 0.38 : 0
  };
}

export function createTrackSceneRacerShellHitVisualFrame(
  racer: TrackSceneRacerRenderState
): TrackSceneRacerShellHitVisualFrame {
  const effectState = createTrackSceneRacerEffectRenderState(racer.effectState);

  if (!hasActiveShellHitEffect(effectState)) {
    return INACTIVE_SHELL_HIT_VISUAL_FRAME;
  }

  const feedbackIntensity = clampNumber(
    effectState.hitFeedbackSeconds / 0.48,
    0,
    1
  );
  const stunIntensity = clampNumber(effectState.stunSeconds / 0.4, 0, 1);
  const spinoutIntensity =
    effectState.spinoutSeconds > 0
      ? clampNumber(effectState.spinoutSeconds / 1.25, 0.38, 1)
      : 0;
  const recoveryIntensity = effectState.recovering ? 0.36 : 0;
  const intensity = clampNumber(
    Math.max(
      feedbackIntensity,
      stunIntensity,
      spinoutIntensity,
      recoveryIntensity
    ),
    0.32,
    1
  );
  const spinSeed =
    Math.abs(effectState.spinoutRotationRadians) +
    effectState.spinoutSeconds * 4.7 +
    racer.slotIndex * 0.73;
  const pulse = 0.5 + Math.sin(spinSeed * 2.6) * 0.5;

  return {
    active: true,
    color: "#7cf8a5",
    intensity,
    bodyLift: 0.035 + intensity * 0.075,
    bodyScale: 1 + intensity * 0.045,
    ringOpacity: 0.26 + intensity * 0.46,
    ringScale: 0.9 + intensity * 0.24 + pulse * 0.1,
    sparkOpacity: 0.42 + intensity * 0.42,
    sparkScale: 0.58 + intensity * 0.36 + pulse * 0.16,
    sparkRotationRadians:
      effectState.spinoutRotationRadians + effectState.spinoutSeconds * 5.1
  };
}

export function createTrackSceneRacerBananaSlipVisualFrame(
  racer: TrackSceneRacerRenderState
): TrackSceneRacerBananaSlipVisualFrame {
  const effectState = createTrackSceneRacerEffectRenderState(racer.effectState);

  if (!hasActiveBananaSlipEffect(effectState)) {
    return INACTIVE_BANANA_SLIP_VISUAL_FRAME;
  }

  const feedbackIntensity = clampNumber(
    effectState.hitFeedbackSeconds / 0.48,
    0,
    1
  );
  const stunIntensity = clampNumber(effectState.stunSeconds / 0.4, 0, 1);
  const spinoutIntensity =
    effectState.spinoutSeconds > 0
      ? clampNumber(effectState.spinoutSeconds / 1.1, 0.36, 1)
      : 0;
  const recoveryIntensity = effectState.recovering ? 0.34 : 0;
  const intensity = clampNumber(
    Math.max(
      feedbackIntensity,
      stunIntensity,
      spinoutIntensity,
      recoveryIntensity
    ),
    0.3,
    1
  );
  const slipPhase =
    effectState.spinoutRotationRadians * 1.7 +
    effectState.spinoutSeconds * 8.2 +
    racer.slotIndex * 0.83;
  const slipWave = Math.sin(slipPhase);
  const pulse = 0.5 + Math.cos(slipPhase * 1.4) * 0.5;

  return {
    active: true,
    color: "#ffd166",
    intensity,
    bodyLateralOffset:
      slipWave * RACER_BANANA_SLIP_MAX_LATERAL_OFFSET * intensity,
    ringOpacity: 0.24 + intensity * 0.34 + pulse * 0.12,
    ringScale: 0.92 + intensity * 0.18 + pulse * 0.08,
    ringRotationRadians:
      effectState.spinoutRotationRadians + effectState.spinoutSeconds * 4.8,
    skidOpacity: 0.24 + intensity * 0.42,
    skidScale: 0.72 + intensity * 0.42 + pulse * 0.1,
    skidSpread: Math.abs(slipWave) * 0.18,
    skidRotationRadians: -slipWave * 0.22
  };
}

export function createTrackSceneRacerSpinoutReactionFrame(
  racer: TrackSceneRacerRenderState
): TrackSceneRacerSpinoutReactionFrame {
  const effectState = createTrackSceneRacerEffectRenderState(racer.effectState);
  const spinoutSeconds = Math.max(
    0,
    getFiniteNumber(effectState.spinoutSeconds, 0)
  );

  if (spinoutSeconds <= 0) {
    return INACTIVE_SPINOUT_REACTION_FRAME;
  }

  const bodyRotationRadians = getFiniteNumber(
    effectState.spinoutRotationRadians,
    0
  );
  const angularVelocity = getFiniteNumber(
    effectState.spinoutAngularVelocity,
    0
  );
  const spinDirection =
    angularVelocity < 0 || (angularVelocity === 0 && bodyRotationRadians < 0)
      ? -1
      : 1;
  const spinIntensity = clampNumber(Math.abs(angularVelocity) / 9, 0.35, 1.35);
  const pulse =
    0.5 +
    Math.sin(
      Math.abs(bodyRotationRadians) * 3.4 + spinoutSeconds * 11 + racer.slotIndex
    ) *
      0.5;

  return {
    active: true,
    bodyRotationRadians,
    bodyLift: 0.04 + pulse * RACER_SPINOUT_MAX_LIFT,
    bodyScale: 1 + pulse * 0.04,
    bodyTiltX:
      Math.sin(bodyRotationRadians * 2.2 + racer.slotIndex) *
      RACER_SPINOUT_MAX_TILT_RADIANS *
      spinIntensity,
    bodyTiltZ:
      Math.cos(bodyRotationRadians * 2.2 + racer.slotIndex) *
      RACER_SPINOUT_MAX_TILT_RADIANS *
      spinIntensity,
    ringScale: 0.94 + pulse * 0.22,
    ringOpacity: 0.42 + pulse * 0.42,
    sparkScale: 0.82 + pulse * 0.32,
    sparkRotationRadians: bodyRotationRadians + spinDirection * spinoutSeconds * 3.6
  };
}

function hasActiveBananaSlipEffect(
  effectState: TrackSceneRacerEffectRenderState
): boolean {
  return (
    effectState.lastHitItemType === "banana" &&
    (effectState.hitFeedbackSeconds > 0 ||
      effectState.stunSeconds > 0 ||
      effectState.spinoutSeconds > 0 ||
      effectState.recovering)
  );
}

function hasActiveShellHitEffect(
  effectState: TrackSceneRacerEffectRenderState
): boolean {
  return (
    effectState.lastHitItemType === "shell" &&
    (effectState.hitFeedbackSeconds > 0 ||
      effectState.stunSeconds > 0 ||
      effectState.spinoutSeconds > 0 ||
      effectState.recovering)
  );
}

function createRacerPlaneGeometry(
  width: number,
  length: number,
  y: number
): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(width, length);

  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, y, 0);

  return geometry;
}

function createBananaHazardBodyGeometry(y: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();

  shape.moveTo(-0.72, -0.12);
  shape.quadraticCurveTo(-0.26, -0.56, 0.76, -0.18);
  shape.quadraticCurveTo(0.54, 0.08, 0.14, 0.2);
  shape.quadraticCurveTo(-0.34, 0.3, -0.72, -0.12);
  shape.closePath();

  const geometry = new THREE.ShapeGeometry(shape, 18);

  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, y, 0);

  return geometry;
}

function createRacerOvalGeometry(
  radiusX: number,
  radiusZ: number,
  y: number
): THREE.BufferGeometry {
  const geometry = new THREE.CircleGeometry(1, 36);

  geometry.scale(radiusX, radiusZ, 1);
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, y, 0);

  return geometry;
}

function createRacerRingGeometry(
  radius: number,
  thickness: number,
  y: number
): THREE.BufferGeometry {
  const geometry = new THREE.RingGeometry(radius - thickness, radius, 48);

  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, y, 0);

  return geometry;
}

function createRacerArrowGeometry(
  width: number,
  length: number,
  y: number
): THREE.BufferGeometry {
  const halfWidth = width / 2;
  const rearZ = RACER_BODY_LENGTH / 2 + 0.22;
  const tipZ = rearZ + length;
  const positions = new Float32Array([
    0,
    y,
    tipZ,
    -halfWidth,
    y,
    rearZ,
    halfWidth,
    y,
    rearZ
  ]);
  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex([0, 1, 2]);
  geometry.computeVertexNormals();

  return geometry;
}

function createRacerBoostWakeGeometry(
  width: number,
  length: number,
  y: number
): THREE.BufferGeometry {
  const halfWidth = width / 2;
  const baseZ = RACER_BOOST_WAKE_REAR_Z;
  const tipZ = baseZ + length;
  const positions = new Float32Array([
    -halfWidth,
    y,
    baseZ,
    0,
    y,
    tipZ,
    halfWidth,
    y,
    baseZ
  ]);
  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex([0, 1, 2]);
  geometry.computeVertexNormals();

  return geometry;
}

function createRacerBoostFlameMeshes(): readonly THREE.Mesh[] {
  const flameConfigs = [
    { x: -RACER_BOOST_FLAME_LATERAL_OFFSET, width: 0.58, length: 1.46 },
    { x: RACER_BOOST_FLAME_LATERAL_OFFSET, width: 0.58, length: 1.46 },
    { x: -RACER_BOOST_FLAME_LATERAL_OFFSET, width: 0.28, length: 0.96 },
    { x: RACER_BOOST_FLAME_LATERAL_OFFSET, width: 0.28, length: 0.96 }
  ] as const;

  return flameConfigs.map((config, index) => {
    const flame = new THREE.Mesh(
      createRacerBoostFlameGeometry(
        config.width,
        config.length,
        RACER_BOOST_FLAME_Y
      ),
      new THREE.MeshBasicMaterial({
        color: index < 2 ? 0xff7530 : 0xffffff,
        opacity: 0,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );

    flame.position.set(config.x, 0, RACER_BOOST_FLAME_REAR_Z);
    flame.visible = false;

    return flame;
  });
}

function createRacerBoostFlameGeometry(
  width: number,
  length: number,
  y: number
): THREE.BufferGeometry {
  const halfWidth = width / 2;
  const positions = new Float32Array([
    -halfWidth,
    y,
    0,
    0,
    y,
    length,
    halfWidth,
    y,
    0
  ]);
  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex([0, 1, 2]);
  geometry.computeVertexNormals();

  return geometry;
}

function createRacerSpinoutSparkMeshes(): readonly THREE.Mesh[] {
  return Array.from({ length: RACER_SPINOUT_SPARK_COUNT }, () => {
    const spark = new THREE.Mesh(
      createRacerSpinoutSparkGeometry(RACER_SPINOUT_SPARK_Y),
      new THREE.MeshBasicMaterial({
        color: 0xfff0a3,
        opacity: 0,
        transparent: true,
        side: THREE.DoubleSide
      })
    );

    spark.visible = false;

    return spark;
  });
}

function createRacerBananaSlipSkidMeshes(): readonly THREE.Mesh[] {
  return [-1, 1].map((side) => {
    const skid = new THREE.Mesh(
      createRacerPlaneGeometry(
        RACER_BANANA_SLIP_SKID_WIDTH,
        RACER_BANANA_SLIP_SKID_LENGTH,
        RACER_BANANA_SLIP_SKID_Y
      ),
      new THREE.MeshBasicMaterial({
        color: 0xffd166,
        opacity: 0,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );

    skid.position.set(
      side * RACER_BANANA_SLIP_SKID_LATERAL_OFFSET,
      0,
      RACER_BANANA_SLIP_SKID_REAR_Z
    );
    skid.visible = false;

    return skid;
  });
}

function createRacerShellHitSparkMeshes(): readonly THREE.Mesh[] {
  return Array.from({ length: RACER_SHELL_HIT_SPARK_COUNT }, () => {
    const spark = new THREE.Mesh(
      createRacerSpinoutSparkGeometry(RACER_SHELL_HIT_SPARK_Y),
      new THREE.MeshBasicMaterial({
        color: 0x7cf8a5,
        opacity: 0,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );

    spark.visible = false;

    return spark;
  });
}

function createRacerSpinoutSparkGeometry(y: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();

  shape.moveTo(0, 0.42);
  shape.lineTo(0.12, 0.08);
  shape.lineTo(0.38, 0);
  shape.lineTo(0.12, -0.08);
  shape.lineTo(0, -0.42);
  shape.lineTo(-0.12, -0.08);
  shape.lineTo(-0.38, 0);
  shape.lineTo(-0.12, 0.08);
  shape.closePath();

  const geometry = new THREE.ShapeGeometry(shape, 1);

  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, y, 0);

  return geometry;
}

function updateRacerBananaSlipReaction(
  racerObject: TrackSceneRacerObject,
  frame: TrackSceneRacerBananaSlipVisualFrame
): void {
  racerObject.bananaSlipRing.visible = frame.active;
  racerObject.bananaSlipRing.scale.setScalar(frame.ringScale);
  racerObject.bananaSlipRing.rotation.y = frame.ringRotationRadians;
  setMeshColor(racerObject.bananaSlipRing, frame.color);
  setMeshOpacity(
    racerObject.bananaSlipRing,
    frame.active ? Math.min(1, frame.ringOpacity) : 0
  );

  for (let index = 0; index < racerObject.bananaSlipSkids.length; index += 1) {
    const skid = racerObject.bananaSlipSkids[index];

    if (skid === undefined) {
      continue;
    }

    const side = index % 2 === 0 ? -1 : 1;

    skid.visible = frame.active;
    skid.position.set(
      side * (RACER_BANANA_SLIP_SKID_LATERAL_OFFSET + frame.skidSpread),
      0,
      RACER_BANANA_SLIP_SKID_REAR_Z
    );
    skid.rotation.y = frame.skidRotationRadians * side;
    skid.scale.set(1 + frame.intensity * 0.18, 1, frame.skidScale);
    setMeshColor(skid, index % 2 === 0 ? "#ffe8a3" : frame.color);
    setMeshOpacity(
      skid,
      frame.active ? Math.min(1, frame.skidOpacity) : 0
    );
  }
}

function updateRacerShellHitReaction(
  racerObject: TrackSceneRacerObject,
  frame: TrackSceneRacerShellHitVisualFrame
): void {
  racerObject.shellHitRing.visible = frame.active;
  racerObject.shellHitRing.scale.setScalar(frame.ringScale);
  racerObject.shellHitRing.rotation.y = frame.sparkRotationRadians * 0.42;
  setMeshColor(racerObject.shellHitRing, frame.color);
  setMeshOpacity(
    racerObject.shellHitRing,
    frame.active ? frame.ringOpacity : 0
  );

  for (let index = 0; index < racerObject.shellHitSparks.length; index += 1) {
    const spark = racerObject.shellHitSparks[index];

    if (spark === undefined) {
      continue;
    }

    const angle =
      frame.sparkRotationRadians +
      index * ((Math.PI * 2) / racerObject.shellHitSparks.length);
    const orbitRadius = RACER_SHELL_HIT_SPARK_ORBIT_RADIUS * frame.sparkScale;

    spark.visible = frame.active;
    spark.position.set(
      Math.cos(angle) * orbitRadius,
      0,
      Math.sin(angle) * orbitRadius
    );
    spark.rotation.y = Math.PI / 2 - angle;
    spark.scale.setScalar(frame.sparkScale);
    setMeshColor(spark, index % 2 === 0 ? "#e9fff1" : frame.color);
    setMeshOpacity(spark, frame.active ? frame.sparkOpacity : 0);
  }
}

function updateRacerSpinoutReaction(
  racerObject: TrackSceneRacerObject,
  racer: TrackSceneRacerRenderState,
  frame: TrackSceneRacerSpinoutReactionFrame
): void {
  racerObject.spinoutRing.visible = frame.active;
  racerObject.spinoutRing.scale.setScalar(frame.ringScale);
  racerObject.spinoutRing.rotation.y = frame.sparkRotationRadians * 0.6;
  setMeshColor(racerObject.spinoutRing, getRacerSpinoutReactionColor(racer));
  setMeshOpacity(racerObject.spinoutRing, frame.ringOpacity);

  for (let index = 0; index < racerObject.spinoutSparks.length; index += 1) {
    const spark = racerObject.spinoutSparks[index];

    if (spark === undefined) {
      continue;
    }

    const angle =
      frame.sparkRotationRadians +
      index * ((Math.PI * 2) / racerObject.spinoutSparks.length);
    const orbitRadius = RACER_SPINOUT_SPARK_ORBIT_RADIUS * frame.sparkScale;

    spark.visible = frame.active;
    spark.position.set(
      Math.cos(angle) * orbitRadius,
      0,
      Math.sin(angle) * orbitRadius
    );
    spark.rotation.y = Math.PI / 2 - angle;
    spark.scale.setScalar(frame.sparkScale);
    setMeshColor(
      spark,
      index % 2 === 0 ? "#fff0a3" : getRacerSpinoutReactionColor(racer)
    );
    setMeshOpacity(
      spark,
      frame.active ? Math.min(1, frame.ringOpacity + 0.1) : 0
    );
  }
}

function updateRacerSharedEffectReaction(
  racerObject: TrackSceneRacerObject,
  frame: TrackSceneRacerSharedEffectFrame
): void {
  const boostVisual = frame.boostVisual;

  racerObject.boostRing.visible = boostVisual.active;
  racerObject.boostRing.scale.setScalar(boostVisual.ringScale);
  setMeshColor(racerObject.boostRing, boostVisual.color);
  setMeshOpacity(
    racerObject.boostRing,
    boostVisual.active ? boostVisual.ringOpacity : 0
  );

  racerObject.boostWake.visible = boostVisual.active;
  racerObject.boostWake.scale.set(
    1 + boostVisual.intensity * 0.22,
    1,
    boostVisual.wakeScale
  );
  setMeshColor(racerObject.boostWake, boostVisual.color);
  setMeshOpacity(
    racerObject.boostWake,
    boostVisual.active ? boostVisual.wakeOpacity : 0
  );

  for (let index = 0; index < racerObject.boostFlames.length; index += 1) {
    const flame = racerObject.boostFlames[index];

    if (flame === undefined) {
      continue;
    }

    const isOuterFlame = index < 2;
    flame.visible = boostVisual.active;
    flame.scale.set(
      1 + boostVisual.intensity * (isOuterFlame ? 0.22 : 0.08),
      1,
      boostVisual.flameScale * (isOuterFlame ? 1 : 0.76)
    );
    setMeshColor(flame, isOuterFlame ? "#ff7530" : boostVisual.color);
    setMeshOpacity(
      flame,
      boostVisual.active
        ? boostVisual.flameOpacity * (isOuterFlame ? 1 : 0.92)
        : 0
    );
  }

  racerObject.shieldRing.visible = frame.shieldActive;
  racerObject.shieldRing.scale.setScalar(frame.shieldScale);
  setMeshOpacity(
    racerObject.shieldRing,
    frame.shieldActive ? frame.shieldOpacity : 0
  );

  racerObject.immunityRing.visible = frame.immunityActive;
  racerObject.immunityRing.scale.setScalar(frame.immunityScale);
  setMeshColor(racerObject.immunityRing, frame.hitFeedbackColor);
  setMeshOpacity(
    racerObject.immunityRing,
    frame.immunityActive ? frame.immunityOpacity : 0
  );

  racerObject.hitFeedbackRing.visible = frame.hitFeedbackActive;
  racerObject.hitFeedbackRing.scale.setScalar(frame.hitFeedbackScale);
  setMeshColor(racerObject.hitFeedbackRing, frame.hitFeedbackColor);
  setMeshOpacity(
    racerObject.hitFeedbackRing,
    frame.hitFeedbackActive ? frame.hitFeedbackOpacity : 0
  );
}

function getRacerSpinoutReactionColor(racer: TrackSceneRacerRenderState): string {
  return getRacerSharedEffectColor(
    racer,
    createTrackSceneRacerEffectRenderState(racer.effectState)
  );
}

function updateRacerRoleArrow(
  arrow: THREE.Mesh,
  racer: TrackSceneRacerRenderState
): void {
  arrow.visible = racer.role !== "ai" || racer.boostActive;
  arrow.scale.setScalar(racer.role === "local-human" ? 1.18 : 1);
  arrow.position.z = racer.role === "remote-human" ? 0.16 : 0;
}

function updateRacerLabel(
  racerObject: TrackSceneRacerObject,
  racer: TrackSceneRacerRenderState
): void {
  const labelKey = getRacerLabelKey(racer);

  if (racerObject.labelKey === labelKey) {
    return;
  }

  const material = racerObject.label.material;

  racerObject.labelTexture.dispose();
  racerObject.labelTexture = createRacerLabelTexture(racer);
  racerObject.labelKey = labelKey;
  material.map = racerObject.labelTexture;
  material.needsUpdate = true;
}

function createRacerLabelTexture(
  racer: TrackSceneRacerRenderState
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  canvas.width = RACER_LABEL_TEXTURE_WIDTH;
  canvas.height = RACER_LABEL_TEXTURE_HEIGHT;

  if (context === null) {
    throw new Error("Racer label canvas context unavailable.");
  }

  const roleColor = getRacerRoleColor(racer);
  const roleLabel = getRacerRoleLabel(racer);
  const statusLabel =
    getRacerEffectStatusLabel(racer) ??
    racer.indicatorLabel ??
    (racer.heldItem === null ? `${Math.round(racer.speed)} u/s` : racer.heldItem.toUpperCase());

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(16, 20, 24, 0.84)";
  drawCanvasRoundRect(context, 8, 11, 240, 74, 14);
  context.fill();
  context.strokeStyle = roleColor;
  context.lineWidth = 4;
  context.stroke();

  context.fillStyle = roleColor;
  drawCanvasRoundRect(context, 18, 22, 66, 24, 8);
  context.fill();
  context.fillStyle = "#101418";
  context.font = "800 15px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(roleLabel, 51, 35);

  context.fillStyle = "#f5f7fa";
  context.font = "800 21px system-ui, sans-serif";
  context.textAlign = "left";
  context.fillText(truncateCanvasLabel(racer.displayName, 13), 95, 34);

  context.fillStyle = racer.accentColor;
  context.font = "700 15px system-ui, sans-serif";
  context.fillText(statusLabel, 22, 65);

  if (racer.racingNumber !== null) {
    context.fillStyle = "#f5f7fa";
    context.font = "800 18px system-ui, sans-serif";
    context.textAlign = "right";
    context.fillText(`#${racer.racingNumber}`, 232, 64);
  }

  const texture = new THREE.CanvasTexture(canvas);

  texture.needsUpdate = true;

  return texture;
}

function getRacerLabelKey(racer: TrackSceneRacerRenderState): string {
  return [
    racer.role,
    racer.displayName,
    racer.indicatorLabel ?? "",
    racer.heldItem ?? "",
    racer.racingNumber ?? "",
    Math.round(racer.speed),
    getRacerEffectStatusLabel(racer) ?? "",
    createTrackSceneRacerSharedEffectFrame(racer).boostActive ? "boost" : "idle"
  ].join(":");
}

function getRacerRoleLabel(racer: TrackSceneRacerRenderState): string {
  switch (racer.role) {
    case "local-human":
      return "YOU";
    case "remote-human":
      return "PEER";
    case "ai":
      return "AI";
  }
}

function getRacerRoleColor(racer: TrackSceneRacerRenderState): string {
  switch (racer.role) {
    case "local-human":
      return "#ffd166";
    case "remote-human":
      return "#74f7ff";
    case "ai":
      return racer.accentColor;
  }
}

function getRacerEffectStatusLabel(
  racer: TrackSceneRacerRenderState
): string | null {
  const effectState = createTrackSceneRacerEffectRenderState(racer.effectState);

  if (
    effectState.lastHitItemType === "shell" &&
    effectState.spinoutSeconds > 0
  ) {
    return "SHELL SPIN";
  }

  if (
    effectState.lastHitItemType === "banana" &&
    effectState.spinoutSeconds > 0
  ) {
    return "BANANA SPIN";
  }

  if (effectState.stunSeconds > 0 || effectState.recovering) {
    return "STUN";
  }

  if (effectState.shieldSeconds > 0) {
    return "SHIELD";
  }

  if (effectState.itemHitImmunitySeconds > 0) {
    return "RECOVER";
  }

  if (effectState.boostSeconds > 0 || racer.boostActive) {
    return "BOOST";
  }

  return null;
}

function getRacerSharedEffectColor(
  racer: TrackSceneRacerRenderState,
  effectState: TrackSceneRacerEffectRenderState
): string {
  switch (effectState.lastHitItemType) {
    case "shell":
      return "#7cf8a5";
    case "banana":
      return "#ffd166";
    case null:
      return racer.role === "remote-human" ? "#74f7ff" : "#ff8bd1";
  }
}

function normalizeTrackSceneHitItemType(
  value: TrackSceneRacerHitItemType | null
): TrackSceneRacerHitItemType | null {
  return value === "shell" || value === "banana" ? value : null;
}

function getFiniteNonNegativeNumber(value: number): number {
  return Math.max(0, getFiniteNumber(value, 0));
}

function truncateCanvasLabel(value: string, maxLength: number): string {
  const normalized = value.trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1))}.`;
}

function drawCanvasRoundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const cornerRadius = Math.min(radius, width / 2, height / 2);

  context.beginPath();
  context.moveTo(x + cornerRadius, y);
  context.lineTo(x + width - cornerRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + cornerRadius);
  context.lineTo(x + width, y + height - cornerRadius);
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - cornerRadius,
    y + height
  );
  context.lineTo(x + cornerRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - cornerRadius);
  context.lineTo(x, y + cornerRadius);
  context.quadraticCurveTo(x, y, x + cornerRadius, y);
  context.closePath();
}

function setMeshColor(mesh: THREE.Mesh, color: string): void {
  const material = mesh.material;

  if (Array.isArray(material)) {
    for (const item of material) {
      setMaterialColor(item, color);
    }
    return;
  }

  setMaterialColor(material as THREE.Material, color);
}

function setMeshOpacity(mesh: THREE.Mesh, opacity: number): void {
  const material = mesh.material;

  if (Array.isArray(material)) {
    for (const item of material) {
      setMaterialOpacity(item, opacity);
    }
    return;
  }

  setMaterialOpacity(material as THREE.Material, opacity);
}

function getFiniteTrackPosition(position: Vector3): Vector3 | null {
  if (
    !Number.isFinite(position.x) ||
    !Number.isFinite(position.y) ||
    !Number.isFinite(position.z)
  ) {
    return null;
  }

  return { x: position.x, y: position.y, z: position.z };
}

function getFiniteNumber(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function setMaterialColor(material: THREE.Material, color: string): void {
  if ("color" in material && material.color instanceof THREE.Color) {
    material.color.set(color);
  }
}

function setMaterialOpacity(material: THREE.Material, opacity: number): void {
  const clampedOpacity = clampNumber(opacity, 0, 1);

  material.opacity = clampedOpacity;
  material.transparent = clampedOpacity < 1;
  material.depthWrite = clampedOpacity >= 1;
  material.needsUpdate = true;
}

function createTerrainMesh(bounds: TrackBounds): THREE.Mesh {
  const width = bounds.maxX - bounds.minX + TERRAIN_PADDING * 2;
  const depth = bounds.maxZ - bounds.minZ + TERRAIN_PADDING * 2;
  const geometry = new THREE.PlaneGeometry(width, depth);

  geometry.rotateX(Math.PI / 2);
  geometry.translate(
    (bounds.minX + bounds.maxX) / 2,
    TERRAIN_Y,
    (bounds.minZ + bounds.maxZ) / 2
  );

  return new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ color: 0x215a38 })
  );
}

function createOffRoadTerrainGroup(road: TrackRoadGeometry): THREE.Group {
  const group = new THREE.Group();

  if (road.shoulderWidth <= 0) {
    return group;
  }

  const leftShoulder = {
    inner: road.leftBoundary,
    outer: road.courseBoundary.leftCourseBoundary
  };
  const rightShoulder = {
    inner: road.rightBoundary,
    outer: road.courseBoundary.rightCourseBoundary
  };

  group.add(createShoulderSurfaceMesh(leftShoulder));
  group.add(createShoulderSurfaceMesh(rightShoulder));
  group.add(createShoulderDetailMesh(leftShoulder));
  group.add(createShoulderDetailMesh(rightShoulder));

  return group;
}

function createShoulderSurfaceMesh(boundaries: {
  readonly inner: readonly Vector3[];
  readonly outer: readonly Vector3[];
}): THREE.Mesh {
  return new THREE.Mesh(
    createClosedRibbonGeometry(boundaries.inner, boundaries.outer, OFF_ROAD_Y),
    new THREE.MeshBasicMaterial({
      color: 0x80643a,
      side: THREE.DoubleSide
    })
  );
}

function createShoulderDetailMesh(boundaries: {
  readonly inner: readonly Vector3[];
  readonly outer: readonly Vector3[];
}): THREE.Mesh {
  const positions: number[] = [];
  const indices: number[] = [];

  for (let index = 0; index < boundaries.inner.length; index += 1) {
    const innerStart = requirePoint(boundaries.inner, index);
    const innerEnd = requirePoint(boundaries.inner, index + 1);
    const outerStart = requirePoint(boundaries.outer, index);
    const outerEnd = requirePoint(boundaries.outer, index + 1);
    const segmentLength = getPlanarDistance(innerStart, innerEnd);
    const stripeCount = Math.max(
      1,
      Math.floor(segmentLength / OFF_ROAD_DETAIL_SPACING)
    );

    for (let stripeIndex = 0; stripeIndex < stripeCount; stripeIndex += 1) {
      const t = (stripeIndex + 0.5) / stripeCount;
      const inner = lerpPlanarPoint(innerStart, innerEnd, t);
      const outer = lerpPlanarPoint(outerStart, outerEnd, t);
      const offsetX = outer.x - inner.x;
      const offsetZ = outer.z - inner.z;
      const offsetLength = Math.hypot(offsetX, offsetZ);

      if (offsetLength <= OFF_ROAD_EDGE_INSET * 2) {
        continue;
      }

      const normalX = offsetX / offsetLength;
      const normalZ = offsetZ / offsetLength;

      appendStripQuad(
        positions,
        indices,
        inner.x + normalX * OFF_ROAD_EDGE_INSET,
        inner.z + normalZ * OFF_ROAD_EDGE_INSET,
        outer.x - normalX * OFF_ROAD_EDGE_INSET,
        outer.z - normalZ * OFF_ROAD_EDGE_INSET,
        OFF_ROAD_DETAIL_WIDTH,
        OFF_ROAD_DETAIL_Y
      );
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color: 0xb9985b,
      opacity: 0.76,
      side: THREE.DoubleSide,
      transparent: true
    })
  );
}

function createRoadSurfaceMesh(road: TrackRoadGeometry): THREE.Mesh {
  const roadOutline = [
    ...road.leftBoundary,
    ...[...road.rightBoundary].reverse()
  ];
  const firstPoint = requirePoint(roadOutline, 0);
  const shape = new THREE.Shape();

  shape.moveTo(firstPoint.x, firstPoint.z);

  for (let index = 1; index < roadOutline.length; index += 1) {
    const point = requirePoint(roadOutline, index);

    shape.lineTo(point.x, point.z);
  }

  shape.closePath();

  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, ROAD_Y, 0);

  return new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color: 0x3f464d,
      side: THREE.DoubleSide
    })
  );
}

function createTrackBoundaryGroup(road: TrackRoadGeometry): THREE.Group {
  const group = new THREE.Group();

  group.add(createCurbGroup(road, road.leftBoundary));
  group.add(createCurbGroup(road, road.rightBoundary));
  group.add(createGuardrailGroup(road, road.leftBoundary));
  group.add(createGuardrailGroup(road, road.rightBoundary));

  return group;
}

function createCurbGroup(
  road: TrackRoadGeometry,
  roadBoundary: readonly Vector3[]
): THREE.Group {
  const group = new THREE.Group();
  const inner = createOffsetBoundary(road, roadBoundary, CURB_EDGE_OFFSET);
  const outer = createOffsetBoundary(
    road,
    roadBoundary,
    CURB_EDGE_OFFSET + CURB_WIDTH
  );

  group.add(
    new THREE.Mesh(
      createSegmentedRibbonGeometry(inner, outer, CURB_Y, 0),
      new THREE.MeshBasicMaterial({
        color: 0xf5f7fa,
        side: THREE.DoubleSide
      })
    )
  );
  group.add(
    new THREE.Mesh(
      createSegmentedRibbonGeometry(inner, outer, CURB_Y + 0.002, 1),
      new THREE.MeshBasicMaterial({
        color: 0xd93a35,
        side: THREE.DoubleSide
      })
    )
  );

  return group;
}

function createGuardrailGroup(
  road: TrackRoadGeometry,
  roadBoundary: readonly Vector3[]
): THREE.Group {
  const group = new THREE.Group();
  const barrierInnerOffset = road.shoulderWidth + BARRIER_SHOULDER_GAP;
  const inner = createOffsetBoundary(road, roadBoundary, barrierInnerOffset);
  const accentOuter = createOffsetBoundary(
    road,
    roadBoundary,
    barrierInnerOffset + BARRIER_ACCENT_WIDTH
  );
  const outer = createOffsetBoundary(
    road,
    roadBoundary,
    barrierInnerOffset + BARRIER_WIDTH
  );

  group.add(
    new THREE.Mesh(
      createClosedRibbonGeometry(inner, outer, BARRIER_Y),
      new THREE.MeshBasicMaterial({
        color: 0x20272e,
        side: THREE.DoubleSide
      })
    )
  );
  group.add(
    new THREE.Mesh(
      createClosedRibbonGeometry(inner, accentOuter, BARRIER_Y + 0.004),
      new THREE.MeshBasicMaterial({
        color: 0xffd166,
        side: THREE.DoubleSide
      })
    )
  );

  return group;
}

function createEdgeLineMesh(points: readonly Vector3[]): THREE.Mesh {
  return new THREE.Mesh(
    createPolylineStripGeometry(points, 0.42, EDGE_LINE_Y, true),
    new THREE.MeshBasicMaterial({
      color: 0xf5f7fa,
      side: THREE.DoubleSide
    })
  );
}

function createCenterDashMesh(road: TrackRoadGeometry): THREE.Mesh {
  const positions: number[] = [];
  const indices: number[] = [];
  const dashLength = 2.15;
  const dashGap = 2.65;
  const halfDashWidth = 0.16;

  for (let index = 0; index < road.centerline.length; index += 1) {
    const startPoint = requirePoint(road.centerline, index).position;
    const endPoint = requirePoint(road.centerline, index + 1).position;
    const deltaX = endPoint.x - startPoint.x;
    const deltaZ = endPoint.z - startPoint.z;
    const segmentLength = Math.hypot(deltaX, deltaZ);

    if (segmentLength <= Number.EPSILON) {
      continue;
    }

    const forwardX = deltaX / segmentLength;
    const forwardZ = deltaZ / segmentLength;

    for (
      let distance = 1.2;
      distance + dashLength < segmentLength;
      distance += dashLength + dashGap
    ) {
      appendStripQuad(
        positions,
        indices,
        startPoint.x + forwardX * distance,
        startPoint.z + forwardZ * distance,
        startPoint.x + forwardX * (distance + dashLength),
        startPoint.z + forwardZ * (distance + dashLength),
        halfDashWidth,
        ROAD_MARKING_Y
      );
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color: 0xdfe6ee,
      side: THREE.DoubleSide
    })
  );
}

function createSegmentedRibbonGeometry(
  inner: readonly Vector3[],
  outer: readonly Vector3[],
  y: number,
  parity: 0 | 1
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];

  for (let index = 0; index < inner.length; index += 1) {
    const innerStart = requirePoint(inner, index);
    const innerEnd = requirePoint(inner, index + 1);
    const outerStart = requirePoint(outer, index);
    const outerEnd = requirePoint(outer, index + 1);
    const segmentLength = getPlanarDistance(innerStart, innerEnd);
    const blockCount = Math.max(
      1,
      Math.floor(segmentLength / CURB_BLOCK_LENGTH)
    );

    for (let blockIndex = 0; blockIndex < blockCount; blockIndex += 1) {
      if (blockIndex % 2 !== parity) {
        continue;
      }

      const startT = blockIndex / blockCount;
      const endT = (blockIndex + 1) / blockCount;

      appendRibbonQuad(
        positions,
        indices,
        lerpPlanarPoint(innerStart, innerEnd, startT),
        lerpPlanarPoint(innerStart, innerEnd, endT),
        lerpPlanarPoint(outerStart, outerEnd, startT),
        lerpPlanarPoint(outerStart, outerEnd, endT),
        y
      );
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

function createStartFinishLineMesh(road: TrackRoadGeometry): THREE.Group {
  const line = road.startFinishLine;
  const forwardX = Math.sin(line.headingRadians);
  const forwardZ = Math.cos(line.headingRadians);
  const lineWidth = getPlanarDistance(line.left, line.right);

  if (lineWidth <= Number.EPSILON) {
    throw new Error("Track start/finish line width must be positive.");
  }

  const lateralX = (line.right.x - line.left.x) / lineWidth;
  const lateralZ = (line.right.z - line.left.z) / lineWidth;
  const halfLineWidth = lineWidth / 2;
  const halfDepth = START_LINE_DEPTH / 2;
  const columnWidth = lineWidth / START_LINE_COLUMNS;
  const rowDepth = START_LINE_DEPTH / START_LINE_ROWS;
  const whiteTiles = createStartFinishTileGeometry(
    line.center,
    lateralX,
    lateralZ,
    halfLineWidth,
    forwardX,
    forwardZ,
    halfDepth,
    columnWidth,
    rowDepth,
    0
  );
  const darkTiles = createStartFinishTileGeometry(
    line.center,
    lateralX,
    lateralZ,
    halfLineWidth,
    forwardX,
    forwardZ,
    halfDepth,
    columnWidth,
    rowDepth,
    1
  );
  const group = new THREE.Group();

  group.add(
    new THREE.Mesh(
      darkTiles,
      new THREE.MeshBasicMaterial({
        color: 0x14181d,
        side: THREE.DoubleSide
      })
    )
  );
  group.add(
    new THREE.Mesh(
      whiteTiles,
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide
      })
    )
  );

  return group;
}

function createStartGridGroup(
  road: TrackRoadGeometry,
  startGrid: readonly TrackStartGridSlot[]
): THREE.Group {
  const group = new THREE.Group();

  if (startGrid.length === 0) {
    return group;
  }

  const line = road.startFinishLine;
  const lineWidth = getPlanarDistance(line.left, line.right);

  if (lineWidth <= Number.EPSILON) {
    throw new Error("Track start grid requires a valid start line width.");
  }

  const lateralX = (line.right.x - line.left.x) / lineWidth;
  const lateralZ = (line.right.z - line.left.z) / lineWidth;
  const forwardX = Math.sin(line.headingRadians);
  const forwardZ = Math.cos(line.headingRadians);
  const halfSlotWidth =
    Math.min(
      START_GRID_SLOT_MAX_WIDTH,
      road.roadWidth * START_GRID_SLOT_WIDTH_FACTOR
    ) / 2;
  const halfSlotLength = START_GRID_SLOT_LENGTH / 2;

  group.add(
    new THREE.Mesh(
      createStartGridFillGeometry(
        startGrid,
        lateralX,
        lateralZ,
        forwardX,
        forwardZ,
        halfSlotWidth,
        halfSlotLength
      ),
      new THREE.MeshBasicMaterial({
        color: 0x151d25,
        opacity: 0.56,
        side: THREE.DoubleSide,
        transparent: true
      })
    )
  );
  group.add(
    new THREE.Mesh(
      createStartGridOutlineGeometry(
        startGrid,
        lateralX,
        lateralZ,
        forwardX,
        forwardZ,
        halfSlotWidth,
        halfSlotLength
      ),
      new THREE.MeshBasicMaterial({
        color: 0xf5f7fa,
        side: THREE.DoubleSide
      })
    )
  );
  group.add(
    new THREE.Mesh(
      createStartGridFrontBarGeometry(
        startGrid,
        lateralX,
        lateralZ,
        forwardX,
        forwardZ,
        halfSlotWidth,
        halfSlotLength
      ),
      new THREE.MeshBasicMaterial({
        color: 0xffd166,
        side: THREE.DoubleSide
      })
    )
  );

  return group;
}

function createStartGridFillGeometry(
  startGrid: readonly TrackStartGridSlot[],
  lateralX: number,
  lateralZ: number,
  forwardX: number,
  forwardZ: number,
  halfSlotWidth: number,
  halfSlotLength: number
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];

  for (const slot of startGrid) {
    const vertexOffset = positions.length / 3;

    appendOrientedQuadVertex(
      positions,
      slot.position,
      lateralX,
      lateralZ,
      forwardX,
      forwardZ,
      -halfSlotWidth,
      -halfSlotLength,
      START_GRID_FILL_Y
    );
    appendOrientedQuadVertex(
      positions,
      slot.position,
      lateralX,
      lateralZ,
      forwardX,
      forwardZ,
      halfSlotWidth,
      -halfSlotLength,
      START_GRID_FILL_Y
    );
    appendOrientedQuadVertex(
      positions,
      slot.position,
      lateralX,
      lateralZ,
      forwardX,
      forwardZ,
      -halfSlotWidth,
      halfSlotLength,
      START_GRID_FILL_Y
    );
    appendOrientedQuadVertex(
      positions,
      slot.position,
      lateralX,
      lateralZ,
      forwardX,
      forwardZ,
      halfSlotWidth,
      halfSlotLength,
      START_GRID_FILL_Y
    );
    indices.push(
      vertexOffset,
      vertexOffset + 1,
      vertexOffset + 2,
      vertexOffset + 1,
      vertexOffset + 3,
      vertexOffset + 2
    );
  }

  return createBufferGeometryFromIndexedPositions(positions, indices);
}

function createStartGridOutlineGeometry(
  startGrid: readonly TrackStartGridSlot[],
  lateralX: number,
  lateralZ: number,
  forwardX: number,
  forwardZ: number,
  halfSlotWidth: number,
  halfSlotLength: number
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];

  for (const slot of startGrid) {
    const backLeft = getOrientedPlanarPoint(
      slot.position,
      lateralX,
      lateralZ,
      forwardX,
      forwardZ,
      -halfSlotWidth,
      -halfSlotLength
    );
    const backRight = getOrientedPlanarPoint(
      slot.position,
      lateralX,
      lateralZ,
      forwardX,
      forwardZ,
      halfSlotWidth,
      -halfSlotLength
    );
    const frontLeft = getOrientedPlanarPoint(
      slot.position,
      lateralX,
      lateralZ,
      forwardX,
      forwardZ,
      -halfSlotWidth,
      halfSlotLength
    );
    const frontRight = getOrientedPlanarPoint(
      slot.position,
      lateralX,
      lateralZ,
      forwardX,
      forwardZ,
      halfSlotWidth,
      halfSlotLength
    );

    appendStripQuad(
      positions,
      indices,
      backLeft.x,
      backLeft.z,
      backRight.x,
      backRight.z,
      START_GRID_SLOT_OUTLINE_WIDTH / 2,
      START_GRID_LINE_Y
    );
    appendStripQuad(
      positions,
      indices,
      frontLeft.x,
      frontLeft.z,
      frontRight.x,
      frontRight.z,
      START_GRID_SLOT_OUTLINE_WIDTH / 2,
      START_GRID_LINE_Y
    );
    appendStripQuad(
      positions,
      indices,
      backLeft.x,
      backLeft.z,
      frontLeft.x,
      frontLeft.z,
      START_GRID_SLOT_OUTLINE_WIDTH / 2,
      START_GRID_LINE_Y
    );
    appendStripQuad(
      positions,
      indices,
      backRight.x,
      backRight.z,
      frontRight.x,
      frontRight.z,
      START_GRID_SLOT_OUTLINE_WIDTH / 2,
      START_GRID_LINE_Y
    );
  }

  return createBufferGeometryFromIndexedPositions(positions, indices);
}

function createStartGridFrontBarGeometry(
  startGrid: readonly TrackStartGridSlot[],
  lateralX: number,
  lateralZ: number,
  forwardX: number,
  forwardZ: number,
  halfSlotWidth: number,
  halfSlotLength: number
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];

  for (const slot of startGrid) {
    const frontLeft = getOrientedPlanarPoint(
      slot.position,
      lateralX,
      lateralZ,
      forwardX,
      forwardZ,
      -halfSlotWidth,
      halfSlotLength
    );
    const frontRight = getOrientedPlanarPoint(
      slot.position,
      lateralX,
      lateralZ,
      forwardX,
      forwardZ,
      halfSlotWidth,
      halfSlotLength
    );

    appendStripQuad(
      positions,
      indices,
      frontLeft.x,
      frontLeft.z,
      frontRight.x,
      frontRight.z,
      START_GRID_FRONT_BAR_DEPTH / 2,
      START_GRID_FRONT_BAR_Y
    );
  }

  return createBufferGeometryFromIndexedPositions(positions, indices);
}

function createStartFinishTileGeometry(
  center: Vector3,
  lateralX: number,
  lateralZ: number,
  halfLineWidth: number,
  forwardX: number,
  forwardZ: number,
  halfDepth: number,
  columnWidth: number,
  rowDepth: number,
  parity: 0 | 1
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];

  for (let row = 0; row < START_LINE_ROWS; row += 1) {
    for (let column = 0; column < START_LINE_COLUMNS; column += 1) {
      if ((row + column) % 2 !== parity) {
        continue;
      }

      const lateralStart = -halfLineWidth + column * columnWidth;
      const lateralEnd = lateralStart + columnWidth;
      const forwardStart = -halfDepth + row * rowDepth;
      const forwardEnd = forwardStart + rowDepth;
      const vertexOffset = positions.length / 3;

      appendOrientedQuadVertex(
        positions,
        center,
        lateralX,
        lateralZ,
        forwardX,
        forwardZ,
        lateralStart,
        forwardStart
      );
      appendOrientedQuadVertex(
        positions,
        center,
        lateralX,
        lateralZ,
        forwardX,
        forwardZ,
        lateralEnd,
        forwardStart
      );
      appendOrientedQuadVertex(
        positions,
        center,
        lateralX,
        lateralZ,
        forwardX,
        forwardZ,
        lateralStart,
        forwardEnd
      );
      appendOrientedQuadVertex(
        positions,
        center,
        lateralX,
        lateralZ,
        forwardX,
        forwardZ,
        lateralEnd,
        forwardEnd
      );

      indices.push(
        vertexOffset,
        vertexOffset + 1,
        vertexOffset + 2,
        vertexOffset + 1,
        vertexOffset + 3,
        vertexOffset + 2
      );
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

function appendOrientedQuadVertex(
  positions: number[],
  origin: Vector3,
  lateralX: number,
  lateralZ: number,
  forwardX: number,
  forwardZ: number,
  lateralOffset: number,
  forwardOffset: number,
  y = START_LINE_Y
): void {
  positions.push(
    origin.x + lateralX * lateralOffset + forwardX * forwardOffset,
    y,
    origin.z + lateralZ * lateralOffset + forwardZ * forwardOffset
  );
}

function getOrientedPlanarPoint(
  origin: Vector3,
  lateralX: number,
  lateralZ: number,
  forwardX: number,
  forwardZ: number,
  lateralOffset: number,
  forwardOffset: number
): Pick<Vector3, "x" | "z"> {
  return {
    x: origin.x + lateralX * lateralOffset + forwardX * forwardOffset,
    z: origin.z + lateralZ * lateralOffset + forwardZ * forwardOffset
  };
}

function createBufferGeometryFromIndexedPositions(
  positions: number[],
  indices: number[]
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

function createClosedRibbonGeometry(
  inner: readonly Vector3[],
  outer: readonly Vector3[],
  y: number
): THREE.BufferGeometry {
  const outline = [
    ...outer,
    ...[...inner].reverse()
  ];
  const firstPoint = requirePoint(outline, 0);
  const shape = new THREE.Shape();

  shape.moveTo(firstPoint.x, firstPoint.z);

  for (let index = 1; index < outline.length; index += 1) {
    const point = requirePoint(outline, index);

    shape.lineTo(point.x, point.z);
  }

  shape.closePath();

  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, y, 0);

  return geometry;
}

function createOffsetBoundary(
  road: TrackRoadGeometry,
  boundary: readonly Vector3[],
  distance: number
): readonly Vector3[] {
  return boundary.map((point, index) => {
    const centerPoint = requirePoint(road.centerline, index).position;
    const offsetX = point.x - centerPoint.x;
    const offsetZ = point.z - centerPoint.z;
    const offsetLength = Math.hypot(offsetX, offsetZ);

    if (offsetLength <= Number.EPSILON) {
      return point;
    }

    return {
      x: point.x + (offsetX / offsetLength) * distance,
      y: point.y,
      z: point.z + (offsetZ / offsetLength) * distance
    };
  });
}

function createPolylineStripGeometry(
  points: readonly Vector3[],
  width: number,
  y: number,
  closed: boolean
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const segmentCount = closed ? points.length : Math.max(points.length - 1, 0);

  for (let index = 0; index < segmentCount; index += 1) {
    const startPoint = requirePoint(points, index);
    const endPoint = requirePoint(points, index + 1);

    appendStripQuad(
      positions,
      indices,
      startPoint.x,
      startPoint.z,
      endPoint.x,
      endPoint.z,
      width / 2,
      y
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

function lerpPlanarPoint(
  startPoint: Vector3,
  endPoint: Vector3,
  t: number
): Vector3 {
  return {
    x: startPoint.x + (endPoint.x - startPoint.x) * t,
    y: startPoint.y + (endPoint.y - startPoint.y) * t,
    z: startPoint.z + (endPoint.z - startPoint.z) * t
  };
}

function getPlanarDistance(startPoint: Vector3, endPoint: Vector3): number {
  return Math.hypot(endPoint.x - startPoint.x, endPoint.z - startPoint.z);
}

function appendStripQuad(
  positions: number[],
  indices: number[],
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  halfWidth: number,
  y: number
): void {
  const deltaX = endX - startX;
  const deltaZ = endZ - startZ;
  const length = Math.hypot(deltaX, deltaZ);

  if (length <= Number.EPSILON) {
    return;
  }

  const normalX = -deltaZ / length;
  const normalZ = deltaX / length;
  const vertexOffset = positions.length / 3;

  positions.push(
    startX + normalX * halfWidth,
    y,
    startZ + normalZ * halfWidth,
    startX - normalX * halfWidth,
    y,
    startZ - normalZ * halfWidth,
    endX + normalX * halfWidth,
    y,
    endZ + normalZ * halfWidth,
    endX - normalX * halfWidth,
    y,
    endZ - normalZ * halfWidth
  );
  indices.push(
    vertexOffset,
    vertexOffset + 2,
    vertexOffset + 1,
    vertexOffset + 1,
    vertexOffset + 2,
    vertexOffset + 3
  );
}

function appendRibbonQuad(
  positions: number[],
  indices: number[],
  innerStart: Vector3,
  innerEnd: Vector3,
  outerStart: Vector3,
  outerEnd: Vector3,
  y: number
): void {
  const vertexOffset = positions.length / 3;

  positions.push(
    innerStart.x,
    y,
    innerStart.z,
    outerStart.x,
    y,
    outerStart.z,
    innerEnd.x,
    y,
    innerEnd.z,
    outerEnd.x,
    y,
    outerEnd.z
  );
  indices.push(
    vertexOffset,
    vertexOffset + 2,
    vertexOffset + 1,
    vertexOffset + 1,
    vertexOffset + 2,
    vertexOffset + 3
  );
}

function disposeObjectTree(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
      child.geometry.dispose();
      disposeMaterial(child.material);
    } else if (child instanceof THREE.Sprite) {
      disposeMaterial(child.material);
    }
  });
}

function disposeMaterial(
  material: THREE.Material | readonly THREE.Material[]
): void {
  if (Array.isArray(material)) {
    for (const item of material as readonly THREE.Material[]) {
      item.dispose();
    }
    return;
  }

  const mappedMaterial = material as THREE.Material & {
    map?: THREE.Texture | null;
  };

  if (mappedMaterial.map !== undefined && mappedMaterial.map !== null) {
    mappedMaterial.map.dispose();
  }

  (material as THREE.Material).dispose();
}

function requirePoint<T>(points: readonly T[], index: number): T {
  const point = points[positiveModulo(index, points.length)];

  if (point === undefined) {
    throw new Error(`Missing track render point at index ${index}.`);
  }

  return point;
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
