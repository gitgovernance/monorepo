import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Box, Text, useInput, useApp, useStdout } from 'ink';
import type { Records, MetricsAdapter, EventBus } from '@gitgov/core';
import clipboard from 'clipboardy';

// Import IndexerAdapter.EnrichedTaskRecord from IndexerAdapter
import type { IndexerAdapter } from '@gitgov/core';

// Task AI Prompt Template - Used when copying task to clipboard for AI agents
const TASK_AI_PROMPT_TEMPLATE = (taskId: string): string => {
  return `Hello @gitgov, please work on task ${taskId}

Use \`gitgov task show ${taskId}\` for full requirements and details.`;
};

// Modal dimension configuration
const MODAL_WIDTH_PERCENT = 0.8;  // 80% of terminal width
const MODAL_HEIGHT_PERCENT = 0.8; // 80% of terminal height

type ThemeName = 'dark' | 'light';

interface DashboardTheme {
  name: ThemeName;
  colors: {
    headerPrimary: string;
    headerSecondary: string;
    muted: string;
    controlPrimary: string;
    magenta: string;
    highlightBackground: string;
    highlightText: string;
  };
}

const THEMES: Record<ThemeName, DashboardTheme> = {
  dark: {
    name: 'dark',
    colors: {
      headerPrimary: '#00d4ff',
      headerSecondary: '#f4d35e',
      muted: '#a0a0a0',
      controlPrimary: '#0def1b',
      magenta: '#ff0883',
      highlightBackground: '#ff0883',
      highlightText: '#ffffff'
    }
  },
  light: {
    name: 'light',
    colors: {
      headerPrimary: '#005799',
      headerSecondary: '#c26b00',
      muted: '#555555',
      controlPrimary: '#0a8c1d',
      magenta: '#ff0883',
      highlightBackground: '#ff0883',
      highlightText: '#ffffff'
    }
  }
};

const resolveThemeName = (explicit?: ThemeName): ThemeName => {
  if (explicit && THEMES[explicit]) {
    return explicit;
  }

  const envTheme = process.env['GITGOV_THEME'] as ThemeName | undefined;
  if (envTheme && THEMES[envTheme]) {
    return envTheme;
  }

  const colorfgbg = process.env['COLORFGBG'];
  if (colorfgbg) {
    const segments = colorfgbg.split(';');
    const lastSegment = segments[segments.length - 1];
    if (lastSegment) {
      const bg = parseInt(lastSegment, 10);
      if (!Number.isNaN(bg) && bg >= 7) {
        return 'light';
      }
    }
  }

  return 'dark';
};

// Sort modes for dynamic task ordering
type SortMode = 'recent' | 'creation' | 'priority' | 'status';

interface DashboardIntelligence {
  systemHealth: MetricsAdapter.SystemStatus;
  productivityMetrics: MetricsAdapter.ProductivityMetrics;
  collaborationMetrics: MetricsAdapter.CollaborationMetrics;
  tasks: IndexerAdapter.EnrichedTaskRecord[];
  cycles: Records.CycleRecord[];
  feedback: Records.FeedbackRecord[];
  currentActor: Records.ActorRecord;
  activityHistory: EventBus.ActivityEvent[];
}

interface ViewConfig {
  name: string;
  layout: 'table' | 'columns' | 'sprint';
  columns?: Record<string, string[]>;
  theme: string;
}

interface Props {
  intelligence: DashboardIntelligence;
  viewConfig: ViewConfig;
  template: string;
  refreshInterval?: number;
  live?: boolean;
  onRefresh?: () => Promise<DashboardIntelligence>;
  themeName?: ThemeName;
}

// Utility: calculate visual width of string (handles emojis and special chars)
const getVisualWidth = (str: string): number => {
  // Replace all wide characters (emojis, symbols) with XX to simulate 2-width
  return str
    .replace(/[\u{1F000}-\u{1F9FF}]/gu, 'XX')  // Emoticons, symbols
    .replace(/[\u{2600}-\u{26FF}]/gu, 'XX')    // Miscellaneous symbols  
    .replace(/[\u{2700}-\u{27BF}]/gu, 'XX')    // Dingbats
    .replace(/[\u{23E9}-\u{23FA}]/gu, 'XX')    // Media control symbols
    .replace(/[\u{25A0}-\u{25FF}]/gu, 'XX')    // Geometric shapes
    .replace(/[\u{2190}-\u{21FF}]/gu, 'XX')    // Arrows
    .replace(/[\u{2000}-\u{206F}]/gu, 'XX')    // General punctuation
    .length;
};

// Utility: convert timestamp to relative time (3m, 1h, 2d)
const getRelativeTime = (timestamp: number): string => {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return 'now';
};

// Utility: adjust string to fixed VISUAL width (truncate and pad with spaces)
const fitToVisualWidth = (str: string, visualWidth: number): string => {
  if (!str) str = '';

  const currentVisualWidth = getVisualWidth(str);

  if (currentVisualWidth <= visualWidth) {
    // Pad with spaces to reach exact visual width
    const spacesToAdd = visualWidth - currentVisualWidth;
    return str + ' '.repeat(spacesToAdd);
  } else {
    // Truncate to fit visual width
    let truncated = str;
    while (getVisualWidth(truncated) > visualWidth - 1) {
      truncated = truncated.slice(0, -1);
    }
    return truncated + '…' + ' '.repeat(Math.max(0, visualWidth - getVisualWidth(truncated + '…')));
  }
};

/**
 * Main Dashboard TUI Component - CONVERGENCIA ÉPICA
 */
