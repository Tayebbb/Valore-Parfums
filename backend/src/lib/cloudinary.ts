import type { UploadApiResponse, UploadApiErrorResponse } from "cloudinary";

let configuredClient: typeof import("cloudinary").v2 | undefined;

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

async function ensureCloudinaryConfig() {
  if (configuredClient) return configuredClient;

  const fromUrl = parseCloudinaryUrl(process.env.CLOUDINARY_URL);

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim() || fromUrl?.cloudName;
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim() || fromUrl?.apiKey;
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim() || fromUrl?.apiSecret;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      "Cloudinary is not configured. Set CLOUDINARY_URL or CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.",
    );
  }

  // The SDK reads CLOUDINARY_URL during module initialization and can throw.
  // Load it only inside the authenticated upload's error-handling boundary.
  const { v2: cloudinary } = await import("cloudinary");
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });

  configuredClient = cloudinary;
  return cloudinary;
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
  const cloudinary = await ensureCloudinaryConfig();

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
        if (error) return reject(new Error(error.message || "Cloudinary upload failed."));
        if (!result) return reject(new Error("Cloudinary upload failed with empty result."));
        resolve(result);
      },
    );

    stream.end(buffer);
  });
}
