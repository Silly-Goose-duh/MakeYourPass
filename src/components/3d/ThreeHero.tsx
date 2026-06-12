import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Float, MeshDistortMaterial, Environment, Lightformer, Stars, PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'

// ---------- Floating Torus Knot (Yellow - hero) ----------
function TorusKnot() {
  const meshRef = useRef<THREE.Mesh>(null!)

  useFrame((state, delta) => {
    if (!meshRef.current) return
    meshRef.current.rotation.x += delta * 0.15
    meshRef.current.rotation.y += delta * 0.2
    meshRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.3) * 0.3
  })

  return (
    <Float speed={2} rotationIntensity={0.3} floatIntensity={0.5}>
      <mesh ref={meshRef} scale={1.6}>
        <torusKnotGeometry args={[1, 0.3, 128, 24]} />
        <MeshDistortMaterial
          color="#f5d700"
          emissive="#f5d700"
          emissiveIntensity={0.4}
          metalness={0.8}
          roughness={0.2}
          distort={0.3}
          speed={2}
          transparent
          opacity={0.9}
        />
      </mesh>
    </Float>
  )
}

// ---------- Pink Ring (secondary hero) ----------
function PinkRing() {
  const ref = useRef<THREE.Mesh>(null!)

  useFrame((state, delta) => {
    if (!ref.current) return
    ref.current.rotation.z += delta * 0.2
    ref.current.position.y = Math.sin(state.clock.elapsedTime * 0.4) * 0.5
  })

  return (
    <Float speed={1.5} rotationIntensity={0.4} floatIntensity={0.6}>
      <mesh ref={ref} position={[2.5, 0.5, -1]} scale={0.8}>
        <torusGeometry args={[1.2, 0.05, 32, 64]} />
        <MeshDistortMaterial
          color="#ff2d95"
          emissive="#ff2d95"
          emissiveIntensity={0.6}
          metalness={0.3}
          roughness={0.4}
          distort={0.2}
          speed={1.5}
          transparent
          opacity={0.8}
        />
      </mesh>
    </Float>
  )
}

// ---------- Cyan Icosahedron (accent) ----------
function CyanIcosahedron() {
  const ref = useRef<THREE.Mesh>(null!)

  useFrame((state) => {
    if (!ref.current) return
    ref.current.rotation.x += 0.01
    ref.current.rotation.y += 0.02
    ref.current.position.y = -1.5 + Math.sin(state.clock.elapsedTime * 0.5) * 0.4
  })

  return (
    <mesh ref={ref} position={[-2.8, -1.5, 0.5]} scale={0.5}>
      <icosahedronGeometry args={[1, 0]} />
      <meshStandardMaterial
        color="#00f0ff"
        emissive="#00f0ff"
        emissiveIntensity={0.3}
        metalness={0.5}
        roughness={0.3}
        transparent
        opacity={0.7}
        wireframe
      />
    </mesh>
  )
}

// ---------- Floating Geometric Shapes ----------
function FloatingIcosahedron({ position, color, scale = 0.5, speed = 0.5 }: {
  position: [number, number, number]
  color: string
  scale?: number
  speed?: number
}) {
  const ref = useRef<THREE.Mesh>(null!)
  const initialPos = useMemo(() => new THREE.Vector3(...position), [position])

  useFrame((state) => {
    if (!ref.current) return
    ref.current.rotation.x += 0.01 * speed
    ref.current.rotation.y += 0.015 * speed
    ref.current.position.y = initialPos.y + Math.sin(state.clock.elapsedTime * speed) * 0.4
  })

  return (
    <mesh ref={ref} position={position} scale={scale}>
      <icosahedronGeometry args={[1, 0]} />
      <meshStandardMaterial
        color={color}
        metalness={0.6}
        roughness={0.3}
        transparent
        opacity={0.5}
        wireframe
      />
    </mesh>
  )
}

