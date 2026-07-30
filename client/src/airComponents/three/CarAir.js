import Stats from "three/examples/jsm/libs/stats.module.js";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { TrackballControls } from "three/examples/jsm/controls/TrackballControls";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import React, { memo, useContext, useEffect, useImperativeHandle, useRef, useState } from "react";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { TextureLoader } from "three";
import * as TWEEN from '@tweenjs/tween.js'
import {
    addSide,
    compensateSingleColumnGaussian,
    findMax,
    gaussBlur_1,
    gaussBlur_return,
    interp,
    interp1016,
    interpSquare,
    jet,
    jetgGrey,
    lineInterpnew,
} from "../../util/util";
import gsap from "gsap";
import { pageContext } from "../../page/test/Test";
import { jetWhite3, lineInterp } from "../../assets/util/line";
import { getDisplayType, getSettingValue, getStatus } from "../../store/equipStore";
import { useWhyReRender } from "../../hooks/useWindowsize";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import {
    DEFAULT_SCENE_TRANSFORM,
    getSensorViewScaleX,
    normalizeSceneScale,
} from "./sceneTransform";
import {
    getObjectBoundsCenterInAncestor,
    getOverallPivotOffset,
} from "./scenePivot";
import {
    CAR_ADAPTIVE_CENTER_COLUMNS,
    CAR_ADAPTIVE_CENTER_ROWS,
    CAR_ADAPTIVE_SECTION_SIZE,
    CAR_ADAPTIVE_SIDE_COLUMNS,
    CAR_ADAPTIVE_SIDE_ROWS,
    reverseSensorRows,
    splitCarAdaptiveSensorSection,
} from "../../util/carAdaptiveSensorLayout";
import './index.scss';


const fps = 15;                          // 想要的帧率
const interval = 1000 / fps;             // 每帧间隔 ms
let lastTime = performance.now();

/**
 * 主驾保持根分组原方向，副驾镜像同时包含座椅和压力点的整体根分组。
 */
function applySensorGroupMirror(transformTargets, sensorId) {
    const scaleX = getSensorViewScaleX(sensorId);
    const mirrorTarget = transformTargets?.mirror;

    if (mirrorTarget) {
        mirrorTarget.scale.set(scaleX, 1, 1);
    }
}


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


const sitObj = {

}

let pox = 1 , poy = 1 , poz = 1

function tuneMatteLeatherLike(model) {
    model.traverse((o) => {
        if (!o.isMesh) return;

        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
            if (!m) continue;

            // 只处理 PBR 材质
            const isPBR = (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial);
            if (!isPBR) continue;

            // 只处理非金属（座椅皮革/塑料一般 metalness ~ 0）
            if (m.metalness !== undefined && m.metalness > 0.15) continue;

            const c = m.color; // 可能没有
            const r = c?.r ?? 1, g = c?.g ?? 1, b = c?.b ?? 1;

            const isWhite = r > 0.75 && g > 0.75 && b > 0.75;
            const isBlack = r < 0.20 && g < 0.20 && b < 0.20;

            // 1) 基础：提高粗糙度下限，避免“油亮带”
            if (m.roughness !== undefined) {
                const minR = isWhite ? 0.62 : isBlack ? 0.55 : 0.58;
                const maxR = isWhite ? 0.78 : isBlack ? 0.75 : 0.80;
                m.roughness = Math.min(Math.max(m.roughness, minR), maxR);
            }

            // 2) 清漆层：压低/关闭（反光最常见来源）
            if (m.clearcoat !== undefined) {
                m.clearcoat = Math.min(m.clearcoat, 0.04);        // 0 就最哑；0.03~0.04 仍有高级感
                m.clearcoatRoughness = Math.max(m.clearcoatRoughness ?? 0.7, 0.7);
            }

            // 3) 高光能量：可选轻微压缩（不影响颜色）
            // specularIntensity 是 MeshPhysicalMaterial 才有（部分版本/材质有）
            if (m.specularIntensity !== undefined) {
                m.specularIntensity = Math.min(m.specularIntensity, 0.6);
            }

            m.needsUpdate = true;
        }
    });
}

