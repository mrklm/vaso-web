import { useRef, useEffect } from "react";
import * as THREE from "three";
import type { MeshData } from "../../engine/types";

interface VaseMeshProps {
  meshData: MeshData;
  shading: number;
  color: string;
  wireframe: boolean;
  flatShading: boolean;
}

export function VaseMesh({ meshData, shading, color, wireframe, flatShading }: VaseMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const geometryRef = useRef<THREE.BufferGeometry>(null);

  useEffect(() => {
    if (!geometryRef.current) return;
    const geo = geometryRef.current;

    geo.setAttribute("position", new THREE.Float32BufferAttribute(meshData.vertices, 3));
    geo.setIndex(new THREE.Uint32BufferAttribute(meshData.indices, 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();

    // Center the mesh
    geo.computeBoundingBox();
    if (geo.boundingBox) {
      const center = new THREE.Vector3();
      geo.boundingBox.getCenter(center);
      geo.translate(-center.x, -center.y, -center.z);
    }
  }, [meshData]);

  const roughness = 1 - (shading / 100) * 0.7;
  const metalness = (shading / 100) * 0.3;

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
      <bufferGeometry ref={geometryRef} />
      <meshStandardMaterial
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
