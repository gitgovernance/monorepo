/**
 * Tabla de Trazabilidad EARS - config.test.ts
 * All EARS prefixes map to security_audit_agent.md
 *
 * | EARS ID  | Requisito                                                      | Test Case                                              | Estado    |
 * |----------|----------------------------------------------------------------|--------------------------------------------------------|-----------|
 * | AAV2-B1  | buildConfig sin overrides retorna DEFAULT_CONFIG               | [AAV2-B1] should return DEFAULT_CONFIG when called without overrides | Implementado |
 * | AAV2-B2  | heuristic conditional: true no ejecuta si regex = 0            | [AAV2-B2] should mark heuristic stage as conditional: true           | Implementado |
 * | AAV2-B3  | buildConfig con override usa pipeline del override             | [AAV2-B3] should use override pipeline when provided                 | Implementado |
 */

import { DEFAULT_CONFIG, buildConfig } from './src/config';
import type { SecurityAuditInput, AgentDetectorConfig } from './src/types';

const baseInput: SecurityAuditInput = {
  scope: 'full',
  taskId: 'task-001',
  baseDir: '/tmp/test-repo',
};

describe('config', () => {
  describe('4.2. Configuracion de Detectores (AAV2-B1 a AAV2-B3)', () => {
    it('[AAV2-B1] should return DEFAULT_CONFIG when called without overrides', () => {
      const config = buildConfig(baseInput);

      expect(config.pipeline).toHaveLength(2);
      expect(config.pipeline[0]!.detector).toBe('regex');
      expect(config.pipeline[0]!.conditional).toBe(false);
      expect(config.pipeline[1]!.detector).toBe('heuristic');
      expect(config.pipeline[1]!.conditional).toBe(true);
    });

    it('[AAV2-B2] should mark heuristic stage as conditional: true so it can be skipped', () => {
      const config = buildConfig(baseInput);
      const heuristicStage = config.pipeline.find(s => s.detector === 'heuristic');

      expect(heuristicStage).toBeDefined();
      expect(heuristicStage!.conditional).toBe(true);
    });

    it('[AAV2-B3] should use override pipeline when provided', () => {
      const override: Partial<AgentDetectorConfig> = {
        pipeline: [
          { detector: 'regex', conditional: false },
          { detector: 'llm', conditional: true },
        ],
      };

      const config = buildConfig(baseInput, override);

      expect(config.pipeline).toHaveLength(2);
      expect(config.pipeline[0]!.detector).toBe('regex');
      expect(config.pipeline[1]!.detector).toBe('llm');
    });
  });
});
