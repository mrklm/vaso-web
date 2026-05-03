import { useRef, useEffect, useCallback, useMemo } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { EffectComposer, SSAO, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { VaseMesh } from "./VaseMesh";
import { useVaseStore } from "../../store/vase-store";
import { useUIStore } from "../../store/ui-store";
import { useVaseMesh } from "../../hooks/useVaseMesh";
import { buildProfileContour } from "../../engine/geometry";
import { formatEngravingLines } from "../../engine/engraving-text";
import type { VaseParameters } from "../../engine/types";

const ROTATE_SPEED = 0.05;
const PREVIEW_TEXT_FIT_MARGIN_MM = 4;
const PREVIEW_TEXT_WIDTH_FACTOR = 1.9;
const PREVIEW_TEXT_HEIGHT_FACTOR = 0.78;
const PREVIEW_TEXT_CANVAS_WIDTH = 1536;
const PREVIEW_TEXT_CANVAS_HEIGHT = 512;
const PREVIEW_TEXT_Y_OFFSET = 0.08;
const PREVIEW_TEXT_LINE_GAP_FACTOR = 0.55;
const PREVIEW_TEXT_BASE_FONT_SIZES = [108, 96, 96] as const;
const PREVIEW_TEXT_LINE_WIDTH_FACTORS = [0.98, 0.98] as const;
const PREVIEW_TEXT_SIGNATURE_HEIGHT_FACTOR = 0.92;
const PREVIEW_TEXT_SIDE_MARGIN_PX = 29;

function fitPreviewText(
  context: CanvasRenderingContext2D,
  text: string,
  baseFontSize: number,
  targetWidth: number,
): number {
  context.font = `700 ${baseFontSize}px Arial`;
  const measuredWidth = context.measureText(text).width;
  if (measuredWidth <= 0) return baseFontSize;
  return (baseFontSize * targetWidth) / measuredWidth;
}

function computePreviewBottomFitRadius(params: VaseParameters): number {
  const bottomProfiles = [...params.profiles]
    .filter((profile) => profile.zRatio === 0)
    .sort((a, b) => a.zRatio - b.zRatio);
  const bottomProfile = bottomProfiles[0] ?? [...params.profiles].sort((a, b) => a.zRatio - b.zRatio)[0];
  if (!bottomProfile) return 0;

  const contour = buildProfileContour(bottomProfile, Math.min(params.radialSamples, 64));
  let minRadius = Number.POSITIVE_INFINITY;
  for (let i = 0; i < contour.length / 2; i++) {
    const x = contour[i * 2];
    const y = contour[i * 2 + 1];
    minRadius = Math.min(minRadius, Math.hypot(x, y));
  }
  return Math.max(0, minRadius - PREVIEW_TEXT_FIT_MARGIN_MM);
}

function PreviewEngravingOverlay(
  { params, seed, isSeedModified }: { params: VaseParameters; seed: number; isSeedModified: boolean },
) {
  const lines = useMemo(() => formatEngravingLines(seed, isSeedModified), [isSeedModified, seed]);
  const fitRadius = useMemo(() => computePreviewBottomFitRadius(params), [params]);

  const texture = useMemo(() => {
    if (!params.closeBottom || fitRadius <= 8) return null;

    const canvas = document.createElement("canvas");
    canvas.width = PREVIEW_TEXT_CANVAS_WIDTH;
    canvas.height = PREVIEW_TEXT_CANVAS_HEIGHT;
    const context = canvas.getContext("2d");
    if (!context) return null;

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineJoin = "round";
    context.strokeStyle = "rgba(210,210,210,0.45)";
    context.fillStyle = "rgba(28,28,28,0.45)";

    const centerX = canvas.width / 2;
    const lineFontSizes = lines.map((line, index) => {
      const widthFactor = PREVIEW_TEXT_LINE_WIDTH_FACTORS[index];
      if (widthFactor === undefined) {
        return PREVIEW_TEXT_BASE_FONT_SIZES[index] ?? PREVIEW_TEXT_BASE_FONT_SIZES[PREVIEW_TEXT_BASE_FONT_SIZES.length - 1];
      }
      return fitPreviewText(
        context,
        line,
        PREVIEW_TEXT_BASE_FONT_SIZES[index] ?? PREVIEW_TEXT_BASE_FONT_SIZES[PREVIEW_TEXT_BASE_FONT_SIZES.length - 1],
        canvas.width * widthFactor,
      );
    });
    const referenceFontSize = lineFontSizes[Math.min(1, lineFontSizes.length - 1)] ?? PREVIEW_TEXT_BASE_FONT_SIZES[1];
    for (let index = PREVIEW_TEXT_LINE_WIDTH_FACTORS.length; index < lineFontSizes.length; index += 1) {
      lineFontSizes[index] = referenceFontSize * PREVIEW_TEXT_SIGNATURE_HEIGHT_FACTOR;
    }
    const maxHeight = canvas.height * 0.82;
    const computeLayout = (fontSizes: number[]) => {
      const lineGap = Math.max(20, Math.max(...fontSizes) * PREVIEW_TEXT_LINE_GAP_FACTOR);
      const totalHeight =
        fontSizes.reduce((sum, fontSize) => sum + fontSize, 0) +
        lineGap * Math.max(0, fontSizes.length - 1);
      const yScale = totalHeight > maxHeight ? maxHeight / totalHeight : 1;
      const scaledLineHeights = fontSizes.map((fontSize) => fontSize * yScale);
      const scaledGap = lineGap * yScale;
      let currentY =
        canvas.height * 0.5 -
        (scaledLineHeights.reduce((sum, fontSize) => sum + fontSize, 0) +
          scaledGap * Math.max(0, scaledLineHeights.length - 1)) *
          0.5;
      const lineCenters = scaledLineHeights.map((lineHeight) => {
        const centerY = currentY + lineHeight * 0.5;
        currentY += lineHeight + scaledGap;
        return centerY;
      });
      return { lineGap, yScale, scaledLineHeights, scaledGap, lineCenters };
    };

    const firstLayout = computeLayout(lineFontSizes);
    const previewRadiusY = maxHeight * 0.5;
    const safeFontSizes = lineFontSizes.map((fontSize, index) => {
      const dy = (firstLayout.lineCenters[index] ?? canvas.height * 0.5) - canvas.height * 0.5;
      const halfChordFactor = Math.sqrt(Math.max(0, 1 - (dy / previewRadiusY) ** 2));
      const baseWidth =
        canvas.width *
        (PREVIEW_TEXT_LINE_WIDTH_FACTORS[index] ??
          (PREVIEW_TEXT_LINE_WIDTH_FACTORS[PREVIEW_TEXT_LINE_WIDTH_FACTORS.length - 1] * 0.55));
      const allowedWidth = Math.max(0, baseWidth * halfChordFactor - PREVIEW_TEXT_SIDE_MARGIN_PX * 2);
      if (allowedWidth <= 0) return fontSize;
      context.font = `700 ${fontSize}px Arial`;
      const measuredWidth = context.measureText(lines[index]).width;
      if (measuredWidth <= 0 || measuredWidth <= allowedWidth) return fontSize;
      return fontSize * (allowedWidth / measuredWidth);
    });

    const finalLayout = computeLayout(safeFontSizes);

    lines.forEach((line, index) => {
      const fontSize = safeFontSizes[index];
      const lineCenterY = finalLayout.lineCenters[index];
      context.font = `700 ${fontSize}px Arial`;
      context.lineWidth = Math.max(4, fontSize * 0.09);
      context.save();
      context.translate(centerX, lineCenterY);
      context.scale(1, finalLayout.yScale);
      context.strokeText(line, 0, 0);
      context.fillText(line, 0, 0);
      context.restore();
    });

    const nextTexture = new THREE.CanvasTexture(canvas);
    nextTexture.colorSpace = THREE.SRGBColorSpace;
    nextTexture.needsUpdate = true;
    return nextTexture;
  }, [fitRadius, lines, params.closeBottom]);

  useEffect(() => () => texture?.dispose(), [texture]);

  if (!texture || !params.closeBottom || fitRadius <= 8) return null;

  const width = fitRadius * PREVIEW_TEXT_WIDTH_FACTOR;
  const height = fitRadius * PREVIEW_TEXT_HEIGHT_FACTOR;
  const y = params.bottomThicknessMm - params.heightMm / 2 + PREVIEW_TEXT_Y_OFFSET;

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, y, 0]}
      renderOrder={2}
    >
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={0.72}
        alphaTest={0.12}
        side={THREE.DoubleSide}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-1}
      />
    </mesh>
  );
}

