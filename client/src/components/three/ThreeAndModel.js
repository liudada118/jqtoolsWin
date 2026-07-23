import Stats from "three/examples/jsm/libs/stats.module.js";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { TrackballControls } from "three/examples/jsm/controls/TrackballControls";
import React, { memo, useContext, useEffect, useImperativeHandle, useRef, useState } from "react";
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
import { pageContext } from "../../page/test/Test";
import { jetWhite3, lineInterp } from "../../assets/util/line";
import { getSettingValue, getStatus } from "../../store/equipStore";
import { Scheduler } from "../../scheduler/scheduler";

// function rotate90(arr, height, width) {
//     //逆时针旋转 90 度
//     //列 = 行
//     //行 = n - 1 - 列(j);  n表示总行数
//     let matrix = [];
//     for (let i = 0; i < height; i++) {
//         matrix[i] = [];
//         for (let j = 0; j < width; j++) {
//             matrix[i].push(arr[i * height + j]);
//         }
//     }

//     var temp = [];
//     var len = matrix.length;
//     for (var i = 0; i < len; i++) {
//         for (var j = 0; j < len; j++) {
//             var k = len - 1 - j;
//             if (!temp[k]) {
//                 temp[k] = [];
//             }
//             temp[k][i] = matrix[i][j];
//         }
//     }
//     let res = [];
//     for (let i = 0; i < temp.length; i++) {
//         res = res.concat(temp[i]);
//     }
//     return res;
// }

