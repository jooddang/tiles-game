import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  attemptReducer,
  canRetryAttempt,
  initialAttemptState,
  type AttemptState,
} from "./attemptMachine";
import {
  clearAttemptSession,
  loadAttemptSession,
  saveAttemptSession,
  type StoredAttemptSession,
} from "./attemptSession";
import {
  createLeaderboardClient,
  LeaderboardClientError,
  type LeaderboardClient,
} from "./leaderboardClient";
import {
  createRankedAttemptJournal,
  type JournalDurability,
  type RankedAttemptJournal,
} from "./rankedAttemptJournal";
import type { StartIntentItem } from "./rankedOutbox";
import type { AccountAttemptCompleteResponse, AccountBinding } from "./accountScoreProtocol";
import {
  API_PROTOCOL_VERSION,
  PUBLIC_ERROR_CODES,
  REPLAY_CONTRACT_VERSION,
  type AttemptCompleteResponse,
  type AttemptStartResponse,
  type LeaderboardResponse,
  type PersonalBestResponse,
  type PublicErrorResponse,
  type ReplayCommand,
} from "./protocol";

const defaultClient = createLeaderboardClient();

type RecordsSnapshot = {
  readonly levelVersionId: string;
  readonly leaderboard: LeaderboardResponse | null;
  readonly personal: PersonalBestResponse | null;
  readonly updatedAt: number;
  readonly authoritativeResult?: AttemptCompleteResponse;
};

export type RecordsState =
  | { readonly status: "loading" }
  | ({ readonly status: "empty" | "ready" | "partial" | "stale" } & RecordsSnapshot)
  | { readonly status: "error"; readonly error: PublicErrorResponse["error"] };

export type UseRankedAttemptOptions = {
  readonly enabled: boolean;
  readonly levelVersionId: string | null;
  readonly client?: LeaderboardClient;
  readonly journal?: RankedAttemptJournal;
  readonly authGeneration?: string | null;
  readonly restoreCommands?: (
    commands: readonly ReplayCommand[],
  ) => "playing" | "complete" | false;
};

