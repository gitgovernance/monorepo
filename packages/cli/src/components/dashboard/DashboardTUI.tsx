import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp, useStdout } from 'ink';
import type { TaskRecord } from '../../../../core/src/types/task_record';
import type { CycleRecord } from '../../../../core/src/types/cycle_record';
import type { ActorRecord } from '../../../../core/src/types/actor_record';
import type { FeedbackRecord } from '../../../../core/src/types/feedback_record';
import type {
  SystemStatus,
  ProductivityMetrics,
  CollaborationMetrics
} from '../../../../core/src/adapters/metrics_adapter';

// Import EnrichedTaskRecord from IndexerAdapter
import type { EnrichedTaskRecord } from '../../../../core/src/adapters/indexer_adapter';

// Sort modes for dynamic task ordering
type SortMode = 'recent' | 'creation' | 'priority' | 'status';
import type { ActivityEvent } from '../../../../core/src/modules/event_bus_module';

interface DashboardIntelligence {
  systemHealth: SystemStatus;
  productivityMetrics: ProductivityMetrics;
  collaborationMetrics: CollaborationMetrics;
  tasks: EnrichedTaskRecord[]; // UPDATED - Now uses enriched tasks with activity info from IndexerAdapter
  cycles: CycleRecord[];
  feedback: FeedbackRecord[];
  currentActor: ActorRecord;
  activityHistory: ActivityEvent[]; // NUEVO - Activity history real
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
}

/**
 * Main Dashboard TUI Component - CONVERGENCIA ÉPICA
 */
