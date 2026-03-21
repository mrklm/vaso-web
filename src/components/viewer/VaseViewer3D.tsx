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

const ROTATE_SPEED = 0.05;

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
}: {
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  paramsKey: string;
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
    setAutoRotate(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey]);

  useFrame(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = autoRotate;
      controlsRef.current.autoRotateSpeed = 1.5;
    }
  });

  return null;
}

export function VaseViewer3D() {
  const params = useVaseStore((s) => s.params);
  const randomize = useVaseStore((s) => s.randomize);
  const shading = useUIStore((s) => s.shading);
  const showGrid = useUIStore((s) => s.showGrid);
  const vaseColor = useUIStore((s) => s.vaseColor);
  const wireframe = useUIStore((s) => s.wireframe);
  const flatShading = useUIStore((s) => s.flatShading);
  const showClipping = useUIStore((s) => s.showClipping);
  const clippingHeight = useUIStore((s) => s.clippingHeight);
  const meshData = useVaseMesh(params);
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
        camera={{ position: [150, 120, 150], fov: 45, near: 0.1, far: 2000 }}
        style={{ background: "var(--color-bg)" }}
        shadows
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 8, 5]} intensity={1.2} castShadow shadow-mapSize={1024} />
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
          />
        )}

        {/* <ContactShadows position={[0, -0.01, 0]} opacity={0.4} scale={300} blur={2} far={200} /> */}

        <OrbitControls
          ref={controlsRef}
          enableDamping
          dampingFactor={0.1}
          minDistance={50}
          maxDistance={500}
        />
        <KeyboardControls controlsRef={controlsRef} />
        <Autoplay controlsRef={controlsRef} paramsKey={paramsKey} />

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
