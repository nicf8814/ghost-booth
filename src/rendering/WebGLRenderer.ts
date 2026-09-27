// GPU-tier mesh warp renderer (CLAUDE.md sections 11, 29). Uploads the
// source image as a texture and the mesh from MeshWarp.ts as two vertex
// buffers (original position -> UV, warped position -> on-screen
// position); the GPU rasterizes and samples in one draw call. See
// shaders/meshWarp.ts for why the vertex shader alone is the entire warp.
//
// Runs on an OffscreenCanvas so it works whether called from the main
// thread or (later) a worker. A single warp is one draw call over a small
// mesh (tens of thousands of vertices at most) - well within the <3s
// caricature budget from CLAUDE.md section 31, so for now this runs
// synchronously wherever CaricatureEngine is called from; if profiling on
// real hardware later shows it's worth moving off the main thread, only
// CaricatureEngine's caller needs to change, not this file.
//
// The GL context, compiled program, VAO, and the buffers/texture that
// don't change shape between calls are all created once and reused across
// every warp() call on this instance (CaricatureEngine keeps one
// WebGL2MeshWarpRenderer for the app's whole lifetime -- see
// CaricatureEngine.ts's `this.renderer` caching). The original version of
// this file rebuilt all of that -- including recompiling both shaders --
// on every single call, which meant a group photo (CLAUDE.md section 10
// targets 1-6 people, one warp() call per detected face) paid a full
// shader-compile cost per face. Only the two things that actually change
// per call -- the warped vertex positions (depend on that face's control
// points) and the source texture (a different bitmap each time) -- are
// re-uploaded per call now; everything else is set up once in
// `ensureContext()`.

import { generateGridMesh, warpMeshPositions, type ControlPoint, type GridMesh } from "../effects/MeshWarp";
import { MESH_WARP_FRAGMENT_SHADER, MESH_WARP_VERTEX_SHADER } from "./shaders/meshWarp";

const GRID_COLS = 48;
const GRID_ROWS = 36;

export class WebGL2MeshWarpRenderer {
  private canvas: OffscreenCanvas | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private uvBuffer: WebGLBuffer | null = null;
  private posBuffer: WebGLBuffer | null = null;
  private indexBuffer: WebGLBuffer | null = null;
  private texture: WebGLTexture | null = null;
  private mesh: GridMesh | null = null;

  /** Cheap capability probe; used by CaricatureEngine to pick a tier before committing to this renderer. */
  static isSupported(): boolean {
    try {
      const canvas = new OffscreenCanvas(2, 2);
      return canvas.getContext("webgl2") !== null;
    } catch {
      return false;
    }
  }

  async warp(image: ImageBitmap, controlPoints: readonly ControlPoint[]): Promise<ImageBitmap> {
    const gl = this.ensureContext(image.width, image.height);
    const mesh = this.mesh!;
    const warpedPositions = warpMeshPositions(mesh, controlPoints);

    // Only the warped positions (this face's control points) and the
    // source texture (this call's bitmap) actually change call-to-call;
    // everything else (program, VAO, UV/index buffers, texture params) was
    // already bound once in ensureContext() and stays bound.
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, warpedPositions, gl.DYNAMIC_DRAW);

    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

    gl.viewport(0, 0, this.canvas!.width, this.canvas!.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_SHORT, 0);

    return this.canvas!.transferToImageBitmap();
  }

  /**
   * Releases every cached GL object. Not called anywhere today (the app
   * keeps a single renderer for its whole lifetime -- see
   * CaricatureEngine.ts), but here so a future caller that creates
   * shorter-lived renderers (e.g. per-worker) has a correct way to tear
   * one down instead of just dropping the reference and hoping GC/context
   * loss handles it.
   */
  dispose(): void {
    const gl = this.gl;
    if (!gl) return;
    gl.deleteTexture(this.texture);
    gl.deleteBuffer(this.uvBuffer);
    gl.deleteBuffer(this.posBuffer);
    gl.deleteBuffer(this.indexBuffer);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.program);
    this.canvas = null;
    this.gl = null;
    this.program = null;
    this.vao = null;
    this.uvBuffer = null;
    this.posBuffer = null;
    this.indexBuffer = null;
    this.texture = null;
    this.mesh = null;
  }

  private ensureContext(width: number, height: number): WebGL2RenderingContext {
    if (!this.gl || !this.canvas) {
      const canvas = new OffscreenCanvas(width, height);
      const gl = canvas.getContext("webgl2");
      if (!gl) {
        throw new Error("WebGL2 context unavailable");
      }
      this.canvas = canvas;
      this.gl = gl;

      this.program = createProgram(gl, MESH_WARP_VERTEX_SHADER, MESH_WARP_FRAGMENT_SHADER);
      this.vao = mustCreate(gl.createVertexArray(), "vertex array object");
      gl.bindVertexArray(this.vao);
      gl.useProgram(this.program);

      // Grid topology is fixed (GRID_COLS/GRID_ROWS never change), so the
      // UV layout and index buffer are the same for every call and only
      // need uploading once. Only warpMeshPositions()'s *output* --
      // computed fresh per call from that call's control points -- varies.
      this.mesh = generateGridMesh(GRID_COLS, GRID_ROWS);

      this.uvBuffer = mustCreate(gl.createBuffer(), "uv buffer");
      gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.mesh.positions, gl.STATIC_DRAW);
      const uvLoc = gl.getAttribLocation(this.program, "a_uv");
      gl.enableVertexAttribArray(uvLoc);
      gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 0, 0);

      // Layout is recorded against this buffer now; its *contents* are
      // re-uploaded every warp() call via bufferData in the caller above.
      this.posBuffer = mustCreate(gl.createBuffer(), "position buffer");
      gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
      const posLoc = gl.getAttribLocation(this.program, "a_position");
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

      this.indexBuffer = mustCreate(gl.createBuffer(), "index buffer");
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.mesh.indices, gl.STATIC_DRAW);

      this.texture = mustCreate(gl.createTexture(), "texture");
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }

    // Resize the backing canvas if this call's image is a different size
    // than the last one (e.g. camera resolution changed). Resizing an
    // OffscreenCanvas that already has a live WebGL2 context is well
    // defined -- the context and every GL object created against it stay
    // valid, only the default framebuffer's size changes -- which is why
    // viewport is reset on every call regardless of whether a resize just
    // happened.
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    return this.gl;
  }
}

function mustCreate<T>(value: T | null, what: string): T {
  if (!value) throw new Error(`Failed to create WebGL2 ${what}`);
  return value;
}

function createProgram(gl: WebGL2RenderingContext, vsSource: string, fsSource: string): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
  const program = mustCreate(gl.createProgram(), "program");
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  const ok = gl.getProgramParameter(program, gl.LINK_STATUS) as boolean;
  if (!ok) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`WebGL2 program link failed: ${info}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return program;
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = mustCreate(gl.createShader(type), "shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  const ok = gl.getShaderParameter(shader, gl.COMPILE_STATUS) as boolean;
  if (!ok) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`WebGL2 shader compile failed: ${info}`);
  }
  return shader;
}
