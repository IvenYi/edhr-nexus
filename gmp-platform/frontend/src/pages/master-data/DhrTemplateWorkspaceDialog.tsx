import {
  AddRounded,
  ArticleOutlined,
  ChevronRightRounded,
  CloseRounded,
  DeleteOutlineRounded,
  DriveFileRenameOutlineRounded,
  EditOutlined,
  ExpandMoreRounded,
  FolderOpenOutlined,
  FolderOutlined,
  NoteAddOutlined,
  PostAddRounded,
  SearchRounded,
  } from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Collapse,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  MenuItem,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AppDialog from '@/components/AppDialog';
import StatusBadge from '@/components/StatusBadge';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type MouseEvent, type ReactElement } from 'react';
import {
  getDhrFormTemplateOptions,
  getDhrTemplateComposition,
  getDhrTemplateWorkspace,
  getFormTemplateVersion,
  saveDhrTemplateComposition,
  type DhrDirectoryRecord,
  type DhrEvidenceItemRecord,
  type DhrFormTemplateOption,
  type DhrTemplateCompositionRecord,
  type TemplateModelingRecord,
  type TemplateVersionRecord,
} from '@/api/template-modeling';
import { parseReactTemplateDesignerDocument } from './template-designer-react/utils/document';
import type { CanvasNode, CanvasPage, CanvasSelectionRange, TemplateDesignerDocument } from './template-designer-react/types';
import { getRdoVersionStatusMeta } from '@/utils/rdoVersionStatus';

interface DirectoryNode extends DhrDirectoryRecord {
  children: DirectoryNode[];
  items: DhrEvidenceItemRecord[];
}

interface DirectoryDialogState {
  mode: 'create' | 'edit';
  parentId?: string | null;
  target?: DhrDirectoryRecord;
}

interface SelectedTreeNode {
  kind: 'directory' | 'form';
  id: string;
}

interface SelectedFormReference {
  templateId: string;
  versionId: string;
  code: string;
  name: string;
  version: string;
  categoryName?: string | null;
}

const tableHeaderSx = {
  height: 42,
  py: 0,
  bgcolor: '#f5f7fa',
  color: '#606266',
  fontWeight: 600,
  borderBottom: '1px solid #e4e7ed',
};

function formDisplayName(item: DhrEvidenceItemRecord) {
  return item.displayName?.trim() || item.formName;
}

function cloneComposition(record: DhrTemplateCompositionRecord): DhrTemplateCompositionRecord {
  return {
    ...record,
    directories: record.directories.map((directory) => ({ ...directory })),
    items: record.items.map((item) => ({ ...item })),
  };
}

function createDraftId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildDirectoryTree(directories: DhrDirectoryRecord[], items: DhrEvidenceItemRecord[]) {
  const nodes = new Map<string, DirectoryNode>();
  directories.forEach((directory) => nodes.set(directory.id, { ...directory, children: [], items: [] }));
  items.forEach((item) => nodes.get(item.directoryId)?.items.push(item));
  const roots: DirectoryNode[] = [];
  nodes.forEach((node) => {
    const parent = node.parentId ? nodes.get(node.parentId) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  });
  const sortNodes = (entries: DirectoryNode[]) => {
    entries.sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
    entries.forEach((entry) => {
      entry.items.sort((left, right) => left.sortOrder - right.sortOrder || formDisplayName(left).localeCompare(formDisplayName(right)));
      sortNodes(entry.children);
    });
  };
  sortNodes(roots);
  return roots;
}

function filterDirectoryTree(nodes: DirectoryNode[], value: string): DirectoryNode[] {
  const keyword = value.trim().toLocaleLowerCase();
  if (!keyword) return nodes;
  return nodes.flatMap((node) => {
    const directoryMatches = node.name.toLocaleLowerCase().includes(keyword);
    const children = filterDirectoryTree(node.children, value);
    const items = directoryMatches
      ? node.items
      : node.items.filter((item) => [formDisplayName(item), item.formCode, item.formVersion].some((entry) => entry?.toLocaleLowerCase().includes(keyword)));
    if (!directoryMatches && children.length === 0 && items.length === 0) return [];
    return [{
      ...node,
      children: directoryMatches ? node.children : children,
      items,
    }];
  });
}

function DhrContentTree({
  nodes,
  selectedNode,
  editable,
  onSelectDirectory,
  onSelectForm,
  onAddForm,
  onAddChild,
  onRename,
  onDeleteDirectory,
  onDeleteForm,
  onEditForm,
}: {
  nodes: DirectoryNode[];
  selectedNode: SelectedTreeNode | null;
  editable: boolean;
  onSelectDirectory: (directory: DhrDirectoryRecord) => void;
  onSelectForm: (item: DhrEvidenceItemRecord) => void;
  onAddForm: (directory: DhrDirectoryRecord) => void;
  onAddChild: (directory: DhrDirectoryRecord) => void;
  onRename: (directory: DhrDirectoryRecord) => void;
  onDeleteDirectory: (directory: DhrDirectoryRecord) => void;
  onDeleteForm: (item: DhrEvidenceItemRecord) => void;
  onEditForm: (item: DhrEvidenceItemRecord) => void;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const collectExpandableIds = (entries: DirectoryNode[]): string[] => entries.flatMap((entry) => [
      ...(entry.children.length || entry.items.length ? [entry.id] : []),
      ...collectExpandableIds(entry.children),
    ]);
    setExpandedIds(new Set(collectExpandableIds(nodes)));
  }, [nodes]);

  const toggle = (id: string) => (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const stopAnd = (callback: () => void) => (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    callback();
  };

  const renderForm = (item: DhrEvidenceItemRecord, depth: number): ReactElement => {
    const selected = selectedNode?.kind === 'form' && selectedNode.id === item.id;
    return (
      <Box
        key={item.id}
        role="treeitem"
        aria-selected={selected}
        onClick={() => onSelectForm(item)}
        sx={{ display: 'grid', gridTemplateColumns: '24px minmax(0, 1fr) auto', alignItems: 'center', minHeight: 36, pl: `${8 + depth * 20}px`, pr: 0.5, cursor: 'pointer', bgcolor: selected ? '#e8f4ff' : 'transparent', color: selected ? '#1890ff' : '#303133', '&:hover': { bgcolor: selected ? '#e8f4ff' : '#f5f7fa' }, '&:hover .dhr-form-actions': { opacity: 1 } }}
      >
        <Box />
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
          <ArticleOutlined sx={{ fontSize: 16, color: selected ? '#1890ff' : '#6c7a89' }} />
          <Typography sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>{formDisplayName(item)}</Typography>
          <Typography component="span" sx={{ flexShrink: 0, color: selected ? '#5ca8de' : '#909399', fontSize: 12 }}>{item.formVersion}</Typography>
        </Stack>
        {editable ? <Stack className="dhr-form-actions" direction="row" spacing={0} sx={{ opacity: 0, transition: 'opacity .12s' }}><Tooltip title="编辑表单" arrow><IconButton size="small" aria-label="编辑表单" onClick={stopAnd(() => onEditForm(item))} sx={{ width: 25, height: 25 }}><EditOutlined sx={{ fontSize: 16 }} /></IconButton></Tooltip><Tooltip title="移除引用" arrow><IconButton size="small" color="error" aria-label="移除引用表单" onClick={stopAnd(() => onDeleteForm(item))} sx={{ width: 25, height: 25 }}><DeleteOutlineRounded sx={{ fontSize: 16 }} /></IconButton></Tooltip></Stack> : <Box />}
      </Box>
    );
  };

  const renderDirectory = (node: DirectoryNode, depth: number): ReactElement => {
    const hasChildren = node.children.length > 0 || node.items.length > 0;
    const expanded = expandedIds.has(node.id);
    const selected = selectedNode?.kind === 'directory' && selectedNode.id === node.id;
    return (
      <Box key={node.id}>
        <Box
          role="treeitem"
          aria-selected={selected}
          onClick={() => onSelectDirectory(node)}
          sx={{ display: 'grid', gridTemplateColumns: '24px minmax(0, 1fr) auto', alignItems: 'center', minHeight: 36, pl: `${8 + depth * 20}px`, pr: 0.5, cursor: 'pointer', bgcolor: selected ? '#e8f4ff' : 'transparent', color: selected ? '#1890ff' : '#303133', '&:hover': { bgcolor: selected ? '#e8f4ff' : '#f5f7fa' }, '&:hover .dhr-directory-actions': { opacity: 1 } }}
        >
          {hasChildren ? <IconButton size="small" aria-label={expanded ? '收起目录' : '展开目录'} onClick={toggle(node.id)} sx={{ width: 24, height: 24, color: '#606266' }}>{expanded ? <ExpandMoreRounded fontSize="small" /> : <ChevronRightRounded fontSize="small" />}</IconButton> : <Box />}
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
            {hasChildren && expanded ? <FolderOpenOutlined sx={{ fontSize: 17, color: '#d9a441' }} /> : <FolderOutlined sx={{ fontSize: 17, color: '#d9a441' }} />}
            <Typography sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>{node.name}</Typography>
          </Stack>
          {editable ? <Stack className="dhr-directory-actions" direction="row" spacing={0} sx={{ opacity: 0, transition: 'opacity .12s' }}>
            <Tooltip title="引用表单" arrow><IconButton size="small" aria-label="引用表单" onClick={stopAnd(() => onAddForm(node))} sx={{ width: 25, height: 25 }}><NoteAddOutlined sx={{ fontSize: 16 }} /></IconButton></Tooltip>
            <Tooltip title="新增子目录" arrow><IconButton size="small" aria-label="新增子目录" onClick={stopAnd(() => onAddChild(node))} sx={{ width: 25, height: 25 }}><PostAddRounded sx={{ fontSize: 16 }} /></IconButton></Tooltip>
            <Tooltip title="重命名" arrow><IconButton size="small" aria-label="重命名目录" onClick={stopAnd(() => onRename(node))} sx={{ width: 25, height: 25 }}><DriveFileRenameOutlineRounded sx={{ fontSize: 16 }} /></IconButton></Tooltip>
            <Tooltip title="删除" arrow><IconButton size="small" color="error" aria-label="删除目录" onClick={stopAnd(() => onDeleteDirectory(node))} sx={{ width: 25, height: 25 }}><DeleteOutlineRounded sx={{ fontSize: 16 }} /></IconButton></Tooltip>
          </Stack> : <Box />}
        </Box>
        {hasChildren && expanded ? <>{node.children.map((child) => renderDirectory(child, depth + 1))}{node.items.map((item) => renderForm(item, depth + 1))}</> : null}
      </Box>
    );
  };

  return <Box role="tree" sx={{ py: 0.5 }}>{nodes.map((node) => renderDirectory(node, 0))}</Box>;
}

