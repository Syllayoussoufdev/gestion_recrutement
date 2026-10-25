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