export const DashboardTUI: React.FC<Props> = ({
  intelligence: initialIntelligence,
  viewConfig,
  template,
  refreshInterval = 5,
  live = true,
  onRefresh,
  themeName = 'dark'
}) => {
  const resolvedThemeName = useMemo<ThemeName>(() => resolveThemeName(themeName), [themeName]);
  const theme = THEMES[resolvedThemeName];
  const { colors } = theme;
  const { exit } = useApp();
  const [currentView, setCurrentView] = useState(template);
  const [showHelp, setShowHelp] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [intelligence, setIntelligence] = useState(initialIntelligence);
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showTaskModal, setShowTaskModal] = useState(false); // NUEV
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Sort tasks dynamically based on current sort mode
  const sortTasks = useCallback((tasks: IndexerAdapter.EnrichedTaskRecord[]): IndexerAdapter.EnrichedTaskRecord[] => {
    switch (sortMode) {
      case 'recent':
        // Sort by last updated (most recent first) - DEFAULT
        return [...tasks].sort((a, b) => b.lastUpdated - a.lastUpdated);

      case 'creation':
        // Sort by creation date (newest first)
        return [...tasks].sort((a, b) => {
          const timestampA = extractTimestampFromId(a.id);
          const timestampB = extractTimestampFromId(b.id);
          return timestampB - timestampA;
        });

      case 'priority':
        // Sort by priority (critical → high → medium → low) and filter out completed tasks
        const priorityOrder = { 'critical': 4, 'high': 3, 'medium': 2, 'low': 1 };
        return [...tasks]
          .filter(task => !['done', 'archived', 'discarded'].includes(task.status))
          .sort((a, b) => {
            const priorityA = priorityOrder[a.priority as keyof typeof priorityOrder] || 0;
            const priorityB = priorityOrder[b.priority as keyof typeof priorityOrder] || 0;
            return priorityB - priorityA;
          });

      case 'status':
        // Sort by status (active → review → ready → draft → done → archived)
        const statusOrder = {
          'active': 6, 'review': 5, 'ready': 4,
          'draft': 3, 'done': 2, 'archived': 1, 'paused': 0
        };
        return [...tasks].sort((a, b) => {
          const statusA = statusOrder[a.status as keyof typeof statusOrder] || 0;
          const statusB = statusOrder[b.status as keyof typeof statusOrder] || 0;
          return statusB - statusA;
        });

      default:
        return tasks;
    }
  }, [sortMode]);

  // Keep a memoized sorted list so all views share the same ordering
  const sortedTasks = useMemo(() => sortTasks(intelligence.tasks), [intelligence.tasks, sortTasks]);

  const selectedIndex = useMemo(() => {
    if (!selectedTaskId) return -1;
    const idx = sortedTasks.findIndex((task) => task.id === selectedTaskId);
    return idx;
  }, [selectedTaskId, sortedTasks]);

  const ensureWithinBounds = useCallback((index: number): number => {
    if (sortedTasks.length === 0) {
      return -1;
    }
    if (index < 0) return 0;
    if (index >= sortedTasks.length) return sortedTasks.length - 1;
    return index;
  }, [sortedTasks]);

  const selectByIndex = useCallback((index: number) => {
    if (sortedTasks.length === 0) {
      setSelectedTaskId(null);
      return;
    }
    const bounded = ensureWithinBounds(index);
    if (bounded === -1) {
      setSelectedTaskId(null);
      return;
    }
    const task = sortedTasks[bounded];
    if (task) {
      setSelectedTaskId(task.id);
    }
  }, [sortedTasks, ensureWithinBounds]);

  const navigateDown = useCallback(() => {
    if (sortedTasks.length === 0) return;
    if (selectedIndex === -1) {
      selectByIndex(0);
      return;
    }
    selectByIndex(selectedIndex + 1);
  }, [sortedTasks, selectedIndex, selectByIndex]);

  const navigateUp = useCallback(() => {
    if (sortedTasks.length === 0) return;
    if (selectedIndex === -1) {
      selectByIndex(0);
      return;
    }
    selectByIndex(selectedIndex - 1);
  }, [sortedTasks, selectedIndex, selectByIndex]);

  const jumpToFirst = useCallback(() => {
    if (sortedTasks.length === 0) return;
    selectByIndex(0);
  }, [sortedTasks, selectByIndex]);

  const jumpToLast = useCallback(() => {
    if (sortedTasks.length === 0) return;
    selectByIndex(sortedTasks.length - 1);
  }, [sortedTasks, selectByIndex]);

  // Helper function to extract timestamp from ID
  function extractTimestampFromId(id: string): number {
    const parts = id.split('-');
    if (parts.length >= 1 && parts[0]) {
      const timestampPart = parts[0];
      const timestamp = parseInt(timestampPart, 10);
      if (!isNaN(timestamp) && timestamp > 1000000000) {
        return timestamp * 1000; // Convert to milliseconds
      }
    }
    return Date.now();
  }

  // Helper function to get sort mode display name
  const getSortModeDisplay = (mode: SortMode): string => {
    switch (mode) {
      case 'recent': return '🔥 Recent Activity';
      case 'creation': return '📅 Creation Date';
      case 'priority': return '🔴 Priority';
      case 'status': return '📊 Status';
      default: return 'Sort';
    }
  };

  // Auto-refresh REAL en live mode
  useEffect(() => {
    if (live && onRefresh) {
      const interval = setInterval(async () => {
        try {
          const newIntelligence = await onRefresh();
          setIntelligence(newIntelligence);
          setLastUpdate(new Date());
        } catch (error) {
          console.error('Error refreshing dashboard:', error);
        }
      }, refreshInterval * 1000);

      return () => clearInterval(interval);
    }
  }, [live, refreshInterval, onRefresh]);

  // Ensure selection stays valid when tasks change
  useEffect(() => {
    if (!sortedTasks.length) {
      if (selectedTaskId !== null) setSelectedTaskId(null);
      return;
    }

    if (selectedTaskId) {
      const exists = sortedTasks.some((task) => task.id === selectedTaskId);
      if (!exists) {
        setSelectedTaskId(null);
      }
    }
  }, [sortedTasks, selectedTaskId]);

  // Handle keyboard input
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      exit();
      return;
    }

    // Handle modal-specific keys
    if (showTaskModal) {
      if (key.escape || input === 'q') {
        setShowTaskModal(false);
        return;
      }
      // Ignore other keys when modal is open
      return;
    }

    // Handle delete modal - block ALL other keys
    if (showDeleteModal) {
      // Delete modal handles its own keys (y/n/ESC), ignore everything else here
      return;
    }

    // Handle Enter key to open task details modal
    if (key.return && selectedTaskId) {
      setShowTaskModal(true);
      return;
    }

    switch (input) {
      case 'q':
        exit();
        break;
      case '?':
        setShowHelp(!showHelp);
        break;
      case '1':
        setCurrentView('row-based');
        setLastUpdate(new Date());
        break;
      case '2':
        setCurrentView('kanban-4col');
        setLastUpdate(new Date());
        break;
      case '3':
        setCurrentView('kanban-7col');
        setLastUpdate(new Date());
        break;
      case '4':
        setCurrentView('scrum-board');
        setLastUpdate(new Date());
        break;
      case 'v':
        // CYCLING DE VISTAS: row-based → kanban-4col → kanban-7col → scrum-board → loop
        // "kanban-7col" and "scrum-board" are commented for a while
        const viewCycle = ['row-based', 'kanban-4col'] as const;
        const currentIndex = viewCycle.indexOf(currentView as any);
        const nextIndex = (currentIndex + 1) % viewCycle.length;
        const nextView = viewCycle[nextIndex];
        if (nextView) {
          setCurrentView(nextView);
          setLastUpdate(new Date());
        }
        break;
      case 'r':
        // Manual refresh
        if (onRefresh) {
          onRefresh().then((newIntelligence) => {
            setIntelligence(newIntelligence);
            setLastUpdate(new Date());
          }).catch((error) => {
            console.error('Error refreshing dashboard:', error);
          });
        } else {
          setLastUpdate(new Date());
        }
        break;
      case 's':
        // NUEVO - Cycle sort modes: recent -> creation -> priority -> status -> recent
        const sortModes: SortMode[] = ['recent', 'creation', 'priority', 'status'];
        const currentSortIndex = sortModes.indexOf(sortMode);
        const nextSortIndex = (currentSortIndex + 1) % sortModes.length;
        const nextSortMode = sortModes[nextSortIndex];
        if (nextSortMode) {
          setSortMode(nextSortMode);
        }
        setLastUpdate(new Date());
        break;
      case 'n':
        console.log('🎯 Use: gitgov task new');
        break;
      case 'a':
        console.log('🎯 Use: gitgov task assign <taskId> --to <actorId>');
        break;
      case 'e':
        console.log('🎯 Use: gitgov task edit <taskId>');
        break;
      case 'c':
        console.log('🎯 Use: gitgov cycle new');
        break;
      case 'd':
        if (selectedTaskId) {
          const selectedTask = sortedTasks.find(t => t.id === selectedTaskId);
          if (selectedTask) {
            if (selectedTask.status === 'draft') {
              // Task is draft, show confirmation modal
              setShowDeleteModal(true);
              setDeleteError(null);
            } else {
              // Task is not draft, show error modal
              const errorMsg = selectedTask.status === 'review'
                ? `Cannot delete task in '${selectedTask.status}' state. Use: gitgov task reject ${selectedTaskId}`
                : `Cannot delete task in '${selectedTask.status}' state. Use: gitgov task cancel ${selectedTaskId}`;
              setDeleteError(errorMsg);
              setShowDeleteModal(true);
            }
          }
        }
        break;
      case 'j':
        navigateDown();
        break;
      case 'k':
        navigateUp();
        break;
      case 'g':
        jumpToFirst();
        break;
      case 'G':
        jumpToLast();
        break;
    }

    if (key.downArrow) {
      navigateDown();
    } else if (key.upArrow) {
      navigateUp();
    }
  });

  // Get selected task for modal
  const selectedTask = useMemo(() => {
    if (!selectedTaskId) return null;
    return sortedTasks.find(task => task.id === selectedTaskId) || null;
  }, [selectedTaskId, sortedTasks]);

  // Show task detail modal
  if (showTaskModal && selectedTask) {
    return <TaskDetailModal task={selectedTask} theme={theme} onClose={() => setShowTaskModal(false)} />;
  }

  // Show delete confirmation/error modal
  if (showDeleteModal && selectedTask) {
    return <DeleteConfirmationModal
      task={selectedTask}
      error={deleteError}
      theme={theme}
      onConfirm={async () => {
        try {
          // Import DependencyInjectionService
          const { DependencyInjectionService } = await import('../../services/dependency-injection');
          const diService = DependencyInjectionService.getInstance();
          const backlogAdapter = await diService.getBacklogAdapter();
          const identityAdapter = await diService.getIdentityAdapter();
          const indexerAdapter = await diService.getIndexerAdapter();

          const currentActor = await identityAdapter.getCurrentActor();

          // Delete the task
          await backlogAdapter.deleteTask(selectedTask.id, currentActor.id);

          // Invalidate cache
          await indexerAdapter.invalidateCache();

          // Close modal and refresh
          setShowDeleteModal(false);
          setSelectedTaskId(null);

          // Refresh dashboard
          if (onRefresh) {
            const newIntelligence = await onRefresh();
            setIntelligence(newIntelligence);
            setLastUpdate(new Date());
          }
        } catch (error) {
          // Show error in modal
          setDeleteError(error instanceof Error ? error.message : String(error));
        }
      }}
      onClose={() => {
        setShowDeleteModal(false);
        setDeleteError(null);
      }}
    />;
  }

  if (showHelp) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color={colors.headerPrimary}>🎮 GitGovernance Dashboard - Interactive TUI</Text>
        <Text></Text>
        <Text bold color={colors.headerSecondary}>QUICK ACTIONS:</Text>
        <Text>  n: New task       a: Assign task    e: Edit task       d: Delete task</Text>
        <Text>  c: New cycle      r: Refresh data</Text>
        <Text></Text>
        <Text bold color={colors.headerSecondary}>NAVIGATION:</Text>
        <Text>  v: Cycle views    1: Row view       2: Kanban-4col     3: Kanban-7col    4: Scrum view</Text>
        <Text>  s: Sort tasks     ↑↓/j/k: Navigate  Enter: Task details</Text>
        <Text>  ?: Toggle help    q: Quit</Text>
        <Text></Text>
        <Text color={colors.muted}>Press ? again to return to dashboard</Text>
      </Box>
    );
  }

  // Determine view config based on current view
  let currentViewConfig = viewConfig;
  if (currentView !== template) {
    const viewConfigs: Record<string, ViewConfig> = {
      'row-based': { name: 'GitGovernancet', layout: 'table', theme: 'ai-native' },
      'kanban-4col': {
        name: 'Kanban Executive',
        layout: 'columns',
        columns: {
          'Draft': ['draft'],
          'In Progress': ['review', 'ready', 'active'],
          'Review': ['done'],
          'Done': ['archived']
        },
        theme: 'minimal'
      },
      'kanban-7col': {
        name: 'Kanban Developer',
        layout: 'columns',
        columns: {
          'Draft': ['draft'],
          'Review': ['review'],
          'Ready': ['ready'],
          'Active': ['active'],
          'Done': ['done'],
          'Archived': ['archived'],
          'Blocked': ['paused']
        },
        theme: 'corporate'
      },
      'scrum-board': {
        name: 'Scrum Sprint Board',
        layout: 'sprint',
        columns: {
          'Product Backlog': ['draft'],
          'Sprint Backlog': ['review', 'ready'],
          'In Progress': ['active'],
          'Done': ['done'],
          'Demo Ready': ['archived']
        },
        theme: 'scrum'
      }
    };
    currentViewConfig = viewConfigs[currentView] || viewConfig;
  }

  // Render based on current view
  if (currentView === 'kanban-4col' || currentView === 'kanban-7col') {
    return <KanbanView
      key={`${currentView}-${sortMode}`} // Force re-render when sortMode changes
      intelligence={intelligence}
      viewConfig={currentViewConfig}
      lastUpdate={lastUpdate}
      live={live}
      sortedTasks={sortedTasks}
      selectedTaskId={selectedTaskId}
      sortMode={sortMode}
      getSortModeDisplay={getSortModeDisplay}
      theme={theme}
    />;
  } else if (currentView === 'scrum-board') {
    return <ScrumView
      key={`${currentView}-${sortMode}`} // Force re-render when sortMode changes
      intelligence={intelligence}
      viewConfig={currentViewConfig}
      lastUpdate={lastUpdate}
      live={live}
      sortedTasks={sortedTasks}
      selectedTaskId={selectedTaskId}
      sortMode={sortMode}
      getSortModeDisplay={getSortModeDisplay}
      theme={theme}
    />;
  } else {
    return <RowView
      key={`${currentView}-${sortMode}`} // Force re-render when sortMode changes
      intelligence={intelligence}
      viewConfig={currentViewConfig}
      lastUpdate={lastUpdate}
      live={live}
      sortedTasks={sortedTasks}
      selectedIndex={selectedIndex}
      sortMode={sortMode}
      getSortModeDisplay={getSortModeDisplay}
      theme={theme}
    />;
  }
};

