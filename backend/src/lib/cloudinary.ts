import { v2 as cloudinary, type UploadApiResponse, type UploadApiErrorResponse } from "cloudinary";

let isConfigured = false;

function parseCloudinaryUrl(value: string | undefined): {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
} | null {
  if (!value) return null;

  const match = value.trim().match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/i);
  if (!match) return null;

  const [, apiKey, apiSecret, cloudName] = match;
  if (!apiKey || !apiSecret || !cloudName) return null;

  return { cloudName, apiKey, apiSecret };
}

function ensureCloudinaryConfig() {
  if (isConfigured) return;

  const fromUrl = parseCloudinaryUrl(process.env.CLOUDINARY_URL);

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || fromUrl?.cloudName;
  const apiKey = process.env.CLOUDINARY_API_KEY || fromUrl?.apiKey;
  const apiSecret = process.env.CLOUDINARY_API_SECRET || fromUrl?.apiSecret;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      "Cloudinary is not configured. Set CLOUDINARY_URL or CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.",
    );
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });

  isConfigured = true;
}

export function getCloudinaryFolder(...segments: string[]): string {
  const root = process.env.CLOUDINARY_FOLDER || "valore-parfums";
  const cleanSegments = segments
    .map((segment) => String(segment || "").trim())
    .filter(Boolean)
    .map((segment) => segment.replace(/^\/+|\/+$/g, ""));
  return [root, ...cleanSegments].join("/");
}

export async function uploadImageBufferToCloudinary(
  buffer: Buffer,
  options: {
    folder: string;
    publicId: string;
    format?: "webp" | "png" | "jpg" | "jpeg";
    resourceType?: "image";
  },
): Promise<UploadApiResponse> {
  ensureCloudinaryConfig();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: options.folder,
        public_id: options.publicId,
        resource_type: options.resourceType || "image",
        format: options.format,
        overwrite: true,
      },
      (error: UploadApiErrorResponse | undefined, result: UploadApiResponse | undefined) => {
        if (error) return reject(error);
        if (!result) return reject(new Error("Cloudinary upload failed with empty result."));
        resolve(result);
      },
    );

    stream.end(buffer);
  });
}