function KeyboardControls({ controlsRef }: { controlsRef: React.RefObject<OrbitControlsImpl | null> }) {
  const { camera } = useThree();

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;

      const controls = controlsRef.current;
      if (!controls) return;

      switch (e.key) {
        case "ArrowLeft":
          camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), ROTATE_SPEED);
          controls.update();
          e.preventDefault();
          break;
        case "ArrowRight":
          camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), -ROTATE_SPEED);
          controls.update();
          e.preventDefault();
          break;
        case "ArrowUp":
          camera.position.y = Math.min(400, camera.position.y + 5);
          controls.update();
          e.preventDefault();
          break;
        case "ArrowDown":
          camera.position.y = Math.max(-100, camera.position.y - 5);
          controls.update();
          e.preventDefault();
          break;
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [camera, controlsRef]);

  return null;
}

function ClippingPlane({ heightPercent, maxHeight }: { heightPercent: number; maxHeight: number }) {
  const { gl } = useThree();
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 0, -1), 0), []);

  useEffect(() => {
    // Z in our mesh = height. Clipping plane at the given percent of max height.
    // The mesh is centered, so we need to offset.
    plane.constant = (heightPercent / 100) * maxHeight - maxHeight / 2;
    gl.clippingPlanes = [plane];
    gl.localClippingEnabled = true;
    return () => {
      gl.clippingPlanes = [];
      gl.localClippingEnabled = false;
    };
  }, [heightPercent, maxHeight, gl, plane]);

  return null;
}

