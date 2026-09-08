import TableStateCell from '@/components/TableStateCell';
import {
  Fragment,
  useEffect,
  useMemo,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode } from 'react';
import { useMutation,
  useQuery,
  useQueryClient } from '@tanstack/react-query';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Chip,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  FormControl,
  IconButton,
  InputAdornment,
  MenuItem,
  Pagination,
  Popover,
  Stack,
  Select,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AppDialog from '@/components/AppDialog';
import {
  Add,
  Close,
  Delete,
  DragIndicator,
  Edit,
  ExpandLess,
  ExpandMore,
  FileOpenOutlined,
  InsertDriveFileOutlined,
  OpenInNewOutlined,
  PreviewOutlined,
  PlaylistAdd,
  RestartAlt,
  Search,
  TuneRounded,
  UnfoldLessRounded,
  UnfoldMoreRounded,
  UploadFileOutlined,
  ViewColumnRounded,
} from '@mui/icons-material';
import StatusBadge from '@/components/StatusBadge';
import { getRdoVersionStatusMeta } from '@/utils/rdoVersionStatus';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useSnackbar } from '@/components/SnackbarProvider';
import {
  createDocument,
  createDocumentCategory,
  createDocumentVersion,
  deleteDocument,
  deleteDocumentCategory,
  deleteDocumentVersion,
  getDocumentCategories,
  getDocuments,
  type DocumentCategory,
  reorderDocumentCategories,
  updateDocument,
  updateDocumentCategory,
  updateDocumentVersion,
  type DocumentVersionWritePayload,
  type ManagedDocument,
  type ManagedDocumentVersion,
} from '@/api/documents';
import { getFileDownloadBlob, getFilePreviewBlob, uploadDocumentFile } from '@/api/files';
import { getAuditLogs, type AuditLogItem } from '@/api/audit';
import type { PageResult } from '@/types/common';

type MasterDialogMode = 'create' | 'edit';
type DocumentColumnSettingsTarget = 'main' | 'version';

interface DocumentColumn {
  id: string;
  label: string;
  defaultWidth: number;
  minWidth: number;
  resizable?: boolean;
}

interface DocumentColumnSettings {
  version: number;
  order: string[];
  hidden: string[];
}

interface AuditRecord {
  id: string;
  operatorName: string;
  actionLabel: string;
  operatedAt?: string;
  beforeFields: AuditField[];
  afterFields: AuditField[];
}

interface AuditField {
  label: string;
  value: string;
}

interface MasterForm {
  title: string;
  categoryId: string;
  description: string;
  remark: string;
}

interface VersionForm {
  version: string;
  code: string;
  fileId: string;
  fileName: string;
  fileMimeType: string;
  description: string;
  remark: string;
  effectiveDate: string;
  expiryDate: string;
}

type FilePreviewTarget = Pick<ManagedDocumentVersion, 'fileId' | 'fileName' | 'fileMimeType'> & { version?: string | null };

const DOCUMENT_CATEGORY_ALL = 'ALL';
const DOCUMENT_CATEGORY_UNCATEGORIZED = 'UNCATEGORIZED';
const DOCUMENT_COLUMN_SETTINGS_VERSION = 3;
const DOCUMENT_COLUMN_WIDTH_STORAGE_PREFIX = 'document-management-column-widths:';
const DOCUMENT_COLUMN_SETTINGS_STORAGE_PREFIX = 'document-management-column-settings:';
const DOCUMENT_VERSION_COLUMN_WIDTH_STORAGE_PREFIX = 'document-management-version-column-widths:';
const DOCUMENT_VERSION_COLUMN_SETTINGS_STORAGE_PREFIX = 'document-management-version-column-settings:';

const documentColumns: DocumentColumn[] = [
  { id: 'title', label: '文档名称', defaultWidth: 220, minWidth: 160, resizable: true },
  { id: 'type', label: '分类', defaultWidth: 120, minWidth: 100, resizable: true },
  { id: 'versionCount', label: '版本数', defaultWidth: 90, minWidth: 80, resizable: true },
  { id: 'createdBy', label: '创建人', defaultWidth: 110, minWidth: 96, resizable: true },
  { id: 'createdAt', label: '创建时间', defaultWidth: 165, minWidth: 148, resizable: true },
  { id: 'updatedBy', label: '更新人', defaultWidth: 110, minWidth: 96, resizable: true },
  { id: 'updatedAt', label: '更新时间', defaultWidth: 165, minWidth: 148, resizable: true },
  { id: 'actions', label: '操作', defaultWidth: 128, minWidth: 128 },
];
const documentVersionColumns: DocumentColumn[] = [
  { id: 'version', label: '版本号', defaultWidth: 110, minWidth: 96, resizable: true },
  { id: 'code', label: '编码', defaultWidth: 150, minWidth: 120, resizable: true },
  { id: 'status', label: '状态', defaultWidth: 100, minWidth: 90, resizable: true },
  { id: 'effectiveDate', label: '生效时间', defaultWidth: 165, minWidth: 148, resizable: true },
  { id: 'expiryDate', label: '失效时间', defaultWidth: 165, minWidth: 148, resizable: true },
  { id: 'file', label: '文件', defaultWidth: 220, minWidth: 150, resizable: true },
  { id: 'description', label: '版本说明', defaultWidth: 220, minWidth: 140, resizable: true },
  { id: 'updatedAt', label: '更新时间', defaultWidth: 165, minWidth: 148, resizable: true },
  { id: 'actions', label: '操作', defaultWidth: 128, minWidth: 128 },
];

const emptyMasterForm = (categoryId = ''): MasterForm => ({ title: '', categoryId, description: '', remark: '' });
const emptyVersionForm = (version = 'V1.0'): VersionForm => ({
  version, code: '', fileId: '', fileName: '', fileMimeType: '', description: '', remark: '', effectiveDate: '', expiryDate: '',
});

const tableHeaderCellSx = { bgcolor: '#f5f7fa', color: '#606266', fontWeight: 600, whiteSpace: 'nowrap', height: 48, py: 0, borderBottom: '1px solid #e4e7ed' };
const tableRowSx = { '& > .MuiTableCell-root': { height: 40, py: 0.5, borderBottom: '1px solid #ebeef5' } };
function getOperationColumnSx(width: number, layer: 'head' | 'body') {
  return {
    position: 'sticky' as const,
    right: 0,
    zIndex: layer === 'head' ? 10 : 6,
    width,
    minWidth: width,
    maxWidth: width,
    bgcolor: layer === 'head' ? '#f5f7fa' : '#fff',
    backgroundClip: 'padding-box',
    boxShadow: '-6px 0 8px -8px rgba(0, 0, 0, 0.35)',
    whiteSpace: 'nowrap',
  };
}
const actionToolbarButtonSx = { width: 36, height: 36, border: '1px solid #e4e7ed', borderRadius: 1, color: '#606266', bgcolor: '#fff', '&:hover': { color: '#1890ff', bgcolor: '#e8f4ff' } };
const appContentDrawerSx = {
  top: 0,
  bottom: 0,
  zIndex: (theme: { zIndex: { drawer: number } }) => theme.zIndex.drawer + 2,
  '& .MuiBackdrop-root': { top: 0 },
};
const appContentDrawerPaperSx = {
  ...appContentDrawerSx,
  width: { xs: '100vw', sm: 560 },
  top: 0,
  bottom: 0,
  height: '100vh',
  transform: 'none !important',
};

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.replace('T', ' ').slice(0, 16) : date.toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-');
}

function getCurrentUserPreferenceStorageKey(prefix: string) {
  if (typeof window === 'undefined') return `${prefix}anonymous`;
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null') as { id?: string | number; username?: string; displayName?: string } | null;
    return `${prefix}${user?.id ?? user?.username ?? user?.displayName ?? 'anonymous'}`;
  } catch {
    return `${prefix}anonymous`;
  }
}

function configurableColumns(columns: DocumentColumn[]) {
  return columns.filter((column) => column.id !== 'actions');
}

function normalizeColumnSettings(columns: DocumentColumn[], raw?: Partial<DocumentColumnSettings> | null): DocumentColumnSettings {
  const defaults = configurableColumns(columns).map((column) => column.id);
  if (!raw || raw.version !== DOCUMENT_COLUMN_SETTINGS_VERSION) return { version: DOCUMENT_COLUMN_SETTINGS_VERSION, order: defaults, hidden: [] };
  const known = new Set(defaults);
  const seen = new Set<string>();
  const order = [
    ...(raw.order ?? []).filter((id) => known.has(id) && !seen.has(id) && (seen.add(id), true)),
    ...defaults.filter((id) => !seen.has(id)),
  ];
  const hidden = (raw.hidden ?? []).filter((id) => order.includes(id));
  return { version: DOCUMENT_COLUMN_SETTINGS_VERSION, order, hidden: hidden.length >= order.length ? hidden.slice(1) : hidden };
}

