import "dotenv/config";
import { S3Client, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";

const client = new S3Client({
  region: process.env.OCI_REGION ?? "us-phoenix-1",
  endpoint: process.env.OCI_S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.OCI_ACCESS_KEY_ID!,
    secretAccessKey: process.env.OCI_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true,
});

async function main() {
  console.log("OCI_S3_ENDPOINT:", process.env.OCI_S3_ENDPOINT);
  console.log("OCI_BUCKET:     ", process.env.OCI_BUCKET);
  console.log("OCI_REGION:     ", process.env.OCI_REGION);
  console.log("ACCESS_KEY_ID:  ", process.env.OCI_ACCESS_KEY_ID?.slice(0, 8) + "...");
  console.log("");

  try {
    console.log("🔍 Listing bucket...");
    const list = await client.send(new ListObjectsV2Command({
      Bucket: process.env.OCI_BUCKET!,
      Prefix: "mlbb/",
      MaxKeys: 5,
    }));
    console.log("✅ List succeeded. Objects found:", list.KeyCount);

    console.log("\n📤 Uploading test object...");
    await client.send(new PutObjectCommand({
      Bucket: process.env.OCI_BUCKET!,
      Key: "mlbb/_test.txt",
      Body: Buffer.from("oci-connection-test"),
      ContentType: "text/plain",
      ACL: "public-read",
    }));
    console.log("✅ Upload succeeded!");
    console.log("   CDN URL: https://cdn.sanchez.ph/mlbb/_test.txt");
  } catch (err: any) {
    console.error("❌ OCI Error:", err.message);
    console.error("   Code:", err.Code ?? err.code);
    console.error("   Status:", err.$metadata?.httpStatusCode);
  }
}

main();

try {
  // Test 1: list objects
  console.log("🔍 Listing bucket...");
  const list = await client.send(new ListObjectsV2Command({
    Bucket: process.env.OCI_BUCKET!,
    Prefix: "mlbb/",
    MaxKeys: 5,
  }));
  console.log("✅ List succeeded. Objects found:", list.KeyCount);

  // Test 2: put a small test object
  console.log("\n📤 Uploading test object...");
  await client.send(new PutObjectCommand({
    Bucket: process.env.OCI_BUCKET!,
    Key: "mlbb/_test.txt",
    Body: Buffer.from("oci-connection-test"),
    ContentType: "text/plain",
    ACL: "public-read",
  }));
  console.log("✅ Upload succeeded!");
  console.log("   CDN URL: https://cdn.sanchez.ph/mlbb/_test.txt");
} catch (err: any) {
  console.error("❌ OCI Error:", err.message);
  console.error("   Code:", err.Code ?? err.code);
  console.error("   Status:", err.$metadata?.httpStatusCode);
}
