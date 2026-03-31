"use client";

import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import { OperatorElevationDialog } from "@/app/components/operator-elevation-dialog";
import {
	getProtectedRequestError,
	isOperatorSessionStatePayload,
	type ProtectedRequestOptions,
	type ProtectedRequestResult,
	type ProtectedRequestRunner,
	parseProtectedResponse,
	readJsonResponse,
} from "@/lib/operator-elevation-client";
import type {
	OperatorAuthDeniedState,
	OperatorSessionStatePayload,
} from "@/lib/security/types";

interface OperatorElevationContextValue {
	runProtectedRequest: ProtectedRequestRunner;
	refreshSessionState: () => Promise<OperatorSessionStatePayload | null>;
	clearSession: () => Promise<void>;
	sessionState: OperatorSessionStatePayload | null;
	sessionLoading: boolean;
}

const OperatorElevationContext =
	createContext<OperatorElevationContextValue | null>(null);

function createAuthState(
	state: OperatorAuthDeniedState,
	message: string,
	canChallenge: boolean,
): OperatorSessionStatePayload {
	return {
		ok: false,
		error: message,
		auth: {
			ok: false,
			type: "operator_auth",
			state,
			message,
			canChallenge,
		},
	};
}

export function OperatorElevationProvider({
	children,
}: {
	children: ReactNode;
}) {
	const inFlightRequestsRef = useRef(
		new Map<string, Promise<ProtectedRequestResult<unknown>>>(),
	);
	const challengeWaitersRef = useRef<Array<(accepted: boolean) => void>>([]);
	const [sessionState, setSessionState] =
		useState<OperatorSessionStatePayload | null>(null);
	const [sessionLoading, setSessionLoading] = useState(true);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [dialogState, setDialogState] =
		useState<OperatorAuthDeniedState>("challenge_required");
	const [dialogError, setDialogError] = useState<string | null>(null);
	const [dialogPending, setDialogPending] = useState(false);

	const resolveChallengeWaiters = useCallback((accepted: boolean) => {
		const waiters = challengeWaitersRef.current.splice(0);
		for (const waiter of waiters) {
			waiter(accepted);
		}
	}, []);

	const refreshSessionState = useCallback(async () => {
		try {
			const response = await fetch("/api/operator/session", {
				cache: "no-store",
			});
			const { value } = await readJsonResponse(response);
			if (isOperatorSessionStatePayload(value)) {
				setSessionState(value);
				return value;
			}
			setSessionState(null);
			return null;
		} catch {
			setSessionState(null);
			return null;
		} finally {
			setSessionLoading(false);
		}
	}, []);

	useEffect(() => {
		void refreshSessionState();
	}, [refreshSessionState]);

	const ensureElevation = useCallback(
		(state: OperatorAuthDeniedState): Promise<boolean> => {
			setDialogState(state);
			setDialogError(null);
			setDialogOpen(true);
			return new Promise((resolve) => {
				challengeWaitersRef.current.push(resolve);
			});
		},
		[],
	);

	const clearSession = useCallback(async () => {
		await fetch("/api/operator/elevate", {
			method: "DELETE",
			cache: "no-store",
		}).catch(() => null);
		setSessionState(
			createAuthState(
				"challenge_required",
				"Operator elevation required",
				true,
			),
		);
	}, []);

	const handleCancel = useCallback(() => {
		setDialogOpen(false);
		setDialogPending(false);
		setDialogError(null);
		resolveChallengeWaiters(false);
		void clearSession();
	}, [clearSession, resolveChallengeWaiters]);

	const handleSubmit = useCallback(
		async (code: string) => {
			setDialogPending(true);
			setDialogError(null);

			try {
				const result =
					await parseProtectedResponse<OperatorSessionStatePayload>(
						await fetch("/api/operator/elevate", {
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({ code }),
						}),
					);

				if (result.ok) {
					const nextState = result.data;
					if (isOperatorSessionStatePayload(nextState)) {
						setSessionState(nextState);
					}
					setDialogOpen(false);
					setDialogPending(false);
					setDialogError(null);
					resolveChallengeWaiters(true);
					return;
				}

				if ("auth" in result) {
					const nextState = createAuthState(
						result.auth.state,
						result.auth.message,
						result.auth.canChallenge,
					);
					setSessionState(nextState);
					setDialogError(result.auth.message);
					setDialogPending(false);
					return;
				}

				setDialogError(getProtectedRequestError(result));
				setDialogPending(false);
			} catch (error) {
				setDialogError(
					error instanceof Error ? error.message : "Operator challenge failed",
				);
				setDialogPending(false);
			}
		},
		[resolveChallengeWaiters],
	);

	const runProtectedRequest = useCallback(
		async <T,>(
			options: ProtectedRequestOptions,
		): Promise<ProtectedRequestResult<T>> => {
			const existing = inFlightRequestsRef.current.get(options.actionId);
			if (existing) {
				return existing as Promise<ProtectedRequestResult<T>>;
			}

			const task = (async () => {
				for (let attempt = 0; attempt < 2; attempt++) {
					const result = await parseProtectedResponse<T>(
						await options.request(),
					);
					if (result.ok) return result;

					if ("auth" in result) {
						const nextState = createAuthState(
							result.auth.state,
							result.auth.message,
							result.auth.canChallenge,
						);
						setSessionState(nextState);
						if (attempt === 0 && result.auth.canChallenge) {
							const accepted = await ensureElevation(result.auth.state);
							if (accepted) {
								continue;
							}
						}
						return result;
					}

					return result;
				}

				return {
					ok: false as const,
					error: "Operator request retry exhausted",
					status: 500,
				};
			})().finally(() => {
				inFlightRequestsRef.current.delete(options.actionId);
			});

			inFlightRequestsRef.current.set(
				options.actionId,
				task as Promise<ProtectedRequestResult<unknown>>,
			);

			return task;
		},
		[ensureElevation],
	);

	return (
		<OperatorElevationContext.Provider
			value={{
				runProtectedRequest,
				refreshSessionState,
				clearSession,
				sessionState,
				sessionLoading,
			}}
		>
			{children}
			<OperatorElevationDialog
				open={dialogOpen}
				state={dialogState}
				pending={dialogPending}
				error={dialogError}
				onCancel={handleCancel}
				onSubmit={handleSubmit}
			/>
		</OperatorElevationContext.Provider>
	);
}

export function useOperatorElevation(): OperatorElevationContextValue {
	const context = useContext(OperatorElevationContext);
	if (!context) {
		throw new Error(
			"useOperatorElevation must be used within OperatorElevationProvider",
		);
	}
	return context;
}
