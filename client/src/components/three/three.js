import Stats from "three/examples/jsm/libs/stats.module.js";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { TrackballControls } from "three/examples/jsm/controls/TrackballControls";
import React, { useEffect, useImperativeHandle, useRef, useState } from "react";
import { TextureLoader } from "three";
import * as TWEEN from '@tweenjs/tween.js'
import {
  addSide,
  findMax,
  gaussBlur_1,
  gaussBlur_return,
  interp,
  interp1016,
  interpSquare,
  jet,
  jetgGrey,
} from "../../util/util";
import gsap from "gsap";

let group = new THREE.Group();
const sitInit = 0;
const backInit = 0;
var animationRequestId
const sitnum1 = 16;
const sitnum2 = 64;
const sitInterp = 2;
const sitOrder = 4;
const backnum1 = 16;
const backnum2 = 32;
const backInterp = 2;
const backOrder = 4;
let controlsFlag = true;

let timer

function debounce(fn, time) {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    fn()
  }, time);
}

var FPS = 10;
var timeS = 0;
var renderT = 1 / FPS;
let totalArr = [],
  totalPointArr = [];
let local
let camera
let particles,
  particles1,
  material,
  backGeometry,
  sitGeometry
let controls;
const Canvas = React.forwardRef((props, refs) => {
  console.log('render')
  local = props.local
  var animationRequestId, colSelectFlag = false
  let dataFlag = false;
  const changeDataFlag = () => {
    dataFlag = true;

  };


  let container, stats;

  let scene, renderer;


  const clock = new THREE.Clock();
  const ALT_KEY = 18;
  const CTRL_KEY = 17;
  const CMD_KEY = 91;
  const AMOUNTX = sitnum1 * sitInterp + sitOrder * 2;
  const AMOUNTY = sitnum2 * sitInterp + sitOrder * 2;
  const SEPARATION = 100;
  // let group = new THREE.Group();
  const groupX = 0, groupY = 0, groupZ = 0

  let positions;
  let colors, scales;

  function init() {
    container = document.getElementById(`canvas`);

    camera = new THREE.PerspectiveCamera(
      40,
      window.innerWidth / window.innerHeight,
      1,
      150000
    );


    camera.position.z = 150;
    camera.position.y = 0;

    scene = new THREE.Scene();

    // model
    const loader = new GLTFLoader();



    initSet();
    initBack()
    // initMovePoint()
    group.position.x = groupX
    group.position.y = groupY
    group.position.z = groupZ
    scene.add(group);
    const helper = new THREE.GridHelper(2000, 100);
    helper.position.y = -199;
    helper.material.opacity = 0.25;
    helper.material.transparent = true;
    scene.add(helper);

    // lights
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444);
    hemiLight.position.set(0, 200, 0);
    scene.add(hemiLight);
    const dirLight = new THREE.DirectionalLight(0xffffff);
    dirLight.position.set(0, 200, 10);
    scene.add(dirLight);
    const dirLight1 = new THREE.DirectionalLight(0xffffff);
    dirLight1.position.set(0, 10, 200);
    scene.add(dirLight1);

    // renderer

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setAnimationLoop(animate);
    renderer.setPixelRatio(window.devicePixelRatio);
    // renderer.setSize(window.innerWidth, window.innerHeight);

    renderer.setSize(window.innerWidth, window.innerHeight);

    container.appendChild(renderer.domElement);

    renderer.setClearColor(0x000000);

    //FlyControls
    controls = new TrackballControls(camera, renderer.domElement);
    controls.update();
    window.addEventListener("resize", onWindowResize);



  }
  let pointParticles
  function initMovePoint() {
    const SEPARATION = 100, AMOUNTX = 50, AMOUNTY = 50;
    const numParticles = AMOUNTX * AMOUNTY;

    const positions = new Float32Array(numParticles * 3);
    const scales = new Float32Array(numParticles);

    let i = 0, j = 0;

    for (let ix = 0; ix < AMOUNTX; ix++) {

      for (let iy = 0; iy < AMOUNTY; iy++) {

        positions[i] = ix * SEPARATION - ((AMOUNTX * SEPARATION) / 2); // x
        positions[i + 1] = 0; // y
        positions[i + 2] = iy * SEPARATION - ((AMOUNTY * SEPARATION) / 2); // z

        scales[j] = 1;

        i += 3;
        j++;

      }

    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('scale', new THREE.BufferAttribute(scales, 1));

    const material = new THREE.ShaderMaterial({

      uniforms: {
        color: { value: new THREE.Color(0xffffff) },
      },
      vertexShader: document.getElementById('vertexshader').textContent,
      fragmentShader: document.getElementById('fragmentshader').textContent

    });

    //

    pointParticles = new THREE.Points(geometry, material);
    scene.add(pointParticles);
  }



  //   初始化座椅
  function initSet() {
    const numParticles = AMOUNTX * AMOUNTY;
    positions = new Float32Array(numParticles * 3);
    scales = new Float32Array(numParticles);
    colors = new Float32Array(numParticles * 3);
    let i = 0,
      j = 0;

    for (let ix = 0; ix < AMOUNTX; ix++) {
      for (let iy = 0; iy < AMOUNTY; iy++) {
        positions[i] = ix * SEPARATION - (AMOUNTX * SEPARATION) / 2 + ix * 20; // x
        positions[i + 1] = 0; // y
        positions[i + 2] = iy * SEPARATION - (AMOUNTY * SEPARATION) / 2; // z

        scales[j] = 1;
        colors[i] = 0 / 255;
        colors[i + 1] = 0 / 255;
        colors[i + 2] = 255 / 255;
        i += 3;
        j++;
      }
    }

    sitGeometry = new THREE.BufferGeometry();
    sitGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3)
    );
    function getTexture() {
      return new TextureLoader().load("");
    }
    // require("../../assets/images/circle.png")
    const spite = new THREE.TextureLoader().load("./circle.png");
    material = new THREE.PointsMaterial({
      vertexColors: true,
      transparent: true,
      //   color: 0xffffff,
      map: spite,
      size: 1,
    });
    sitGeometry.setAttribute("scale", new THREE.BufferAttribute(scales, 1));
    sitGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    particles = new THREE.Points(sitGeometry, material);

    particles.scale.x = 0.0062;
    particles.scale.y = 0.0062;
    particles.scale.z = 0.0062;


    particles.rotation.x = Math.PI / 2;
    group.add(particles);

  }


  function initBack() {
    const AMOUNTX = 32 * sitInterp + sitOrder * 2;
    const AMOUNTY = 32 * sitInterp + sitOrder * 2;
    const numParticles = AMOUNTX * AMOUNTY;
    positions = new Float32Array(numParticles * 3);
    scales = new Float32Array(numParticles);
    colors = new Float32Array(numParticles * 3);
    let i = 0,
      j = 0;

    for (let ix = 0; ix < AMOUNTX; ix++) {
      for (let iy = 0; iy < AMOUNTY; iy++) {
        positions[i] = 6000 + ix * SEPARATION - (AMOUNTX * SEPARATION) / 2 + ix * 20; // x
        positions[i + 1] = 0; // y
        positions[i + 2] = iy * SEPARATION - (AMOUNTY * SEPARATION) / 2; // z

        scales[j] = 1;
        colors[i] = 0 / 255;
        colors[i + 1] = 0 / 255;
        colors[i + 2] = 255 / 255;
        i += 3;
        j++;
      }
    }

    backGeometry = new THREE.BufferGeometry();
    backGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3)
    );
    function getTexture() {
      return new TextureLoader().load("");
    }
    // require("../../assets/images/circle.png")
    const spite = new THREE.TextureLoader().load("./circle.png");
    const material = new THREE.PointsMaterial({
      vertexColors: true,
      transparent: true,
      //   color: 0xffffff,
      map: spite,
      size: 1,
    });
    backGeometry.setAttribute("scale", new THREE.BufferAttribute(scales, 1));
    backGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const particles = new THREE.Points(backGeometry, material);

    particles.scale.x = 0.0062;
    particles.scale.y = 0.0062;
    particles.scale.z = 0.0062;


    particles.rotation.x = Math.PI / 2;

    // particles.position.x = 2000

    console.log(particles)

    // group.add(particles);

  }

  function tweenToModel(index) {
    const attr = sitGeometry.attributes.position;
    const attrTo = backGeometry.attributes.position;
    const from = attr.array.slice(); // 起始状态的拷贝
    const to = attrTo.array.slice()   // 目标 Float32Array（已准备好）

    const offsets = Array.from({ length: attr.count }, () => Math.random() * 0.5); // 每个点一个随机偏移


    // gsap.to({ t: 0 }, {
    //   t: 1,
    //   duration: 3,
    //   ease: 'power2.inOut',
    //    delay: Math.random() * 1.0,
    //   onUpdate() {
    //     const t = this.targets()[0].t;
    //     const pos = attr.array;
    //     for (let i = 0; i < pos.length; i++) {
    //       pos[i] = from[i] * (1 - t) + to[i] * t;
    //     }
    //     attr.needsUpdate = true;
    //   }
    // });

    const date = new Date().getTime()
    for (let i = 0; i < attr.count; i++) {
      const i3 = i * 3;
      const toi3 = (i % to.length) * 3
      const tweenObj = {
        x: from[i3],
        y: from[i3 + 1],
        z: from[i3 + 2]
      };

      // i3 = (i % to.length) * 3

      gsap.to(tweenObj, {

        // const endPoint = target[i % target.length];

        x: to[toi3],
        y: to[toi3 + 1],
        z: to[toi3 + 2],
        duration: 1.5,
        ease: 'expo.inOut',
        delay: Math.random() * 1.0,
        onUpdate() {
          attr.array[i3] = tweenObj.x;
          attr.array[i3 + 1] = tweenObj.y;
          attr.array[i3 + 2] = tweenObj.z;
          attr.needsUpdate = true;
          // pointParticles.rotation.x = Math.PI/2
        },
        onComplete() {
           
        }
      });
    }
    console.log(new Date().getTime() - date, 'date')
  }



  //  function morphSitToBack(sitAttr, backArray) {
  //   const count = sitAttr.count;
  //   const buffer = sitAttr.array;
  //   const from = buffer.slice();
  //   const offsets = Array.from({ length: count }, () => Math.random() * 0.6);

  //   gsap.to({ t: 0 }, {
  //     t: 1,
  //     duration: 1.5,
  //     ease: 'power2.inOut',

  //     onUpdate() {
  //       const t = this.targets()[0].t;
  //       for (let i = 0; i < count; i++) {
  //         const tt = THREE.MathUtils.clamp(t - offsets[i], 0, 1);
  //         const i3 = i * 3;
  //         buffer[i3]     = from[i3]     * (1 - tt) + backArray[i3]     * tt;
  //         buffer[i3 + 1] = from[i3 + 1] * (1 - tt) + backArray[i3 + 1] * tt;
  //         buffer[i3 + 2] = from[i3 + 2] * (1 - tt) + backArray[i3 + 2] * tt;
  //       }
  //       sitAttr.needsUpdate = true;
  //     },

  //     onComplete() {
  //       // 🧩 强制把坐标设置为目标形状，确保形状不乱
  //       for (let i = 0; i < count * 3; i++) {
  //         buffer[i] = backArray[i];
  //       }
  //       sitAttr.needsUpdate = true;
  //     }
  //   });
  // }

  // function morp() {
  //   // 三阶段动画：from → mid → to
  //   // mid 是加入噪声/扰动后的中间状态，整体形变曲线变得流畅

  //   const sitAttr = sitGeometry.attributes.position, backAttr = backGeometry.attributes.position

  //   const count = sitAttr.count;
  //   const from = sitAttr.array.slice();
  //   const to = backAttr.array;
  //   const mid = new Float32Array(count * 3);

  //   for (let i = 0; i < count; i++) {
  //     const i3 = i * 3;

  //     // 加入扰动 - 每个点向随机方向偏移一定距离
  //     const dx = (Math.random() - 0.5) * 2000;
  //     const dy = (Math.random() - 0.5) * 2000;
  //     const dz = (Math.random() - 0.5) * 2000;

  //     // mid 是 from 和 to 中间点 + 扰动
  //     mid[i3] = (from[i3] + to[i3]) / 2 + dx;
  //     mid[i3 + 1] = (from[i3 + 1] + to[i3 + 1]) / 2 + dy;
  //     mid[i3 + 2] = (from[i3 + 2] + to[i3 + 2]) / 2 + dz;
  //   }

  //   // 第一阶段：from → mid
  //   gsap.to({ t: 0 }, {
  //     t: 1,
  //     duration: 0.6,
  //     ease: 'power3.out',
  //     onUpdate() {
  //       const t = this.targets()[0].t;
  //       for (let i = 0; i < count * 3; i++) {
  //         sitAttr.array[i] = from[i] * (1 - t) + mid[i] * t;
  //       }
  //       sitAttr.needsUpdate = true;
  //     },
  //     onComplete() {
  //       // 第二阶段：mid → to
  //       gsap.to({ t: 0 }, {
  //         t: 1,
  //         duration: 0.6,
  //         ease: 'power3.out',
  //         onUpdate() {
  //           const t = this.targets()[0].t;
  //           for (let i = 0; i < count * 3; i++) {
  //             sitAttr.array[i] = mid[i] * (1 - t) + to[i] * t;
  //           }
  //           sitAttr.needsUpdate = true;
  //         },
  //         onComplete() {
  //           // 最终强制设置为精准位置
  //           for (let i = 0; i < count * 3; i++) {
  //             sitAttr.array[i] = to[i];
  //           }
  //           sitAttr.needsUpdate = true;
  //         }
  //       });
  //     }
  //   });


  // }


  function morphGeometryWithChaosPath(attr, toArray, duration = 1.5) {
    const count = attr.count;
    const buffer = attr.array;
    const from = buffer.slice();
    const mid = new Float32Array(count * 3); // 中间扰动点

    // 构建中间路径点（扰动一下）
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const dx = (Math.random() - 0.5) * 1000;
      const dy = (Math.random() - 0.5) * 1000;
      const dz = (Math.random() - 0.5) * 1000;

      mid[i3] = (from[i3] + toArray[i3]) / 2 + dx;
      mid[i3 + 1] = (from[i3 + 1] + toArray[i3 + 1]) / 2 + dy;
      mid[i3 + 2] = (from[i3 + 2] + toArray[i3 + 2]) / 2 + dz;
    }

    gsap.to({ t: 0 }, {
      t: 1,
      duration,
      ease: 'power3.inOut',
      onUpdate() {
        const t = this.targets()[0].t;

        for (let i = 0; i < count; i++) {
          const i3 = i * 3;

          // 二阶贝塞尔插值 from → mid → to
          const x1 = THREE.MathUtils.lerp(from[i3], mid[i3], t);
          const x2 = THREE.MathUtils.lerp(mid[i3], toArray[i3], t);
          buffer[i3] = THREE.MathUtils.lerp(x1, x2, t);

          const y1 = THREE.MathUtils.lerp(from[i3 + 1], mid[i3 + 1], t);
          const y2 = THREE.MathUtils.lerp(mid[i3 + 1], toArray[i3 + 1], t);
          buffer[i3 + 1] = THREE.MathUtils.lerp(y1, y2, t);

          const z1 = THREE.MathUtils.lerp(from[i3 + 2], mid[i3 + 2], t);
          const z2 = THREE.MathUtils.lerp(mid[i3 + 2], toArray[i3 + 2], t);
          buffer[i3 + 2] = THREE.MathUtils.lerp(z1, z2, t);
        }

        attr.needsUpdate = true;
      },
      onComplete() {
        // 强制精准对齐目标点
        for (let i = 0; i < count * 3; i++) {
          buffer[i] = toArray[i];
        }
        attr.needsUpdate = true;
      }
    });
  }

  let tween
  function morphWithTWEEN(attr, toArray, duration = 1500) {
    const buffer = attr.array;
    const from = buffer.slice();
    const count = attr.count;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const point = {
        x: from[i3],
        y: from[i3 + 1],
        z: from[i3 + 2]
      };

      const target = {
        x: toArray[i3],
        y: toArray[i3 + 1],
        z: toArray[i3 + 2]
      };

      tween = new TWEEN.Tween(point)
        .to(target, duration)
        .easing(TWEEN.Easing.Exponential.InOut)
        .onUpdate(() => {
          buffer[i3] = point.x;
          buffer[i3 + 1] = point.y;
          buffer[i3 + 2] = point.z;
          attr.needsUpdate = true;
        })
        .onComplete(() => {
          // 最终对齐
          buffer[i3] = target.x;
          buffer[i3 + 1] = target.y;
          buffer[i3 + 2] = target.z;
          attr.needsUpdate = true;
        })
        .delay(Math.random() * 1000)
        .easing(TWEEN.Easing.Exponential.In)

        .start();
    }
  }

  let currentIndex = 0;
  document.addEventListener('keydown', () => {
    currentIndex = (currentIndex + 1) % backGeometry.attributes.position.array.length;
    // tweenToModel(currentIndex);
    // tweenToModelRandomDelay(sitGeometry.attributes.position, backGeometry.attributes.position);
    // morphSitToBack(sitGeometry.attributes.position, backGeometry.attributes.position.array);
    // morp()

    // morphGeometryWithChaosPath(sitGeometry.attributes.position, backGeometry.attributes.position.array)

    // console.log('morphWithTWEEN')
    // morphWithTWEEN(sitGeometry.attributes.position, backGeometry.attributes.position.array)
  });



  function onWindowResize() {
    renderer.setSize(window.innerWidth, window.innerHeight);

    camera.aspect = window.innerWidth / window.innerHeight;

    // camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }
  let count = 0;
  function pointMove() {
    let i = 0, j = 0;

    const positions = pointParticles.geometry.attributes.position.array;
				const scales = pointParticles.geometry.attributes.scale.array;
    for (let ix = 0; ix < AMOUNTX; ix++) {

      for (let iy = 0; iy < AMOUNTY; iy++) {

        positions[i + 1] = (Math.sin((ix + count) * 0.3) * 50) +
          (Math.sin((iy + count) * 0.5) * 50);

        scales[j] = (Math.sin((ix + count) * 0.3) + 1) * 20 +
          (Math.sin((iy + count) * 0.5) + 1) * 20;

        i += 3;
        j++;

      }

    }

    pointParticles.geometry.attributes.position.needsUpdate = true;
    pointParticles.geometry.attributes.scale.needsUpdate = true;

    count += 0.1;
  }

  //模型动画

  function animate() {
    const date = new Date().getTime();
    controls.update();  // 必须更新
    // if (tween) tween.update(); // 👈 必须！
    render();
    // pointMove()
  }




  function render() {
    renderer.render(scene, camera);

  }



  useImperativeHandle(refs, () => ({
    changeDataFlag: changeDataFlag,
  }));
  //   视图数据



  useEffect(() => {
    // 靠垫数据
    init();
    animate();
    return () => {
      cancelAnimationFrame(animationRequestId);
      group = new THREE.Group();
    };
  }, []);
  return (
    <div>
      <div
        // style={{ width: "100%", height: "100%" }}
        id={`canvas`}
      ></div>
    </div>
  );
});
export default Canvas;
