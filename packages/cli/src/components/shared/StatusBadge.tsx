import React from 'react';
import { Text } from 'ink';

interface StatusBadgeProps {
  status: string;
  type?: 'cycle' | 'task' | 'epic-task';
}

/**
 * Reusable status badge component following GitGovernance color system
 */
export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, type }) => {
  const getStatusColor = (status: string, type?: string): string => {
    // Special case: Epic task paused (waiting for parent cycle)
    if (status === 'paused' && type === 'epic-task') {
      return 'magenta'; // Purple - not a real blockage
    }

    // Handle cycle statuses
    if (type === 'cycle') {
      const cycleColorMap: Record<string, string> = {
        'planning': 'white',     // White - being planned
        'active': 'blue',        // Blue - sprint/milestone running
        'completed': 'green',    // Green - all tasks finished
        'archived': 'gray',      // Gray - historical record
      };
      return cycleColorMap[status] || 'white';
    }

    // Handle task statuses
    const taskColorMap: Record<string, string> = {
      // Completed states - Green
      'done': 'green',
      'validated': 'green',

      // Active states - Blue
      'active': 'blue',
      'in-progress': 'blue',

      // Ready states - Yellow
      'ready': 'yellow',
      'pending': 'yellow',

      // Preparation states - White
      'draft': 'white',
      'review': 'white',

      // Real blockages - Red
      'blocked': 'red',
      'paused': 'red',
      'cancelled': 'red',
      'discarded': 'red',

      // Archived states - Gray
      'archived': 'gray',
    };

    return taskColorMap[status] || 'white';
  };

  const getStatusIcon = (status: string, type?: string): string => {
    if (status === 'paused' && type === 'epic-task') return '📦';

    const iconMap: Record<string, string> = {
      'done': '✅',
      'completed': '✅',
      'validated': '✅',
      'active': '🔄',
      'in-progress': '🔄',
      'ready': '⏳',
      'pending': '⏳',
      'draft': '📝',
      'review': '📝',
      'planning': '📝',
      'blocked': '🚫',
      'paused': '⏸️',
      'cancelled': '❌',
      'discarded': '🗑️',
      'archived': '📦',
    };

    return iconMap[status] || '📋';
  };

  const color = getStatusColor(status, type);
  const icon = getStatusIcon(status, type);

  return (
    <Text color={color}>
      {icon} {status.toUpperCase()}
    </Text>
  );
};
