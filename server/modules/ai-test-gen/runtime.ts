import { TestGenController } from './controller.ts';
import type { RunDeletionPreparation } from './orchestrator.ts';
import { ProjectDeletionLock, projectDeletionLock } from './project-deletion-lock.ts';
import { pipelineRepo } from './repository.ts';
import { Log } from '../../shared/services/logger.ts';

export const testGenController = new TestGenController();

interface ProjectTestGenLifecycleDependencies {
  readonly runRepository: Pick<
    typeof pipelineRepo,
    'listRunIdsByProject' | 'deleteProjectData'
  >;
  readonly orchestrator: Pick<
    TestGenController['orchestrator'],
    'abortAndWaitForDeletion' | 'completeDeletion' | 'cancelDeletion' | 'failDeletion'
  >;
  readonly deletionLock: ProjectDeletionLock;
  readonly reportCleanupFailure?: (
    projectId: string,
    failures: readonly PostCommitCleanupFailure[],
  ) => void;
}

interface PostCommitCleanupFailure {
  readonly runId: string;
  readonly error: unknown;
}

export async function deleteProjectTestGenData(
  projectId: string,
  dependencies: ProjectTestGenLifecycleDependencies = {
    runRepository: pipelineRepo,
    orchestrator: testGenController.orchestrator,
    deletionLock: projectDeletionLock,
  },
): Promise<void> {
  const releaseLock = dependencies.deletionLock.acquire(projectId);
  const runIds: string[] = [];
  const preparations = new Map<string, RunDeletionPreparation>();
  let deleted = false;
  try {
    runIds.push(...dependencies.runRepository.listRunIdsByProject(projectId));
    const waits = await Promise.allSettled(
      runIds.map(async (runId) => {
        const preparation = await dependencies.orchestrator.abortAndWaitForDeletion(runId);
        preparations.set(runId, preparation);
        return preparation;
      }),
    );
    const rejected = waits.find((result): result is PromiseRejectedResult =>
      result.status === 'rejected'
    );
    if (rejected) throw rejected.reason;
    const failed = waits
      .filter((result): result is PromiseFulfilledResult<RunDeletionPreparation> =>
        result.status === 'fulfilled'
      )
      .find((result) => result.value.error !== undefined);
    if (failed) throw failed.value.error;

    dependencies.runRepository.deleteProjectData(projectId, runIds);
    deleted = true;
    const cleanupResults = await Promise.allSettled(
      runIds.map(async (runId) => dependencies.orchestrator.completeDeletion(runId)),
    );
    const cleanupFailures: PostCommitCleanupFailure[] = [];
    cleanupResults.forEach((result, index) => {
      if (result.status === 'rejected') {
        cleanupFailures.push({ runId: runIds[index], error: result.reason });
      }
    });
    if (cleanupFailures.length > 0) {
      try {
        if (dependencies.reportCleanupFailure) {
          dependencies.reportCleanupFailure(projectId, cleanupFailures);
        } else {
          reportPostCommitCleanupFailure(projectId, cleanupFailures);
        }
      } catch {
        reportPostCommitCleanupFailure(projectId, cleanupFailures);
      }
    }
  } catch (error) {
    if (!deleted) {
      const retainedRunIds = dependencies.runRepository.listRunIdsByProject(projectId);
      const known = new Set(runIds);
      const newlyObserved = retainedRunIds.filter((runId) => !known.has(runId));
      runIds.push(...newlyObserved);
      await Promise.allSettled(
        newlyObserved.map(async (runId) => {
          const preparation = await dependencies.orchestrator.abortAndWaitForDeletion(runId);
          preparations.set(runId, preparation);
        }),
      );
      await Promise.allSettled(retainedRunIds.map(async (runId) => {
        const wasActive = preparations.get(runId)?.wasActive ?? false;
        dependencies.orchestrator.failDeletion(runId, 'Project deletion failed', wasActive);
      }));
    }
    throw error;
  } finally {
    await Promise.allSettled(
      [...new Set(runIds)].map(async (runId) => {
        dependencies.orchestrator.cancelDeletion(runId);
      }),
    );
    releaseLock();
  }
}

function reportPostCommitCleanupFailure(
  projectId: string,
  failures: readonly PostCommitCleanupFailure[],
): void {
  Log.for('test-gen-runtime').error(
    `Post-commit cleanup failed: projectId=${projectId}, runCount=${failures.length}`,
  );
}
