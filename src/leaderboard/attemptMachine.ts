import type {
  AttemptCompleteResponse,
  AttemptStartResponse,
  PublicErrorResponse,
  ReplayCommand,
} from "./protocol";

export type AttemptState =
  | { readonly status: "unranked" }
  | { readonly status: "starting" }
  | { readonly status: "countdown"; readonly attempt: AttemptStartResponse }
  | {
      readonly status: "active";
      readonly attempt: AttemptStartResponse;
      readonly commandLog: readonly ReplayCommand[];
    }
  | {
      readonly status: "submitting";
      readonly attempt: AttemptStartResponse;
      readonly commandLog: readonly ReplayCommand[];
    }
  | {
      readonly status: "retry_available";
      readonly attempt: AttemptStartResponse;
      readonly commandLog: readonly ReplayCommand[];
      readonly error: PublicErrorResponse["error"];
    }
  | {
      readonly status: "result_pending";
      readonly attempt: AttemptStartResponse;
      readonly commandLog: readonly ReplayCommand[];
    }
  | {
      readonly status: "accepted";
      readonly result: AttemptCompleteResponse;
    }
  | {
      readonly status: "rejected" | "unavailable";
      readonly error: PublicErrorResponse["error"];
    };

export type AttemptAction =
  | { readonly type: "START_REQUESTED" }
  | { readonly type: "START_SUCCEEDED"; readonly attempt: AttemptStartResponse }
  | {
      readonly type: "START_FAILED";
      readonly error: PublicErrorResponse["error"];
    }
  | { readonly type: "COUNTDOWN_FINISHED" }
  | { readonly type: "COMMAND_RECORDED"; readonly command: ReplayCommand }
  | { readonly type: "RUN_COMPLETED" }
  | { readonly type: "SUBMIT_SUCCEEDED"; readonly result: AttemptCompleteResponse }
  | {
      readonly type: "SUBMIT_FAILED";
      readonly error: PublicErrorResponse["error"];
      readonly responseLost?: boolean;
    }
  | { readonly type: "RECOVER"; readonly attempt: AttemptStartResponse; readonly commandLog: readonly ReplayCommand[] }
  | { readonly type: "RECOVER_COUNTDOWN"; readonly attempt: AttemptStartResponse }
  | { readonly type: "RESUME"; readonly attempt: AttemptStartResponse; readonly commandLog: readonly ReplayCommand[] }
  | {
      readonly type: "RECOVERY_FAILED";
      readonly error: PublicErrorResponse["error"];
    }
  | { readonly type: "CANCEL" };

export const initialAttemptState: AttemptState = { status: "unranked" };

export function attemptReducer(
  state: AttemptState,
  action: AttemptAction,
): AttemptState {
  switch (action.type) {
    case "START_REQUESTED":
      return state.status === "unranked" ||
        state.status === "unavailable" ||
        state.status === "rejected" ||
        state.status === "accepted"
        ? { status: "starting" }
        : state;
    case "START_SUCCEEDED":
      return state.status === "starting"
        ? { status: "countdown", attempt: action.attempt }
        : state;
    case "START_FAILED":
      return state.status === "starting"
        ? {
            status: action.error.retryable ? "unavailable" : "rejected",
            error: action.error,
          }
        : state;
    case "COUNTDOWN_FINISHED":
      return state.status === "countdown"
        ? { status: "active", attempt: state.attempt, commandLog: [] }
        : state;
    case "COMMAND_RECORDED":
      return state.status === "active"
        ? { ...state, commandLog: [...state.commandLog, action.command] }
        : state;
    case "RUN_COMPLETED":
      return state.status === "active"
        ? { ...state, status: "submitting" }
        : state;
    case "SUBMIT_SUCCEEDED":
      return state.status === "submitting" ||
        state.status === "retry_available" ||
        state.status === "result_pending"
        ? { status: "accepted", result: action.result }
        : state;
    case "SUBMIT_FAILED":
      if (
        state.status !== "submitting" &&
        state.status !== "result_pending" &&
        state.status !== "retry_available"
      ) {
        return state;
      }
      if (action.responseLost) {
        return { ...state, status: "result_pending" };
      }
      return action.error.retryable
        ? { ...state, status: "retry_available", error: action.error }
        : { status: "rejected", error: action.error };
    case "RECOVER":
      return state.status === "unranked"
        ? {
            status: "result_pending",
            attempt: action.attempt,
            commandLog: action.commandLog,
          }
        : state;
    case "RECOVER_COUNTDOWN":
      return state.status === "unranked"
        ? { status: "countdown", attempt: action.attempt }
        : state;
    case "RESUME":
      return state.status === "unranked"
        ? {
            status: "active",
            attempt: action.attempt,
            commandLog: action.commandLog,
          }
        : state;
    case "RECOVERY_FAILED":
      return state.status === "countdown" ||
        state.status === "active" ||
        state.status === "result_pending" ||
        state.status === "retry_available"
        ? {
            status: action.error.retryable ? "unavailable" : "rejected",
            error: action.error,
          }
        : state;
    case "CANCEL":
      return initialAttemptState;
  }
}

export function isBoardInputLocked(state: AttemptState): boolean {
  return state.status === "starting" || state.status === "countdown";
}

export function isRankedGameplayFrozen(state: AttemptState): boolean {
  return (
    state.status === "submitting" ||
    state.status === "retry_available" ||
    state.status === "result_pending" ||
    state.status === "accepted" ||
    state.status === "rejected"
  );
}

export function canRetryAttempt(state: AttemptState, now = Date.now()): boolean {
  return (
    (state.status === "retry_available" || state.status === "result_pending") &&
    new Date(state.attempt.expiresAt).getTime() > now
  );
}