/**
 * Row-based view (original vision) - ESTILO DEFINITIVO
 */
const RowView: React.FC<{
  intelligence: DashboardIntelligence;
  viewConfig: ViewConfig;
  lastUpdate: Date;
  live?: boolean;
  sortedTasks: IndexerAdapter.EnrichedTaskRecord[];
  selectedIndex: number;
  sortMode: SortMode;
  getSortModeDisplay: (mode: SortMode) => string;
  theme: DashboardTheme;
}> = ({ intelligence, viewConfig, lastUpdate, live = false, sortedTasks, selectedIndex, sortMode, getSortModeDisplay, theme }) => {
  const { stdout } = useStdout();
  const columns = stdout?.columns ?? 80;
  const { colors } = theme;

  const getHealthIcon = (score: number): string => {
    if (score >= 80) return '🟢';
    if (score >= 60) return '🟡';
    return '🔴';
  };

  const getStatusIcon = (status: string): string => {
    const icons: Record<string, string> = {
      'draft': '📝', 'review': '👀', 'ready': '🟢', 'active': '⚡',
      'done': '✅', 'paused': '💤', 'archived': '📦'
    };
    return icons[status] || '❓';
  };

  const getPriorityFlag = (priority: string): string => {
    const flags: Record<string, string> = {
      'critical': '🔴', 'high': '🟡', 'medium': '🔵', 'low': '⚪'
    };
    return flags[priority] || '⚪';
  };

  /**
   * Get the appropriate actor to display based on sort mode
   * - 'recent': Shows lastModifier (most recent activity)
   * - 'creation': Shows author (who created the task)
   * - 'priority'/'status': Shows lastModifier (most recent activity)
   */
  const getActorForSortMode = (task: IndexerAdapter.EnrichedTaskRecord, mode: SortMode): string => {
    switch (mode) {
      case 'creation':
        // For creation date sort, show the author (creator)
        return task.relationships?.author?.actorId || task.relationships?.lastModifier?.actorId || '';
      case 'recent':
      case 'priority':
      case 'status':
      default:
        // For recent activity, priority, and status sorts, show lastModifier (most recent activity)
        return task.relationships?.lastModifier?.actorId || task.relationships?.author?.actorId || '';
    }
  };

  const columnWidths = {
    title: 0.40,
    status: 0.10,
    priority: 0.09,
    cycle: 0.12,
    actor: 0.15,
    activity: 0.08,
    health: 0.06
  };

  return (
    <Box flexDirection="column" padding={1} marginTop={0} marginBottom={0}>
      <Box borderStyle="round" borderColor="white" flexDirection="column">
        <Box flexDirection="row" paddingRight={1} justifyContent="space-between">
          <Text bold color={colors.headerPrimary}>🚀 GitGovernance │ Repo: solo-hub │ Org: GitGovernance │ Actor: {intelligence.currentActor.displayName}</Text>
          <Box flexDirection="row">
            <Text color={colors.headerSecondary}>[Sort: {getSortModeDisplay(sortMode)}] </Text>
            <Text color={colors.muted}>Last update: {lastUpdate.toLocaleTimeString()}</Text>
          </Box>
        </Box>

        <Text>{'─'.repeat(Math.max(columns, 0) - 4)}</Text>

        <Text>Health: {getHealthIcon(intelligence.systemHealth.health.overallScore)} {intelligence.systemHealth.health.overallScore}% │ Throughput: 📈 {intelligence.productivityMetrics.throughput}/w │ Lead Time: ⏱️ {intelligence.productivityMetrics.leadTime.toFixed(1)}d │ Tasks 7d: {intelligence.productivityMetrics.tasksCompleted7d} │ Agents: 🤖 {intelligence.collaborationMetrics.activeAgents}/{intelligence.collaborationMetrics.totalAgents}</Text>

        <Text>{'─'.repeat(Math.max(columns, 0) - 4)}</Text>

        <Text>Backlog Distribution: [ draft: {intelligence.systemHealth.tasks.byStatus['draft'] || 0} ({Math.round(((intelligence.systemHealth.tasks.byStatus['draft'] || 0) / intelligence.systemHealth.tasks.total) * 100)}%) | done: {intelligence.systemHealth.tasks.byStatus['done'] || 0} ({Math.round(((intelligence.systemHealth.tasks.byStatus['done'] || 0) / intelligence.systemHealth.tasks.total) * 100)}%) | paused: {intelligence.systemHealth.tasks.byStatus['paused'] || 0} ({Math.round(((intelligence.systemHealth.tasks.byStatus['paused'] || 0) / intelligence.systemHealth.tasks.total) * 100)}%) ]</Text>

        <Text>{'─'.repeat(Math.max(columns, 0) - 4)}</Text>

        <Box flexDirection="column">
          {(() => {
            return (
              <Box flexDirection="row">
                <Box width={`${columnWidths.title * 100}%`}><Text bold>TASK TITLE</Text></Box>
                <Box width={`${columnWidths.status * 100}%`}><Text bold>STATUS</Text></Box>
                <Box width={`${columnWidths.priority * 100}%`}><Text bold>PRIORITY</Text></Box>
                <Box width={`${columnWidths.cycle * 100}%`}><Text bold>CYCLE</Text></Box>
                <Box width={`${columnWidths.actor * 100}%`}><Text bold>ACTOR</Text></Box>
                <Box width={`${columnWidths.activity * 100}%`}><Text bold>TIME</Text></Box>
                <Box width={`${columnWidths.health * 100}%`}><Text bold>HEALTH</Text></Box>
              </Box>
            );
          })()}

          <Text>{'─'.repeat(Math.max(columns, 0) - 4)}</Text>

          {(() => {
            const MAX_VISIBLE = 10;
            const totalTasks = sortedTasks.length;
            const anchorIndex = selectedIndex === -1 ? 0 : selectedIndex;
            const maxStart = Math.max(totalTasks - MAX_VISIBLE, 0);
            const startIndex = Math.min(Math.max(anchorIndex - Math.floor(MAX_VISIBLE / 2), 0), maxStart);
            const visibleTasks = sortedTasks.slice(startIndex, startIndex + MAX_VISIBLE);

            const computedRemaining = sortedTasks.length - Math.min(sortedTasks.length, startIndex + MAX_VISIBLE);

            const rows = visibleTasks.map((task, index) => {
              // Ensure task and its properties are defined before proceeding
              if (!task || !task.status) {
                return null;
              }

              const statusDisplay = task.status;
              // Get actor based on current sort mode (author for creation, lastModifier for recent/priority/status)
              const actorId = getActorForSortMode(task, sortMode);
              const actorInfo = actorId ? actorId.replace('human:', '').replace('agent:', '') : '—';
              const pct = task.status === 'done' ? '100' : task.status === 'paused' ? '45' : '95';
              const globalIndex = startIndex + index;
              const isSelected = selectedIndex !== -1 && globalIndex === selectedIndex;

              // Create a single continuous text line for the entire row
              const titleText = `${getStatusIcon(task.status)} ${task.title}`;
              const priorityText = `${getPriorityFlag(task.priority)} ${task.priority}`;
              const cycleText = task.cycleIds?.[0]?.slice(-8) || "—";
              const progressText = `🟢 ${pct}%`;
              const activityText = task.lastUpdated ? getRelativeTime(task.lastUpdated) : '—';

              // Calculate new column widths based on terminal width
              const widths = {
                title: Math.floor(columns * columnWidths.title),
                status: Math.floor(columns * columnWidths.status),
                priority: Math.floor(columns * columnWidths.priority),
                cycle: Math.floor(columns * columnWidths.cycle),
                actor: Math.floor(columns * columnWidths.actor),
                activity: Math.floor(columns * columnWidths.activity),
                health: Math.floor(columns * columnWidths.health)
              };

              // Truncate each field to fit its width
              const titleFit = fitToVisualWidth(titleText, widths.title);
              const statusFit = fitToVisualWidth(statusDisplay, widths.status);
              const priorityFit = fitToVisualWidth(priorityText, widths.priority);
              const cycleFit = fitToVisualWidth(cycleText, widths.cycle);
              const actorFit = fitToVisualWidth(actorInfo, widths.actor);
              const activityFit = fitToVisualWidth(activityText, widths.activity);
              const healthFit = fitToVisualWidth(progressText, widths.health);

              // Combine all text into one continuous line
              const combinedText = titleFit + statusFit + priorityFit + cycleFit + actorFit + activityFit + healthFit;
              const maxWidth = Math.max(columns - 6, 80);
              const fullRowText = combinedText.slice(0, maxWidth);

              const textProps = isSelected ? { backgroundColor: colors.highlightBackground, color: colors.highlightText } : {};

              return (
                <Text key={task.id} {...textProps}>
                  {fullRowText}
                </Text>
              );
            });

            const moreIndicator = computedRemaining > 0
              ? <Text color={colors.muted}>... and {computedRemaining} more tasks</Text>
              : null;

            return (
              <>
                {rows}
                {moreIndicator}
              </>
            );
          })()}
        </Box>

        <Text>{'─'.repeat(Math.max(columns, 0) - 4)}</Text>

        <Text bold color={colors.headerSecondary}>⚡ SYSTEM ACTIVITY - BACKLOG</Text>

        <Text>{'─'.repeat(Math.max(columns, 0) - 4)}</Text>

        <Box flexDirection="column">
          {intelligence.activityHistory.slice(0, 7).map((activity, index) => {
            const timestamp = new Date(activity.timestamp * 1000);
            const timeStr = timestamp.toLocaleTimeString().slice(0, 5);
            const icon = activity.type === 'task_created' ? '📝' :
              activity.type === 'cycle_created' ? '🔄' :
                activity.type === 'feedback_created' ? '💬' :
                  activity.type === 'changelog_created' ? '📄' :
                    activity.type === 'execution_created' ? '🤖' :
                      activity.type === 'actor_created' ? '👤' : '📋';

            const actorDisplay = activity.actorId ? ` by ${activity.actorId.replace('human:', '').replace('agent:', '')}` : '';
            // Only task_created events have priority in metadata
            const priorityDisplay = activity.type === 'task_created' && activity.metadata?.priority ? ` (${activity.metadata.priority})` : '';

            return (
              <Text key={index}>
                [{timeStr}] {icon} {activity.type.toUpperCase().replace('_', ' ')}: {activity.entityTitle}{priorityDisplay}{actorDisplay}
              </Text>
            );
          })}
        </Box>

        <Text>{'─'.repeat(Math.max(columns, 0) - 4)}</Text>

        <Box flexDirection="row" marginRight={1}>
          <Text>💡 AI SUGGESTIONS: 2 stalled tasks need attention</Text>
          <Text>🚨 ALERTS: 1 urgent task blocked</Text>
        </Box>

        <Text>{'─'.repeat(Math.max(columns, 0) - 4)}</Text>

        <Box flexDirection="row" justifyContent="space-between" paddingRight={1}>
          <Text bold color={colors.controlPrimary}>n:New a:Assign e:Edit d:Delete c:Cycle v:View s:Sort r:Refresh ?:Help q:Quit</Text>
          <Text color={colors.muted}>(Live mode: {live ? '🟢 ON' : '🔴 OFF'})</Text>
        </Box>
      </Box>
    </Box>
  );
};