function Autoplay({
  controlsRef,
  paramsKey,
  rotationMode,
}: {
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  paramsKey: string;
  rotationMode: "camera" | "vase";
}) {
  const autoRotate = useUIStore((s) => s.autoRotate);
  const setAutoRotate = useUIStore((s) => s.setAutoRotate);

  // Stop on user interaction
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const stop = () => setAutoRotate(false);

    const dom = controls.domElement as HTMLElement | undefined;
    if (!dom) return;
    dom.addEventListener("pointerdown", stop);
    dom.addEventListener("wheel", stop);
    dom.addEventListener("touchstart", stop);

    return () => {
      dom.removeEventListener("pointerdown", stop);
      dom.removeEventListener("wheel", stop);
      dom.removeEventListener("touchstart", stop);
    };
  }, [controlsRef, setAutoRotate]);

  // Restart rotation when params change (new vase generated)
  useEffect(() => {
    setAutoRotate(rotationMode === "camera");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey, rotationMode]);

  useFrame(() => {
    if (!controlsRef.current) return;

    controlsRef.current.autoRotate = rotationMode === "camera" && autoRotate;
    controlsRef.current.autoRotateSpeed = 1.5;
  });

  return null;
}

function ScreenshotBridge() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const setCaptureViewerImage = useUIStore((s) => s.setCaptureViewerImage);

  useEffect(() => {
    const capture = async (): Promise<string | null> => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          gl.render(scene, camera);
          resolve();
        });
      });

      try {
        return gl.domElement.toDataURL("image/png");
      } catch {
        return null;
      }
    };

    setCaptureViewerImage(capture);
    return () => setCaptureViewerImage(null);
  }, [camera, gl, scene, setCaptureViewerImage]);

  return null;
}

