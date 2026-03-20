import { useMemo } from "react";
import { useVaseStore } from "../../store/vase-store";
import { generateTopOuterContour } from "../../engine/mesh-builder";

export function TopView2D() {
  const params = useVaseStore((s) => s.params);

  const contour = useMemo(() => {
    try {
      const previewParams = {
        ...params,
        radialSamples: Math.min(params.radialSamples, 48),
        verticalSamples: Math.min(params.verticalSamples, 32),
      };
      return generateTopOuterContour(previewParams);
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(params)]);

  if (!contour) {
    return <div className="view-2d placeholder">Vue du haut indisponible</div>;
  }

  const n = contour.length / 2;
  const size = 200;
  const margin = 20;
  const plotSize = size - 2 * margin;

  // Find bounds
  let maxAbsVal = 1;
  for (let i = 0; i < n; i++) {
    maxAbsVal = Math.max(maxAbsVal, Math.abs(contour[i * 2]), Math.abs(contour[i * 2 + 1]));
  }
  maxAbsVal *= 1.1;

  // Build closed path
  let path = "";
  for (let i = 0; i <= n; i++) {
    const idx = i % n;
    const x = margin + ((contour[idx * 2] / maxAbsVal + 1) / 2) * plotSize;
    const y = margin + ((contour[idx * 2 + 1] / maxAbsVal + 1) / 2) * plotSize;
    path += `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)} `;
  }
  path += "Z";

  return (
    <div className="view-2d">
      <div className="view-2d-title">Vue du haut</div>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <path d={path} fill="none" stroke="var(--color-accent)" strokeWidth="2" />
        {/* Center crosshair */}
        <circle cx={size / 2} cy={size / 2} r="2" fill="var(--color-fg)" opacity="0.3" />
      </svg>
    </div>
  );
}
