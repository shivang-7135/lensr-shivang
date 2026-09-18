import {
  BlobServiceClient,
  StorageSharedKeyCredential,
  BlobSASPermissions,
} from "@azure/storage-blob";

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;

function getBlobServiceClient() {
  if (!connectionString) {
    throw new Error("AZURE_STORAGE_CONNECTION_STRING is not set");
  }
  return BlobServiceClient.fromConnectionString(connectionString);
}

const CONTAINER_NAME = "user-uploads";
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export async function uploadImage(
  userId: string,
  fileName: string,
  buffer: Buffer,
  mimeType: string,
): Promise<{ storagePath: string; url: string }> {
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw new Error(`Invalid file type: ${mimeType}. Allowed: ${ALLOWED_MIME_TYPES.join(", ")}`);
  }
  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(`File too large: ${buffer.length} bytes. Max: ${MAX_FILE_SIZE} bytes`);
  }

  const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${userId}/${Date.now()}-${sanitized}`;

  const blobServiceClient = getBlobServiceClient();
  const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
  const blockBlobClient = containerClient.getBlockBlobClient(storagePath);

  await blockBlobClient.uploadData(buffer, {
    blobHTTPHeaders: { blobContentType: mimeType },
  });

  // Generate a 1-hour read-only SAS URL
  const url = await generateSignedUrl(storagePath, 60);

  return { storagePath, url };
}

export async function generateSignedUrl(
  storagePath: string,
  expiresInMinutes = 60,
): Promise<string> {
  const blobServiceClient = getBlobServiceClient();
  const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
  const blobClient = containerClient.getBlobClient(storagePath);

  const startsOn = new Date();
  const expiresOn = new Date(startsOn.valueOf() + expiresInMinutes * 60 * 1000);

  // For SAS generation with connection string, we need to extract the account name and key
  const accountName = connectionString!.match(/AccountName=([^;]+)/)?.[1];
  const accountKey = connectionString!.match(/AccountKey=([^;]+)/)?.[1];

  if (!accountName || !accountKey) {
    throw new Error("Could not extract account credentials from connection string");
  }

  const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
  const tempBlobServiceClient = new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net`,
    sharedKeyCredential,
  );
  const tempBlobClient = tempBlobServiceClient
    .getContainerClient(CONTAINER_NAME)
    .getBlobClient(storagePath);

  return tempBlobClient.generateSasUrl({
    permissions: BlobSASPermissions.parse("r"),
    startsOn,
    expiresOn,
  });
}

export async function generateWriteUrl(
  storagePath: string,
  expiresInMinutes = 15,
): Promise<string> {
  const blobServiceClient = getBlobServiceClient();
  const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
  const blobClient = containerClient.getBlobClient(storagePath);

  const startsOn = new Date();
  const expiresOn = new Date(startsOn.valueOf() + expiresInMinutes * 60 * 1000);

  const accountName = connectionString!.match(/AccountName=([^;]+)/)?.[1];
  const accountKey = connectionString!.match(/AccountKey=([^;]+)/)?.[1];

  if (!accountName || !accountKey) {
    throw new Error("Could not extract account credentials from connection string");
  }

  const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
  const tempBlobServiceClient = new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net`,
    sharedKeyCredential,
  );
  const tempBlobClient = tempBlobServiceClient
    .getContainerClient(CONTAINER_NAME)
    .getBlobClient(storagePath);

  return tempBlobClient.generateSasUrl({
    permissions: BlobSASPermissions.parse("cw"), // create, write
    startsOn,
    expiresOn,
  });
}