/**
 * Kanban view - ESTILO UNIFICADO COMO ROWVIEW
 */
const KanbanView: React.FC<{
  intelligence: DashboardIntelligence;
  viewConfig: ViewConfig;
  lastUpdate: Date;
  live?: boolean;
  sortedTasks: IndexerAdapter.EnrichedTaskRecord[];
  selectedTaskId: string | null;
  sortMode: SortMode;
  getSortModeDisplay: (mode: SortMode) => string;
  theme: DashboardTheme;
}> = ({ intelligence, viewConfig, lastUpdate, live = false, sortedTasks, selectedTaskId, sortMode, getSortModeDisplay, theme }) => {
  const { stdout } = useStdout();
  const columns = stdout?.columns ?? 80;
  const MAX_TASKS_PER_COLUMN = 10;
  const { colors } = theme;

  const getStatusIcon = (status: string): string => {
    const icons: Record<string, string> = {
      'draft': '📝', 'review': '👀', 'ready': '🟢', 'active': '⚡',
      'done': '✅', 'paused': '💤', 'archived': '📦'
    };
    return icons[status] || '❓';
  };

  const getHealthIcon = (score: number): string => {
    if (score >= 80) return '🟢';
    if (score >= 60) return '🟡';
    return '🔴';
  };

  // Organize tasks by columns
  const tasksByColumn: Record<string, IndexerAdapter.EnrichedTaskRecord[]> = {};
  if (viewConfig.columns) {
    for (const [columnName, statuses] of Object.entries(viewConfig.columns)) {
      tasksByColumn[columnName] = sortedTasks
        .filter(task => statuses.includes(task.status))
        .slice(0, MAX_TASKS_PER_COLUMN);
    }
  }

  const columnCount = viewConfig.columns ? Object.keys(viewConfig.columns).length : 1;
  const columnWidth = `${Math.floor(100 / columnCount)}%`;

  return (
    <Box flexDirection="column" padding={1} marginTop={0} marginBottom={0}>
      <Box borderStyle="round" borderColor="white" flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between" paddingRight={1}>
          <Text bold color={colors.headerPrimary}>🚀 {viewConfig.name} │ Repo: solo-hub │ Org: GitGovernance │ Actor: {intelligence.currentActor.displayName}</Text>
          <Box flexDirection="row">
            <Text color={colors.headerSecondary}>[Sort: {getSortModeDisplay(sortMode)}] </Text>
            <Text color={colors.muted}>Last update: {lastUpdate.toLocaleTimeString()}</Text>
          </Box>
        </Box>

        <Text>{'─'.repeat(Math.max(columns, 0) - 4)}</Text>

        <Text>Health: {getHealthIcon(intelligence.systemHealth.health.overallScore)} {intelligence.systemHealth.health.overallScore}% │ Throughput: 📈 {intelligence.productivityMetrics.throughput}/w │ Lead Time: ⏱️ {intelligence.productivityMetrics.leadTime.toFixed(1)}d │ Agents: 🤖 {intelligence.collaborationMetrics.activeAgents}/{intelligence.collaborationMetrics.totalAgents}</Text>

        <Text>{'─'.repeat(Math.max(columns, 0) - 4)}</Text>

        {/* Kanban Columns Header */}
        <Box flexDirection="row">
          {viewConfig.columns && Object.keys(viewConfig.columns).map((columnName) => (
            <Box key={columnName} width={columnWidth}>
              <Text bold color={colors.headerSecondary}>{columnName} ({tasksByColumn[columnName]?.length || 0})</Text>
            </Box>
          ))}
        </Box>

        <Text>{'─'.repeat(Math.max(columns, 0) - 4)}</Text>

        {/* Kanban Columns Content */}
        {Array.from({ length: MAX_TASKS_PER_COLUMN }, (_, rowIndex) => (
          <Box key={rowIndex} flexDirection="row">
            {viewConfig.columns && Object.keys(viewConfig.columns).map((columnName) => {
              const maxTextWidth = Math.floor(80 / Object.keys(viewConfig.columns!).length) - 3;
              const task = tasksByColumn[columnName]?.[rowIndex];
              return (
                <Box key={columnName} width={columnWidth}>
                  {task ? (
                    (() => {
                      const isSelected = selectedTaskId === task.id;
                      const textProps: Record<string, unknown> = {};
                      if (isSelected) {
                        textProps['backgroundColor'] = colors.highlightBackground;
                        textProps['color'] = colors.highlightText;
                      }
                      return (
                        <Text {...textProps}>
                          {getStatusIcon(task.status)} {task.title.slice(0, maxTextWidth)}
                        </Text>
                      );
                    })()
                  ) : (
                    <Text> </Text>
                  )}
                </Box>
              );
            })}
          </Box>
        ))}

        <Text>{'─'.repeat(Math.max(columns, 0) - 4)}</Text>

        <Text bold color={colors.headerSecondary}>📊 KANBAN FLOW INTELLIGENCE</Text>

        <Text>{'─'.repeat(Math.max(columns, 0) - 4)}</Text>

        {/* Kanban Intelligence */}
        <Box flexDirection="column">
          <Text>[{new Date().toLocaleTimeString().slice(0, 5)}] ⚡ BOTTLENECK DETECTED: Review column ({intelligence.systemHealth.tasks.byStatus['done'] || 0} tasks, avg 3.2d wait)</Text>
          <Text>[{new Date().toLocaleTimeString().slice(0, 5)}] 🚀 FLOW ACCELERATION: Active → Done (throughput: {intelligence.productivityMetrics.throughput}/w)</Text>
          <Text>[{new Date().toLocaleTimeString().slice(0, 5)}] ⚠️ WIP LIMIT WARNING: Draft column ({intelligence.systemHealth.tasks.byStatus['draft'] || 0} tasks {'>'}  recommended 5)</Text>
          <Text>[{new Date().toLocaleTimeString().slice(0, 5)}] 🔄 CYCLE TIME: {intelligence.productivityMetrics.cycleTime.toFixed(1)}d average (target: {'<'}3d)</Text>
          <Text>[{new Date().toLocaleTimeString().slice(0, 5)}] 📈 LEAD TIME: {intelligence.productivityMetrics.leadTime.toFixed(1)}d total pipeline</Text>
        </Box>

        <Text>{'─'.repeat(Math.max(columns, 0) - 4)}</Text>

        <Box flexDirection="row" justifyContent="space-between" paddingRight={1}>
          <Text bold color={colors.controlPrimary}>n:New s:Submit a:Assign e:Edit c:Cycle v:View r:Refresh ?:Help q:Quit</Text>
          <Text color={colors.muted}>(Live mode: {live ? '🟢 ON' : '🔴 OFF'})</Text>
        </Box>
      </Box>
    </Box>
  );
};

