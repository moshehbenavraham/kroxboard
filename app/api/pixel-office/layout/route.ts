import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { OPENCLAW_PIXEL_OFFICE_DIR } from "@/lib/openclaw-paths";
import { requireFeatureFlag } from "@/lib/security/feature-flags";
import {
	getInvalidRequestStatus,
	readBoundedJsonBody,
} from "@/lib/security/request-body";
import {
	createInvalidRequestResponse,
	validatePixelOfficeLayoutInput,
} from "@/lib/security/request-boundary";
import { requireSensitiveMutationAccess } from "@/lib/security/sensitive-mutation";

const LAYOUT_DIR = OPENCLAW_PIXEL_OFFICE_DIR;
const LAYOUT_FILE = path.join(LAYOUT_DIR, "layout.json");
const PIXEL_OFFICE_LAYOUT_BODY_MAX_BYTES = 262144;

export async function GET() {
	try {
		if (!fs.existsSync(LAYOUT_FILE)) {
			return NextResponse.json({ layout: null });
		}
		const data = fs.readFileSync(LAYOUT_FILE, "utf-8");
		const layout = JSON.parse(data);
		return NextResponse.json({ layout });
	} catch {
		return NextResponse.json({ layout: null });
	}
}

export async function POST(request: Request) {
	const access = requireSensitiveMutationAccess(request, {
		allowedMethods: ["POST"],
	});
	if (!access.ok) return access.response;
	const feature = requireFeatureFlag("ENABLE_PIXEL_OFFICE_WRITES");
	if (!feature.ok) return feature.response;

	const parsedBody = await readBoundedJsonBody(request, {
		maxBytes: PIXEL_OFFICE_LAYOUT_BODY_MAX_BYTES,
	});
	if (!parsedBody.ok) {
		return createInvalidRequestResponse(
			parsedBody.error,
			getInvalidRequestStatus(parsedBody.error),
		);
	}

	try {
		const input = validatePixelOfficeLayoutInput(parsedBody.value);
		if (!input.ok) return createInvalidRequestResponse(input.error);
		const { layout } = input.value;

		// Ensure directory exists
		if (!fs.existsSync(LAYOUT_DIR)) {
			fs.mkdirSync(LAYOUT_DIR, { recursive: true });
		}

		// Atomic write: write to .tmp then rename
		const tmpFile = `${LAYOUT_FILE}.tmp`;
		fs.writeFileSync(tmpFile, JSON.stringify(layout, null, 2), "utf-8");
		fs.renameSync(tmpFile, LAYOUT_FILE);

		return NextResponse.json({ success: true });
	} catch {
		return NextResponse.json(
			{ error: "Failed to save layout" },
			{ status: 500 },
		);
	}
}