export function useRankedAttempt({
  enabled,
  levelVersionId,
  client = defaultClient,
  journal,
  authGeneration = null,
  restoreCommands,
}: UseRankedAttemptOptions) {
  const [attemptState, dispatch] = useReducer(attemptReducer, initialAttemptState);
  const [recordsState, setRecordsState] = useState<RecordsState>({
    status: "loading",
  });
  const [countdown, setCountdown] = useState<number>();
  const [rankedElapsedSeconds, setRankedElapsedSeconds] = useState<number>();
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [journalState, setJournalState] = useState<{
    readonly durability: JournalDurability;
    readonly navigationBlocked: boolean;
  }>({ durability: "durable", navigationBlocked: false });
  const attemptRef = useRef<AttemptState>(attemptState);
  const recordsRef = useRef<RecordsState>(recordsState);
  const commandLogRef = useRef<readonly ReplayCommand[]>([]);
  const restoreCommandsRef = useRef(restoreCommands);
  const activeReadRef = useRef<AbortController | undefined>(undefined);
  const activeFlowRef = useRef<AbortController | undefined>(undefined);
  const readGenerationRef = useRef(0);
  const flowGenerationRef = useRef(0);
  const mountedRef = useRef(true);
  const levelRef = useRef(levelVersionId);
  const journalPromiseRef = useRef<Promise<RankedAttemptJournal> | undefined>(undefined);
  const startIntentRef = useRef<StartIntentItem | undefined>(undefined);

  const getJournal = useCallback(() => {
    journalPromiseRef.current ??= journal
      ? Promise.resolve(journal)
      : createRankedAttemptJournal();
    return journalPromiseRef.current;
  }, [journal]);

  const syncJournalState = useCallback((activeJournal: RankedAttemptJournal) => {
    setJournalState({
      durability: activeJournal.durability,
      navigationBlocked: activeJournal.navigationBlocked,
    });
  }, []);

  attemptRef.current = attemptState;
  recordsRef.current = recordsState;

  useEffect(() => {
    if (
      attemptState.status !== "countdown" &&
      attemptState.status !== "active" &&
      attemptState.status !== "retry_available"
    ) {
      return;
    }
    const expiresIn = Date.parse(attemptState.attempt.expiresAt) - Date.now();
    const expire = () => {
      clearAttemptSession();
      dispatch({ type: "RECOVERY_FAILED", error: expiredError() });
    };
    if (expiresIn <= 0) {
      expire();
      return;
    }
    const timer = window.setTimeout(expire, expiresIn);
    return () => window.clearTimeout(timer);
  }, [attemptState]);

  useEffect(() => {
    restoreCommandsRef.current = restoreCommands;
  }, [restoreCommands]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      flowGenerationRef.current += 1;
      readGenerationRef.current += 1;
      activeReadRef.current?.abort();
      activeFlowRef.current?.abort();
    };
  }, []);

  const refreshRecords = useCallback(async () => {
    const requestedLevel = levelRef.current;
    if (!enabled || !requestedLevel) {
      return;
    }

    activeReadRef.current?.abort();
    const abortController = new AbortController();
    activeReadRef.current = abortController;
    const readGeneration = ++readGenerationRef.current;
    const previous = snapshotForLevel(recordsRef.current, requestedLevel);
    if (!previous) {
      setRecordsState({ status: "loading" });
    }

    const [leaderboardResult, personalResult] = await Promise.allSettled([
      client.getLeaderboard(requestedLevel, abortController.signal),
      client.getPersonalBest(requestedLevel, abortController.signal),
    ]);
    if (
      !mountedRef.current ||
      abortController.signal.aborted ||
      readGeneration !== readGenerationRef.current ||
      levelRef.current !== requestedLevel
    ) {
      return;
    }

    const leaderboard =
      leaderboardResult.status === "fulfilled" &&
      leaderboardResult.value.levelVersionId === requestedLevel
        ? leaderboardResult.value
        : null;
    const personal =
      personalResult.status === "fulfilled" &&
      personalResult.value.levelVersionId === requestedLevel
        ? personalResult.value
        : null;

    if (leaderboard || personal) {
      const authoritative = previous?.authoritativeResult;
      const displayName =
        personal?.displayName ?? previous?.personal?.displayName;
      const currentLeaderboard = leaderboard ?? previous?.leaderboard ?? null;
      const mergedPersonal = mergeAuthoritativePersonal(
        personal ?? previous?.personal ?? null,
        authoritative,
        requestedLevel,
        displayName,
      );
      const snapshot: RecordsSnapshot = {
        levelVersionId: requestedLevel,
        leaderboard: currentLeaderboard,
        personal: mergedPersonal,
        updatedAt: Date.now(),
        authoritativeResult: previous?.authoritativeResult,
      };
      const isPartial = !leaderboard || !personal;
      const isBehindAuthoritativeResult =
        leaderboard !== null &&
        !containsAuthoritativeTopTenEntry(leaderboard, authoritative);
      setRecordsState({
        ...snapshot,
        status: isPartial
          ? "partial"
          : isBehindAuthoritativeResult
            ? "stale"
          : currentLeaderboard?.entries.length === 0
            ? "empty"
            : "ready",
      });
      return;
    }

    if (previous) {
      setRecordsState({ ...previous, status: "stale" });
      return;
    }
    const failure =
      leaderboardResult.status === "rejected"
        ? leaderboardResult.reason
        : personalResult.status === "rejected"
          ? personalResult.reason
          : undefined;
    setRecordsState({ status: "error", error: errorDetail(failure) });
  }, [client, enabled]);

  useEffect(() => {
    levelRef.current = levelVersionId;
    const flowGeneration = ++flowGenerationRef.current;
    activeFlowRef.current?.abort();
    const flowController = new AbortController();
    activeFlowRef.current = flowController;
    commandLogRef.current = [];
    activeReadRef.current?.abort();
    readGenerationRef.current += 1;
    dispatch({ type: "CANCEL" });

    if (!enabled || !levelVersionId) {
      setRecordsState({ status: "loading" });
      setRecoveryReady(true);
      return;
    }

    setRecoveryReady(false);
    setRecordsState({ status: "loading" });
    void refreshRecords();

    const restoreSession = (session: StoredAttemptSession) => {
      if (session.attempt.levelVersionId !== levelVersionId) return false;

      const hasExpired = Date.parse(session.attempt.expiresAt) <= Date.now();
      const startsInFuture = Date.parse(session.attempt.startsAt) > Date.now();
      if (startsInFuture && session.commandLog.length > 0) return false;
      const restored = startsInFuture
        ? "playing"
        : session.commandLog.length > 0
          ? restoreCommandsRef.current?.(session.commandLog)
          : "playing";
      if (restored === false || restored === undefined) return false;

      commandLogRef.current = session.commandLog;
      dispatch(
        hasExpired
          ? {
              type: "RECOVER",
              attempt: session.attempt,
              commandLog: session.commandLog,
            }
          : startsInFuture
            ? { type: "RECOVER_COUNTDOWN", attempt: session.attempt }
            : restored === "complete"
              ? { type: "RECOVER", attempt: session.attempt, commandLog: session.commandLog }
              : { type: "RESUME", attempt: session.attempt, commandLog: session.commandLog },
      );

      void recoverAttempt({
        client, session, restored, expectedLevel: levelVersionId, signal: flowController.signal,
        isCurrent: () => mountedRef.current && flowGeneration === flowGenerationRef.current
          && levelRef.current === levelVersionId,
        onResult: (result) => {
          void getJournal().then(async (activeJournal) => {
            await activeJournal.recordReceipt(session.attempt, result, session.commandLog);
            if (!accountBindingOf(result) || accountBindingOf(result)?.state === "linked") {
              await activeJournal.terminalize(session.attempt.attemptId);
            }
            syncJournalState(activeJournal);
          });
          mergeAuthoritativeResult(result, levelVersionId, session.attempt.displayName);
          dispatch({ type: "SUBMIT_SUCCEEDED", result });
          setRecoveryReady(true);
          void refreshRecords();
        },
        onTerminal: (error) => {
          void getJournal().then(async (activeJournal) => {
            await activeJournal.terminalize(session.attempt.attemptId);
            syncJournalState(activeJournal);
          });
          dispatch({ type: "RECOVERY_FAILED", error });
          setRecoveryReady(true);
        },
        onResumed: () => setRecoveryReady(true),
      });
      return true;
    };

    const legacySession = loadAttemptSession();
    if (legacySession) {
      if (legacySession.attempt.levelVersionId === levelVersionId) {
        void getJournal().then(() => {
          if (flowGeneration === flowGenerationRef.current) {
            if (!restoreSession(legacySession)) setRecoveryReady(true);
          }
        });
      } else {
        setRecoveryReady(true);
      }
    } else {
      void getJournal().then(async (activeJournal) => {
        const durable = (await activeJournal.recoverableAttempts())
          .filter((item) => item.attempt.levelVersionId === levelVersionId)
          .sort((left, right) => right.createdAt - left.createdAt)[0];
        if (flowGeneration !== flowGenerationRef.current) return;
        const recovering = durable
          ? restoreSession({ attempt: durable.attempt, commandLog: durable.commandLog })
          : false;
        if (!recovering) setRecoveryReady(true);
      });
    }

    return () => {
      flowGenerationRef.current += 1;
      flowController.abort();
      readGenerationRef.current += 1;
      activeReadRef.current?.abort();
    };
  }, [client, enabled, getJournal, levelVersionId, refreshRecords, syncJournalState]);

  useEffect(() => {
    if (attemptState.status !== "countdown") {
      setCountdown(undefined);
      return;
    }
    const startsAt = Date.parse(attemptState.attempt.startsAt);
    const update = () => {
      const remaining = startsAt - Date.now();
      if (remaining <= 0) {
        setCountdown(undefined);
        commandLogRef.current = [];
        dispatch({ type: "COUNTDOWN_FINISHED" });
        return;
      }
      setCountdown(
        remaining <= 3_000 ? Math.max(1, Math.ceil(remaining / 1_000)) : undefined,
      );
    };
    update();
    const timer = window.setInterval(update, 100);
    return () => window.clearInterval(timer);
  }, [attemptState]);

  useEffect(() => {
    if (
      attemptState.status !== "active" &&
      attemptState.status !== "submitting" &&
      attemptState.status !== "retry_available" &&
      attemptState.status !== "result_pending"
    ) {
      setRankedElapsedSeconds(
        attemptState.status === "accepted"
          ? attemptState.result.elapsedSeconds
          : undefined,
      );
      return;
    }
    const startsAt = Date.parse(attemptState.attempt.startsAt);
    const update = () =>
      setRankedElapsedSeconds(Math.max(0, Math.floor((Date.now() - startsAt) / 1_000)));
    update();
    if (attemptState.status !== "active") {
      return;
    }
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [attemptState]);

  const startRankedRun = useCallback(async () => {
    const requestedLevel = levelRef.current;
    if (!enabled || !requestedLevel) {
      return;
    }
    const flowGeneration = ++flowGenerationRef.current;
    activeFlowRef.current?.abort();
    const flowController = new AbortController();
    activeFlowRef.current = flowController;
    dispatch({ type: "START_REQUESTED" });
    try {
      const activeJournal = await getJournal();
      let startIntent = startIntentRef.current;
      if (!startIntent || startIntent.levelVersionId !== requestedLevel) {
        startIntent = await activeJournal.beginStart(requestedLevel, authGeneration);
        startIntentRef.current = startIntent;
        syncJournalState(activeJournal);
      }
      let attempt = await client.startAttempt(
        requestedLevel,
        startIntent.requestId,
        flowController.signal,
      );
      if (!isCurrentFlow(flowGeneration, requestedLevel)) {
        return;
      }
      assertAttemptBinding(attempt, requestedLevel);
      await activeJournal.acceptStart(startIntent, attempt);
      startIntentRef.current = undefined;
      syncJournalState(activeJournal);
      if (Date.parse(attempt.startsAt) - Date.now() < 1_000) {
        await activeJournal.abandonUnplayed(attempt.attemptId);
        startIntent = await activeJournal.beginStart(requestedLevel, authGeneration);
        startIntentRef.current = startIntent;
        attempt = await client.startAttempt(
          requestedLevel,
          startIntent.requestId,
          flowController.signal,
        );
        if (!isCurrentFlow(flowGeneration, requestedLevel)) {
          return;
        }
        assertAttemptBinding(attempt, requestedLevel);
        await activeJournal.acceptStart(startIntent, attempt);
        startIntentRef.current = undefined;
        syncJournalState(activeJournal);
      }
      commandLogRef.current = [];
      saveAttemptSession({ attempt, commandLog: [] });
      dispatch({ type: "START_SUCCEEDED", attempt });
    } catch (error) {
      if (isCurrentFlow(flowGeneration, requestedLevel)) {
        dispatch({ type: "START_FAILED", error: errorDetail(error) });
      }
    }
  }, [authGeneration, client, enabled, getJournal, syncJournalState]);

  const submit = useCallback(
    async (
      attempt: AttemptStartResponse,
      commandLog: readonly ReplayCommand[],
      flowGeneration: number,
    ) => {
      try {
        const result = await client.completeAttempt(attempt.attemptId, {
          commandLog,
        }, activeFlowRef.current?.signal);
        if (!isCurrentFlow(flowGeneration, attempt.levelVersionId)) {
          return;
        }
        assertCompletionBinding(result, attempt);
        const activeJournal = await getJournal();
        await activeJournal.recordReceipt(attempt, result, commandLog);
        if (!accountBindingOf(result) || accountBindingOf(result)?.state === "linked") {
          await activeJournal.terminalize(attempt.attemptId);
        }
        syncJournalState(activeJournal);
        clearAttemptSession();
        mergeAuthoritativeResult(
          result,
          attempt.levelVersionId,
          attempt.displayName,
        );
        dispatch({ type: "SUBMIT_SUCCEEDED", result });
        await refreshRecords();
      } catch (error) {
        if (!isCurrentFlow(flowGeneration, attempt.levelVersionId)) {
          return;
        }
        const detail = errorDetail(error);
        if (!detail.retryable) {
          clearAttemptSession();
        }
        dispatch({
          type: "SUBMIT_FAILED",
          error: detail,
          responseLost: detail.code === "LEADERBOARD_UNAVAILABLE",
        });
      }
    },
    [client, getJournal, refreshRecords, syncJournalState],
  );

  const recordCommand = useCallback(
    (command: ReplayCommand, isComplete: boolean) => {
      const state = attemptRef.current;
      if (state.status !== "active") {
        return;
      }
      const commandLog = [...commandLogRef.current, command];
      commandLogRef.current = commandLog;
      saveAttemptSession({ attempt: state.attempt, commandLog });
      dispatch({ type: "COMMAND_RECORDED", command });
      const flowGeneration = flowGenerationRef.current;
      if (isComplete) dispatch({ type: "RUN_COMPLETED" });
      void (async () => {
        const activeJournal = await getJournal();
        await activeJournal.appendCommand(state.attempt, command);
        if (isComplete) {
          await activeJournal.freezeCompletion(state.attempt);
          syncJournalState(activeJournal);
          await submit(state.attempt, commandLog, flowGeneration);
        }
      })();
    },
    [getJournal, submit, syncJournalState],
  );

  const retrySubmission = useCallback(async () => {
    const state = attemptRef.current;
    if (
      state.status !== "retry_available" &&
      state.status !== "result_pending"
    ) {
      return;
    }
    const flowGeneration = flowGenerationRef.current;
    try {
      const status = await client.getAttempt(
        state.attempt.attemptId,
        activeFlowRef.current?.signal,
      );
      if (!isCurrentFlow(flowGeneration, state.attempt.levelVersionId)) {
        return;
      }
      if (status.status === "completed") {
        let completed = completionWithStatusBinding(status.result, status.accountBinding);
        if (accountBindingOf(completed)?.state === "pending") {
          completed = await client.completeAttempt(state.attempt.attemptId, {
            commandLog: state.commandLog,
          }, activeFlowRef.current?.signal);
        }
        assertCompletionBinding(completed, state.attempt);
        const activeJournal = await getJournal();
        await activeJournal.recordReceipt(state.attempt, completed, state.commandLog);
        if (!accountBindingOf(completed) || accountBindingOf(completed)?.state === "linked") {
          await activeJournal.terminalize(state.attempt.attemptId);
        }
        syncJournalState(activeJournal);
        clearAttemptSession();
        mergeAuthoritativeResult(
          completed,
          state.attempt.levelVersionId,
          state.attempt.displayName,
        );
        dispatch({ type: "SUBMIT_SUCCEEDED", result: completed });
        void refreshRecords();
      } else if (status.status === "started") {
        assertStatusAttemptBinding(status.attempt, state.attempt);
        if (canRetryAttempt(state)) {
          await submit(state.attempt, state.commandLog, flowGeneration);
        } else {
          clearAttemptSession();
          dispatch({ type: "RECOVERY_FAILED", error: expiredError() });
        }
      } else {
        const activeJournal = await getJournal();
        await activeJournal.terminalize(state.attempt.attemptId);
        syncJournalState(activeJournal);
        clearAttemptSession();
        dispatch({ type: "RECOVERY_FAILED", error: status.error });
      }
    } catch (error) {
      if (isCurrentFlow(flowGeneration, state.attempt.levelVersionId)) {
        dispatch({
          type: "SUBMIT_FAILED",
          error: errorDetail(error),
          responseLost: true,
        });
      }
    }
  }, [client, getJournal, refreshRecords, submit, syncJournalState]);

  const cancelRankedRun = useCallback(() => {
    flowGenerationRef.current += 1;
    activeFlowRef.current?.abort();
    clearAttemptSession();
    commandLogRef.current = [];
    dispatch({ type: "CANCEL" });
  }, []);

  function isCurrentFlow(generation: number, expectedLevel: string) {
    return (
      mountedRef.current &&
      generation === flowGenerationRef.current &&
      levelRef.current === expectedLevel
    );
  }

  function mergeAuthoritativeResult(
    result: AttemptCompleteResponse,
    expectedLevel: string,
    displayName: string,
  ) {
    if (result.levelVersionId !== expectedLevel) {
      return;
    }
    const previous =
      snapshotForLevel(recordsRef.current, expectedLevel) ?? {
        levelVersionId: expectedLevel,
        leaderboard: null,
        personal: null,
        updatedAt: Date.now(),
      };
    const next = {
      ...previous,
      personal: mergeAuthoritativePersonal(
        previous.personal,
        result,
        expectedLevel,
        displayName,
      ),
      authoritativeResult: result,
    };
    recordsRef.current = {
      ...next,
      status: next.leaderboard ? "stale" : "partial",
    };
    setRecordsState(recordsRef.current);
  }

  return {
    attemptState,
    recordsState,
    countdown,
    rankedElapsedSeconds,
    journalState,
    recoveryReady,
    startRankedRun,
    cancelRankedRun,
    recordCommand,
    retrySubmission,
    refreshRecords,
  };
}

