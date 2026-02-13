
import * as THREE from 'three'

const options = {
    min: 0,
    max: 13000,
    size: 10
}
let isShadow = true




function getRandomIntInclusive(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function addSide(arr, width, height, wnum, hnum, sideNum) {
    const narr = new Array(height);
    const res = [];
    for (let i = 0; i < height; i++) {
        narr[i] = [];

        for (let j = 0; j < width; j++) {
            if (j == 0) {
                narr[i].push(
                    ...new Array(wnum).fill(sideNum >= 0 ? sideNum : 1),
                    arr[i * width + j]
                );
            } else if (j == width - 1) {
                narr[i].push(
                    arr[i * width + j],
                    ...new Array(wnum).fill(sideNum >= 0 ? sideNum : 1)
                );
            } else {
                narr[i].push(arr[i * width + j]);
            }
        }
    }
    for (let i = 0; i < height; i++) {
        res.push(...narr[i]);
    }

    return [
        ...new Array(hnum * (width + 2 * wnum)).fill(sideNum >= 0 ? sideNum : 1),
        ...res,
        ...new Array(hnum * (width + 2 * wnum)).fill(sideNum >= 0 ? sideNum : 1),
    ];
}


function interpSmall(smallMat, width, height, interp1, interp2) {

    const bigMat = new Array((width * interp1) * (height * interp2)).fill(0)
    for (let i = 0; i < height; i++) {
        for (let j = 0; j < width; j++) {
            bigMat[(width * interp1) * i * interp2 + (j * interp1)] = smallMat[i * width + j] * 10
            bigMat[(width * interp1) * (i * interp2 + 1) + (j * interp1)] = smallMat[i * width + j] * 10
        }
    }

    // console.log(bigMat.length)
    return bigMat
}




function generateData(arr, canvas, width, height, interp1, interp2, order) {
    // const resData = [0, 0, 1, 21, 9, 1, 0, 0, 0, 0, 0, 0, 0, 6, 5, 0, 0, 0, 0, 0, 0, 3, 28, 27, 37, 50, 56, 43, 34, 11, 1, 21, 45, 39, 37, 37, 9, 1, 0, 0, 3, 37, 6, 40, 48, 33, 3, 0, 0, 0, 2, 1, 1, 21, 33, 24, 2, 0, 0, 0, 0, 0, 1, 13, 26, 18, 4, 0, 0, 0, 0, 2, 16, 37, 34, 69, 51, 4, 1, 0, 1, 2, 15, 35, 52, 56, 39, 5, 0, 0, 0, 1, 14, 23, 4, 6, 30, 31, 1, 0, 0, 1, 1, 14, 1, 0, 5, 20, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 4, 0, 0, 0, 1, 34, 4, 0, 0, 2, 30, 3, 1, 0, 1, 19, 29, 0, 0, 1, 14, 0, 0, 0, 0, 3, 32, 1, 2, 3, 5, 1, 1, 1, 1, 2, 6]
    let resData
    let resArr = arr
    resArr = addSide(
        resArr,
        height,
        width,
        order,
        order,
        0
    );
    const interpArr = interpSmall(resArr, height + order * 2, width + order * 2, interp1, interp2)

    resData = interpArr
    const count = 32
    const data = []
    // const width = 36, height = 36 * 2
    const dataWidth = (width + order * 2) * interp1, dataHeight = (height + + order * 2) * interp2
    for (let i = 0; i < dataHeight; i++) {
        for (let j = 0; j < dataWidth; j++) {
            let obj = {}
            obj.y = i * canvas.width / dataWidth
            obj.x = j * canvas.height / dataHeight
            obj.value = resData[i * dataWidth + j]
            data.push(obj)
        }

    }
    return data
}



// 构造一个离屏canvas
function Canvas(width, height) {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return canvas
}

// 画圆
function createCircle(size) {
    const shadowBlur = size / 2
    const r2 = size + shadowBlur
    // let offsetDistance = 10000
    const offsetDistance = 10000
    // let newCanvas:UserConstructor = Canvas

    const circle = new (Canvas)(r2 * 2, r2 * 2)
    const context = circle.getContext('2d')




    // if (isShadow) context.shadowBlur = shadowBlur;
    if (isShadow) context.shadowBlur = shadowBlur;
    context.shadowColor = 'black'
    context.shadowOffsetX = context.shadowOffsetY = offsetDistance

    context.beginPath()
    context.arc(r2 - offsetDistance, r2 - offsetDistance, size, 0, Math.PI * 2, true)
    context.closePath()
    context.fill()
    return circle
}

function draw(context, data, canvas, options) {
    let circle = createCircle(options.size, data.value)
    let circleHalfWidth = circle.width / 2
    let circleHalfHeight = circle.height / 2

    // 按透明度分类
    let dataOrderByAlpha = {}
    data.forEach((item, index) => {
        let alpha = Math.min(1, item.value / options.max).toFixed(2)
        dataOrderByAlpha[alpha] = dataOrderByAlpha[alpha] || []
        dataOrderByAlpha[alpha].push(item)
    })


    // 绘制不同透明度的圆形
    for (let i in dataOrderByAlpha) {
        if (isNaN(i)) continue;
        let _data = dataOrderByAlpha[i]
        context.beginPath()
        context.globalAlpha = i
        _data.forEach(item => {
            // 把所有的圆都画再画布上
            context.drawImage(circle, item.x - circleHalfWidth, item.y - circleHalfHeight)
        })
    }
    // 圆形着色
    let intensity = new Intensity(options)
    // 返回整张画布的像素信息 rgba组个成的点像素 
    let colored = context.getImageData(0, 0, context.canvas.width, context.canvas.height)

    // 形参 画布的像素数组   , 渐变的像素数组 
    colorize(colored.data, intensity.getImageData(), options)


    context.clearRect(0, 0, context.canvas.width, context.canvas.height)
    context.fillStyle = '#666'
    context.fillRect(0, 0, context.canvas.width, context.canvas.height)


    context.clearRect(0, 0, context.canvas.width, context.canvas.height)

    // 将所有像素渲染
    context.putImageData(colored, 0, 0)

    applySharpen(context, canvas.width, canvas.height);
}


function applySharpen(context, width, height) {
    // 获取原始图像数据
    const originalImageData = context.getImageData(0, 0, width, height);
    const originalPixels = originalImageData.data;

    // 创建一个用于存放处理后的图像数据的 ImageData 对象
    const outputImageData = context.createImageData(width, height);
    const outputPixels = outputImageData.data;

    const kernel = [
        0, -1, 0,
        -1, 5, -1,
        0, -1, 0,
    ];

    const kernelSize = Math.sqrt(kernel.length);
    const halfKernelSize = Math.floor(kernelSize / 2);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let r = 0; let g = 0; let b = 0;

            for (let ky = 0; ky < kernelSize; ky++) {
                for (let kx = 0; kx < kernelSize; kx++) {
                    // 考虑边缘像素
                    const pixelY = y + ky - halfKernelSize;
                    const pixelX = x + kx - halfKernelSize;

                    if (pixelY < 0 || pixelY >= height || pixelX < 0 || pixelX >= width) continue;

                    // 卷积计算
                    const offset = (pixelY * width + pixelX) * 4;
                    const weight = kernel[ky * kernelSize + kx];

                    r += originalPixels[offset] * weight;
                    g += originalPixels[offset + 1] * weight;
                    b += originalPixels[offset + 2] * weight;
                }
            }

            const destOffset = (y * width + x) * 4;
            outputPixels[destOffset] = r;
            outputPixels[destOffset + 1] = g;
            outputPixels[destOffset + 2] = b;
            outputPixels[destOffset + 3] = originalPixels[destOffset + 3]; // 保持相同的 alpha 值
        }
    }

    // 将处理后的图像数据绘制回画布
    context.putImageData(outputImageData, 0, 0);
}


