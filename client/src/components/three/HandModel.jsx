import React, { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

export function HandModel({
  isRecording = false,
  pressureValue = 0,
  isLeftHand = true,
  heatmapCanvas = null,
  heatmapVersion = 0
}) {
  const containerRef = useRef(null)
  const sceneRef = useRef(null)
  const rendererRef = useRef(null)
  const animationRef = useRef(null)
  const handGroupRef = useRef(null)
  const heatmapTextureRef = useRef(null)
  const modelRef = useRef(null)
  const baseScaleRef = useRef(1)

  useEffect(() => {
    if (!containerRef.current) return

    // Scene setup
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xBCC6D0)
    sceneRef.current = scene

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      45,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    )
    camera.position.set(0, 0.2, 5)

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight)
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.shadowMap.enabled = true
    containerRef.current.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7)
    scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9)
    directionalLight.position.set(5, 5, 5)
    directionalLight.castShadow = true
    scene.add(directionalLight)

    const pointLight = new THREE.PointLight(0x3B82F6, 0.4)
    pointLight.position.set(-3, 3, 3)
    scene.add(pointLight)

    // Create hand group
    const handGroup = new THREE.Group()
    handGroupRef.current = handGroup
    scene.add(handGroup)

    // Load GLB model
    const loader = new GLTFLoader()
    const modelUrl = '/assets/hand0423g.glb'
    loader.load(
      modelUrl,
      (gltf) => {
        const model = gltf.scene
        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true
            child.receiveShadow = true
          }
        })

        const box = new THREE.Box3().setFromObject(model)
        const size = new THREE.Vector3()
        box.getSize(size)
        const center = new THREE.Vector3()
        box.getCenter(center)
        model.position.sub(center)

        const maxDim = Math.max(size.x, size.y, size.z) || 1
        const scale = 2.6 / maxDim
        baseScaleRef.current = scale
        model.scale.setScalar(scale)
        modelRef.current = model

        handGroup.add(model)

        if (heatmapCanvas) {
          const texture = new THREE.CanvasTexture(heatmapCanvas)
          texture.needsUpdate = true
          heatmapTextureRef.current = texture
          handGroup.traverse((child) => {
            if (child.isMesh && child.name !== 'pressureIndicator') {
              if (Array.isArray(child.material)) {
                child.material.forEach((mat) => {
                  mat.map = texture
                  mat.needsUpdate = true
                })
              } else {
                child.material.map = texture
                child.material.needsUpdate = true
              }
            }
          })
        }
      },
      undefined,
      (err) => {
        console.warn('[HandModel] Failed to load GLB:', err)
      }
    )

    // Add pressure indicator (glowing sphere)
    const indicatorGeometry = new THREE.SphereGeometry(0.15, 32, 32)
    const indicatorMaterial = new THREE.MeshBasicMaterial({
      color: 0xEF4444,
      transparent: true,
      opacity: 0.8
    })
    const indicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial)
    indicator.position.set(0, -0.5, 0.6)
    indicator.name = 'pressureIndicator'
    indicator.visible = false
    handGroup.add(indicator)

    handGroup.rotation.x = -0.2
    handGroup.position.y = 0.2

    // Grid helper
    const gridHelper = new THREE.GridHelper(10, 20, 0xffffff, 0xffffff)
    gridHelper.material.opacity = 0.1
    gridHelper.material.transparent = true
    gridHelper.position.y = -4
    scene.add(gridHelper)

    // Animation loop
    const animate = () => {
      animationRef.current = requestAnimationFrame(animate)
      if (handGroup) {
        handGroup.rotation.y = Math.sin(Date.now() * 0.001) * 0.2
      }
      renderer.render(scene, camera)
    }
    animate()

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current) return
      const width = containerRef.current.clientWidth
      const height = containerRef.current.clientHeight
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      if (rendererRef.current && containerRef.current) {
        containerRef.current.removeChild(rendererRef.current.domElement)
        rendererRef.current.dispose()
      }
      if (handGroupRef.current) {
        handGroupRef.current.traverse((child) => {
          if (child.isMesh) {
            child.geometry?.dispose()
            if (Array.isArray(child.material)) {
              child.material.forEach((m) => m.dispose())
            } else {
              child.material?.dispose()
            }
          }
        })
      }
    }
  }, [])

  // Update pressure indicator
  useEffect(() => {
    if (handGroupRef.current) {
      const indicator = handGroupRef.current.getObjectByName('pressureIndicator')
      if (indicator) {
        indicator.visible = isRecording
        if (isRecording) {
          const scale = 0.5 + (pressureValue / 200) * 1.5
          indicator.scale.setScalar(scale)
          
          // Change color based on pressure
          const hue = Math.max(0, 0.6 - (pressureValue / 200) * 0.6)
          indicator.material.color.setHSL(hue, 0.8, 0.5)
          indicator.material.opacity = 0.9
        }
      }
    }
  }, [pressureValue, isRecording])

  useEffect(() => {
    if (!heatmapCanvas || !handGroupRef.current) return
    if (!heatmapTextureRef.current) {
      heatmapTextureRef.current = new THREE.CanvasTexture(heatmapCanvas)
    } else {
      heatmapTextureRef.current.image = heatmapCanvas
    }
    heatmapTextureRef.current.needsUpdate = true
    const texture = heatmapTextureRef.current
    handGroupRef.current.traverse((child) => {
      if (child.isMesh && child.name !== 'pressureIndicator') {
        if (Array.isArray(child.material)) {
          child.material.forEach((mat) => {
            mat.map = texture
            mat.needsUpdate = true
          })
        } else {
          child.material.map = texture
          child.material.needsUpdate = true
        }
      }
    })
  }, [heatmapCanvas, heatmapVersion])

  useEffect(() => {
    const model = modelRef.current
    if (!model) return
    const baseScale = baseScaleRef.current || 1
    const sign = isLeftHand ? 1 : -1
    model.scale.set(baseScale * sign, baseScale, baseScale)
  }, [isLeftHand])

  return (
    <div 
      ref={containerRef} 
      className="w-full h-full"
      style={{ minHeight: '400px' }}
    />
  )
}

export default HandModel
