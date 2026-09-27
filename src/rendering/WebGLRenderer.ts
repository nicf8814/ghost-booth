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

import { generateGridMesh, warpMeshPositions, type ControlPoint } from "../effects/MeshWarp";
import { MESH_WARP_FRAGMENT_SHADER, MESH_WARP_VERTEX_SHADER } from "./shaders/meshWarp";

const GRID_COLS = 48;
const GRID_ROWS = 36;

export class WebGL2MeshWarpRenderer {
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
    const canvas = new OffscreenCanvas(image.width, image.height);
    const gl = canvas.getContext("webgl2");
    if (!gl) {
      throw new Error("WebGL2 context unavailable");
    }

    const mesh = generateGridMesh(GRID_COLS, GRID_ROWS);
    const warpedPositions = warpMeshPositions(mesh, controlPoints);

    const program = createProgram(gl, MESH_WARP_VERTEX_SHADER, MESH_WARP_FRAGMENT_SHADER);
    const vao = mustCreate(gl.createVertexArray(), "vertex array object");
    gl.bindVertexArray(vao);
    gl.useProgram(program);

    const uvBuffer = mustCreate(gl.createBuffer(), "uv buffer");
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
    const uvLoc = gl.getAttribLocation(program, "a_uv");
    gl.enableVertexAttribArray(uvLoc);
    gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 0, 0);

    const posBuffer = mustCreate(gl.createBuffer(), "position buffer");
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, warpedPositions, gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const indexBuffer = mustCreate(gl.createBuffer(), "index buffer");
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);

    const texture = mustCreate(gl.createTexture(), "texture");
    gl.bindTexture(gl.TEXTURE_2D, texture);
    // Our mesh/UV convention is y-down (top of image = 0), matching how an
    // ImageBitmap's rows are laid out; flipping on unpack keeps the
    // fragment shader's `v_uv.y == 0` sampling the top row, not the bottom.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_SHORT, 0);

    // Clean up GPU resources immediately; a booth runs unattended for
    // hours, so leaking a texture/program per photo would eventually
    // exhaust GPU memory (CLAUDE.md section 43's spirit, applied to GPU
    // state rather than IndexedDB).
    gl.deleteTexture(texture);
    gl.deleteBuffer(uvBuffer);
    gl.deleteBuffer(posBuffer);
    gl.deleteBuffer(indexBuffer);
    gl.deleteVertexArray(vao);
    gl.deleteProgram(program);

    return canvas.transferToImageBitmap();
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
