/** .cube 3D LUT parsing + WebGL application (all local). */
export interface Lut { size: number; data: Float32Array }

export function parseCube(text: string): Lut | null {
  let size = 0;
  const vals: number[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("TITLE") || line.startsWith("DOMAIN")) continue;
    if (line.startsWith("LUT_3D_SIZE")) { size = parseInt(line.split(/\s+/)[1]); continue; }
    if (line.startsWith("LUT_1D")) return null;
    const p = line.split(/\s+/).map(Number);
    if (p.length >= 3 && p.every((n) => !isNaN(n))) vals.push(p[0], p[1], p[2]);
  }
  if (!size || vals.length < size ** 3 * 3) return null;
  return { size, data: new Float32Array(vals.slice(0, size ** 3 * 3)) };
}

const VS = `attribute vec2 p; varying vec2 uv; void main(){ uv=vec2(p.x*.5+.5, .5-p.y*.5); gl_Position=vec4(p,0.,1.); }`;
// 3D LUT stored as a 2D strip: size slices laid out horizontally (width size*size, height size)
const FS = `precision highp float; varying vec2 uv; uniform sampler2D img; uniform sampler2D lut; uniform float size; uniform float amt;
vec3 sampleSlice(float slice, vec2 rg){
  float w = size*size;
  float x = (slice*size + rg.x*(size-1.) + .5)/w;
  float y = (rg.y*(size-1.) + .5)/size;
  return texture2D(lut, vec2(x,y)).rgb;
}
void main(){
  vec4 c = texture2D(img, uv);
  float b = c.b*(size-1.);
  float s0 = floor(b), s1 = min(s0+1., size-1.);
  vec3 a = sampleSlice(s0, c.rg), d = sampleSlice(s1, c.rg);
  vec3 o = mix(a, d, b - s0);
  gl_FragColor = vec4(mix(c.rgb, o, amt), c.a);
}`;

let gl: WebGLRenderingContext | null = null;
let glCanvas: HTMLCanvasElement | null = null;
let prog: WebGLProgram | null = null;
const lutTex = new WeakMap<Lut, WebGLTexture>();
let imgTex: WebGLTexture | null = null;

function init() {
  if (gl) return true;
  glCanvas = document.createElement("canvas");
  gl = glCanvas.getContext("webgl", { premultipliedAlpha: false, preserveDrawingBuffer: true });
  if (!gl) return false;
  const sh = (t: number, s: string) => { const x = gl!.createShader(t)!; gl!.shaderSource(x, s); gl!.compileShader(x); return x; };
  prog = gl.createProgram()!;
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  imgTex = gl.createTexture();
  return true;
}

/** applies `lut` to `src` (drawn at width×height) and returns a canvas with the result */
export function applyLut(src: CanvasImageSource, w: number, h: number, lut: Lut, amt: number): HTMLCanvasElement | null {
  if (!init() || !gl || !glCanvas || !prog) return null;
  w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
  if (glCanvas.width !== w || glCanvas.height !== h) { glCanvas.width = w; glCanvas.height = h; }
  gl.viewport(0, 0, w, h);
  gl.useProgram(prog);
  let lt = lutTex.get(lut);
  if (!lt) {
    // repack N^3 table (r fastest, then g, then b) into a strip: x = b*N + r, y = g
    const n = lut.size, strip = new Uint8Array(n * n * n * 4);
    for (let b = 0; b < n; b++) for (let g = 0; g < n; g++) for (let r = 0; r < n; r++) {
      const si = (b * n * n + g * n + r) * 3;
      const di = (g * (n * n) + b * n + r) * 4;
      strip[di] = Math.round(lut.data[si] * 255); strip[di + 1] = Math.round(lut.data[si + 1] * 255); strip[di + 2] = Math.round(lut.data[si + 2] * 255); strip[di + 3] = 255;
    }
    lt = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, lt);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, n * n, n, 0, gl.RGBA, gl.UNSIGNED_BYTE, strip);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    lutTex.set(lut, lt);
  }
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, imgTex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src as TexImageSource);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, lt);
  gl.uniform1i(gl.getUniformLocation(prog, "img"), 0);
  gl.uniform1i(gl.getUniformLocation(prog, "lut"), 1);
  gl.uniform1f(gl.getUniformLocation(prog, "size"), lut.size);
  gl.uniform1f(gl.getUniformLocation(prog, "amt"), amt);
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  return glCanvas;
}
