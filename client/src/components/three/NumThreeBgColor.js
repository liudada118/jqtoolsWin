import React, { useContext, useEffect, useRef } from 'react'
import * as THREE from "three";
import { pageContext } from '../../page/test/Test';

function jet(min, max, x) {
  let red, g, blue;
  let dv;
  red = 1.0;
  g = 1.0;
  blue = 1.0;
  if (x < min) {
    x = min;
  }
  if (x > max) {
    x = max;
  }
  dv = max - min;
  if (x < min + 0.25 * dv) {
    // red = 0;
    // g = 0;
    // blue = 0;

    red = 0;
    g = (4 * (x - min)) / dv;
  } else if (x < min + 0.5 * dv) {
    red = 0;
    blue = 1 + (4 * (min + 0.25 * dv - x)) / dv;
  } else if (x < min + 0.75 * dv) {
    red = (4 * (x - min - 0.5 * dv)) / dv;
    blue = 0;
  } else {
    g = 1 + (4 * (min + 0.75 * dv - x)) / dv;
    blue = 0;
  }
  var rgb = new Array();
  rgb[0] = parseInt(255 * red + '');
  rgb[1] = parseInt(255 * g + '');
  rgb[2] = parseInt(255 * blue + '');
  return rgb;
}

export default function NumThree() {

    const pageInfo = useContext(pageContext);
    console.log('NumThree')
    const pageRef = useRef(pageInfo)

    useEffect(() => {
        pageRef.current = pageInfo
    }, [pageInfo])

    function generateDigitSpriteSheetNew() {
        const canvas = document.createElement('canvas');
        // document.body.appendChild(canvas)
        canvas.width = canvas.height = 512;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, 512, 512);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 20px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let i = 0; i < 256; i++) {
            const x = i % 16;
            const y = Math.floor(i / 16);
            ctx.fillText(i.toString(), x * 32 + 16, y * 32 + 16);
        }

        return new THREE.CanvasTexture(canvas);
    }



    useEffect(() => {
        // 初始化 Three.js
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(1200, 1200);
        document.body.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10000);
        camera.position.z = 1000;

        const texture = generateDigitSpriteSheetNew();
        texture.flipY = false;

        const material = new THREE.ShaderMaterial({
            uniforms: {
                map: { value: texture },
                tileSize: { value: 1.0 / 16.0 }
            },
            vertexShader: `
        attribute vec3 instanceBgColor;
        varying vec3 vBgColor;
        attribute vec2 uvOffset;
        uniform float tileSize;
        varying vec2 vUv;
        void main() {
          vUv = uv * tileSize + uvOffset;
          vBgColor = instanceBgColor;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }
      `,
            fragmentShader: `
        uniform sampler2D map;
        varying vec2 vUv;
        varying vec3 vBgColor;
        void main() {
            vec4 texColor = texture2D(map, vUv);
            vec3 bgColor = vec3(1.0, 0.0, 0.0);  // 🔴 静态红色背景

  // 如果贴图透明，就显示背景色
  if (texColor.a < 0.1) {
    gl_FragColor = vec4(bgColor, 1.0);
    return;
  }

  // 否则混合贴图和背景
  vec3 finalColor = mix(bgColor, texColor.rgb, texColor.a);
  gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
            transparent: true,
            side: THREE.DoubleSide

        });

        const gridSize = 64;
        const count = gridSize * gridSize;
        const geometry = new THREE.PlaneGeometry(0.032, 0.032);

        // const geometry = new THREE.PlaneGeometry(0.1, 0.1);
        const uvOffsets = new Float32Array(count * 2);
        const colorArray = new Float32Array(count * 3);
        const mesh = new THREE.InstancedMesh(geometry, material, count);
        const dummy = new THREE.Object3D();
        // mesh.rotation.x = Math.PI
        for (let i = 0; i < count; i++) {
            const x = i % gridSize;
            const y = Math.floor(i / gridSize);
            // dummy.position.set((x - 31.5) / 32, (y - 31.5) / 32, 0); // 居中

            dummy.position.set((x) / 32, (y) / 32, 0); // 居中
            // dummy.rotation.set(0, Math.PI, 0,)
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);

            const d = 20//Math.floor(Math.random() * 256);
            uvOffsets[i * 2] = (d % 16) / 16;
            uvOffsets[i * 2 + 1] = Math.floor(d / 16) / 16;
        }
        let oldTime = new Date().getTime()


        mesh.rotation.x = Math.PI


        function animate() {

            const data = pageRef.current.equipStatus.data
            console.log(new Date().getTime() - oldTime,)
            // controls.update();
            requestAnimationFrame(animate);
            //  = rangeValue/Math.PI/2
            for (let i = 0; i < count; i++) {
                const x = i % gridSize;
                const y = Math.floor(i / gridSize);
                dummy.position.set((x - 31.5) / 32, (y - 31.5) / 32, 0); // 居中

                // dummy.position.set((x ) / 32, (y ) / 32, 0);
                dummy.updateMatrix();
                mesh.setMatrixAt(i, dummy.matrix);

                const d = data[i]//Math.floor(Math.random() * 256);
                uvOffsets[i * 2] = (d % 16) / 16;
                uvOffsets[i * 2 + 1] = Math.floor(d / 16) / 16;

                // const d = Math.floor(Math.random() * 256);
                const r = d / 255;
                const g = 0.2;
                const b = 1.0 - r;

                colorArray[i * 3 + 0] = r;
                colorArray[i * 3 + 1] = g;
                colorArray[i * 3 + 2] = b;

                // const rgb = jet(0 , 30 , d)

                // colorArray[i * 3 + 0] = rgb[0];
                // colorArray[i * 3 + 1] = rgb[1];
                // colorArray[i * 3 + 2] = rgb[2];

                geometry.setAttribute("instanceBgColor", new THREE.InstancedBufferAttribute(colorArray, 3));
                  geometry.attributes.instanceBgColor.needsUpdate = true;
                geometry.setAttribute('uvOffset', new THREE.InstancedBufferAttribute(uvOffsets, 2));
                geometry.attributes.uvOffset.needsUpdate = true;
              
            }
            renderer.render(scene, camera);
            oldTime = new Date().getTime()

        }

        geometry.setAttribute('uvOffset', new THREE.InstancedBufferAttribute(uvOffsets, 2));
        animate()
        scene.add(mesh);
        renderer.render(scene, camera);

    }, [])




    return (
        <div>

        </div>
    )
}
