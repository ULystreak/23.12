/* Um ajudante mínimo de WebGL 2: contexto, programa e um quadrado de tela inteira.
   As pétalas e o céu do filme usam isto. Sem WebGL, cada cena tem a sua versão mais leve. */

window.GL = (() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Um aparelho mais fraco recebe menos pétalas e um céu em resolução menor. */
  const tier = (() => {
    const cores = navigator.hardwareConcurrency || 4;
    const mem = navigator.deviceMemory || 4;
    if (cores <= 4 || mem <= 3) return "low";
    return "high";
  })();

  function context(canvas) {
    try {
      const gl = canvas.getContext("webgl2", {
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: true,
        preserveDrawingBuffer: false,
        powerPreference: "high-performance",
      });
      if (!gl) return null;
      // alguns navegadores devolvem um contexto que não desenha nada (software bloqueado)
      if (gl.isContextLost && gl.isContextLost()) return null;
      return gl;
    } catch (err) {
      return null;
    }
  }

  function shader(gl, type, source) {
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn("Shader:", gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  function program(gl, vertex, fragment) {
    const vs = shader(gl, gl.VERTEX_SHADER, vertex);
    const fs = shader(gl, gl.FRAGMENT_SHADER, fragment);
    if (!vs || !fs) return null;
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.warn("Programa:", gl.getProgramInfoLog(p));
      return null;
    }
    const cache = new Map();
    const uniform = (name) => {
      if (!cache.has(name)) cache.set(name, gl.getUniformLocation(p, name));
      return cache.get(name);
    };
    return { handle: p, uniform };
  }

  /* Um triângulo que cobre a tela inteira (mais barato que dois). */
  function fullscreen(gl) {
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    return buf;
  }

  return { context, program, fullscreen, tier, reduce };
})();
