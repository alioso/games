import * as THREE from 'three';
import {
  BloomEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';

export interface RendererOptions {
  /** 0.5–1: fraction of the native resolution to render at. Lower it on big TVs if frames drop. */
  renderScale?: number;
  bloom?: number;
}

/** WebGL renderer + post-processing chain (bloom, vignette, tone mapping, MSAA). */
export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.5, 400);
  private composer: EffectComposer;
  private bloom: BloomEffect;
  private renderScale: number;
  onResize: ((w: number, h: number) => void) | null = null;

  constructor(container: HTMLElement, opts: RendererOptions = {}) {
    this.renderScale = opts.renderScale ?? 1;
    this.gl = new THREE.WebGLRenderer({
      powerPreference: 'high-performance',
      antialias: false,
      stencil: false,
      depth: true,
    });
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.gl.domElement);

    this.composer = new EffectComposer(this.gl, {
      frameBufferType: THREE.HalfFloatType,
      multisampling: Math.min(4, this.gl.capabilities.maxSamples),
    });
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new BloomEffect({
      luminanceThreshold: 0.85,
      luminanceSmoothing: 0.2,
      intensity: opts.bloom ?? 0.9,
      mipmapBlur: true,
    });
    this.composer.addPass(
      new EffectPass(
        this.camera,
        this.bloom,
        new VignetteEffect({ darkness: 0.3, offset: 0.4 }),
        new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }),
      ),
    );

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  setRenderScale(scale: number) {
    this.renderScale = scale;
    this.resize();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio, 2) * this.renderScale);
    this.gl.setSize(w, h);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.onResize?.(w, h);
  }

  render(dt: number) {
    this.composer.render(dt);
  }
}

export function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen().catch(() => {});
}
