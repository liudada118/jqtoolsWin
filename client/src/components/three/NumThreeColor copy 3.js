import React, { useContext, useEffect, useRef } from 'react'
import * as THREE from "three";
import { pageContext } from '../../page/test/Test';
import './canvas.scss'
import { getDisplayType, getSettingValue, getStatus, getSysType, useEquipStore } from '../../store/equipStore';
import { isMoreMatrix } from '../../assets/util/util';

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

export default function NumThree(props) {
  console.log(props)
  let animationRequestId
  const pageInfo = useContext(pageContext);
  console.log('NumThree')
  // const pageRef = useRef(pageInfo)

  // useEffect(() => {
  //   pageRef.current = pageInfo
  // }, [pageInfo])

  // function generateDigitSpriteSheetNew() {
  //     const canvas = document.createElement('canvas');
  //     // document.body.appendChild(canvas)
  //     canvas.width = canvas.height = 512;
  //     const ctx = canvas.getContext('2d');
  //     ctx.fillStyle = 'black';
  //     ctx.fillRect(0, 0, 512, 512);
  //     ctx.fillStyle = 'white';
  //     ctx.font = 'bold 20px monospace';
  //     ctx.textAlign = 'center';
  //     ctx.textBaseline = 'middle';
  //     for (let i = 0; i < 256; i++) {
  //         const x = i % 16;
  //         const y = Math.floor(i / 16);
  //         ctx.fillText(i.toString(), x * 32 + 16, y * 32 + 16);
  //     }

  //     return new THREE.CanvasTexture(canvas);
  // }


  function createDigitSpriteSheetWithJet() {
    const canvas = document.createElement("canvas");
    // document.body.appendChild(canvas)
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext("2d");

    const gridSize = 16;
    const cellSize = 32;

    ctx.font = "bold 20px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let i = 0; i < 256; i++) {
      const x = i % gridSize;
      const y = Math.floor(i / gridSize);
      const cx = x * cellSize;
      const cy = y * cellSize;

      // ✅ 计算背景颜色
      const [r, g, b] = jet(0, 22, i);
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(cx, cy, cellSize, cellSize);

      // ✅ 黑色边框
      ctx.strokeStyle = "black";
      ctx.lineWidth = 1;
      ctx.strokeRect(cx, cy, cellSize, cellSize);

      // ✅ 白色数字
      ctx.fillStyle = "white";
      ctx.fillText(i.toString(), cx + cellSize / 2, cy + cellSize / 2);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.flipY = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.NearestFilter;
    return tex;
  }

  // let data  = useEquipStore(s => s.status); 
  // console.log(data)

  useEffect(() => {
    // 初始化 Three.js

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    let height
    if (window.innerHeight < 750) {
      height = window.innerHeight * 0.5
    } else {
      height = window.innerHeight * 0.65
    }

    renderer.setSize(height, height);

  const canvasNum = document.querySelector('.canvasNum')
    if (canvasNum.childNodes.length == 0) {
      console.log(canvasNum.childNodes.length)
      renderer.domElement.classList.add('canvasThree')
      canvasNum.appendChild(renderer.domElement);

      const canvasRuler = document.createElement('canvas');
      canvasRuler.style.width = `${height}px`
      canvasRuler.style.height = `${height}px`
      canvasRuler.width = `${height}`
      canvasRuler.height = `${height}`
      canvasRuler.style.position = 'absolute'
      canvasRuler.className = 'canvasRuler'
      canvasNum.appendChild(canvasRuler);
    }


    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10000);
    camera.position.z = 1000;

    const texture = createDigitSpriteSheetWithJet();
    // texture.flipY = false;


    const material = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: texture },
        tileSize: { value: 1.0 / 16.0 }
      },
      vertexShader: `
        attribute vec3 instanceColor;
        varying vec3 vColor;
        attribute vec2 uvOffset;
        uniform float tileSize;
        varying vec2 vUv;
        void main() {
          vUv = uv * tileSize + uvOffset;
          vColor = instanceColor;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D map;
        varying vec2 vUv;
        varying vec3 vColor;

        vec3 linearToSRGB(vec3 color) {
  return pow(color*1.5, vec3(1.0 / 2.2));  // Gamma 矫正
}

        void main() {
          vec4 texColor = texture2D(map, vUv);
          if (texColor.a < 0.1) discard;

           vec3 rgb = texColor.rgb * vColor; // 染色
            rgb = linearToSRGB(rgb);   

            // 乘以格子颜色
          gl_FragColor = vec4(rgb, texColor.a);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: true,
      depthTest: true,

    });

    material.toneMapped = false;
    // size为1就是64矩阵
    const { width: numWitdh, height: numHeight } = props
    let gridSize = numWitdh, gridSize1 = numHeight//64 / size;


    console.log(gridSize, 'gridSizegridSize')
    // 总大小  64 * 0.032

    let count = gridSize * gridSize;
    const geometry = new THREE.PlaneGeometry(2.048 / gridSize, 2.048 / gridSize);

    // const geometry = new THREE.PlaneGeometry(0.1, 0.1);
    let uvOffsets = new Float32Array(count * 2);
    const colorArray = new Float32Array(count * 3);
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    const dummy = new THREE.Object3D();
    // mesh.rotation.x = Math.PI
    // for (let i = 0; i < count; i++) {
    //   const x = i % gridSize;
    //   const y = Math.floor(i / gridSize);
    //   // dummy.position.set((x - 31.5) / 32, (y - 31.5) / 32, 0); // 居中

    //   dummy.position.set((x) / (gridSize / 2), (y) / (gridSize / 2), 0); // 居中
    //   // dummy.rotation.set(0, Math.PI, 0,)
    //   dummy.updateMatrix();
    //   mesh.setMatrixAt(i, dummy.matrix);

    //   const d = 20//Math.floor(Math.random() * 256);
    //   uvOffsets[i * 2] = (d % 16) / 16;
    //   uvOffsets[i * 2 + 1] = Math.floor(d / 16) / 16;
    // }
    let oldTime = new Date().getTime()


    mesh.rotation.x = Math.PI


    function animate() {

      // let data = pageRef.current.equipStatus.data
      // let data = getStatus()
      // console.log(data)
      let data = new Array(4096).fill(0)

      const systemType = getSysType()
      const displayType = getDisplayType()

      // if (props.sitData.current && Object.keys(props.sitData.current).length > 1) {
      //   const key = Object.keys(props.sitData.current)[0]
      //   console.log(props.sitData.current)
      //   const
      //     data = props.sitData.current[key]
      // }
      // const data = props.sitData.current

      if (isMoreMatrix(systemType)) {
        if (displayType != 'all') {
          let realType = ''
          if (displayType == 'back2D') {
            realType = "back"
          } else if (displayType == 'sit2D') {
            realType = "sit"
            // if(systemType == 'endi'){
            //   gridSize = 45
            //   count = gridSize * gridSize;
            //   uvOffsets = new Float32Array(count * 2);
            // }
          }
          data = props.sitData.current[realType]
          if (!data) data = new Array(4096).fill(0)
        }
      } else {
        data = props.sitData.current[systemType]
        if (!data) data = new Array(4096).fill(0)
      }



      const {
        gauss, color, filter, height, coherent,
      } = getSettingValue() //pageRef.current.settingValue
      // const { wsLocalData } = pageRef.current
      // if (wsLocalData) {
      //   data = data.map((a, index) => {
      //     if (a - wsLocalData[index] < 0) {
      //       return 0
      //     } else {
      //       return a - wsLocalData[index]
      //     }
      //   })
      // }

      // if (filter) {
      //   data = data.map((a) => {
      //     if (a < filter) {
      //       return 0
      //     } else {
      //       return a
      //     }
      //   })
      // }



      // console.log(new Date().getTime() - oldTime,)
      // controls.update();
      animationRequestId = requestAnimationFrame(animate);
      //  = rangeValue/Math.PI/2

      // console.log(count)
      for (let i = 0; i < count; i++) {
        const x = i % gridSize;
        const y = Math.floor(i / gridSize);
        dummy.position.set((x - (gridSize / 2 - 0.5)) / (gridSize / 2), (y - (gridSize / 2 - 0.5)) / (gridSize / 2), 0); // 居中

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

        geometry.setAttribute("instanceColor", new THREE.InstancedBufferAttribute(colorArray, 3));
        geometry.attributes.instanceColor.needsUpdate = true;
        geometry.setAttribute('uvOffset', new THREE.InstancedBufferAttribute(uvOffsets, 2));
        // console.log(uvOffsets.length)
        geometry.attributes.uvOffset.needsUpdate = true;

      }
      renderer.render(scene, camera);
      oldTime = new Date().getTime()

    }

    geometry.setAttribute('uvOffset', new THREE.InstancedBufferAttribute(uvOffsets, 2));
    animate()
    scene.add(mesh);
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.render(scene, camera);

    return () => {
      cancelAnimationFrame(animationRequestId);
    };

  }, [])

  // useEffect(() => {

  // }, [])




  return (
    <div className='canvasNum' >

    </div>
  )
}
