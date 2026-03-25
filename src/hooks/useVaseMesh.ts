import { useMemo } from "react";
import type { VaseParameters, MeshData } from "../engine/types";
import { generateVaseMesh } from "../engine/mesh-builder";

/**
 * Hook that generates mesh data from vase parameters.
 * Uses reduced resolution for preview performance.
 */
export function useVaseMesh(params: VaseParameters, seed: number): MeshData | null {
  return useMemo(() => {
    void seed;
    try {
      const previewParams: VaseParameters = {
        ...params,
        radialSamples: Math.min(params.radialSamples, 72),
        verticalSamples: Math.min(params.verticalSamples, 96),
      };
      return generateVaseMesh(previewParams);
    } catch (e) {
      console.warn("Mesh generation failed:", e);
      return null;
    }
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
  ]);
}
