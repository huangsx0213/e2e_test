import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import { db } from '../../../shared/db/client.ts';

export const checkpointer = new SqliteSaver(db);
