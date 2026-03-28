import { environmentRepository } from './repository.ts';
import { validateWithSchema } from '../../shared/validation.ts';
import { environmentCreateSchema, environmentNameSchema } from './validator.ts';

export const environmentService = {
  list: () => environmentRepository.list(),
  create: (payload: unknown) => {
    const parsed = validateWithSchema(environmentCreateSchema, payload);
    return environmentRepository.create(parsed.name);
  },
  remove: (name: string) => environmentRepository.remove(validateWithSchema(environmentNameSchema, name)),
};