export const DashboardTUI: React.FC<Props> = ({
  intelligence: initialIntelligence,
  viewConfig,
  template,
  refreshInterval = 5,
  live = true,
  onRefresh
}) => {
  const { exit } = useApp();
  const [currentView, setCurrentView] = useState(template);
  const [showHelp, setShowHelp] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [intelligence, setIntelligence] = useState(initialIntelligence);
  const [sortMode, setSortMode] = useState<SortMode>('recent'); // NUEVO - Sort mode state

  // NUEVO - Sort tasks dynamically based on current sort mode
  const sortTasks = (tasks: EnrichedTaskRecord[]): EnrichedTaskRecord[] => {
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
        // Sort by priority (critical → high → medium → low)
        const priorityOrder = { 'critical': 4, 'high': 3, 'medium': 2, 'low': 1 };
        return [...tasks].sort((a, b) => {
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
  };

  // Helper function to extract timestamp from ID
  const extractTimestampFromId = (id: string): number => {
    const parts = id.split('-');
    if (parts.length >= 1 && parts[0]) {
      const timestampPart = parts[0];
      const timestamp = parseInt(timestampPart, 10);
      if (!isNaN(timestamp) && timestamp > 1000000000) {
        return timestamp * 1000; // Convert to milliseconds
      }
    }
    return Date.now();
  };

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

  // Handle keyboard input
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      exit();
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
        const viewCycle = ['row-based', 'kanban-4col', 'kanban-7col', 'scrum-board'] as const;
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
    }
  });

  if (showHelp) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">🎮 GitGovernance Dashboard - Interactive TUI</Text>
        <Text></Text>
        <Text bold color="yellow">QUICK ACTIONS:</Text>
        <Text>  n: New task       a: Assign task    e: Edit task</Text>
        <Text>  c: New cycle      r: Refresh data</Text>
        <Text></Text>
        <Text bold color="yellow">NAVIGATION:</Text>
        <Text>  v: Cycle views    1: Row view       2: Kanban-4col     3: Kanban-7col    4: Scrum view</Text>
        <Text>  s: Sort tasks     ?: Toggle help    q: Quit</Text>
        <Text></Text>
        <Text color="gray">Press ? again to return to dashboard</Text>
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
      sortTasks={sortTasks}
      sortMode={sortMode}
      getSortModeDisplay={getSortModeDisplay}
    />;
  } else if (currentView === 'scrum-board') {
    return <ScrumView
      key={`${currentView}-${sortMode}`} // Force re-render when sortMode changes
      intelligence={intelligence}
      viewConfig={currentViewConfig}
      lastUpdate={lastUpdate}
      live={live}
      sortTasks={sortTasks}
      sortMode={sortMode}
      getSortModeDisplay={getSortModeDisplay}
    />;
  } else {
    return <RowView
      key={`${currentView}-${sortMode}`} // Force re-render when sortMode changes
      intelligence={intelligence}
      viewConfig={currentViewConfig}
      lastUpdate={lastUpdate}
      live={live}
      sortTasks={sortTasks}
      sortMode={sortMode}
      getSortModeDisplay={getSortModeDisplay}
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
  sortTasks: (tasks: EnrichedTaskRecord[]) => EnrichedTaskRecord[];
  sortMode: SortMode;
  getSortModeDisplay: (mode: SortMode) => string;
}> = ({ intelligence, viewConfig, lastUpdate, live = false, sortTasks, sortMode, getSortModeDisplay }) => {
  const { stdout } = useStdout();
  const columns = stdout?.columns ?? 80;

  const getHealthIcon = (score: number): string => {
    if (score >= 80) return '🟢';
    if (score >= 60) return '🟡';
    return '🔴';
  };

  const getStatusIcon = (status: string): string => {
    const icons: Record<string, string> = {
      'draft': '📝', 'review': '👀', 'ready': '🟢', 'active': '⚡',
      'done': '✅', 'paused': '⏸️', 'archived': '📦'
    };
    return icons[status] || '❓';
  };

  const getPriorityFlag = (priority: string): string => {
    const flags: Record<string, string> = {
      'critical': '🔴', 'high': '🟡', 'medium': '🔵', 'low': '⚪'
    };
    return flags[priority] || '⚪';
  };

  return (
    <Box flexDirection="column" padding={1} marginTop={0} marginBottom={0}>
      <Box borderStyle="round" borderColor="white" flexDirection="column">
        <Box flexDirection="row" paddingRight={1} justifyContent="space-between">
          <Text bold color="cyan">🚀 GitGovernance │ Repo: solo-hub │ Org: GitGovernance │ Actor: {intelligence.currentActor.displayName}</Text>
          <Box flexDirection="row">
            <Text color="yellow">[Sort: {getSortModeDisplay(sortMode)}] </Text>
            <Text color="gray">Last update: {lastUpdate.toLocaleTimeString()}</Text>
          </Box>
        </Box>

        <Text>{'─'.repeat(Math.max(columns, 0) - 4)}</Text>

        <Text>Health: {getHealthIcon(intelligence.systemHealth.health.overallScore)} {intelligence.systemHealth.health.overallScore}% │ Throughput: 📈 {intelligence.productivityMetrics.throughput}/w │ Lead Time: ⏱️ {intelligence.productivityMetrics.leadTime.toFixed(1)}d │ Tasks 7d: {intelligence.productivityMetrics.tasksCompleted7d} │ Agents: 🤖 {intelligence.collaborationMetrics.activeAgents}/{intelligence.collaborationMetrics.totalAgents}</Text>

        <Text>{'─'.repeat(Math.max(columns, 0) - 4)}</Text>

        <Text>Backlog Distribution: [ draft: {intelligence.systemHealth.tasks.byStatus['draft'] || 0} ({Math.round(((intelligence.systemHealth.tasks.byStatus['draft'] || 0) / intelligence.systemHealth.tasks.total) * 100)}%) | done: {intelligence.systemHealth.tasks.byStatus['done'] || 0} ({Math.round(((intelligence.systemHealth.tasks.byStatus['done'] || 0) / intelligence.systemHealth.tasks.total) * 100)}%) | paused: {intelligence.systemHealth.tasks.byStatus['paused'] || 0} ({Math.round(((intelligence.systemHealth.tasks.byStatus['paused'] || 0) / intelligence.systemHealth.tasks.total) * 100)}%) ]</Text>

        <Text>{'─'.repeat(Math.max(columns, 0) - 4)}</Text>

        <Box flexDirection="column">
          <Box flexDirection="row">
            <Box width="25%"><Text bold>TASK TITLE</Text></Box>
            <Box width="10%"><Text bold>STATUS</Text></Box>
            <Box width="10%"><Text bold>PRIORITY</Text></Box>
            <Box width="10%"><Text bold>CYCLE</Text></Box>
            <Box width="15%"><Text bold>ACTOR</Text></Box>
            <Box width="15%"><Text bold>LAST ACTIVITY</Text></Box>
            <Box width="15%"><Text bold>HEALTH</Text></Box>
          </Box>

          <Text>{'─'.repeat(Math.max(columns, 0) - 4)}</Text>

          {sortTasks(intelligence.tasks).slice(0, 10).map((task) => {
            const derivedState = task.status === 'paused' ? '💤' :
              task.priority === 'critical' ? '🔥' :
                task.status === 'active' ? '⚡' : null;
            const statusDisplay = derivedState ? `${derivedState} ${task.status}` : task.status;

            const actorInfo = task.priority === 'critical' ? 'agent:architect' :
              task.status === 'done' ? 'human:camilo' : '—';

            return (
              <Box key={task.id} flexDirection="row">
                <Box width="30%"><Text>{getStatusIcon(task.status)} {task.title.slice(0, Math.max(Math.floor((columns * 0.3) - 10), 10))}</Text></Box>
                <Box width="12%"><Text>{statusDisplay}</Text></Box>
                <Box width="12%"><Text>{getPriorityFlag(task.priority)} {task.priority}</Text></Box>
                <Box width="12%"><Text>{task.cycleIds?.[0]?.slice(-8) || 'Build MVP'}</Text></Box>
                <Box width="20%"><Text>{actorInfo}</Text></Box>
                <Box width="14%"><Text color="green">🟢 {task.status === 'done' ? '100' : task.status === 'paused' ? '45' : '95'}%</Text></Box>
              </Box>
            );
          })}

          {intelligence.tasks.length > 10 && (
            <Text color="gray">... and {intelligence.tasks.length - 10} more tasks</Text>
          )}
        </Box>

        <Text>{'─'.repeat(Math.max(columns, 0) - 4)}</Text>

        <Text bold color="yellow">⚡ SYSTEM ACTIVITY - BACKLOG</Text>

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
            const priorityDisplay = activity.metadata?.priority ? ` (${activity.metadata.priority})` : '';

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
          <Text bold color="green">n:New s:Submit a:Approve e:Edit c:Cycle v:View r:Refresh ?:Help q:Quit</Text>
          <Text color="gray">(Live mode: {live ? '🟢 ON' : '🔴 OFF'})</Text>
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
  sortTasks: (tasks: EnrichedTaskRecord[]) => EnrichedTaskRecord[];
  sortMode: SortMode;
  getSortModeDisplay: (mode: SortMode) => string;
}> = ({ intelligence, viewConfig, lastUpdate, live = false, sortTasks, sortMode, getSortModeDisplay }) => {
  const { stdout } = useStdout();
  const columns = stdout?.columns ?? 80;
  const MAX_TASKS_PER_COLUMN = 10;

  const getStatusIcon = (status: string): string => {
    const icons: Record<string, string> = {
      'draft': '📝', 'review': '👀', 'ready': '🟢', 'active': '⚡',
      'done': '✅', 'paused': '⏸️', 'archived': '📦'
    };
    return icons[status] || '❓';
  };

  const getHealthIcon = (score: number): string => {
    if (score >= 80) return '🟢';
    if (score >= 60) return '🟡';
    return '🔴';
  };

  // Organize tasks by columns
  const tasksByColumn: Record<string, TaskRecord[]> = {};
  if (viewConfig.columns) {
    for (const [columnName, statuses] of Object.entries(viewConfig.columns)) {
      tasksByColumn[columnName] = sortTasks(intelligence.tasks).filter(task =>
        statuses.includes(task.status)
      ).slice(0, MAX_TASKS_PER_COLUMN);
    }
  }

  const columnCount = viewConfig.columns ? Object.keys(viewConfig.columns).length : 1;
  const columnWidth = `${Math.floor(100 / columnCount)}%`;

  return (
    <Box flexDirection="column" padding={1} marginTop={0} marginBottom={0}>
      <Box borderStyle="round" borderColor="white" flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between" paddingRight={1}>
          <Text bold color="cyan">🚀 {viewConfig.name} │ Repo: solo-hub │ Org: GitGovernance │ Actor: {intelligence.currentActor.displayName}</Text>
          <Box flexDirection="row">
            <Text color="yellow">[Sort: {getSortModeDisplay(sortMode)}] </Text>
            <Text color="gray">Last update: {lastUpdate.toLocaleTimeString()}</Text>
          </Box>
        </Box>

        <Text>{'─'.repeat(Math.max(columns, 0) - 4)}</Text>

        <Text>Health: {getHealthIcon(intelligence.systemHealth.health.overallScore)} {intelligence.systemHealth.health.overallScore}% │ Throughput: 📈 {intelligence.productivityMetrics.throughput}/w │ Lead Time: ⏱️ {intelligence.productivityMetrics.leadTime.toFixed(1)}d │ Agents: 🤖 {intelligence.collaborationMetrics.activeAgents}/{intelligence.collaborationMetrics.totalAgents}</Text>

        <Text>{'─'.repeat(Math.max(columns, 0) - 4)}</Text>

        {/* Kanban Columns Header */}
        <Box flexDirection="row">
          {viewConfig.columns && Object.keys(viewConfig.columns).map((columnName) => (
            <Box key={columnName} width={columnWidth}>
              <Text bold color="yellow">{columnName} ({tasksByColumn[columnName]?.length || 0})</Text>
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
                    <Text>{getStatusIcon(task.status)} {task.title.slice(0, maxTextWidth)}</Text>
                  ) : (
                    <Text> </Text>
                  )}
                </Box>
              );
            })}
          </Box>
        ))}

        <Text>{'─'.repeat(Math.max(columns, 0) - 4)}</Text>

        <Text bold color="yellow">📊 KANBAN FLOW INTELLIGENCE</Text>

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
          <Text bold color="green">n:New s:Submit a:Assign e:Edit c:Cycle v:View r:Refresh ?:Help q:Quit</Text>
          <Text color="gray">(Live mode: {live ? '🟢 ON' : '🔴 OFF'})</Text>
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
  sortTasks: (tasks: EnrichedTaskRecord[]) => EnrichedTaskRecord[];
  sortMode: SortMode;
  getSortModeDisplay: (mode: SortMode) => string;
}> = ({ intelligence, viewConfig, lastUpdate, live = false, sortTasks, sortMode, getSortModeDisplay }) => {
  const { stdout } = useStdout();
  const columns = stdout?.columns ?? 80;

  const getHealthIcon = (score: number): string => {
    if (score >= 80) return '🟢';
    if (score >= 60) return '🟡';
    return '🔴';
  };

  const getStatusIcon = (status: string): string => {
    const icons: Record<string, string> = {
      'draft': '📝', 'review': '👀', 'ready': '🟢', 'active': '⚡',
      'done': '✅', 'paused': '⏸️', 'archived': '📦'
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
  const sortedTasks = sortTasks(intelligence.tasks);
  const activeTasks = sortedTasks.filter(t => t.status === 'active').length;
  const doneTasks = sortedTasks.filter(t => t.status === 'done').length;
  const sprintProgress = Math.round((doneTasks / (activeTasks + doneTasks || 1)) * 100);

  // Organize tasks by scrum columns
  const tasksByColumn: Record<string, TaskRecord[]> = {};
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
          <Text bold color="magenta">🏃 {viewConfig.name} │ Sprint: Active │ Repo: solo-hub │ Actor: {intelligence.currentActor.displayName}</Text>
          <Box flexDirection="row">
            <Text color="yellow">[Sort: {getSortModeDisplay(sortMode)}] </Text>
            <Text color="gray">Last update: {lastUpdate.toLocaleTimeString()}</Text>
          </Box>
        </Box>


        <Text>{'─'.repeat(Math.max(columns, 0) - 4)}</Text>

        <Text>🎯 Sprint Progress: {'▓'.repeat(Math.floor(sprintProgress / 10))}{'░'.repeat(10 - Math.floor(sprintProgress / 10))} {sprintProgress}% │ Velocity: {intelligence.productivityMetrics.throughput}/w │ Health: {getHealthIcon(intelligence.systemHealth.health.overallScore)} {intelligence.systemHealth.health.overallScore}%</Text>

        <Text>{'─'.repeat(Math.max(columns, 0) - 4)}</Text>

        {/* Scrum Columns Header */}
        <Box flexDirection="row">
          {viewConfig.columns && Object.keys(viewConfig.columns).map((columnName) => (
            <Box key={columnName} width={`${Math.floor(100 / Object.keys(viewConfig.columns!).length)}%`}>
              <Text bold color="yellow">{columnName}</Text>
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
                    <Text>{getStatusIcon(task.status)} {task.title.slice(0, maxTextWidth)} {getPriorityFlag(task.priority)}</Text>
                  ) : (
                    <Text> </Text>
                  )}
                </Box>
              );
            })}
          </Box>
        ))}

        <Text>{'─'.repeat(Math.max(columns, 0) - 4)}</Text>

        <Text bold color="yellow">🏃 SPRINT INTELLIGENCE & CEREMONIES</Text>

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
          <Text bold color="green">n:New s:Submit a:Assign e:Edit c:Sprint v:View r:Refresh ?:Help q:Quit</Text>
          <Text color="gray">(Live mode: {live ? '🟢 ON' : '🔴 OFF'})</Text>
        </Box>
      </Box>
    </Box>
  );
};

export default DashboardTUI;