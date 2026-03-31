import { NextResponse } from "next/server";
import { listPixelOfficeCharacterSprites } from "@/lib/pixel-office/assets";

export async function GET() {
	try {
		return NextResponse.json(
			{ characters: listPixelOfficeCharacterSprites() },
			{
				headers: {
					"Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
				},
			},
		);
	} catch (error) {
		console.error("[pixel-office/assets] failed", error);
		return NextResponse.json(
			{ error: "Pixel office assets unavailable" },
			{ status: 500 },
		);
	}
}