function containsAuthoritativeTopTenEntry(
  leaderboard: LeaderboardResponse | null,
  result: AttemptCompleteResponse | undefined,
): boolean {
  const best = result?.personalBest;
  if (
    !leaderboard ||
    result?.status !== "published" ||
    !best?.isTopTen
  ) {
    return true;
  }
  return leaderboard.entries.some(
    (entry) => entry.scoreId === best.scoreId && entry.rank === best.rank,
  );
}

function mergeAuthoritativePersonal(
  personal: PersonalBestResponse | null,
  result: AttemptCompleteResponse | undefined,
  levelVersionId: string,
  displayName: string | undefined,
): PersonalBestResponse | null {
  const best = result?.personalBest;
  if (!best || !displayName) {
    return personal;
  }
  return {
    levelVersionId,
    displayName,
    personalBest: {
      scoreId: best.scoreId,
      rank: best.rank,
      displayName,
      elapsedSeconds: best.elapsedSeconds,
      achievedAt: new Date().toISOString(),
    },
  };
}

async function recoverAttempt({
  client,
  session,
  restored,
  expectedLevel,
  signal,
  isCurrent,
  onResult,
  onTerminal,
  onResumed,
}: {
  readonly client: LeaderboardClient;
  readonly session: {
    readonly attempt: AttemptStartResponse;
    readonly commandLog: readonly ReplayCommand[];
  };
  readonly restored: "playing" | "complete";
  readonly expectedLevel: string;
  readonly signal: AbortSignal;
  readonly isCurrent: () => boolean;
  readonly onResult: (result: AttemptCompleteResponse) => void;
  readonly onTerminal: (error: PublicErrorResponse["error"]) => void;
  readonly onResumed: () => void;
}) {
  try {
    const status = await client.getAttempt(session.attempt.attemptId, signal);
    if (!isCurrent()) {
      return;
    }
    if (status.status === "completed") {
      let completed = completionWithStatusBinding(status.result, status.accountBinding);
      if (accountBindingOf(completed)?.state === "pending") {
        completed = await client.completeAttempt(session.attempt.attemptId, {
          commandLog: session.commandLog,
        }, signal);
      }
      assertCompletionBinding(completed, session.attempt);
      clearAttemptSession();
      onResult(completed);
      return;
    }
    if (status.status !== "started") {
      clearAttemptSession();
      onTerminal(status.error);
      return;
    }
    assertStatusAttemptBinding(status.attempt, session.attempt);
    if (Date.parse(session.attempt.expiresAt) <= Date.now()) {
      clearAttemptSession();
      onTerminal(expiredError());
      return;
    }
    if (
      restored === "complete" &&
      expectedLevel === session.attempt.levelVersionId
    ) {
      const result = await client.completeAttempt(session.attempt.attemptId, {
        commandLog: session.commandLog,
      }, signal);
      if (!isCurrent()) {
        return;
      }
      assertCompletionBinding(result, session.attempt);
      clearAttemptSession();
      onResult(result);
    } else {
      onResumed();
    }
  } catch (error) {
    if (isCurrent()) {
      const detail = errorDetail(error);
      if (!detail.retryable) {
        clearAttemptSession();
        onTerminal(detail);
      }
    }
  }
}

