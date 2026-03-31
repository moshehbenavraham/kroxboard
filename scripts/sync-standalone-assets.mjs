import { cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

async function pathExists(targetPath) {
	try {
		await stat(targetPath);
		return true;
	} catch (error) {
		if (error && typeof error === "object" && "code" in error) {
			if (error.code === "ENOENT") {
				return false;
			}
		}

		throw error;
	}
}

async function syncDirectory(sourcePath, destinationPath) {
	await rm(destinationPath, { force: true, recursive: true });
	await mkdir(path.dirname(destinationPath), { recursive: true });
	await cp(sourcePath, destinationPath, { recursive: true });
}

export async function syncStandaloneAssets(projectDir = process.cwd()) {
	const nextDir = path.join(projectDir, ".next");
	const standaloneDir = path.join(nextDir, "standalone");
	const standaloneNextDir = path.join(standaloneDir, ".next");
	const assetsToSync = [
		{
			label: ".next/static",
			sourcePath: path.join(nextDir, "static"),
			destinationPath: path.join(standaloneNextDir, "static"),
			required: true,
		},
		{
			label: "public",
			sourcePath: path.join(projectDir, "public"),
			destinationPath: path.join(standaloneDir, "public"),
			required: false,
		},
	];

	if (!(await pathExists(standaloneDir))) {
		throw new Error(
			`Standalone build output not found at ${standaloneDir}. Run "next build" before syncing assets.`,
		);
	}

	const synced = [];

	for (const asset of assetsToSync) {
		if (!(await pathExists(asset.sourcePath))) {
			if (asset.required) {
				throw new Error(
					`Required build asset missing at ${asset.sourcePath}. The Next.js build may be incomplete.`,
				);
			}

			continue;
		}

		await syncDirectory(asset.sourcePath, asset.destinationPath);
		synced.push(asset.label);
	}

	return synced;
}

const entryPath = process.argv[1];
const currentModulePath = fileURLToPath(import.meta.url);

if (entryPath && path.resolve(entryPath) === currentModulePath) {
	try {
		const synced = await syncStandaloneAssets();
		console.log(`Synced standalone assets: ${synced.join(", ")}`);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`Failed to sync standalone assets: ${message}`);
		process.exitCode = 1;
	}
}
