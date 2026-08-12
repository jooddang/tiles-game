import { useCallback, useEffect, useRef, useState } from "react";
import type { AccountSnapshot } from "../account/protocol";
import type { AccountAttemptCompleteResponse } from "./accountScoreProtocol";
import type { LeaderboardClient } from "./leaderboardClient";
import { canonicalizePublicMessage } from "./messageCanonicalizer";
import {
  claimItemId, openRankedOutbox, publicationItemId,
  type ClaimOutboxItem, type CompletionOutboxItem, type PublicationOutboxItem,
  type RankedOutboxDatabase,
} from "./rankedOutbox";

export type ScoreLifecycleState = {
  readonly claim: "idle" | "guest_accepted" | "securing" | "awaiting_auth" | "confirm_claim" | "claiming" | "binding_pending" | "claimed" | "parked" | "error";
  readonly publicHandle?: string;
  readonly canPublish?: boolean;
  readonly canRecoverDraft?: boolean;
  readonly publication: "idle" | "draft" | "publishing" | "outcome_unknown" | "published" | "parked" | "error";
  readonly draft: string;
  readonly canonicalPreview: string;
  readonly validationError?: string;
  readonly draftWarning?: string;
  readonly message?: string;
  readonly publicationNotice?: string;
  readonly error?: string;
};

const initialState: ScoreLifecycleState = {
  claim: "idle", publication: "idle", draft: "", canonicalPreview: "",
};
const LOCAL_IO_DEADLINE_MS = 2_000;