function colorize(pixels, gradient, options) {

    // console.log(gradient)

    const max = options.max;
    const min = options.min;
    const diff = max - min;
    var range = options.range || null;

    var jMin = options.fliter ? options.fliter : 100;
    var jMax = 1024;
    if (range && range.length === 2) {
        jMin = (range[0] - min) / diff * 1024;
    }

    if (range && range.length === 2) {
        jMax = (range[1] - min) / diff * 1024;
    }

    const maxOpacity = options.maxOpacity || 1;
    var range = options.range;
    // console.log(pixels.length)
    for (var i = 3, len = pixels.length, j; i < len; i += 4) {
        j = pixels[i] * 4; // get gradient color from opacity value

        // if (pixels[i] / 256 > maxOpacity) {
        //     pixels[i] = 256 * maxOpacity;
        // }
        if (pixels[i] / 256 < 1) {
            pixels[i] = 256 * 1;
        }
        // const value = jet()
        if (j && j >= jMin && j <= jMax) {
            pixels[i - 3] = gradient[j];
            pixels[i - 2] = gradient[j + 1];
            pixels[i - 1] = gradient[j + 2];
        } else {
            pixels[i] = 0;
        }
        // pixels[i] = 256 *0
    }
}


function bthClickHandle(arr, canvas, width, height, interp1, interp2, order, options) {

    const data = generateData(arr, canvas, width, height, interp1, interp2, order, options)

    let context = canvas.getContext('2d')
    // let context2 = canvas2.getContext('2d')
    context.clearRect(0, 0, canvas.width, canvas.height)
    // context2.clearRect(0, 0, canvas2.width, canvas2.height)
    isShadow = true
    context.globalCompositeOperation = 'lighter';
    // context2.drawImage(img, 0, 0, canvas2.width, canvas2.height);
    draw(context, data, canvas, options)
    isShadow = false

    // draw(context2, data)
}