const CarAir =
    memo(React.forwardRef((props, refs) => {

        useWhyReRender(props)

        const transformTargetsRef = useRef({
            root: null,
            pivot: null,
            mirror: null,
            content: null,
            model: null,
            pointGroup: null,
        });
        const overallPivotStateRef = useRef({
            signature: '',
            center: new THREE.Vector3(),
        });
        const sceneTransformRef = useRef(DEFAULT_SCENE_TRANSFORM);
        const activeSensorIdRef = useRef(Number(props.sensorId) === 2 ? 2 : 1);

        console.log('renderCanvas')
        const {
            // sitnum1 = 32, sitnum2 = 32, sitInterp = 4, sitInterp2 = 2, sitOrder = 4 , 
        } = props
        let sceneRoot = new THREE.Group();
        let overallPivot = new THREE.Group();
        let mirrorGroup = new THREE.Group();
        let group = new THREE.Group();

        let controlsFlag = true;


        let timer
        let camera, sitshowFlag = false, backshowFlag = false

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
        let pointGroup = new THREE.Group();
        let chair, model = new THREE.Group(), fbx, key, fill,fill1, rim
        let lightGroup = new THREE.Group();
        let particles,
            particles1,
            material,
            backGeometry,
            sitGeometry
        let controls;

        console.log('Canvas')





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

        const SEPARATION = 100;

        const groupX = 0, groupY = 20, groupZ = -10

        let positions;
        let colors, scales;

        const stats = new Stats();
        stats.showPanel(0); // 0: FPS, 1: ms, 2: memory
        // document.body.appendChild(stats.dom);

        function initLight() {
            // new RGBELoader()
            //     .load('https://cdn.jsdelivr.net/gh/mrdoob/three.js@master/examples/textures/equirectangular/royal_esplanade_1k.hdr', (texture) => {
            //         texture.mapping = THREE.EquirectangularReflectionMapping;
            //         scene.environment = texture;
            //         scene.background = texture;
            //     });

            // —————————— Lights ——————————

            // 环境光（基础亮度）
            // key = new THREE.AmbientLight(0xffffff, 0.8)
            key = new THREE.AmbientLight(0xffffff, 0.88)
            scene.add(key);

            // 平行光（像 Blender Sun）
            // const sun = new THREE.DirectionalLight(0xffffff, 1);
            const sun = new THREE.DirectionalLight(0xffffff, 2.22);
            sun.position.set(5, 8, 2);
            sun.castShadow = true;
            sun.shadow.radius = 8;
            sun.shadow.mapSize.set(2048, 2048);
            sun.shadow.camera.near = 1;
            sun.shadow.camera.far = 20;
            sun.shadow.camera.left = -10;
            sun.shadow.camera.right = 10;
            sun.shadow.camera.top = 10;
            sun.shadow.camera.bottom = -10;
            fill = sun
            scene.add(fill);

             // 平行光（像 Blender Sun）
            const sun1 = new THREE.DirectionalLight(0xffffff, 1);
            sun1.position.set(-5, 8, 2);
            sun1.castShadow = true;
            sun1.shadow.radius = 8;
            sun1.shadow.mapSize.set(2048, 2048);
            sun1.shadow.camera.near = 1;
            sun1.shadow.camera.far = 20;
            sun1.shadow.camera.left = -10;
            sun1.shadow.camera.right = 10;
            sun1.shadow.camera.top = 10;
            sun1.shadow.camera.bottom = -10;
            fill1 = sun1
            scene.add(fill1);

            // 聚光灯（加强重点光照）
            const spot = new THREE.SpotLight(0xffffff, 2);
            spot.position.set(-2, 6, 4);
            spot.angle = Math.PI / 6;
            spot.penumbra = 0.4;
            spot.castShadow = true;
            spot.shadow.mapSize.set(2048, 2048);
            rim = spot
            scene.add(rim);


        }

        function init() {



            container = document.getElementById(`canvas`);
            const viewportWidth = Math.max(1, container.clientWidth);
            const viewportHeight = Math.max(1, container.clientHeight);

            camera = new THREE.PerspectiveCamera(
                40,
                viewportWidth / viewportHeight,
                1,
                150000
            );



            camera.position.set(0, 0, -120)


            scene = new THREE.Scene();

            // model
            const loader = new GLTFLoader();



            group.add(pointGroup);
            overallPivot.add(group);
            sceneRoot.add(overallPivot);
            mirrorGroup.add(sceneRoot);
            overallPivotStateRef.current = {
                signature: '',
                center: new THREE.Vector3(),
            };
            transformTargetsRef.current = {
                root: sceneRoot,
                pivot: overallPivot,
                mirror: mirrorGroup,
                content: group,
                model,
                pointGroup,
            };
            // pointGroup.
            initPoints()
            initModel();
            initLight();

            // new RGBELoader().load("/hdr/studio.hdr", (hdr) => {
            //     hdr.mapping = THREE.EquirectangularReflectionMapping;
            //     scene.environment = hdr;
            //     scene.background = hdr; // 可选
            //     // scene.background = hdr; // 想背景也一样就开
            // });

            // group.position.x = groupX
            // group.position.y = groupY
            // group.position.z = -100
            // group.position.x = -100

            setSceneTransform(DEFAULT_SCENE_TRANSFORM);

            // group.position.x = 23
            // group.position.y = -27
            // group.rotation.x = 0
            // group.rotation.y = 0
            // group.rotation.z = 0

            // group.rotation.x = Math.PI / 6
            // scene.add(group);
            const helper = new THREE.GridHelper(2000, 100);
            helper.position.y = -199;
            helper.material.opacity = 0.25;
            helper.material.transparent = true;
            scene.add(helper);



            // 三点布光（更稳，不受模型尺度影响）
            // Lights
            // key = new THREE.DirectionalLight(0xffffff, 5.0);
            // key.position.set(5000, -3468, -2710);
            // key.castShadow = true;
            // key.shadow.mapSize.set(2048, 2048);
            // key.shadow.bias = -0.00005;
            // scene.add(key);

            // fill = new THREE.DirectionalLight(0xffffff, 2.0);
            // fill.position.set(-10000, -10000, -10000);
            // scene.add(fill);

            // rim = new THREE.DirectionalLight(0xffffff, 4.0);
            // rim.position.set(-288, 1000, -255);
            // scene.add(rim);

            // 主光：侧前上方，专门照侧面大曲面
            // const key = new THREE.DirectionalLight(0xffffff, 4.2);
            // key.position.set(450, 520, 180);   // ← Z 收回来，避免扫正面
            // key.castShadow = true;
            // key.shadow.mapSize.set(2048, 2048);
            // key.shadow.bias = -0.00005;
            // scene.add(key);

            // // 补光：正前偏低，只提暗部，不参与高光
            // const fill = new THREE.DirectionalLight(0xffffff, 1.2);
            // fill.position.set(200, 180, 420);  // ← 更靠前，强度压低
            // scene.add(fill);

            // // 轮廓光：后上偏侧，只擦边
            // const rim = new THREE.DirectionalLight(0xffffff, 1.8);
            // rim.position.set(-420, 650, -280); // ← 拉远 + 偏侧，避免打亮背面
            // scene.add(rim);


            // const prop =0.5

            // const key1 = new THREE.DirectionalLight(0xffffff, 6.0 * prop);
            // key1.position.set(-300, -500, -400);
            // key1.castShadow = true;
            // key1.shadow.mapSize.set(2048, 2048);
            // key1.shadow.bias = -0.00005;
            // scene.add(key1);

            // const fill1 = new THREE.DirectionalLight(0xffffff, 2.0* prop);
            // fill1.position.set(400, -200, -300);
            // scene.add(fill1);

            // const rim1 = new THREE.DirectionalLight(0xffffff, 4.0* prop);
            // rim1.position.set(200, -600, 500);
            // scene.add(rim1);

            // 额外“作弊补光”（产品展示常用）
            // scene.add(new THREE.AmbientLight(0xffffff, 1));


            // const coordinates = [-50, 0, 50];

            // scene.add(lightGroup);
            // for (let x of coordinates) {
            //     for (let y of coordinates) {
            //         for (let z of coordinates) {
            //             // points.push([x, y, z]);
            //             const pointlight5 = new THREE.PointLight(0xffffff, 1, 0);
            //             pointlight5.position.set(x, y, z+90);
            //             lightGroup.add(pointlight5);
            //             // console.log(x, y, z)
            //             const sphereSize = 1;
            //             const pointLightHelper = new THREE.PointLightHelper(pointlight5, sphereSize);
            //             lightGroup.add(pointLightHelper);
            //         }
            //     }
            // }

            // renderer

            renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
            renderer.setAnimationLoop(animate);
            renderer.setPixelRatio(window.devicePixelRatio);
            // renderer.setSize(window.innerWidth, window.innerHeight);

            renderer.setSize(viewportWidth, viewportHeight, false);

            container.appendChild(renderer.domElement);

            renderer.setClearColor(0x141319);

            // 色彩管理（接近 Blender Filmic 的观感）
            renderer.outputColorSpace = THREE.SRGBColorSpace;
            renderer.toneMapping = THREE.ACESFilmicToneMapping;
            renderer.toneMappingExposure = 0.8; // 太黑就 1.6；太亮就 1.2
            renderer.physicallyCorrectLights = true;

            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;

            //FlyControls
            controls = new TrackballControls(camera, renderer.domElement);
            // controls.noZoom = true;
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




        const xValue = 20
        const yValue = 0.1
        const zValue = -3

        const sitleftConfig = {
            sitnum1: CAR_ADAPTIVE_SIDE_ROWS,
            sitnum2: CAR_ADAPTIVE_SIDE_COLUMNS,
            sitInterp: 6,
            sitInterp1: 2,
            sitOrder: 4,
        }

        const sitConfig = {
            sitnum1: CAR_ADAPTIVE_CENTER_ROWS,
            sitnum2: CAR_ADAPTIVE_CENTER_COLUMNS,
            sitInterp: 10,
            sitInterp1: 7,
            sitOrder: 3,
        }

        const backConfig = {
            sitnum1: CAR_ADAPTIVE_SIDE_ROWS,
            sitnum2: CAR_ADAPTIVE_SIDE_COLUMNS,
            sitInterp: 9,
            sitInterp1: 4,
            sitOrder: 4,
        }

        const sitConfigBack = {
            sitnum1: CAR_ADAPTIVE_CENTER_ROWS,
            sitnum2: CAR_ADAPTIVE_CENTER_COLUMNS,
            sitInterp: 15,
            sitInterp1: 6,
            sitOrder: 3,
        }


        let allConfig = {

            // neck: {
            //     dataConfig: sitleftConfig,
            //     name: 'left',
            //     pointConfig: { position: [-13, -25, 225], rotation: [-9.23, 0, 0] },
            // },
            // back: {
            //     dataConfig: sitleftConfig,
            //     name: 'right',
            //     pointConfig: { position: [-53, -25, 223], rotation: [-9.23, 0, 0] },
            // },
            sit: {
                dataConfig: sitConfig,
                name: 'center',
                pointConfig: { position: [-32, -28, 223], rotation: [-9.23, 0, 0] },
            },

            necksit: {
                dataConfig: backConfig,
                name: 'leftsit',
                pointConfig: { position: [-12, -1, 239.2], rotation: [-4.365, 0, 0], },
            },
            backsit: {
                dataConfig: backConfig,
                name: 'rightsit',
                pointConfig: { position: [-52, -1, 239.2], rotation: [-4.365, 0, 0], },
            },
            sitsit: {
                dataConfig: sitConfigBack,
                name: 'centersit',
                pointConfig: { position: [-21, 13, 252], rotation: [-4.365, 0, 0], },
            },

        }

        function addTotal(objArr) {
            objArr.forEach((obj) => {
                const { sitnum1, sitnum2, sitInterp, sitInterp1, sitOrder } = obj
                const AMOUNTX = sitnum1 * sitInterp + sitOrder * 2;
                const AMOUNTY = sitnum2 * sitInterp1 + sitOrder * 2;
                const numParticles = AMOUNTX * AMOUNTY;
                obj.total = numParticles
            })
        }

        addTotal([sitleftConfig, backConfig, sitConfig, sitConfigBack])

        const smoothBig = {
            left: new Array(sitleftConfig.total).fill(1),
            right: new Array(sitleftConfig.total).fill(1),
            center: new Array(sitConfig.total).fill(1),
            leftsit: new Array(backConfig.total).fill(1),
            rightsit: new Array(backConfig.total).fill(1),
            centersit: new Array(sitConfigBack.total).fill(1),
            // handLeft: new Array(handLeftConfig.total).fill(1),
            // handRight: new Array(handRightConfig.total).fill(1)
        }



        const initPoint = (config, pointConfig, name, group) => {
            const { sitnum1, sitnum2, sitInterp, sitInterp1, sitOrder } = config
            const { position, rotation, scale } = pointConfig
            const AMOUNTX = sitnum1 * sitInterp + sitOrder * 2;
            const AMOUNTY = sitnum2 * sitInterp1 + sitOrder * 2;
            const numParticles = AMOUNTX * AMOUNTY;
            const positions = new Float32Array(numParticles * 3);
            const scales = new Float32Array(numParticles);
            const colors = new Float32Array(numParticles * 3);

            let i = 0,
                j = 0;

            for (let ix = 0; ix < AMOUNTX; ix++) {
                for (let iy = 0; iy < AMOUNTY; iy++) {
                    positions[i] = iy * SEPARATION - (AMOUNTX * SEPARATION) / 2; // x
                    positions[i + 1] = 0; // y
                    positions[i + 2] = ix * SEPARATION - (AMOUNTY * SEPARATION) / 2; // z

                    scales[j] = 1;
                    colors[i] = 0 / 255;
                    colors[i + 1] = 0 / 255;
                    colors[i + 2] = 255 / 255;
                    i += 3;
                    j++;
                }
            }

            const sitGeometry = new THREE.BufferGeometry();
            sitGeometry.setAttribute(
                "position",
                new THREE.BufferAttribute(positions, 3)
            );
            function getTexture() {
                return new TextureLoader().load("");
            }
            // require("../../assets/images/circle.png")
            const spite = new THREE.TextureLoader().load("./circle.png");
            const hand = new THREE.TextureLoader().load("./hand.jpg");
            const material = new THREE.PointsMaterial({
                vertexColors: true,
                transparent: false,
                // sizeAttenuation: false,
                side: THREE.DoubleSide,
                depthWrite: true,
                depthTest: true,
                blending: THREE.NormalBlending, // 🔴 关键3：正常混合，不要 Additive
                map: spite,
                opacity: 0.4,
                size: name == 'center' ? 1 : 1.2,
            });
            sitGeometry.setAttribute("scale", new THREE.BufferAttribute(scales, 1));
            sitGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
            const particles = new THREE.Points(sitGeometry, material);

            particles.scale.x = 0.005;
            particles.scale.y = 0.005;
            particles.scale.z = 0.005;

            // particles.position.z = 0
            // particles.position.y = 0
            // particles.position.x = 0
            if (position.length) particles.position.set(...position)
            if (rotation.length) particles.rotation.set(...rotation)
            // if (scale.length) particles.scale.set(...scale)
            particles.name = name
            group.add(particles);
        }

        function initPoints() {
            Object.keys(allConfig).forEach((key) => {
                const obj = allConfig[key]
                initPoint(obj.dataConfig, obj.pointConfig, obj.name, pointGroup)
            })
        }

        // const pmrem = new THREE.PMREMGenerator(renderer);

        // new RGBELoader().load('/hdr/studio.hdr', (hdr) => {
        //     const envMap = pmrem.fromEquirectangular(hdr).texture;

        //     scene.environment = envMap;
        //     scene.background = null; // 你有 UI 背景，不要覆盖

        //     scene.environmentIntensity = 1.8; // ⭐ 关键
        // });


        function initModel() {
            // model
            const loader = new GLTFLoader();

            model.position.set(
                DEFAULT_SCENE_TRANSFORM.model.x,
                DEFAULT_SCENE_TRANSFORM.model.y,
                DEFAULT_SCENE_TRANSFORM.model.z
            );

            // // loader.load("./model/seat.fbx", function (fbx) {
            // //     model.add(fbx);

            loader.load("./model/FAST27-前排座椅.glb", function (gltf) {
                fbx = gltf.scene;
                console.log(fbx, 'fbx')


                fbx.traverse(o => {
                    if (!o.isMesh || !o.material) return;
                    const m = o.material;
                    o.castShadow = true;
                    o.receiveShadow = true;


                    // 只针对白色/浅色件
                    // if (m.color && m.color.r > 0.7 && m.color.g > 0.7 && m.color.b > 0.7) {
                    //     m.roughness = Math.max(m.roughness ?? 0.6, 0.6);
                    //     m.clearcoat = Math.min(m.clearcoat ?? 0, 0.05);
                    //     m.clearcoatRoughness = 0.7;
                    // }
                });

                // tuneMatteLeatherLike(fbx)
                // fbx.rotation.y = -Math.PI / 2
                // fbx.rotation.z = -Math.PI/2
                // fbx.position.y = -60
                fbx.scale.set(100, 100, 100)
                model.add(fbx)
                // scene.add(model)
                // model.rotation.z = -Math.PI / 2
                model.rotation.y = -Math.PI * 2 / 4
                // model.rotation.x = -6.56
                // model.rotation.y = -8.52
                // model.rotation.z = 6.14
                group.add(model);
                scene.add(mirrorGroup);
                setSceneTransform(sceneTransformRef.current);



                // group.position.x = -10;
                // group.position.y = -20;
            });

            // const loader = new OBJLoader();
            // loader.load(
            //     './model/Adaptive_Seat_20251128.obj', // 替换为你的 .obj 文件路径
            //     (object) => {
            //         object.position.set(0, 0, 0);
            //         object.scale.set(0.1, 0.1, 0.1);
            //         // object.rotation.x = -Math.PI / 2
            //         scene.add(object);
            //     })

            // const loader = new FBXLoader();
            // loader.load("./model/Adaptive Seat_20251219.fbx", function (fbx) {
            //     model.add(fbx);
            //     fbx.scale.set(100, 100, 100);
            // })
        }

        // scene.environmentIntensity = 1.3;

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

        let tween, tween1
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
            if (!container || !renderer || !camera) return;

            const viewportWidth = Math.max(1, container.clientWidth);
            const viewportHeight = Math.max(1, container.clientHeight);
            renderer.setSize(viewportWidth, viewportHeight, false);

            camera.aspect = viewportWidth / viewportHeight;

            // camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
        }
        let count = 0;



        function sitRenew(config, name, ndata1, smoothBig) {
            // console.log(ndata1)
            const { sitnum1, sitnum2, sitInterp, sitInterp1, sitOrder } = config
            const AMOUNTX = 1 + (sitnum1 - 1) * sitInterp + sitOrder * 2;
            const AMOUNTY = 1 + (sitnum2 - 1) * sitInterp1 + sitOrder * 2;


            // const AMOUNTX = sitnum1 * sitInterp   //height
            // const AMOUNTY = sitnum2 * sitInterp1 //width

            const numParticles = AMOUNTX * AMOUNTY;
            const particles = pointGroup.children.find((a) => a.name == name)

            const { geometry } = particles
            const position = new Float32Array(numParticles * 3);
            const colors = new Float32Array(numParticles * 3);


            // const gauss = 1, color  =1, filter=1, height = 1, coherent = 1
            const {
                gauss = 1, color, filter, height = 1, coherent = 1
            } = getSettingValue() //pageRef.current.settingValue

            // height , width , heightInterp , widthInterp
            // export function interpSmall(smallMat, width, height, interp1, interp2)

            let bigArr = lineInterpnew(ndata1, sitnum2, sitnum1, sitInterp1, sitInterp)
            let bigArrs = addSide(
                bigArr,
                1 + (sitnum2 - 1) * sitInterp1,
                1 + (sitnum1 - 1) * sitInterp,
                sitOrder,
                sitOrder
            );
            let bigArrg = gaussBlur_return(
                bigArrs,
                1 + (sitnum2 - 1) * sitInterp1 + sitOrder * 2,
                1 + (sitnum1 - 1) * sitInterp + sitOrder * 2,
                gauss
            );
            if (sitnum2 === 1) {
                bigArrg = compensateSingleColumnGaussian(
                    bigArrg,
                    gauss,
                    Math.max(0, ...bigArr)
                );
            }

            let k = 0, l = 0;
            let dataArr = []
            for (let ix = 0; ix < AMOUNTX; ix++) {
                for (let iy = 0; iy < AMOUNTY; iy++) {
                    const value = bigArrg[l] * 10;
                    //柔化处理smooth
                    smoothBig[l] = smoothBig[l] + (value - smoothBig[l]) / coherent;

                    position[k] = iy * SEPARATION - (AMOUNTX * SEPARATION) / 2; // x

                    position[k + 1] = -smoothBig[l] * height; // y

                    position[k + 2] = ix * SEPARATION - (AMOUNTY * SEPARATION) / 2; // z 

                    let rgb
                    // if (name == 'sit') {
                    if (value <= color * 6 / 26) {
                        position[k] = -1600;
                        position[k + 1] = 2800; // y
                        position[k + 2] = -4700; // z
                    }
                    // }

                    // if (name == 'back') {
                    //     if (value < 50 && backshowFlag == false) {
                    //         position[k] = 0;
                    //         position[k + 1] = -0; // y
                    //         position[k + 2] = 0; // z
                    //     }
                    // }



                    rgb = jetWhite3(0, color, smoothBig[l]);




                    colors[k] = rgb[0] / 255;
                    colors[k + 1] = rgb[1] / 255;
                    colors[k + 2] = rgb[2] / 255;

                    // if (value > 10) {
                    //   color[k] = 255 / 255;
                    //   color[k + 1] = 0 / 255;
                    //   color[k + 2] = 0 / 255;
                    // }

                    k += 3;
                    l++;
                }
            }




            particles.geometry.attributes.position.needsUpdate = true;
            particles.geometry.attributes.color.needsUpdate = true;
            geometry.setAttribute(
                "position",
                new THREE.BufferAttribute(position, 3)
            );
            geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        }

        //模型动画

        function animate() {
            let now = performance.now();

            const delta = now - lastTime;
            // console.log(now , lastTime)
            if (delta < interval) {
                // 时间没到下一帧，直接跳过

                return;
            }
         
            lastTime = now - (delta % interval);

            const date = new Date().getTime();
            controls.update();  // 必须更新
            if (tween) tween.update(); // 👈 必须！
            if (tween1) tween1.update(); // 👈 必须！
            render();

            const {
                gauss = 1, color, filter, height = 1, coherent = 1, xx, yy, zz, rxx, ryy, rzz
            } = getSettingValue()
            const particles = pointGroup.children.find((a) => a.name == 'center')
            const group = fill1
            if (group) {
                if (xx) {
                    // group.position.x = xx
                    key.intensity = xx
                    // pox = xx

                }
                if (yy) {
                    // group.position.y = yy
                    fill.intensity = yy
                    // poy = yy
                }
                if (zz) {
                    // group.position.z = zz
                    rim.intensity = zz
                    // poz = zz
                }

                if (rxx) {
                    group.rotation.x = rxx
                }
                if (ryy) {
                    group.rotation.y = ryy
                }
                if (rzz) {
                    group.rotation.z = rzz
                }
            }

            // console.log(first)

            // pointMove()
        }



        // const smoothBig = {
        //     // neck: new Array(neckConfig.total).fill(1),
        //     back: new Array(backConfig.total).fill(1),
        //     sit: new Array(sitConfig.total).fill(1),
        // }
        // const sitDataRef = useRef(props.sitData);
        // useEffect(() => { sitDataRef.current = props.sitData }, [props.sitData]);
        // return ref; // .current 永远是最新
        function render() {
            stats.begin();
            // TWEEN.update();
            const sitnum1 = 16;
            const sitnum2 = 16;
            const sitInterp = 2;
            const sitOrder = 4;
            const backnum1 = 16;
            const backnum2 = 16;
            const backInterp = 2;
            const headnum1 = 10;
            const headnum2 = 10;
            var back = new Array(backnum1 * backnum2).fill(0), sit = new Array(sitnum1 * sitnum2).fill(0), neck = new Array(headnum1 * headnum2).fill(0);


            // let ndata1 = getStatus()
            // console.log(ndata1)
            // if (!Object.keys(ndata1).length) return


            // const {back , sit} = props.sitData.current

            // const data = {
            //     back: props.sitData.current.back || new Array(4096).fill(0), sit: props.sitData.current.sit || new Array(4096).fill(0),
            // }

            

            let ndata1 = props.sitData.current.carAir || new Array(144).fill(0)

            

            // let ndata1 = new Array(144).fill(0) 
            const backrestSensors = splitCarAdaptiveSensorSection(ndata1, 0)
            const cushionSensors = splitCarAdaptiveSensorSection(
                ndata1,
                CAR_ADAPTIVE_SECTION_SIZE
            )
            const left = backrestSensors.firstSide
            const right = backrestSensors.secondSide
            const center = backrestSensors.center
            const leftsit = reverseSensorRows(
                cushionSensors.firstSide,
                CAR_ADAPTIVE_SIDE_COLUMNS
            )
            const rightsit = reverseSensorRows(
                cushionSensors.secondSide,
                CAR_ADAPTIVE_SIDE_COLUMNS
            )
            const centersit = reverseSensorRows(
                cushionSensors.center,
                CAR_ADAPTIVE_CENTER_COLUMNS
            )

            // for (let j = 0; j < 2; j++) {
            //     [right[j * 2 + 0], right[j * 2 + 1]] = [right[j * 2 + 1], right[j * 2 + 0],]

            // }

            // for (let j = 0; j < 2; j++) {

            //     [left[j * 2 + 0], left[j * 2 + 1]] = [left[j * 2 + 1], left[j * 2 + 0],]
            // }


            const data = {
                left: leftsit, right: rightsit, center: centersit, leftsit: right, rightsit: left, centersit: center
            }

            Object.keys(allConfig).forEach((key) => {
                const obj = allConfig[key]
                sitRenew(obj.dataConfig, obj.name, data[obj.name], smoothBig[obj.name]);
            })
            // animationRequestId =requestAnimationFrame(animate);
            renderer.render(scene, camera);
            stats.end();
        }

        function changePointRotation(value) {
            console.log('three', value, group)

            const type = getDisplayType()
            console.log(type)
            // alert(group.uuid)
            // if (group) group.rotation.x = 0 + (value * 2) / 12

            // if (type === 'back') {
            //     const particles = pointGroup.children.find((a) => a.name == 'back')
            //     particles.rotation.x = -Math.PI / 2 + (value * 2) / 12
            // } else if (type === 'sit') {
            //     const particles = pointGroup.children.find((a) => a.name == 'sit')
            //     particles.rotation.x = -Math.PI / 2 + (value * 2) / 12
            // }


            const particles = pointGroup.children.find((a) => a.name == type)
            if (!particles) return
            particles.rotation.x = -Math.PI / 2 + (value * 2) / 12
            // if()


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
            if (camera) camera.position.z = (-120 * 100 / value);
        }

        /** 生成座椅模型局部变换签名，用于判断是否需要重新计算旋转中心。 */
        function getModelTransformSignature(modelTarget) {
            return [
                modelTarget.position.x,
                modelTarget.position.y,
                modelTarget.position.z,
                modelTarget.rotation.x,
                modelTarget.rotation.y,
                modelTarget.rotation.z,
                modelTarget.scale.x,
                modelTarget.scale.y,
                modelTarget.scale.z,
            ].map((value) => Number(value).toFixed(6)).join('|');
        }

        /**
         * 将整体旋转枢轴移动到座椅包围盒中心。
         * 中心首次建立或模型变换变化时补偿内容位移，避免当前画面发生跳动。
         */
        function updateOverallPivotFromModel(modelTarget, overallTransform) {
            const contentTarget = transformTargetsRef.current.content;
            const pivotTarget = transformTargetsRef.current.pivot;
            if (!modelTarget || !contentTarget || !pivotTarget || !modelTarget.children.length) {
                return;
            }

            const signature = getModelTransformSignature(modelTarget);
            const pivotState = overallPivotStateRef.current;
            if (signature === pivotState.signature) return;

            const nextCenter = getObjectBoundsCenterInAncestor(modelTarget, contentTarget);
            if (!nextCenter) return;

            const rotation = overallTransform?.rotation
                || DEFAULT_SCENE_TRANSFORM.overall.rotation;
            const scale = normalizeSceneScale(
                overallTransform?.scale,
                DEFAULT_SCENE_TRANSFORM.overall.scale
            );
            const pivotOffset = getOverallPivotOffset(
                pivotState.center,
                nextCenter,
                rotation,
                scale
            );

            pivotTarget.position.add(pivotOffset);
            contentTarget.position.copy(nextCenter).multiplyScalar(-1);
            overallPivotStateRef.current = {
                signature,
                center: nextCenter.clone(),
            };
        }

        /** 设置整体视图、座椅模型与压力点图的位置和缩放。 */
        function setSceneTransform(transform) {
            sceneTransformRef.current = transform || DEFAULT_SCENE_TRANSFORM;
            const rootTarget = transformTargetsRef.current.root;
            const pivotTarget = transformTargetsRef.current.pivot;
            const modelTarget = transformTargetsRef.current.model;
            const pointTarget = transformTargetsRef.current.pointGroup;

            if (modelTarget && transform?.model) {
                const { x, y, z } = transform.model;
                const scale = normalizeSceneScale(transform.model.scale);
                modelTarget.position.set(x, y, z);
                modelTarget.scale.set(scale.x, scale.y, scale.z);
            }

            updateOverallPivotFromModel(modelTarget, transform?.overall);

            if (pointTarget && transform?.points) {
                const { x, y, z, scale } = transform.points;
                const axisScale = normalizeSceneScale(scale);
                pointTarget.position.set(x, y, z);
                pointTarget.scale.set(axisScale.x, axisScale.y, axisScale.z);
            }

            if (pointTarget && transform?.pointItems) {
                Object.entries(transform.pointItems).forEach(([name, item]) => {
                    const itemTarget = pointTarget.children.find((child) => child.name === name);
                    if (!itemTarget) return;

                    itemTarget.position.set(item.x, item.y, item.z);
                    itemTarget.rotation.set(item.rotation.x, item.rotation.y, item.rotation.z);
                    const scale = normalizeSceneScale(item.scale);
                    itemTarget.scale.set(
                        0.005 * scale.x,
                        0.005 * scale.y,
                        0.005 * scale.z
                    );
                });
            }

            if (rootTarget && transform?.overall) {
                const { x, y, z, rotation } = transform.overall;
                const scale = normalizeSceneScale(transform.overall.scale);
                rootTarget.position.set(x, y, z);
                rootTarget.rotation.set(0, 0, 0);
                rootTarget.scale.set(1, 1, 1);
                if (pivotTarget) {
                    pivotTarget.rotation.set(rotation.x, rotation.y, rotation.z);
                    pivotTarget.scale.set(scale.x, scale.y, scale.z);
                }
            }

            applySensorGroupMirror(transformTargetsRef.current, activeSensorIdRef.current);
        }

        useImperativeHandle(refs, () => ({
            changePointRotation: changePointRotation,
            changeCamera,
            actionSit,
            reset3D,
            setSceneTransform
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


                props.changeViewProp((Math.floor(-120 * 100 / camera.position.z)))
                timer = null; // 重置 timer 变量

            }, 400); // 300毫秒为一个示例值


        }

        function move(position, time, particles) {
            const p1 = {
                x: particles.position.x,
                y: particles.position.y,
                z: particles.position.z,
                rotationx: particles.rotation.x,
                rotationy: particles.rotation.y,
                rotationz: particles.rotation.z,
            };

            const tween1 = new TWEEN.Tween(p1)
                .to(position, time)
                .easing(TWEEN.Easing.Quadratic.InOut);

            tween1.onUpdate(() => {
                particles.position.set(p1.x, p1.y, p1.z);
                if (p1.rotationx) particles.rotation.x = p1.rotationx;
            });

            return tween1;
        }

        function reset3D() {
            controls.reset()
            props.changeViewProp(100)
        }

        function actionSit(type) {


            if (type == 'sit') {
                const particles = pointGroup.children.find((a) => a.name == 'sit')
                const otherParticles = pointGroup.children.find((a) => a.name != 'sit')

                console.log(otherParticles)
                if (Array.isArray(otherParticles)) { otherParticles.forEach((a, index) => a.visible = false) } else {
                    otherParticles.visible = false

                }
                if (chair) chair.visible = false

                // console.log(first)

                particles.visible = true;
                controls.reset()
                tween = move(
                    {
                        x: 0,
                        y: -18,
                        z: -10,
                        rotationx: - Math.PI * 13 / 24,
                    },
                    600,
                    particles
                );

                tween.start();
                sitshowFlag = true
                backshowFlag = false
            } else if (type == 'back') {
                const particles = pointGroup.children.find((a) => a.name == 'back')
                const otherParticles = pointGroup.children.find((a) => a.name != 'back')

                console.log(otherParticles)
                if (Array.isArray(otherParticles)) { otherParticles.forEach((a, index) => a.visible = false) } else {
                    otherParticles.visible = false

                }
                if (chair) chair.visible = false

                // console.log(first)

                particles.visible = true;
                controls.reset()
                tween = move(
                    {
                        x: 17,
                        y: -30,
                        z: 30,
                        rotationx: - Math.PI * 13 / 24,
                    },
                    600,
                    particles
                );

                tween.start();

                sitshowFlag = false
                backshowFlag = true
            } else {
                controls.reset()
                const particles = pointGroup.children
                particles.forEach((a) => a.visible = false)
                if (chair) chair.visible = true
                const sit = pointGroup.children.find((a) => a.name == 'sit')
                const back = pointGroup.children.find((a) => a.name == 'back')
                sit.visible = true
                back.visible = true



                // 16.5, -10, 95

                // if (sit.position.x == 0) {
                tween = move(
                    {
                        x: 0,
                        y: -33,
                        z: 90,
                        rotationx: -Math.PI / 6 - Math.PI / 2 + Math.PI / 2,
                    },
                    600,
                    sit
                );
                tween.start();
                // }

                // 16.5, -3, 90
                // if (back.position.x == 17) {
                tween1 = move(
                    {
                        x: 16.5,
                        y: -3,
                        z: 90,
                        rotationx: -Math.PI / 12 - Math.PI / 2,
                    },
                    600,
                    back
                );
                tween1.start();
                // }

                sitshowFlag = false
                backshowFlag = false
            }


        }



        useEffect(() => {
            // 靠垫数据
            init();
            animate();

            document.addEventListener("wheel", wheel);
            return () => {
                renderer.setAnimationLoop(null);
                document.removeEventListener("wheel", wheel)
                window.removeEventListener("resize", onWindowResize);
            };
        }, []);

        useEffect(() => {
            const nextSensorId = Number(props.sensorId) === 2 ? 2 : 1;
            activeSensorIdRef.current = nextSensorId;
            applySensorGroupMirror(transformTargetsRef.current, nextSensorId);
        }, [props.sensorId]);

        return (
            <div
                // style={{ width: "100%", height: "100%" }}
                id={`canvas`}
            ></div>
        );
    }));
export default CarAir;
