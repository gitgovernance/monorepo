import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { DiagramGenerator } from '@gitgov/core';
import { findProjectRoot, getWorktreeBasePath } from '@gitgov/core/fs';
import { StatusBadge } from '../shared/StatusBadge';

interface DiagramDashboardProps {
  gitgovPath?: string;
  outputPath?: string;
  watchMode?: boolean;
  verbose?: boolean;
  quiet?: boolean;
  showArchived?: boolean;
  filterCycle?: string;
  filterTask?: string;
  filterPackage?: string;
}

export const DiagramDashboard: React.FC<DiagramDashboardProps> = ({
  gitgovPath = '.gitgov',
  outputPath = 'gitgov_content_map_diagram.md',
  watchMode = false,
  verbose = false,
  quiet = false,
  showArchived = false,
  filterCycle,
  filterTask,
  filterPackage,
}) => {
  const [status, setStatus] = useState<'idle' | 'generating' | 'watching' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');
  const [lastGenerated, setLastGenerated] = useState<string>('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [watcher, setWatcher] = useState<any>(null);
  const { exit } = useApp();

  useEffect(() => {
    const initialSetup = async () => {
      const root = findProjectRoot();
      if (!root) {
        setStatus('error');
        setMessage('❌ Error: Could not find project root. Make sure you are in a GitGovernance repository.');
        return;
      }

      if (watchMode) {
        startWatchMode();
      }
    };
    initialSetup();
  }, [watchMode]);

  const generator = new DiagramGenerator.DiagramGenerator({
    layout: 'LR',
    includeEpicTasks: true,
    maxDepth: 4,
    colorScheme: 'default',
    showAssignments: false,
  });

  const generateDiagram = async () => {
    try {
      setStatus('generating');
      setMessage('🔄 Generating workflow diagram...');
      setWarnings([]); // Clear previous warnings

      // Find project root and paths using core utilities
      const projectRoot = findProjectRoot();
      if (!projectRoot) throw new Error("Project root not found.");

      const actualGitgovPath = getWorktreeBasePath(projectRoot);
      const path = await import('path');
      const actualOutputPath = path.join(projectRoot, outputPath);

      // Capture console.warn to collect warnings
      const originalWarn = console.warn;
      const capturedWarnings: string[] = [];
      console.warn = (...args) => {
        capturedWarnings.push(args.join(' '));
        if (verbose) originalWarn(...args); // Still show in console if verbose
      };

      // Build filters object
      const filters: any = {};
      if (filterCycle) filters.cycleId = filterCycle;
      if (filterTask) filters.taskId = filterTask;
      if (filterPackage) filters.packageName = filterPackage;

      const diagramContent = await generator.generateFromFiles(actualGitgovPath, Object.keys(filters).length > 0 ? filters : undefined, showArchived || false);

      // Restore original console.warn
      console.warn = originalWarn;

      // Set warnings for display
      if (capturedWarnings.length > 0) {
        setWarnings(capturedWarnings);
      }

      if (!diagramContent.trim()) {
        setMessage('⚠️  No GitGovernance entities found in .gitgov/');
        setStatus('idle');
        return;
      }

      // Write to file at project root
      const fs = await import('fs');
      await fs.promises.writeFile(actualOutputPath, diagramContent, 'utf-8');

      const timestamp = new Date().toLocaleTimeString();
      setMessage(`✅ Diagram generated: ${actualOutputPath}`);
      setLastGenerated(timestamp);
      setStatus('idle');

      if (verbose && !quiet) {
        console.log(`📊 Diagram updated at ${timestamp}`);
      }

    } catch (error) {
      setMessage(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
      setStatus('error');
    }
  };

  const startWatchMode = async () => {
    if (watcher) {
      // Already watching
      setMessage('👀 Already in watch mode');
      return;
    }

    try {
      setStatus('watching');
      setMessage('👀 Starting watch mode...');

      const fs = await import('fs');
      const path = await import('path');
      const projectRoot = findProjectRoot();
      if (!projectRoot) throw new Error("Project root not found.");
      const gitgovDir = path.join(projectRoot, '.gitgov');

      let regenerateTimeout: NodeJS.Timeout | null = null;
      let isRegenerating = false;

      const debouncedRegenerate = (fileName: string) => {
        if (regenerateTimeout) {
          clearTimeout(regenerateTimeout);
        }

        regenerateTimeout = setTimeout(async () => {
          if (isRegenerating) {
            console.log('⏳ Already regenerating, skipping...');
            return;
          }

          console.log(`🔄 Starting regeneration for ${fileName}...`);
          isRegenerating = true;
          try {
            // Wait a bit more to ensure file is fully written
            await new Promise(resolve => setTimeout(resolve, 200));

            // Get paths
            const projectRoot = findProjectRoot();
            if (!projectRoot) throw new Error("Project root not found.");
            const actualGitgovPath = getWorktreeBasePath(projectRoot);
            const path = await import('path');

            console.log(`📖 About to regenerate after ${fileName} changed`);

            // Force a new generator instance to avoid caching issues
            const freshGenerator = new DiagramGenerator.DiagramGenerator({
              layout: 'LR',
              includeEpicTasks: true,
              maxDepth: 4,
              colorScheme: 'default',
              showAssignments: false,
            });

            const actualOutputPath = path.join(projectRoot, '.gitgov', outputPath);

            // Capture warnings in watch mode too
            const originalWarn = console.warn;
            const capturedWarnings: string[] = [];
            console.warn = (...args) => {
              capturedWarnings.push(args.join(' '));
              if (verbose) originalWarn(...args);
            };

            // Build filters object for watch mode
            const filters: any = {};
            if (filterCycle) filters.cycleId = filterCycle;
            if (filterTask) filters.taskId = filterTask;
            if (filterPackage) filters.packageName = filterPackage;

            const diagramContent = await freshGenerator.generateFromFiles(actualGitgovPath, Object.keys(filters).length > 0 ? filters : undefined);

            // Restore console.warn
            console.warn = originalWarn;

            // Update warnings
            if (capturedWarnings.length > 0) {
              setWarnings(capturedWarnings);
            } else {
              setWarnings([]);
            }

            const fs = await import('fs');
            await fs.promises.writeFile(actualOutputPath, diagramContent, 'utf-8');

            console.log(`✅ Regeneration complete for ${fileName}`);
            setMessage(`✅ Auto-regenerated after ${fileName} changed!`);
          } catch (error: unknown) {
            console.log(`❌ Regeneration failed for ${fileName}:`, error);
            setMessage(`❌ Auto-regen failed: ${error instanceof Error ? error.message : String(error)}`);
          } finally {
            isRegenerating = false;
          }
        }, 500);
      };

      // Watch multiple directories
      const watchDirs = ['tasks', 'cycles', 'executions', 'actors'];
      const watchers: any[] = [];

      for (const dir of watchDirs) {
        const dirPath = path.join(gitgovDir, dir);
        try {
          const dirWatcher = fs.watch(dirPath, { recursive: false }, (eventType, filename) => {
            if (filename && filename.endsWith('.json')) {
              console.log(`🔥 FS.WATCH DETECTED: ${filename} (${eventType})`);
              setMessage(`🔄 File changed: ${filename} - Regenerating...`);
              debouncedRegenerate(filename);
            }
          });
          watchers.push(dirWatcher);
        } catch (err) {
          console.log(`Could not watch ${dirPath}:`, err);
        }
      }

      setWatcher({ close: () => watchers.forEach(w => w.close()) });
      setMessage('👀 Watch mode active! Edit any .gitgov/*.json file to see auto-regeneration');

    } catch (error) {
      setMessage(`❌ Watch setup failed: ${error instanceof Error ? error.message : String(error)}`);
      setStatus('error');
    }
  };

  const stopWatchMode = () => {
    if (watcher) {
      watcher.close();
      setWatcher(null);
      setStatus('idle');
      setMessage('🛑 Watch mode stopped');
    }
  };

  useInput((input: string, key: any) => {
    if (input === 'q' || key.escape || (key.ctrl && input === 'c')) {
      // Clean shutdown: close watchers first, then exit gracefully
      if (watcher) {
        watcher.close();
      }
      exit(); // Use Ink's exit() instead of process.exit()
    } else if (input === 'g') {
      generateDiagram();
    } else if (input === 'w') {
      if (status === 'watching') {
        stopWatchMode();
      } else {
        startWatchMode();
      }
    }
  });

  useEffect(() => {
    // Cleanup effect to ensure watchers are closed on unmount
    return () => {
      if (watcher) {
        watcher.close();
      }
    };
  }, [watcher]);

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="blue">
        🎯 GitGovernance Diagram Generator
      </Text>

      {(filterCycle || filterTask || filterPackage) && (
        <Box marginTop={1} flexDirection="column">
          <Text color="cyan">🔍 Active Filters:</Text>
          {filterCycle && <Text color="cyan">  • Cycle: {filterCycle}</Text>}
          {filterTask && <Text color="cyan">  • Task: {filterTask}</Text>}
          {filterPackage && <Text color="cyan">  • Package: {filterPackage}</Text>}
        </Box>
      )}

      <Box marginTop={1}>
        <Text>Status: </Text>
        <StatusBadge status={status} />
      </Box>

      <Box marginTop={1}>
        <Text>{message}</Text>
      </Box>

      {lastGenerated && (
        <Box marginTop={1}>
          <Text color="gray">Last generated: {lastGenerated}</Text>
        </Box>
      )}

      {warnings.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text color="yellow">⚠️  Data Quality Warnings:</Text>
          {warnings.map((warning, index) => (
            <Text key={index} color="yellow">{warning}</Text>
          ))}
        </Box>
      )}

      <Box marginTop={1} flexDirection="column">
        <Text color="gray">Commands:</Text>
        <Text color="gray">  g - Generate diagram</Text>
        <Text color="gray">  w - {status === 'watching' ? 'Stop' : 'Start'} watch mode</Text>
        <Text color="gray">  q - Quit</Text>
      </Box>
    </Box>
  );
};