function Intensity(options) {


    options = options || {};
    this.gradient = options.gradient || {


        // // 士凯
        0.00: '#ffffff',
        0.01: "#4192fe",
        0.08: "#49aaff",
        0.17: "#51c6ff",
        0.25: "#4ddff5",
        0.33: "#34f6db",
        0.42: "#6cffb9",
        0.50: "#c5ff8b",
        0.58: "#fdf655",
        0.67: "#ffda41",
        0.75: "#ffb54a",
        0.83: "#ff9555",
        0.92: "#ff7665",
        1.00: "#ff0000"

        // 0.00: "#ffffff",
       
        // 1.00: "#ffffff"


    };
    this.maxSize = options.maxSize || 35;
    this.minSize = options.minSize || 0;
    this.max = options.max || 100;
    this.min = options.min || 0;
    this.initPalette();
}

Intensity.prototype.setMax = function (value) {
    this.max = value || 100;
}

Intensity.prototype.setMin = function (value) {
    this.min = value || 0;
}

Intensity.prototype.setMaxSize = function (maxSize) {
    this.maxSize = maxSize || 35;
}

Intensity.prototype.setMinSize = function (minSize) {
    this.minSize = minSize || 0;
}

// Intensity.prototype.initPalette = function () {

//     var gradient = this.gradient;

//     var canvas = new (Canvas)(256, 1);

//     var paletteCtx = this.paletteCtx = canvasRef.current.getContext('2d', { willReadFrequently: true });

//     var lineGradient = paletteCtx.createLinearGradient(0, 0, 256, 1);

//     for (var key in gradient) {
//         lineGradient.addColorStop(parseFloat(key), gradient[key]);
//     }

//     paletteCtx.fillStyle = lineGradient;
//     paletteCtx.fillRect(0, 0, 256, 1);

// }

Intensity.prototype.initPalette = function () {

    const gradient = this.gradient;

    var canvas = new Canvas(256, 1);

    var paletteCtx = this.paletteCtx = canvas.getContext('2d');

    // 创建一个线性渐变 返回一个线性CanvasGradient
    var lineGradient = paletteCtx.createLinearGradient(0, 0, 256, 1);


    // 添加一个由偏移（offset）和颜色（color）定义的断点到渐变中。
    for (var key in gradient) {
        lineGradient.addColorStop(parseFloat(key), gradient[key]);
    }

    paletteCtx.fillStyle = lineGradient;
    paletteCtx.fillRect(0, 0, 256, 1);

}



Intensity.prototype.getImageData = function (value) {

    const imageData = this.paletteCtx.getImageData(0, 0, 256, 1).data;

    if (value === undefined) {
        return imageData;
    }

    const max = this.max;
    const min = this.min;

    if (value > max) {
        value = max;
    }

    if (value < min) {
        value = min;
    }

    const index = Math.floor((value - min) / (max - min) * (256 - 1));

    return [imageData[index], imageData[index + 1], imageData[index + 2], imageData[index + 3]];
}

