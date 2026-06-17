import { useMemo } from "react";
import type { VaseParameters, MeshData } from "../engine/types";
import { generateVaseMesh } from "../engine/mesh-builder";
import { useUIStore } from "../store/ui-store";

function isRenderableMesh(mesh: MeshData): boolean {
  if (mesh.vertices.length < 9 || mesh.indices.length < 3 || mesh.indices.length % 3 !== 0) {
    return false;
  }

  const vertexCount = mesh.vertices.length / 3;
  for (let index = 0; index < mesh.vertices.length; index++) {
    if (!Number.isFinite(mesh.vertices[index])) {
      return false;
    }
  }

  for (let index = 0; index < mesh.indices.length; index++) {
    if (mesh.indices[index] >= vertexCount) {
      return false;
    }
  }

  return true;
}

function generateRenderableMesh(
  params: VaseParameters,
  includeTestTubeSupport: boolean,
): MeshData | null {
  const mesh = generateVaseMesh(params, { includeTestTubeSupport });
  return isRenderableMesh(mesh) ? mesh : null;
}

/**
 * Hook that generates mesh data from vase parameters.
 * Uses reduced resolution for preview performance.
 */
export function useVaseMesh(params: VaseParameters, seed: number): MeshData | null {
  const generateTestTubeSupport = useUIStore((s) => s.generateTestTubeSupport);

  return useMemo(() => {
    void seed;
    const previewParams: VaseParameters = {
      ...params,
      radialSamples: Math.min(params.radialSamples, 72),
      verticalSamples: Math.min(params.verticalSamples, 96),
    };

    try {
      const mesh = generateRenderableMesh(previewParams, generateTestTubeSupport);
      if (mesh) return mesh;
    } catch (e) {
      console.warn("Mesh generation failed:", e);
    }

    try {
      const mesh = generateRenderableMesh(previewParams, false);
      if (mesh) return mesh;
    } catch (fallbackError) {
      console.warn("Fallback mesh generation failed:", fallbackError);
    }

    try {
      const mesh = generateRenderableMesh(
        {
          ...previewParams,
          textureMode: "Pas de texture",
          textureType: "Aucune",
          textureType2: "Aucune",
          radialSamples: Math.min(previewParams.radialSamples, 48),
          verticalSamples: Math.min(previewParams.verticalSamples, 64),
        },
        false,
      );
      if (mesh) return mesh;
    } catch (simpleFallbackError) {
      console.warn("Simple fallback mesh generation failed:", simpleFallbackError);
    }

    try {
      const mesh = generateRenderableMesh(
        {
          ...previewParams,
          heightMm: Math.max(previewParams.heightMm, 80),
          textureMode: "Pas de texture",
          textureType: "Aucune",
          textureType2: "Aucune",
          radialSamples: 48,
          verticalSamples: 64,
          profiles: previewParams.profiles.map((profile) => ({
            ...profile,
            diameter: Math.max(profile.diameter, 28),
            sides: Math.max(6, Math.min(profile.sides, 24)),
          })),
        },
        false,
      );
      if (mesh) return mesh;
    } catch (lastResortError) {
      console.warn("Last resort mesh generation failed:", lastResortError);
      return null;
    }

    return null;
  }, [
    params.heightMm,
    params.wallThicknessMm,
    params.bottomThicknessMm,
    params.radialSamples,
    params.verticalSamples,
    params.textureMode,
    params.textureType,
    params.textureZoom,
    params.textureType2,
    params.textureZoom2,
    params.openTop,
    params.closeBottom,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    JSON.stringify(params.profiles),
    generateTestTubeSupport,
  ]);
}