function readNumber(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function readNodeCellRange(node: CanvasNode): CanvasSelectionRange | null {
  const value = node.style.cellRange;
  if (!value || typeof value !== 'object') return null;
  const range = value as Partial<CanvasSelectionRange>;
  if (typeof range.t !== 'number' || typeof range.l !== 'number' || typeof range.b !== 'number' || typeof range.r !== 'number') return null;
  return { t: range.t, l: range.l, b: range.b, r: range.r };
}

function flattenCanvasNodes(nodes: CanvasNode[]): CanvasNode[] {
  return nodes.flatMap((node) => [node, ...(node.children ? flattenCanvasNodes(node.children) : [])]);
}

export type PreviewFieldPermission = Record<string, 'EDIT' | 'READ_ONLY'>;

function PreviewField({ node, document, fieldPermissions }: { node: CanvasNode; document: TemplateDesignerDocument; fieldPermissions?: PreviewFieldPermission }) {
  const field = document.model.fields.find((entry) => entry.id === node.bindings?.fieldId);
  const label = String(node.bindings?.displayLabel || field?.name || node.props.label || '字段');
  const placeholder = String(node.bindings?.placeholder || node.props.placeholder || (field?.type === 'datetime' ? '请选择日期' : field?.type === 'singleSelect' || field?.type === 'reference' ? '请选择' : '请输入'));
  const hidden = Boolean(node.bindings?.hidden);
  if (hidden || node.type === 'sub-table') return null;
  const readOnly = fieldPermissions?.[String(field?.id ?? node.bindings?.fieldId ?? '')] === 'READ_ONLY' || Boolean(node.bindings?.readonly);
  return <Box sx={{ height: '100%', minWidth: 0, display: 'flex', alignItems: 'center', px: 0.75, color: readOnly ? '#7b8794' : '#617083', fontSize: 12, border: `1px solid ${readOnly ? '#d9dee7' : '#c7d8e8'}`, borderRadius: '3px', bgcolor: readOnly ? '#f3f5f7' : '#fff', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{placeholder || label}</Box>;
}

function SheetPreview({ page, document, fieldPermissions }: { page: CanvasPage; document: TemplateDesignerDocument; fieldPermissions?: PreviewFieldPermission }) {
  const columns = page.sheet.columnWidths.slice(0, page.sheet.columnCount).map((width) => Math.max(36, Math.min(260, width)));
  const rows = page.sheet.rowHeights.slice(0, page.sheet.rowCount).map((height) => Math.max(24, Math.min(180, height)));
  const sheetWidth = columns.reduce((sum, width) => sum + width, 0);
  const sheetHeight = rows.reduce((sum, height) => sum + height, 0);
  const mergedStarts = new Map<string, CanvasSelectionRange>();
  const mergedSkips = new Set<string>();
  page.mergedCells.forEach((range) => {
    mergedStarts.set(`${range.t}:${range.l}`, range);
    for (let row = range.t; row <= range.b; row += 1) for (let col = range.l; col <= range.r; col += 1) if (row !== range.t || col !== range.l) mergedSkips.add(`${row}:${col}`);
  });
  const columnOffsets = columns.reduce<number[]>((offsets, width) => [...offsets, offsets[offsets.length - 1] + width], [0]);
  const rowOffsets = rows.reduce<number[]>((offsets, height) => [...offsets, offsets[offsets.length - 1] + height], [0]);
  const nodeLayers = flattenCanvasNodes(page.nodes).flatMap((node) => {
    const range = readNodeCellRange(node);
    if (!range || node.style.position !== 'absolute') return [];
    const left = columnOffsets[range.l - 1] ?? 0;
    const top = rowOffsets[range.t - 1] ?? 0;
    const width = (columnOffsets[range.r] ?? left) - left;
    const height = (rowOffsets[range.b] ?? top) - top;
    return [{ node, left, top, width, height }];
  });
  const media = new Map(page.medias.map((item) => [item.id, item.src]));

  return (
    <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', bgcolor: '#eef3f8', p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'center', minWidth: 'fit-content' }}>
        <Box sx={{ position: 'relative', width: sheetWidth, minHeight: sheetHeight, bgcolor: '#fff', border: '1px solid #dde3ea', boxShadow: '0 8px 24px rgba(31, 41, 55, 0.08)' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: columns.map((width) => `${width}px`).join(' '), gridTemplateRows: rows.map((height) => `${height}px`).join(' ') }}>
            {Array.from({ length: page.sheet.rowCount }, (_, rowIndex) => rowIndex + 1).flatMap((row) => Array.from({ length: page.sheet.columnCount }, (_, colIndex) => colIndex + 1).map((col) => {
              const key = `${row}:${col}`;
              if (mergedSkips.has(key)) return null;
              const range = mergedStarts.get(key);
              const cell = page.cells[key];
              const spanRows = range ? range.b - range.t + 1 : 1;
              const spanCols = range ? range.r - range.l + 1 : 1;
              const borderColor = String(cell?.border?.color ?? '#4b5563');
              const hasMultilineValue = String(cell?.value ?? '').includes('\n');
              return <Box key={key} sx={{ gridColumn: `${col} / span ${spanCols}`, gridRow: `${row} / span ${spanRows}`, display: 'flex', alignItems: cell?.style?.verticalAlign === 'top' ? 'flex-start' : cell?.style?.verticalAlign === 'bottom' ? 'flex-end' : 'center', justifyContent: cell?.style?.textAlign === 'right' ? 'flex-end' : cell?.style?.textAlign === 'center' ? 'center' : 'flex-start', px: `${readNumber(cell?.style?.paddingLeft, 8)}px`, py: `${readNumber(cell?.style?.paddingTop, 4)}px`, borderLeft: cell?.border?.left ? `1px solid ${borderColor}` : col === 1 && page.sheet.showGridLines ? '1px solid #d9dee7' : 'none', borderTop: cell?.border?.top ? `1px solid ${borderColor}` : row === 1 && page.sheet.showGridLines ? '1px solid #d9dee7' : 'none', borderRight: cell?.border?.right ? `1px solid ${borderColor}` : page.sheet.showGridLines ? '1px solid #d9dee7' : '1px solid transparent', borderBottom: cell?.border?.bottom ? `1px solid ${borderColor}` : page.sheet.showGridLines ? '1px solid #d9dee7' : '1px solid transparent', bgcolor: cell?.style?.backgroundColor ? String(cell.style.backgroundColor) : '#fff', color: String(cell?.style?.color ?? '#303133'), fontSize: readNumber(cell?.style?.fontSize, 13), fontWeight: cell?.style?.fontWeight as string | number | undefined, fontStyle: cell?.style?.fontStyle as string | undefined, textDecoration: cell?.style?.textDecoration as string | undefined, fontFamily: cell?.style?.fontFamily as string | undefined, lineHeight: cell?.style?.lineHeight as string | number | undefined, whiteSpace: hasMultilineValue || cell?.style?.whiteSpace === 'normal' ? 'pre-wrap' : 'nowrap', overflow: 'hidden', overflowWrap: 'anywhere', wordBreak: 'break-word' }}><Box component="span" sx={{ display: 'block', width: '100%', minWidth: 0, textAlign: cell?.style?.textAlign === 'right' ? 'right' : cell?.style?.textAlign === 'center' ? 'center' : 'left' }}>{cell?.value ?? ''}</Box></Box>;
            }))}
          </Box>
          {nodeLayers.map(({ node, left, top, width, height }) => <Box key={node.id} sx={{ position: 'absolute', left: left + 3, top: top + 3, width: Math.max(0, width - 6), height: Math.max(0, height - 6), pointerEvents: 'none', overflow: 'hidden' }}><PreviewField node={node} document={document} fieldPermissions={fieldPermissions} /></Box>)}
          {page.images.map((image) => {
            const src = media.get(image.mediaId);
            return src ? <Box key={image.id} component="img" src={src} alt="" sx={{ position: 'absolute', left: image.layout.left, top: image.layout.top, width: image.layout.width, height: image.layout.height, objectFit: 'contain', pointerEvents: 'none' }} /> : null;
          })}
        </Box>
      </Box>
    </Box>
  );
}

function FieldListPreview({ document, fieldPermissions }: { document: TemplateDesignerDocument; fieldPermissions?: PreviewFieldPermission }) {
  const groups = document.model.groups;
  const fields = document.model.fields.filter((field) => field.status === 'enabled');
  return <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 3, bgcolor: '#f8fafc' }}><Box sx={{ maxWidth: 920, mx: 'auto', p: 3, bgcolor: '#fff', border: '1px solid #e4e7ed' }}>{groups.map((group) => {
    const groupFields = fields.filter((field) => (field.groupId ?? 'default-group') === group.id);
    if (!groupFields.length) return null;
    return <Box key={group.id} sx={{ '& + &': { mt: 3 } }}><Typography sx={{ pb: 1, mb: 2, color: '#303133', fontSize: 15, fontWeight: 600, borderBottom: '1px solid #e4e7ed' }}>{group.name}</Typography><Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 2 }}>{groupFields.map((field) => { const readOnly = fieldPermissions?.[field.id] === 'READ_ONLY'; return <Box key={field.id}><Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 0.75 }}><Typography sx={{ color: '#606266', fontSize: 13 }}>{field.name}</Typography>{fieldPermissions ? <Typography component="span" sx={{ color: readOnly ? '#8a96a3' : '#4d8bca', fontSize: 11 }}>{readOnly ? '只读' : '可编辑'}</Typography> : null}</Stack><Box sx={{ minHeight: 36, px: 1, display: 'flex', alignItems: 'center', border: `1px solid ${readOnly ? '#d9dee7' : '#c7d8e8'}`, bgcolor: readOnly ? '#f3f5f7' : '#fff', color: '#a8abb2', fontSize: 13 }}>{field.type === 'datetime' ? '请选择日期' : field.type === 'singleSelect' || field.type === 'reference' ? '请选择' : '请输入'}</Box></Box>; })}</Box></Box>;
  })}</Box></Box>;
}