// ---------- Glowing Particles (multi-color) ----------
function Particles() {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const count = 300
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 24
      positions[i * 3 + 1] = (Math.random() - 0.5) * 24
      positions[i * 3 + 2] = (Math.random() - 0.5) * 24
      // Random yellow, pink, or cyan
      const choice = Math.random()
      if (choice < 0.4) {
        colors[i * 3] = 245 / 255; colors[i * 3 + 1] = 215 / 255; colors[i * 3 + 2] = 0 // yellow
      } else if (choice < 0.7) {
        colors[i * 3] = 1; colors[i * 3 + 1] = 45 / 255; colors[i * 3 + 2] = 149 / 255 // pink
      } else {
        colors[i * 3] = 0; colors[i * 3 + 1] = 240 / 255; colors[i * 3 + 2] = 1 // cyan
      }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return geo
  }, [])

  const ref = useRef<THREE.Points>(null!)

  useFrame((state) => {
    if (!ref.current) return
    ref.current.rotation.y += 0.001
  })

  return (
    <points ref={ref} args={[geometry]}>
      <pointsMaterial
        size={0.04}
        vertexColors
        transparent
        opacity={0.6}
        sizeAttenuation
        blending={2}
      />
    </points>
  )
}

// ---------- Rotating Geometric Rings ----------
function GeometricRings() {
  const groupRef = useRef<THREE.Group>(null!)

  useFrame((_, delta) => {
    if (!groupRef.current) return
    groupRef.current.rotation.y += delta * 0.1
    groupRef.current.rotation.x += delta * 0.05
  })

  const rings = useMemo(() => {
    return [
      { radius: 2.5, color: '#f5d700', opacity: 0.25, segments: 64 },
      { radius: 3.2, color: '#ff2d95', opacity: 0.15, segments: 80 },
      { radius: 1.8, color: '#00f0ff', opacity: 0.2, segments: 48 },
      { radius: 4.0, color: '#ffffff', opacity: 0.08, segments: 96 },
    ]
  }, [])

  return (
    <group ref={groupRef}>
      {rings.map((ring, i) => (
        <mesh key={i} rotation={[Math.PI / 4 * i, Math.PI / 6 * i, 0]}>
          <ringGeometry args={[ring.radius - 0.02, ring.radius, ring.segments]} />
          <meshBasicMaterial
            color={ring.color}
            transparent
            opacity={ring.opacity}
            side={2}
          />
        </mesh>
      ))}
    </group>
  )
}

// ---------- Main Scene ----------
function Scene() {
  return (
    <>
      {/* Camera */}
      <PerspectiveCamera makeDefault position={[0, 0, 8]} fov={45} />

      {/* Lighting */}
      <ambientLight intensity={0.2} />
      <directionalLight position={[5, 5, 5]} intensity={1.5} color="#f5d700" />
      <directionalLight position={[-5, -5, -5]} intensity={0.5} color="#00f0ff" />
      <pointLight position={[0, 0, 5]} intensity={2} color="#f5d700" />
      <pointLight position={[3, -2, 3]} intensity={1} color="#ff2d95" />

      {/* Stars background */}
      <Stars radius={30} depth={50} count={1000} factor={4} saturation={0} fade speed={1} />

      {/* Environment */}
      <Environment preset="night" />

      {/* Main shapes */}
      <TorusKnot />
      <PinkRing />
      <CyanIcosahedron />
      <GeometricRings />

      {/* Floating shapes */}
      <FloatingIcosahedron position={[-4, 2, -2]} color="#f5d700" scale={0.4} speed={0.7} />
      <FloatingIcosahedron position={[4, -2.5, -1]} color="#ff2d95" scale={0.35} speed={0.5} />
      <FloatingIcosahedron position={[-3, -3.5, 1]} color="#00f0ff" scale={0.3} speed={0.9} />

      {/* Particles */}
      <Particles />

      {/* Lightformers for reflections */}
      <Lightformer
        position={[5, 0, 5]}
        scale={[5, 5, 1]}
        color="#f5d700"
        intensity={0.5}
        form="circle"
      />
      <Lightformer
        position={[-5, 2, 3]}
        scale={[3, 3, 1]}
        color="#ff2d95"
        intensity={0.3}
        form="rect"
      />
    </>
  )
}

// ---------- Public Wrapper ----------
export function Scene3D() {
  return (
    <div className="absolute inset-0 pointer-events-none">
      <Canvas
        dpr={[1, 2]}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
        }}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
        }}
      >
        <Scene />
      </Canvas>
    </div>
  )
}

// ---------- Loading Fallback ----------
export function SceneFallback() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-text-muted text-sm font-medium">Loading experience...</p>
      </div>
    </div>
  )
}
