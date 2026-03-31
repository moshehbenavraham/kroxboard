// Session transcripts regularly exceed 1 MiB in real-world use, but these
// analytics routes still need a hard upper bound to avoid unbounded reads.
export const MAX_ANALYTICS_SESSION_FILE_BYTES = 5 * 1024 * 1024;
