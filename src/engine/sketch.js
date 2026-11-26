// Battle with Ideas: the Boredom's pencil-sketch look (grey, paper-tinted, cross-hatched) and the colour wave that paints it back.

import * as THREE from 'three';

export const SKETCH = {
  uColor: { value: 0 },
  uOrigin: { value: new THREE.Vector2() },
  uRadius: { value: -100 },
  uTint: { value: new THREE.Color('#ffffff') },
  uTintAmt: { value: 0 },
};

const VERT_HEAD = 'varying vec3 vSkW;\n';
const VERT_BODY = `
#ifdef USE_INSTANCING
  vSkW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
  vSkW = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif
`;
const FRAG_HEAD = 'varying vec3 vSkW;\nuniform float uColor; uniform vec2 uOrigin; uniform float uRadius; uniform vec3 uTint; uniform float uTintAmt;\n';
export const REVEAL_GLSL = `
  float skD = length(vSkW.xz - uOrigin);
  float skN = fract(sin(dot(floor(vSkW.xz * 1.5), vec2(12.9898, 78.233))) * 43758.5453);
  float skReveal = smoothstep(uRadius + 0.5, uRadius - 2.0, skD + skN * 1.6);
`;
const FRAG_BODY = `
{
  ${REVEAL_GLSL}
  float lum = dot(outgoingLight, vec3(0.299, 0.587, 0.114));
  vec3 sk = vec3(0.07 + lum * 0.93) * vec3(1.0, 0.985, 0.95);
  float hA = sin((gl_FragCoord.x + gl_FragCoord.y) * 0.8);
  float hB = sin((gl_FragCoord.x - gl_FragCoord.y) * 0.8);
  float hatch = max(step(0.62, hA) * smoothstep(0.66, 0.3, lum), step(0.62, hB) * smoothstep(0.42, 0.12, lum));
  sk *= 1.0 - hatch * 0.3;
  float k = max(uColor, skReveal);
  vec3 col = mix(outgoingLight, outgoingLight * uTint * 1.25, uTintAmt);
  outgoingLight = mix(sk, col, k);
}
`;

export function sketchify(mat, extra = null) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, SKETCH);
    if (extra) Object.assign(sh.uniforms, extra.uniforms);
    sh.vertexShader = VERT_HEAD + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT_BODY);
    let fs = FRAG_HEAD + (extra && extra.head ? extra.head : '') + sh.fragmentShader;
    if (extra && extra.map) fs = fs.replace('#include <map_fragment>', extra.map);
    sh.fragmentShader = fs.replace('#include <opaque_fragment>', FRAG_BODY + '#include <opaque_fragment>');
  };
  mat.customProgramCacheKey = () => 'sketch' + (extra ? extra.key : '');
  mat.needsUpdate = true;
  return mat;
}
