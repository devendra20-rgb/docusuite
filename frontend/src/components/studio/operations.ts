import {
  StudioPage,
  StudioOperation,
  RotateOperation,
  ReorderOperation,
  DeleteOperation,
  RestoreOperation,
  BatchRotateOperation,
  BatchDeleteOperation,
  RotationAngle
} from './types';

/**
 * Calculates new angle normalized to 0, 90, 180, 270
 */
export function calculateNormalizedRotation(
  current: RotationAngle,
  delta: 90 | -90 | 180
): RotationAngle {
  let next = (current + delta) % 360;
  if (next < 0) next += 360;
  return next as RotationAngle;
}

/**
 * Applies a single operation immutably to a list of pages
 */
export function applyOperationToPages(
  pages: StudioPage[],
  op: StudioOperation
): StudioPage[] {
  switch (op.type) {
    case 'rotate': {
      return pages.map((page) => {
        if (page.id !== op.pageId) return page;
        return {
          ...page,
          rotation: op.newAngle
        };
      });
    }

    case 'batch-rotate': {
      const targetSet = new Set(op.pageIds);
      return pages.map((page) => {
        if (!targetSet.has(page.id)) return page;
        return {
          ...page,
          rotation: calculateNormalizedRotation(page.rotation, op.deltaAngle)
        };
      });
    }

    case 'delete': {
      return pages.map((page) => {
        if (page.id !== op.pageId) return page;
        return { ...page, isDeleted: true };
      });
    }

    case 'restore': {
      return pages.map((page) => {
        if (page.id !== op.pageId) return page;
        return { ...page, isDeleted: false };
      });
    }

    case 'batch-delete': {
      const targetSet = new Set(op.pageIds);
      return pages.map((page) => {
        if (!targetSet.has(page.id)) return page;
        return { ...page, isDeleted: true };
      });
    }

    case 'reorder': {
      const { fromIndex, toIndex } = op;
      if (
        fromIndex < 0 ||
        fromIndex >= pages.length ||
        toIndex < 0 ||
        toIndex >= pages.length ||
        fromIndex === toIndex
      ) {
        return pages;
      }
      const cloned = [...pages];
      const [moved] = cloned.splice(fromIndex, 1);
      cloned.splice(toIndex, 0, moved);

      // Re-index displayOrder
      return cloned.map((p, idx) => ({
        ...p,
        displayOrder: idx + 1
      }));
    }

    default:
      return pages;
  }
}

/**
 * Inverts an operation for undo support
 */
export function invertOperation(op: StudioOperation): StudioOperation | null {
  switch (op.type) {
    case 'rotate':
      return {
        ...op,
        id: `undo_${op.id}`,
        prevAngle: op.newAngle,
        newAngle: op.prevAngle,
        deltaAngle: (-op.deltaAngle as any) || 90
      };

    case 'delete':
      return {
        id: `undo_${op.id}`,
        type: 'restore',
        pageId: op.pageId,
        timestamp: Date.now(),
        description: `Restore page`
      };

    case 'restore':
      return {
        id: `undo_${op.id}`,
        type: 'delete',
        pageId: op.pageId,
        timestamp: Date.now(),
        description: `Delete page`
      };

    case 'reorder':
      return {
        id: `undo_${op.id}`,
        type: 'reorder',
        fromIndex: op.toIndex,
        toIndex: op.fromIndex,
        timestamp: Date.now(),
        description: `Revert reorder`
      };

    case 'batch-rotate':
      return {
        ...op,
        id: `undo_${op.id}`,
        deltaAngle: (-op.deltaAngle as any) || 90
      };

    default:
      return null;
  }
}

/**
 * Compiles current pages into backend organize operations:
 * { operations: [{ pageNumber: number, rotation?: number, deleted?: boolean }] }
 */
export function compileOrganizeOperations(pages: StudioPage[]) {
  return pages.map((page) => ({
    pageNumber: page.originalPageNumber,
    rotation: page.rotation,
    deleted: page.isDeleted
  }));
}
