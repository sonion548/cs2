// Teammate outlines: a white glow around allies that shows through walls.
// Per ally, the lowest-detail body is drawn three more times on the same
// skeleton:
//   1. a stencil mask of the silhouette (no colour, ignores depth)
//   2. a fattened copy, a few pixels wider on screen, drawn only outside the
//      mask and only where something stands in front of it (depth "greater"),
//      so the outline appears exactly where the ally is hidden
//   3. a wider, fainter copy of 2 for the glow
// Needs a renderer created with { stencil: true }.
import * as THREE from 'three';

const uniforms = { uPx: { value: 2.5 }, uRes: { value: new THREE.Vector2(1920, 1080) } };

// push each vertex out along its (skinned) normal by a fixed number of pixels
function fatten(mat, px) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uPx = { value: px };
    sh.uniforms.uScale = uniforms.uPx;
    sh.uniforms.uRes = uniforms.uRes;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uPx;\nuniform float uScale;\nuniform vec2 uRes;')
      .replace('#include <project_vertex>', `#include <project_vertex>
{
  vec2 dir = (projectionMatrix * vec4(normalize(normalMatrix * objectNormal), 0.0)).xy;
  float len = length(dir);
  if (len > 1e-5) gl_Position.xy += dir / len * (uPx * uScale) * 2.0 / uRes * gl_Position.w;
}`);
  };
  mat.customProgramCacheKey = () => 'ally-outline-' + px;
  return mat;
}

const maskMat = new THREE.MeshBasicMaterial({
  colorWrite: false, depthWrite: false, depthTest: false,
  stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc,
  stencilFail: THREE.ReplaceStencilOp, stencilZFail: THREE.ReplaceStencilOp, stencilZPass: THREE.ReplaceStencilOp,
});
const ringMat = (px, opacity) => fatten(new THREE.MeshBasicMaterial({
  color: 0xffffff, transparent: true, opacity, depthWrite: false, depthTest: true, depthFunc: THREE.GreaterDepth,
  stencilWrite: true, stencilWriteMask: 0, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc,
  stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp,
}), px);
const lineMat = ringMat(2.0, 0.95);
const glowMat = ringMat(6.0, 0.4);

function sourceMesh(model) {
  const lods = model.userData?.lods;
  if (lods?.length) return lods[lods.length - 1];
  let found = null;
  model.traverse(o => { if (!found && o.isSkinnedMesh) found = o; });
  return found;
}

function build(model) {
  const src = sourceMesh(model);
  if (!src) return null;
  const parts = [[maskMat, 60], [lineMat, 61], [glowMat, 62]].map(([mat, order]) => {
    const m = new THREE.SkinnedMesh(src.geometry, mat);
    m.bind(src.skeleton, src.bindMatrix);
    m.position.copy(src.position); m.quaternion.copy(src.quaternion); m.scale.copy(src.scale);
    m.renderOrder = order;
    m.frustumCulled = false;
    m.castShadow = false; m.receiveShadow = false;
    m.userData.outline = true;
    src.parent.add(m);
    return m;
  });
  return parts;
}

export class Outlines {
  constructor(game) {
    this.g = game;
    this.size = new THREE.Vector2();
  }

  update() {
    const g = this.g;
    const on = g.settings.allyOutline !== false;
    g.renderer.getDrawingBufferSize(this.size);
    uniforms.uRes.value.copy(this.size);
    // widths are in pixels at 1080p; scale with the real buffer height so the
    // outline looks the same at any resolution or render scale
    uniforms.uPx.value = Math.max(0.6, this.size.y / 1080);
    // whose allies: yours, or the team you're watching
    const team = g.player?.alive ? g.playerTeam : (g.spec?.target?.team || g.playerTeam);
    for (const ch of g.characters) {
      const m = ch.model;
      if (!m) continue;
      const want = on && ch !== g.player && ch.team === team && ch.alive && !ch.despawned;
      if (want && !m.userData.outline) m.userData.outline = build(m) || [];
      const parts = m.userData.outline;
      if (parts) for (const p of parts) p.visible = want;
    }
  }
}
