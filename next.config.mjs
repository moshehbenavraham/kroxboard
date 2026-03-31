/** @type {import('next').NextConfig} */
const nextConfig = {
	output: "standalone",
	outputFileTracingExcludes: {
		"/*": ["./next.config.mjs"],
	},
};
export default nextConfig;