function snapshotForLevel(
  state: RecordsState,
  levelVersionId: string,
): RecordsSnapshot | null {
  return state.status === "ready" ||
    state.status === "empty" ||
    state.status === "partial" ||
    state.status === "stale"
    ? state.levelVersionId === levelVersionId
      ? state
      : null
    : null;
}

function assertAttemptBinding(attempt: AttemptStartResponse, expectedLevel: string) {
  if (
    attempt.levelVersionId !== expectedLevel ||
    attempt.apiProtocolVersion !== API_PROTOCOL_VERSION ||
    attempt.replayContractVersion !== REPLAY_CONTRACT_VERSION
  ) {
    throw new LeaderboardClientError(protocolMismatchError());
  }
}

function assertStatusAttemptBinding(
  received: AttemptStartResponse,
  expected: AttemptStartResponse,
) {
  assertAttemptBinding(received, expected.levelVersionId);
  if (received.attemptId !== expected.attemptId) {
    throw new LeaderboardClientError(protocolMismatchError());
  }
}

function assertCompletionBinding(
  result: AttemptCompleteResponse,
  attempt: AttemptStartResponse,
) {
  if (result.levelVersionId !== attempt.levelVersionId) {
    throw new LeaderboardClientError(protocolMismatchError());
  }
}

