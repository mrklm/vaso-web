import { useMemo } from "react";
import { useVaseStore } from "../../store/vase-store";
import { generateOuterProfilePoints } from "../../engine/mesh-builder";

export function ProfileView2D() {
  const params = useVaseStore((s) => s.params);

  const profileData = useMemo(() => {
    try {
      const previewParams = {
        ...params,
        radialSamples: Math.min(params.radialSamples, 48),
        verticalSamples: Math.min(params.verticalSamples, 64),
      };
      return generateOuterProfilePoints(previewParams, 100);
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(params)]);

  if (!profileData) {
    return <div className="view-2d placeholder">Silhouette indisponible</div>;
  }

  const { zValues, radiusValues } = profileData;
  const maxR = Math.max(...Array.from(radiusValues)) * 1.1;
  const maxZ = params.heightMm;

  // SVG dimensions
  const w = 200,
    h = 260;
  const margin = 20;
  const plotW = w - 2 * margin;
  const plotH = h - 2 * margin;

  // Build path (right side profile + mirrored left)
  let pathRight = "";
  let pathLeft = "";
  for (let i = 0; i < zValues.length; i++) {
    const x = margin + (radiusValues[i] / maxR) * (plotW / 2) + plotW / 2;
    const y = h - margin - (zValues[i] / maxZ) * plotH;
    const xMirror = margin + plotW / 2 - (radiusValues[i] / maxR) * (plotW / 2);
    pathRight += `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)} `;
    pathLeft += `${i === 0 ? "M" : "L"}${xMirror.toFixed(1)},${y.toFixed(1)} `;
  }

  return (
    <div className="view-2d">
      <div className="view-2d-title">Silhouette</div>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <path d={pathRight} fill="none" stroke="var(--color-accent)" strokeWidth="2" />
        <path d={pathLeft} fill="none" stroke="var(--color-accent)" strokeWidth="2" opacity="0.5" />
        {/* Center line */}
        <line
          x1={w / 2}
          y1={margin}
          x2={w / 2}
          y2={h - margin}
          stroke="var(--color-fg)"
          strokeWidth="0.5"
          opacity="0.3"
          strokeDasharray="4,4"
        />
      </svg>
    </div>
  );
}