export function FormCanvasPreview({ document, fieldPermissions }: { document: TemplateDesignerDocument; fieldPermissions?: PreviewFieldPermission }) {
  const [pageId, setPageId] = useState(document.canvas.currentPageId);
  useEffect(() => setPageId(document.canvas.currentPageId), [document]);
  const page = document.canvas.pages.find((entry) => entry.id === pageId) ?? document.canvas.pages[0];
  const hasCanvasContent = Boolean(page && (Object.keys(page.cells).length || page.nodes.length || page.images.length));
  return <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>{document.canvas.pages.length > 1 ? <Tabs value={page?.id ?? false} onChange={(_, value) => setPageId(value)} sx={{ minHeight: 40, px: 1.5, borderBottom: '1px solid #e4e7ed', '& .MuiTab-root': { minHeight: 40, minWidth: 88, textTransform: 'none', fontSize: 13 } }}>{document.canvas.pages.map((entry) => <Tab key={entry.id} value={entry.id} label={entry.name} />)}</Tabs> : null}{page && hasCanvasContent ? <SheetPreview page={page} document={document} fieldPermissions={fieldPermissions} /> : <FieldListPreview document={document} fieldPermissions={fieldPermissions} />}</Box>;
}

export default function DhrTemplateWorkspaceDialog({
  open,
  template,
  initialVersionId,
  onClose,
}: {
  open: boolean;
  template: TemplateModelingRecord | null;
  initialVersionId?: string | number | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const templateId = template?.id;
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [selectedDirectoryId, setSelectedDirectoryId] = useState<string | null>(null);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(null);
  const [directoryDialog, setDirectoryDialog] = useState<DirectoryDialogState | null>(null);
  const [directoryName, setDirectoryName] = useState('');
  const [deleteDirectoryTarget, setDeleteDirectoryTarget] = useState<DhrDirectoryRecord | null>(null);
  const [addEvidenceOpen, setAddEvidenceOpen] = useState(false);
  const [selectedFormOptions, setSelectedFormOptions] = useState<Map<string, SelectedFormReference>>(() => new Map());
  const [expandedFormTemplateIds, setExpandedFormTemplateIds] = useState<Set<string>>(() => new Set());
  const [formCategory, setFormCategory] = useState('ALL');
  const [formSearch, setFormSearch] = useState('');
  const [directorySearch, setDirectorySearch] = useState('');
  const [deleteEvidenceId, setDeleteEvidenceId] = useState<string | null>(null);
  const [editEvidenceTarget, setEditEvidenceTarget] = useState<DhrEvidenceItemRecord | null>(null);
  const [evidenceDisplayName, setEvidenceDisplayName] = useState('');
  const [baseComposition, setBaseComposition] = useState<DhrTemplateCompositionRecord | null>(null);
  const [compositionDraft, setCompositionDraft] = useState<DhrTemplateCompositionRecord | null>(null);
  const [appliedCompositionRevision, setAppliedCompositionRevision] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [basicInfoExpanded, setBasicInfoExpanded] = useState(false);
  const [discardConfirm, setDiscardConfirm] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });

  const workspaceQuery = useQuery({ queryKey: ['dhr-template-workspace', templateId], enabled: open && Boolean(templateId), queryFn: async () => (await getDhrTemplateWorkspace(templateId!)).data.data });
  const formOptionsQuery = useQuery({ queryKey: ['dhr-template-form-options', templateId], enabled: open && Boolean(templateId), queryFn: async () => (await getDhrFormTemplateOptions(templateId!)).data.data });
  const compositionQuery = useQuery({ queryKey: ['dhr-template-composition', templateId, selectedVersionId], enabled: open && Boolean(templateId) && Boolean(selectedVersionId), queryFn: async () => (await getDhrTemplateComposition(templateId!, selectedVersionId!)).data.data });

  const versions = workspaceQuery.data?.versions ?? [];
  const selectedVersion = versions.find((version) => version.id === selectedVersionId) ?? compositionQuery.data?.version ?? null;
  const compositionRevision = compositionQuery.data ? `${compositionQuery.data.version.id}:${compositionQuery.dataUpdatedAt}` : '';
  const directories = compositionDraft?.directories ?? [];
  const items = compositionDraft?.items ?? [];
  const selectedDirectory = directories.find((directory) => directory.id === selectedDirectoryId) ?? null;
  const selectedEvidence = items.find((item) => item.id === selectedEvidenceId) ?? null;
  const directoryTree = useMemo(() => buildDirectoryTree(directories, items), [directories, items]);
  const visibleDirectoryTree = useMemo(() => filterDirectoryTree(directoryTree, directorySearch), [directorySearch, directoryTree]);
  const editable = Boolean(selectedVersion);
  const selectedTreeNode = selectedEvidence ? { kind: 'form' as const, id: selectedEvidence.id } : selectedDirectory ? { kind: 'directory' as const, id: selectedDirectory.id } : null;
  const formPreviewQuery = useQuery({
    queryKey: ['dhr-referenced-form-version', selectedEvidence?.formTemplateId, selectedEvidence?.formTemplateVersionId],
    enabled: open && Boolean(selectedEvidence?.formTemplateId) && Boolean(selectedEvidence?.formTemplateVersionId),
    queryFn: async () => (await getFormTemplateVersion(selectedEvidence!.formTemplateId!, selectedEvidence!.formTemplateVersionId!)).data.data,
  });
  const formPreviewDocument = useMemo(() => {
    if (!selectedEvidence || !formPreviewQuery.data) return null;
    const row: TemplateModelingRecord = { id: selectedEvidence.formTemplateId ?? selectedEvidence.formTemplateVersionId ?? selectedEvidence.id, code: selectedEvidence.formCode, name: selectedEvidence.formName, type: 'FORM_TEMPLATE' };
    return parseReactTemplateDesignerDocument(row, formPreviewQuery.data as TemplateVersionRecord);
  }, [formPreviewQuery.data, selectedEvidence]);
  const formCategories = useMemo(() => Array.from(new Set((formOptionsQuery.data ?? []).map((option) => option.categoryName?.trim() || '未分类'))).sort((left, right) => left.localeCompare(right)), [formOptionsQuery.data]);
  const visibleFormOptions = useMemo(() => {
    const keyword = formSearch.trim().toLocaleLowerCase();
    return (formOptionsQuery.data ?? []).filter((option) => {
      const categoryName = option.categoryName?.trim() || '未分类';
      return (formCategory === 'ALL' || categoryName === formCategory)
        && (!keyword || option.name.toLocaleLowerCase().includes(keyword));
    });
  }, [formCategory, formOptionsQuery.data, formSearch]);
  const selectedFormReferences = useMemo(() => Array.from(selectedFormOptions.values()), [selectedFormOptions]);
  const referencedFormIds = useMemo(() => new Set(items.filter((item) => item.directoryId === selectedDirectoryId).map((item) => item.formTemplateId)), [items, selectedDirectoryId]);

  const invalidateWorkspace = async () => {
    await queryClient.invalidateQueries({ queryKey: ['dhr-template-workspace', templateId] });
    await queryClient.invalidateQueries({ queryKey: ['dhr-template-composition', templateId] });
    await queryClient.invalidateQueries({ queryKey: ['template-modeling-batch-record-templates'] });
  };

  useEffect(() => {
    if (!open) {
      setSelectedVersionId(null);
      setSelectedDirectoryId(null);
      setSelectedEvidenceId(null);
      return;
    }
    setSelectedVersionId(initialVersionId == null ? null : String(initialVersionId));
    setSelectedDirectoryId(null);
    setSelectedEvidenceId(null);
  }, [initialVersionId, open, templateId]);

  useEffect(() => {
    if (!open) return;
    if (versions.length === 0) return;
    if (!selectedVersionId || !versions.some((version) => version.id === selectedVersionId)) {
      setSelectedVersionId(versions[0]?.id ?? null);
    }
  }, [open, selectedVersionId, versions]);

  useEffect(() => {
    if (!selectedDirectoryId || !directories.some((directory) => directory.id === selectedDirectoryId)) setSelectedDirectoryId(directories[0]?.id ?? null);
  }, [directories, selectedDirectoryId]);

  useEffect(() => {
    if (selectedEvidenceId && !items.some((item) => item.id === selectedEvidenceId)) setSelectedEvidenceId(null);
  }, [items, selectedEvidenceId]);

  useEffect(() => {
    if (!compositionQuery.data) return;
    if (hasChanges || (appliedCompositionRevision === compositionRevision && compositionDraft)) return;
    const nextComposition = cloneComposition(compositionQuery.data);
    setBaseComposition(nextComposition);
    setCompositionDraft(cloneComposition(nextComposition));
    setAppliedCompositionRevision(compositionRevision);
    setHasChanges(false);
  }, [appliedCompositionRevision, compositionDraft, compositionQuery.data, compositionRevision, hasChanges]);

  useEffect(() => {
    if (open) return;
    setDirectoryDialog(null);
    setAddEvidenceOpen(false);
    setEditEvidenceTarget(null);
    setEvidenceDisplayName('');
    setDiscardConfirm(false);
    setBaseComposition(null);
    setCompositionDraft(null);
    setAppliedCompositionRevision('');
    setHasChanges(false);
    setBasicInfoExpanded(false);
    setSelectedFormOptions(new Map());
    setExpandedFormTemplateIds(new Set());
    setFormCategory('ALL');
    setFormSearch('');
    setDirectorySearch('');
  }, [open]);

  useEffect(() => {
    if (!addEvidenceOpen) return;
    setExpandedFormTemplateIds(new Set((formOptionsQuery.data ?? []).map((option) => option.templateId)));
  }, [addEvidenceOpen, formOptionsQuery.data]);

  const reportError = (error: unknown, fallback: string) => setSnackbar({ open: true, message: error instanceof Error ? error.message : fallback, severity: 'error' });

  const openCreateDirectory = (parentId?: string | null) => { setDirectoryName(''); setDirectoryDialog({ mode: 'create', parentId: parentId ?? null }); };
  const openEditDirectory = (directory: DhrDirectoryRecord) => { setDirectoryName(directory.name); setDirectoryDialog({ mode: 'edit', target: directory }); };
  const selectDirectory = (directory: DhrDirectoryRecord) => { setSelectedDirectoryId(directory.id); setSelectedEvidenceId(null); };
  const selectForm = (item: DhrEvidenceItemRecord) => { setSelectedDirectoryId(item.directoryId); setSelectedEvidenceId(item.id); };
  const openEditEvidence = (item: DhrEvidenceItemRecord) => {
    selectForm(item);
    setEvidenceDisplayName(formDisplayName(item));
    setEditEvidenceTarget(item);
  };
  const openAddEvidence = (directory: DhrDirectoryRecord) => {
    setSelectedDirectoryId(directory.id);
    setSelectedEvidenceId(null);
    setSelectedFormOptions(new Map());
    setFormCategory('ALL');
    setFormSearch('');
    setAddEvidenceOpen(true);
  };
  const asSelectedFormReference = (templateOption: DhrFormTemplateOption, version: DhrFormTemplateOption['versions'][number]): SelectedFormReference => ({
    templateId: templateOption.templateId,
    versionId: version.versionId,
    code: templateOption.code,
    name: templateOption.name,
    version: version.version,
    categoryName: templateOption.categoryName,
  });
  const toggleFormTemplateExpanded = (templateOption: DhrFormTemplateOption) => {
    setExpandedFormTemplateIds((current) => {
      const next = new Set(current);
      if (next.has(templateOption.templateId)) next.delete(templateOption.templateId);
      else next.add(templateOption.templateId);
      return next;
    });
  };
  const toggleFormVersionSelection = (templateOption: DhrFormTemplateOption, version: DhrFormTemplateOption['versions'][number]) => {
    if (!version.referenceable || referencedFormIds.has(templateOption.templateId)) return;
    setSelectedFormOptions((current) => {
      const next = new Map(current);
      if (next.has(version.versionId)) {
        next.delete(version.versionId);
        return next;
      }
      Array.from(next.values())
        .filter((selected) => selected.templateId === templateOption.templateId)
        .forEach((selected) => next.delete(selected.versionId));
      next.set(version.versionId, asSelectedFormReference(templateOption, version));
      return next;
    });
  };
  const toggleTemplateSelection = (templateOption: DhrFormTemplateOption) => {
    if (referencedFormIds.has(templateOption.templateId)) return;
    const referenceableVersions = templateOption.versions.filter((version) => version.referenceable);
    if (referenceableVersions.length !== 1) {
      setExpandedFormTemplateIds((current) => new Set(current).add(templateOption.templateId));
      return;
    }
    setSelectedFormOptions((current) => {
      const next = new Map(current);
      const [version] = referenceableVersions;
      if (next.has(version.versionId)) next.delete(version.versionId);
      else next.set(version.versionId, asSelectedFormReference(templateOption, version));
      return next;
    });
  };

  const stageDirectory = () => {
    if (!directoryDialog || !directoryName.trim()) return;
    if (directoryDialog.mode === 'create') {
      const id = createDraftId('directory');
      setCompositionDraft((current) => current ? {
        ...current,
        directories: [...current.directories, {
          id,
          parentId: directoryDialog.parentId ?? null,
          name: directoryName.trim(),
          sortOrder: Math.max(0, ...current.directories.filter((directory) => directory.parentId === (directoryDialog.parentId ?? null)).map((directory) => directory.sortOrder)) + 10,
        }],
      } : current);
      setSelectedDirectoryId(id);
    } else {
      setCompositionDraft((current) => current ? { ...current, directories: current.directories.map((directory) => directory.id === directoryDialog.target?.id ? { ...directory, name: directoryName.trim() } : directory) } : current);
      setSelectedDirectoryId(directoryDialog.target?.id ?? null);
    }
    setSelectedEvidenceId(null);
    setHasChanges(true);
    setDirectoryDialog(null);
  };

  const requestDeleteDirectory = (directory: DhrDirectoryRecord) => {
    if (directories.some((candidate) => candidate.parentId === directory.id) || items.some((item) => item.directoryId === directory.id)) {
      setSnackbar({ open: true, message: '请先移除目录下的子目录和表单', severity: 'error' });
      return;
    }
    setDeleteDirectoryTarget(directory);
  };

  const stageDeleteDirectory = () => {
    if (!deleteDirectoryTarget) return;
    setCompositionDraft((current) => current ? { ...current, directories: current.directories.filter((directory) => directory.id !== deleteDirectoryTarget.id) } : current);
    if (selectedDirectoryId === deleteDirectoryTarget.id) setSelectedDirectoryId(null);
    setDeleteDirectoryTarget(null);
    setHasChanges(true);
  };

  const stageEvidence = () => {
    if (!selectedDirectoryId || !selectedFormReferences.length) return;
    const existingTemplateIds = new Set(items.filter((candidate) => candidate.directoryId === selectedDirectoryId).map((candidate) => candidate.formTemplateId));
    const stagedTemplateIds = new Set<string>();
    for (const reference of selectedFormReferences) {
      if (existingTemplateIds.has(reference.templateId) || stagedTemplateIds.has(reference.templateId)) {
        setSnackbar({ open: true, message: '同一目录不能重复引用同一表单', severity: 'error' });
        return;
      }
      stagedTemplateIds.add(reference.templateId);
    }
    const firstItemId = createDraftId('form');
    const firstSortOrder = Math.max(0, ...items.filter((candidate) => candidate.directoryId === selectedDirectoryId).map((candidate) => candidate.sortOrder)) + 10;
    const stagedItems: DhrEvidenceItemRecord[] = selectedFormReferences.map((option, index) => ({
      id: index === 0 ? firstItemId : createDraftId('form'),
      directoryId: selectedDirectoryId,
      formTemplateId: option.templateId,
      formTemplateVersionId: option.versionId,
      formCode: option.code,
      formName: option.name,
      formVersion: option.version,
      isRequired: true,
      sortOrder: firstSortOrder + index * 10,
    }));
    setCompositionDraft((current) => current ? { ...current, items: [...current.items, ...stagedItems] } : current);
    setSelectedEvidenceId(firstItemId);
    setSelectedFormOptions(new Map());
    setFormSearch('');
    setAddEvidenceOpen(false);
    setHasChanges(true);
  };

  const stageDeleteEvidence = () => {
    if (!deleteEvidenceId) return;
    setCompositionDraft((current) => current ? { ...current, items: current.items.filter((item) => item.id !== deleteEvidenceId) } : current);
    if (deleteEvidenceId === selectedEvidenceId) setSelectedEvidenceId(null);
    setDeleteEvidenceId(null);
    setHasChanges(true);
  };

  const stageEvidenceDisplayName = () => {
    if (!editEvidenceTarget || !evidenceDisplayName.trim()) return;
    const displayName = evidenceDisplayName.trim() === editEvidenceTarget.formName ? null : evidenceDisplayName.trim();
    setCompositionDraft((current) => current ? {
      ...current,
      items: current.items.map((item) => item.id === editEvidenceTarget.id ? { ...item, displayName } : item),
    } : current);
    setHasChanges(true);
    setEditEvidenceTarget(null);
  };

  const saveCompositionMutation = useMutation({
    mutationFn: async () => {
      if (!templateId || !selectedVersionId || !compositionDraft) throw new Error('批记录设计上下文缺失');
      const draftDirectoryMap = new Map(compositionDraft.directories.map((directory) => [directory.id, directory]));

      const duplicateReferences = new Set<string>();
      for (const item of compositionDraft.items) {
        if (!draftDirectoryMap.has(item.directoryId)) throw new Error('引用表单缺少所属目录');
        const duplicateKey = `${item.directoryId}:${item.formTemplateId}`;
        if (duplicateReferences.has(duplicateKey)) throw new Error('同一目录不能重复引用同一表单');
        duplicateReferences.add(duplicateKey);
      }

      await saveDhrTemplateComposition(templateId, selectedVersionId, {
        directories: compositionDraft.directories.map((directory) => ({
          clientId: directory.id,
          parentClientId: directory.parentId ?? null,
          name: directory.name,
          sortOrder: directory.sortOrder,
        })),
        items: compositionDraft.items.map((item) => ({
          directoryClientId: item.directoryId,
          formTemplateVersionId: item.formTemplateVersionId ?? '',
          displayName: item.displayName,
          isRequired: item.isRequired,
          sortOrder: item.sortOrder,
        })),
      });
    },
    onSuccess: async () => {
      await invalidateWorkspace();
      setHasChanges(false);
      setSnackbar({ open: true, message: '批记录目录和表单已保存', severity: 'success' });
    },
    onError: (error) => reportError(error, '保存批记录设计失败'),
  });

  const requestClose = () => {
    if (saveCompositionMutation.isPending) return;
    if (hasChanges) setDiscardConfirm(true);
    else onClose();
  };

  return (
    <AppDialog hideCloseButton open={open} onClose={requestClose} fullScreen PaperProps={{ sx: { borderRadius: 0, bgcolor: '#f6f8f9' } }}>
      <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Box sx={{ minHeight: 56, px: 2, bgcolor: '#fff', borderBottom: '1px solid #e4e7ed', display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography sx={{ color: '#303133', fontSize: 16, fontWeight: 600, mr: 'auto' }}>批记录模板设计</Typography>
          <Tooltip title="关闭" arrow><IconButton aria-label="关闭" onClick={requestClose} disabled={saveCompositionMutation.isPending} sx={{ width: 36, height: 36 }}><CloseRounded /></IconButton></Tooltip>
        </Box>

        <Box sx={{ bgcolor: '#fff', borderBottom: '1px solid #e4e7ed' }}>
          <Stack direction="row" alignItems="center" sx={{ minHeight: 48, px: 2, borderBottom: '1px solid #eef0f3' }}>
            <Button
              color="inherit"
              size="small"
              aria-expanded={basicInfoExpanded}
              aria-label={basicInfoExpanded ? '收起基本信息详情' : '展开基本信息详情'}
              onClick={() => setBasicInfoExpanded((current) => !current)}
              startIcon={<ExpandMoreRounded sx={{ transform: basicInfoExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform .16s' }} />}
              sx={{ minWidth: 0, px: 0.5, color: '#303133', fontSize: 14, fontWeight: 600, textTransform: 'none' }}
            >
              基本信息
            </Button>
            <Stack direction="row" alignItems="center" spacing={0.75} sx={{ ml: 1.25, minWidth: 0 }}>
              <Typography noWrap sx={{ color: '#606266', fontSize: 13 }}>设计版本 {selectedVersion?.version ?? '-'}</Typography>
              <StatusBadge {...getRdoVersionStatusMeta(selectedVersion?.status)} />
            </Stack>
          </Stack>
          <Box sx={{ px: 2, py: 1.5, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', columnGap: 4, rowGap: 1.5 }}>
            <Box><Typography variant="caption" sx={{ color: '#909399' }}>模板名称</Typography><Typography noWrap sx={{ color: '#303133', fontSize: 14, fontWeight: 600 }}>{template?.name ?? '-'}</Typography></Box>
            <Box><Typography variant="caption" sx={{ color: '#909399' }}>版本编码</Typography><Typography noWrap sx={{ color: '#303133', fontSize: 14 }}>{selectedVersion?.code || '-'}</Typography></Box>
            <Box><Typography variant="caption" sx={{ color: '#909399' }}>所属分类</Typography><Typography noWrap sx={{ color: '#303133', fontSize: 14 }}>{template?.categoryName || '未分类'}</Typography></Box>
          </Box>
          <Collapse in={basicInfoExpanded} timeout="auto">
            <Box sx={{ px: 2, pb: 1.75, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', columnGap: 4, rowGap: 1.5 }}>
              <Box><Typography variant="caption" sx={{ color: '#909399' }}>版本状态</Typography><Box sx={{ mt: 0.25 }}><StatusBadge {...getRdoVersionStatusMeta(selectedVersion?.status)} /></Box></Box>
              <Box><Typography variant="caption" sx={{ color: '#909399' }}>生效时间</Typography><Typography noWrap sx={{ color: '#303133', fontSize: 14 }}>{selectedVersion?.effectiveFrom || '未设置'}</Typography></Box>
              <Box><Typography variant="caption" sx={{ color: '#909399' }}>失效时间</Typography><Typography noWrap sx={{ color: '#303133', fontSize: 14 }}>{selectedVersion?.effectiveTo || '未设置'}</Typography></Box>
              <Box><Typography variant="caption" sx={{ color: '#909399' }}>线下版本</Typography><Typography noWrap sx={{ color: '#303133', fontSize: 14 }}>{selectedVersion?.offlineVersion || '未填写'}</Typography></Box>
              <Box><Typography variant="caption" sx={{ color: '#909399' }}>版本说明</Typography><Typography noWrap sx={{ color: '#303133', fontSize: 14 }}>{selectedVersion?.description || '未填写'}</Typography></Box>
              <Box><Typography variant="caption" sx={{ color: '#909399' }}>目录数量</Typography><Typography sx={{ color: '#303133', fontSize: 14 }}>{directories.length}</Typography></Box>
              <Box><Typography variant="caption" sx={{ color: '#909399' }}>引用表单</Typography><Typography sx={{ color: '#303133', fontSize: 14 }}>{items.length}</Typography></Box>
              <Box><Typography variant="caption" sx={{ color: '#909399' }}>创建时间</Typography><Typography noWrap sx={{ color: '#303133', fontSize: 14 }}>{selectedVersion?.createdAt || '未记录'}</Typography></Box>
            </Box>
          </Collapse>
        </Box>

        <Box sx={{ p: 1.5, flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '300px minmax(0, 1fr)', gap: 1.5 }}>
          <Box sx={{ minWidth: 0, minHeight: 0, bgcolor: '#fff', border: '1px solid #e4e7ed', borderRadius: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <Stack spacing={1} sx={{ px: 1.5, py: 1, borderBottom: '1px solid #e4e7ed' }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between"><Typography sx={{ fontWeight: 600, color: '#303133' }}>DHR 目录</Typography><Tooltip title="新增根目录" arrow><span><IconButton size="small" aria-label="新增根目录" onClick={() => openCreateDirectory()} disabled={!editable}><AddRounded fontSize="small" /></IconButton></span></Tooltip></Stack>
              <TextField
                size="small"
                value={directorySearch}
                onChange={(event) => {
                  setDirectorySearch(event.target.value);
                  setSelectedDirectoryId(null);
                  setSelectedEvidenceId(null);
                }}
                placeholder="搜索目录或表单"
                inputProps={{ 'aria-label': '搜索目录或表单' }}
                InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded sx={{ color: '#909399', fontSize: 18 }} /></InputAdornment> }}
                sx={{ '& .MuiInputBase-root': { height: 32, fontSize: 13 } }}
              />
            </Stack>
            <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>{compositionQuery.isLoading || !compositionDraft ? <Box sx={{ display: 'grid', placeItems: 'center', height: '100%' }}><CircularProgress size={24} /></Box> : visibleDirectoryTree.length ? <DhrContentTree nodes={visibleDirectoryTree} selectedNode={selectedTreeNode} editable={editable && !saveCompositionMutation.isPending} onSelectDirectory={selectDirectory} onSelectForm={selectForm} onAddForm={openAddEvidence} onAddChild={(directory) => openCreateDirectory(directory.id)} onRename={openEditDirectory} onDeleteDirectory={requestDeleteDirectory} onDeleteForm={(item) => setDeleteEvidenceId(item.id)} onEditForm={openEditEvidence} /> : <Box sx={{ p: 2, color: '#909399', fontSize: 13 }}>{directorySearch.trim() ? '暂无匹配的目录或表单' : '暂无目录'}</Box>}</Box>
          </Box>

          <Box sx={{ minWidth: 0, minHeight: 0, bgcolor: '#fff', border: '1px solid #e4e7ed', borderRadius: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {selectedEvidence ? <>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ minHeight: 54, px: 2, borderBottom: '1px solid #e4e7ed' }}><ArticleOutlined sx={{ color: '#5b7188', fontSize: 20 }} /><Stack spacing={0.1} sx={{ minWidth: 0, mr: 'auto' }}><Typography noWrap sx={{ color: '#303133', fontSize: 14, fontWeight: 600 }}>{formDisplayName(selectedEvidence)}</Typography><Typography noWrap variant="caption" sx={{ color: '#909399' }}>{selectedEvidence.formCode} · {selectedEvidence.formVersion}</Typography></Stack></Stack>
              {formPreviewQuery.isLoading ? <Box sx={{ flex: 1, display: 'grid', placeItems: 'center' }}><CircularProgress size={26} /></Box> : formPreviewQuery.isError ? <Box sx={{ p: 2 }}><Alert severity="error">无法加载该表单版本</Alert></Box> : formPreviewDocument ? <FormCanvasPreview document={formPreviewDocument} /> : null}
            </> : selectedDirectory ? <>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ minHeight: 54, px: 2, borderBottom: '1px solid #e4e7ed' }}><FolderOpenOutlined sx={{ color: '#d9a441', fontSize: 20 }} /><Typography noWrap sx={{ minWidth: 0, mr: 'auto', color: '#303133', fontSize: 14, fontWeight: 600 }}>{selectedDirectory.name}</Typography></Stack>
              <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', color: '#909399' }}><Stack alignItems="center" spacing={1}><FolderOpenOutlined sx={{ fontSize: 36, color: '#c9d3de' }} /><Typography sx={{ fontSize: 13 }}>请选择目录中的表单</Typography></Stack></Box>
            </> : <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', color: '#909399' }}><Typography sx={{ fontSize: 13 }}>请选择左侧目录</Typography></Box>}
          </Box>
        </Box>
        <Stack direction="row" justifyContent="flex-end" spacing={1} sx={{ minHeight: 56, px: 2, py: 1, bgcolor: '#fff', borderTop: '1px solid #e4e7ed' }}>
          <Button size="small" onClick={requestClose} disabled={saveCompositionMutation.isPending}>取消</Button>
          <Button size="small" variant="contained" onClick={() => saveCompositionMutation.mutate()} disabled={!hasChanges || !editable || saveCompositionMutation.isPending}>{saveCompositionMutation.isPending ? '保存中' : '保存'}</Button>
        </Stack>
      </Box>

      <AppDialog open={Boolean(directoryDialog)} onClose={() => setDirectoryDialog(null)} fullWidth maxWidth="xs"><DialogTitle>{directoryDialog?.mode === 'edit' ? '重命名目录' : '新增目录'}</DialogTitle><DialogContent dividers><TextField autoFocus fullWidth required size="small" label="目录名称" value={directoryName} onChange={(event) => setDirectoryName(event.target.value)} sx={{ mt: 0.5, '& .MuiInputBase-root': { height: 40 } }} /></DialogContent><DialogActions><Button onClick={() => setDirectoryDialog(null)}>取消</Button><Button variant="contained" disabled={!directoryName.trim()} onClick={stageDirectory}>确定</Button></DialogActions></AppDialog>
      <AppDialog open={Boolean(deleteDirectoryTarget)} onClose={() => setDeleteDirectoryTarget(null)} fullWidth maxWidth="xs"><DialogTitle>删除目录</DialogTitle><DialogContent dividers><Typography>确认删除“{deleteDirectoryTarget?.name}”？</Typography></DialogContent><DialogActions><Button onClick={() => setDeleteDirectoryTarget(null)}>取消</Button><Button color="error" variant="contained" onClick={stageDeleteDirectory}>删除</Button></DialogActions></AppDialog>

      <AppDialog open={addEvidenceOpen} onClose={() => setAddEvidenceOpen(false)} fullWidth maxWidth="xl" PaperProps={{ sx: { width: 'min(1280px, calc(100vw - 64px))', height: 'min(78vh, 760px)', maxHeight: 'calc(100vh - 64px)' } }}>
        <DialogTitle sx={{ minHeight: 58, px: 2.5, py: 0, display: 'flex', alignItems: 'center', borderBottom: '1px solid #e4e7ed' }}>
          <Typography sx={{ color: '#303133', fontSize: 17, fontWeight: 600 }}>批量引用表单</Typography>
        </DialogTitle>
        <DialogContent dividers sx={{ minHeight: 0, p: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 310px', overflow: 'hidden' }}>
          <Box sx={{ minWidth: 0, minHeight: 0, p: 2.25, display: 'flex', flexDirection: 'column' }}>
            <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
              <TextField select size="small" label="分类" value={formCategory} onChange={(event) => setFormCategory(event.target.value)} sx={{ width: 250 }}>
                <MenuItem value="ALL">全部分类</MenuItem>
                {formCategories.map((category) => <MenuItem key={category} value={category}>{category}</MenuItem>)}
              </TextField>
              <TextField size="small" label="名称" placeholder="请输入表单名称" value={formSearch} onChange={(event) => setFormSearch(event.target.value)} sx={{ width: 320 }} />
            </Stack>
            <TableContainer sx={{ flex: 1, minHeight: 0, border: '1px solid #e4e7ed' }}>
              <Table stickyHeader size="small" sx={{ minWidth: 720 }}>
                <TableHead><TableRow sx={{ '& .MuiTableCell-root': tableHeaderSx }}><TableCell padding="checkbox" /><TableCell>表单名称</TableCell><TableCell>表单编码</TableCell><TableCell>表单分类</TableCell><TableCell>更新时间</TableCell></TableRow></TableHead>
                <TableBody>{formOptionsQuery.isLoading ? <TableRow><TableCell colSpan={5} align="center" sx={{ py: 6 }}><CircularProgress size={22} /></TableCell></TableRow> : formOptionsQuery.isError ? <TableRow><TableCell colSpan={5} sx={{ p: 2 }}><Alert severity="error">表单列表加载失败</Alert></TableCell></TableRow> : visibleFormOptions.length ? visibleFormOptions.flatMap((option) => {
                  const alreadyReferenced = referencedFormIds.has(option.templateId);
                  const referenceableVersions = option.versions.filter((version) => version.referenceable);
                  const selectedVersionCount = referenceableVersions.filter((version) => selectedFormOptions.has(version.versionId)).length;
                  const selected = selectedVersionCount > 0;
                  const expanded = expandedFormTemplateIds.has(option.templateId);
                  const categoryName = option.categoryName?.trim() || '未分类';
                  const parentCheckboxDisabled = alreadyReferenced || referenceableVersions.length !== 1;
                  const parentCheckboxTooltip = alreadyReferenced ? '当前目录已引用该表单' : referenceableVersions.length === 0 ? '没有可引用的生效版本' : referenceableVersions.length === 1 ? '选择生效版本' : '请展开选择具体版本';
                  const parentRow = <TableRow key={option.templateId} hover selected={selected} onClick={() => toggleFormTemplateExpanded(option)} sx={{ cursor: 'pointer', '& .MuiTableCell-root': { height: 44, borderBottom: expanded ? 'none' : undefined } }}>
                    <TableCell padding="checkbox" onClick={(event) => event.stopPropagation()}><Tooltip title={parentCheckboxTooltip} arrow><span><Checkbox size="small" checked={referenceableVersions.length === 1 && selectedVersionCount === 1} indeterminate={referenceableVersions.length > 1 && selectedVersionCount > 0} disabled={parentCheckboxDisabled} onChange={() => toggleTemplateSelection(option)} /></span></Tooltip></TableCell>
                    <TableCell><Stack direction="row" spacing={0.5} alignItems="center" sx={{ minWidth: 0 }}><IconButton size="small" aria-label={expanded ? `收起${option.name}版本` : `展开${option.name}版本`} onClick={(event) => { event.stopPropagation(); toggleFormTemplateExpanded(option); }} sx={{ width: 24, height: 24 }}>{expanded ? <ExpandMoreRounded fontSize="small" /> : <ChevronRightRounded fontSize="small" />}</IconButton><Typography noWrap sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 14, fontWeight: 600 }}>{option.name}</Typography>{alreadyReferenced ? <Typography component="span" sx={{ flexShrink: 0, color: '#909399', fontSize: 12 }}>已引用</Typography> : null}</Stack></TableCell>
                    <TableCell>{option.code}</TableCell><TableCell>{categoryName}</TableCell><TableCell>{option.updatedAt || '-'}</TableCell>
                  </TableRow>;
                  const versionRows = expanded ? option.versions.map((version) => {
                    const unavailable = alreadyReferenced || !version.referenceable;
                    const selectedVersion = selectedFormOptions.has(version.versionId);
                    const unavailableReason = alreadyReferenced ? '当前目录已引用该表单' : '仅可引用生效中的版本';
                    return <TableRow key={version.versionId} hover selected={selectedVersion} onClick={() => toggleFormVersionSelection(option, version)} sx={{ cursor: unavailable ? 'not-allowed' : 'pointer', opacity: unavailable && !selectedVersion ? 0.62 : 1, '& .MuiTableCell-root': { height: 40, bgcolor: selectedVersion ? '#e8f4ff' : '#fbfcfe' } }}>
                      <TableCell padding="checkbox" onClick={(event) => event.stopPropagation()}><Tooltip title={unavailable ? unavailableReason : '选择版本'} arrow><span><Checkbox size="small" checked={selectedVersion} disabled={unavailable} onChange={() => toggleFormVersionSelection(option, version)} /></span></Tooltip></TableCell>
                      <TableCell><Stack direction="row" spacing={0.75} alignItems="center" sx={{ pl: 4 }}><Typography sx={{ color: '#303133', fontSize: 13 }}>{version.version || '-'}</Typography>{!version.referenceable ? <Typography sx={{ color: '#909399', fontSize: 12 }}>{getRdoVersionStatusMeta(version.status).label}</Typography> : null}</Stack></TableCell>
                      <TableCell>--</TableCell><TableCell>--</TableCell><TableCell>--</TableCell>
                    </TableRow>;
                  }) : [];
                  return [parentRow, ...versionRows];
                }) : <TableRow><TableCell colSpan={5} align="center" sx={{ py: 6, color: '#909399' }}>暂无匹配表单</TableCell></TableRow>}</TableBody>
              </Table>
            </TableContainer>
          </Box>
          <Box sx={{ minWidth: 0, minHeight: 0, borderLeft: '1px solid #e4e7ed', display: 'flex', flexDirection: 'column', bgcolor: '#fafbfc' }}>
            <Stack spacing={0.25} sx={{ px: 2, py: 2, borderBottom: '1px solid #e4e7ed', bgcolor: '#fff' }}><Typography sx={{ color: '#303133', fontSize: 15, fontWeight: 600 }}>已选表单</Typography><Typography sx={{ color: '#909399', fontSize: 12 }}>已选择 {selectedFormReferences.length} 个版本</Typography></Stack>
            <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 1.25 }}>{selectedFormReferences.length ? <Stack spacing={0.75}>{selectedFormReferences.map((option) => <Stack key={option.versionId} direction="row" spacing={0.75} alignItems="flex-start" sx={{ p: 1, bgcolor: '#fff', border: '1px solid #e4e7ed', borderRadius: 1 }}><Box sx={{ mt: 0.2, flexShrink: 0, px: 0.55, py: 0.15, color: '#247cc4', bgcolor: '#e8f4ff', borderRadius: '3px', fontSize: 12 }}>{option.categoryName?.trim() || '未分类'}</Box><Stack spacing={0.15} sx={{ minWidth: 0, flex: 1 }}><Typography noWrap sx={{ color: '#303133', fontSize: 13, fontWeight: 600 }}>{option.name}</Typography><Typography noWrap sx={{ color: '#909399', fontSize: 12 }}>{option.code} · {option.version}</Typography></Stack><Tooltip title="移除" arrow><IconButton size="small" aria-label={`移除${option.name}${option.version}`} onClick={() => setSelectedFormOptions((current) => { const next = new Map(current); next.delete(option.versionId); return next; })} sx={{ flexShrink: 0, width: 26, height: 26 }}><CloseRounded sx={{ fontSize: 17 }} /></IconButton></Tooltip></Stack>)}</Stack> : <Box sx={{ height: '100%', display: 'grid', placeItems: 'center', color: '#909399', fontSize: 13 }}>尚未选择表单</Box>}</Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ minHeight: 62, px: 2.5, borderTop: '1px solid #e4e7ed' }}><Button onClick={() => setAddEvidenceOpen(false)}>取消</Button><Button variant="contained" disabled={!selectedFormReferences.length} onClick={stageEvidence}>确认引用{selectedFormReferences.length ? ` (${selectedFormReferences.length})` : ''}</Button></DialogActions>
      </AppDialog>

      <AppDialog open={Boolean(editEvidenceTarget)} onClose={() => setEditEvidenceTarget(null)} fullWidth maxWidth="sm">
        <DialogTitle>编辑表单</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <Box sx={{ px: 2, py: 1.25, bgcolor: '#f7f9fb', border: '1px solid #e4e7ed', borderRadius: 1 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) repeat(2, minmax(0, 1fr))', gap: 2 }}>
                <Box sx={{ minWidth: 0 }}><Typography variant="caption" sx={{ color: '#909399' }}>源表单模板</Typography><Typography noWrap sx={{ color: '#303133', fontSize: 14, lineHeight: 1.7, overflow: 'hidden', textOverflow: 'ellipsis' }}>{editEvidenceTarget?.formName ?? '-'}</Typography></Box>
                <Box sx={{ minWidth: 0 }}><Typography variant="caption" sx={{ color: '#909399' }}>表单编码</Typography><Typography noWrap sx={{ color: '#303133', fontSize: 14, lineHeight: 1.7, overflow: 'hidden', textOverflow: 'ellipsis' }}>{editEvidenceTarget?.formCode ?? '-'}</Typography></Box>
                <Box sx={{ minWidth: 0 }}><Typography variant="caption" sx={{ color: '#909399' }}>表单版本</Typography><Typography noWrap sx={{ color: '#303133', fontSize: 14, lineHeight: 1.7, overflow: 'hidden', textOverflow: 'ellipsis' }}>{editEvidenceTarget?.formVersion ?? '-'}</Typography></Box>
              </Box>
            </Box>
            <TextField autoFocus required size="small" label="DHR 内表单名称" value={evidenceDisplayName} onChange={(event) => setEvidenceDisplayName(event.target.value)} inputProps={{ maxLength: 256 }} helperText={`${evidenceDisplayName.length} / 256`} />
          </Stack>
        </DialogContent>
        <DialogActions><Button onClick={() => setEditEvidenceTarget(null)}>取消</Button><Button variant="contained" disabled={!evidenceDisplayName.trim()} onClick={stageEvidenceDisplayName}>确定</Button></DialogActions>
      </AppDialog>
      <AppDialog open={Boolean(deleteEvidenceId)} onClose={() => setDeleteEvidenceId(null)} fullWidth maxWidth="xs"><DialogTitle>移除引用表单</DialogTitle><DialogContent dividers><Typography>确认移除该引用表单？</Typography></DialogContent><DialogActions><Button onClick={() => setDeleteEvidenceId(null)}>取消</Button><Button color="error" variant="contained" onClick={stageDeleteEvidence}>移除</Button></DialogActions></AppDialog>
      <AppDialog open={discardConfirm} onClose={() => setDiscardConfirm(false)} fullWidth maxWidth="xs"><DialogTitle>放弃未保存的修改</DialogTitle><DialogContent dividers><Typography>目录和表单引用的修改尚未保存，确认放弃吗？</Typography></DialogContent><DialogActions><Button onClick={() => setDiscardConfirm(false)}>继续编辑</Button><Button color="error" variant="contained" onClick={onClose}>放弃修改</Button></DialogActions></AppDialog>
      <Snackbar open={snackbar.open} autoHideDuration={3500} onClose={() => setSnackbar((current) => ({ ...current, open: false }))} anchorOrigin={{ vertical: 'top', horizontal: 'right' }}><Alert severity={snackbar.severity} onClose={() => setSnackbar((current) => ({ ...current, open: false }))}>{snackbar.message}</Alert></Snackbar>
    </AppDialog>
  );
}
