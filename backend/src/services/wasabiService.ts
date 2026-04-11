import {
	S3Client,
	PutObjectCommand,
	DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import crypto from "crypto";

const WASABI_ACCESS = process.env.WASABI_ACCESS;
const WASABI_SECRET = process.env.WASABI_SECRET;
const WASABI_BUCKET = process.env.WASABI_BUCKET;
const WASABI_REGION = process.env.WASABI_REGION || "us-east-1";

let s3Client: S3Client | null = null;

function getClient(): S3Client {
	if (!s3Client) {
		if (!WASABI_ACCESS || !WASABI_SECRET || !WASABI_BUCKET) {
			throw new Error(
				"Wasabi env vars not configured: WASABI_ACCESS, WASABI_SECRET, WASABI_BUCKET",
			);
		}
		s3Client = new S3Client({
			region: WASABI_REGION,
			endpoint: `https://s3.${WASABI_REGION}.wasabisys.com`,
			credentials: {
				accessKeyId: WASABI_ACCESS,
				secretAccessKey: WASABI_SECRET,
			},
			forcePathStyle: true,
		});
	}
	return s3Client;
}

export const uploadFile = async (
	file: Buffer,
	contentType: string,
	originalName: string,
	folder: string = "inventory",
): Promise<string> => {
	const ext = originalName.split(".").pop() || "jpg";
	const key = `${folder}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

	await getClient().send(
		new PutObjectCommand({
			Bucket: WASABI_BUCKET,
			Key: key,
			Body: file,
			ContentType: contentType,
			ACL: "public-read",
		}),
	);

	return `https://s3.${WASABI_REGION}.wasabisys.com/${WASABI_BUCKET}/${key}`;
};

export const deleteFile = async (url: string): Promise<void> => {
	const key = url.split(`${WASABI_BUCKET}/`).pop();
	if (!key) return;

	await getClient().send(
		new DeleteObjectCommand({
			Bucket: WASABI_BUCKET,
			Key: key,
		}),
	);
};
