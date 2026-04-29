import {
	OpenclawReadPathError,
	readBoundedTextFile,
} from "@/lib/openclaw-read-paths";

// Session transcripts regularly exceed 1 MiB in real-world use, but these
// analytics routes still need a hard upper bound to avoid unbounded reads.
export const MAX_ANALYTICS_SESSION_FILE_BYTES = 5 * 1024 * 1024;

export async function readAnalyticsSessionFile(
	filePath: string,
): Promise<string | null> {
	try {
		return await readBoundedTextFile(filePath, {
			allowMissing: true,
			maxBytes: MAX_ANALYTICS_SESSION_FILE_BYTES,
		});
	} catch (error) {
		if (
			error instanceof OpenclawReadPathError &&
			error.code === "file_too_large"
		) {
			return null;
		}
		throw error;
	}
}
