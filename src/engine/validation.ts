import type { VaseParameters } from "./types";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function validateParams(params: VaseParameters): void {
  if (params.profiles.length < 2) {
    throw new ValidationError("Il faut au minimum 2 profils.");
  }
  if (params.heightMm <= 0) {
    throw new ValidationError("La hauteur totale doit être strictement positive.");
  }
  if (params.wallThicknessMm <= 0) {
    throw new ValidationError("L'épaisseur de coque doit être strictement positive.");
  }
  if (params.bottomThicknessMm < 0) {
    throw new ValidationError("L'épaisseur du fond ne peut pas être négative.");
  }
  if (params.radialSamples < 8) {
    throw new ValidationError("radialSamples doit être >= 8.");
  }
  if (params.verticalSamples < 2) {
    throw new ValidationError("verticalSamples doit être >= 2.");
  }

  const sorted = [...params.profiles].sort((a, b) => a.zRatio - b.zRatio);
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    if (p.zRatio < 0 || p.zRatio > 1) {
      throw new ValidationError(`Le profil ${i + 1} a un z_ratio hors limites [0.0 ; 1.0].`);
    }
    if (p.diameter <= 0) {
      throw new ValidationError(`Le profil ${i + 1} a un diamètre non valide.`);
    }
    if (p.sides < 3) {
      throw new ValidationError(`Le profil ${i + 1} doit avoir au moins 3 côtés.`);
    }
    if (p.scaleX <= 0 || p.scaleY <= 0) {
      throw new ValidationError(`Le profil ${i + 1} a une échelle X/Y non valide.`);
    }
    if (p.diameter <= 2.0 * params.wallThicknessMm) {
      throw new ValidationError(
        `Le profil ${i + 1} est trop petit pour une coque de ${params.wallThicknessMm.toFixed(2)} mm.`,
      );
    }
  }
}
