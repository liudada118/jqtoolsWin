import React, { useContext, useEffect, useRef } from 'react'
import * as THREE from "three";
import { pageContext } from '../../page/test/Test';

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
        attribute vec2 uvOffset;
        uniform float tileSize;
        varying vec2 vUv;
        void main() {
          vUv = uv * tileSize + uvOffset;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }
      `,
            fragmentShader: `
        uniform sampler2D map;
        varying vec2 vUv;
        void main() {
          gl_FragColor = texture2D(map, vUv);
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
            console.log(new Date().getTime() - oldTime, )
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