function loadColumnSettings(storageKey: string, columns: DocumentColumn[]) {
  if (typeof window === 'undefined') return normalizeColumnSettings(columns);
  try { return normalizeColumnSettings(columns, JSON.parse(localStorage.getItem(storageKey) || 'null')); }
  catch { return normalizeColumnSettings(columns); }
}

function loadColumnWidths(storageKey: string): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || '{}');
    return typeof parsed === 'object' && parsed ? parsed as Record<string, number> : {};
  } catch {
    return {};
  }
}

function getVisibleColumns(columns: DocumentColumn[], settings: DocumentColumnSettings) {
  const byId = new Map(configurableColumns(columns).map((column) => [column.id, column]));
  const visible = settings.order
    .filter((id) => !settings.hidden.includes(id))
    .map((id) => byId.get(id))
    .filter((column): column is DocumentColumn => Boolean(column));
  const actions = columns.find((column) => column.id === 'actions');
  return actions ? [...visible, actions] : visible;
}

function safeJsonParse(value: unknown) {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); }
  catch { return value; }
}

function formatAuditValue(value: unknown): string {
  if (value == null || value === '') return '-';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value, null, 2);
}

function toAuditFields(value: unknown): AuditField[] {
  const parsed = safeJsonParse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
  return Object.entries(parsed as Record<string, unknown>).map(([label, fieldValue]) => ({ label, value: formatAuditValue(fieldValue) }));
}

function getAuditRecords(events: AuditLogItem[] | undefined): AuditRecord[] {
  const labels: Record<string, string> = { CREATE: '新增', UPDATE: '编辑', DELETE: '删除' };
  return (events ?? []).map((event) => ({
    id: String(event.id),
    operatorName: event.operatorDisplayName || event.operatorAccount || '-',
    actionLabel: event.actionLabel || labels[(event.action || '').toUpperCase()] || event.action || '-',
    operatedAt: event.operationTime || event.createdAt,
    beforeFields: toAuditFields(event.contentBefore),
    afterFields: toAuditFields(event.contentAfter),
  }));
}

function toInputDateTime(value?: string | null) {
  return value ? value.replace(' ', 'T').slice(0, 16) : '';
}

function nextVersionLabel(versions: ManagedDocumentVersion[]) {
  const labels = new Set(versions.map((item) => item.version.toUpperCase()));
  let sequence = versions.length + 1;
  while (labels.has(`V${sequence}.0`)) sequence += 1;
  return `V${sequence}.0`;
}

function toVersionPayload(form: VersionForm): DocumentVersionWritePayload {
  return {
    version: form.version.trim(),
    code: form.code.trim(),
    fileId: form.fileId || null,
    description: form.description.trim() || null,
    remark: form.remark.trim() || null,
    effectiveDate: form.effectiveDate || null,
    expiryDate: form.expiryDate || null,
  };
}

function toVersionForm(version: ManagedDocumentVersion): VersionForm {
  return {
    version: version.version,
    code: version.code,
    fileId: version.fileId || '',
    fileName: version.fileName || '',
    fileMimeType: version.fileMimeType || '',
    description: version.description || '',
    remark: version.remark || '',
    effectiveDate: toInputDateTime(version.effectiveDate),
    expiryDate: toInputDateTime(version.expiryDate),
  };
}

function isOfficeFile(version: FilePreviewTarget) {
  const name = version.fileName || '';
  return /\.(doc|docx|xls|xlsx|ppt|pptx)$/i.test(name)
    || /^(application\/msword|application\/vnd\.ms-|application\/vnd\.openxmlformats-officedocument)/.test(version.fileMimeType || '');
}

function previewKind(version: FilePreviewTarget): 'image' | 'video' | 'pdf' | 'text' | 'unsupported' {
  const type = version.fileMimeType || '';
  const name = version.fileName || '';
  if (type.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(name)) return 'image';
  if (type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(name)) return 'video';
  if (type === 'application/pdf' || /\.pdf$/i.test(name)) return 'pdf';
  if (type.startsWith('text/') || /\.(txt|csv)$/i.test(name)) return 'text';
  return 'unsupported';
}

