import { useEffect } from "react";
import type { VaseParameters } from "../engine/types";
import { useVaseStore } from "../store/vase-store";

function encodeParams(params: VaseParameters): string {
  return btoa(JSON.stringify(params));
}

function decodeParams(hash: string): VaseParameters | null {
  try {
    return JSON.parse(atob(hash));
  } catch {
    return null;
  }
}

export function getShareUrl(params: VaseParameters): string {
  const base = window.location.href.split("#")[0];
  return `${base}#${encodeParams(params)}`;
}

export function useUrlShare() {
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const params = decodeParams(hash);
    if (params && params.profiles?.length >= 2) {
      useVaseStore.getState().setParams(params);
    }
  }, []);
}
