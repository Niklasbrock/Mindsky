import { useState, useCallback } from 'react';
import type { CloudNode, EntityType } from '../types';

interface CreateContext {
  parentId?: string;
  parentType?: EntityType;
}

interface ConfirmationModal {
  isOpen: boolean;
  type: 'delete' | 'reset';
  entityId: string;
  entityType: string;
}

interface ModalState {
  /** Whether create modal is open */
  createModalOpen: boolean;
  /** Whether edit modal is open */
  editModalOpen: boolean;
  /** Whether settings panel is open */
  settingsOpen: boolean;
  /** Whether list view panel is open */
  listViewOpen: boolean;
  /** Width of list view panel (desktop only) */
  listViewWidth: number;
  /** Context for creating child entities */
  createContext: CreateContext;
  /** Node currently being edited */
  selectedNode: CloudNode | null;
  /** Confirmation modal state */
  confirmationModal: ConfirmationModal;
}

interface UseModalStateResult extends ModalState {
  /** Open create modal with optional parent context */
  openCreateModal: (context?: CreateContext) => void;
  /** Close create modal and clear context */
  closeCreateModal: () => void;
  /** Open edit modal for a specific node */
  openEditModal: (node: CloudNode) => void;
  /** Close edit modal and clear selection */
  closeEditModal: () => void;
  /** Open settings panel */
  openSettings: () => void;
  /** Close settings panel */
  closeSettings: () => void;
  /** Open list view panel */
  openListView: () => void;
  /** Close list view panel */
  closeListView: () => void;
  /** Toggle list view panel */
  toggleListView: () => void;
  /** Set list view panel width */
  setListViewWidth: (width: number) => void;
  /** Open confirmation modal */
  openConfirmation: (type: ConfirmationModal['type'], entityId: string, entityType: string) => void;
  /** Close confirmation modal */
  closeConfirmation: () => void;
  /** Check if any modal is open (useful for keyboard handling) */
  isAnyModalOpen: boolean;
}

/**
 * Hook for managing modal/panel open states across the application
 * Centralizes create modal, edit modal, and settings panel state
 */
const defaultConfirmation: ConfirmationModal = {
  isOpen: false,
  type: 'delete',
  entityId: '',
  entityType: '',
};

export function useModalState(): UseModalStateResult {
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [listViewOpen, setListViewOpen] = useState(false);
  const [listViewWidth, setListViewWidth] = useState(320);
  const [createContext, setCreateContext] = useState<CreateContext>({});
  const [selectedNode, setSelectedNode] = useState<CloudNode | null>(null);
  const [confirmationModal, setConfirmationModal] = useState<ConfirmationModal>(defaultConfirmation);

  const openCreateModal = useCallback((context: CreateContext = {}) => {
    setCreateContext(context);
    setCreateModalOpen(true);
  }, []);

  const closeCreateModal = useCallback(() => {
    setCreateModalOpen(false);
    setCreateContext({});
  }, []);

  const openEditModal = useCallback((node: CloudNode) => {
    setSelectedNode(node);
    setEditModalOpen(true);
  }, []);

  const closeEditModal = useCallback(() => {
    setEditModalOpen(false);
    setSelectedNode(null);
  }, []);

  const openSettings = useCallback(() => {
    setSettingsOpen(true);
  }, []);

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
  }, []);

  const openListView = useCallback(() => {
    setListViewOpen(true);
  }, []);

  const closeListView = useCallback(() => {
    setListViewOpen(false);
  }, []);

  const toggleListView = useCallback(() => {
    setListViewOpen(prev => !prev);
  }, []);

  const handleSetListViewWidth = useCallback((width: number) => {
    setListViewWidth(Math.max(280, Math.min(480, width)));
  }, []);

  const openConfirmation = useCallback((
    type: ConfirmationModal['type'],
    entityId: string,
    entityType: string
  ) => {
    setConfirmationModal({ isOpen: true, type, entityId, entityType });
  }, []);

  const closeConfirmation = useCallback(() => {
    setConfirmationModal(defaultConfirmation);
  }, []);

  const isAnyModalOpen = createModalOpen || editModalOpen || settingsOpen || confirmationModal.isOpen;

  return {
    createModalOpen,
    editModalOpen,
    settingsOpen,
    listViewOpen,
    listViewWidth,
    createContext,
    selectedNode,
    confirmationModal,
    openCreateModal,
    closeCreateModal,
    openEditModal,
    closeEditModal,
    openSettings,
    closeSettings,
    openListView,
    closeListView,
    toggleListView,
    setListViewWidth: handleSetListViewWidth,
    openConfirmation,
    closeConfirmation,
    isAnyModalOpen,
  };
}