/**
 * Scrum view - ESTILO UNIFICADO COMO ROWVIEW
 */
const ScrumView: React.FC<{
  intelligence: DashboardIntelligence;
  viewConfig: ViewConfig;
  lastUpdate: Date;
  live?: boolean;
  sortedTasks: IndexerAdapter.EnrichedTaskRecord[];
  selectedTaskId: string | null;
  sortMode: SortMode;
  getSortModeDisplay: (mode: SortMode) => string;
  theme: DashboardTheme;
}> = ({ intelligence, viewConfig, lastUpdate, live = false, sortedTasks, selectedTaskId, sortMode, getSortModeDisplay, theme }) => {
  const { stdout } = useStdout();
  const columns = stdout?.columns ?? 80;
  const { colors } = theme;

  const getHealthIcon = (score: number): string => {
    if (score >= 80) return '🟢';
    if (score >= 60) return '🟡';
    return '🔴';
  };

  const getStatusIcon = (status: string): string => {
    const icons: Record<string, string> = {
      'draft': '📝', 'review': '👀', 'ready': '🟢', 'active': '⚡',
      'done': '✅', 'paused': '💤', 'archived': '📦'
    };
    return icons[status] || '❓';
  };

  const getPriorityFlag = (priority: string): string => {
    const flags: Record<string, string> = {
      'critical': '🔴', 'high': '🟡', 'medium': '🔵', 'low': '⚪'
    };
    return flags[priority] || '⚪';
  };

  // Calculate sprint progress
  const activeTasks = sortedTasks.filter(t => t.status === 'active').length;
  const doneTasks = sortedTasks.filter(t => t.status === 'done').length;
  const sprintProgress = Math.round((doneTasks / (activeTasks + doneTasks || 1)) * 100);

  // Organize tasks by scrum columns
  const tasksByColumn: Record<string, IndexerAdapter.EnrichedTaskRecord[]> = {};
  if (viewConfig.columns) {
    for (const [columnName, statuses] of Object.entries(viewConfig.columns)) {
      tasksByColumn[columnName] = sortedTasks.filter(task =>
        statuses.includes(task.status)
      ).slice(0, 3);
    }
  }

  return (
    <Box flexDirection="column" padding={1} marginTop={0} marginBottom={0}>
      <Box borderStyle="round" borderColor="white" flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between" paddingRight={1}>
          <Text bold color={colors.magenta}>🏃 {viewConfig.name} │ Sprint: Active │ Repo: solo-hub │ Actor: {intelligence.currentActor.displayName}</Text>
          <Box flexDirection="row">
            <Text color={colors.headerSecondary}>[Sort: {getSortModeDisplay(sortMode)}] </Text>
            <Text color={colors.muted}>Last update: {lastUpdate.toLocaleTimeString()}</Text>
          </Box>
        </Box>


        <Text>{'─'.repeat(Math.max(columns, 0) - 4)}</Text>

        <Text>🎯 Sprint Progress: {'▓'.repeat(Math.floor(sprintProgress / 10))}{'░'.repeat(10 - Math.floor(sprintProgress / 10))} {sprintProgress}% │ Velocity: {intelligence.productivityMetrics.throughput}/w │ Health: {getHealthIcon(intelligence.systemHealth.health.overallScore)} {intelligence.systemHealth.health.overallScore}%</Text>

        <Text>{'─'.repeat(Math.max(columns, 0) - 4)}</Text>

        {/* Scrum Columns Header */}
        <Box flexDirection="row">
          {viewConfig.columns && Object.keys(viewConfig.columns).map((columnName) => (
            <Box key={columnName} width={`${Math.floor(100 / Object.keys(viewConfig.columns!).length)}%`}>
              <Text bold color={colors.headerSecondary}>{columnName}</Text>
            </Box>
          ))}
        </Box>

        <Text>{'─'.repeat(Math.max(columns, 0) - 4)}</Text>

        {/* Scrum Columns Content */}
        {[0, 1, 2].map((rowIndex) => (
          <Box key={rowIndex} flexDirection="row">
            {viewConfig.columns && Object.keys(viewConfig.columns).map((columnName) => {
              const maxTextWidth = Math.floor(80 / Object.keys(viewConfig.columns!).length) - 3;
              const task = tasksByColumn[columnName]?.[rowIndex];
              return (
                <Box key={columnName} width={`${Math.floor(100 / Object.keys(viewConfig.columns!).length)}%`}>
                  {task ? (
                    (() => {
                      const isSelected = selectedTaskId === task.id;
                      const textProps: Record<string, unknown> = {};
                      if (isSelected) {
                        textProps['backgroundColor'] = '#ff0883';
                        textProps['color'] = '#ffffff';
                      }
                      return (
                        <Text {...textProps}>
                          {getStatusIcon(task.status)} {task.title.slice(0, maxTextWidth)} {getPriorityFlag(task.priority)}
                        </Text>
                      );
                    })()
                  ) : (
                    <Text> </Text>
                  )}
                </Box>
              );
            })}
          </Box>
        ))}

        <Text>{'─'.repeat(Math.max(columns, 0) - 4)}</Text>

        <Text bold color={colors.headerSecondary}>🏃 SPRINT INTELLIGENCE & CEREMONIES</Text>

        <Text>{'─'.repeat(Math.max(columns, 0) - 4)}</Text>

        {/* Scrum Intelligence */}
        <Box flexDirection="column">
          <Text>[{new Date().toLocaleTimeString().slice(0, 5)}] 🎯 SPRINT BURNDOWN: {doneTasks}/{doneTasks + activeTasks} story points completed ({sprintProgress}% done)</Text>
          <Text>[{new Date().toLocaleTimeString().slice(0, 5)}] ⚠️ VELOCITY ALERT: Current {intelligence.productivityMetrics.throughput}/w vs target 10/w ({intelligence.productivityMetrics.throughput >= 10 ? '+' : '-'}{Math.abs(intelligence.productivityMetrics.throughput - 10)}%)</Text>
          <Text>[{new Date().toLocaleTimeString().slice(0, 5)}] 🚨 IMPEDIMENT: {intelligence.systemHealth.health.blockedTasks} tasks blocked {'>'}24h (escalate to PO)</Text>
          <Text>[{new Date().toLocaleTimeString().slice(0, 5)}] 📅 CEREMONY DUE: Daily standup in 2h (last: yesterday 9AM)</Text>
          <Text>[{new Date().toLocaleTimeString().slice(0, 5)}] 🎉 SPRINT GOAL: Authentication epic {sprintProgress}% complete ({sprintProgress >= 80 ? 'ahead' : 'on track'})</Text>
        </Box>

        <Text>{'─'.repeat(Math.max(columns, 0) - 4)}</Text>

        <Box flexDirection="row" justifyContent="space-between" paddingRight={1}>
          <Text bold color={colors.controlPrimary}>n:New s:Submit a:Assign e:Edit c:Sprint v:View r:Refresh ?:Help q:Quit</Text>
          <Text color={colors.muted}>(Live mode: {live ? '🟢 ON' : '🔴 OFF'})</Text>
        </Box>
      </Box>
    </Box>
  );
};

