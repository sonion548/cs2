// Character outlines.
//   Allies: a white glow that shows through walls, so you know where your team is.
//   Enemies: a red glow around them while they are in plain view (never through
//   walls or smoke), so they stand out against the map.
// Per character, the lowest-detail body is drawn three more times on the same
// skeleton:
//   1. a stencil mask of the silhouette (no colour, ignores depth)
//   2. a fattened copy, a few pixels wider on screen, drawn only outside the
//      mask. Allies: only where something stands in front of it (depth
//      "greater"), so the outline appears exactly where they are hidden.
//      Enemies: only where nothing does (normal depth test).
//   3. a wider, fainter copy of 2 for the glow
// Allies and enemies use separate stencil bits, so overlapping outlines don't
// cut into each other. Needs a renderer created with { stencil: true }.
import * as THREE from 'three';

const uniforms = { uPx: { value: 2.5 }, uRes: { value: new THREE.Vector2(1920, 1080) } };

// push each vertex out along its (skinned) normal by a fixed number of pixels
function fatten(mat, px, key) {
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
  mat.customProgramCacheKey = () => key + '-outline-' + px;
  return mat;
}

function styleMaterials({ bit, color, depthFunc, line, glow, key }) {
  const mask = new THREE.MeshBasicMaterial({
    colorWrite: false, depthWrite: false, depthTest: false,
    stencilWrite: true, stencilRef: bit, stencilWriteMask: bit, stencilFuncMask: bit, stencilFunc: THREE.AlwaysStencilFunc,
    stencilFail: THREE.ReplaceStencilOp, stencilZFail: THREE.ReplaceStencilOp, stencilZPass: THREE.ReplaceStencilOp,
  });
  const ring = (px, opacity) => fatten(new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, depthWrite: false, depthTest: true, depthFunc,
    stencilWrite: true, stencilWriteMask: 0, stencilRef: bit, stencilFuncMask: bit, stencilFunc: THREE.NotEqualStencilFunc,
    stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp,
  }), px, key);
  return [mask, ring(...line), ring(...glow)];
}

const STYLES = {
  ally: styleMaterials({ key: 'ally', bit: 1, color: 0xffffff, depthFunc: THREE.GreaterDepth, line: [2.0, 0.95], glow: [6.0, 0.4] }),
  enemy: styleMaterials({ key: 'enemy', bit: 2, color: 0xff2a22, depthFunc: THREE.LessEqualDepth, line: [1.1, 0.95], glow: [3.0, 0.3] }),
};

function sourceMesh(model) {
  const lods = model.userData?.lods;
  if (lods?.length) return lods[lods.length - 1];
  let found = null;
  model.traverse(o => { if (!found && o.isSkinnedMesh && !o.userData.outline) found = o; });
  return found;
}

function build(model, style) {
  const src = sourceMesh(model);
  if (!src) return [];
  return STYLES[style].map((mat, i) => {
    const m = new THREE.SkinnedMesh(src.geometry, mat);
    m.bind(src.skeleton, src.bindMatrix);
    m.position.copy(src.position); m.quaternion.copy(src.quaternion); m.scale.copy(src.scale);
    m.renderOrder = 60 + i;   // masks first, then lines, then glows
    m.frustumCulled = false;
    m.castShadow = false; m.receiveShadow = false;
    m.userData.outline = true;
    src.parent.add(m);
    return m;
  });
}

export class Outlines {
  constructor(game) {
    this.g = game;
    this.size = new THREE.Vector2();
    this.eye = new THREE.Vector3();
    this.chest = new THREE.Vector3();
  }

  // An enemy's red outline would show through a smoke cloud (it's drawn after
  // the smoke), so it is left off while smoke covers the line to them.
  smokeHides(ch) {
    const gr = this.g.grenades;
    if (!gr?.smokes.length) return false;
    const cam = this.g.camera.position;
    if (gr.smokeAt?.(cam) > 0.35) return true;
    this.chest.copy(ch.pos); this.chest.y += 1.1;
    if (!gr.blocksSight(cam, this.chest)) return false;
    this.eye.copy(ch.pos); this.eye.y += 1.6;
    return gr.blocksSight(cam, this.eye);
  }

  // Builds every character's outline meshes ahead of time and leaves them
  // visible for one shader warm-up (Game compiles the scene while the match
  // loads), so the first enemy you see doesn't stall the frame while its
  // outline shaders compile. The next update() hides what isn't needed.
  prewarm(chars = this.g.characters) {
    for (const ch of chars) {
      if (!ch.model || ch === this.g.player) continue;
      const o = ch.model.userData.outlines ||= {};
      o.ally ||= build(ch.model, 'ally');
      o.enemy ||= build(ch.model, 'enemy');
      for (const p of [...o.ally, ...o.enemy]) p.visible = true;
    }
  }

  update() {
    const g = this.g;
    const allies = g.settings.allyOutline !== false, enemies = g.settings.enemyOutline !== false;
    g.renderer.getDrawingBufferSize(this.size);
    uniforms.uRes.value.copy(this.size);
    // widths are in pixels at 1080p; scale with the real buffer height so the
    // outline looks the same at any resolution or render scale
    uniforms.uPx.value = Math.max(0.6, this.size.y / 1080);
    // whose side: yours, or the team you're watching
    const team = g.player?.alive ? g.playerTeam : (g.spec?.target?.team || g.playerTeam);
    for (const ch of g.characters) {
      const m = ch.model;
      if (!m) continue;
      const live = ch !== g.player && ch.alive && !ch.despawned;
      const ally = live && allies && ch.team === team;
      const enemy = live && enemies && ch.team !== team && !this.smokeHides(ch);
      const o = m.userData.outlines ||= {};
      if (ally && !o.ally) o.ally = build(m, 'ally');
      if (enemy && !o.enemy) o.enemy = build(m, 'enemy');
      if (o.ally) for (const p of o.ally) p.visible = ally;
      if (o.enemy) for (const p of o.enemy) p.visible = enemy;
    }
  }
}
