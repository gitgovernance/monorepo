import type {
  ActorRecord,
  AgentRecord,
  TaskRecord,
  CycleRecord,
  ExecutionRecord,
  FeedbackRecord,
  ChangelogRecord,
} from '../types';

export interface Store<T> {
  /**
   * Obtiene un record por ID
   * @returns El record o null si no existe
   */
  get(id: string): Promise<T | null>;

  /**
   * Persiste un record
   * @param id - Identificador único
   * @param value - El record a persistir
   */
  put(id: string, value: T): Promise<void>;

  /**
   * Elimina un record
   * @param id - Identificador del record a eliminar
   */
  delete(id: string): Promise<void>;

  /**
   * Lista todos los IDs de records
   * @returns Array de IDs
   */
  list(): Promise<string[]>;

  /**
   * Verifica si existe un record
   * @param id - Identificador a verificar
   */
  exists(id: string): Promise<boolean>;
}

export interface Stores {
  actors?: Store<ActorRecord>;
  agents?: Store<AgentRecord>;
  tasks?: Store<TaskRecord>;
  cycles?: Store<CycleRecord>;
  executions?: Store<ExecutionRecord>;
  feedbacks?: Store<FeedbackRecord>;
  changelogs?: Store<ChangelogRecord>;
}
