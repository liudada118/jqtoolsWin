 import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

    // 1. 创建 renderer/camera/scene
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(256, 256);
    document.body.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 1;

    // 2. 创建数字图集（0~255）16x16
    function createDigitSpriteSheet() {
        const canvas = document.createElement("canvas");
        
        document.body.appendChild(canvas)
        canvas.width = canvas.height = 512;
        const ctx = canvas.getContext("2d");

        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, 512, 512);

        ctx.fillStyle = "white";
        ctx.font = "bold 18px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        for (let i = 0; i < 256; i++) {
            const x = i % 16;
            const y = Math.floor(i / 16);
            ctx.fillText(i, x * 32 + 16, y * 32 + 16);
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.NearestFilter;
        return tex;
    }

    const spriteSheet = createDigitSpriteSheet();

    // 3. ShaderMaterial：展示指定数字（如 128）
    const digit = 15;
    const tileSize = 1.0 / 16.0;
    const uvOffset = new THREE.Vector2((digit % 16) / 16, Math.floor(digit / 16) / 16);

    const material = new THREE.ShaderMaterial({
        uniforms: {
            map: { value: spriteSheet },
            tileSize: { value: tileSize },
            uvOffset: { value: uvOffset },
        },
        vertexShader: `
    varying vec2 vUv;
    uniform float tileSize;
    uniform vec2 uvOffset;
    void main() {
      vUv = uv * tileSize + uvOffset;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
        fragmentShader: `
    uniform sampler2D map;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(map, vUv);
      if (color.a < 0.1) discard;
      gl_FragColor = color;
    }
  `,
        transparent: true,
    });

    // 4. 创建 Plane 并添加到场景
    const geometry = new THREE.PlaneGeometry(1, 1);
    const mesh = new THREE.Mesh(geometry, material);
    
    scene.add(mesh);

    // 5. 渲染
    renderer.render(scene, camera);