import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { Engine } from '@babylonjs/core/Engines/engine';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { BIOMES } from '../../game/rebirth-encounters.js';
import { Scene } from '@babylonjs/core/scene';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import type { AssetContainer, InstantiatedEntries } from '@babylonjs/core/assetContainer';
import '@babylonjs/loaders/glTF';
import type { Enemy, GameState, Impact, Projectile, Vec2, WeaponId } from '../../game/contracts.js';

const METERS_PER_GAME_UNIT = 1 / 64;
const MODEL_HEIGHT_METERS = 1.8;
const ARENA_WIDTH_METERS = 15;
const ARENA_DEPTH_METERS = 11.25;
const PLAYER_HEIGHT = 0.02;

type ActorMotion = 'idle' | 'run' | 'turn' | 'fire' | 'recoil' | 'hurt' | 'special' | 'death';
type Actor = {
  anchor: TransformNode;
  entries: InstantiatedEntries;
  animations: AnimationGroup[];
  activeMotion: ActorMotion | null;
  previousClip?: AnimationGroup;
  blendStart?: number;
  heightOffset: number;
  poolKey?: string;
};
type ProjectileVisual = {
  root: TransformNode;
  core: Mesh;
  rings: Mesh[];
  sparks: Mesh[];
  rank: number;
};
type ImpactVisual = { lightning?: Mesh; root: TransformNode; rings: Mesh[]; shards: Mesh[]; weapon?: WeaponId };
type DroneStyle = { scale: number; tint: Color3 };

const DRONE_STYLE: Record<string, DroneStyle> = {
  drone: { scale: 0.7, tint: new Color3(0.42, 0.9, 1) },
  brute: { scale: 1.08, tint: new Color3(0.72, 0.48, 1) },
  shooter: { scale: 0.82, tint: new Color3(1, 0.62, 0.27) },
  spore: { scale: 0.77, tint: new Color3(0.42, 1, 0.56) },
  hound: { scale: 0.94, tint: new Color3(1, 0.32, 0.38) },
  elite: { scale: 1.17, tint: new Color3(1, 0.34, 0.83) },
  queen: { scale: 2.15, tint: new Color3(1, 0.23, 0.55) },
};

const WEAPON_COLOR: Record<WeaponId, Color3> = {
  coil: new Color3(0.24, 0.94, 1),
  scatter: new Color3(1, 0.72, 0.34),
  lance: new Color3(0.7, 1, 1),
  orbit: new Color3(0.38, 1, 0.67),
  mine: new Color3(1, 0.48, 0.2),
  arc: new Color3(0.76, 0.59, 1),
};

function toWorld(point: Vec2): Vector3 {
  return new Vector3(point.x * METERS_PER_GAME_UNIT, 0, point.y * METERS_PER_GAME_UNIT);
}

function material(scene: Scene, name: string, color: string, emissive = '#000000', alpha = 1): StandardMaterial {
  const result = new StandardMaterial(name, scene);
  result.diffuseColor = Color3.FromHexString(color);
  result.emissiveColor = Color3.FromHexString(emissive);
  result.specularColor = new Color3(0.32, 0.4, 0.48);
  result.alpha = alpha;
  return result;
}

function box(scene: Scene, name: string, size: Vector3, position: Vector3, mat: StandardMaterial, castShadow = true): Mesh {
  const mesh = MeshBuilder.CreateBox(name, { width: size.x, height: size.y, depth: size.z }, scene);
  mesh.position.copyFrom(position);
  mesh.material = mat;
  mesh.receiveShadows = true;
  mesh.isPickable = false;
  if (castShadow) mesh.metadata = { shadowCaster: true };
  return mesh;
}

function actorMotion(state: GameState, enemy?: Enemy): ActorMotion {
  if (state.phase === 'gameover' && !enemy) return 'death';
  if (enemy) {
    if (enemy.hitFlash > 0) return 'hurt';
    if ((enemy.attackUntil ?? 0) > state.time) return 'fire';
    return Math.hypot(enemy.vel.x, enemy.vel.y) > 8 ? 'run' : 'idle';
  }
  if (state.impacts.some((effect) => effect.kind === 'pulse' && effect.ttl > 0.2)) return 'special';
  if (state.player.invuln > 0.62 && state.player.invuln < 2) return 'hurt';
  if (state.projectiles.some((shot) => shot.owner === 'player' && shot.weapon === 'coil' && shot.ttl > 0.78)) return 'fire';
  if (state.run && Math.hypot(state.run.move.x, state.run.move.y) > 8) return 'run';
  return 'idle';
}

