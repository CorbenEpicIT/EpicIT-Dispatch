import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// wasabiService reads its env at import time, so each scenario re-imports the
// module graph with a fresh environment.
async function loadWith(env: Record<string, string | undefined>) {
	vi.resetModules();
	const saved: Record<string, string | undefined> = {};
	for (const [k, v] of Object.entries(env)) {
		saved[k] = process.env[k];
		if (v === undefined) delete process.env[k];
		else process.env[k] = v;
	}
	const wasabi = await import("../../services/wasabiService.js");
	const validate = await import("../validate/jobs.js");
	return { wasabi, validate, restore: () => Object.assign(process.env, saved) };
}

let restore: (() => void) | undefined;
afterEach(() => {
	restore?.();
	restore = undefined;
});
beforeEach(() => vi.resetModules());

describe("isOwnBucketUrl + note photo_url validation (review P3 / F8)", () => {
	it("accepts raw and pre-signed path-style URLs from the configured bucket and rejects others", async () => {
		const { wasabi, validate, restore: r } = await loadWith({
			WASABI_BUCKET: "epic-uploads",
			WASABI_REGION: "us-central-1",
		});
		restore = r;
		const base = "https://s3.us-central-1.wasabisys.com/epic-uploads/job-notes-photos/1-abc.jpg";

		expect(wasabi.isOwnBucketUrl(base)).toBe(true);
		expect(wasabi.isOwnBucketUrl(`${base}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=deadbeef`)).toBe(true);
		expect(wasabi.isOwnBucketUrl("https://epic-uploads.s3.us-central-1.wasabisys.com/job-notes-photos/1.jpg")).toBe(true);

		expect(wasabi.isOwnBucketUrl("https://s3.us-central-1.wasabisys.com/other-bucket/x.jpg")).toBe(false);
		expect(wasabi.isOwnBucketUrl("https://s3.us-central-1.wasabisys.com/epic-uploads-2/x.jpg")).toBe(false);
		expect(wasabi.isOwnBucketUrl("https://s3.us-central-1.wasabisys.com/epic-uploads/")).toBe(false);
		expect(wasabi.isOwnBucketUrl("https://evil.example.com/epic-uploads/x.jpg")).toBe(false);
		expect(wasabi.isOwnBucketUrl("http://s3.us-central-1.wasabisys.com/epic-uploads/x.jpg")).toBe(false);
		expect(wasabi.isOwnBucketUrl("not a url")).toBe(false);

		const ok = validate.createJobNoteSchema.safeParse({
			content: "",
			photos: [{ photo_url: base, photo_label: "Before" }],
		});
		expect(ok.success).toBe(true);

		const bad = validate.updateJobNoteSchema.safeParse({
			photos: [{ photo_url: "https://evil.example.com/x.jpg", photo_label: "After" }],
		});
		expect(bad.success).toBe(false);
		if (!bad.success) {
			expect(bad.error.issues[0].message).toMatch(/storage bucket/);
		}
	});

	it("stays lenient when Wasabi is not configured (dev/test)", async () => {
		const { wasabi, validate, restore: r } = await loadWith({ WASABI_BUCKET: undefined });
		restore = r;
		expect(wasabi.isOwnBucketUrl("https://anything.example.com/x.jpg")).toBe(true);
		expect(
			validate.updateJobNoteSchema.safeParse({
				photos: [{ photo_url: "https://anything.example.com/x.jpg", photo_label: "Other" }],
			}).success,
		).toBe(true);
		// still has to be a URL at all
		expect(
			validate.updateJobNoteSchema.safeParse({ photos: [{ photo_url: "nope", photo_label: "Other" }] }).success,
		).toBe(false);
	});
});
