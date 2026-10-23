import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/** Renders 3D objects into small PNG images (for shop cards and the like), cached by key. */
export class Thumbnailer {
  private gl: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  private cache = new Map<string, string>();

  constructor(size = 256) {
    this.gl = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.gl.setSize(size, size);
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    const pmrem = new THREE.PMREMGenerator(this.gl);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.6;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x667788, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(2, 4, 3);
    this.scene.add(sun);
  }

  /** Frames `make()` from slightly above and in front, and returns a data URL. */
  render(key: string, make: () => THREE.Object3D, opts: { yaw?: number; pitch?: number; zoom?: number } = {}) {
    const hit = this.cache.get(key);
    if (hit) return hit;
    const obj = make();
    obj.rotation.y = opts.yaw ?? -0.5;
    this.scene.add(obj);
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const center = box.getCenter(new THREE.Vector3());
    const radius = box.getSize(new THREE.Vector3()).length() / 2;
    const pitch = opts.pitch ?? 0.35;
    const dist = (radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2))) * (opts.zoom ?? 1);
    this.camera.position.set(center.x, center.y + Math.sin(pitch) * dist, center.z + Math.cos(pitch) * dist);
    this.camera.lookAt(center);
    this.gl.render(this.scene, this.camera);
    const url = this.gl.domElement.toDataURL('image/png');
    this.scene.remove(obj);
    this.cache.set(key, url);
    return url;
  }
}
