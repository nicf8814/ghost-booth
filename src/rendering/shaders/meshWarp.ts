// WebGL2 mesh-warp shader pair (CLAUDE.md section 11/29). The vertex
// shader is the entire warp: each vertex is uploaded twice, once at its
// original grid position (used as the texture coordinate, `a_uv`) and once
// at its warped position (used as the on-screen position, `a_position`).
// The GPU's own triangle rasterizer + texture sampling does the rest, so
// the fragment shader is a plain passthrough.
//
// `a_position`/`a_uv` are both normalized 0..1 with y-down (top of the
// source image = 0), matching VisionTypes.ts's Point convention. Clip
// space is -1..1 with y-up, hence the flip in the vertex shader.

export const MESH_WARP_VERTEX_SHADER = `#version 300 es
in vec2 a_uv;
in vec2 a_position;
out vec2 v_uv;

void main() {
  v_uv = a_uv;
  vec2 clip = a_position * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
}
`;

export const MESH_WARP_FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_texture;
out vec4 outColor;

void main() {
  outColor = texture(u_texture, v_uv);
}
`;