function desiredClip(actor: Actor, motion: ActorMotion): AnimationGroup | undefined {
  const aliases: Record<ActorMotion, readonly string[]> = {
    idle: ['idle'], run: ['run'], turn: ['turn'], fire: ['fire'], recoil: ['recoil'],
    hurt: ['hurt'], special: ['special'], death: ['death'],
  };
  return actor.animations.find((group) => aliases[motion].some((name) => group.name.toLowerCase().includes(name)));
}

function applyMotion(actor: Actor, motion: ActorMotion): void {
  const now = performance.now();
  const next = desiredClip(actor, motion);
  if (actor.activeMotion !== motion && next) {
    actor.previousClip?.stop();
    actor.previousClip = actor.activeMotion ? desiredClip(actor, actor.activeMotion) : undefined;
    actor.blendStart = now;
    actor.activeMotion = motion;
    if (next.isStarted) next.stop();
    next.start(motion === 'idle' || motion === 'run' || motion === 'turn');
    next.setWeightForAllAnimatables(actor.previousClip?.isPlaying ? 0 : 1);
  }
  if (next && actor.previousClip) {
    const amount = Math.min(1, (now - (actor.blendStart ?? now)) / 95);
    next.setWeightForAllAnimatables(amount);
    actor.previousClip.setWeightForAllAnimatables(1 - amount);
    if (amount >= 1) { actor.previousClip.stop(); actor.previousClip = undefined; }
  }
}

