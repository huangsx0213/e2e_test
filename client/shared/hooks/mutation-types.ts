export interface MutationActions<T extends { id: string }> {
  create: (item: Omit<T, 'id'> | T) => Promise<T>;
  update: (id: string, item: Partial<T>) => Promise<T>;
  remove: (id: string) => Promise<void>;
}

export interface EnvironmentMutationActions {
  create: (env: string) => Promise<string>;
  remove: (env: string) => Promise<void>;
}
