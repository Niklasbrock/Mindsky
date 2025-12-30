import { Modal } from './Modal';
import { EntityForm } from './EntityForm';
import type { CloudNode } from '../types';

interface EditModalProps {
  isOpen: boolean;
  onClose: () => void;
  node: CloudNode | null;
  onUpdate: (id: string, type: CloudNode['type'], data: {
    title: string;
    description?: string | null;
    importance?: number;
    tags?: string | null;
    dueDate?: string;
  }) => Promise<void>;
  onDelete: (id: string, type: CloudNode['type']) => Promise<void>;
  onComplete?: (id: string, type: 'task' | 'subtask') => Promise<void>;
  onUncomplete?: (id: string, type: 'task' | 'subtask') => Promise<void>;
}

export function EditModal({
  isOpen,
  onClose,
  node,
  onUpdate,
  onDelete,
  onComplete,
  onUncomplete,
}: EditModalProps) {
  if (!node) return null;

  const entity = node.entity;
  const isCompleted = 'completed' in entity && entity.completed;
  const canComplete = node.type === 'task' || node.type === 'subtask';

  const handleSubmit = async (data: {
    title: string;
    description?: string | null;
    importance?: number;
    tags?: string | null;
    dueDate?: string;
  }) => {
    await onUpdate(node.id, node.type, data);
    onClose();
  };

  const handleDelete = async () => {
    if (confirm(`Are you sure you want to delete this ${node.type}?`)) {
      await onDelete(node.id, node.type);
      onClose();
    }
  };

  const handleToggleComplete = async () => {
    if (node.type === 'task' || node.type === 'subtask') {
      if (isCompleted && onUncomplete) {
        await onUncomplete(node.id, node.type);
      } else if (!isCompleted && onComplete) {
        await onComplete(node.id, node.type);
      }
      onClose();
    }
  };

  const typeLabel = node.type.charAt(0).toUpperCase() + node.type.slice(1);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Edit ${typeLabel}`}>
      {canComplete && (
        <button
          onClick={handleToggleComplete}
          className={`w-full mb-4 py-3 px-4 rounded-lg font-medium transition-colors ${
            isCompleted
              ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
              : 'bg-green-100 text-green-700 hover:bg-green-200'
          }`}
        >
          {isCompleted ? 'Mark as Incomplete' : 'Mark as Complete'}
        </button>
      )}

      <EntityForm
        type={node.type}
        initialData={entity}
        onSubmit={handleSubmit}
        onCancel={onClose}
        onDelete={handleDelete}
        isEditing
      />
    </Modal>
  );
}
