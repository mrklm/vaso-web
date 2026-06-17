import { useMemo } from "react";
import { useVaseStore } from "../../store/vase-store";
import { useUIStore } from "../../store/ui-store";
import {
  analyzeWaterproofInsertCompatibility,
  getInsertPresetById,
} from "../../engine/insert-compatibility";
import { generateOuterProfilePoints } from "../../engine/mesh-builder";

export function InsertView2D() {
  const params = useVaseStore((s) => s.params);
  const showCompatibleInsert = useUIStore((s) => s.showCompatibleInsert);

  const insertData = useMemo(() => {
    try {
      const previewParams = {
        ...params,
        radialSamples: Math.min(params.radialSamples, 48),
        verticalSamples: Math.min(params.verticalSamples, 64),
      };
      const profileData = generateOuterProfilePoints(previewParams, 100);
      const compatibility = analyzeWaterproofInsertCompatibility(previewParams);
      const preset = getInsertPresetById(compatibility.presetId);
      if (!preset) {
        return null;
      }

      return { profileData, compatibility, preset };
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(params)]);

  if (!showCompatibleInsert) {
    return null;
  }

  if (!insertData) {
    return <div className="view-2d placeholder">Contenant indisponible</div>;
  }

  const { profileData, compatibility, preset } = insertData;
  const { zValues, radiusValues } = profileData;
  const maxR = Math.max(...Array.from(radiusValues)) * 1.1;
  const maxZ = params.heightMm;
  const w = 200;
  const h = 260;
  const margin = 20;
  const plotW = w - 2 * margin;
  const plotH = h - 2 * margin;

  let pathRight = "";
  let pathLeft = "";
  for (let i = 0; i < zValues.length; i++) {
    const x = margin + (radiusValues[i] / maxR) * (plotW / 2) + plotW / 2;
    const y = h - margin - (zValues[i] / maxZ) * plotH;
    const xMirror = margin + plotW / 2 - (radiusValues[i] / maxR) * (plotW / 2);
    pathRight += `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)} `;
    pathLeft += `${i === 0 ? "M" : "L"}${xMirror.toFixed(1)},${y.toFixed(1)} `;
  }

  const innerBottomZ = Math.min(params.bottomThicknessMm, params.heightMm);
  const insertTopZ =
    preset.type === "test_tube"
      ? Math.max(innerBottomZ, params.heightMm - 5)
      : Math.min(params.heightMm, innerBottomZ + preset.heightMm);
  const insertBottomZ =
    preset.type === "test_tube"
      ? Math.max(innerBottomZ, insertTopZ - preset.heightMm)
      : innerBottomZ;
  const insertBottomRadius = (preset.bottomDiameterMm ?? preset.topDiameterMm) / 2;
  const insertTopRadius = preset.topDiameterMm / 2;
  const insertLeftBottomX = margin + plotW / 2 - (insertBottomRadius / maxR) * (plotW / 2);
  const insertRightBottomX = margin + plotW / 2 + (insertBottomRadius / maxR) * (plotW / 2);
  const insertLeftTopX = margin + plotW / 2 - (insertTopRadius / maxR) * (plotW / 2);
  const insertRightTopX = margin + plotW / 2 + (insertTopRadius / maxR) * (plotW / 2);
  const insertBottomY = h - margin - (insertBottomZ / maxZ) * plotH;
  const insertTopY = h - margin - (insertTopZ / maxZ) * plotH;
  const insertPath =
    preset.type === "test_tube"
      ? (() => {
          const roundedBottomRadiusMm = Math.min(insertTopRadius, (insertTopZ - insertBottomZ) / 2);
          const roundedBottomTopZ = insertBottomZ + roundedBottomRadiusMm;
          const roundedBottomTopY = h - margin - (roundedBottomTopZ / maxZ) * plotH;

          return [
            `M${insertLeftTopX.toFixed(1)},${insertTopY.toFixed(1)}`,
            `L${insertLeftBottomX.toFixed(1)},${roundedBottomTopY.toFixed(1)}`,
            `Q${(w / 2).toFixed(1)},${insertBottomY.toFixed(1)} ${insertRightBottomX.toFixed(1)},${roundedBottomTopY.toFixed(1)}`,
            `L${insertRightTopX.toFixed(1)},${insertTopY.toFixed(1)}`,
            "Z",
          ].join(" ");
        })()
      : [
          `M${insertLeftBottomX.toFixed(1)},${insertBottomY.toFixed(1)}`,
          `L${insertLeftTopX.toFixed(1)},${insertTopY.toFixed(1)}`,
          `L${insertRightTopX.toFixed(1)},${insertTopY.toFixed(1)}`,
          `L${insertRightBottomX.toFixed(1)},${insertBottomY.toFixed(1)}`,
          "Z",
        ].join(" ");

  const dimensionsLabel =
    preset.type === "eco_cup"
      ? `${preset.heightMm} × ${preset.topDiameterMm} / ${(preset.bottomDiameterMm ?? preset.topDiameterMm).toFixed(0)} mm`
      : "75 × 12 mm";

  return (
    <div className="view-2d view-2d-insert">
      <div className="view-2d-title">Contenant</div>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <path d={pathRight} fill="none" stroke="var(--color-accent)" strokeWidth="2" />
        <path d={pathLeft} fill="none" stroke="var(--color-accent)" strokeWidth="2" opacity="0.5" />
        <path
          d={insertPath}
          fill="var(--color-accent)"
          fillOpacity="0.2"
          stroke="var(--color-accent)"
          strokeWidth="1.5"
        />
        <line
          x1={w / 2}
          y1={margin}
          x2={w / 2}
          y2={h - margin}
          stroke="var(--color-fg)"
          strokeWidth="0.5"
          opacity="0.25"
          strokeDasharray="4,4"
        />
      </svg>
      <div className="view-2d-caption">
        <strong>{compatibility.label}</strong>
        <span>{dimensionsLabel}</span>
      </div>
    </div>
  );
}
