import * as THREE from 'three'

// The ground as a cutaway, the way a botany plate (and the 2D piece) shows a
// plant: the soil in front of the plant is taken away, so the roots grow
// against a vertical section of earth, and the ground surface carries on
// behind that section to the horizon. The section always faces the camera
// and stands a little behind the plant's axis; both surfaces sample one fixed
// 3D soil volume, so turning the cut never makes the texture swim.
//
// Texture is procedural and in metres: sand grains (~0.6 mm), crumbs, small
// stones, clods and horizons (dark humus over lighter, redder subsoil). Each
// octave fades out once it is smaller than a pixel, so the seed's close-up
// shows grains and the ten-year tree shows horizons, never shimmer.
const NOISE = /* glsl */ `
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
// Weight of an octave of frequency f (cycles per metre) at this pixel's footprint.
float lod(float f, float px) { return 1.0 - smoothstep(0.18, 0.5, f * px); }
// Signed grain of the soil volume at p, in about [-1, 1], and stones in [0, 1].
vec2 soilGrain(vec3 p, float px) {
  float g = 0.0;
  g += 0.55 * lod(1700.0, px) * (noise(p * 1700.0) - 0.5);
  g += 0.45 * lod(420.0, px) * (noise(p * 420.0 + 3.1) - 0.5);
  g += 0.40 * lod(110.0, px) * (noise(p * 110.0 + 7.7) - 0.5);
  g += 0.35 * lod(28.0, px) * (noise(p * 28.0 + 1.3) - 0.5);
  g += 0.30 * (noise(p * 6.0 + 5.2) - 0.5);
  // Grit and small stones: rare, rounded (two octaves multiplied), each with
  // its own tone.
  float grit = lod(900.0, px) * smoothstep(0.80, 0.84, noise(p * 900.0 + 11.0) * noise(p * 1800.0 + 2.0) * 1.6);
  float pebble = lod(220.0, px) * smoothstep(0.86, 0.89, noise(p * 220.0 + 23.0) * noise(p * 440.0 + 5.0) * 1.55);
  return vec2(g, min(grit + pebble, 1.0));
}
`

// Written straight to the screen like the sky dome (no output conversion), so
// these are display colours and the haze matches the dome at the horizon.
const display = hex => new THREE.Color(hex).convertLinearToSRGB()
const SOIL_TOP = display('#3b2b1e'), SOIL_SUB = display('#6b4f35'), SOIL_DEEP = display('#7c6043')
const STONE = display('#9a8a74'), DUST = display('#8c7658'), GRASS = display('#5f6f38')

export function createSoil() {
  const group = new THREE.Group()
  group.name = 'soil-cutaway'
  const uniforms = {
    light: { value: 1 }, haze: { value: new THREE.Color() },
    cutPoint: { value: new THREE.Vector3() }, cutNormal: { value: new THREE.Vector3(0, 0, 1) },
    top: { value: SOIL_TOP }, sub: { value: SOIL_SUB }, deep: { value: SOIL_DEEP }, stone: { value: STONE },
    dust: { value: DUST }, grass: { value: GRASS },
  }
  const vertexShader = /* glsl */ `
    varying vec3 wp;
    void main() { vec4 w = modelMatrix * vec4(position, 1.0); wp = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`

  // The section: a vertical face of earth, darker toward its bottom edge.
  const section = new THREE.Mesh(new THREE.PlaneGeometry(80, 40), new THREE.ShaderMaterial({
    uniforms, vertexShader,
    fragmentShader: /* glsl */ `
      uniform vec3 top, sub, deep, stone, haze; uniform float light; varying vec3 wp;
      ${NOISE}
      void main() {
        float px = length(fwidth(wp));
        float d = -wp.y;
        vec2 g = soilGrain(wp, px);
        // Horizons: humus near the top, subsoil below, wavy boundaries.
        float wave = 0.04 * (noise(wp * 3.0) - 0.5);
        vec3 c = mix(top, sub, smoothstep(0.08, 0.45, d + wave));
        c = mix(c, deep, smoothstep(0.9, 2.2, d + wave * 3.0));
        c *= 1.0 + 0.55 * g.x;
        c = mix(c, stone * (0.7 + 0.3 * noise(wp * 900.0)), g.y * 0.6);
        // A thin litter line at the surface, and depth falling into shadow.
        c = mix(c, top * 0.7, smoothstep(0.004, 0.0, d) * 0.6);
        c *= mix(1.0, 0.5, smoothstep(0.6, 3.6, d));
        float far = smoothstep(18.0, 60.0, length(wp - cameraPosition));
        gl_FragColor = vec4(mix(c * light, haze, far), 1.0);
      }`,
  }))
  section.position.y = -20
  section.renderOrder = -1
  group.add(section)

  // The surface behind the cut: dry topsoil with patches of grass, into haze.
  const surface = new THREE.Mesh(new THREE.CircleGeometry(120, 72), new THREE.ShaderMaterial({
    uniforms, vertexShader,
    fragmentShader: /* glsl */ `
      uniform vec3 dust, grass, top, stone, haze, cutPoint, cutNormal; uniform float light; varying vec3 wp;
      ${NOISE}
      void main() {
        // Nothing in front of the cut: that soil was taken away.
        if (dot(wp - cutPoint, cutNormal) > 0.0) discard;
        float px = length(fwidth(wp));
        vec2 g = soilGrain(wp * vec3(1.0, 0.0, 1.0), px);
        float patches = smoothstep(0.45, 0.75, noise(wp * 0.35) * 0.7 + noise(wp * 2.1) * 0.3);
        vec3 c = mix(dust, grass, patches * 0.75);
        c = mix(c, top, smoothstep(0.6, 0.9, noise(wp * 1.3 + 4.0)) * 0.35);
        c *= 1.0 + 0.5 * g.x;
        c = mix(c, stone, g.y * 0.6);
        float far = smoothstep(10.0, 55.0, length(wp.xz - cameraPosition.xz));
        gl_FragColor = vec4(mix(c * light, haze, far), 1.0);
      }`,
  }))
  surface.rotation.x = -Math.PI / 2
  group.add(surface)

  const toward = new THREE.Vector3()
  // Face the camera, behind the plant's axis by `back` metres.
  function update({ camera, target, span, light, haze }) {
    toward.set(camera.position.x - target.x, 0, camera.position.z - target.z)
    if (toward.lengthSq() < 1e-12) toward.set(0, 0, 1)
    toward.normalize()
    const back = Math.min(0.8, Math.max(0.004, span * 0.09))
    uniforms.cutNormal.value.copy(toward)
    uniforms.cutPoint.value.copy(toward).multiplyScalar(-back)
    section.position.set(-toward.x * back, -20, -toward.z * back)
    section.lookAt(section.position.x + toward.x, -20, section.position.z + toward.z)
    uniforms.light.value = light
    uniforms.haze.value.copy(haze)
  }
  function dispose() {
    for (const m of [section, surface]) { m.geometry.dispose(); m.material.dispose() }
    group.removeFromParent()
  }
  return { group, update, dispose }
}
