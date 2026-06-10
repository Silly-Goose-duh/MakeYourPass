import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Float, MeshDistortMaterial, Environment, Lightformer, Stars, PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

// ---------- Floating Torus Knot ----------
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
      <mesh ref={meshRef} scale={1.8}>
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
        opacity={0.6}
        wireframe
      />
    </mesh>
  )
}

// ---------- Glowing Particles ----------
function Particles() {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const count = 200
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 20
      positions[i * 3 + 1] = (Math.random() - 0.5) * 20
      positions[i * 3 + 2] = (Math.random() - 0.5) * 20
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return geo
  }, [])

  return (
    <points args={[geometry]}>
      <pointsMaterial
        size={0.03}
        color="#f5d700"
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
      { radius: 2.5, color: '#f5d700', opacity: 0.3, segments: 64 },
      { radius: 3.2, color: '#ffffff', opacity: 0.15, segments: 80 },
      { radius: 1.8, color: '#f5d700', opacity: 0.2, segments: 48 },
    ]
  }, [])

  return (
    <group ref={groupRef}>
      {rings.map((ring, i) => (
        <mesh key={i} rotation={[Math.PI / 3 * i, 0, 0]}>
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
      <directionalLight position={[-5, -5, -5]} intensity={0.5} color="#ffffff" />
      <pointLight position={[0, 0, 5]} intensity={2} color="#f5d700" />

      {/* Stars background */}
      <Stars radius={30} depth={50} count={1000} factor={4} saturation={0} fade speed={1} />

      {/* Environment */}
      <Environment preset="night" />

      {/* Main shapes */}
      <TorusKnot />
      <GeometricRings />

      {/* Floating shapes */}
      <FloatingIcosahedron position={[-4, 2, -2]} color="#f5d700" scale={0.4} speed={0.7} />
      <FloatingIcosahedron position={[4, -2, -1]} color="#ffffff" scale={0.35} speed={0.5} />
      <FloatingIcosahedron position={[-3, -3, 1]} color="#f5d700" scale={0.3} speed={0.9} />

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
    <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-text-muted text-sm font-medium">Loading experience...</p>
      </div>
    </div>
  )
}