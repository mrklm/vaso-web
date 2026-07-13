import { useRef, useEffect, useMemo } from "react";
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
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const geometry = useMemo(() => {
    const nextGeometry = new THREE.BufferGeometry();
    nextGeometry.setAttribute("position", new THREE.Float32BufferAttribute(meshData.vertices, 3));
    nextGeometry.setIndex(new THREE.Uint32BufferAttribute(meshData.indices, 1));
    nextGeometry.computeVertexNormals();

    // Center the mesh
    nextGeometry.computeBoundingBox();
    if (nextGeometry.boundingBox) {
      const center = new THREE.Vector3();
      nextGeometry.boundingBox.getCenter(center);
      nextGeometry.translate(-center.x, -center.y, -center.z);
    }
    nextGeometry.computeBoundingBox();
    nextGeometry.computeBoundingSphere();
    return nextGeometry;
  }, [meshData]);

  useFrame((_, delta) => {
    if (!meshRef.current) return;

    if (rotationMode === "vase") {
      meshRef.current.rotation.z += delta * 0.8 * rotationSpeed;
    }
  });

  useEffect(() => {
    return () => geometry.dispose();
  }, [geometry]);

  useEffect(() => {
    if (!materialRef.current) return;
    materialRef.current.needsUpdate = true;
  }, [flatShading]);

  const roughness = 1 - (shading / 100) * 0.7;
  const metalness = (shading / 100) * 0.3;

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      rotation={[-Math.PI / 2, 0, 0]}
      castShadow
      receiveShadow
    >
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
