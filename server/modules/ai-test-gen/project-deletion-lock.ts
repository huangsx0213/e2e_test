import { ConflictError } from '../../shared/http/errors.ts';

export class ProjectDeletionLock {
  private readonly lockedProjects = new Set<string>();

  acquire(projectId: string): () => void {
    if (this.lockedProjects.has(projectId)) {
      throw new ConflictError('Project deletion is already in progress');
    }
    this.lockedProjects.add(projectId);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.lockedProjects.delete(projectId);
    };
  }

  assertStartAllowed(projectId: string): void {
    if (this.lockedProjects.has(projectId)) {
      throw new ConflictError('Project deletion is in progress');
    }
  }

  isLocked(projectId: string): boolean {
    return this.lockedProjects.has(projectId);
  }
}

export const projectDeletionLock = new ProjectDeletionLock();
