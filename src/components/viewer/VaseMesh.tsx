import { useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { MeshData } from "../../engine/types";

interface VaseMeshProps {
  meshData: MeshData;
  shading: number;
  color: string;
  wireframe: boolean;
  flatShading: boolean;
  rotationMode: "camera" | "vase";
  rotationSpeed: number;
}

export function VaseMesh({
  meshData,
  shading,
  color,
  wireframe,
  flatShading,
  rotationMode,
  rotationSpeed,
}: VaseMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const geometryRef = useRef<THREE.BufferGeometry>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);

  useFrame((_, delta) => {
    if (!meshRef.current) return;

    if (rotationMode === "vase") {
      meshRef.current.rotation.z += delta * 0.8 * rotationSpeed;
    }
  });

  useEffect(() => {
    if (!geometryRef.current) return;
    const geo = geometryRef.current;

    geo.setAttribute("position", new THREE.Float32BufferAttribute(meshData.vertices, 3));
    geo.setIndex(new THREE.Uint32BufferAttribute(meshData.indices, 1));
    geo.computeVertexNormals();

    // Center the mesh
    geo.computeBoundingBox();
    if (geo.boundingBox) {
      const center = new THREE.Vector3();
      geo.boundingBox.getCenter(center);
      geo.translate(-center.x, -center.y, -center.z);
    }
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
  }, [meshData]);

  useEffect(() => {
    if (!materialRef.current) return;
    materialRef.current.needsUpdate = true;
  }, [flatShading]);

  const roughness = 1 - (shading / 100) * 0.7;
  const metalness = (shading / 100) * 0.3;

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
      <bufferGeometry ref={geometryRef} />
      <meshStandardMaterial
        ref={materialRef}
        color={color}
        roughness={roughness}
        metalness={metalness}
        wireframe={wireframe}
        flatShading={flatShading}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