export function useScoreLifecycle({
  result, account, client, onSignIn, database,
}: {
  readonly result: AccountAttemptCompleteResponse | null;
  readonly account: AccountSnapshot | null | undefined;
  readonly client: LeaderboardClient;
  readonly onSignIn: () => void;
  readonly database?: RankedOutboxDatabase;
}) {
  const [state, setState] = useState(initialState);
  const databasePromise = useRef<Promise<RankedOutboxDatabase | null> | null>(null);
  const claimRef = useRef<ClaimOutboxItem | null>(null);
  const publicationRef = useRef<PublicationOutboxItem | null>(null);
  const publicationRevisionRef = useRef<number | null>(null);
  const terminalClaimHandleRef = useRef<string | null>(null);
  const publicationOutcomeUnknownRef = useRef(false);
  const publicationGenerationRef = useRef(0);
  const draftQueueRef = useRef(Promise.resolve());
  const latestAccountRef = useRef(account);
  latestAccountRef.current = account;
  const scoreId = result?.submittedScoreId ?? null;

  const getDatabase = useCallback(async () => {
    databasePromise.current ??= database
      ? Promise.resolve(database)
      : openRankedOutbox().catch(() => null);
    return databasePromise.current;
  }, [database]);

  const finishClaim = useCallback((publicHandle: string, authGeneration: string,
    bestScoreId: string | null) => {
    const claimedItem = claimRef.current;
    const guestDraft = publicationRef.current?.authGeneration === null
      ? publicationRef.current : null;
    terminalClaimHandleRef.current = publicHandle;
    setState((current) => ({ ...current, claim: "claimed", publicHandle,
      canPublish: guestDraft === null, error: undefined }));

    const cleanupClaimEvidence = () => getDatabase().then(async (db) => {
      if (!db || !claimedItem) return;
      try {
        const completions = await withDeadline(db.list());
        const completion = completions.find((item): item is CompletionOutboxItem => item.operation === "complete"
          && item.terminalResult?.submittedScoreId === claimedItem.scoreId);
        if (!completion?.terminalResult) return;
        const linkedCompletion = { ...completion, phase: "account_linked" as const,
          terminalResult: { ...completion.terminalResult, accountBinding: {
            state: "linked" as const, scoreId: claimedItem.scoreId,
            bestScoreId,
            accountName: publicHandle,
          } } };
        await withDeadline(db.put(linkedCompletion));
        await withDeadline(db.delete(claimedItem.id));
        if (claimRef.current?.id === claimedItem.id) claimRef.current = null;
      } catch { /* Best-effort local evidence cleanup after claim receipt. */ }
    }).catch(() => undefined);

    if (guestDraft) {
      void withDeadline(draftQueueRef.current).then(async () => {
        const rebound = { ...guestDraft, ownerBinding: `account:${authGeneration}`,
          authGeneration, accountName: publicHandle };
        const db = await getDatabase();
        if (!db) throw new Error("Private draft storage is unavailable");
        await withDeadline(db.put(rebound));
        publicationRef.current = rebound;
        publicationGenerationRef.current += 1;
        const latest = latestAccountRef.current;
        const stillClaimingAccount = latest?.account.state === "authenticated"
          && latest.authGeneration === authGeneration
          && latest.account.publicName === publicHandle;
        setState((current) => ({ ...current,
          claim: stillClaimingAccount ? current.claim : "parked",
          publication: stillClaimingAccount ? current.publication : "parked",
          canPublish: stillClaimingAccount,
          canRecoverDraft: false,
          draftWarning: undefined,
        }));
        void cleanupClaimEvidence();
      }).catch(() => {
        setState((current) => ({ ...current, canPublish: false,
          draftWarning: "The score is saved, but this private draft could not be secured. Retry after storage recovers." }));
      });
    } else void cleanupClaimEvidence();
  }, [getDatabase]);

  const reconcileClaim = useCallback(async (item: ClaimOutboxItem, snapshot: AccountSnapshot) => {
    if (snapshot.account.state !== "authenticated") return;
    const authenticatedAccount = snapshot.account;
    if (item.authGeneration && item.authGeneration !== snapshot.authGeneration) {
      setState((current) => ({ ...current, claim: "parked", publicHandle: snapshot.account.state === "authenticated"
        ? snapshot.account.publicName : undefined }));
      return;
    }
    setState((current) => ({ ...current, claim: "claiming", error: undefined }));
    const db = await getDatabase();
    const claiming = { ...item, authGeneration: snapshot.authGeneration, phase: "claiming" as const };
    claimRef.current = claiming;
    try {
      await db?.put(claiming);
      const status = await client.getClaimStatus(item.scoreId, item.requestId);
      if (status.status === "claimed") {
        await finishClaim(authenticatedAccount.publicName, snapshot.authGeneration,
          status.bestScoreId ?? null);
        return;
      }
      if (status.status !== "pending") throw new Error(`Claim ${status.status}`);
      setState((current) => ({ ...current, claim: "confirm_claim",
        publicHandle: authenticatedAccount.publicName, error: undefined }));
    } catch (error) {
      try {
        const status = await client.getClaimStatus(item.scoreId, item.requestId);
        if (status.status === "claimed") {
          await finishClaim(authenticatedAccount.publicName, snapshot.authGeneration,
            status.bestScoreId ?? null);
          return;
        }
      } catch { /* Preserve the exact claim item for explicit recovery. */ }
      setState((current) => ({ ...current, claim: "error", error: safeMessage(error) }));
    }
  }, [client, finishClaim, getDatabase]);

  const confirmClaim = useCallback(async () => {
    const item = claimRef.current;
    if (!item || account?.account.state !== "authenticated") return;
    if (item.authGeneration !== account.authGeneration) {
      setState((value) => ({ ...value, claim: "parked" }));
      return;
    }
    setState((value) => ({ ...value, claim: "claiming", error: undefined }));
    try {
      const receipt = await client.claimScore(item.scoreId, item.requestId, item.claimRequestId);
      await finishClaim(receipt.publicHandle, account.authGeneration, receipt.bestScoreId);
    } catch (error) {
      try {
        const status = await client.getClaimStatus(item.scoreId, item.requestId);
        if (status.status === "claimed") {
          await finishClaim(account.account.publicName, account.authGeneration,
            status.bestScoreId ?? null);
          return;
        }
      } catch { /* Exact item remains retryable. */ }
      setState((value) => ({ ...value, claim: "error", error: safeMessage(error) }));
    }
  }, [account, client, finishClaim]);

  useEffect(() => {
    if (!scoreId || !result) {
      setState(initialState);
      return;
    }
    let current = true;
    void getDatabase().then(async (db) => {
      const items = await db?.list().catch(() => []);
      if (!current) return;
      const claim = ((items ?? []).find((item) =>
        item.operation === "claim" && item.scoreId === scoreId) as ClaimOutboxItem | undefined) ?? null;
      const liveClaim = claim && claim.expiresAt > Date.now() ? claim : null;
      if (claim && !liveClaim) void db?.delete(claim.id).catch(() => undefined);
      const publication = ((items ?? []).find((item) =>
        item.operation === "publish" && item.scoreId === scoreId) as PublicationOutboxItem | undefined) ?? null;
      claimRef.current = liveClaim;
      publicationRef.current = publication;
      publicationGenerationRef.current += 1;
      const binding = result.accountBinding;
      if (binding?.state === "linked") {
        const activeName = account?.account.state === "authenticated"
          ? account.account.publicName : null;
        const switchedAccount = activeName !== null && activeName !== binding.accountName;
        setState((value) => ({ ...value, claim: switchedAccount ? "parked" : "claimed",
          publicHandle: binding.accountName, canPublish: activeName === binding.accountName }));
      } else if (binding?.state === "guest") {
        const terminalHandle = terminalClaimHandleRef.current;
        const switchedAccount = terminalHandle !== null
          && account?.account.state === "authenticated"
          && account.account.publicName !== terminalHandle;
        setState((value) => terminalHandle ? ({ ...value,
          claim: switchedAccount ? "parked" : "claimed", publicHandle: terminalHandle,
          canPublish: account?.account.state === "authenticated"
            && account.account.publicName === terminalHandle,
        }) : ({ ...value,
          claim: liveClaim?.phase === "creating_continuation" ? "error"
            : liveClaim ? "awaiting_auth" : "guest_accepted",
          error: liveClaim?.phase === "creating_continuation"
            ? "Account linking needs to resume with the saved request." : value.error,
        }));
      } else if (binding?.state === "pending") {
        setState((value) => ({ ...value, claim: "binding_pending", canPublish: false }));
      }
      if (publication) {
        const mismatch = account?.account.state === "authenticated"
          && publication.authGeneration !== null
          && publication.authGeneration !== account.authGeneration;
        publicationOutcomeUnknownRef.current = publication.phase === "outcome_unknown";
        setState((value) => ({ ...value, publication: mismatch ? "parked" : publication.phase,
          canRecoverDraft: mismatch && account?.account.state === "authenticated"
            && publication.accountName === account.account.publicName,
          draft: publication.rawDraft, canonicalPreview: publication.canonicalMessage }));
      }
      if (liveClaim && account) await reconcileClaim(liveClaim, account);
    });
    return () => { current = false; };
  }, [account, getDatabase, reconcileClaim, result, scoreId]);

  const secureContinuation = useCallback(async (item: ClaimOutboxItem) => {
    setState((value) => ({ ...value, claim: "securing", error: undefined }));
    const db = await getDatabase();
    if (!db) {
      setState((value) => ({ ...value, claim: "error",
        error: "Keep this tab open — account linking could not be secured on this device." }));
      return;
    }
    try {
      await withDeadline(db.put(item));
      if (publicationRef.current) await withDeadline(draftQueueRef.current);
      const continuation = await client.createClaimContinuation(item.scoreId, item.requestId);
      const continuationExpiresAt = Date.parse(continuation.expiresAt);
      const storedItems = await withDeadline(db.list());
      const completion = storedItems.find((stored): stored is CompletionOutboxItem =>
        stored.operation === "complete"
        && stored.terminalResult?.submittedScoreId === item.scoreId);
      if (completion && completion.expiresAt < continuationExpiresAt) {
        await withDeadline(db.put({ ...completion, expiresAt: continuationExpiresAt }));
      }
      const draft = publicationRef.current;
      if (draft && draft.expiresAt < continuationExpiresAt) {
        const extendedDraft = { ...draft, expiresAt: continuationExpiresAt };
        await withDeadline(db.put(extendedDraft));
        publicationRef.current = extendedDraft;
      }
      const ready = { ...item, continuationId: continuation.continuationId,
        phase: "awaiting_auth" as const, expiresAt: continuationExpiresAt };
      claimRef.current = ready;
      await withDeadline(db.put(ready));
      setState((value) => ({ ...value, claim: "awaiting_auth" }));
      if (account?.account.state === "authenticated") await reconcileClaim(ready, account);
      else onSignIn();
    } catch (error) {
      setState((value) => ({ ...value, claim: "error", error: safeMessage(error) }));
    }
  }, [account, client, getDatabase, onSignIn, reconcileClaim]);

  const startClaim = useCallback(async () => {
    if (!scoreId) return;
    const now = Date.now();
    const item: ClaimOutboxItem = {
      id: claimItemId(scoreId), operation: "claim", scoreId,
      ownerBinding: `score:${scoreId}`, requestId: crypto.randomUUID(),
      claimRequestId: crypto.randomUUID(), authGeneration: null,
      phase: "creating_continuation", createdAt: now,
      expiresAt: now + 7 * 24 * 60 * 60_000, retryCount: 0,
    };
    claimRef.current = item;
    await secureContinuation(item);
  }, [scoreId, secureContinuation]);

  const setDraft = useCallback((rawDraft: string) => {
    if (!scoreId || !account || (account.account.state !== "authenticated"
      && account.account.state !== "guest")) return;
    if (publicationOutcomeUnknownRef.current) return;
    publicationGenerationRef.current += 1;
    const canonical = canonicalizePublicMessage(rawDraft);
    const authenticated = account.account.state === "authenticated" ? account.account : null;
    const validationError = canonical.ok ? undefined : canonicalError(canonical.code);
    const canonicalMessage = canonical.ok ? canonical.value : "";
    setState((value) => ({ ...value, publication: "draft", draft: rawDraft,
      canonicalPreview: canonicalMessage, validationError, error: undefined }));
    const now = Date.now();
    const item: PublicationOutboxItem = {
        id: publicationItemId(scoreId), operation: "publish", scoreId,
        ownerBinding: authenticated ? `account:${account.authGeneration}` : `score:${scoreId}`,
        requestId: publicationRef.current?.requestId ?? crypto.randomUUID(),
        authGeneration: authenticated ? account.authGeneration : null,
        accountName: authenticated?.publicName ?? null,
        rawDraft, canonicalMessage, phase: "draft",
        expectedRevision: publicationRevisionRef.current,
        createdAt: now, expiresAt: now + 7 * 24 * 60 * 60_000, retryCount: 0,
    };
    publicationRef.current = item;
    const write = async () => {
      const db = await getDatabase();
      if (!db) throw new Error("Private draft storage is unavailable");
      await db.put(item);
      setState((value) => ({ ...value, draftWarning: undefined }));
    };
    draftQueueRef.current = draftQueueRef.current.then(write, write);
    void draftQueueRef.current.catch(() => {
      setState((value) => ({ ...value,
        draftWarning: "This draft is not secured yet. Keep this tab open and retry after storage recovers." }));
    });
  }, [account, getDatabase, scoreId]);

  const cleanupPublicationEvidence = useCallback((id: string) => {
    void getDatabase().then((db) => db ? withDeadline(db.delete(id)) : undefined)
      .catch(() => undefined);
  }, [getDatabase]);

  const publish = useCallback(async () => {
    const item = publicationRef.current;
    if (!item || !scoreId || account?.account.state !== "authenticated") return;
    if (item.authGeneration !== account.authGeneration) {
      setState((value) => ({ ...value, publication: "parked" }));
      return;
    }
    const canonical = canonicalizePublicMessage(item.rawDraft);
    if (!canonical.ok) {
      setState((value) => ({ ...value, validationError: canonicalError(canonical.code) }));
      return;
    }
    setState((value) => ({ ...value, publication: "publishing", error: undefined }));
    let dispatched = publicationOutcomeUnknownRef.current;
    try {
      await withDeadline(draftQueueRef.current);
      if (!dispatched) {
        const durable = { ...item, phase: "outcome_unknown" as const };
        const db = await getDatabase();
        if (!db) throw new Error("Private draft storage is unavailable");
        await withDeadline(db.put(durable));
        publicationRef.current = durable;
        publicationOutcomeUnknownRef.current = true;
        dispatched = true;
      }
      const receipt = await client.publishScore(scoreId, {
        requestId: item.requestId, expectedCurrentRevision: item.expectedRevision,
        message: canonical.value,
      });
      if (receipt.messageState === "none" && receipt.revision === null) {
        publicationRef.current = null;
        publicationOutcomeUnknownRef.current = false;
        publicationRevisionRef.current = null;
        setState((value) => ({ ...value, publication: "published", message: "",
          canonicalPreview: "", error: undefined }));
        cleanupPublicationEvidence(item.id);
        return;
      }
      publicationRef.current = null;
      publicationOutcomeUnknownRef.current = false;
      publicationRevisionRef.current = receipt.revision;
      setState((value) => ({ ...value, publication: "published", draft: canonical.value,
        message: canonical.value, canonicalPreview: canonical.value, error: undefined,
        publicationNotice: undefined }));
      cleanupPublicationEvidence(item.id);
      const refreshGeneration = publicationGenerationRef.current;
      void client.getPublication(scoreId).then((visible) => {
        if (publicationGenerationRef.current !== refreshGeneration
          || publicationRef.current !== null || visible.requestId === item.requestId) return;
        publicationRevisionRef.current = visible.publicationRevision;
        setState((value) => ({ ...value, draft: visible.message ?? "",
          message: visible.message ?? "", canonicalPreview: visible.message ?? "",
          publicationNotice: "Your request succeeded; a newer account edit is shown now." }));
      }).catch(() => undefined);
    } catch (error) {
      try {
        const visible = await client.getPublication(scoreId);
        if (visible.requestId === item.requestId) {
          publicationRef.current = null;
          publicationOutcomeUnknownRef.current = false;
          publicationRevisionRef.current = visible.publicationRevision;
          setState((value) => ({ ...value, publication: "published", draft: visible.message ?? "",
            message: visible.message ?? "", canonicalPreview: visible.message ?? "", error: undefined,
            publicationNotice: undefined }));
          cleanupPublicationEvidence(item.id);
          return;
        }
      } catch { /* Keep the private draft for retry. */ }
      publicationOutcomeUnknownRef.current = dispatched;
      setState((value) => ({ ...value,
        publication: dispatched ? "outcome_unknown" : "error", error: safeMessage(error) }));
    }
  }, [account, cleanupPublicationEvidence, client, getDatabase, scoreId]);

  useEffect(() => {
    if (state.claim !== "claimed" || !scoreId || account?.account.state !== "authenticated"
      || publicationRef.current) return;
    let current = true;
    const hydrationGeneration = publicationGenerationRef.current;
    void client.getPublication(scoreId).then((publication) => {
      if (!current || publicationGenerationRef.current !== hydrationGeneration
        || publicationRef.current !== null) return;
      publicationRevisionRef.current = publication.publicationRevision;
      if (publication.messageState === "visible" && publication.message) {
        setState((value) => ({ ...value, publication: "published",
          draft: publication.message ?? "", canonicalPreview: publication.message ?? "",
          message: publication.message ?? "" }));
      }
    }).catch(() => undefined);
    return () => { current = false; };
  }, [account, client, scoreId, state.claim]);

  const retrySignIn = useCallback(() => {
    if (claimRef.current) onSignIn();
  }, [onSignIn]);

  const retryClaim = useCallback(() => {
    const item = claimRef.current;
    if (!item) return startClaim();
    if (item.expiresAt <= Date.now()) {
      claimRef.current = null;
      void getDatabase().then((db) => db?.delete(item.id)).catch(() => undefined);
      return startClaim();
    }
    if (item.phase === "creating_continuation") return secureContinuation(item);
    if (account?.account.state === "authenticated") return reconcileClaim(item, account);
    onSignIn();
  }, [account, getDatabase, onSignIn, reconcileClaim, secureContinuation, startClaim]);

  const recoverDraft = useCallback(async () => {
    const item = publicationRef.current;
    if (!item || account?.account.state !== "authenticated") return;
    const ownerName = item.accountName ?? terminalClaimHandleRef.current;
    if (ownerName !== account.account.publicName) return;
    const rebound = { ...item, authGeneration: account.authGeneration,
      ownerBinding: `account:${account.authGeneration}`, accountName: account.account.publicName,
      requestId: crypto.randomUUID(), phase: "draft" as const };
    publicationRef.current = rebound;
    publicationGenerationRef.current += 1;
    publicationOutcomeUnknownRef.current = false;
    try {
      const db = await getDatabase();
      if (db) await withDeadline(db.put(rebound));
      setState((value) => ({ ...value, publication: "draft", canRecoverDraft: false,
        draftWarning: undefined }));
    } catch (error) {
      publicationRef.current = item;
      setState((value) => ({ ...value, publication: "parked",
        draftWarning: safeMessage(error) }));
    }
  }, [account, getDatabase]);

  const discardDraft = useCallback(async () => {
    const item = publicationRef.current;
    const ownerName = item?.accountName ?? terminalClaimHandleRef.current;
    if (ownerName && (account?.account.state !== "authenticated"
      || ownerName !== account.account.publicName)) return;
    publicationRef.current = null;
    publicationGenerationRef.current += 1;
    publicationOutcomeUnknownRef.current = false;
    setState((value) => ({ ...value, publication: "idle", draft: "", canonicalPreview: "" }));
    if (!item) return;
    try {
      const db = await getDatabase();
      if (db) await withDeadline(db.delete(item.id));
    } catch {
      setState((value) => ({ ...value,
        draftWarning: "Draft cleared here, but stale local storage cleanup must be retried." }));
    }
  }, [account, getDatabase]);

  return { state, startClaim, confirmClaim, retryClaim, retrySignIn, setDraft, publish, recoverDraft, discardDraft };
}

function canonicalError(code: "CONTROL" | "SCALARS" | "GRAPHEMES" | "BYTES") {
  return code === "CONTROL" ? "Remove hidden or control characters."
    : "Keep the public message within 100 characters and 400 bytes.";
}

function safeMessage(error: unknown) {
  return error instanceof Error ? error.message : "This action could not be completed.";
}

function withDeadline<T>(operation: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("Local storage timed out")), LOCAL_IO_DEADLINE_MS);
    void operation.then(
      (value) => { window.clearTimeout(timeout); resolve(value); },
      (error: unknown) => { window.clearTimeout(timeout); reject(error); },
    );
  });
}