/** Babylon render layer for the existing 960x720 simulation. Gameplay remains in 64-unit meters. */
export class ReforgedScene {
  private readonly engine: Engine;
  private readonly scene: Scene;
  private readonly camera: ArcRotateCamera;
  private readonly shadow: ShadowGenerator;
  private readonly resizeObserver: ResizeObserver;
  private readonly vesper: AssetContainer;
  private readonly drone: AssetContainer;
  private readonly player: Actor;
  private readonly instrumentation: SceneInstrumentation;
  private readonly muzzleLight: PointLight;
  private lastShots = 0;
  private lastHp = 0;
  private fireTime = -10;
  private hurtTime = -10;
  private turnTime = -10;
  private priorTime = 0;
  private readonly retired = new Map<string, Actor[]>();
  private readonly enemies = new Map<number, Actor>();
  private readonly projectiles = new Map<number, ProjectileVisual>();
  private readonly orbs = new Map<number, Mesh>();
  private readonly impacts = new Map<number, ImpactVisual>();
  private lastTime = 0;
  private quality: 'low' | 'medium' | 'high' = 'medium';
  private disposed = false;

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    engine: Engine,
    scene: Scene,
    camera: ArcRotateCamera,
    shadow: ShadowGenerator,
    vesper: AssetContainer,
    drone: AssetContainer,
  ) {
    this.engine = engine;
    this.scene = scene;
    this.instrumentation = new SceneInstrumentation(scene);
    this.muzzleLight = new PointLight('Bobina // iluminação do disparo', new Vector3(0,1,0), scene);
    this.muzzleLight.diffuse=Color3.FromHexString('#82f5ff');
    this.muzzleLight.range=4.4;this.muzzleLight.intensity=0;
    this.camera = camera;
    this.shadow = shadow;
    this.vesper = vesper;
    this.drone = drone;
    this.player = this.makeActor(vesper, 'vesper-player', true, Color3.White());
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    window.addEventListener('resize', this.resize);
    this.resize();
  }

  static async create(canvas: HTMLCanvasElement): Promise<ReforgedScene> {
    const engine = new Engine(canvas, true, { antialias: true, preserveDrawingBuffer: true, stencil: true, adaptToDeviceRatio: false, powerPreference: 'high-performance' });
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.018, 0.033, 0.052, 1);
    scene.ambientColor = new Color3(0.18, 0.22, 0.28);
    scene.fogMode = Scene.FOGMODE_EXP2;
    scene.fogColor = Color3.FromHexString('#172b38');
    scene.fogDensity = 0.013;

    const camera = new ArcRotateCamera('isometric-follow-camera', -Math.PI / 4, 1.02, 14.6, new Vector3(7.5, 0, 5.625), scene);
    camera.lowerRadiusLimit = 13.5;
    camera.upperRadiusLimit = 17;
    camera.fov = 0.68;
    camera.inertia = 0;
    camera.minZ = 0.1;
    camera.maxZ = 70;
    scene.activeCamera = camera;

    const ambient = new HemisphericLight('industrial-ambient', new Vector3(0, 1, 0), scene);
    ambient.intensity = 0.55;
    ambient.diffuse = Color3.FromHexString('#b7dcf2');
    ambient.groundColor = Color3.FromHexString('#182430');
    const key = new DirectionalLight('overhead-sodium-key', new Vector3(-0.45, -1, 0.4), scene);
    key.position = new Vector3(7, 11, -2);
    key.intensity = 1.65;
    key.diffuse = Color3.FromHexString('#d7edff');
    const shadow = new ShadowGenerator(1024, key);
    shadow.useBlurExponentialShadowMap = true;
    shadow.blurKernel = 16;
    shadow.bias = 0.0005;
    shadow.normalBias = 0.03;
    shadow.setDarkness(0.4);

    ReforgedScene.buildIndustrialStage(scene, shadow);
    const assetBase = new URL('./reforged/', document.baseURI).href;
    let vesper: AssetContainer;
    let drone: AssetContainer;
    try {
      [vesper, drone] = await Promise.all([
        SceneLoader.LoadAssetContainerAsync(assetBase, 'vesper.glb', scene),
        SceneLoader.LoadAssetContainerAsync(assetBase, 'drone.glb', scene),
      ]);
      if (!vesper.rootNodes.length || !vesper.meshes.some((mesh) => mesh.getTotalVertices() > 0)) throw new Error('O arquivo vesper.glb não contém uma malha visível.');
      if (!drone.rootNodes.length || !drone.meshes.some((mesh) => mesh.getTotalVertices() > 0)) throw new Error('O arquivo drone.glb não contém uma malha visível.');
    } catch (error) {
      scene.dispose();
      engine.dispose();
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('vesper.glb') || message.includes('drone.glb')) throw error;
      throw new Error(`Falha ao carregar /reforged/vesper.glb e /reforged/drone.glb: ${message}`);
    }
    return new ReforgedScene(canvas, engine, scene, camera, shadow, vesper, drone);
  }

  private static buildIndustrialStage(scene: Scene, shadow: ShadowGenerator): void {
    const floor = material(scene, 'brushed-steel-floor', '#253540');
    const edge = material(scene, 'platform-edge', '#46545a');
    const dark = material(scene, 'machine-graphite', '#27333b');
    const dark2 = material(scene, 'machine-panel', '#35444c');
    const rail = material(scene, 'rail-steel', '#9bb0b7', '#25363d');
    const hazard = material(scene, 'hazard-yellow', '#d8a83f', '#51320a');
    const cyan = material(scene, 'ion-lamp', '#5cd7e6', '#40cfe9');
    const amber = material(scene, 'warning-lamp', '#ffb14e', '#e96917');

    const slab = MeshBuilder.CreateBox('industrial-platform-foundation', { width: 16.4, height: 0.42, depth: 12.6 }, scene);
    slab.position.set(7.5, -0.24, 5.625);
    slab.material = edge;
    slab.receiveShadows = true;
    slab.isPickable = false;
    shadow.addShadowCaster(slab);
    const canvasTexture = new DynamicTexture('ION-07 hazard deck / original', {width:1024,height:768}, scene, true);
    const paint = canvasTexture.getContext();
    paint.fillStyle='#344454';paint.fillRect(0,0,1024,768);
    let seed=6019;
    const random = () => (seed = (Math.imul(seed,1664525)+1013904223)>>>0)/4294967296;
    for(let y=0;y<768;y+=96)for(let x=0;x<1024;x+=102.4){
      const v=Math.floor(49+random()*18);
      paint.fillStyle='rgb('+v+','+(v+11)+','+(v+25)+')';
      paint.fillRect(x+2,y+2,99,93);
      paint.fillStyle='#8499a8'; paint.fillRect(x+3,y+3,95,1);
      paint.fillStyle='#111a27'; paint.fillRect(x+3,y+92,95,2);
      for(const dx of [7,93])for(const dy of [8,88]){paint.fillStyle='#171f2a';paint.fillRect(x+dx,y+dy,3,3);}
    }
    for(let i=0;i<4100;i++){
      paint.fillStyle=i%2?'#aabcc61d':'#06101b39';
      paint.fillRect(random()*1024,random()*768,random()*22+1,1);
    }
    paint.fillStyle='#bccdd35d';paint.font='900 62px sans-serif';
    paint.fillText('ION / 07',424,475);
    paint.font='600 17px monospace'; paint.fillText('TRÂNSITO DE CARGA',440,508);
    canvasTexture.update();
    floor.diffuseTexture=canvasTexture;
    floor.diffuseColor=Color3.FromHexString('#b5c1d5');
    const foundation=MeshBuilder.CreateGround('outer station service deck',{width:60,height:50},scene);
    foundation.position.set(7.5,-.51,5.625);
    foundation.material=material(scene,'outer deck','#162739','#0a141d');
    foundation.isPickable=false;
    const surface = MeshBuilder.CreateGround('industrial-walkable-stage', { width: ARENA_WIDTH_METERS, height: ARENA_DEPTH_METERS, subdivisions: 1 }, scene);
    surface.position.set(7.5,0,5.625);
    surface.material = floor;
    surface.receiveShadows = true;
    surface.isPickable = false;

    // Modular plates and luminous lane inlays make the entire 960x720 simulation floor legible.
    for (let x = 0.5; x < ARENA_WIDTH_METERS; x += 1) {
      const seam = box(scene, `floor-seam-x-${x}`, new Vector3(0.012, 0.008, ARENA_DEPTH_METERS - 0.15), new Vector3(x, 0.006, 5.625), dark2, false);
      seam.receiveShadows = false;
    }
    for (let z = 0.5; z < ARENA_DEPTH_METERS; z += 1) {
      const seam = box(scene, `floor-seam-z-${z}`, new Vector3(ARENA_WIDTH_METERS - 0.15, 0.008, 0.012), new Vector3(7.5, 0.006, z), dark2, false);
      seam.receiveShadows = false;
    }
    for (const z of [0.5, 10.75]) {
      box(scene, `yellow-platform-edge-${z}`, new Vector3(15.2, 0.014, 0.1), new Vector3(7.5, 0.016, z), hazard, false);
    }

    // Twin mag-rail tracks run through the arena as a raised industrial landmark.
    for (const z of [5.08, 5.95]) {
      box(scene, `mag-rail-${z}`, new Vector3(15.15, 0.085, 0.09), new Vector3(7.5, 0.075, z), rail);
    }
    for (let x = 0.28; x < 15; x += 0.64) {
      box(scene, `rail-tie-${x.toFixed(2)}`, new Vector3(0.09, 0.07, 1.05), new Vector3(x, 0.052, 5.515), dark);
    }
    for (let x = 0.6; x < 15; x += 1.25) {
      box(scene, `rail-marker-${x.toFixed(2)}`, new Vector3(0.34, 0.012, 0.025), new Vector3(x, 0.124, 5.08), cyan, false);
    }

    const machine = (id: string, x: number, z: number, scale = 1) => {
      box(scene, `${id}-plinth`, new Vector3(1.75 * scale, 0.24, 1.5 * scale), new Vector3(x, 0.12, z), dark2);
      box(scene, `${id}-reactor-housing`, new Vector3(1.18 * scale, 1.08 * scale, 0.94 * scale), new Vector3(x, 0.77 * scale, z), dark);
      box(scene, `${id}-front-panel`, new Vector3(0.76 * scale, 0.42 * scale, 0.08), new Vector3(x, 0.74 * scale, z + 0.51 * scale), rail);
      box(scene, `${id}-ion-window`, new Vector3(0.54 * scale, 0.12 * scale, 0.06), new Vector3(x, 0.78 * scale, z + 0.56 * scale), cyan, false);
      box(scene, `${id}-warning-stripe`, new Vector3(0.98 * scale, 0.055 * scale, 0.07), new Vector3(x, 1.28 * scale, z + 0.28 * scale), hazard, false);
      const pipe = MeshBuilder.CreateCylinder(`${id}-coolant-stack`, { height: 0.75 * scale, diameter: 0.16 * scale, tessellation: 10 }, scene);
      pipe.position.set(x - 0.56 * scale, 0.92 * scale, z - 0.48 * scale);
      pipe.material = rail;
      pipe.isPickable = false;
      pipe.receiveShadows = true;
      shadow.addShadowCaster(pipe);
      const lamp = new PointLight(`${id}-spill`, new Vector3(x, 1.12 * scale, z + 0.6 * scale), scene);
      lamp.diffuse = Color3.FromHexString('#34bdd5');
      lamp.intensity = 0.48;
      lamp.range = 3.2;
    };
    for(const [i, obstacle] of BIOMES.station.obstacles.entries()){
      const position=toWorld(obstacle);
      machine('ion-pressure-bank-'+i, position.x, position.z, obstacle.radius/45);
    }
    for(const z of [-2.8,14.1]){
      box(scene,'outer utility spine',new Vector3(27,.82,.76),new Vector3(7.5,.08,z),dark);
      for(let x=-3;x<=18;x+=2.1){
        box(scene,'lighting truss',new Vector3(.26,2.9,.46),new Vector3(x,1.25,z),rail,false);
        box(scene,'hazard light',new Vector3(.31,.13,.57),new Vector3(x,2.69,z),x>7.5?cyan:amber,false);
        box(scene,'high-voltage conduit',new Vector3(1.99,.25,.24),new Vector3(x,1.82,z-.36),dark2,false);
      }
    }

    for (let i = 0; i < 7; i++) {
      const x = 2.5 + i * 1.67;
      const pylon = box(scene, `overhead-support-${i}`, new Vector3(0.16, 3.2, 0.16), new Vector3(x, 1.58, 0.28), dark, false);
      pylon.receiveShadows = false;
      box(scene, `overhead-crossbar-${i}`, new Vector3(0.13, 0.13, 0.92), new Vector3(x, 3.1, 0.56), rail, false);
      box(scene, `overhead-neon-${i}`, new Vector3(0.06, 0.48, 0.12), new Vector3(x, 2.74, 0.56), i % 2 ? amber : cyan, false);
    }

    // Four industrial light pools and hard directional shadows ground the characters in the stage.
    for (const [index, position] of [[3, 4.1], [12, 4.1], [3, 8.5], [12, 8.5]] as const) {
      const fill = new PointLight(`factory-pool-${index}-${position}`, new Vector3(index, 3.3, position), scene);
      fill.diffuse = position < 6 ? Color3.FromHexString('#69dbe9') : Color3.FromHexString('#faab57');
      fill.intensity = 0.48;
      fill.range = 7;
    }
  }

  private makeActor(container: AssetContainer, name: string, isPlayer: boolean, tint: Color3): Actor {
    const entries = container.instantiateModelsToScene((source) => `${name}-${source}`, true);
    const anchor = new TransformNode(`${name}-feet-root`, this.scene);
    for (const root of entries.rootNodes) root.parent = anchor;
    anchor.position.y = PLAYER_HEIGHT;
    anchor.metadata = { actor: true };
    const meshes = this.scene.meshes.filter((mesh) => mesh.isDescendantOf(anchor) && mesh.getTotalVertices() > 0);
    let minY = Infinity;
    let maxY = -Infinity;
    for (const mesh of meshes) {
      mesh.computeWorldMatrix(true);
      const bounds = mesh.getBoundingInfo().boundingBox;
      minY = Math.min(minY, bounds.minimumWorld.y);
      maxY = Math.max(maxY, bounds.maximumWorld.y);
      mesh.isPickable = false;
      mesh.receiveShadows = true;
      if (isPlayer) this.shadow.addShadowCaster(mesh);
      const sourceMaterial = mesh.material;
      if (sourceMaterial instanceof StandardMaterial) {
        sourceMaterial.diffuseColor = sourceMaterial.diffuseColor.multiply(tint);
        if (!isPlayer) sourceMaterial.emissiveColor = sourceMaterial.emissiveColor.add(tint.scale(0.045));
      } else if (sourceMaterial instanceof PBRMaterial) {
        sourceMaterial.albedoColor = sourceMaterial.albedoColor.multiply(tint);
        if (!isPlayer) sourceMaterial.emissiveColor = sourceMaterial.emissiveColor.add(tint.scale(0.045));
      }
    }
    const height = maxY - minY;
    if (!Number.isFinite(height) || height <= 0) {
      anchor.dispose(false, true);
      entries.dispose();
      throw new Error(`O modelo ${name} não tem altura válida; confira eixo Y e malhas do GLB.`);
    }
    const scale = MODEL_HEIGHT_METERS / height;
    anchor.scaling.setAll(scale);
    anchor.position.y = PLAYER_HEIGHT - minY * scale;
    return { anchor, entries, animations: entries.animationGroups, activeMotion: null, heightOffset: anchor.position.y };
  }

  private resize = (): void => {
    if (this.disposed) return;
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, this.quality === 'high' ? 1.75 : this.quality === 'medium' ? 1.24 : .8);
    this.engine.setHardwareScalingLevel(1 / dpr);
    this.engine.resize();
  };

  setQuality(quality: 'low' | 'medium' | 'high') {
    if (this.quality === quality) return;
    this.quality = quality;
    this.scene.shadowsEnabled = quality !== 'low';
    this.resize();
  }

  private ensureEnemy(enemy: Enemy): Actor {
    let actor = this.enemies.get(enemy.id);
    if (!actor) {
      // Slice limitation: every enemy class is an independently animated/tinted instance of the drone GLB.
      const poolKey = enemy.variant ?? enemy.kind;
      const style = DRONE_STYLE[poolKey] ?? DRONE_STYLE.drone;
      actor = this.retired.get(poolKey)?.pop();
      if (!actor) {
        actor = this.makeActor(this.drone, `drone-enemy-${enemy.id}`, false, style.tint);
        actor.anchor.scaling.scaleInPlace(style.scale);
        actor.poolKey = poolKey;
      }
      actor.anchor.setEnabled(true);
      this.enemies.set(enemy.id, actor);
    }
    return actor;
  }

  private updateActor(actor: Actor, point: Vec2, direction: Vec2, motion: ActorMotion): void {
    const position = toWorld(point);
    actor.anchor.position.x = position.x;
    actor.anchor.position.z = position.z;
    actor.anchor.position.y = actor.heightOffset;
    if (Math.hypot(direction.x, direction.y) > .06) actor.anchor.rotation.y = Math.atan2(direction.x, direction.y);
    applyMotion(actor, motion);
  }

  private createProjectileVisual(projectile: Projectile): ProjectileVisual {
    const root = new TransformNode(`projectile-${projectile.id}`, this.scene);
    const color = projectile.owner === 'enemy' ? new Color3(1, 0.28, 0.48) : WEAPON_COLOR[projectile.weapon ?? 'coil'];
    const mat = new StandardMaterial(`projectile-mat-${projectile.id}`, this.scene);
    mat.diffuseColor = color;
    mat.emissiveColor = color.scale(0.8);
    mat.disableLighting = true;
    const core = MeshBuilder.CreateSphere(`projectile-core-${projectile.id}`, { diameter: 0.15, segments: 8 }, this.scene);
    core.parent = root;
    core.material = mat;
    core.isPickable = false;
    const rings: Mesh[] = [];
    const sparks: Mesh[] = [];
    if (projectile.weapon === 'coil') {
      const ringMat = new StandardMaterial(`coil-rank-ring-${projectile.id}`, this.scene);
      ringMat.diffuseColor = color;
      ringMat.emissiveColor = color;
      ringMat.disableLighting = true;
      const sparkMat = new StandardMaterial(`coil-rank-spark-${projectile.id}`, this.scene);
      sparkMat.diffuseColor = Color3.FromHexString('#f2ffff');
      sparkMat.emissiveColor = Color3.FromHexString('#a5ffff');
      sparkMat.disableLighting = true;
      for (let rank = 2; rank <= 5; rank++) {
        const ring = MeshBuilder.CreateTorus(`coil-rank-${rank}-ring-${projectile.id}`, { diameter: 0.24 + rank * 0.055, thickness: 0.018 + rank * 0.004, tessellation: 12 }, this.scene);
        ring.parent = root;
        ring.material = ringMat;
        ring.isPickable = false;
        ring.setEnabled((projectile.rank ?? 1) >= rank);
        rings.push(ring);
      }
      for (let i = 0; i < 8; i++) {
        const spark = MeshBuilder.CreateSphere(`coil-rank-5-spark-${i}-${projectile.id}`, { diameter: 0.055, segments: 6 }, this.scene);
        spark.parent = root;
        spark.position.set(Math.cos(i * Math.PI / 4) * 0.22, Math.sin(i * Math.PI / 4) * 0.22, 0);
        spark.material = sparkMat;
        spark.isPickable = false;
        spark.setEnabled(projectile.rank === 5 && i % 2 === 0);
        sparks.push(spark);
      }
    }
    return { root, core, rings, sparks, rank: projectile.rank ?? 1 };
  }

  private updateProjectile(projectile: Projectile): void {
    let visual = this.projectiles.get(projectile.id);
    if (!visual) {
      visual = this.createProjectileVisual(projectile);
      this.projectiles.set(projectile.id, visual);
    }
    const point = toWorld(projectile.pos);
    visual.root.position.set(point.x, projectile.owner === 'player' ? 0.66 : 0.55, point.z);
    visual.root.rotation.y = Math.atan2(projectile.vel.x, projectile.vel.y);
    visual.root.scaling.setAll(projectile.weapon === 'coil' ? 0.72 + (projectile.rank ?? 1) * 0.1 : 0.85);
    visual.root.rotation.z = Math.sin(this.lastTime * 10 + projectile.id) * 0.18;
    for (const [index, ring] of visual.rings.entries()) {
      ring.rotation.x = Math.PI / 2;
      ring.rotation.y = this.lastTime * (2.5 + index * 0.4) * (index % 2 ? -1 : 1);
    }
  }

  private createImpact(impact: Impact): ImpactVisual {
    const root = new TransformNode(`impact-${impact.id}`, this.scene);
    const rings: Mesh[] = [];
    const shards: Mesh[] = [];
    const rank = Math.min(5, Math.max(1, impact.rank ?? 1));
    const color = WEAPON_COLOR[impact.weapon ?? 'coil'];
    const ringMat = new StandardMaterial(`impact-ring-mat-${impact.id}`, this.scene);
    ringMat.diffuseColor = color;
    ringMat.emissiveColor = color.scale(0.9);
    ringMat.disableLighting = true;
    const ringCount = impact.weapon === 'coil' ? rank : impact.kind === 'pulse' ? Math.min(3, rank) : 1;
    for (let i = 0; i < ringCount; i++) {
      const ring = MeshBuilder.CreateTorus(`impact-ring-${impact.id}-${i}`, { diameter: 1, thickness: impact.weapon === 'coil' ? 0.018 + i * 0.008 : 0.026, tessellation: 24 }, this.scene);
      ring.parent = root;
      ring.position.y = 0.045 + i * 0.018;
      ring.material = ringMat;
      ring.rotation.x = Math.PI / 2;
      ring.isPickable = false;
      rings.push(ring);
    }
    if (impact.weapon === 'coil' && rank >= 3) {
      const sparkMat = new StandardMaterial(`impact-spark-mat-${impact.id}`, this.scene);
      sparkMat.diffuseColor = Color3.FromHexString('#edffff');
      sparkMat.emissiveColor = color;
      sparkMat.disableLighting = true;
      const shardCount = rank === 3 ? 4 : rank === 4 ? 8 : 12;
      for (let i = 0; i < shardCount; i++) {
        const shard = MeshBuilder.CreateBox(`impact-shard-${impact.id}-${i}`, { size: rank === 5 ? 0.13 : 0.085 }, this.scene);
        shard.parent = root;
        shard.position.set(Math.cos(i * Math.PI * 2 / shardCount) * 0.38, 0.09 + (i % 3) * 0.035, Math.sin(i * Math.PI * 2 / shardCount) * 0.38);
        shard.material = sparkMat;
        shard.isPickable = false;
        shards.push(shard);
      }
    }
    let lightning: Mesh | undefined;
    if (impact.from && impact.kind === 'arc') {
      const end=toWorld(impact.pos), start=toWorld(impact.from).subtract(end);
      const points=Array.from({length:10},(_,i)=>{
        const t=i/9;
        return new Vector3(start.x*(1-t)+(i===0||i===9?0:Math.sin(i*3.65+impact.id)*.18),
          .6+Math.sin(t*Math.PI)*.38, start.z*(1-t)+Math.sin(i*4.11)*.09);
      });
      const tube=MeshBuilder.CreateTube('ion cascade '+impact.id,{path:points,radius:rank===5?.047:.032,tessellation:4},this.scene);
      tube.material=ringMat;tube.position.copyFrom(end);lightning=tube;
    }
    return { root, rings, shards, weapon: impact.weapon, lightning };
  }

  private updateImpact(impact: Impact): void {
    let visual = this.impacts.get(impact.id);
    if (!visual) {
      visual = this.createImpact(impact);
      this.impacts.set(impact.id, visual);
    }
    const point = toWorld(impact.pos);
    visual.root.position.set(point.x, 0.08, point.z);
    const progress = Math.min(1, Math.max(0, 1 - impact.ttl / impact.maxTtl));
    const radius = (impact.radius ?? (impact.kind === 'pulse' ? 150 : 28)) * METERS_PER_GAME_UNIT;
    const expansion = 0.28 + progress * Math.max(0.5, radius * 1.7);
    visual.root.scaling.setAll(expansion);
    visual.root.scaling.y = 1;
    visual.root.rotation.y = this.lastTime * 1.2;
    for (const [index, ring] of visual.rings.entries()) ring.scaling.setAll(1 + index * 0.34);
    for (const shard of visual.shards) shard.rotation.y += 0.05 + progress * 0.04;
  }

  render(state: GameState, reducedMotion: boolean): void {
    if (this.disposed) return;
    this.lastTime = reducedMotion ? 0 : state.time;
    const playerPoint = toWorld(state.player.pos);
    const target = new Vector3(playerPoint.x, 0, playerPoint.z);
    Vector3.LerpToRef(this.camera.target, target, 0.075, this.camera.target);

    // Both playable archetypes currently use the supplied Vesper GLB; combat stats and input stay in the existing simulation.
    if (state.time < this.priorTime) { this.fireTime = this.hurtTime = this.turnTime = -10; this.lastShots=0; this.lastHp=0; }
    this.priorTime=state.time;
    if (state.stats.shotsFired>this.lastShots) this.fireTime=state.time;
    if (this.lastHp && state.player.hp<this.lastHp) this.hurtTime=state.time;
    this.lastShots=state.stats.shotsFired; this.lastHp=state.player.hp;
    const fired=state.time-this.fireTime;
    const moving=state.run?.move ?? state.player.aim;
    const dir=fired<.28?state.player.aim:moving;
    const angle=Math.atan2(dir.x,dir.y);
    if (Math.hypot(dir.x,dir.y)>8 && state.time-this.turnTime>.4 &&
        Math.abs(Math.atan2(Math.sin(angle-this.player.anchor.rotation.y),Math.cos(angle-this.player.anchor.rotation.y)))>1.25) this.turnTime=state.time;
    const generic=actorMotion(state);
    const motion=generic==='death'||generic==='special'?generic:state.time-this.hurtTime<.27?'hurt':
      fired<.105?'fire':fired<.23?'recoil':state.time-this.turnTime<.19?'turn':generic==='fire'?'idle':generic;
    this.updateActor(this.player, state.player.pos, dir, motion);
    this.muzzleLight.position.set(playerPoint.x+state.player.aim.x*.9,1.12,playerPoint.z+state.player.aim.y*.9);
    this.muzzleLight.intensity=reducedMotion?0:Math.max(0,1-fired*11)*(2.4+(state.run?.ranks.coil??1)*.27);
    this.canvas.dataset.playerClip=motion;
    const aliveEnemyIds = new Set<number>();
    for (const enemy of state.enemies) {
      aliveEnemyIds.add(enemy.id);
      const actor = this.ensureEnemy(enemy);
      this.updateActor(actor, enemy.pos, enemy.vel, actorMotion(state, enemy));
    }
    for (const [id, actor] of this.enemies) {
      if (aliveEnemyIds.has(id)) continue;
      actor.anchor.setEnabled(false);
      for (const animation of actor.animations) animation.stop();
      actor.activeMotion = null;
      actor.previousClip = undefined;
      const key = actor.poolKey ?? 'drone';
      const pool = this.retired.get(key) ?? [];
      pool.push(actor);
      this.retired.set(key, pool);
      this.enemies.delete(id);
    }

    const liveProjectileIds = new Set<number>();
    for (const projectile of state.projectiles) {
      liveProjectileIds.add(projectile.id);
      this.updateProjectile(projectile);
    }
    for (const [id, visual] of this.projectiles) {
      if (liveProjectileIds.has(id)) continue;
      visual.root.dispose(false, true);
      this.projectiles.delete(id);
    }

    const liveOrbIds = new Set<number>();
    for (const orb of state.orbs) {
      liveOrbIds.add(orb.id);
      let visual = this.orbs.get(orb.id);
      if (!visual) {
        visual = MeshBuilder.CreateSphere(`xp-orb-${orb.id}`, { diameter: 0.15, segments: 8 }, this.scene);
        visual.material = material(this.scene, `xp-orb-mat-${orb.id}`, '#8cffbd', '#42ff9a');
        visual.isPickable = false;
        this.orbs.set(orb.id, visual);
      }
      const point = toWorld(orb.pos);
      visual.position.set(point.x, 0.17 + (reducedMotion ? 0 : Math.sin(state.time * 3 + orb.id) * 0.035), point.z);
    }
    for (const [id, visual] of this.orbs) {
      if (liveOrbIds.has(id)) continue;
      visual.dispose(false, true);
      this.orbs.delete(id);
    }

    const liveImpactIds = new Set<number>();
    for (const impact of state.impacts.slice(-24)) {
      liveImpactIds.add(impact.id);
      this.updateImpact(impact);
    }
    for (const [id, visual] of this.impacts) {
      if (liveImpactIds.has(id)) continue;
      visual.lightning?.dispose(false, false);
      visual.root.dispose(false, true);
      this.impacts.delete(id);
    }

    const begin = performance.now();
    this.scene.render();
    this.canvas.dataset.cpuMs = (performance.now() - begin).toFixed(1);
    this.canvas.dataset.drawCalls = String(this.instrumentation.drawCallsCounter.current);
    this.canvas.dataset.renderer = 'babylon-webgl';
    this.canvas.dataset.sceneEnemies = String(this.enemies.size);
    this.canvas.dataset.activeMeshes = String(this.scene.getActiveMeshes().length);
    this.canvas.dataset.activeTriangles = String(Math.round(this.scene.getActiveIndices() / 3));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resizeObserver.disconnect();
    this.instrumentation.dispose();
    window.removeEventListener('resize', this.resize);
    this.player.anchor.dispose(false, false);
    this.player.entries.dispose();
    for (const actor of this.enemies.values()) { actor.anchor.dispose(false, false); actor.entries.dispose(); }
    this.vesper.dispose();
    this.drone.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}