/**
 * Simple Markdown Renderer for Terminal
 * Converts markdown to formatted Ink components
 */
const renderMarkdown = (markdown: string, width: number, colors: DashboardTheme['colors']): React.ReactElement[] => {
  if (!markdown) return [];

  const lines = markdown.split('\n');
  const elements: React.ReactElement[] = [];

  lines.forEach((line, index) => {
    // Headers (## Title)
    if (line.startsWith('## ')) {
      elements.push(<Text bold color={colors.headerSecondary}>  {line.slice(3)}</Text>);
    }
    // Headers (### Title)
    else if (line.startsWith('### ')) {
      elements.push(<Text bold color={colors.headerSecondary}>  {line.slice(4)}</Text>);
    }
    // Bold (**text**)
    else if (line.includes('**')) {
      const parts = line.split('**');
      const formatted = parts.map((part, i) => i % 2 === 1 ? <Text key={i} bold>{part}</Text> : part);
      elements.push(<Text color={colors.muted}>  {formatted}</Text>);
    }
    // Lists (- item or 1. item)
    else if (line.match(/^\s*[-*]\s/) || line.match(/^\s*\d+\.\s/)) {
      elements.push(<Text color={colors.muted}>  {line}</Text>);
    }
    // Code blocks (`)
    else if (line.includes('`')) {
      const formatted = line.replace(/`([^`]+)`/g, (_, code) => code);
      elements.push(<Text color={colors.controlPrimary}>  {formatted}</Text>);
    }
    // Empty lines
    else if (line.trim() === '') {
      elements.push(<Text> </Text>);
    }
    // Regular text
    else {
      // Wrap long lines
      if (line.length > width) {
        const words = line.split(' ');
        let currentLine = '';
        words.forEach(word => {
          if ((currentLine + ' ' + word).length <= width) {
            currentLine += (currentLine ? ' ' : '') + word;
          } else {
            if (currentLine) elements.push(<Text color={colors.muted}>  {currentLine}</Text>);
            currentLine = word;
          }
        });
        if (currentLine) elements.push(<Text color={colors.muted}>  {currentLine}</Text>);
      } else {
        elements.push(<Text color={colors.muted}>  {line}</Text>);
      }
    }
  });

  return elements;
};

/**
 * Task Detail Modal - Shows full task information
 */
const TaskDetailModal: React.FC<{
  task: IndexerAdapter.EnrichedTaskRecord;
  theme: DashboardTheme;
  onClose: () => void;
}> = ({ task, theme, onClose }) => {
  const { stdout } = useStdout();
  const columns = stdout?.columns ?? 80;
  const rows = stdout?.rows ?? 24;
  const { colors } = theme;
  const [copied, setCopied] = useState(false);
  const [scrollOffset, setScrollOffset] = useState(0);

  // Calculate modal dimensions based on terminal size
  // Ensure modalWidth doesn't exceed actual available space
  const maxModalWidth = columns - 6; // Leave margin for borders and padding
  const modalWidth = Math.min(Math.floor(columns * MODAL_WIDTH_PERCENT), maxModalWidth);
  const modalHeight = Math.floor(rows * MODAL_HEIGHT_PERCENT);
  // Account for: outer padding (4 chars) + double border (4 chars) + inner padding (4 chars) = 12 total
  const contentWidth = modalWidth - 12;
  const contentHeight = modalHeight - 8; // Account for borders, header, footer

  // Calculate max scroll early (needed for keyboard handlers)
  const maxModalHeightCalc = Math.floor(rows * MODAL_HEIGHT_PERCENT);
  const maxContentHeightCalc = maxModalHeightCalc - 6;

  // We'll calculate actual maxScroll later after building contentLines
  const maxScrollRef = React.useRef(0);

  // Handle keyboard input
  useInput((input, key) => {
    if (key.return && !copied) {
      // Copy AI prompt to clipboard
      const prompt = TASK_AI_PROMPT_TEMPLATE(task.id);
      clipboard.writeSync(prompt);
      setCopied(true);

      // Close modal after showing feedback briefly
      setTimeout(() => {
        onClose();
      }, 800);
      return;
    }

    // Handle scroll with arrow keys - now with proper bounds
    if (key.upArrow) {
      setScrollOffset(prev => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setScrollOffset(prev => Math.min(maxScrollRef.current, prev + 1));
    }
  });

  // Helper to wrap text to fit width (uses visual width for correct emoji/char handling)
  const wrapText = (text: string, width: number): string[] => {
    if (!text) return [];
    const lines: string[] = [];
    const words = text.split(' ');
    let currentLine = '';

    for (const word of words) {
      // Handle very long words (like IDs) by hard-wrapping them
      if (getVisualWidth(word) > width) {
        // Push current line if it exists
        if (currentLine) {
          lines.push(currentLine);
          currentLine = '';
        }
        // Break the long word into chunks
        let remainingWord = word;
        while (getVisualWidth(remainingWord) > width) {
          let chunk = '';
          for (let i = 0; i < remainingWord.length; i++) {
            const testChunk = remainingWord.slice(0, i + 1);
            if (getVisualWidth(testChunk) <= width) {
              chunk = testChunk;
            } else {
              break;
            }
          }
          if (chunk) {
            lines.push(chunk);
            remainingWord = remainingWord.slice(chunk.length);
          } else {
            // Edge case: even 1 char is too wide
            lines.push(remainingWord.slice(0, 1));
            remainingWord = remainingWord.slice(1);
          }
        }
        currentLine = remainingWord;
        continue;
      }

      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (getVisualWidth(testLine) <= width) {
        currentLine = testLine;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
  };

  const idLines = useMemo(() => wrapText(task.id, contentWidth - 2), [task.id, contentWidth]);
  const titleLines = useMemo(() => wrapText(task.title, contentWidth - 2), [task.title, contentWidth]);

  // Format cycle IDs to show only last part
  const cycleDisplay = task.cycleIds?.map(id => id.split('-').slice(-2).join('-')).join(', ') || 'None';

  // Build content lines array (each element = 1 visual line)
  const contentLines: React.ReactNode[] = [];

  contentLines.push(<Text key="id-label" color={colors.headerSecondary}>ID:</Text>);
  idLines.forEach((line, i) => {
    // Ensure line doesn't exceed contentWidth
    const safeLine = line.length > contentWidth ? line.slice(0, contentWidth - 1) + '…' : line;
    contentLines.push(<Text key={`id-value-${i}`} color={colors.muted}>{safeLine}</Text>);
  });
  contentLines.push(<Text key="space-1">{' '}</Text>);

  contentLines.push(<Text key="title-label" color={colors.headerSecondary}>Title:</Text>);
  titleLines.forEach((line, i) => {
    // Ensure line doesn't exceed contentWidth
    const safeLine = line.length > contentWidth ? line.slice(0, contentWidth - 1) + '…' : line;
    contentLines.push(<Text key={`title-value-${i}`} bold>{safeLine}</Text>);
  });
  contentLines.push(<Text key="space-2">{' '}</Text>);

  contentLines.push(
    <Box key="status-priority" flexDirection="row" gap={2}>
      <Text color={colors.headerSecondary}>Status: <Text color={colors.muted}>{task.status}</Text></Text>
      <Text color={colors.headerSecondary}>Priority: <Text color={colors.muted}>{task.priority}</Text></Text>
    </Box>
  );
  contentLines.push(<Text key="space-3">{' '}</Text>);

  if (task.tags && task.tags.length > 0) {
    contentLines.push(<Text key="tags-label" color={colors.headerSecondary}>Tags:</Text>);
    contentLines.push(<Text key="tags-value" color={colors.muted}>{task.tags.join(', ')}</Text>);
    contentLines.push(<Text key="space-4">{' '}</Text>);
  }

  contentLines.push(<Text key="cycles-label" color={colors.headerSecondary}>Cycles:</Text>);
  contentLines.push(<Text key="cycles-value" color={colors.muted}>{cycleDisplay}</Text>);
  contentLines.push(<Text key="space-5">{' '}</Text>);

  // Show author and lastModifier if available
  if (task.relationships?.author || task.relationships?.lastModifier) {
    contentLines.push(<Text key="authors-label" color={colors.headerSecondary}>Authors:</Text>);
    const authorInfo: string[] = [];
    if (task.relationships?.author) {
      const authorName = task.relationships.author.actorId.replace('human:', '').replace('agent:', '');
      const authorDate = new Date(task.relationships.author.timestamp * 1000).toLocaleDateString();
      authorInfo.push(`Created by ${authorName} on ${authorDate}`);
    }
    if (task.relationships?.lastModifier && task.relationships.lastModifier.actorId !== task.relationships?.author?.actorId) {
      const modifierName = task.relationships.lastModifier.actorId.replace('human:', '').replace('agent:', '');
      const modifierDate = new Date(task.relationships.lastModifier.timestamp * 1000).toLocaleDateString();
      authorInfo.push(`Last modified by ${modifierName} on ${modifierDate}`);
    } else if (task.relationships?.lastModifier) {
      const modifierName = task.relationships.lastModifier.actorId.replace('human:', '').replace('agent:', '');
      const modifierDate = new Date(task.relationships.lastModifier.timestamp * 1000).toLocaleDateString();
      authorInfo.push(`Last modified by ${modifierName} on ${modifierDate}`);
    }
    authorInfo.forEach((info, i) => {
      contentLines.push(<Text key={`author-${i}`} color={colors.muted}>  {info}</Text>);
    });
    contentLines.push(<Text key="space-authors">{' '}</Text>);
  }

  contentLines.push(<Text key="desc-label" color={colors.headerSecondary}>Description:</Text>);
  // Render description as formatted markdown
  renderMarkdown(task.description, contentWidth - 2, colors).forEach((element, i) => {
    contentLines.push(React.cloneElement(element, { key: `desc-${i}` }));
  });

  if (task.references && task.references.length > 0) {
    contentLines.push(<Text key="space-6">{' '}</Text>);
    contentLines.push(<Text key="ref-label" color={colors.headerSecondary}>References:</Text>);
    task.references.forEach((ref, i) => {
      contentLines.push(<Text key={`ref-${i}`} color={colors.muted}>  {ref}</Text>);
    });
  }

  if (task.notes) {
    contentLines.push(<Text key="space-7">{' '}</Text>);
    contentLines.push(<Text key="notes-label" color={colors.headerSecondary}>Notes:</Text>);
    // Render notes as formatted markdown
    renderMarkdown(task.notes, contentWidth - 2, colors).forEach((element, i) => {
      contentLines.push(React.cloneElement(element, { key: `note-${i}` }));
    });
  }

  // Calculate flexible height
  const totalContentLines = contentLines.length;
  const maxModalHeight = Math.floor(rows * MODAL_HEIGHT_PERCENT);
  const maxContentHeight = maxModalHeight - 6; // Reserve space for header/footer

  // Use actual content height if smaller than max, otherwise use max
  const displayHeight = Math.min(totalContentLines, maxContentHeight);
  const needsScrolling = totalContentLines > displayHeight;

  // Calculate scroll bounds
  const maxScroll = Math.max(0, totalContentLines - displayHeight);
  const clampedScrollOffset = Math.min(scrollOffset, maxScroll);

  // Update ref for keyboard handlers
  maxScrollRef.current = maxScroll;

  // Get visible lines
  const visibleLines = contentLines.slice(clampedScrollOffset, clampedScrollOffset + displayHeight);

  // Scroll indicators
  const hasContentAbove = needsScrolling && clampedScrollOffset > 0;
  const hasContentBelow = needsScrolling && clampedScrollOffset < maxScroll;

  return (
    <Box flexDirection="column" padding={1} justifyContent="center" alignItems="center">
      <Box borderStyle="double" borderColor={colors.headerPrimary} flexDirection="column" width={modalWidth} padding={1}>
        <Text bold color={colors.headerPrimary}>📋 Task Details {hasContentAbove && '▲'} {hasContentBelow && '▼'}</Text>
        <Text>{' '}</Text>

        <Box flexDirection="column" width={contentWidth} height={displayHeight} overflow="hidden">
          {visibleLines}
        </Box>

        <Text>{' '}</Text>
        {copied ? (
          <Text bold color={colors.controlPrimary}>✅ Prompt copied to clipboard!</Text>
        ) : (
          <Text dimColor>{needsScrolling ? '↑↓: Scroll | ' : ''}Enter: Copy AI prompt | ESC/q: Close</Text>
        )}
      </Box>
    </Box>
  );
};

/**
 * Delete Confirmation Modal - Confirms task deletion or shows error
 */
const DeleteConfirmationModal: React.FC<{
  task: IndexerAdapter.EnrichedTaskRecord;
  error: string | null;
  theme: DashboardTheme;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}> = ({ task, error, theme, onConfirm, onClose }) => {
  const { colors } = theme;
  const [isDeleting, setIsDeleting] = useState(false);

  useInput((input, key) => {
    if (isDeleting) return; // Ignore input while deleting

    // ESC always closes (both error and confirmation modes)
    if (key.escape) {
      onClose();
      return;
    }

    if (error) {
      // Error mode: only ESC closes (no other keys needed)
      return;
    }

    // Confirmation mode (task is draft)
    if (input === 'y' || input === 'Y') {
      setIsDeleting(true);
      onConfirm().catch(() => {
        setIsDeleting(false);
      });
    } else if (input === 'n' || input === 'N') {
      onClose();
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color={colors.headerPrimary}>
        {error ? '❌ Cannot Delete Task' : '🗑️  Confirm Task Deletion'}
      </Text>
      <Text>{' '}</Text>

      {error ? (
        // Error mode - cannot delete
        <>
          <Text color={colors.muted}>Task: <Text bold>{task.title}</Text></Text>
          <Text color={colors.muted}>Status: <Text bold color={colors.headerPrimary}>{task.status}</Text></Text>
          <Text>{' '}</Text>
          <Text color={colors.magenta}>{error}</Text>
          <Text>{' '}</Text>
          <Text dimColor>Press ESC to close</Text>
        </>
      ) : isDeleting ? (
        // Deleting in progress
        <>
          <Text color={colors.muted}>Deleting task <Text bold>{task.title}</Text>...</Text>
        </>
      ) : (
        // Confirmation mode
        <>
          <Text color={colors.muted}>Task: <Text bold>{task.title}</Text></Text>
          <Text color={colors.muted}>Status: <Text bold color={colors.controlPrimary}>{task.status}</Text></Text>
          <Text>{' '}</Text>
          <Text color={colors.headerPrimary}>⚠️  This action will permanently delete this draft task.</Text>
          <Text>{' '}</Text>
          <Text bold>Are you sure you want to delete this task?</Text>
          <Text>{' '}</Text>
          <Text dimColor>y: Yes, delete   n: No, cancel</Text>
        </>
      )}
    </Box>
  );
};

export default DashboardTUI;
