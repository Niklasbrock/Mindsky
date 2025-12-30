import { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { EntityForm } from './EntityForm';
import type { EntityType } from '../types';

interface CreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultType?: EntityType;
  parentId?: string;
  parentType?: EntityType;
  onCreateMilestone: (data: { title: string; description?: string | null; importance?: number; dueDate?: string }) => Promise<void>;
  onCreateTask: (milestoneId: string, data: { title: string; description?: string | null; tags?: string | null; importance?: number; dueDate?: string }) => Promise<void>;
  onCreateSubtask: (taskId: string, data: { title: string; description?: string | null; tags?: string | null; importance?: number; dueDate?: string }) => Promise<void>;
}

export function CreateModal({
  isOpen,
  onClose,
  defaultType,
  parentId,
  parentType,
  onCreateMilestone,
  onCreateTask,
  onCreateSubtask,
}: CreateModalProps) {
  // Determine the correct type based on context
  const getDefaultType = (): EntityType => {
    if (parentType === 'milestone') return 'task';
    if (parentType === 'task') return 'subtask';
    return defaultType || 'milestone';
  };

  const [selectedType, setSelectedType] = useState<EntityType>(getDefaultType());

  // Update selectedType when parentType changes (modal opens with new context)
  useEffect(() => {
    if (isOpen) {
      setSelectedType(getDefaultType());
    }
  }, [isOpen, parentType, defaultType]);

  const handleSubmit = async (data: {
    title: string;
    description?: string | null;
    importance?: number;
    tags?: string | null;
    dueDate?: string;
  }) => {
    try {
      if (parentType === 'milestone' && parentId) {
        // Creating a task under a milestone
        await onCreateTask(parentId, data);
      } else if (parentType === 'task' && parentId) {
        // Creating a subtask under a task
        await onCreateSubtask(parentId, data);
      } else {
        // Creating a milestone (no parent)
        await onCreateMilestone(data);
      }
      onClose();
    } catch (error) {
      console.error('Failed to create:', error);
    }
  };

  const getTitle = () => {
    if (parentType === 'milestone') return 'New Task';
    if (parentType === 'task') return 'New Subtask';
    return 'New Milestone';
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={getTitle()}>
      <EntityForm
        type={selectedType}
        onSubmit={handleSubmit}
        onCancel={onClose}
      />
    </Modal>
  );
}
