import { useState } from 'react';
import type { EntityType, Milestone, Task, Subtask } from '../types';

interface EntityFormProps {
  type: EntityType;
  initialData?: Partial<Milestone | Task | Subtask>;
  onSubmit: (data: {
    title: string;
    description?: string | null;
    importance?: number;
    tags?: string | null;
    dueDate?: string;
  }) => void;
  onCancel: () => void;
  onDelete?: () => void;
  isEditing?: boolean;
}

export function EntityForm({
  type,
  initialData,
  onSubmit,
  onCancel,
  onDelete,
  isEditing,
}: EntityFormProps) {
  const [title, setTitle] = useState(initialData?.title || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [importance, setImportance] = useState(initialData?.importance || 1);
  const [tags, setTags] = useState(
    'tags' in (initialData || {}) ? (initialData as Task | Subtask).tags || '' : ''
  );
  const [dueDate, setDueDate] = useState(
    initialData?.dueDate ? initialData.dueDate.split('T')[0] : ''
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const trimmedDesc = description.trim();
    const trimmedTags = tags.trim();

    onSubmit({
      title: title.trim(),
      // When editing, send null to clear fields; when creating, omit empty fields
      description: isEditing ? (trimmedDesc || null) : (trimmedDesc || undefined),
      importance,
      tags: type !== 'milestone'
        ? (isEditing ? (trimmedTags || null) : (trimmedTags || undefined))
        : undefined,
      dueDate: dueDate || undefined,
    });
  };

  const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Title
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-400 focus:border-transparent outline-none transition-all"
          placeholder={`Enter ${type} title...`}
          autoFocus
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-400 focus:border-transparent outline-none transition-all resize-none"
          rows={3}
          placeholder="Optional description..."
        />
      </div>

      {type !== 'milestone' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Tags
          </label>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-400 focus:border-transparent outline-none transition-all"
            placeholder="Comma-separated tags..."
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Importance
          </label>
          <select
            value={importance}
            onChange={(e) => setImportance(Number(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-400 focus:border-transparent outline-none transition-all"
          >
            <option value={1}>Low</option>
            <option value={2}>Medium</option>
            <option value={3}>High</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Due Date
          </label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-400 focus:border-transparent outline-none transition-all"
          />
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          className="flex-1 bg-sky-500 text-white py-2 px-4 rounded-lg hover:bg-sky-600 transition-colors font-medium"
        >
          {isEditing ? 'Save Changes' : `Create ${typeLabel}`}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
        >
          Cancel
        </button>
      </div>

      {isEditing && onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="w-full mt-2 py-2 px-4 text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm"
        >
          Delete {typeLabel}
        </button>
      )}
    </form>
  );
}
