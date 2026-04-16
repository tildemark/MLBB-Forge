/**
 * lib/oci-storage.ts
 *
 * OCI Object Storage client using the S3-compatible API.
 * Auth: Customer Secret Keys (OCI_ACCESS_KEY_ID + OCI_SECRET_ACCESS_KEY)
 * Endpoint: https://<namespace>.compat.objectstorage.<region>.oraclecloud.com
 */

import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";

if (!process.env.OCI_S3_ENDPOINT) throw new Error("Missing OCI_S3_ENDPOINT");
if (!process.env.OCI_ACCESS_KEY_ID) throw new Error("Missing OCI_ACCESS_KEY_ID");
if (!process.env.OCI_SECRET_ACCESS_KEY)
  throw new Error("Missing OCI_SECRET_ACCESS_KEY");
if (!process.env.OCI_BUCKET) throw new Error("Missing OCI_BUCKET");

const BUCKET = process.env.OCI_BUCKET;
// OCI_OBJECT_PREFIX is the folder inside the bucket (e.g. "mlbb")
// so objects land at cdn-bucket/mlbb/items/blade_of_despair.png
// which is served as https://cdn.sanchez.ph/mlbb/items/blade_of_despair.png
const OBJECT_PREFIX = (process.env.OCI_OBJECT_PREFIX ?? "mlbb").replace(/\/$/, "");
const CDN_BASE =
  process.env.NEXT_PUBLIC_CDN_URL ?? "https://cdn.sanchez.ph/mlbb/";

const OCI_REGION = process.env.OCI_REGION ?? "us-phoenix-1";

export const ociClient = new S3Client({
  region: OCI_REGION,
  endpoint: process.env.OCI_S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.OCI_ACCESS_KEY_ID,
    secretAccessKey: process.env.OCI_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

// OCI's S3-compat API uses a custom endpoint, so the AWS SDK cannot
// auto-discover the signing region from it. We inject it via middleware.
ociClient.middlewareStack.add(
  (next) => async (args: any) => {
    if (args.request?.headers) {
      // Ensure the region used for SigV4 signing matches OCI's region
      args.request.region = OCI_REGION;
    }
    return next(args);
  },
  { step: "serialize" as any, name: "ociRegionMiddleware", priority: "high" }
);

/**
 * Check if an object already exists in OCI (avoid redundant uploads).
 */
export async function objectExists(objectKey: string): Promise<boolean> {
  const fullKey = `${OBJECT_PREFIX}/${objectKey.replace(/^\//, "")}`;
  try {
    await ociClient.send(
      new HeadObjectCommand({ Bucket: BUCKET, Key: fullKey })
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Upload a file buffer to OCI Object Storage.
 *
 * @param objectKey  - Path relative to the mlbb/ prefix, e.g. "items/blade_of_despair.png"
 * @param body       - File contents as a Buffer
 * @param contentType - MIME type, defaults to "image/png"
 * @returns The CDN URL for the uploaded asset
 */
export async function uploadToCDN(
  objectKey: string,
  body: Buffer,
  contentType = "image/png"
): Promise<string> {
  const fullKey = `${OBJECT_PREFIX}/${objectKey.replace(/^\//, "")}`;
  await ociClient.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: fullKey,
      Body: body,
      ContentType: contentType,
      // Make objects publicly readable (bucket must have public read policy)
      ACL: "public-read",
      CacheControl: "public, max-age=31536000, immutable",
    })
  );

  // CDN_BASE already includes the /mlbb/ path prefix, so just append the relative key
  return `${CDN_BASE.replace(/\/$/, "")}/${objectKey.replace(/^\//, "")}`;
}

/**
 * Download an image from a remote URL and upload it to OCI.
 * Skips the upload if the object already exists.
 *
 * @param remoteUrl  - Source image URL (e.g. from Fandom wiki)
 * @param objectKey  - Destination key inside the bucket
 * @returns CDN URL
 */
export async function mirrorImageToCDN(
  remoteUrl: string,
  objectKey: string
): Promise<string> {
  const alreadyExists = await objectExists(objectKey);
  if (alreadyExists) {
    return `${CDN_BASE.replace(/\/$/, "")}/${objectKey.replace(/^\//, "")}`;
  }

  const response = await fetch(remoteUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch image from ${remoteUrl}: ${response.status} ${response.statusText}`
    );
  }

  const contentType = response.headers.get("content-type") ?? "image/png";
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return uploadToCDN(objectKey, buffer, contentType);
}