/**
 * @param Number value
 * @param Number max of value
 * @param Number max of size
 * @param Object other options
 */
Intensity.prototype.getSize = function (value) {

    let size = 0;
    const max = this.max;
    const min = this.min;
    const maxSize = this.maxSize;
    const minSize = this.minSize;

    if (value > max) {
        value = max;
    }

    if (value < min) {
        value = min;
    }

    size = minSize + (value - min) / (max - min) * (maxSize - minSize);

    return size;

}

Intensity.prototype.getLegend = function (options, canvas1) {
    const gradient = this.gradient;


    const width = options.width || 20;
    const height = options.height || 180;

    const canvas = new (Canvas)(width, height);

    const paletteCtx = canvas1.current.getContext('2d');

    const lineGradient = paletteCtx.createLinearGradient(0, height, 0, 0);

    for (const key in gradient) {
        lineGradient.addColorStop(parseFloat(key), gradient[key]);
    }

    paletteCtx.fillStyle = lineGradient;
    paletteCtx.fillRect(0, 0, width, height);

    return canvas;
}

const changeOptions = (value) => {
    options.size = value
}



let i = 0
export class HeatmapCanvas {
    constructor(width, height, canvasWProp, canvasHProp, canvasName, options) {
        this.width = 32
        this.height = 32

        this.canvas = document.createElement('canvas');


        // document.body.appendChild(this.canvas)


        const dpr = window.devicePixelRatio || 1;
        // // console.log(contentWidth,dpr)
        // this.canvas = canvas
        const contentWidth = 1024
        this.options = {
            min: 0,
            max: 2000,
            size: contentWidth * canvasWProp / 4

        }


        if (canvasName === 'body') {
            this.options.size = contentWidth * canvasWProp / 40
            this.canvas.width = contentWidth * canvasWProp
            this.canvas.height = contentWidth * canvasHProp
        } else if (canvasName === 'left') {
            this.canvas.width = contentWidth * canvasWProp
            this.canvas.height = contentWidth * canvasHProp
        }
        else {
            this.canvas.width = contentWidth * canvasWProp
            this.canvas.height = contentWidth * canvasHProp
        }
        if (options) this.options = options

        this.useGPU = false
        try {
            this.gpuCanvas = document.createElement('canvas')
            this.gpuCanvas.width = this.canvas.width
            this.gpuCanvas.height = this.canvas.height
            this.renderer = new THREE.WebGLRenderer({
                canvas: this.gpuCanvas,
                antialias: false,
                alpha: true,
                preserveDrawingBuffer: true
            })
            this.renderer.setSize(this.gpuCanvas.width, this.gpuCanvas.height, false)
            this.renderer.setClearColor(0x000000, 0)

            this.scene = new THREE.Scene()
            this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
            const texelSize = new THREE.Vector2(1 / this.width, 1 / this.height)
            this.dataTexture = new THREE.DataTexture(
                new Uint8Array(this.width * this.height * 4),
                this.width,
                this.height,
                THREE.RGBAFormat
            )
            this.dataTexture.minFilter = THREE.LinearFilter
            this.dataTexture.magFilter = THREE.LinearFilter
            this.dataTexture.needsUpdate = true

            const gradient = (this.options && this.options.gradient) || DEFAULT_GRADIENT
            this.gradientTexture = buildGradientTexture(gradient)
            this.material = createHeatmapMaterial(this.dataTexture, this.gradientTexture, texelSize)
            const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material)
            this.scene.add(plane)
            this.cpuCtx = this.canvas.getContext('2d')
            this.useGPU = true
        } catch (err) {
            this.useGPU = false
        }



    }

    changeHeatmap(resArr, interp1, interp2, order) {
        if (!this.useGPU) {
            bthClickHandle(resArr, this.canvas, this.width, this.height, interp1, interp2, order, this.options)
            return
        }
        const min = typeof this.options.min === 'number' ? this.options.min : 0
        const max = typeof this.options.max === 'number' ? this.options.max : 1
        const range = max - min || 1
        const data = this.dataTexture.image.data
        const total = this.width * this.height
        for (let i = 0; i < total; i++) {
            const v = Array.isArray(resArr) ? resArr[i] || 0 : 0
            let n = (v - min) / range
            if (n < 0) n = 0
            if (n > 1) n = 1
            const base = i * 4
            const value = Math.round(n * 255)
            data[base] = value
            data[base + 1] = value
            data[base + 2] = value
            data[base + 3] = 255
        }
        this.dataTexture.needsUpdate = true
        this.material.uniforms.uSharpen.value = typeof this.options.sharpen === 'number' ? this.options.sharpen : 0.6
        this.material.uniforms.uGamma.value = typeof this.options.gamma === 'number' ? this.options.gamma : 1.0
        this.material.uniforms.uFlipX.value = this.options.flipX ? 1.0 : 0.0
        this.material.uniforms.uFlipY.value = this.options.flipY === false ? 0.0 : 1.0
        this.renderer.render(this.scene, this.camera)
        if (this.cpuCtx && this.gpuCanvas) {
            this.cpuCtx.clearRect(0, 0, this.canvas.width, this.canvas.height)
            this.cpuCtx.drawImage(this.gpuCanvas, 0, 0, this.canvas.width, this.canvas.height)
        }
    }
}