export function VaseViewer3D() {
  const params = useVaseStore((s) => s.params);
  const seed = useVaseStore((s) => s.seed);
  const isSeedModified = useVaseStore((s) => s.isSeedModified);
  const randomize = useVaseStore((s) => s.randomize);
  const shading = useUIStore((s) => s.shading);
  const showGrid = useUIStore((s) => s.showGrid);
  const vaseColor = useUIStore((s) => s.vaseColor);
  const wireframe = useUIStore((s) => s.wireframe);
  const flatShading = useUIStore((s) => s.flatShading);
  const showClipping = useUIStore((s) => s.showClipping);
  const clippingHeight = useUIStore((s) => s.clippingHeight);
  const rotationMode = useUIStore((s) => s.rotationMode);
  const rotationSpeed = useUIStore((s) => s.rotationSpeed);
  const meshData = useVaseMesh(params, seed);
  const showSeedModified = isSeedModified;
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const lastTapRef = useRef(0);
  const paramsKey = JSON.stringify(params);

  const handleDoubleTap = useCallback(
    (e: React.TouchEvent) => {
      const now = Date.now();
      if (now - lastTapRef.current < 350) {
        e.preventDefault();
        randomize();
      }
      lastTapRef.current = now;
    },
    [randomize],
  );

  return (
    <div className="viewer-3d" onTouchEnd={handleDoubleTap}>
      <Canvas
        camera={{ position: [220, 160, 220], fov: 45, near: 0.1, far: 2000 }}
        style={{ background: "var(--color-bg)" }}
        gl={{ preserveDrawingBuffer: true }}
        shadows
      >
        <ambientLight intensity={0.25} />
        <directionalLight
          position={[100, 200, 100]}
          intensity={1.6}
          castShadow
          shadow-bias={-0.0005}
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-near={10}
          shadow-camera-far={500}
          shadow-camera-left={-200}
          shadow-camera-right={200}
          shadow-camera-top={200}
          shadow-camera-bottom={-200}
        />
        <directionalLight position={[-3, 4, -2]} intensity={0.3} />
        <pointLight position={[0, 200, 0]} intensity={0.3} />
        <hemisphereLight args={["#b1e1ff", "#b97a20", 0.3]} />

        {meshData && (
          <VaseMesh
            meshData={meshData}
            shading={shading}
            color={vaseColor}
            wireframe={wireframe}
            flatShading={flatShading}
            rotationMode={rotationMode}
            rotationSpeed={rotationSpeed}
          />
        )}

        <PreviewEngravingOverlay params={params} seed={seed} isSeedModified={showSeedModified} />

        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -params.heightMm / 2 - 0.01, 0]}
          receiveShadow
        >
          <planeGeometry args={[600, 600]} />
          <shadowMaterial opacity={0.5} />
        </mesh>

        {/* <ContactShadows position={[0, -0.01, 0]} opacity={0.4} scale={300} blur={2} far={200} /> */}

        <OrbitControls
          ref={controlsRef}
          enableDamping
          dampingFactor={0.1}
          minDistance={50}
          maxDistance={500}
        />
        <ScreenshotBridge />
        <KeyboardControls controlsRef={controlsRef} />
        <Autoplay controlsRef={controlsRef} paramsKey={paramsKey} rotationMode={rotationMode} />

        {showClipping && <ClippingPlane heightPercent={clippingHeight} maxHeight={params.heightMm} />}
        {showGrid && (
          <gridHelper
            args={[300, 30, "#333333", "#333333"]}
            position={[0, -params.heightMm / 2, 0]}
          />
        )}

        <EffectComposer>
          <SSAO radius={0.03} intensity={5} luminanceInfluence={0.3} />
          <ToneMapping mode={ToneMappingMode.AGX} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
