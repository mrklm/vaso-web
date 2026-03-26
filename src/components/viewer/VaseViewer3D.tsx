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
const PREVIEW_TEXT_WIDTH_FACTOR = 1.45;
const PREVIEW_TEXT_HEIGHT_FACTOR = 0.44;
const PREVIEW_TEXT_CANVAS_WIDTH = 1536;
const PREVIEW_TEXT_CANVAS_HEIGHT = 512;
const PREVIEW_TEXT_Y_OFFSET = 0.08;

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
    const line1Y = canvas.height * 0.39;
    const line2Y = canvas.height * 0.69;

    context.font = "700 108px Arial";
    context.lineWidth = 10;
    context.strokeText(lines[0], centerX, line1Y);
    context.fillText(lines[0], centerX, line1Y);

    context.font = "700 96px Arial";
    context.lineWidth = 8;
    context.strokeText(lines[1], centerX, line2Y);
    context.fillText(lines[1], centerX, line2Y);

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
  const enforcePrinterVolume = useUIStore((s) => s.enforcePrinterVolume);
  const showClipping = useUIStore((s) => s.showClipping);
  const clippingHeight = useUIStore((s) => s.clippingHeight);
  const rotationMode = useUIStore((s) => s.rotationMode);
  const rotationSpeed = useUIStore((s) => s.rotationSpeed);
  const meshData = useVaseMesh(params, seed);
  const showSeedModified = isSeedModified || enforcePrinterVolume;
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
