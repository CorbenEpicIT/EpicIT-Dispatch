import {
	S3Client,
	PutObjectCommand,
	DeleteObjectCommand,
	GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "crypto";

const WASABI_ACCESS = process.env.WASABI_ACCESS;
const WASABI_SECRET = process.env.WASABI_SECRET;
const WASABI_BUCKET = process.env.WASABI_BUCKET;
const WASABI_REGION = process.env.WASABI_REGION || "us-east-1";

const SIGNED_URL_TTL_SECONDS = 3600;

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

function rawUrlForKey(key: string): string {
	return `https://s3.${WASABI_REGION}.wasabisys.com/${WASABI_BUCKET}/${key}`;
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
		}),
	);

	return rawUrlForKey(key);
};

function keyFromUrl(url: string): string {
	const base = url.split("?")[0];
	return base.split(`${WASABI_BUCKET}/`).pop() ?? base;
}

// Strip query strings / signing params so we always persist the canonical
// (un-signed) URL in the database. Inputs that are already canonical pass through.
export const toRawUrl = (url: string): string => {
	if (!url) return url;
	if (!url.includes("?")) return url;
	const key = keyFromUrl(url);
	return rawUrlForKey(key);
};

export const fetchBuffer = async (
	key: string,
): Promise<{ buffer: Buffer; contentType: string }> => {
	const data = await getClient().send(
		new GetObjectCommand({ Bucket: WASABI_BUCKET, Key: key }),
	);
	const chunks: Uint8Array[] = [];
	for await (const chunk of data.Body as AsyncIterable<Uint8Array>) {
		chunks.push(chunk);
	}
	return {
		buffer: Buffer.concat(chunks),
		contentType: data.ContentType ?? "application/octet-stream",
	};
};

//getBuffer supports pdf generation.
export const getBuffer = async (
	url: string,
): Promise<{ buffer: Buffer; contentType: string }> => {
	return fetchBuffer(keyFromUrl(url));
};

export const signImageUrl = async (
	url: string | null | undefined,
): Promise<string | null> => {
	if (!url) return null;
	return getSignedUrl(
		getClient(),
		new GetObjectCommand({ Bucket: WASABI_BUCKET!, Key: keyFromUrl(url) }),
		{ expiresIn: SIGNED_URL_TTL_SECONDS },
	);
};

export const signImageUrls = async (urls: string[]): Promise<string[]> => {
	if (!urls.length) return [];
	return Promise.all(
		urls.map((url) =>
			getSignedUrl(
				getClient(),
				new GetObjectCommand({ Bucket: WASABI_BUCKET!, Key: keyFromUrl(url) }),
				{ expiresIn: SIGNED_URL_TTL_SECONDS },
			),
		),
	);
};

export const deleteFile = async (url: string): Promise<void> => {
	const key = keyFromUrl(url);
	if (!key) return;

	await getClient().send(
		new DeleteObjectCommand({
			Bucket: WASABI_BUCKET,
			Key: key,
		}),
	);
};