function rotateMatrix(matrix, m, n) {
    const rotatedMatrix = new Array(n);

    for (let i = 0; i < n; i++) {
        rotatedMatrix[i] = new Array(m);
        for (let j = 0; j < m; j++) {
            rotatedMatrix[i][j] = matrix[(m - 1 - j) * n + i];
        }
    }
    const rotatedArray = rotatedMatrix.flat();
    return rotatedArray;
}
let camera
const Canvas =
    memo(React.forwardRef((props, refs) => {
        console.log('renderCanvas')
        const { sitnum1 = 32, sitnum2 = 32, sitInterp = 4, sitInterp2 = 2, sitOrder = 4 } = props
        let group = new THREE.Group();

        let controlsFlag = true;

        let smoothBig = new Array(
            (sitnum1 * sitInterp + sitOrder * 2) *
            (sitnum2 * sitInterp2 + sitOrder * 2)
        ).fill(1);

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

        let particles,
            particles1,
            material,
            backGeometry,
            sitGeometry
        let controls;

        console.log('Canvas')

        // const pageInfo = useContext(pageContext);

        // const pageRef = useRef(pageInfo)

        // useEffect(() => {
        //     pageRef.current = pageInfo
        // }, [pageInfo])



        local = props.local
        var animationRequestId, colSelectFlag = false
        let dataFlag = false;
        const changeDataFlag = () => {
            dataFlag = true;

        };


        let container;

        let scene, renderer;


        const clock = new THREE.Clock();
        const ALT_KEY = 18;
        const CTRL_KEY = 17;
        const CMD_KEY = 91;
        const AMOUNTX = sitnum1 * sitInterp + sitOrder * 2;
        const AMOUNTY = sitnum2 * sitInterp2 + sitOrder * 2;
        const SEPARATION = 100;
        // let group = new THREE.Group();
        const groupX = 0, groupY = 0, groupZ = 0

        let positions;
        let colors, scales;

        const stats = new Stats();
        stats.showPanel(0); // 0: FPS, 1: ms, 2: memory
        // document.body.appendChild(stats.dom);

        function init() {



            container = document.getElementById(`canvas`);

            camera = new THREE.PerspectiveCamera(
                40,
                window.innerWidth / window.innerHeight,
                1,
                150000
            );


            camera.position.z = -150;
            camera.position.y = 0;

            scene = new THREE.Scene();

            // model
            const loader = new GLTFLoader();



            initSet();
            initBack();
            initModel();
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
            // const light = new THREE.AmbientLight(0x404040 ,1); // 柔和的白光
            // scene.add(light);
            // const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444);
            // hemiLight.position.set(0, 200, 0);
            // scene.add(hemiLight);
            // const dirLight = new THREE.DirectionalLight(0xffffff);
            // dirLight.position.set(0, 200, 10);
            // scene.add(dirLight);
            // const dirLight1 = new THREE.DirectionalLight(0xffffff);
            // dirLight1.position.set(0, 10, 200);
            // scene.add(dirLight1);

            // Lights
            scene.add(new THREE.AmbientLight(0xffffff, 1));
            scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1));
            const dir = new THREE.DirectionalLight(0xffffff, 1.0);
            dir.position.set(5, 10, 5);
            dir.castShadow = true;
            scene.add(dir);

            // renderer

            renderer = new THREE.WebGLRenderer({ antialias: true });
            // renderer.setAnimationLoop(animate);
            renderer.setPixelRatio(window.devicePixelRatio);
            // renderer.setSize(window.innerWidth, window.innerHeight);

            renderer.setSize(window.innerWidth, window.innerHeight);

            container.appendChild(renderer.domElement);

            renderer.setClearColor(0x000000);

            renderer.outputColorSpace = THREE.SRGBColorSpace;
            renderer.toneMapping = THREE.ACESFilmicToneMapping;
            // 亮度调节
            renderer.toneMappingExposure = 1.0; // 往上调更亮，往下调更暗

            //FlyControls
            controls = new TrackballControls(camera, renderer.domElement);
            controls.update();
            // controls.noZoom = true;
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
            const positions = new Float32Array(numParticles * 3);
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


            particles.rotation.x = -Math.PI / 4;
            particles.rotation.y = Math.PI / 2
            particles.position.z = 20
            particles.position.y = 36
            group.add(particles);

        }


        function initBack() {
            const AMOUNTX = 32 * sitInterp + sitOrder * 2;
            const AMOUNTY = 32 * sitInterp + sitOrder * 2;
            const numParticles = AMOUNTX * AMOUNTY;
            const positions = new Float32Array(numParticles * 3);
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

        function initModel() {
            // model
            const loader = new GLTFLoader();

            loader.load("./model/bed.glb", function (gltf) {
                let chair = gltf.scene;
                if (props.body) {
                    chair.rotation.y = -Math.PI / 2;
                    chair.position.x = 135;
                    chair.position.y = 20;
                    chair.position.z = 150;
                }
                // scene.add(chair);
                // gltf.scene.traverse((obj) => {
                //     if (obj.isMesh) {
                //         obj.castShadow = obj.receiveShadow = true;
                //         const m = obj.material;
                //         if (m && (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial)) {
                //             // 仅基色贴图设 sRGB
                //             if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
                //             // 防黑：先给个稳妥值
                //             if (m.metalness === undefined) m.metalness = 0.1;
                //             if (m.roughness === undefined) m.roughness = 0.8;
                //         }
                //         if (obj.geometry && !obj.geometry.attributes.normal) {
                //             obj.geometry.computeVertexNormals();
                //         }
                //     }
                // });
                group.add(chair);
                chair.rotation.y = -Math.PI / 2
                chair.rotation.x = -Math.PI / 4
                chair.scale.set(8, 8, 8)
                scene.add(group);
                // group.position.x = -10;
                // group.position.y = -20;
            });
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
            // currentIndex = (currentIndex + 1) % backGeometry.attributes.position.array.length;
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


        //  更新座椅数据
        function sitRenew() {
            // console.log(group)
            // console.log(props)
            // valueg1 = 2
            // valuej1 = 500 
            // value1 =2

            const {
                gauss = 1, color, filter, height = 1, coherent = 1
            } = getSettingValue()//pageRef.current.settingValue
            const numParticles = AMOUNTX * AMOUNTY;
            const positions = new Float32Array(numParticles * 3);
            const colors = new Float32Array(numParticles * 3);

            // let ndata1 = pageRef.current.equipStatus.data.length == 4096 ?pageRef.current.equipStatus.data : new Array(4096).fill(0)
            // let ndata1 = getStatus()
          
            let ndata1 = props.sitData.current.bed || new Array(1024).fill(0)
            // console.log(ndata1)
            // if (props.type) {

            //     ndata1 = rotateMatrix(ndata1, 32, 32)
            // }
            // if(!ndata1) return 
            let bigArr = lineInterp(ndata1, sitnum2, sitnum1, sitInterp2, sitInterp)
            let bigArrs = addSide(
                bigArr,
                sitnum2 * sitInterp2,
                sitnum1 * sitInterp,
                sitOrder,
                sitOrder
            );
            let bigArrg = gaussBlur_return(
                bigArrs,
                sitnum2 * sitInterp2 + sitOrder * 2,
                sitnum1 * sitInterp + sitOrder * 2,
                gauss
            );

            let k = 0,
                l = 0;
            let dataArr = []
            for (let ix = 0; ix < AMOUNTX; ix++) {
                for (let iy = 0; iy < AMOUNTY; iy++) {
                    const value = bigArrg[l] * 10;

                    //柔化处理smooth
                    smoothBig[l] = smoothBig[l] + (value - smoothBig[l] + 0.5) / coherent;

                    positions[k] = 13500 - iy * SEPARATION - (AMOUNTY * SEPARATION) / 2;// x
                    positions[k + 1] = smoothBig[l] * height; // y
                    positions[k + 2] = ix * SEPARATION - (AMOUNTX * SEPARATION) / 2; // z

                    let rgb
                    rgb = jetWhite3(0, color, smoothBig[l]);

                    colors[k] = rgb[0] / 255;
                    colors[k + 1] = rgb[1] / 255;
                    colors[k + 2] = rgb[2] / 255;

                    k += 3;
                    l++;
                }
            }

            particles.geometry.attributes.position.needsUpdate = true;
            particles.geometry.attributes.color.needsUpdate = true;


            sitGeometry.setAttribute(
                "position",
                new THREE.BufferAttribute(positions, 3)
            );
            sitGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
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
            stats.begin();
            sitRenew()
            // animationRequestId =requestAnimationFrame(animate);
            Scheduler.onRender(animate)
            renderer.render(scene, camera);
            stats.end();
        }

        function changePointRotation(value) {
            console.log('three', value, group)
            // alert(group.uuid)
            if (group) group.rotation.x = 0 + (value * 2) / 12
            // if (type === 'back') {
            //   if (direction == 'x') {
            //     particles1.rotation[direction] = -Math.PI / 2 - (Math.PI * 4) / 24 - (value * 6) / 12
            //   } else {
            //     particles1.rotation[direction] = - (value * 6) / 12
            //   }
            // } else if (type === 'sit') {
            //   if (direction == 'x') {
            //     particles.rotation[direction] = Math.PI / 3 - (value * 6) / 12
            //   } else {
            //     particles.rotation[direction] = (value * 6) / 12
            //   }
            // } else if (type === 'head') {
            //   if (direction == 'x') {
            //     particlesHead.rotation[direction] = backRotationX - (value * 6) / 12
            //   } else {
            //     particlesHead.rotation[direction] = (value * 6) / 12
            //   }
            // }
            // actionAll()
        }

        function changeCamera(value) {
            if (camera) camera.position.z = (-150 * 100 / value);
        }

         function reset3D() {
            controls.reset()
            props.changeViewProp(100)
        }

        useImperativeHandle(refs, () => ({
            changePointRotation: changePointRotation,
            changeCamera,
            reset3D
        }));
        //   视图数据

        function wheel(event) {

            // 清除之前的计时器，避免在短时间内多次触发
            if (timer) {
                clearTimeout(timer);
            }

            // 设置一个新的计时器，例如 300毫秒后触发
            timer = setTimeout(() => {
                console.log('鼠标滚轮滑动结束');
                // 在这里执行滚动结束后的操作，例如加载更多内容

                props.changeViewProp((Math.floor(-150 * 100 / camera.position.z)))
                timer = null; // 重置 timer 变量

            }, 400); // 300毫秒为一个示例值


        }

        useEffect(() => {
            // 靠垫数据
            init();
            animate();

            document.addEventListener("wheel", wheel);
            return () => {
                renderer.setAnimationLoop(null);
                document.removeEventListener("wheel", wheel)
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
    }));
export default Canvas;
