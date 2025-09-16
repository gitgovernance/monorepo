import { createChangelogRecord } from './changelog_factory';
import { generateChangelogId } from '../utils/id_generator';
import { DetailedValidationError } from '../validation/common';

// Mock the validator
jest.mock('../validation/changelog_validator', () => ({
  validateChangelogRecordDetailed: jest.fn()
}));

// Mock ID generator
jest.mock('../utils/id_generator', () => ({
  generateChangelogId: jest.fn()
}));

describe('ChangelogRecord Factory', () => {
  const mockValidateChangelogRecordDetailed = require('../validation/changelog_validator').validateChangelogRecordDetailed;
  const mockGenerateChangelogId = generateChangelogId as jest.MockedFunction<typeof generateChangelogId>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Default successful validation
    mockValidateChangelogRecordDetailed.mockReturnValue({
      isValid: true,
      errors: []
    });

    // Default ID generation
    mockGenerateChangelogId.mockReturnValue('1752707800-changelog-task-test-task');
  });

  describe('createChangelogRecord', () => {
    it('[EARS-1] should create a valid ChangelogRecord with all required fields', async () => {
      const payload = {
        entityType: 'task' as const,
        entityId: '1752274500-task-test-task',
        changeType: 'completion' as const,
        title: 'Test Task Completion',
        description: 'Successfully completed the test task with all requirements',
        triggeredBy: 'human:developer',
        reason: 'All acceptance criteria met and code review passed',
        files: ['src/test.ts', 'docs/test.md'],
        commits: ['abc123', 'def456']
      };

      const result = await createChangelogRecord(payload);

      expect(result).toEqual({
        id: '1752707800-changelog-task-test-task',
        entityType: 'task',
        entityId: '1752274500-task-test-task',
        changeType: 'completion',
        title: 'Test Task Completion',
        description: 'Successfully completed the test task with all requirements',
        timestamp: expect.any(Number),
        trigger: 'manual',
        triggeredBy: 'human:developer',
        reason: 'All acceptance criteria met and code review passed',
        riskLevel: 'low',
        files: ['src/test.ts', 'docs/test.md'],
        commits: ['abc123', 'def456']
      });

      expect(mockValidateChangelogRecordDetailed).toHaveBeenCalledWith(result);
    });

    it('[EARS-2] should apply default values for missing optional fields', async () => {
      const payload = {
        entityType: 'task' as const,
        entityId: '1752274500-task-test-task',
        title: 'Test Task Completion',
        description: 'Successfully completed the test task',
        triggeredBy: 'human:developer',
        reason: 'Task completed successfully'
      };

      const result = await createChangelogRecord(payload);

      expect(result).toEqual({
        id: '1752707800-changelog-task-test-task',
        entityType: 'task',
        entityId: '1752274500-task-test-task',
        changeType: 'completion',
        title: 'Test Task Completion',
        description: 'Successfully completed the test task',
        timestamp: expect.any(Number),
        trigger: 'manual',
        triggeredBy: 'human:developer',
        reason: 'Task completed successfully',
        riskLevel: 'low'
      });

      expect(mockGenerateChangelogId).toHaveBeenCalledWith('task', '1752274500-task-test-task', expect.any(Number));
    });

    it('[EARS-3] should preserve provided ID when specified', async () => {
      const payload = {
        id: '1752707900-changelog-task-custom-id',
        entityType: 'task' as const,
        entityId: '1752274500-task-test-task',
        changeType: 'completion' as const,
        title: 'Custom ID Test',
        description: 'Successfully completed the test task',
        triggeredBy: 'human:developer',
        reason: 'Custom test case'
      };

      const result = await createChangelogRecord(payload);

      expect(result.id).toBe('1752707900-changelog-task-custom-id');
      expect(mockGenerateChangelogId).not.toHaveBeenCalled();
    });

    it('[EARS-4] should generate ID from entityType and entityId when ID is not provided', async () => {
      const payload = {
        entityType: 'task' as const,
        entityId: '1752274500-task-implement-auth',
        changeType: 'completion' as const,
        title: 'Authentication Implementation Completed',
        description: 'Authentication system implemented successfully',
        triggeredBy: 'human:developer',
        reason: 'All auth requirements completed'
      };

      mockGenerateChangelogId.mockReturnValue('1752707800-changelog-task-implement-auth');

      const result = await createChangelogRecord(payload);

      expect(result.id).toBe('1752707800-changelog-task-implement-auth');
      expect(mockGenerateChangelogId).toHaveBeenCalledWith('task', '1752274500-task-implement-auth', expect.any(Number));
    });

    it('[EARS-5] should throw DetailedValidationError when validation fails', async () => {
      const payload = {
        entityType: 'task' as const,
        entityId: 'invalid-entity-id',
        changeType: 'completion' as const,
        title: 'Test',
        description: 'Test description',
        triggeredBy: 'human:developer',
        reason: 'Test reason'
      };

      const validationErrors = [
        { field: 'entityId', message: 'must match pattern', value: payload.entityId }
      ];

      mockValidateChangelogRecordDetailed.mockReturnValue({
        isValid: false,
        errors: validationErrors
      });

      await expect(createChangelogRecord(payload)).rejects.toThrow(DetailedValidationError);
      await expect(createChangelogRecord(payload)).rejects.toThrow('ChangelogRecord');
    });

    it('[EARS-6] should preserve all provided fields in the output', async () => {
      const payload = {
        id: '1752707900-changelog-task-preserve-fields',
        entityType: 'task' as const,
        entityId: '1752274500-task-test-task',
        changeType: 'update' as const,
        title: 'Task Update',
        description: 'Updating task configuration',
        timestamp: 1752707900,
        trigger: 'automated' as const,
        triggeredBy: 'agent:system',
        reason: 'Automated update process',
        riskLevel: 'medium' as const,
        files: ['src/updated.ts'],
        commits: ['xyz789'],
        usersAffected: 10
      };

      const result = await createChangelogRecord(payload);

      expect(result).toEqual(payload);
      expect(mockValidateChangelogRecordDetailed).toHaveBeenCalledWith(payload);
    });

    it('[EARS-7] should handle empty files array', async () => {
      const payload = {
        entityType: 'task' as const,
        entityId: '1752274500-task-test-task',
        changeType: 'completion' as const,
        title: 'Test Task Completion',
        description: 'Successfully completed the test task',
        triggeredBy: 'human:developer',
        reason: 'Task completed',
        files: []
      };

      const result = await createChangelogRecord(payload);

      expect(result.files).toEqual([]);
    });

    it('[EARS-8] should use current timestamp when none provided', async () => {
      const payload = {
        entityType: 'task' as const,
        entityId: '1752274500-task-test-task',
        changeType: 'completion' as const,
        title: 'Timestamp Test',
        description: 'Testing timestamp generation',
        triggeredBy: 'human:developer',
        reason: 'Testing timestamp functionality'
      };

      const beforeTime = Math.floor(Date.now() / 1000);
      await createChangelogRecord(payload);
      const afterTime = Math.floor(Date.now() / 1000);

      expect(mockGenerateChangelogId).toHaveBeenCalledWith(
        'task',
        '1752274500-task-test-task',
        expect.any(Number)
      );

      const calledTimestamp = mockGenerateChangelogId.mock.calls[0]![2];
      expect(calledTimestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(calledTimestamp).toBeLessThanOrEqual(afterTime);
    });

    describe('ChangelogRecord Specific Factory Operations (EARS 29-37)', () => {
      it('[EARS-29] should generate ID with timestamp-changelog-entityType-slug format', async () => {
        const payload = {
          entityType: 'task' as const,
          entityId: '1752274500-task-implement-feature',
          changeType: 'completion' as const,
          title: 'Feature Implementation Completed',
          description: 'Successfully implemented the requested feature',
          triggeredBy: 'human:developer',
          reason: 'All requirements completed'
        };

        mockGenerateChangelogId.mockReturnValue('1752707800-changelog-task-implement-feature');

        const result = await createChangelogRecord(payload);

        expect(result.id).toBe('1752707800-changelog-task-implement-feature');
        expect(mockGenerateChangelogId).toHaveBeenCalledWith('task', '1752274500-task-implement-feature', expect.any(Number));
      });

      it('[EARS-30] should use entityId directly for system entities', async () => {
        const payload = {
          entityType: 'system' as const,
          entityId: 'payment-gateway',
          changeType: 'hotfix' as const,
          title: 'Payment Gateway Hotfix',
          description: 'Fixed critical payment processing issue',
          triggeredBy: 'human:on-call',
          reason: 'Critical production issue'
        };

        mockGenerateChangelogId.mockReturnValue('1752707800-changelog-system-payment-gateway');

        const result = await createChangelogRecord(payload);

        expect(result.id).toBe('1752707800-changelog-system-payment-gateway');
        expect(mockGenerateChangelogId).toHaveBeenCalledWith('system', 'payment-gateway', expect.any(Number));
      });

      it('[EARS-31] should use entityId directly for configuration entities', async () => {
        const payload = {
          entityType: 'configuration' as const,
          entityId: 'database-config',
          changeType: 'update' as const,
          title: 'Database Configuration Update',
          description: 'Updated connection pool settings',
          triggeredBy: 'human:devops',
          reason: 'Performance optimization'
        };

        mockGenerateChangelogId.mockReturnValue('1752707800-changelog-configuration-database-config');

        const result = await createChangelogRecord(payload);

        expect(result.id).toBe('1752707800-changelog-configuration-database-config');
        expect(mockGenerateChangelogId).toHaveBeenCalledWith('configuration', 'database-config', expect.any(Number));
      });

      it('[EARS-32] should extract slug from timestamped entityId for task/cycle/agent', async () => {
        const testCases = [
          { entityType: 'task', entityId: '1752274500-task-implement-auth', expectedSlug: 'implement-auth' },
          { entityType: 'cycle', entityId: '1752300000-cycle-sprint-q4', expectedSlug: 'sprint-q4' },
          { entityType: 'agent', entityId: 'agent:cursor-assistant', expectedSlug: 'cursor-assistant' }
        ];

        for (const testCase of testCases) {
          const payload = {
            entityType: testCase.entityType as any,
            entityId: testCase.entityId,
            changeType: 'update' as const,
            title: `${testCase.entityType} Update`,
            description: `Updated ${testCase.entityType}`,
            triggeredBy: 'human:developer',
            reason: 'Regular update'
          };

          mockGenerateChangelogId.mockReturnValue(`1752707800-changelog-${testCase.entityType}-${testCase.expectedSlug}`);

          const result = await createChangelogRecord(payload);

          expect(result.id).toBe(`1752707800-changelog-${testCase.entityType}-${testCase.expectedSlug}`);
          expect(mockGenerateChangelogId).toHaveBeenCalledWith(testCase.entityType, testCase.entityId, expect.any(Number));
        }
      });

      it('[EARS-33] should apply sensible defaults for required fields', async () => {
        const payload = {
          entityType: 'task' as const,
          entityId: '1752274500-task-test-task',
          title: 'Test Changelog',
          description: 'Testing default values application',
          triggeredBy: 'human:developer',
          reason: 'Testing defaults'
        };

        const result = await createChangelogRecord(payload);

        expect(result.changeType).toBe('completion'); // Default
        expect(result.trigger).toBe('manual'); // Default
        expect(result.riskLevel).toBe('low'); // Default
        expect(result.timestamp).toEqual(expect.any(Number)); // Generated timestamp
      });

      it('[EARS-34] should preserve all provided optional fields', async () => {
        const payload = {
          entityType: 'task' as const,
          entityId: '1752274500-task-test-task',
          changeType: 'hotfix' as const,
          title: 'Critical Hotfix',
          description: 'Emergency fix for production issue',
          timestamp: 1752707900,
          trigger: 'emergency' as const,
          triggeredBy: 'human:on-call',
          reason: 'Production down',
          riskLevel: 'critical' as const,
          affectedSystems: ['api-gateway', 'auth-service'],
          usersAffected: 1000,
          downtime: 300,
          files: ['src/auth.ts', 'src/gateway.ts'],
          commits: ['abc123', 'def456'],
          rollbackInstructions: 'Revert commits and restart services',
          references: {
            tasks: ['1752274500-task-test-task'],
            executions: ['1752707800-exec-hotfix']
          }
        };

        const result = await createChangelogRecord(payload);

        // All optional fields should be preserved exactly
        expect(result.affectedSystems).toEqual(['api-gateway', 'auth-service']);
        expect(result.usersAffected).toBe(1000);
        expect(result.downtime).toBe(300);
        expect(result.files).toEqual(['src/auth.ts', 'src/gateway.ts']);
        expect(result.commits).toEqual(['abc123', 'def456']);
        expect(result.rollbackInstructions).toBe('Revert commits and restart services');
        expect(result.references).toEqual({
          tasks: ['1752274500-task-test-task'],
          executions: ['1752707800-exec-hotfix']
        });
      });

      it('[EARS-35] should throw DetailedValidationError for high riskLevel without rollbackInstructions', async () => {
        const validationErrors = [
          { field: 'root', message: 'rollbackInstructions is required when riskLevel is high', value: { riskLevel: 'high' } }
        ];

        mockValidateChangelogRecordDetailed.mockReturnValue({
          isValid: false,
          errors: validationErrors
        });

        const payload = {
          entityType: 'task' as const,
          entityId: '1752274500-task-test-task',
          changeType: 'update' as const,
          title: 'High Risk Update',
          description: 'Major system update with high risk',
          triggeredBy: 'human:developer',
          reason: 'System upgrade',
          riskLevel: 'high' as const
          // rollbackInstructions missing
        };

        await expect(createChangelogRecord(payload)).rejects.toThrow(DetailedValidationError);
      });

      it('[EARS-36] should throw DetailedValidationError for critical riskLevel without rollbackInstructions', async () => {
        const validationErrors = [
          { field: 'root', message: 'rollbackInstructions is required when riskLevel is critical', value: { riskLevel: 'critical' } }
        ];

        mockValidateChangelogRecordDetailed.mockReturnValue({
          isValid: false,
          errors: validationErrors
        });

        const payload = {
          entityType: 'system' as const,
          entityId: 'payment-gateway',
          changeType: 'hotfix' as const,
          title: 'Critical System Fix',
          description: 'Emergency fix for critical system failure',
          triggeredBy: 'human:on-call',
          reason: 'System down',
          riskLevel: 'critical' as const
          // rollbackInstructions missing
        };

        await expect(createChangelogRecord(payload)).rejects.toThrow(DetailedValidationError);
      });

      it('[EARS-37] should throw DetailedValidationError for completion changeType without references.tasks', async () => {
        const validationErrors = [
          { field: 'root', message: 'references.tasks is required when changeType is completion', value: { changeType: 'completion' } }
        ];

        mockValidateChangelogRecordDetailed.mockReturnValue({
          isValid: false,
          errors: validationErrors
        });

        const payload = {
          entityType: 'task' as const,
          entityId: '1752274500-task-test-task',
          changeType: 'completion' as const,
          title: 'Task Completion',
          description: 'Task has been completed',
          triggeredBy: 'human:developer',
          reason: 'All work finished'
          // references.tasks missing for completion
        };

        await expect(createChangelogRecord(payload)).rejects.toThrow(DetailedValidationError);
      });
    });
  });
});