function changeArrValue(arr, arrMax, backMax, name) {
    const props = name ? 1 : 0.8
    return arr.map((a) => Math.floor(a * backMax / arrMax * props))
}

const DEFAULT_GRADIENT = {
    0.00: '#ffffff',
    0.01: "#4192fe",
    0.08: "#49aaff",
    0.17: "#51c6ff",
    0.25: "#4ddff5",
    0.33: "#34f6db",
    0.42: "#6cffb9",
    0.50: "#c5ff8b",
    0.58: "#fdf655",
    0.67: "#ffda41",
    0.75: "#ffb54a",
    0.83: "#ff9555",
    0.92: "#ff7665",
    1.00: "#ff0000"
}

function buildGradientTexture(gradient) {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 1
    const ctx = canvas.getContext('2d')
    const stops = Object.keys(gradient)
        .map((k) => ({ stop: parseFloat(k), color: gradient[k] }))
        .sort((a, b) => a.stop - b.stop)
    const lineGradient = ctx.createLinearGradient(0, 0, 256, 0)
    stops.forEach(({ stop, color }) => lineGradient.addColorStop(stop, color))
    ctx.fillStyle = lineGradient
    ctx.fillRect(0, 0, 256, 1)
    const texture = new THREE.CanvasTexture(canvas)
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.wrapS = THREE.ClampToEdgeWrapping
    texture.wrapT = THREE.ClampToEdgeWrapping
    texture.needsUpdate = true
    return texture
}

function createHeatmapMaterial(dataTexture, gradientTexture, texelSize) {
    return new THREE.ShaderMaterial({
        transparent: true,
        uniforms: {
            uData: { value: dataTexture },
            uGradient: { value: gradientTexture },
            uTexel: { value: texelSize },
            uSharpen: { value: 0.6 },
            uGamma: { value: 1.0 },
            uFlipX: { value: 0.0 },
            uFlipY: { value: 1.0 }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            precision mediump float;
            varying vec2 vUv;
            uniform sampler2D uData;
            uniform sampler2D uGradient;
            uniform vec2 uTexel;
            uniform float uSharpen;
            uniform float uGamma;
            uniform float uFlipX;
            uniform float uFlipY;

            void main() {
                vec2 uv = vUv;
                if (uFlipX > 0.5) uv.x = 1.0 - uv.x;
                if (uFlipY > 0.5) uv.y = 1.0 - uv.y;
                float c = texture2D(uData, uv).r;
                float l = texture2D(uData, uv + vec2(-uTexel.x, 0.0)).r;
                float r = texture2D(uData, uv + vec2(uTexel.x, 0.0)).r;
                float u = texture2D(uData, uv + vec2(0.0, uTexel.y)).r;
                float d = texture2D(uData, uv + vec2(0.0, -uTexel.y)).r;
                float blur = (l + r + u + d) * 0.25;
                float v = clamp(c + uSharpen * (c - blur), 0.0, 1.0);
                v = pow(v, uGamma);
                vec4 col = texture2D(uGradient, vec2(v, 0.5));
                gl_FragColor = col;
            }
        `
    })
}