export default function DocumentManagementPage() {
  const queryClient = useQueryClient();
  const { showMessage } = useSnackbar();
  const [selectedCategory, setSelectedCategory] = useState(DOCUMENT_CATEGORY_ALL);
  const [keyword, setKeyword] = useState('');
  const [submittedKeyword, setSubmittedKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const mainColumnWidthStorageKey = useMemo(() => getCurrentUserPreferenceStorageKey(DOCUMENT_COLUMN_WIDTH_STORAGE_PREFIX), []);
  const mainColumnSettingsStorageKey = useMemo(() => getCurrentUserPreferenceStorageKey(DOCUMENT_COLUMN_SETTINGS_STORAGE_PREFIX), []);
  const versionColumnWidthStorageKey = useMemo(() => getCurrentUserPreferenceStorageKey(DOCUMENT_VERSION_COLUMN_WIDTH_STORAGE_PREFIX), []);
  const versionColumnSettingsStorageKey = useMemo(() => getCurrentUserPreferenceStorageKey(DOCUMENT_VERSION_COLUMN_SETTINGS_STORAGE_PREFIX), []);
  const [mainColumnWidths, setMainColumnWidths] = useState<Record<string, number>>(() => loadColumnWidths(mainColumnWidthStorageKey));
  const [mainColumnSettings, setMainColumnSettings] = useState<DocumentColumnSettings>(() => loadColumnSettings(mainColumnSettingsStorageKey, documentColumns));
  const [versionColumnWidths, setVersionColumnWidths] = useState<Record<string, number>>(() => loadColumnWidths(versionColumnWidthStorageKey));
  const [versionColumnSettings, setVersionColumnSettings] = useState<DocumentColumnSettings>(() => loadColumnSettings(versionColumnSettingsStorageKey, documentVersionColumns));
  const [columnSettingsAnchorEl, setColumnSettingsAnchorEl] = useState<HTMLButtonElement | null>(null);
  const [columnSettingsTarget, setColumnSettingsTarget] = useState<DocumentColumnSettingsTarget>('main');
  const [draggingColumnId, setDraggingColumnId] = useState<string | null>(null);
  const [masterDialog, setMasterDialog] = useState<{ mode: MasterDialogMode; document?: ManagedDocument } | null>(null);
  const [masterForm, setMasterForm] = useState<MasterForm>(emptyMasterForm());
  const [initialVersionForm, setInitialVersionForm] = useState<VersionForm>(emptyVersionForm());
  const [versionDialog, setVersionDialog] = useState<{ document: ManagedDocument; version?: ManagedDocumentVersion } | null>(null);
  const [versionForm, setVersionForm] = useState<VersionForm>(emptyVersionForm());
  const [previewVersion, setPreviewVersion] = useState<FilePreviewTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ document: ManagedDocument; version?: ManagedDocumentVersion } | null>(null);
  const [drawerDocument, setDrawerDocument] = useState<ManagedDocument | null>(null);
  const [drawerVersion, setDrawerVersion] = useState<ManagedDocumentVersion | null>(null);
  const [drawerTab, setDrawerTab] = useState(0);
  const [categoryDialog, setCategoryDialog] = useState<{ mode: 'create' | 'edit'; category?: DocumentCategory } | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState<DocumentCategory | null>(null);
  const [draggingCategoryId, setDraggingCategoryId] = useState('');

  const query = useQuery({
    queryKey: ['managed-documents', selectedCategory, page, pageSize, submittedKeyword],
    queryFn: async () => (await getDocuments({ page, size: pageSize, keyword: submittedKeyword || undefined, categoryId: selectedCategory })).data.data,
  });
  const documents = query.data?.content ?? [];
  const documentCategoriesQuery = useQuery({
    queryKey: ['managed-document-categories'],
    queryFn: async () => (await getDocumentCategories()).data.data,
  });
  const documentCategories = documentCategoriesQuery.data ?? [];
  const auditQuery = useQuery({
    queryKey: ['document-management-audit', drawerVersion ? 'DOCUMENT_VERSION' : 'PROCESS_DOCUMENT', drawerVersion?.id ?? drawerDocument?.id],
    enabled: drawerDocument !== null,
    queryFn: async () => {
      const response = await getAuditLogs({
        entityType: drawerVersion ? 'DOCUMENT_VERSION' : 'PROCESS_DOCUMENT',
        entityId: drawerVersion?.id ?? drawerDocument?.id,
        page: 1,
        size: 100,
      });
      return ((response.data.data as PageResult<AuditLogItem>).content ?? []);
    },
  });
  const auditRecords = useMemo(() => getAuditRecords(auditQuery.data), [auditQuery.data]);

  useEffect(() => { localStorage.setItem(mainColumnWidthStorageKey, JSON.stringify(mainColumnWidths)); }, [mainColumnWidthStorageKey, mainColumnWidths]);
  useEffect(() => { localStorage.setItem(mainColumnSettingsStorageKey, JSON.stringify(mainColumnSettings)); }, [mainColumnSettingsStorageKey, mainColumnSettings]);
  useEffect(() => { localStorage.setItem(versionColumnWidthStorageKey, JSON.stringify(versionColumnWidths)); }, [versionColumnWidthStorageKey, versionColumnWidths]);
  useEffect(() => { localStorage.setItem(versionColumnSettingsStorageKey, JSON.stringify(versionColumnSettings)); }, [versionColumnSettingsStorageKey, versionColumnSettings]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['managed-documents'] });
    void queryClient.invalidateQueries({ queryKey: ['managed-document-categories'] });
  };
  const createMutation = useMutation({
    mutationFn: () => createDocument({
      ...masterForm,
      categoryId: masterForm.categoryId || null,
      description: masterForm.description.trim() || null,
      remark: masterForm.remark.trim() || null,
      version: initialVersionForm.version.trim(),
      code: initialVersionForm.code.trim(),
      fileId: initialVersionForm.fileId || null,
      versionDescription: initialVersionForm.description.trim() || null,
      versionRemark: initialVersionForm.remark.trim() || null,
      effectiveDate: initialVersionForm.effectiveDate || null,
      expiryDate: initialVersionForm.expiryDate || null,
    }),
    onSuccess: () => { invalidate(); setMasterDialog(null); showMessage('文档及初始版本已创建'); },
    onError: (error: Error) => showMessage(error.message, 'error'),
  });
  const updateMutation = useMutation({
    mutationFn: () => updateDocument(masterDialog!.document!.id, masterForm),
    onSuccess: () => { invalidate(); setMasterDialog(null); showMessage('文档信息已更新'); },
    onError: (error: Error) => showMessage(error.message, 'error'),
  });
  const saveVersionMutation = useMutation({
    mutationFn: () => {
      if (!versionDialog) throw new Error('未选择文档版本');
      return versionDialog.version
        ? updateDocumentVersion(versionDialog.document.id, versionDialog.version.id, toVersionPayload(versionForm))
        : createDocumentVersion(versionDialog.document.id, toVersionPayload(versionForm));
    },
    onSuccess: () => { invalidate(); setVersionDialog(null); showMessage('文档版本已保存'); },
    onError: (error: Error) => showMessage(error.message, 'error'),
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteTarget!.version
      ? deleteDocumentVersion(deleteTarget!.document.id, deleteTarget!.version.id)
      : deleteDocument(deleteTarget!.document.id),
    onSuccess: () => { invalidate(); setDeleteTarget(null); showMessage('已删除'); },
    onError: (error: Error) => showMessage(error.message, 'error'),
  });

  const saveCategoryMutation = useMutation({
    mutationFn: () => categoryDialog?.mode === 'edit'
      ? updateDocumentCategory(categoryDialog.category!.id, { name: categoryName.trim() })
      : createDocumentCategory({ name: categoryName.trim() }),
    onSuccess: () => { invalidate(); setCategoryDialog(null); setCategoryName(''); showMessage('文档分类已保存'); },
    onError: (error: Error) => showMessage(error.message, 'error'),
  });
  const deleteCategoryMutation = useMutation({
    mutationFn: () => deleteDocumentCategory(deleteCategoryTarget!.id),
    onSuccess: () => {
      if (selectedCategory === deleteCategoryTarget?.id) selectDocumentCategory(DOCUMENT_CATEGORY_UNCATEGORIZED);
      invalidate(); setDeleteCategoryTarget(null); showMessage('文档分类已删除，旗下文档已转为未分类');
    },
    onError: (error: Error) => showMessage(error.message, 'error'),
  });
  const reorderCategoryMutation = useMutation({
    mutationFn: (ids: string[]) => reorderDocumentCategories(ids),
    onSuccess: () => invalidate(),
    onError: (error: Error) => showMessage(error.message, 'error'),
  });

  const selectDocumentCategory = (category: string) => {
    setSelectedCategory(category); setPage(1); setExpanded(new Set());
  };
  const openCreate = () => {
    const categoryId = selectedCategory === DOCUMENT_CATEGORY_ALL || selectedCategory === DOCUMENT_CATEGORY_UNCATEGORIZED ? '' : selectedCategory;
    setMasterForm(emptyMasterForm(categoryId));
    setInitialVersionForm(emptyVersionForm());
    setMasterDialog({ mode: 'create' });
  };
  const openEdit = (document: ManagedDocument) => {
    setMasterForm({ title: document.title, categoryId: document.categoryId || '', description: document.description || '', remark: document.remark || '' });
    setMasterDialog({ mode: 'edit', document });
  };
  const openVersion = (document: ManagedDocument, version?: ManagedDocumentVersion) => {
    setVersionForm(version ? toVersionForm(version) : emptyVersionForm(nextVersionLabel(document.versions)));
    setVersionDialog({ document, version });
  };
  const toggleExpanded = (id: string) => setExpanded((current) => {
    const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next;
  });
  const expandAllDocuments = () => setExpanded(new Set(documents.map((document) => document.id)));
  const collapseAllDocuments = () => setExpanded(new Set());
  const canSaveMaster = Boolean(masterForm.title.trim() && (masterDialog?.mode === 'edit' || (initialVersionForm.version.trim() && initialVersionForm.code.trim())));
  const activeColumnSettings = columnSettingsTarget === 'main' ? mainColumnSettings : versionColumnSettings;
  const activeColumnSettingsItems = columnSettingsTarget === 'main' ? documentColumns : documentVersionColumns;
  const activeVisibleColumnCount = activeColumnSettings.order.filter((id) => !activeColumnSettings.hidden.includes(id)).length;
  const visibleMainColumns = useMemo(() => getVisibleColumns(documentColumns, mainColumnSettings), [mainColumnSettings]);
  const visibleVersionColumns = useMemo(() => getVisibleColumns(documentVersionColumns, versionColumnSettings), [versionColumnSettings]);
  // Action cells are deliberately non-resizable. Ignore historic persisted action widths
  // while retaining each user's layout and widths for business data columns.
  const getColumnWidth = (column: DocumentColumn, target: DocumentColumnSettingsTarget) => Math.max(
    column.minWidth,
    column.id === 'actions' ? column.defaultWidth : (target === 'main' ? mainColumnWidths : versionColumnWidths)[column.id] ?? column.defaultWidth,
  );
  const mainTableWidth = visibleMainColumns.reduce((total, column) => total + getColumnWidth(column, 'main'), 0);
  const versionTableWidth = visibleVersionColumns.reduce((total, column) => total + getColumnWidth(column, 'version'), 0);
  const sharedTableWidth = Math.max(mainTableWidth, versionTableWidth);
  const mainTableSpacerWidth = Math.max(0, versionTableWidth - mainTableWidth);
  const versionTableSpacerWidth = Math.max(0, mainTableWidth - versionTableWidth);
  const mainTableColumnCount = visibleMainColumns.length + (mainTableSpacerWidth > 0 ? 1 : 0);
  const updateActiveColumnSettings = (updater: (current: DocumentColumnSettings) => DocumentColumnSettings) => {
    if (columnSettingsTarget === 'main') setMainColumnSettings(updater);
    else setVersionColumnSettings(updater);
  };
  const toggleColumnVisibility = (columnId: string) => updateActiveColumnSettings((current) => {
    if (columnId === 'title') return current;
    const visibleCount = current.order.filter((id) => !current.hidden.includes(id)).length;
    const isVisible = !current.hidden.includes(columnId);
    if (isVisible && visibleCount <= 1) return current;
    return { ...current, hidden: isVisible ? [...current.hidden, columnId] : current.hidden.filter((id) => id !== columnId) };
  });
  const reorderColumn = (sourceId: string, targetId: string) => updateActiveColumnSettings((current) => {
    if (sourceId === targetId) return current;
    const order = current.order.filter((id) => id !== sourceId);
    const targetIndex = order.indexOf(targetId);
    if (targetIndex < 0) return current;
    order.splice(targetIndex, 0, sourceId);
    return { ...current, order };
  });
  const startColumnResize = (event: ReactPointerEvent<HTMLDivElement>, column: DocumentColumn, target: DocumentColumnSettingsTarget) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const initialWidth = getColumnWidth(column, target);
    const onMove = (moveEvent: PointerEvent) => {
      const width = Math.max(column.minWidth, initialWidth + moveEvent.clientX - startX);
      if (target === 'main') setMainColumnWidths((current) => ({ ...current, [column.id]: width }));
      else setVersionColumnWidths((current) => ({ ...current, [column.id]: width }));
    };
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };
  const openDetailDrawer = (document: ManagedDocument, version?: ManagedDocumentVersion) => {
    setDrawerDocument(document);
    setDrawerVersion(version ?? null);
    setDrawerTab(0);
  };
  const closeDetailDrawer = () => { setDrawerDocument(null); setDrawerVersion(null); setDrawerTab(0); };

  const downloadWithDefaultProgram = async (version: FilePreviewTarget) => {
    if (!version.fileId) return;
    try {
      const response = await getFileDownloadBlob(version.fileId);
      const blobUrl = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = version.fileName || `文档-${version.version || '文件'}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(blobUrl);
      showMessage('文件已交给系统默认关联程序打开');
    } catch (error) { showMessage(error instanceof Error ? error.message : '文件打开失败', 'error'); }
  };
  const preview = (version: FilePreviewTarget) => {
    if (version.fileId && isOfficeFile(version)) { void downloadWithDefaultProgram(version); return; }
    if (version.fileId && previewKind(version) !== 'unsupported') { setPreviewVersion(version); return; }
    showMessage('该版本未上传可预览的文件', 'warning');
  };

  const openCreateCategoryDialog = () => {
    setCategoryName('');
    setCategoryDialog({ mode: 'create' });
  };
  const openEditCategoryDialog = (category: DocumentCategory) => {
    setCategoryName(category.name);
    setCategoryDialog({ mode: 'edit', category });
  };
  const handleCategoryDrop = (target: DocumentCategory) => {
    if (!draggingCategoryId || target.system || draggingCategoryId === target.id) return;
    const customCategories = documentCategories.filter((category) => !category.system);
    const sourceIndex = customCategories.findIndex((category) => category.id === draggingCategoryId);
    const targetIndex = customCategories.findIndex((category) => category.id === target.id);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const reordered = [...customCategories];
    const [source] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, source);
    reorderCategoryMutation.mutate(reordered.map((category) => category.id));
  };

  const renderDocumentCategoryPanel = () => (
    <Box data-document-category-panel sx={{ height: { xs: 'auto', lg: '100%' }, minHeight: 0, bgcolor: '#fff', border: '1px solid #e4e7ed', borderRadius: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ flex: '0 0 auto', minHeight: 48, px: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e4e7ed' }}>
        <Typography sx={{ fontWeight: 600, color: '#303133' }}>文档分类</Typography>
        <Tooltip title="新增分类" arrow>
          <IconButton size="small" color="primary" aria-label="新增分类" onClick={openCreateCategoryDialog}>
            <Add fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
      <Stack spacing={0.5} sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 1 }}>
        {documentCategories.map((category) => {
          const selected = selectedCategory === category.id;
          return (
            <Box
              key={category.id}
              role="button"
              tabIndex={0}
              draggable={!category.system}
              data-document-category={category.id}
              onDragStart={() => setDraggingCategoryId(category.id)}
              onDragOver={(event) => { if (!category.system) event.preventDefault(); }}
              onDrop={(event) => { event.preventDefault(); handleCategoryDrop(category); }}
              onDragEnd={() => setDraggingCategoryId('')}
              onClick={() => selectDocumentCategory(category.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') selectDocumentCategory(category.id);
              }}
              sx={{ minHeight: 40, px: 1.25, display: 'grid', gridTemplateColumns: category.system ? 'minmax(0, 1fr) auto' : '24px minmax(0, 1fr) auto auto auto', alignItems: 'center', gap: 0.5, borderRadius: 1, cursor: category.system ? 'pointer' : 'grab', color: selected ? '#1890ff' : '#303133', bgcolor: selected ? '#e8f4ff' : 'transparent', opacity: draggingCategoryId === category.id ? 0.55 : 1, '&:hover': { bgcolor: selected ? '#e8f4ff' : '#f5f7fa' } }}
            >
              {!category.system ? <DragIndicator data-document-category-drag-handle fontSize="small" sx={{ color: '#a8abb2' }} /> : null}
              <Typography sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: selected ? 600 : 400 }}>{category.name}</Typography>
              <Typography variant="caption" sx={{ color: selected ? '#1890ff' : '#909399' }}>{category.count}</Typography>
              {!category.system ? <><Tooltip title="编辑分类" arrow><IconButton size="small" aria-label="编辑分类" onClick={(event) => { event.stopPropagation(); openEditCategoryDialog(category); }}><Edit fontSize="small" /></IconButton></Tooltip><Tooltip title="删除分类" arrow><IconButton size="small" color="error" aria-label="删除分类" onClick={(event) => { event.stopPropagation(); setDeleteCategoryTarget(category); }}><Delete fontSize="small" /></IconButton></Tooltip></> : null}
            </Box>
          );
        })}
      </Stack>
    </Box>
  );

  return (
    <Box sx={{ minWidth: 0, height: { xs: 'auto', lg: 'calc(100vh - 150px)' }, display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '260px minmax(0, 1fr)' }, gap: 1.5, minHeight: 0, overflow: 'hidden' }}>
      {renderDocumentCategoryPanel()}
      <Box sx={{ minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 1.5, overflow: 'hidden' }}>
        <Box sx={{ flex: '0 0 auto', border: '1px solid #e4e7ed', borderRadius: 1, bgcolor: '#fff' }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5, alignItems: 'center', p: 2 }}>
          <TextField fullWidth size="small" label="名称/编码" placeholder="请输入" value={keyword} onChange={(event) => setKeyword(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { setPage(1); setSubmittedKeyword(keyword.trim()); } }} sx={{ '& .MuiInputBase-root': { height: 40 }, '& .MuiInputBase-input': { boxSizing: 'border-box' } }} InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }} />
          <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="flex-end" sx={{ gridColumn: { xs: '1', md: '3' } }}>
            <Button size="small" sx={{ height: 40, width: 80, minWidth: 80 }} variant="outlined" startIcon={<RestartAlt />} onClick={() => { setKeyword(''); setSubmittedKeyword(''); setPage(1); }}>重置</Button>
            <Button size="small" sx={{ height: 40, width: 80, minWidth: 80 }} variant="contained" startIcon={<Search />} onClick={() => { setPage(1); setSubmittedKeyword(keyword.trim()); }}>查询</Button>
          </Stack>
        </Box>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, border: '1px solid #e4e7ed', borderRadius: 1, bgcolor: '#fff', overflow: 'hidden' }}>
        <Box sx={{ flex: '0 0 auto', px: 2, py: 0.75, minHeight: 48, borderBottom: '1px solid #ebeef5', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Tooltip title="字段设置" arrow>
              <IconButton aria-label="字段设置" size="small" onClick={(event) => setColumnSettingsAnchorEl(event.currentTarget)} sx={actionToolbarButtonSx}>
                <Box aria-hidden="true" sx={{ position: 'relative', width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ViewColumnRounded sx={{ fontSize: 21 }} />
                  <TuneRounded sx={{ position: 'absolute', right: -3, bottom: -2, fontSize: 13, p: '1px', borderRadius: '50%', bgcolor: '#fff', boxShadow: '0 0 0 1px #fff' }} />
                </Box>
              </IconButton>
            </Tooltip>
            <Tooltip title="全部展开" arrow>
              <IconButton data-document-expand-all aria-label="全部展开" size="small" onClick={expandAllDocuments} sx={actionToolbarButtonSx}>
                <UnfoldMoreRounded fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="全部收起" arrow>
              <IconButton data-document-collapse-all aria-label="全部收起" size="small" onClick={collapseAllDocuments} sx={actionToolbarButtonSx}>
                <UnfoldLessRounded fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
          <Button variant="contained" size="small" startIcon={<Add />} onClick={openCreate}>新增</Button>
        </Box>
        <Popover open={Boolean(columnSettingsAnchorEl)} anchorEl={columnSettingsAnchorEl} onClose={() => setColumnSettingsAnchorEl(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} transformOrigin={{ vertical: 'top', horizontal: 'left' }} PaperProps={{ sx: { mt: 1, width: 220, border: '1px solid #e4e7ed', borderRadius: 1, boxShadow: '0 8px 24px rgba(0,0,0,.12)' } }}>
          <Stack spacing={0.5} sx={{ p: 1.5 }}>
            <Tabs value={columnSettingsTarget} onChange={(_, value: DocumentColumnSettingsTarget) => setColumnSettingsTarget(value)} aria-label="文档管理字段设置切换" sx={{ minHeight: 32, mb: 0.5, '& .MuiTab-root': { minHeight: 32, py: 0, fontSize: 13 } }}>
              <Tab label="主表" value="main" />
              <Tab label="子表" value="version" />
            </Tabs>
            {configurableColumns(activeColumnSettingsItems).filter((column) => activeColumnSettings.order.includes(column.id)).sort((a, b) => activeColumnSettings.order.indexOf(a.id) - activeColumnSettings.order.indexOf(b.id)).map((column) => {
              const checked = !activeColumnSettings.hidden.includes(column.id);
              const disabled = column.id === 'title' || (checked && activeVisibleColumnCount <= 1);
              return <Box key={column.id} draggable onDragStart={() => setDraggingColumnId(column.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (draggingColumnId) reorderColumn(draggingColumnId, column.id); setDraggingColumnId(null); }} onDragEnd={() => setDraggingColumnId(null)} sx={{ display: 'grid', gridTemplateColumns: '24px 34px minmax(0, 1fr)', alignItems: 'center', minHeight: 40, borderRadius: 1, cursor: 'move', color: checked ? '#1890ff' : '#a8abb2', opacity: draggingColumnId === column.id ? 0.55 : 1, '&:hover': { bgcolor: '#f5f7fa' } }}>
                <DragIndicator fontSize="small" sx={{ color: '#909399' }} />
                <input aria-label={`${column.label}字段显隐`} type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleColumnVisibility(column.id)} onClick={(event) => event.stopPropagation()} style={{ width: 16, height: 16 }} />
                <Typography sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{column.label}</Typography>
              </Box>;
            })}
          </Stack>
        </Popover>
        <TableContainer sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}><Table stickyHeader size="small" sx={{ tableLayout: 'fixed', width: sharedTableWidth, minWidth: sharedTableWidth, height: query.isLoading || query.isError || documents.length === 0 ? '100%' : 'auto' }}>
            <colgroup>{visibleMainColumns.map((column) => <Fragment key={column.id}>{column.id === 'actions' && mainTableSpacerWidth > 0 ? <col data-document-main-action-spacer style={{ width: mainTableSpacerWidth }} /> : null}<col style={{ width: getColumnWidth(column, 'main') }} /></Fragment>)}</colgroup>
            <TableHead><TableRow sx={{ '& .MuiTableCell-root': tableHeaderCellSx }}>{visibleMainColumns.map((column) => <Fragment key={column.id}>{column.id === 'actions' && mainTableSpacerWidth > 0 ? <TableCell data-document-main-action-spacer aria-hidden="true" sx={{ width: mainTableSpacerWidth, minWidth: mainTableSpacerWidth, maxWidth: mainTableSpacerWidth, p: 0, ...tableHeaderCellSx }} /> : null}<TableCell sx={{ width: getColumnWidth(column, 'main'), minWidth: column.minWidth, position: 'sticky', top: 0, zIndex: column.id === 'actions' ? 4 : 2, ...(column.id === 'actions' ? getOperationColumnSx(getColumnWidth(column, 'main'), 'head') : tableHeaderCellSx), ...(column.resizable ? { pr: 2, userSelect: 'none' } : {}) }}>
              {column.label}{column.resizable && <Box aria-label={`调整${column.label}列宽`} onPointerDown={(event) => startColumnResize(event, column, 'main')} sx={{ position: 'absolute', top: 0, right: -3, width: 8, height: '100%', cursor: 'col-resize', zIndex: 1 }} />}
            </TableCell></Fragment>)}</TableRow></TableHead>
            <TableBody>{query.isLoading ? <TableRow sx={{ height: '100%' }}><TableStateCell colSpan={mainTableColumnCount} align="center" sx={{ height: '100%', py: 0, color: '#909399' }}>加载中...</TableStateCell></TableRow> : query.isError ? <TableRow sx={{ height: '100%' }}><TableStateCell colSpan={mainTableColumnCount} align="center" sx={{ height: '100%', py: 0, color: '#c62828' }}>{query.error instanceof Error ? query.error.message : '文档加载失败'}</TableStateCell></TableRow> : documents.length === 0 ? <TableRow sx={{ height: '100%' }}><TableStateCell colSpan={mainTableColumnCount} align="center" sx={{ height: '100%', py: 0, color: '#909399' }}>暂无数据</TableStateCell></TableRow> : documents.map((document) => {
              const isExpanded = expanded.has(document.id);
              return <DocumentRows key={document.id} document={document} expanded={isExpanded} mainColumns={visibleMainColumns} versionColumns={visibleVersionColumns} mainTableColumnCount={mainTableColumnCount} sharedTableWidth={sharedTableWidth} mainTableSpacerWidth={mainTableSpacerWidth} versionTableSpacerWidth={versionTableSpacerWidth} getColumnWidth={getColumnWidth} onResizeColumn={startColumnResize} onToggle={() => toggleExpanded(document.id)} onOpenDetail={(version) => openDetailDrawer(document, version)} onEdit={() => openEdit(document)} onAddVersion={() => openVersion(document)} onEditVersion={(version) => openVersion(document, version)} onPreview={preview} onDelete={(version) => setDeleteTarget({ document, version })} />;
            })}</TableBody>
          </Table></TableContainer>
        <Box sx={{ flex: '0 0 auto', minHeight: 56, px: 2, borderTop: '1px solid #ebeef5', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
          <Typography variant="body2" sx={{ color: '#606266', whiteSpace: 'nowrap' }}>共 {query.data?.totalElements ?? 0} 条数据</Typography>
          <Stack direction="row" spacing={1.5} alignItems="center">
            {(query.data?.totalPages ?? 0) > 1 && <Pagination size="small" page={page} count={query.data?.totalPages ?? 0} onChange={(_, next) => setPage(next)} />}
            <FormControl size="small" sx={{ minWidth: 104 }}><Select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>{[20, 50, 100, 200].map((size) => <MenuItem key={size} value={size}>{size} 条/页</MenuItem>)}</Select></FormControl>
          </Stack>
        </Box>
      </Box>
      </Box>

      <DocumentMasterDialog open={Boolean(masterDialog)} selectedCategory={selectedCategory} categories={documentCategories} mode={masterDialog?.mode ?? 'create'} form={masterForm} versionForm={initialVersionForm} onChange={setMasterForm} onVersionChange={setInitialVersionForm} onPreview={preview} onClose={() => setMasterDialog(null)} onSubmit={() => { if (masterDialog?.mode === 'edit') updateMutation.mutate(); else createMutation.mutate(); }} saving={createMutation.isPending || updateMutation.isPending} canSubmit={canSaveMaster} />
      <DocumentVersionDialog open={Boolean(versionDialog)} document={versionDialog?.document ?? null} editing={versionDialog?.version ?? null} form={versionForm} onChange={setVersionForm} onPreview={preview} onClose={() => setVersionDialog(null)} onSubmit={() => saveVersionMutation.mutate()} saving={saveVersionMutation.isPending} />
      <DocumentPreviewDialog version={previewVersion} onClose={() => setPreviewVersion(null)} />
      <DocumentDetailDrawer open={drawerDocument !== null} document={drawerDocument} version={drawerVersion} tab={drawerTab} onTabChange={setDrawerTab} auditRecords={auditRecords} auditLoading={auditQuery.isLoading} auditError={auditQuery.isError} onClose={closeDetailDrawer} />
      <ConfirmDialog open={Boolean(deleteTarget)} title={deleteTarget?.version ? '删除文档版本' : '删除文档'} message={deleteTarget?.version ? `确定删除版本「${deleteTarget.version.version}」吗？` : `确定删除文档「${deleteTarget?.document.title || ''}」及其未被引用版本吗？`} confirmText="删除" destructive loading={deleteMutation.isPending} onCancel={() => setDeleteTarget(null)} onConfirm={() => deleteMutation.mutate()} />
      <AppDialog open={Boolean(categoryDialog)} onClose={saveCategoryMutation.isPending ? undefined : () => setCategoryDialog(null)} fullWidth maxWidth="xs"><DialogTitle>{categoryDialog?.mode === 'edit' ? '编辑文档分类' : '新增文档分类'}</DialogTitle><DialogContent dividers><TextField autoFocus required fullWidth size="small" label="文档分类名称" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && categoryName.trim()) saveCategoryMutation.mutate(); }} /></DialogContent><DialogActions sx={{ px: 3, py: 1.5 }}><Button disabled={saveCategoryMutation.isPending} onClick={() => setCategoryDialog(null)}>取消</Button><Button variant="contained" disabled={!categoryName.trim() || saveCategoryMutation.isPending} onClick={() => saveCategoryMutation.mutate()}>{saveCategoryMutation.isPending ? '保存中...' : '保存'}</Button></DialogActions></AppDialog>
      <ConfirmDialog open={Boolean(deleteCategoryTarget)} title="删除文档分类" message={`确定删除分类「${deleteCategoryTarget?.name || ''}」吗？该分类下的文档将自动转为未分类。`} confirmText="删除" destructive loading={deleteCategoryMutation.isPending} onCancel={() => setDeleteCategoryTarget(null)} onConfirm={() => deleteCategoryMutation.mutate()} />
    </Box>
  );
}

function DocumentRows({ document, expanded, mainColumns, versionColumns, mainTableColumnCount, sharedTableWidth, mainTableSpacerWidth, versionTableSpacerWidth, getColumnWidth, onResizeColumn, onToggle, onOpenDetail, onEdit, onAddVersion, onEditVersion, onPreview, onDelete }: {
  document: ManagedDocument;
  expanded: boolean;
  mainColumns: DocumentColumn[];
  versionColumns: DocumentColumn[];
  mainTableColumnCount: number;
  sharedTableWidth: number;
  mainTableSpacerWidth: number;
  versionTableSpacerWidth: number;
  getColumnWidth: (column: DocumentColumn, target: DocumentColumnSettingsTarget) => number;
  onResizeColumn: (event: ReactPointerEvent<HTMLDivElement>, column: DocumentColumn, target: DocumentColumnSettingsTarget) => void;
  onToggle: () => void;
  onOpenDetail: (version?: ManagedDocumentVersion) => void;
  onEdit: () => void;
  onAddVersion: () => void;
  onEditVersion: (version: ManagedDocumentVersion) => void;
  onPreview: (version: ManagedDocumentVersion) => void;
  onDelete: (version?: ManagedDocumentVersion) => void;
}) {
  const categoryName = document.categoryName || '未分类';
  const renderMainCell = (column: DocumentColumn) => {
    switch (column.id) {
      case 'title': return <TableCell key={column.id}><Stack direction="row" spacing={0.5} alignItems="center"><IconButton size="small" onClick={(event) => { event.stopPropagation(); onToggle(); }} aria-label={expanded ? '收起文档版本' : '展开文档版本'}>{expanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}</IconButton><Typography component="button" type="button" data-document-name-link onClick={(event) => { event.stopPropagation(); onOpenDetail(); }} sx={{ p: 0, border: 0, bgcolor: 'transparent', font: 'inherit', fontWeight: 500, color: '#1890ff', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left', '&:hover': { color: '#096dd9', textDecoration: 'underline' } }}>{document.title}</Typography></Stack></TableCell>;
      case 'type': return <TableCell key={column.id}><Chip size="small" label={categoryName} variant="outlined" /></TableCell>;
      case 'versionCount': return <TableCell key={column.id}>{document.versions.length}</TableCell>;
      case 'createdBy': return <TableCell key={column.id}>{document.createdBy || '-'}</TableCell>;
      case 'createdAt': return <TableCell key={column.id} sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(document.createdAt)}</TableCell>;
      case 'updatedBy': return <TableCell key={column.id}>{document.updatedBy || document.createdBy || '-'}</TableCell>;
      case 'updatedAt': return <TableCell key={column.id} sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(document.updatedAt || document.createdAt)}</TableCell>;
      case 'actions': return <TableCell key={column.id} align="center" sx={getOperationColumnSx(getColumnWidth(column, 'main'), 'body')} onClick={(event) => event.stopPropagation()}>
        <Tooltip title="新增版本"><IconButton size="small" onClick={onAddVersion}><PlaylistAdd fontSize="small" /></IconButton></Tooltip>
        <Tooltip title="编辑文档"><IconButton size="small" onClick={onEdit}><Edit fontSize="small" /></IconButton></Tooltip>
        <Tooltip title="删除文档"><IconButton size="small" color="error" onClick={() => onDelete()}><Delete fontSize="small" /></IconButton></Tooltip>
      </TableCell>;
      default: return null;
    }
  };
  const renderVersionCell = (version: ManagedDocumentVersion, column: DocumentColumn) => {
    const versionStatus = getRdoVersionStatusMeta(version.status);
    switch (column.id) {
      case 'version': return <TableCell key={column.id}>{version.version}</TableCell>;
      case 'code': return <TableCell key={column.id}>{version.code}</TableCell>;
      case 'status': return <TableCell key={column.id}><StatusBadge {...versionStatus} /></TableCell>;
      case 'effectiveDate': return <TableCell key={column.id} sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(version.effectiveDate)}</TableCell>;
      case 'expiryDate': return <TableCell key={column.id} sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(version.expiryDate)}</TableCell>;
      case 'file': return <TableCell key={column.id} sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{version.fileName || '-'}</TableCell>;
      case 'description': return <TableCell key={column.id} sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{version.description || '-'}</TableCell>;
      case 'updatedAt': return <TableCell key={column.id} sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(version.updatedAt || version.createdAt)}</TableCell>;
      case 'actions': return <TableCell key={column.id} align="center" sx={getOperationColumnSx(getColumnWidth(column, 'version'), 'body')} onClick={(event) => event.stopPropagation()}><Tooltip title="预览文件"><span><IconButton size="small" disabled={!version.fileId} onClick={() => onPreview(version)}><PreviewOutlined fontSize="small" /></IconButton></span></Tooltip><Tooltip title="编辑版本"><IconButton size="small" onClick={() => onEditVersion(version)}><Edit fontSize="small" /></IconButton></Tooltip><Tooltip title="删除版本"><IconButton size="small" color="error" onClick={() => onDelete(version)}><Delete fontSize="small" /></IconButton></Tooltip></TableCell>;
      default: return null;
    }
  };
  return <>
    <TableRow hover sx={{ ...tableRowSx, cursor: 'pointer' }} onClick={onToggle}>{mainColumns.map((column) => <Fragment key={column.id}>{column.id === 'actions' && mainTableSpacerWidth > 0 ? <TableCell data-document-main-action-spacer aria-hidden="true" sx={{ width: mainTableSpacerWidth, minWidth: mainTableSpacerWidth, maxWidth: mainTableSpacerWidth, p: 0 }} /> : null}{renderMainCell(column)}</Fragment>)}</TableRow>
    {expanded ? <TableRow sx={{ '& .MuiTableCell-root': { borderBottom: 'none' } }}><TableCell colSpan={mainTableColumnCount} sx={{ p: 0, bgcolor: '#fafcff' }}>
        <TableContainer sx={{ width: '100%', bgcolor: '#fff', overflow: 'visible' }}><Table stickyHeader size="small" aria-label="文档版本列表" sx={{ tableLayout: 'fixed', width: sharedTableWidth, minWidth: sharedTableWidth }}>
          <colgroup>{versionColumns.map((column) => <Fragment key={column.id}>{column.id === 'actions' && versionTableSpacerWidth > 0 ? <col data-document-version-action-spacer style={{ width: versionTableSpacerWidth }} /> : null}<col style={{ width: getColumnWidth(column, 'version') }} /></Fragment>)}</colgroup>
          <TableHead><TableRow sx={{ '& .MuiTableCell-root': tableHeaderCellSx }}>{versionColumns.map((column) => <Fragment key={column.id}>{column.id === 'actions' && versionTableSpacerWidth > 0 ? <TableCell data-document-version-action-spacer aria-hidden="true" sx={{ width: versionTableSpacerWidth, minWidth: versionTableSpacerWidth, maxWidth: versionTableSpacerWidth, p: 0, ...tableHeaderCellSx, py: 0.75 }} /> : null}
            <TableCell
              sx={{
                width: getColumnWidth(column, 'version'), minWidth: column.minWidth, position: 'sticky', top: 0,
                zIndex: column.id === 'actions' ? 4 : 2,
                ...(column.id === 'actions' ? getOperationColumnSx(getColumnWidth(column, 'version'), 'head') : tableHeaderCellSx), py: 0.75,
                ...(column.resizable ? { pr: 2, userSelect: 'none' } : {}),
              }}
            >
              {column.label}
              {column.resizable && <Box aria-label={`调整${column.label}列宽`} onPointerDown={(event) => onResizeColumn(event, column, 'version')} sx={{ position: 'absolute', top: 0, right: -3, width: 8, height: '100%', cursor: 'col-resize', zIndex: 1 }} />}
            </TableCell>
          </Fragment>)}</TableRow></TableHead>
          <TableBody>{document.versions.map((version) => <TableRow key={version.id} hover onClick={() => onOpenDetail(version)} sx={{ cursor: 'pointer', '& > .MuiTableCell-root': { height: 40, py: 0.5, borderBottom: '1px solid #ebeef5' } }}>{versionColumns.map((column) => <Fragment key={column.id}>{column.id === 'actions' && versionTableSpacerWidth > 0 ? <TableCell data-document-version-action-spacer aria-hidden="true" sx={{ width: versionTableSpacerWidth, minWidth: versionTableSpacerWidth, maxWidth: versionTableSpacerWidth, p: 0 }} /> : null}{renderVersionCell(version, column)}</Fragment>)}</TableRow>)}</TableBody>
        </Table></TableContainer>
    </TableCell></TableRow> : null}
  </>;
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return <Box sx={{ bgcolor: '#fff', border: '1px solid #e4e7ed', borderRadius: 1, overflow: 'hidden' }}>
    <Box sx={{ px: 1.5, py: 1, borderBottom: '1px solid #e4e7ed', bgcolor: '#f8fafc' }}><Typography sx={{ fontWeight: 600, color: '#303133' }}>{title}</Typography></Box>
    <Box sx={{ p: 1.5 }}>{children}</Box>
  </Box>;
}

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return <Box sx={{ minWidth: 0 }}>
    <Typography variant="caption" sx={{ color: '#909399', display: 'block', mb: 0.5 }}>{label}</Typography>
    <Typography variant="body2" sx={{ color: '#303133', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{children || '-'}</Typography>
  </Box>;
}

function DocumentAuditFieldBlock({ title, fields }: { title: string; fields: AuditField[] }) {
  return <Box sx={{ border: '1px solid #e4e7ed', borderRadius: 1, bgcolor: '#f8fafc', p: 1 }}>
    <Typography variant="caption" sx={{ display: 'block', mb: 0.75, color: '#606266', fontWeight: 600 }}>{title}</Typography>
    <Stack spacing={0.75}>{fields.length === 0 ? <Typography variant="caption" sx={{ color: '#909399' }}>无</Typography> : fields.map((field) => <Box key={field.label} sx={{ display: 'grid', gridTemplateColumns: '84px minmax(0, 1fr)', gap: 1 }}>
      <Typography variant="caption" sx={{ color: '#606266' }}>{field.label}</Typography><Typography variant="caption" sx={{ color: '#303133', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{field.value}</Typography>
    </Box>)}</Stack>
  </Box>;
}

function DocumentDetailDrawer({ open, document, version, tab, onTabChange, auditRecords, auditLoading, auditError, onClose }: {
  open: boolean;
  document: ManagedDocument | null;
  version: ManagedDocumentVersion | null;
  tab: number;
  onTabChange: (value: number) => void;
  auditRecords: AuditRecord[];
  auditLoading: boolean;
  auditError: boolean;
  onClose: () => void;
}) {
  const versionStatus = version ? getRdoVersionStatusMeta(version.status) : undefined;
  return <Drawer anchor="right" open={open} onClose={onClose} sx={appContentDrawerSx} slotProps={{ backdrop: { sx: appContentDrawerSx } }} PaperProps={{ sx: appContentDrawerPaperSx }}>
    <Box sx={{ p: 2, bgcolor: '#f7f9fc', minHeight: '100%', overflow: 'auto' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}><Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#303133' }}>信息查看</Typography><IconButton size="small" onClick={onClose} aria-label="关闭详情"><Close /></IconButton></Stack>
      {!document ? null : <>
        <Box sx={{ borderBottom: '1px solid #e4e7ed' }}><Tabs value={tab} onChange={(_, value: number) => onTabChange(value)} aria-label="文档详情切换"><Tab label="数据信息" /><Tab label="数据审计" /></Tabs></Box>
        {tab === 0 ? <Stack spacing={2} sx={{ mt: 2 }}>
          <DetailSection title="基本信息"><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
            <DetailField label="文档名称">{document.title}</DetailField>
            <DetailField label="文档分类">{document.categoryName || '未分类'}</DetailField>
            {version ? <><DetailField label="版本号">{version.version}</DetailField><DetailField label="文档编码">{version.code}</DetailField><DetailField label="版本状态">{versionStatus ? <StatusBadge label={versionStatus.label} color={versionStatus.color} /> : '-'}</DetailField><DetailField label="生效时间">{formatDateTime(version.effectiveDate)}</DetailField><DetailField label="失效时间">{formatDateTime(version.expiryDate)}</DetailField><DetailField label="版本文件">{version.fileName || '-'}</DetailField><DetailField label="版本说明">{version.description || '-'}</DetailField><DetailField label="备注">{version.remark || '-'}</DetailField></> : <><DetailField label="版本数量">{document.versions.length}</DetailField><DetailField label="文档描述">{document.description || '-'}</DetailField><DetailField label="备注">{document.remark || '-'}</DetailField></>}
          </Box></DetailSection>
          <DetailSection title="系统信息"><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
            <DetailField label="创建人">{version?.createdBy || document.createdBy || '-'}</DetailField><DetailField label="创建时间">{formatDateTime(version?.createdAt || document.createdAt)}</DetailField><DetailField label="更新人">{version?.updatedBy || version?.createdBy || document.updatedBy || document.createdBy || '-'}</DetailField><DetailField label="更新时间">{formatDateTime(version?.updatedAt || version?.createdAt || document.updatedAt || document.createdAt)}</DetailField>
          </Box></DetailSection>
        </Stack> : <Stack spacing={2} sx={{ mt: 2 }}><DetailSection title="审计记录"><Stack spacing={1}>
          {auditLoading ? <AuditState message="审计记录加载中" /> : auditError ? <AuditState message="审计记录加载失败" error /> : auditRecords.length === 0 ? <AuditState message="暂无审计记录" /> : auditRecords.map((record) => <Accordion key={record.id} disableGutters elevation={0} sx={{ border: '1px solid #e4e7ed', borderRadius: '4px !important', bgcolor: '#fff', overflow: 'hidden', '&::before': { display: 'none' }, '&.Mui-expanded': { m: 0 } }}>
            <AccordionSummary expandIcon={<ExpandMore fontSize="small" />} sx={{ minHeight: 44, px: 1.5, '&.Mui-expanded': { minHeight: 44 }, '& .MuiAccordionSummary-content': { m: 0, minWidth: 0 }, '& .MuiAccordionSummary-content.Mui-expanded': { m: 0 } }}><Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.35fr', columnGap: 1, width: '100%', minWidth: 0, alignItems: 'center' }}><Typography variant="body2" noWrap>{record.operatorName}</Typography><Typography variant="body2" noWrap>{record.actionLabel}</Typography><Typography variant="body2" noWrap sx={{ color: '#606266' }}>{formatDateTime(record.operatedAt)}</Typography></Box></AccordionSummary>
            <AccordionDetails sx={{ px: 1.5, pt: 0, pb: 1.5 }}><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}><DocumentAuditFieldBlock title="变更前" fields={record.beforeFields} /><DocumentAuditFieldBlock title="变更后" fields={record.afterFields} /></Box></AccordionDetails>
          </Accordion>)}
        </Stack></DetailSection></Stack>}
      </>}
    </Box>
  </Drawer>;
}

function AuditState({ message, error = false }: { message: string; error?: boolean }) {
  return <Box sx={{ px: 1.5, py: 3, textAlign: 'center', color: error ? '#f56c6c' : '#909399', bgcolor: '#fff', border: `1px solid ${error ? '#fbc4c4' : '#e4e7ed'}`, borderRadius: 1 }}><Typography variant="body2">{message}</Typography></Box>;
}

function DocumentMasterDialog({ open, selectedCategory, categories, mode, form, versionForm, onChange, onVersionChange, onPreview, onClose, onSubmit, saving, canSubmit }: {
  open: boolean; selectedCategory: string; categories: DocumentCategory[]; mode: MasterDialogMode; form: MasterForm; versionForm: VersionForm; onChange: (form: MasterForm) => void; onVersionChange: (form: VersionForm) => void; onPreview: (file: FilePreviewTarget) => void; onClose: () => void; onSubmit: () => void; saving: boolean; canSubmit: boolean;
}) {
  const isCreate = mode === 'create';
  const categoryLocked = !isCreate || selectedCategory !== DOCUMENT_CATEGORY_ALL;
  const categoryName = form.categoryId ? categories.find((category) => category.id === form.categoryId)?.name || '-' : '未分类';
  const set = <K extends keyof MasterForm>(key: K, value: MasterForm[K]) => onChange({ ...form, [key]: value });
  return <AppDialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="md"><DialogTitle>{isCreate ? '新增文档' : '编辑文档'}</DialogTitle><DialogContent dividers>
    <Stack spacing={1.5} sx={{ pt: 0.5 }}>
    <DetailSection title="基础信息"><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }}>
      {categoryLocked ? <Stack spacing={0.25} justifyContent="center" sx={{ minHeight: 40, px: 0.25 }}><Typography variant="caption" sx={{ color: '#909399', lineHeight: 1.2 }}>文档分类</Typography><Typography sx={{ color: '#303133', fontSize: 14, lineHeight: 1.35 }}>{categoryName}</Typography></Stack> : <TextField select size="small" label="文档分类" value={form.categoryId} onChange={(event) => set('categoryId', event.target.value)}><MenuItem value="">未分类</MenuItem>{categories.filter((category) => category.id !== DOCUMENT_CATEGORY_ALL && category.id !== DOCUMENT_CATEGORY_UNCATEGORIZED).map((category) => <MenuItem key={category.id} value={category.id}>{category.name}</MenuItem>)}</TextField>}
      <TextField required size="small" label="文档名称" value={form.title} onChange={(event) => set('title', event.target.value)} sx={{ gridColumn: { sm: '1 / -1' } }} />
      <TextField size="small" label="文档描述" value={form.description} onChange={(event) => set('description', event.target.value)} multiline minRows={2} sx={{ gridColumn: { sm: '1 / -1' } }} />
      <TextField size="small" label="备注" value={form.remark} onChange={(event) => set('remark', event.target.value)} multiline minRows={2} sx={{ gridColumn: { sm: '1 / -1' } }} />
    </Box></DetailSection>
    {isCreate && <DetailSection title="版本信息"><VersionFields form={versionForm} onChange={onVersionChange} onPreview={onPreview} /></DetailSection>}
    </Stack>
  </DialogContent><DialogActions sx={{ px: 3, py: 1.5 }}><Button onClick={onClose} disabled={saving}>取消</Button><Button variant="contained" disabled={!canSubmit || saving} onClick={onSubmit}>{saving ? '保存中...' : '保存'}</Button></DialogActions></AppDialog>;
}

function DocumentVersionDialog({ open, document, editing, form, onChange, onPreview, onClose, onSubmit, saving }: {
  open: boolean; document: ManagedDocument | null; editing: ManagedDocumentVersion | null; form: VersionForm; onChange: (form: VersionForm) => void; onPreview: (file: FilePreviewTarget) => void; onClose: () => void; onSubmit: () => void; saving: boolean;
}) {
  return <AppDialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="md"><DialogTitle>{editing ? '编辑文档版本' : '新增文档版本'}{document ? ` - ${document.title}` : ''}</DialogTitle><DialogContent dividers><DetailSection title="版本信息"><VersionFields form={form} onChange={onChange} onPreview={onPreview} /></DetailSection></DialogContent><DialogActions sx={{ px: 3, py: 1.5 }}><Button onClick={onClose} disabled={saving}>取消</Button><Button variant="contained" disabled={!form.version.trim() || !form.code.trim() || saving} onClick={onSubmit}>{saving ? '保存中...' : '保存'}</Button></DialogActions></AppDialog>;
}

function VersionFields({ form, onChange, onPreview }: { form: VersionForm; onChange: (form: VersionForm) => void; onPreview: (file: FilePreviewTarget) => void }) {
  const { showMessage } = useSnackbar();
  const [uploading, setUploading] = useState(false);
  const set = <K extends keyof VersionForm>(key: K, value: VersionForm[K]) => onChange({ ...form, [key]: value });
  const selectFile = async (file?: File, input?: HTMLInputElement) => {
    if (!file) return;
    try {
      setUploading(true);
      const response = await uploadDocumentFile(file);
      const uploaded = response.data.data;
      onChange({ ...form, fileId: uploaded.fileId, fileName: uploaded.originalName, fileMimeType: uploaded.mimeType });
      showMessage('文件已上传，保存版本后生效');
    } catch (error) { showMessage(error instanceof Error ? error.message : '文件上传失败', 'error'); }
    finally { setUploading(false); if (input) input.value = ''; }
  };
  return <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }}>
    <TextField required size="small" label="版本号" value={form.version} onChange={(event) => set('version', event.target.value)} />
    <TextField required size="small" label="文档编码" value={form.code} onChange={(event) => set('code', event.target.value)} />
    <TextField size="small" label="版本文件" value={form.fileName} placeholder="未上传文件" fullWidth InputProps={{ readOnly: true, endAdornment: <InputAdornment position="end" sx={{ mr: -0.75 }}><Stack direction="row" spacing={0.25} alignItems="center"><Tooltip title="预览文件"><span><IconButton size="small" aria-label="预览版本文件" disabled={!form.fileId || uploading} onClick={() => onPreview({ fileId: form.fileId, fileName: form.fileName, fileMimeType: form.fileMimeType, version: form.version })}><PreviewOutlined fontSize="small" /></IconButton></span></Tooltip><Button component="label" size="small" startIcon={<UploadFileOutlined fontSize="small" />} disabled={uploading} sx={{ minWidth: 76, whiteSpace: 'nowrap' }}>{uploading ? '上传中' : form.fileName ? '替换' : '上传'}<input hidden type="file" accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.mp4,.webm,.mov,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip" onChange={(event) => { void selectFile(event.target.files?.[0], event.currentTarget); }} /></Button></Stack></InputAdornment> }} inputProps={{ title: form.fileName || '未上传文件' }} />
    <TextField size="small" label="生效时间" type="datetime-local" value={form.effectiveDate} onChange={(event) => set('effectiveDate', event.target.value)} InputLabelProps={{ shrink: true }} />
    <TextField size="small" label="失效时间" type="datetime-local" value={form.expiryDate} onChange={(event) => set('expiryDate', event.target.value)} InputLabelProps={{ shrink: true }} />
    <TextField size="small" label="版本说明" value={form.description} onChange={(event) => set('description', event.target.value)} multiline minRows={2} sx={{ gridColumn: { sm: '1 / -1' } }} />
    <TextField size="small" label="备注" value={form.remark} onChange={(event) => set('remark', event.target.value)} multiline minRows={2} sx={{ gridColumn: { sm: '1 / -1' } }} />
  </Box>;
}

function DocumentPreviewDialog({ version, onClose }: { version: FilePreviewTarget | null; onClose: () => void }) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const { showMessage } = useSnackbar();
  useEffect(() => {
    let objectUrl = '';
    if (!version?.fileId) { setUrl(''); return undefined; }
    setLoading(true);
    getFilePreviewBlob(version.fileId).then((response) => { objectUrl = URL.createObjectURL(response.data); setUrl(objectUrl); }).catch((error) => showMessage(error instanceof Error ? error.message : '文件预览加载失败', 'error')).finally(() => setLoading(false));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [showMessage, version?.fileId]);
  const kind = version ? previewKind(version) : 'unsupported';
  return <AppDialog open={Boolean(version)} onClose={onClose} fullWidth maxWidth="lg"><DialogTitle>预览文件{version?.fileName ? ` - ${version.fileName}` : ''}</DialogTitle><DialogContent dividers sx={{ minHeight: 520, display: 'grid', placeItems: 'center', bgcolor: '#f5f7fa' }}>
    {loading ? <Typography color="text.secondary">文件加载中...</Typography> : !url ? <Typography color="text.secondary">暂无可预览文件</Typography> : kind === 'image' ? <Box component="img" src={url} alt={version?.fileName || '文档预览'} sx={{ maxWidth: '100%', maxHeight: 600, objectFit: 'contain' }} /> : kind === 'video' ? <Box component="video" src={url} controls sx={{ maxWidth: '100%', maxHeight: 600 }} /> : <Box component="iframe" title="文档预览" src={url} sx={{ border: 0, width: '100%', height: 580, bgcolor: '#fff' }} />}
  </DialogContent><DialogActions sx={{ px: 3, py: 1.5 }}><Button onClick={onClose}>关闭</Button></DialogActions></AppDialog>;
}
