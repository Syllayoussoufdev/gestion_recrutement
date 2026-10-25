import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export { cloudinary };

export interface CloudinarySignatureParams {
  folder: string;
  publicId?: string;
}

export function generateUploadSignature(params: CloudinarySignatureParams) {
  const timestamp = Math.round(new Date().getTime() / 1000);
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;

  if (!apiSecret || !apiKey || !cloudName) {
    throw new Error("Configuration Cloudinary incomplète (CLOUDINARY_* manquants).");
  }

  const paramsToSign: Record<string, string | number> = {
    timestamp,
    folder: params.folder,
  };

  if (params.publicId) {
    paramsToSign.public_id = params.publicId;
  }

  const signature = cloudinary.utils.api_sign_request(paramsToSign, apiSecret);

  return {
    signature,
    timestamp,
    apiKey,
    cloudName,
    folder: params.folder,
  };
}

export interface DocumentSignatureParams {
  folder: string;
  type?: "authenticated" | "upload";
}

/**
 * Génère la signature pour les documents privés (CVs, diplômes...) en mode authenticated (R4)
 */
export function generateDocumentUploadSignature(params: DocumentSignatureParams) {
  const timestamp = Math.round(new Date().getTime() / 1000);
  const type = params.type || "authenticated";
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;

  if (!apiSecret || !apiKey || !cloudName) {
    throw new Error("Configuration Cloudinary incomplète (CLOUDINARY_* manquants).");
  }

  const paramsToSign: Record<string, string | number> = {
    folder: params.folder,
    timestamp,
    type,
  };

  const signature = cloudinary.utils.api_sign_request(paramsToSign, apiSecret);

  return {
    signature,
    timestamp,
    apiKey,
    cloudName,
    folder: params.folder,
    type,
  };
}

/**
 * Génère une URL temporaire signée (durée par défaut : 10 minutes) pour un document privé (R4)
 */
export function generatePrivateDownloadUrl(
  publicId: string,
  resourceType: "raw" | "image" = "raw",
  format: string = "",
  expiresInSeconds: number = 600
): { url: string; expiresAt: Date } {
  const expiresAtEpoch = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const url = cloudinary.utils.private_download_url(publicId, format, {
    expires_at: expiresAtEpoch,
    resource_type: resourceType,
    type: "authenticated",
  });

  return {
    url,
    expiresAt: new Date(expiresAtEpoch * 1000),
  };
}

/**
 * Supprime un document ou une ressource privée sur Cloudinary
 */
export async function deleteCloudinaryAsset(
  publicId: string,
  resourceType: "raw" | "image" = "raw",
  deliveryType: string = "authenticated"
) {
  try {
    return await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
      type: deliveryType,
    });
  } catch (error) {
    console.error("Erreur destruction asset Cloudinary:", error);
    return null;
  }
}