function accountBindingOf(result: AttemptCompleteResponse): AccountBinding | undefined {
  return (result as AccountAttemptCompleteResponse).accountBinding;
}

function completionWithStatusBinding(
  result: AttemptCompleteResponse,
  binding: AccountBinding | undefined,
): AccountAttemptCompleteResponse {
  return binding ? { ...result, accountBinding: binding } : result;
}

function protocolMismatchError(): PublicErrorResponse["error"] {
  return {
    code: "API_PROTOCOL_VERSION_MISMATCH",
    message: "The ranked response did not match this run.",
    retryable: false,
    requestId: "client-binding",
  };
}

function expiredError(): PublicErrorResponse["error"] {
  return {
    code: "ATTEMPT_EXPIRED",
    message: "This ranked run expired.",
    retryable: false,
    requestId: "client-expiry",
  };
}

function errorDetail(error: unknown): PublicErrorResponse["error"] {
  if (error instanceof LeaderboardClientError) {
    return (PUBLIC_ERROR_CODES as readonly string[]).includes(error.detail.code)
      ? error.detail as PublicErrorResponse["error"]
      : {
          code: "LEADERBOARD_UNAVAILABLE",
          message: error.detail.message,
          retryable: error.detail.retryable,
          requestId: error.detail.requestId,
        };
  }
  return {
    code: "LEADERBOARD_UNAVAILABLE",
    message: "Records are temporarily unavailable.",
    retryable: true,
    requestId: "client-unknown",
  };
}
