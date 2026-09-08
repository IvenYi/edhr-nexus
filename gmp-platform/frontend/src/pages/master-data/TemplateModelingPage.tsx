import TableStateCell from '@/components/TableStateCell';
import {
  ContentCopy,
  DataObjectOutlined,
  DragIndicator,
  ExpandLess,
  PlaylistAdd,
  RestartAlt,
  Search,
  TuneRounded,
  UnfoldLessRounded,
  UnfoldMoreRounded,
  ViewColumnRounded,
  VisibilityOutlined,
} from '@mui/icons-material';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
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
  Select,
  Stack,
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
import StatusBadge from '@/components/StatusBadge';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AddIcon from '@mui/icons-material/Add';
import DesignServicesIcon from '@mui/icons-material/DesignServices';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CloseIcon from '@mui/icons-material/Close';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Fragment,
  Suspense,
  type DragEvent as ReactDragEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  lazy,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  createBatchRecordTemplate,
  createDhrTemplateVersion,
  createFormTemplate,
  createFormTemplateVersion,
  createTemplateModelingCategory,
  deleteBatchRecordTemplate,
  deleteDhrTemplateVersion,
  deleteFormTemplate,
  deleteFormTemplateVersion,
  deleteTemplateModelingCategory,
  getBatchRecordTemplates,
  getFormTemplates,
  getTemplateModelingCategories,
  reorderTemplateModelingCategories,
  saveFormTemplateVersionDesign,
  type TemplateCategoryRecord,
  type TemplateModelingPageKey,
  type TemplateModelingPayload,
  type TemplateModelingRecord,
  type TemplateVersionRecord,
  updateBatchRecordTemplate,
  updateDhrTemplateVersion,
  updateFormTemplate,
  updateFormTemplateVersion,
  updateTemplateModelingCategory,
} from '@/api/template-modeling';
import { getAuditLogs, type AuditLogItem } from '@/api/audit';
import { useSnackbar } from '@/components/SnackbarProvider';
import type { PageResult } from '@/types/common';
import { getRdoVersionStatusMeta } from '@/utils/rdoVersionStatus';
import DhrTemplateWorkspaceDialog from './DhrTemplateWorkspaceDialog';

const TemplateDesignerReactDialog = lazy(() => import('./template-designer-react'));

const TEMPLATE_CATEGORY_ALL = 'ALL';
const TEMPLATE_CATEGORY_UNCATEGORIZED = 'UNCATEGORIZED';
const TEMPLATE_STATUS_OPTIONS = [
  { value: 'ALL', label: '全部' },
  { value: 'ACTIVE', label: '生效' },
  { value: 'EXPIRED', label: '失效' },
] as const;

type TemplateColumnId = 'name' | 'code' | 'offlineVersion' | 'versionCount' | 'directoryCount' | 'version' | 'evidenceCount' | 'categoryName' | 'effectiveFrom' | 'effectiveTo' | 'description' | 'status' | 'createdBy' | 'createdAt' | 'updatedBy' | 'updatedAt' | 'actions';
type ConfigurableTemplateColumnId = Exclude<TemplateColumnId, 'actions'>;
type TemplateColumnSettingsTarget = 'main' | 'version';

interface TemplateColumn {
  id: TemplateColumnId;
  label: string;
  defaultWidth: number;
  minWidth: number;
  resizable?: boolean;
  align?: 'left' | 'center' | 'right';
}

interface TemplateColumnSettings {
  version: number;
  order: ConfigurableTemplateColumnId[];
  hidden: ConfigurableTemplateColumnId[];
}

type TemplateColumnWidths = Partial<Record<TemplateColumnId, number>>;
interface TemplateDesignerState {
  open: boolean;
  row: TemplateModelingRecord | null;
  version: TemplateVersionRecord | null;
}

interface DhrWorkspaceState {
  row: TemplateModelingRecord;
  initialVersionId?: string | number | null;
}

interface DhrVersionDialogState {
  row: TemplateModelingRecord;
  mode: 'create' | 'copy' | 'edit';
  sourceVersion: TemplateVersionRecord | null;
  targetVersion: TemplateVersionRecord | null;
}

interface TemplatePageConfig {
  title: string;
  entityType: 'FORM_TEMPLATE' | 'DHR_TEMPLATE';
  queryKey: string;
  categoryQueryKey: string;
  auditQueryKey: string;
  createTitle: string;
  editTitle: string;
  createAction: (body: TemplateModelingPayload) => Promise<{ data: { data: TemplateModelingRecord } }>;
  updateAction: (id: string | number, body: TemplateModelingPayload) => Promise<{ data: { data: TemplateModelingRecord } }>;
  deleteAction: (id: string | number) => Promise<unknown>;
  listAction: (params: Record<string, unknown>) => Promise<{ data: { data: PageResult<TemplateModelingRecord> } }>;
}

const TEMPLATE_MODELING_PAGE_CONFIGS: Record<TemplateModelingPageKey, TemplatePageConfig> = {
  formTemplates: {
    title: '表单模板',
    entityType: 'FORM_TEMPLATE',
    queryKey: 'template-modeling-form-templates',
    categoryQueryKey: 'template-modeling-form-template-categories',
    auditQueryKey: 'template-modeling-form-template-audit',
    createTitle: '新增表单模板',
    editTitle: '编辑表单模板',
    createAction: createFormTemplate,
    updateAction: updateFormTemplate,
    deleteAction: deleteFormTemplate,
    listAction: getFormTemplates,
  },
  batchRecordTemplates: {
    title: '批记录模板',
    entityType: 'DHR_TEMPLATE',
    queryKey: 'template-modeling-batch-record-templates',
    categoryQueryKey: 'template-modeling-batch-record-template-categories',
    auditQueryKey: 'template-modeling-batch-record-template-audit',
    createTitle: '新增批记录模板',
    editTitle: '编辑批记录模板',
    createAction: createBatchRecordTemplate,
    updateAction: updateBatchRecordTemplate,
    deleteAction: deleteBatchRecordTemplate,
    listAction: getBatchRecordTemplates,
  },
};

const PAGE_SIZE_OPTIONS = [20, 50, 100, 200] as const;
const TABLE_DATA_ROW_HEIGHT = 40;
const TEMPLATE_COLUMN_WIDTH_STORAGE_PREFIX = 'template-modeling-column-widths:';
const TEMPLATE_COLUMN_SETTINGS_STORAGE_PREFIX = 'template-modeling-column-settings:';
const TEMPLATE_VERSION_COLUMN_WIDTH_STORAGE_PREFIX = 'template-modeling-version-column-widths:';
const TEMPLATE_VERSION_COLUMN_SETTINGS_STORAGE_PREFIX = 'template-modeling-version-column-settings:';
const TEMPLATE_COLUMN_SETTINGS_VERSION = 3;
const TEMPLATE_FIELD_COLUMN_MIN_WIDTH = 80;
const TEMPLATE_ACTION_COLUMN_WIDTH = 128;
const DHR_VERSION_ACTION_COLUMN_WIDTH = 160;
const TEMPLATE_VERSION_FIELD_IDS: Array<keyof TemplateModelingPayload> = ['version', 'versionDescription', 'effectiveFrom', 'effectiveTo'];
const QUERY_BUTTON_SX = { height: 40, width: 80, minWidth: 80 };
const appContentDrawerSx = {
  top: 0,
  bottom: 0,
  zIndex: (theme: { zIndex: { drawer: number } }) => theme.zIndex.drawer + 2,
  '& .MuiBackdrop-root': {
    top: 0,
  },
};
const appContentDrawerPaperSx = {
  ...appContentDrawerSx,
  top: 0,
  bottom: 0,
  height: '100vh',
  transform: 'none !important',
};

const formTemplateColumns: TemplateColumn[] = [
  { id: 'name', label: '表单名称', defaultWidth: 180, minWidth: TEMPLATE_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'code', label: '表单编码', defaultWidth: 140, minWidth: TEMPLATE_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'versionCount', label: '版本数量', defaultWidth: 120, minWidth: TEMPLATE_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'categoryName', label: '模板分类', defaultWidth: 140, minWidth: TEMPLATE_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'description', label: '模板描述', defaultWidth: 220, minWidth: TEMPLATE_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'status', label: '状态', defaultWidth: 100, minWidth: TEMPLATE_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'createdBy', label: '创建人', defaultWidth: 120, minWidth: TEMPLATE_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'createdAt', label: '创建时间', defaultWidth: 160, minWidth: TEMPLATE_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'updatedBy', label: '更新人', defaultWidth: 120, minWidth: TEMPLATE_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'updatedAt', label: '更新时间', defaultWidth: 160, minWidth: TEMPLATE_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'actions', label: '操作', defaultWidth: TEMPLATE_ACTION_COLUMN_WIDTH, minWidth: TEMPLATE_ACTION_COLUMN_WIDTH, align: 'center' },
];

const batchTemplateColumns: TemplateColumn[] = [
  { id: 'name', label: '模板名称', defaultWidth: 180, minWidth: TEMPLATE_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'versionCount', label: '版本数量', defaultWidth: 120, minWidth: TEMPLATE_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'categoryName', label: '模板分类', defaultWidth: 140, minWidth: TEMPLATE_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'description', label: '模板描述', defaultWidth: 220, minWidth: TEMPLATE_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'createdBy', label: '创建人', defaultWidth: 120, minWidth: TEMPLATE_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'createdAt', label: '创建时间', defaultWidth: 160, minWidth: TEMPLATE_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'updatedBy', label: '更新人', defaultWidth: 120, minWidth: TEMPLATE_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'updatedAt', label: '更新时间', defaultWidth: 160, minWidth: TEMPLATE_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'actions', label: '操作', defaultWidth: TEMPLATE_ACTION_COLUMN_WIDTH, minWidth: TEMPLATE_ACTION_COLUMN_WIDTH, align: 'center' },
];

const templateVersionColumns: TemplateColumn[] = [
  { id: 'version', label: '表单模板版本号', defaultWidth: 140, minWidth: TEMPLATE_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'status', label: '版本状态', defaultWidth: 100, minWidth: TEMPLATE_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'effectiveFrom', label: '生效日期', defaultWidth: 160, minWidth: TEMPLATE_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'effectiveTo', label: '失效日期', defaultWidth: 160, minWidth: TEMPLATE_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'description', label: '版本说明', defaultWidth: 220, minWidth: TEMPLATE_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'createdBy', label: '创建人', defaultWidth: 120, minWidth: TEMPLATE_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'createdAt', label: '创建时间', defaultWidth: 160, minWidth: TEMPLATE_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'updatedBy', label: '更新人', defaultWidth: 120, minWidth: TEMPLATE_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'updatedAt', label: '更新时间', defaultWidth: 160, minWidth: TEMPLATE_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'actions', label: '操作', defaultWidth: TEMPLATE_ACTION_COLUMN_WIDTH, minWidth: TEMPLATE_ACTION_COLUMN_WIDTH, align: 'center' },
];

const dhrTemplateVersionColumns: TemplateColumn[] = [
  { id: 'version', label: '批记录模板版本号', defaultWidth: 160, minWidth: TEMPLATE_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'code', label: '模板编码', defaultWidth: 160, minWidth: TEMPLATE_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'offlineVersion', label: '线下版本', defaultWidth: 140, minWidth: TEMPLATE_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'status', label: '版本状态', defaultWidth: 100, minWidth: TEMPLATE_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'effectiveFrom', label: '生效时间', defaultWidth: 160, minWidth: TEMPLATE_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'effectiveTo', label: '失效时间', defaultWidth: 160, minWidth: TEMPLATE_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'description', label: '版本说明', defaultWidth: 220, minWidth: TEMPLATE_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'directoryCount', label: '目录数', defaultWidth: 100, minWidth: TEMPLATE_FIELD_COLUMN_MIN_WIDTH, resizable: true, align: 'center' },
  { id: 'evidenceCount', label: '表单证据数', defaultWidth: 120, minWidth: TEMPLATE_FIELD_COLUMN_MIN_WIDTH, resizable: true, align: 'center' },
  { id: 'createdAt', label: '创建时间', defaultWidth: 160, minWidth: TEMPLATE_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'actions', label: '操作', defaultWidth: DHR_VERSION_ACTION_COLUMN_WIDTH, minWidth: DHR_VERSION_ACTION_COLUMN_WIDTH, align: 'center' },
];

const auditFieldLabelMap: Record<string, string> = {
  code: '模板编码',
  offlineVersion: '线下版本',
  name: '模板名称',
  templateCode: '模板编码',
  templateName: '模板名称',
  templateCategory: '模板分类',
  versionCount: '版本数量',
  version: '版本号',
  effectiveFrom: '生效时间',
  effectiveTo: '失效时间',
  sourceFileName: '源文件名称',
  sourceFileType: '源文件类型',
  importStatus: '导入状态',
  categoryName: '分类名称',
  templateType: '模板类型',
  templateCount: '模板数量',
  description: '模板描述',
  status: '状态',
  sortOrder: '排序',
  createdBy: '创建人',
  createdAt: '创建时间',
  updatedBy: '更新人',
  updatedAt: '更新时间',
  evidenceCount: '表单证据数',
  directoryCount: '目录数',
  directoryId: '目录 ID',
  directoryName: '目录名称',
  parentId: '上级目录 ID',
  formTemplateId: '表单模板 ID',
  formTemplateVersionId: '表单版本 ID',
  formCode: '表单编码',
  formName: '表单名称',
  formVersion: '表单版本',
  displayName: 'DHR 内表单名称',
  required: '必填证据',
  directorySnapshot: '目录和表单快照',
  modelingChange: '建模变更',
  modelDesignJson: '表单模型快照',
  canvasDesignJson: '表单画布快照',
  workflowDesignJson: '表单流程快照',
};

const auditSnapshotFields = new Set([
  'directorySnapshot',
  'modelingChange',
  'modelDesignJson',
  'canvasDesignJson',
  'workflowDesignJson',
]);

interface TemplateFormState {
  code: string;
  name: string;
  categoryName: string;
  description: string;
  versionDescription: string;
  version: string;
  offlineVersion: string;
  effectiveFrom: string;
  effectiveTo: string;
  status: string;
}

interface TemplateCategoryOption extends TemplateCategoryRecord {
  value: string;
  label: string;
  system: boolean;
}

interface TemplateAuditRecord {
  id: string;
  operatorName: string;
  actionLabel: string;
  operatedAt?: string;
  beforeFields: AuditFieldRow[];
  afterFields: AuditFieldRow[];
}

interface AuditFieldRow {
  field: string;
  label: string;
  value: string;
  rawValue: unknown;
  isSnapshot: boolean;
}

interface AuditSnapshotDialogState {
  title: string;
  value: unknown;
}

function emptyForm(categoryName = ''): TemplateFormState {
  return { code: '', name: '', categoryName, description: '', versionDescription: '', version: 'V1.0', offlineVersion: '', effectiveFrom: defaultEffectiveFromValue(), effectiveTo: '', status: 'ACTIVE' };
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (input: number) => String(input).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function renderStatusBadge(value?: string | null) {
  return <StatusBadge {...getRdoVersionStatusMeta(value)} />;
}

function normalizeJson(value?: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function getAuditActionLabel(action?: string) {
  if (action === 'CREATE') return '创建';
  if (action === 'UPDATE') return '更新';
  if (action === 'DELETE') return '删除';
  return action || '-';
}

function getAuditFieldLabel(field: string) {
  return auditFieldLabelMap[field] ?? field;
}

function toDisplayText(value: unknown) {
  if (value === null || value === undefined || value === '') return '';
  return String(value);
}

function formatModelingChangeValue(value: unknown): string {
  const change = normalizeJson(value);
  const type = toDisplayText(change.type) || '建模变更';
  const details = normalizeJson(change.details);
  const displayName = toDisplayText(details.displayName);
  const formName = toDisplayText(details.formName);
  const formVersion = toDisplayText(details.formVersion);
  const formCode = toDisplayText(details.formCode);
  const directoryName = toDisplayText(details.directoryName);
  const sortOrder = toDisplayText(details.sortOrder);
  const parts = [type];
  if (directoryName) parts.push(`目录：${directoryName}`);
  if (displayName || formName) parts.push(`表单：${displayName || formName}`);
  if (formCode) parts.push(`表单编码：${formCode}`);
  if (formVersion) parts.push(`表单版本：${formVersion}`);
  if (sortOrder) parts.push(`排序：${sortOrder}`);
  return parts.length > 1 ? parts.join('；') : '已记录';
}

function formatAuditValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  if (field === 'modelingChange') return formatModelingChangeValue(value);
  if (auditSnapshotFields.has(field)) return '已记录';
  if (field === 'status') return getRdoVersionStatusMeta(String(value)).label;
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (field === 'createdAt' || field === 'updatedAt' || field === 'effectiveFrom' || field === 'effectiveTo') return formatDateTime(String(value));
  if (Array.isArray(value)) return value.map((item) => formatAuditValue(field, item)).join('、');
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

function toAuditRows(content?: unknown) {
  return Object.entries(normalizeJson(content)).map(([field, value]) => ({
    field,
    label: getAuditFieldLabel(field),
    value: formatAuditValue(field, value),
    rawValue: value,
    isSnapshot: auditSnapshotFields.has(field) && value !== null && value !== undefined && value !== '',
  }));
}

function toAuditFields(content?: unknown): AuditFieldRow[] {
  return toAuditRows(content);
}

function formatAuditSnapshot(value: unknown) {
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  return JSON.stringify(value, null, 2) ?? String(value);
}

function getAuditRecords(events: AuditLogItem[] | undefined): TemplateAuditRecord[] {
  return (events ?? []).map((event) => ({
    id: String(event.id),
    operatorName: event.operatorDisplayName || event.operatorAccount || '-',
    actionLabel: event.actionLabel || getAuditActionLabel(event.action),
    operatedAt: event.operationTime || event.createdAt,
    beforeFields: toAuditFields(event.contentBefore),
    afterFields: toAuditFields(event.contentAfter),
  }));
}

function DetailSection({ title, children, sx, contentSx }: { title: string; children: ReactNode; sx?: object; contentSx?: object }) {
  return (
    <Box sx={{ bgcolor: '#fff', border: '1px solid #e4e7ed', borderRadius: '4px', overflow: 'hidden', ...sx }}>
      <Box sx={{ px: 1.5, py: 1, borderBottom: '1px solid #e4e7ed', bgcolor: '#f8fafc' }}>
        <Typography sx={{ fontWeight: 600, color: '#303133' }}>{title}</Typography>
      </Box>
      <Box sx={{ p: 1.5, ...contentSx }}>{children}</Box>
    </Box>
  );
}

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" sx={{ color: '#909399', display: 'block', mb: 0.5 }}>{label}</Typography>
      <Typography variant="body2" sx={{ color: '#303133', wordBreak: 'break-word' }}>{children || '-'}</Typography>
    </Box>
  );
}

function AuditFieldBlock({ title, fields, onViewSnapshot }: { title: string; fields: AuditFieldRow[]; onViewSnapshot: (field: AuditFieldRow) => void }) {
  return (
    <Box sx={{ border: '1px solid #e4e7ed', borderRadius: '4px', bgcolor: '#f8fafc', p: 1 }}>
      <Typography variant="caption" sx={{ display: 'block', mb: 0.75, color: '#606266', fontWeight: 600 }}>{title}</Typography>
      <Stack spacing={0.75}>
        {fields.length === 0 ? (
          <Typography variant="caption" sx={{ color: '#909399' }}>无</Typography>
        ) : fields.map((field) => (
          <Box key={field.field} sx={{ display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr)', gap: 1, alignItems: 'center' }}>
            <Typography variant="caption" sx={{ minWidth: 0, color: '#606266', overflowWrap: 'anywhere' }}>{field.label}</Typography>
            {field.isSnapshot ? (
              <Stack direction="row" spacing={0.5} alignItems="center" sx={{ minWidth: 0 }}>
                <Typography variant="caption" sx={{ minWidth: 0, flex: 1, color: '#303133', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{field.value}</Typography>
                <Tooltip title={`查看${field.label}详情`} arrow>
                  <Button
                    size="small"
                    variant="text"
                    aria-label={`查看${field.label}详情`}
                    startIcon={field.field === 'modelingChange' ? <VisibilityOutlined sx={{ fontSize: 15 }} /> : <DataObjectOutlined sx={{ fontSize: 15 }} />}
                    onClick={() => onViewSnapshot(field)}
                    sx={{ minWidth: 58, height: 24, px: 0.5, fontSize: 12, color: '#409eff', '& .MuiButton-startIcon': { mr: 0.25 } }}
                  >
                    详情
                  </Button>
                </Tooltip>
              </Stack>
            ) : <Typography variant="caption" sx={{ minWidth: 0, color: '#303133', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{field.value}</Typography>}
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

function isConcreteCategory(categoryId: string) {
  return categoryId !== TEMPLATE_CATEGORY_ALL && categoryId !== TEMPLATE_CATEGORY_UNCATEGORIZED;
}

function isReservedTemplateCategory(category: Pick<TemplateCategoryRecord, 'id' | 'name'>) {
  const id = String(category.id).trim();
  const name = String(category.name).trim();
  return id === TEMPLATE_CATEGORY_ALL
    || id === TEMPLATE_CATEGORY_UNCATEGORIZED
    || name === TEMPLATE_CATEGORY_ALL
    || name === TEMPLATE_CATEGORY_UNCATEGORIZED;
}

function toDateTimeLocalValue(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.includes(' ') ? value.replace(' ', 'T').slice(0, 16) : value.slice(0, 16);
  const pad = (input: number) => String(input).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultEffectiveFromValue() {
  const today = new Date();
  const pad = (input: number) => String(input).padStart(2, '0');
  return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}T00:00`;
}

function parseEffectiveDate(value: string) {
  if (!value) return null;
  const date = new Date(value.includes(' ') ? value.replace(' ', 'T') : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function validateEffectiveDateRange(effectiveFrom: string, effectiveTo: string) {
  const start = parseEffectiveDate(effectiveFrom);
  const end = parseEffectiveDate(effectiveTo);
  return !start || !end || end.getTime() >= start.getTime();
}

function getTemplateVersionCount(row: TemplateModelingRecord) {
  return row.versions?.length ?? 0;
}

const fieldSx = {
  '& .MuiInputBase-root': { height: 40 },
  '& .MuiInputBase-input': { boxSizing: 'border-box' },
};

const tableHeaderCellSx = {
  height: 48,
  py: 0,
  color: '#606266',
  fontWeight: 600,
  bgcolor: '#f5f7fa',
  borderBottom: '1px solid #e4e7ed',
};

const tableBodyCellSx = {
  height: TABLE_DATA_ROW_HEIGHT,
  lineHeight: '20px',
  py: 0,
  borderBottom: 'none',
  boxShadow: 'inset 0 -1px 0 #ebeef5',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const emptyTableBodyCellSx = {
  height: '100%',
  py: 0,
  borderBottom: '1px solid #ebeef5',
  color: '#909399',
};

const emptyTableRowSx = { height: '100%' };

function getCurrentUserPreferenceStorageKey(prefix: string, pageKey: string) {
  if (typeof window === 'undefined') return `${prefix}${pageKey}:anonymous`;
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null') as { id?: string | number; username?: string; displayName?: string } | null;
    return `${prefix}${pageKey}:${user?.id ?? user?.username ?? user?.displayName ?? 'anonymous'}`;
  } catch {
    return `${prefix}${pageKey}:anonymous`;
  }
}

function isConfigurableColumn(column: TemplateColumn): column is TemplateColumn & { id: ConfigurableTemplateColumnId } {
  return column.id !== 'actions';
}

function normalizeColumnSettings(columns: TemplateColumn[], raw?: Partial<TemplateColumnSettings> | null): TemplateColumnSettings {
  const defaults = columns.filter(isConfigurableColumn).map((column) => column.id);
  if (!raw || raw.version !== TEMPLATE_COLUMN_SETTINGS_VERSION) {
    return { version: TEMPLATE_COLUMN_SETTINGS_VERSION, order: defaults, hidden: [] };
  }
  const seen = new Set<ConfigurableTemplateColumnId>();
  const order = [
    ...(raw.order ?? []).filter((id): id is ConfigurableTemplateColumnId => defaults.includes(id) && !seen.has(id) && (seen.add(id), true)),
    ...defaults.filter((id) => !seen.has(id)),
  ];
  const hidden = (raw.hidden ?? []).filter((id): id is ConfigurableTemplateColumnId => defaults.includes(id) && order.includes(id));
  return { version: TEMPLATE_COLUMN_SETTINGS_VERSION, order, hidden: hidden.length >= order.length ? hidden.slice(1) : hidden };
}

function pickTemplatePayload(input: TemplateModelingPayload, fieldIds: Array<keyof TemplateModelingPayload>) {
  return fieldIds.reduce<TemplateModelingPayload>((payload, fieldId) => {
    if (fieldId in input) {
      return { ...payload, [fieldId]: input[fieldId] };
    }
    return payload;
  }, {} as TemplateModelingPayload);
}

function loadColumnSettings(storageKey: string, columns: TemplateColumn[]): TemplateColumnSettings {
  if (typeof window === 'undefined') return normalizeColumnSettings(columns);
  try {
    return normalizeColumnSettings(columns, JSON.parse(localStorage.getItem(storageKey) || 'null'));
  } catch {
    return normalizeColumnSettings(columns);
  }
}

function loadColumnWidths(storageKey: string): TemplateColumnWidths {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || '{}');
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function getColumnSettingsItems(columns: TemplateColumn[], settings: TemplateColumnSettings) {
  const byId = new Map(columns.filter(isConfigurableColumn).map((column) => [column.id, column]));
  return settings.order.map((id) => byId.get(id)).filter((column): column is TemplateColumn & { id: ConfigurableTemplateColumnId } => Boolean(column));
}

function getVisibleColumns(columns: TemplateColumn[], settings: TemplateColumnSettings): TemplateColumn[] {
  const actionColumn = columns.find((column) => column.id === 'actions');
  const visibleDataColumns = getColumnSettingsItems(columns, settings).filter((column) => !settings.hidden.includes(column.id));
  return [...visibleDataColumns, actionColumn].filter((column): column is TemplateColumn => Boolean(column));
}

function resolveColumnWidths(widths: TemplateColumnWidths, containerWidth: number, visibleColumns: TemplateColumn[]) {
  const result: Record<TemplateColumnId, number> = {} as Record<TemplateColumnId, number>;
  let total = 0;
  visibleColumns.forEach((column) => {
    const width = column.resizable ? Math.max(column.minWidth, widths[column.id] ?? column.defaultWidth) : Math.max(column.minWidth, column.defaultWidth);
    result[column.id] = width;
    total += width;
  });
  if (containerWidth > total) {
    const flexibleColumns = visibleColumns.filter((column) => column.resizable);
    const extra = flexibleColumns.length ? Math.floor((containerWidth - total) / flexibleColumns.length) : 0;
    flexibleColumns.forEach((column) => {
      result[column.id] += extra;
    });
  }
  return result;
}

export default function TemplateModelingPage({ pageKey }: { pageKey: TemplateModelingPageKey }) {
  const config = TEMPLATE_MODELING_PAGE_CONFIGS[pageKey];
  const allColumns = pageKey === 'formTemplates' ? formTemplateColumns : batchTemplateColumns;
  const versionColumns = pageKey === 'formTemplates' ? templateVersionColumns : dhrTemplateVersionColumns;
  const versionAuditEntityType = pageKey === 'formTemplates' ? 'FORM_TEMPLATE_VERSION' : 'DHR_TEMPLATE_VERSION';
  const queryClient = useQueryClient();
  const { showMessage } = useSnackbar();
  const [nameKeyword, setNameKeyword] = useState('');
  const [codeKeyword, setCodeKeyword] = useState('');
  const [status, setStatus] = useState('ALL');
  const [categoryId, setCategoryId] = useState(TEMPLATE_CATEGORY_ALL);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const [tableContainerWidth, setTableContainerWidth] = useState(0);
  const columnWidthStorageKey = useMemo(() => getCurrentUserPreferenceStorageKey(TEMPLATE_COLUMN_WIDTH_STORAGE_PREFIX, pageKey), [pageKey]);
  const columnSettingsStorageKey = useMemo(() => getCurrentUserPreferenceStorageKey(TEMPLATE_COLUMN_SETTINGS_STORAGE_PREFIX, pageKey), [pageKey]);
  const templateVersionColumnWidthStorageKey = useMemo(() => getCurrentUserPreferenceStorageKey(TEMPLATE_VERSION_COLUMN_WIDTH_STORAGE_PREFIX, pageKey), [pageKey]);
  const templateVersionColumnSettingsStorageKey = useMemo(() => getCurrentUserPreferenceStorageKey(TEMPLATE_VERSION_COLUMN_SETTINGS_STORAGE_PREFIX, pageKey), [pageKey]);
  const [columnWidths, setColumnWidths] = useState<TemplateColumnWidths>(() => loadColumnWidths(columnWidthStorageKey));
  const [columnSettings, setColumnSettings] = useState<TemplateColumnSettings>(() => loadColumnSettings(columnSettingsStorageKey, allColumns));
  const [templateVersionColumnWidths, setTemplateVersionColumnWidths] = useState<TemplateColumnWidths>(() => loadColumnWidths(templateVersionColumnWidthStorageKey));
  const [templateVersionColumnSettings, setTemplateVersionColumnSettings] = useState<TemplateColumnSettings>(() => loadColumnSettings(templateVersionColumnSettingsStorageKey, versionColumns));
  const [columnSettingsAnchorEl, setColumnSettingsAnchorEl] = useState<HTMLButtonElement | null>(null);
  const [columnSettingsTab, setColumnSettingsTab] = useState<TemplateColumnSettingsTarget>('main');
  const [draggingColumnId, setDraggingColumnId] = useState<ConfigurableTemplateColumnId | null>(null);
  const columnSettingDragSourceRef = useRef<ConfigurableTemplateColumnId | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<TemplateModelingRecord | null>(null);
  const [creatingVersionFrom, setCreatingVersionFrom] = useState<TemplateModelingRecord | null>(null);
  const [editingVersion, setEditingVersion] = useState<{ row: TemplateModelingRecord; version: TemplateVersionRecord } | null>(null);
  const [form, setForm] = useState<TemplateFormState>(() => emptyForm());
  const effectiveFromInputRef = useRef<HTMLInputElement | null>(null);
  const effectiveToInputRef = useRef<HTMLInputElement | null>(null);
  const [categoryDialog, setCategoryDialog] = useState<{ open: boolean; target: TemplateCategoryRecord | null; name: string }>({ open: false, target: null, name: '' });
  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState<TemplateCategoryRecord | null>(null);
  const [deleteRowTarget, setDeleteRowTarget] = useState<TemplateModelingRecord | null>(null);
  const [deleteVersionTarget, setDeleteVersionTarget] = useState<{ row: TemplateModelingRecord; version: TemplateVersionRecord } | null>(null);
  const [drawerRow, setDrawerRow] = useState<TemplateModelingRecord | null>(null);
  const [drawerVersionRow, setDrawerVersionRow] = useState<TemplateVersionRecord | null>(null);
  const [drawerTab, setDrawerTab] = useState(0);
  const [auditSnapshot, setAuditSnapshot] = useState<AuditSnapshotDialogState | null>(null);
  const [draggingCategoryId, setDraggingCategoryId] = useState('');
  const [expandedTemplateGroups, setExpandedTemplateGroups] = useState<Set<string>>(() => new Set());
  const [reactDesignerState, setReactDesignerState] = useState<TemplateDesignerState>({ open: false, row: null, version: null });
  const [dhrWorkspaceRow, setDhrWorkspaceRow] = useState<DhrWorkspaceState | null>(null);
  const [dhrVersionDialog, setDhrVersionDialog] = useState<DhrVersionDialogState | null>(null);
  const [dhrVersionLabel, setDhrVersionLabel] = useState('');
  const [dhrVersionCode, setDhrVersionCode] = useState('');
  const [dhrVersionOfflineVersion, setDhrVersionOfflineVersion] = useState('');
  const [dhrVersionDescription, setDhrVersionDescription] = useState('');
  const [dhrVersionEffectiveFrom, setDhrVersionEffectiveFrom] = useState(defaultEffectiveFromValue());
  const [dhrVersionEffectiveTo, setDhrVersionEffectiveTo] = useState('');

  const categoryQuery = useQuery({
    queryKey: [config.categoryQueryKey],
    queryFn: async () => {
      const res = await getTemplateModelingCategories(pageKey);
      return res.data.data.map((category) => ({
        ...category,
        system: isReservedTemplateCategory(category),
      }));
    },
  });

  const categories = categoryQuery.data ?? [];

  const listQuery = useQuery({
    queryKey: [config.queryKey, page, pageSize, nameKeyword, codeKeyword, status, categoryId],
    queryFn: async () => {
      const res = await config.listAction({
        page,
        size: pageSize,
        name: nameKeyword.trim() || undefined,
        code: codeKeyword.trim() || undefined,
        status: status === 'ALL' ? undefined : status,
        categoryName: categoryId === TEMPLATE_CATEGORY_UNCATEGORIZED ? TEMPLATE_CATEGORY_UNCATEGORIZED : isConcreteCategory(categoryId) ? categoryId : undefined,
      });
      return res.data.data;
    },
  });

  const auditQuery = useQuery({
    queryKey: [config.auditQueryKey, drawerVersionRow ? versionAuditEntityType : config.entityType, drawerVersionRow?.id ?? drawerRow?.id],
    enabled: drawerRow !== null,
    queryFn: async () => {
      const shouldFallbackToParentCreateAudit = pageKey === 'batchRecordTemplates'
        && drawerVersionRow?.version === 'V1.0'
        && drawerRow !== null;
      const versionAuditResponse = await getAuditLogs({
        entityType: drawerVersionRow ? versionAuditEntityType : config.entityType,
        entityId: drawerVersionRow?.id ?? drawerRow?.id,
        page: 1,
        size: 50,
      });
      const versionAuditEvents = (versionAuditResponse.data.data as PageResult<AuditLogItem>).content ?? [];
      if (!shouldFallbackToParentCreateAudit || versionAuditEvents.length > 0) return versionAuditEvents;

      const parentCreateAuditResponse = await getAuditLogs({
        entityType: config.entityType,
        entityId: drawerRow.id,
        action: 'CREATE',
        page: 1,
        size: 50,
      });
      return (parentCreateAuditResponse.data.data as PageResult<AuditLogItem>).content ?? [];
    },
  });

  const rows = listQuery.data?.content ?? [];
  const isTableEmptyState = listQuery.isLoading || listQuery.isError || rows.length === 0;
  const columnSettingsItems = useMemo(() => getColumnSettingsItems(allColumns, columnSettings), [allColumns, columnSettings]);
  const visibleColumns = useMemo(() => getVisibleColumns(allColumns, columnSettings), [allColumns, columnSettings]);
  const visibleConfigurableColumnCount = columnSettings.order.length - columnSettings.hidden.length;
  const resolvedColumnWidths = useMemo(() => resolveColumnWidths(columnWidths, tableContainerWidth, visibleColumns), [columnWidths, tableContainerWidth, visibleColumns]);
  const totalTableWidth = visibleColumns.reduce((sum, column) => sum + resolvedColumnWidths[column.id], 0);
  const templateVersionColumnSettingsItems = useMemo(() => getColumnSettingsItems(versionColumns, templateVersionColumnSettings), [templateVersionColumnSettings, versionColumns]);
  const visibleTemplateVersionColumns = useMemo(() => getVisibleColumns(versionColumns, templateVersionColumnSettings), [templateVersionColumnSettings, versionColumns]);
  const visibleTemplateVersionConfigurableColumnCount = templateVersionColumnSettings.order.length - templateVersionColumnSettings.hidden.length;
  const activeColumnSettings = columnSettingsTab === 'version' ? templateVersionColumnSettings : columnSettings;
  const activeColumnSettingsItems = columnSettingsTab === 'version' ? templateVersionColumnSettingsItems : columnSettingsItems;
  const activeVisibleConfigurableColumnCount = columnSettingsTab === 'version' ? visibleTemplateVersionConfigurableColumnCount : visibleConfigurableColumnCount;
  const setActiveColumnSettings = columnSettingsTab === 'version' ? setTemplateVersionColumnSettings : setColumnSettings;
  const resolvedTemplateVersionColumnWidths = useMemo(() => resolveColumnWidths(templateVersionColumnWidths, totalTableWidth, visibleTemplateVersionColumns), [templateVersionColumnWidths, totalTableWidth, visibleTemplateVersionColumns]);
  const totalTemplateVersionTableWidth = visibleTemplateVersionColumns.reduce((sum, column) => sum + resolvedTemplateVersionColumnWidths[column.id], 0);
  const effectiveMainTableWidth = Math.max(totalTableWidth, totalTemplateVersionTableWidth);
  const mainTableSpacerWidth = Math.max(0, effectiveMainTableWidth - totalTableWidth);
  const hasMainTableSpacer = mainTableSpacerWidth > 0;
  const mainTableColSpan = visibleColumns.length + (hasMainTableSpacer ? 1 : 0);
  const pageCount = Math.max(1, listQuery.data?.totalPages ?? Math.ceil((listQuery.data?.totalElements ?? 0) / pageSize));
  const totalElements = listQuery.data?.totalElements ?? 0;
  const templateCategoryOptions = useMemo<TemplateCategoryOption[]>(() => {
    const virtualCounts = new Map(categories
      .filter((category) => category.id === TEMPLATE_CATEGORY_ALL || category.id === TEMPLATE_CATEGORY_UNCATEGORIZED)
      .map((category) => [String(category.id), Number(category.count || 0)]));
    const concreteCategories = categories
      .filter((category) => category.name)
      .filter((category) => !isReservedTemplateCategory(category))
      .map((category) => ({
        ...category,
        value: category.name,
        label: category.name,
        count: Number(category.count || 0),
        system: false,
      }));
    return [
      { id: TEMPLATE_CATEGORY_ALL, value: TEMPLATE_CATEGORY_ALL, label: '全部', name: '全部', count: virtualCounts.get(TEMPLATE_CATEGORY_ALL) ?? totalElements, system: true },
      { id: TEMPLATE_CATEGORY_UNCATEGORIZED, value: TEMPLATE_CATEGORY_UNCATEGORIZED, label: '未分类', name: '未分类', count: virtualCounts.get(TEMPLATE_CATEGORY_UNCATEGORIZED) ?? 0, system: true },
      ...concreteCategories,
    ];
  }, [categories, totalElements]);

  const categoryOptions = useMemo(
    () => templateCategoryOptions.filter((category) => !category.system).map((category) => category.name),
    [templateCategoryOptions],
  );

  useEffect(() => {
    setColumnWidths(loadColumnWidths(columnWidthStorageKey));
    setTemplateVersionColumnWidths(loadColumnWidths(templateVersionColumnWidthStorageKey));
    setColumnSettings(loadColumnSettings(columnSettingsStorageKey, allColumns));
    setTemplateVersionColumnSettings(loadColumnSettings(templateVersionColumnSettingsStorageKey, versionColumns));
  }, [allColumns, columnSettingsStorageKey, columnWidthStorageKey, templateVersionColumnSettingsStorageKey, templateVersionColumnWidthStorageKey, versionColumns]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(columnWidthStorageKey, JSON.stringify(columnWidths));
  }, [columnWidthStorageKey, columnWidths]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(templateVersionColumnWidthStorageKey, JSON.stringify(templateVersionColumnWidths));
  }, [templateVersionColumnWidthStorageKey, templateVersionColumnWidths]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(columnSettingsStorageKey, JSON.stringify(columnSettings));
  }, [columnSettingsStorageKey, columnSettings]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(templateVersionColumnSettingsStorageKey, JSON.stringify(templateVersionColumnSettings));
  }, [templateVersionColumnSettingsStorageKey, templateVersionColumnSettings]);

  useEffect(() => {
    setColumnSettingsTab('main');
    setExpandedTemplateGroups(new Set());
  }, [pageKey]);

  useEffect(() => {
    const container = tableContainerRef.current;
    if (!container) return undefined;
    const updateWidth = () => setTableContainerWidth(container.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const effectiveFrom = form.effectiveFrom || effectiveFromInputRef.current?.value || '';
      const effectiveTo = form.effectiveTo || effectiveToInputRef.current?.value || '';
      const isVersionDialog = Boolean(creatingVersionFrom || editingVersion);
      const shouldSubmitInitialVersionFields = !editingRow && !isVersionDialog;
      const shouldSubmitVersionFields = shouldSubmitInitialVersionFields || isVersionDialog;
      const payload: TemplateModelingPayload = {
        code: form.code.trim(),
        name: form.name.trim(),
        categoryName: form.categoryName.trim() || null,
        description: form.description.trim() || null,
        versionDescription: shouldSubmitVersionFields ? form.versionDescription.trim() || null : undefined,
        version: shouldSubmitVersionFields ? form.version.trim() : undefined,
        offlineVersion: pageKey === 'batchRecordTemplates' && shouldSubmitVersionFields ? form.offlineVersion.trim() || null : undefined,
        effectiveFrom: shouldSubmitVersionFields ? effectiveFrom || null : undefined,
        effectiveTo: shouldSubmitVersionFields ? effectiveTo || null : undefined,
      };
      if (creatingVersionFrom) {
        const versionResponse = await createFormTemplateVersion(creatingVersionFrom.id, pickTemplatePayload(payload, TEMPLATE_VERSION_FIELD_IDS));
        return { response: null, versionResponse };
      }
      if (editingVersion) {
        const versionResponse = await updateFormTemplateVersion(editingVersion.row.id, editingVersion.version.id, pickTemplatePayload(payload, TEMPLATE_VERSION_FIELD_IDS));
        return { response: null, versionResponse };
      }
      const response = editingRow ? await config.updateAction(editingRow.id, payload) : await config.createAction(payload);
      return { response, versionResponse: null };
    },
    onSuccess: async () => {
      showMessage(creatingVersionFrom ? '子版本新增成功' : editingVersion ? '版本保存成功' : editingRow ? '保存成功' : '新增成功', 'success');
      setDialogOpen(false);
      setEditingRow(null);
      setCreatingVersionFrom(null);
      setEditingVersion(null);
      await queryClient.invalidateQueries({ queryKey: [config.queryKey] });
      await queryClient.invalidateQueries({ queryKey: [config.categoryQueryKey] });
      await queryClient.invalidateQueries({ queryKey: [config.auditQueryKey] });
    },
    onError: (error: unknown) => showMessage(error instanceof Error ? error.message : '保存失败', 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (row: TemplateModelingRecord) => config.deleteAction(row.id),
    onSuccess: async () => {
      setDeleteRowTarget(null);
      showMessage('删除成功', 'success');
      await queryClient.invalidateQueries({ queryKey: [config.queryKey] });
      await queryClient.invalidateQueries({ queryKey: [config.categoryQueryKey] });
    },
    onError: (error: unknown) => showMessage(error instanceof Error ? error.message : '删除失败', 'error'),
  });

  const deleteVersionMutation = useMutation({
    mutationFn: (target: { row: TemplateModelingRecord; version: TemplateVersionRecord }) => pageKey === 'batchRecordTemplates'
      ? deleteDhrTemplateVersion(target.row.id, target.version.id)
      : deleteFormTemplateVersion(target.row.id, target.version.id),
    onSuccess: async () => {
      setDeleteVersionTarget(null);
      showMessage('版本删除成功', 'success');
      await queryClient.invalidateQueries({ queryKey: [config.queryKey] });
      await queryClient.invalidateQueries({ queryKey: [config.categoryQueryKey] });
      await queryClient.invalidateQueries({ queryKey: [config.auditQueryKey] });
    },
    onError: (error: unknown) => showMessage(error instanceof Error ? error.message : '版本删除失败', 'error'),
  });

  const saveDhrVersionMutation = useMutation({
    mutationFn: (target: DhrVersionDialogState & { version: string; code: string; offlineVersion: string; description: string; effectiveFrom: string; effectiveTo: string }) => {
      const body = {
        version: target.version.trim(),
        code: target.code.trim() || null,
        offlineVersion: target.offlineVersion.trim() || null,
        description: target.description.trim() || null,
        effectiveFrom: target.effectiveFrom || null,
        effectiveTo: target.effectiveTo || null,
      };
      return target.mode === 'edit' && target.targetVersion
        ? updateDhrTemplateVersion(target.row.id, target.targetVersion.id, body)
        : createDhrTemplateVersion(target.row.id, { ...body, sourceVersionId: target.sourceVersion?.id ?? null });
    },
    onSuccess: async (_, target) => {
      showMessage(target.mode === 'edit' ? '版本保存成功' : target.mode === 'copy' ? '版本复制成功' : '子版本新增成功', 'success');
      setDhrVersionDialog(null);
      setDhrVersionLabel('');
      setDhrVersionCode('');
      setDhrVersionOfflineVersion('');
      setDhrVersionDescription('');
      setDhrVersionEffectiveFrom(defaultEffectiveFromValue());
      setDhrVersionEffectiveTo('');
      await queryClient.invalidateQueries({ queryKey: [config.queryKey] });
      await queryClient.invalidateQueries({ queryKey: [config.auditQueryKey] });
    },
    onError: (error: unknown) => showMessage(error instanceof Error ? error.message : '保存版本失败', 'error'),
  });

  const saveCategoryMutation = useMutation({
    mutationFn: async () => {
      const name = categoryDialog.name.trim();
      if (categoryDialog.target) return updateTemplateModelingCategory(pageKey, categoryDialog.target.id, { name });
      return createTemplateModelingCategory(pageKey, { name });
    },
    onSuccess: async () => {
      setCategoryDialog({ open: false, target: null, name: '' });
      showMessage('分类保存成功', 'success');
      await queryClient.invalidateQueries({ queryKey: [config.categoryQueryKey] });
      await queryClient.invalidateQueries({ queryKey: [config.queryKey] });
    },
    onError: (error: unknown) => showMessage(error instanceof Error ? error.message : '分类保存失败', 'error'),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (target: TemplateCategoryRecord) => deleteTemplateModelingCategory(pageKey, target.id),
    onSuccess: async () => {
      setDeleteCategoryTarget(null);
      showMessage('分类删除成功', 'success');
      await queryClient.invalidateQueries({ queryKey: [config.categoryQueryKey] });
      await queryClient.invalidateQueries({ queryKey: [config.queryKey] });
    },
    onError: (error: unknown) => showMessage(error instanceof Error ? error.message : '分类删除失败', 'error'),
  });

  const reorderCategoryMutation = useMutation({
    mutationFn: (ids: Array<string | number>) => reorderTemplateModelingCategories(pageKey, ids),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [config.categoryQueryKey] });
    },
    onError: (error: unknown) => showMessage(error instanceof Error ? error.message : '分类排序失败', 'error'),
  });

  const openCreateDialog = () => {
    const selectedCategory = templateCategoryOptions.find((category) => category.value === categoryId);
    const selectedName = selectedCategory && !selectedCategory.system ? selectedCategory.name : '';
    setEditingRow(null);
    setCreatingVersionFrom(null);
    setForm(emptyForm(selectedName));
    setDialogOpen(true);
  };

  const openEditDialog = (row: TemplateModelingRecord) => {
    setEditingRow(row);
    setCreatingVersionFrom(null);
    setEditingVersion(null);
    setForm({
      code: pageKey === 'batchRecordTemplates' ? '' : row.code ?? '',
      name: row.name ?? '',
      categoryName: row.categoryName ?? '',
      description: row.description ?? '',
      versionDescription: '',
      version: 'V1.0',
      offlineVersion: '',
      effectiveFrom: defaultEffectiveFromValue(),
      effectiveTo: '',
      status: row.status ?? 'ACTIVE',
    });
    setDialogOpen(true);
  };

  const openCreateTemplateVersionDialog = (row: TemplateModelingRecord) => {
    setEditingRow(null);
    setCreatingVersionFrom(row);
    setEditingVersion(null);
    setForm({
      code: row.code ?? '',
      name: row.name ?? '',
      categoryName: row.categoryName ?? '',
      description: row.description ?? '',
      versionDescription: '',
      version: '',
      offlineVersion: '',
      effectiveFrom: defaultEffectiveFromValue(),
      effectiveTo: '',
      status: 'ACTIVE',
    });
    setDialogOpen(true);
  };

  const openEditTemplateVersionDialog = (row: TemplateModelingRecord, version: TemplateVersionRecord) => {
    setEditingRow(null);
    setCreatingVersionFrom(null);
    setEditingVersion({ row, version });
    setForm({
      code: row.code ?? '',
      name: row.name ?? '',
      categoryName: row.categoryName ?? '',
      description: row.description ?? '',
      versionDescription: version.description ?? '',
      version: version.version ?? '',
      offlineVersion: '',
      effectiveFrom: toDateTimeLocalValue(version.effectiveFrom) || defaultEffectiveFromValue(),
      effectiveTo: toDateTimeLocalValue(version.effectiveTo),
      status: version.status ?? 'ACTIVE',
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!creatingVersionFrom && !form.name.trim()) {
      showMessage('请输入模板名称', 'error');
      return;
    }
    if (pageKey === 'formTemplates' && !creatingVersionFrom && !form.code.trim()) {
      showMessage('请输入模板编码', 'error');
      return;
    }
    const isVersionDialog = Boolean(creatingVersionFrom || editingVersion);
    const isCreatingDhrTemplate = pageKey === 'batchRecordTemplates' && !editingRow && !isVersionDialog;
    const shouldSubmitVersionFields = !editingRow;
    if (shouldSubmitVersionFields && !form.version.trim()) {
      showMessage('请输入模板版本', 'error');
      return;
    }
    if ((creatingVersionFrom || editingVersion) && getTemplateVersionRows((creatingVersionFrom ?? editingVersion!.row)).some((version) => version.id !== editingVersion?.version.id && version.version.trim().toLowerCase() === form.version.trim().toLowerCase())) {
      showMessage('模板版本已存在', 'error');
      return;
    }
    const effectiveFrom = form.effectiveFrom || effectiveFromInputRef.current?.value || '';
    const effectiveTo = form.effectiveTo || effectiveToInputRef.current?.value || '';
    if (isCreatingDhrTemplate && !effectiveFrom) {
      showMessage('请选择生效时间', 'error');
      return;
    }
    if ((shouldSubmitVersionFields || isCreatingDhrTemplate) && !validateEffectiveDateRange(effectiveFrom, effectiveTo)) {
      showMessage('失效时间不能早于生效时间', 'error');
      return;
    }
    saveMutation.mutate();
  };

  const selectTemplateCategory = (category: string) => {
    setCategoryId(category);
    setPage(1);
  };

  const openCreateTemplateCategoryDialog = () => {
    setCategoryDialog({ open: true, target: null, name: '' });
  };

  const openEditTemplateCategoryDialog = (category: TemplateCategoryRecord) => {
    setCategoryDialog({ open: true, target: category, name: category.name });
  };

  const requestDeleteTemplateCategory = (category: TemplateCategoryRecord) => {
    setDeleteCategoryTarget(category);
  };

  const handleTemplateCategoryDragStart = (event: ReactDragEvent, category: TemplateCategoryOption) => {
    if (category.system) return;
    const categoryIdValue = String(category.id);
    event.dataTransfer.setData('text/plain', categoryIdValue);
    setDraggingCategoryId(categoryIdValue);
  };

  const handleTemplateCategoryDrop = (event: ReactDragEvent, targetCategory: TemplateCategoryOption) => {
    event.preventDefault();
    if (targetCategory.system) {
      setDraggingCategoryId('');
      return;
    }
    const activeCategoryId = draggingCategoryId || event.dataTransfer.getData('text/plain');
    const targetCategoryId = String(targetCategory.id);
    if (!activeCategoryId || activeCategoryId === targetCategoryId) {
      setDraggingCategoryId('');
      return;
    }
    const currentIds = templateCategoryOptions
      .filter((category) => !category.system)
      .map((category) => String(category.id));
    const activeIndex = currentIds.indexOf(activeCategoryId);
    const targetIndex = currentIds.indexOf(targetCategoryId);
    if (activeIndex < 0 || targetIndex < 0) {
      setDraggingCategoryId('');
      return;
    }
    const nextIds = [...currentIds];
    const [activeId] = nextIds.splice(activeIndex, 1);
    nextIds.splice(targetIndex, 0, activeId);
    setDraggingCategoryId('');
    reorderCategoryMutation.mutate(nextIds);
  };

  const getTemplateVersionRows = (row: TemplateModelingRecord) => row.versions ?? [];

  const getNextDhrVersionLabel = (row: TemplateModelingRecord) => {
    const largestVersionNumber = getTemplateVersionRows(row).reduce((largest, version) => {
      const versionNumber = Number(version.version.match(/^V(\d+)\.0$/i)?.[1] ?? 0);
      return Math.max(largest, versionNumber);
    }, 0);
    return `V${largestVersionNumber + 1}.0`;
  };

  const openDhrVersionDialog = (row: TemplateModelingRecord, sourceVersion: TemplateVersionRecord | null, targetVersion: TemplateVersionRecord | null = null) => {
    const mode = targetVersion ? 'edit' : sourceVersion ? 'copy' : 'create';
    setDhrVersionLabel(targetVersion?.version ?? getNextDhrVersionLabel(row));
    // A copied version must receive its own code when a code is used.
    setDhrVersionCode(targetVersion?.code ?? '');
    setDhrVersionOfflineVersion(targetVersion?.offlineVersion ?? sourceVersion?.offlineVersion ?? '');
    setDhrVersionDescription(targetVersion?.description ?? sourceVersion?.description ?? '');
    setDhrVersionEffectiveFrom(toDateTimeLocalValue(targetVersion?.effectiveFrom) || defaultEffectiveFromValue());
    setDhrVersionEffectiveTo(toDateTimeLocalValue(targetVersion?.effectiveTo));
    setDhrVersionDialog({ row, mode, sourceVersion, targetVersion });
  };

  const submitDhrVersionDialog = () => {
    if (!dhrVersionDialog) return;
    if (!dhrVersionLabel.trim()) {
      showMessage('请输入版本号', 'error');
      return;
    }
    if (getTemplateVersionRows(dhrVersionDialog.row).some((version) => version.id !== dhrVersionDialog.targetVersion?.id && version.version.trim().toLowerCase() === dhrVersionLabel.trim().toLowerCase())) {
      showMessage('版本号已存在', 'error');
      return;
    }
    if (!dhrVersionEffectiveFrom) {
      showMessage('请选择生效时间', 'error');
      return;
    }
    if (!validateEffectiveDateRange(dhrVersionEffectiveFrom, dhrVersionEffectiveTo)) {
      showMessage('失效时间不能早于生效时间', 'error');
      return;
    }
    saveDhrVersionMutation.mutate({
      ...dhrVersionDialog,
      version: dhrVersionLabel,
      code: dhrVersionCode,
      offlineVersion: dhrVersionOfflineVersion,
      description: dhrVersionDescription,
      effectiveFrom: dhrVersionEffectiveFrom,
      effectiveTo: dhrVersionEffectiveTo,
    });
  };

  const openTemplateDrawer = (row: TemplateModelingRecord) => {
    setDrawerRow(row);
    setDrawerVersionRow(null);
    setDrawerTab(0);
    setAuditSnapshot(null);
  };

  const openTemplateVersionDrawer = (row: TemplateModelingRecord, version: TemplateVersionRecord) => {
    setDrawerRow(row);
    setDrawerVersionRow(version);
    setDrawerTab(0);
    setAuditSnapshot(null);
  };

  const expandTemplateGroup = (templateId: string | number) => {
    const groupKey = String(templateId);
    setExpandedTemplateGroups((current) => {
      const next = new Set(current);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  };

  const expandAllTemplateGroups = () => {
    setExpandedTemplateGroups(new Set(rows.map((row) => String(row.id))));
  };

  const collapseAllTemplateGroups = () => {
    setExpandedTemplateGroups(new Set());
  };

  const saveDesignerPayload = (id: string | number, versionId: string | number, payload: { modelDesignJson: string; canvasDesignJson: string; workflowDesignJson: string }) => {
    return saveFormTemplateVersionDesign(id, versionId, payload);
  };

  const autoSaveDesignerMutation = useMutation({
    mutationFn: async (payload: { modelDesignJson: string; canvasDesignJson: string; workflowDesignJson: string }) => {
      const targetRow = reactDesignerState.row;
      const targetVersion = reactDesignerState.version;
      if (!targetRow || !targetVersion) {
        throw new Error('设计器上下文缺失');
      }
      return saveDesignerPayload(targetRow.id, targetVersion.id, payload);
    },
    onSuccess: async () => {
      showMessage('字段已保存', 'success');
      await queryClient.invalidateQueries({ queryKey: [config.queryKey] });
      await queryClient.invalidateQueries({ queryKey: [config.auditQueryKey] });
    },
    onError: (error: unknown) => showMessage(error instanceof Error ? error.message : '字段保存失败', 'error'),
  });

  const saveDesignerMutation = useMutation({
    mutationFn: async (payload: { modelDesignJson: string; canvasDesignJson: string; workflowDesignJson: string }) => {
      const targetRow = reactDesignerState.row;
      const targetVersion = reactDesignerState.version;
      if (!targetRow || !targetVersion) {
        throw new Error('设计器上下文缺失');
      }
      return saveDesignerPayload(targetRow.id, targetVersion.id, payload);
    },
    onSuccess: async () => {
      showMessage('设计已保存', 'success');
      await queryClient.invalidateQueries({ queryKey: [config.queryKey] });
      await queryClient.invalidateQueries({ queryKey: [config.auditQueryKey] });
    },
    onError: (error: unknown) => showMessage(error instanceof Error ? error.message : '设计保存失败', 'error'),
  });

  const renderTemplateCategoryPanel = () => (
    <Box data-template-category-panel sx={{ height: '100%', minHeight: 0, bgcolor: '#fff', border: '1px solid #e4e7ed', borderRadius: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ flex: '0 0 auto', minHeight: 48, px: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e4e7ed' }}>
        <Typography sx={{ fontWeight: 600, color: '#303133' }}>模板分类</Typography>
        <Tooltip title="新增分类" arrow>
          <IconButton size="small" color="primary" aria-label="新增分类" onClick={openCreateTemplateCategoryDialog}>
            <AddIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
      <Stack spacing={0.5} sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 1 }}>
        {templateCategoryOptions.map((category) => {
          const selected = categoryId === category.value;
          return (
            <Box
              key={category.value}
              role="button"
              tabIndex={0}
              draggable={!category.system}
              onDragStart={(event) => handleTemplateCategoryDragStart(event, category)}
              onDragOver={(event) => {
                if (!category.system) event.preventDefault();
              }}
              onDrop={(event) => handleTemplateCategoryDrop(event, category)}
              onDragEnd={() => setDraggingCategoryId('')}
              onClick={() => selectTemplateCategory(category.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') selectTemplateCategory(category.value);
              }}
              sx={{ minHeight: 40, px: 1.25, display: 'grid', gridTemplateColumns: category.system ? 'minmax(0, 1fr) auto' : '24px minmax(0, 1fr) auto auto auto', alignItems: 'center', gap: 0.5, borderRadius: 1, cursor: category.system ? 'pointer' : 'grab', color: selected ? '#1890ff' : '#303133', bgcolor: selected ? '#e8f4ff' : 'transparent', opacity: draggingCategoryId === String(category.id) ? 0.55 : 1, '&:hover': { bgcolor: selected ? '#e8f4ff' : '#f5f7fa' } }}
            >
              {!category.system ? <DragIndicator data-template-category-drag-handle fontSize="small" sx={{ color: '#a8abb2' }} /> : null}
              <Typography sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: selected ? 600 : 400 }}>{category.label}</Typography>
              <Typography variant="caption" sx={{ color: selected ? '#1890ff' : '#909399' }}>{category.count}</Typography>
              {!category.system ? (
                <>
                  <Tooltip title="编辑分类" arrow>
                    <IconButton
                      size="small"
                      aria-label="编辑分类"
                      onClick={(event) => {
                        event.stopPropagation();
                        openEditTemplateCategoryDialog(category);
                      }}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="删除分类" arrow>
                    <IconButton
                      size="small"
                      color="error"
                      aria-label="删除分类"
                      onClick={(event) => {
                        event.stopPropagation();
                        requestDeleteTemplateCategory(category);
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </>
              ) : null}
            </Box>
          );
        })}
      </Stack>
    </Box>
  );

  const getColumnWidth = (column: TemplateColumn) => resolvedColumnWidths[column.id] ?? column.defaultWidth;

  const beginColumnResize = (event: MouseEvent, columnId: TemplateColumnId) => {
    event.preventDefault();
    event.stopPropagation();
    const column = visibleColumns.find((item) => item.id === columnId);
    if (!column || column.resizable === false) return;
    const startX = event.clientX;
    const startWidth = getColumnWidth(column);
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const handleMouseMove = (moveEvent: globalThis.MouseEvent) => {
      const nextWidth = Math.max(column.minWidth, startWidth + moveEvent.clientX - startX);
      setColumnWidths((current) => ({ ...current, [columnId]: nextWidth }));
    };
    const handleMouseUp = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const getTemplateVersionColumnWidth = (column: TemplateColumn) => resolvedTemplateVersionColumnWidths[column.id] ?? column.defaultWidth;

  const beginTemplateVersionColumnResize = (event: MouseEvent, columnId: TemplateColumnId) => {
    event.preventDefault();
    event.stopPropagation();
    const column = visibleTemplateVersionColumns.find((item) => item.id === columnId);
    if (!column || column.resizable === false) return;
    const startX = event.clientX;
    const startWidth = getTemplateVersionColumnWidth(column);
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const handleMouseMove = (moveEvent: globalThis.MouseEvent) => {
      const nextWidth = Math.max(column.minWidth, startWidth + moveEvent.clientX - startX);
      setTemplateVersionColumnWidths((current) => ({ ...current, [columnId]: nextWidth }));
    };
    const handleMouseUp = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleColumnSettingDragStart = (event: ReactDragEvent, columnId: ConfigurableTemplateColumnId) => {
    columnSettingDragSourceRef.current = columnId;
    setDraggingColumnId(columnId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', columnId);
  };

  const handleColumnSettingDragOver = (event: ReactDragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const moveColumnSetting = (sourceId: ConfigurableTemplateColumnId | null, targetId: ConfigurableTemplateColumnId) => {
    if (!sourceId || sourceId === targetId) return;
    setActiveColumnSettings((current) => {
      const nextOrder = current.order.filter((id) => id !== sourceId);
      const targetIndex = nextOrder.indexOf(targetId);
      nextOrder.splice(targetIndex < 0 ? nextOrder.length : targetIndex, 0, sourceId);
      return { ...current, order: nextOrder };
    });
  };

  const handleColumnSettingDrop = (event: ReactDragEvent, targetId: ConfigurableTemplateColumnId) => {
    event.preventDefault();
    moveColumnSetting(columnSettingDragSourceRef.current, targetId);
  };

  const handleColumnSettingDragEnd = () => {
    columnSettingDragSourceRef.current = null;
    setDraggingColumnId(null);
  };

  const beginColumnSettingPointerDrag = (event: ReactPointerEvent, columnId: ConfigurableTemplateColumnId) => {
    if (event.button !== 0) return;
    columnSettingDragSourceRef.current = columnId;
    setDraggingColumnId(columnId);
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    const handlePointerMove = (moveEvent: PointerEvent) => {
      const targetRow = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)?.closest('[data-template-column-settings-row]') as HTMLElement | null;
      const targetId = targetRow?.dataset.columnId as ConfigurableTemplateColumnId | undefined;
      if (targetId) moveColumnSetting(columnSettingDragSourceRef.current, targetId);
    };
    const handlePointerUp = () => {
      document.body.style.userSelect = previousUserSelect;
      columnSettingDragSourceRef.current = null;
      setDraggingColumnId(null);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const toggleColumnVisibility = (columnId: ConfigurableTemplateColumnId) => {
    setActiveColumnSettings((current) => {
      const hidden = current.hidden.includes(columnId)
        ? current.hidden.filter((id) => id !== columnId)
        : [...current.hidden, columnId];
      if (hidden.length >= current.order.length) return current;
      return { ...current, hidden };
    });
  };

  function getStickyActionColumnSx(column: TemplateColumn, layer: 'head' | 'body') {
    if (column.id !== 'actions') return {};
    const actionColumnWidth = column.defaultWidth;
    return {
      position: 'sticky',
      right: 0,
      width: actionColumnWidth,
      minWidth: actionColumnWidth,
      maxWidth: actionColumnWidth,
      zIndex: layer === 'head' ? 10 : 6,
      bgcolor: layer === 'head' ? '#f5f7fa' : '#fff',
      backgroundClip: 'padding-box',
      boxShadow: '-6px 0 8px -8px rgba(0,0,0,.35)',
    };
  }

  const renderTemplateVersionActions = (row: TemplateModelingRecord, version: TemplateVersionRecord, canDeleteVersion: boolean) => (
    <Stack direction="row" spacing={0} justifyContent="center">
      <Tooltip title="设计" arrow>
        <IconButton
          size="small"
          aria-label="设计"
          onClick={(event) => {
            event.stopPropagation();
            if (pageKey === 'batchRecordTemplates') {
              setDhrWorkspaceRow({ row, initialVersionId: version.id });
            } else {
              setReactDesignerState({ open: true, row, version });
            }
          }}
        >
          <DesignServicesIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      {pageKey === 'batchRecordTemplates' ? (
        <>
          <Tooltip title="编辑版本" arrow>
            <IconButton
              size="small"
              aria-label="编辑版本"
              disabled={saveDhrVersionMutation.isPending}
              onClick={(event) => {
                event.stopPropagation();
                openDhrVersionDialog(row, null, version);
              }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="复制版本" arrow>
            <IconButton
              size="small"
              aria-label="复制版本"
              disabled={saveDhrVersionMutation.isPending}
              onClick={(event) => {
                event.stopPropagation();
                openDhrVersionDialog(row, version);
              }}
            >
              <ContentCopy fontSize="small" />
            </IconButton>
          </Tooltip>
        </>
      ) : (
        <Tooltip title="编辑版本" arrow>
          <IconButton size="small" aria-label="编辑版本" onClick={(event) => { event.stopPropagation(); openEditTemplateVersionDialog(row, version); }}>
            <EditIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {canDeleteVersion ? (
        <Tooltip title="删除" arrow>
          <IconButton size="small" color="error" aria-label="删除" onClick={(event) => { event.stopPropagation(); setDeleteVersionTarget({ row, version }); }}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ) : null}
    </Stack>
  );

  const renderTemplateGroupCell = (row: TemplateModelingRecord, column: TemplateColumn): string => {
    const columnId = column.id;
    if (columnId === 'name') return row.name || '-';
    if (columnId === 'code') return row.code || '-';
    if (columnId === 'versionCount') return String(getTemplateVersionCount(row));
    if (columnId === 'categoryName') return row.categoryName || '-';
    if (columnId === 'description') return row.description || '-';
    if (columnId === 'status') return getRdoVersionStatusMeta(row.status).label;
    if (columnId === 'createdAt' || columnId === 'updatedAt') return formatDateTime(row[columnId]);
    if (columnId === 'createdBy' || columnId === 'updatedBy') return row[columnId] || '-';
    return '-';
  };

  const renderTemplateNameLink = (row: TemplateModelingRecord) => (
    <Typography
      component="button"
      data-template-name-link
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        openTemplateDrawer(row);
      }}
      sx={{
        p: 0,
        border: 'none',
        bgcolor: 'transparent',
        color: '#1890ff',
        cursor: 'pointer',
        font: 'inherit',
        lineHeight: 'inherit',
        overflow: 'hidden',
        textAlign: 'left',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        '&:hover': { color: '#096dd9', textDecoration: 'underline' },
      }}
    >
      {row.name || '-'}
    </Typography>
  );

  const renderTemplateVersionLink = (row: TemplateModelingRecord, version: TemplateVersionRecord) => (
    <Tooltip title="查看版本详情及审计" arrow>
      <Typography
        component="button"
        data-template-version-link
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          openTemplateVersionDrawer(row, version);
        }}
        sx={{
          p: 0,
          border: 'none',
          bgcolor: 'transparent',
          color: '#1890ff',
          cursor: 'pointer',
          font: 'inherit',
          lineHeight: 'inherit',
          textAlign: 'left',
          whiteSpace: 'nowrap',
          '&:hover': { color: '#096dd9', textDecoration: 'underline' },
        }}
      >
        {version.version || '-'}
      </Typography>
    </Tooltip>
  );

  const renderTemplateVersionTable = (row: TemplateModelingRecord) => {
    const versions = getTemplateVersionRows(row);
    return (
      <TableRow key={`${row.id}:versions`} sx={{ '& .MuiTableCell-root': { borderBottom: 'none' } }}>
        <TableCell colSpan={mainTableColSpan} sx={{ p: 0, bgcolor: '#fafcff' }}>
          <TableContainer sx={{ width: '100%', bgcolor: '#fff', overflow: 'visible' }}>
            <Table stickyHeader size="small" aria-label={pageKey === 'formTemplates' ? '表单模板版本列表' : '批记录模板版本列表'} sx={{ tableLayout: 'fixed', width: totalTemplateVersionTableWidth, minWidth: totalTemplateVersionTableWidth }}>
              <colgroup>
                {visibleTemplateVersionColumns.map((column) => <col key={`${row.id}:${column.id}`} style={{ width: getTemplateVersionColumnWidth(column) }} />)}
              </colgroup>
              <TableHead>
                <TableRow sx={{ '& .MuiTableCell-root': tableHeaderCellSx }}>
                  {visibleTemplateVersionColumns.map((column) => (
                    <TableCell key={column.id} align={column.align} sx={{ width: getTemplateVersionColumnWidth(column), minWidth: column.minWidth, position: 'sticky', top: 0, zIndex: 5, userSelect: 'none', ...(column.resizable ? { pr: 2 } : {}), ...getStickyActionColumnSx(column, 'head') }}>
                      {column.label}
                      {column.resizable ? (
                        <Box
                          data-template-version-column-resizer
                          onMouseDown={(event) => beginTemplateVersionColumnResize(event, column.id)}
                          sx={{ position: 'absolute', top: 0, right: 0, zIndex: 3, width: 8, height: '100%', cursor: 'col-resize', userSelect: 'none', '&::after': { content: '""', position: 'absolute', top: '50%', right: 0, transform: 'translateY(-50%)', width: '1px', height: 18, bgcolor: '#dcdfe6' }, '&:hover': { bgcolor: '#d1e9ff' }, '&:hover::after': { bgcolor: '#1890ff' } }}
                        />
                      ) : null}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {versions.length === 0 ? (
                  <TableRow sx={{ '& .MuiTableCell-root': tableBodyCellSx }}>
                    <TableStateCell colSpan={visibleTemplateVersionColumns.length} align="center" sx={{ color: '#909399' }}>暂无版本</TableStateCell>
                  </TableRow>
                ) : versions.map((versionRow) => (
                  <TableRow key={`${row.id}:${versionRow.id}`} hover onClick={() => openTemplateVersionDrawer(row, versionRow)} sx={{ cursor: 'pointer', '& .MuiTableCell-root': tableBodyCellSx }}>
                    {visibleTemplateVersionColumns.map((column) => {
                      const commonSx = {
                        width: getTemplateVersionColumnWidth(column),
                        minWidth: column.minWidth,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        ...getStickyActionColumnSx(column, 'body'),
                      };
                      const versionDescription = versionRow.description || '-';
                      return (
                        <TableCell key={column.id} align={column.align} sx={commonSx}>
                          {column.id === 'version' ? renderTemplateVersionLink(row, versionRow) : pageKey === 'batchRecordTemplates' && column.id === 'code' ? versionRow.code || '-' : pageKey === 'batchRecordTemplates' && column.id === 'offlineVersion' ? versionRow.offlineVersion || '-' : column.id === 'status' ? (
                            renderStatusBadge(versionRow.status)
                          ) : pageKey === 'batchRecordTemplates' && column.id === 'directoryCount' ? String(versionRow.directoryCount ?? 0) : pageKey === 'batchRecordTemplates' && column.id === 'evidenceCount' ? String(versionRow.evidenceCount ?? 0) : column.id === 'effectiveFrom' ? formatDateTime(versionRow.effectiveFrom) : column.id === 'effectiveTo' ? formatDateTime(versionRow.effectiveTo) : column.id === 'description' ? versionDescription : column.id === 'createdBy' ? versionRow.createdBy || '-' : column.id === 'createdAt' ? formatDateTime(versionRow.createdAt) : column.id === 'updatedBy' ? versionRow.updatedBy || '-' : column.id === 'updatedAt' ? formatDateTime(versionRow.updatedAt) : column.id === 'actions' ? (
                            renderTemplateVersionActions(row, versionRow, versions.length > 1)
                          ) : ''}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </TableCell>
      </TableRow>
    );
  };

  const renderMainTableActionSpacerCell = (layer: 'head' | 'body') => (
    hasMainTableSpacer ? (
      <TableCell
        data-template-main-action-spacer
        aria-hidden="true"
        sx={{
          width: mainTableSpacerWidth,
          minWidth: mainTableSpacerWidth,
          maxWidth: mainTableSpacerWidth,
          p: 0,
          bgcolor: layer === 'head' ? '#f5f7fa' : '#fff',
          ...(layer === 'head' ? { position: 'sticky', top: 0, zIndex: 5 } : {}),
        }}
      />
    ) : null
  );

  const renderTemplateTableRow = (row: TemplateModelingRecord) => {
    const isExpanded = expandedTemplateGroups.has(String(row.id));
    return (
      <Fragment key={row.id}>
        <TableRow key={row.id} hover onClick={() => expandTemplateGroup(row.id)} sx={{ cursor: 'pointer' }}>
          {visibleColumns.map((column, index) => {
            const commonSx = {
              width: getColumnWidth(column),
              minWidth: column.minWidth,
              ...tableBodyCellSx,
              ...getStickyActionColumnSx(column, 'body'),
            };
            return (
              <Fragment key={column.id}>
                {column.id === 'actions' ? renderMainTableActionSpacerCell('body') : null}
                <TableCell align={column.align} data-template-main-action-column={column.id === 'actions' ? 'true' : undefined} sx={commonSx} title={column.id === 'actions' ? undefined : renderTemplateGroupCell(row, column)}>
                  {column.id === 'actions' ? renderCell(row, column) : index === 0 ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0, gap: 0.5 }}>
                    <IconButton
                      size="small"
                      onClick={(event) => {
                        event.stopPropagation();
                        expandTemplateGroup(row.id);
                      }}
                      sx={{ width: 24, height: 24, color: '#606266' }}
                    >
                      {isExpanded ? <ExpandLess fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                    </IconButton>
                    {column.id === 'name' ? renderTemplateNameLink(row) : (
                      <Typography sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {renderTemplateGroupCell(row, column)}
                      </Typography>
                    )}
                  </Box>
                ) : column.id === 'name' ? (
                  renderTemplateNameLink(row)
                ) : column.id === 'status' ? (
                  renderStatusBadge(row.status)
                ) : (
                  renderTemplateGroupCell(row, column)
                  )}
                </TableCell>
              </Fragment>
            );
          })}
        </TableRow>
        {isExpanded ? renderTemplateVersionTable(row) : null}
      </Fragment>
    );
  };

  const renderAddTemplateVersionAction = (row: TemplateModelingRecord) => (
    <Tooltip title="新增子版本" arrow>
      <IconButton size="small" aria-label="新增子版本" disabled={pageKey === 'batchRecordTemplates' && saveDhrVersionMutation.isPending} onClick={(event) => {
        event.stopPropagation();
        if (pageKey === 'batchRecordTemplates') {
          openDhrVersionDialog(row, null);
        } else {
          openCreateTemplateVersionDialog(row);
        }
      }}>
        <PlaylistAdd fontSize="small" />
      </IconButton>
    </Tooltip>
  );

  const canDeleteTemplateFromMainRow = (row: TemplateModelingRecord) => {
    const versions = getTemplateVersionRows(row);
    if (pageKey === 'formTemplates') return versions.length <= 1;
    return versions.length <= 1;
  };

  const renderCell = (row: TemplateModelingRecord, column: TemplateColumn): ReactNode => {
    const columnId = column.id;
    if (columnId === 'status') {
      return renderStatusBadge(row.status);
    }
    if (columnId === 'createdAt' || columnId === 'updatedAt') return formatDateTime(row[columnId]);
    if (columnId === 'versionCount') return String(getTemplateVersionCount(row));
    if (columnId === 'categoryName') return row.categoryName || '-';
    if (columnId === 'description') return row.description || '-';
    if (columnId === 'actions') {
      return (
        <Stack direction="row" spacing={0} justifyContent="center" onClick={(event) => event.stopPropagation()}>
          {renderAddTemplateVersionAction(row)}
          <Tooltip title="编辑" arrow>
            <IconButton size="small" aria-label="编辑" onClick={() => openEditDialog(row)}><EditIcon fontSize="small" /></IconButton>
          </Tooltip>
          {canDeleteTemplateFromMainRow(row) ? (
            <Tooltip title="删除" arrow>
              <IconButton size="small" color="error" aria-label="删除" onClick={() => setDeleteRowTarget(row)}><DeleteIcon fontSize="small" /></IconButton>
            </Tooltip>
          ) : null}
        </Stack>
      );
    }
    if (columnId === 'name' || columnId === 'code' || columnId === 'createdBy' || columnId === 'updatedBy') return row[columnId] || '-';
    return '-';
  };

  const renderTemplateRightPanel = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 1.5, width: '100%', maxWidth: '100%', minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
      <Box sx={{ flex: '0 0 auto', bgcolor: '#fff', border: '1px solid #e4e7ed', borderRadius: 1, p: 2, maxWidth: '100%', minWidth: 0 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5, alignItems: 'center' }}>
          <TextField
            size="small"
            label={pageKey === 'formTemplates' ? '表单名称' : '模板名称'}
            placeholder="请输入"
            value={nameKeyword}
            onChange={(event) => setNameKeyword(event.target.value)}
            sx={fieldSx}
            InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
          />
          <TextField
            size="small"
            label={pageKey === 'formTemplates' ? '表单编码' : '版本编码'}
            placeholder="请输入"
            value={codeKeyword}
            onChange={(event) => setCodeKeyword(event.target.value)}
            sx={fieldSx}
          />
          <TextField
            size="small"
            select
            label={pageKey === 'batchRecordTemplates' ? '版本状态' : '状态'}
            value={status}
            onChange={(event) => { setStatus(event.target.value); setPage(1); }}
            sx={fieldSx}
          >
            {TEMPLATE_STATUS_OPTIONS.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
          </TextField>
          <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="flex-end" sx={{ gridColumn: { xs: '1', md: '3' } }}>
            <Button size="small" sx={QUERY_BUTTON_SX} variant="outlined" startIcon={<RestartAlt />} onClick={() => { setNameKeyword(''); setCodeKeyword(''); setStatus('ALL'); setPage(1); }}>重置</Button>
            <Button size="small" sx={QUERY_BUTTON_SX} variant="contained" startIcon={<Search />} onClick={() => setPage(1)}>查询</Button>
          </Stack>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, width: '100%', maxWidth: '100%', minWidth: 0, minHeight: 0, bgcolor: '#fff', border: '1px solid #e4e7ed', borderRadius: 1, overflow: 'hidden' }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ minHeight: 48, px: 2, borderBottom: '1px solid #e4e7ed' }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Tooltip title="字段设置" arrow>
              <IconButton
                data-template-column-settings-trigger
                size="small"
                aria-label="字段设置"
                onClick={(event) => setColumnSettingsAnchorEl(event.currentTarget)}
                sx={{ width: 36, height: 36, border: '1px solid #e4e7ed', borderRadius: 1, color: '#606266', bgcolor: '#fff', '&:hover': { color: '#1890ff', bgcolor: '#e8f4ff' } }}
              >
                <Box aria-hidden="true" sx={{ position: 'relative', width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ViewColumnRounded sx={{ fontSize: 21 }} />
                  <TuneRounded sx={{ position: 'absolute', right: -3, bottom: -2, fontSize: 13, p: '1px', borderRadius: '50%', bgcolor: '#fff', boxShadow: '0 0 0 1px #fff' }} />
                </Box>
              </IconButton>
            </Tooltip>
            <Tooltip title="全部展开" arrow>
              <IconButton data-template-expand-all size="small" aria-label="全部展开" onClick={expandAllTemplateGroups} sx={{ width: 36, height: 36, border: '1px solid #e4e7ed', borderRadius: 1, color: '#606266', bgcolor: '#fff', '&:hover': { color: '#1890ff', bgcolor: '#e8f4ff' } }}>
                <UnfoldMoreRounded fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="全部收起" arrow>
              <IconButton data-template-collapse-all size="small" aria-label="全部收起" onClick={collapseAllTemplateGroups} sx={{ width: 36, height: 36, border: '1px solid #e4e7ed', borderRadius: 1, color: '#606266', bgcolor: '#fff', '&:hover': { color: '#1890ff', bgcolor: '#e8f4ff' } }}>
                <UnfoldLessRounded fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
          <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={openCreateDialog}>新增</Button>
        </Stack>

        <Popover
          open={Boolean(columnSettingsAnchorEl)}
          anchorEl={columnSettingsAnchorEl}
          onClose={() => setColumnSettingsAnchorEl(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          transformOrigin={{ vertical: 'top', horizontal: 'left' }}
          PaperProps={{ sx: { mt: 1, width: 220, border: '1px solid #e4e7ed', borderRadius: 1, boxShadow: '0 8px 24px rgba(0,0,0,.12)' } }}
        >
          <Stack data-template-column-settings-panel spacing={0.5} sx={{ p: 1.5 }}>
            <Tabs data-template-column-settings-tabs value={columnSettingsTab} onChange={(_, value: TemplateColumnSettingsTarget) => setColumnSettingsTab(value)} aria-label={`${config.title}字段设置切换`} sx={{ minHeight: 32, mb: 0.5, '& .MuiTab-root': { minHeight: 32, py: 0, fontSize: 13 } }}>
              <Tab label="主表" value="main" />
              <Tab label="子表" value="version" />
            </Tabs>
            {activeColumnSettingsItems.map((column) => {
              const checked = !activeColumnSettings.hidden.includes(column.id);
              const disabled = checked && activeVisibleConfigurableColumnCount <= 1;
              return (
                <Box
                  key={column.id}
                  data-template-column-settings-row
                  data-column-id={column.id}
                  draggable
                  onDragStart={(event) => handleColumnSettingDragStart(event, column.id)}
                  onDragOver={handleColumnSettingDragOver}
                  onDrop={(event) => handleColumnSettingDrop(event, column.id)}
                  onDragEnd={handleColumnSettingDragEnd}
                  onPointerDown={(event) => beginColumnSettingPointerDrag(event, column.id)}
                  sx={{ display: 'grid', gridTemplateColumns: '24px 34px minmax(0, 1fr)', alignItems: 'center', minHeight: 40, borderRadius: 1, cursor: 'move', touchAction: 'none', color: checked ? '#1890ff' : '#a8abb2', opacity: draggingColumnId === column.id ? 0.55 : 1, '&:hover': { bgcolor: '#f5f7fa' } }}
                >
                  <DragIndicator fontSize="small" sx={{ color: '#909399' }} />
                  <input
                    aria-label={`${column.label}字段显隐`}
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggleColumnVisibility(column.id)}
                    onClick={(event) => event.stopPropagation()}
                    style={{ width: 16, height: 16 }}
                  />
                  <Typography sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{column.label}</Typography>
                </Box>
              );
            })}
          </Stack>
        </Popover>

        <Box sx={{ position: 'relative', flex: 1, width: '100%', maxWidth: '100%', minWidth: 0, minHeight: 0 }}>
          <TableContainer ref={tableContainerRef} sx={{ width: '100%', maxWidth: '100%', minWidth: 0, height: '100%', minHeight: 0, overflow: 'auto' }}>
            <Table stickyHeader size="small" sx={{ tableLayout: 'fixed', width: effectiveMainTableWidth, minWidth: effectiveMainTableWidth, height: isTableEmptyState ? '100%' : 'auto' }}>
              <colgroup>
                {visibleColumns.map((column) => (
                  column.id === 'actions' ? (
                    <Fragment key={column.id}>
                      {hasMainTableSpacer ? <col data-template-main-action-spacer style={{ width: mainTableSpacerWidth }} /> : null}
                      <col style={{ width: getColumnWidth(column) }} />
                    </Fragment>
                  ) : <col key={column.id} style={{ width: getColumnWidth(column) }} />
                ))}
              </colgroup>
              <TableHead>
                <TableRow sx={{ '& .MuiTableCell-root': tableHeaderCellSx }}>
                  {visibleColumns.map((column) => (
                    <Fragment key={column.id}>
                      {column.id === 'actions' ? renderMainTableActionSpacerCell('head') : null}
                      <TableCell align={column.align} data-template-main-action-column={column.id === 'actions' ? 'true' : undefined} sx={{ width: getColumnWidth(column), minWidth: column.minWidth, position: 'sticky', top: 0, zIndex: 5, userSelect: 'none', ...(column.resizable ? { pr: 2 } : {}), ...getStickyActionColumnSx(column, 'head') }}>
                        {column.label}
                        {column.resizable ? (
                        <Box
                          data-template-column-resizer
                          onMouseDown={(event) => beginColumnResize(event, column.id)}
                          sx={{ position: 'absolute', top: 0, right: 0, zIndex: 3, width: 8, height: '100%', cursor: 'col-resize', userSelect: 'none', '&::after': { content: '""', position: 'absolute', top: '50%', right: 0, transform: 'translateY(-50%)', width: '1px', height: 18, bgcolor: '#dcdfe6' }, '&:hover': { bgcolor: '#d1e9ff' }, '&:hover::after': { bgcolor: '#1890ff' } }}
                        />
                        ) : null}
                      </TableCell>
                    </Fragment>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody sx={{ height: isTableEmptyState ? '100%' : 'auto' }}>
                {listQuery.isLoading ? (
                  <TableRow sx={emptyTableRowSx}><TableStateCell colSpan={mainTableColSpan} align="center" sx={emptyTableBodyCellSx}><CircularProgress size={24} /></TableStateCell></TableRow>
                ) : listQuery.isError ? (
                  <TableRow sx={emptyTableRowSx}><TableStateCell colSpan={mainTableColSpan} align="center" sx={emptyTableBodyCellSx}>加载失败</TableStateCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow sx={emptyTableRowSx}><TableStateCell colSpan={mainTableColSpan} align="center" sx={emptyTableBodyCellSx}>暂无数据</TableStateCell></TableRow>
                ) : rows.map((row) => renderTemplateTableRow(row))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>

        <Box sx={{ minHeight: 56, px: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
          <Typography sx={{ color: '#909399' }}>共 {listQuery.data?.totalElements ?? 0} 条数据</Typography>
          <Stack direction="row" spacing={2} alignItems="center">
            <Pagination page={page} count={pageCount} color="primary" size="small" onChange={(_, value) => setPage(value)} />
            <FormControl size="small" sx={{ minWidth: 116 }}>
              <Select
                value={pageSize}
                onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}
                sx={{ height: 32, fontSize: 14 }}
              >
                {PAGE_SIZE_OPTIONS.map((option) => <MenuItem key={option} value={option}>{option} 条/页</MenuItem>)}
              </Select>
            </FormControl>
          </Stack>
        </Box>
      </Box>
    </Box>
  );

  const auditEvents = auditQuery.data ?? [];
  const auditRecords = getAuditRecords(auditEvents);
  const drawerBaseDetailRows: Array<[string, ReactNode]> = drawerVersionRow ? [
    ['模板名称', drawerRow?.name],
    ['版本号', drawerVersionRow.version],
    ...(pageKey === 'batchRecordTemplates' ? [
      ['模板编码', drawerVersionRow.code || '-'],
      ['线下版本', drawerVersionRow.offlineVersion || '-'],
    ] as Array<[string, ReactNode]> : [
      ['模板编码', drawerRow?.code || '-'],
    ] as Array<[string, ReactNode]>),
    ['版本状态', renderStatusBadge(drawerVersionRow.status)],
    ...(pageKey === 'batchRecordTemplates' ? [
      ['生效时间', formatDateTime(drawerVersionRow.effectiveFrom)],
      ['失效时间', formatDateTime(drawerVersionRow.effectiveTo)],
      ['版本说明', drawerVersionRow.description || '-'],
      ['目录数', drawerVersionRow.directoryCount ?? 0],
      ['表单证据数', drawerVersionRow.evidenceCount ?? 0],
    ] as Array<[string, ReactNode]> : [
      ['生效时间', formatDateTime(drawerVersionRow.effectiveFrom)],
      ['失效时间', formatDateTime(drawerVersionRow.effectiveTo)],
      ['源文件名称', drawerVersionRow.sourceFileName],
      ['源文件类型', drawerVersionRow.sourceFileType],
      ['导入状态', drawerVersionRow.importStatus],
    ] as Array<[string, ReactNode]>),
  ] : [
    ['模板名称', drawerRow?.name],
    ['版本数量', drawerRow ? getTemplateVersionCount(drawerRow) : '-'],
    ['模板分类', drawerRow?.categoryName],
    ...(pageKey === 'formTemplates' ? [['状态', renderStatusBadge(drawerRow?.status)] as [string, ReactNode]] : []),
    ['模板描述', drawerRow?.description],
  ];
  const drawerSystemDetailRows: Array<[string, ReactNode]> = drawerVersionRow ? [
    ['创建人', drawerVersionRow.createdBy],
    ['创建时间', formatDateTime(drawerVersionRow.createdAt)],
    ['更新人', drawerVersionRow.updatedBy || drawerVersionRow.createdBy],
    ['更新时间', formatDateTime(drawerVersionRow.updatedAt || drawerVersionRow.createdAt)],
  ] : [
    ['创建人', drawerRow?.createdBy],
    ['创建时间', formatDateTime(drawerRow?.createdAt)],
    ['更新人', drawerRow?.updatedBy || drawerRow?.createdBy],
    ['更新时间', formatDateTime(drawerRow?.updatedAt || drawerRow?.createdAt)],
  ];
  const closeDetailDrawer = () => {
    setDrawerRow(null);
    setDrawerVersionRow(null);
    setAuditSnapshot(null);
  };
  const isCreatingDhrTemplate = pageKey === 'batchRecordTemplates' && !editingRow && !creatingVersionFrom && !editingVersion;
  const shouldRenderVersionSection = !editingRow;

  return (
    <Box sx={{ height: 'calc(100vh - 150px)', display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '260px minmax(0, 1fr)' }, gap: 1.5, minHeight: 0, overflow: 'hidden' }}>
      {renderTemplateCategoryPanel()}
      {renderTemplateRightPanel()}

      <AppDialog open={dialogOpen} onClose={() => { setDialogOpen(false); setCreatingVersionFrom(null); setEditingVersion(null); }} fullWidth maxWidth="sm">
        <DialogTitle>{creatingVersionFrom ? '新增子版本' : editingVersion ? '编辑版本' : editingRow ? config.editTitle : config.createTitle}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.5} sx={{ pt: 0.5 }}>
            {creatingVersionFrom || editingVersion ? null : (
              <DetailSection title="基础信息">
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
                  <TextField required fullWidth size="small" label={pageKey === 'formTemplates' ? '表单名称' : '模板名称'} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} sx={fieldSx} />
                  {pageKey === 'formTemplates' ? <TextField required fullWidth size="small" label="表单编码" value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} sx={fieldSx} /> : null}
                  <Autocomplete
                    freeSolo
                    options={categoryOptions}
                    value={form.categoryName}
                    noOptionsText="暂无数据"
                    onInputChange={(_, value) => setForm((current) => ({ ...current, categoryName: value }))}
                    renderInput={(params) => <TextField {...params} fullWidth size="small" label="模板分类" sx={fieldSx} />}
                  />
                  <TextField fullWidth size="small" label={pageKey === 'formTemplates' ? '表单描述' : '模板描述'} multiline minRows={3} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} sx={{ gridColumn: { xs: 'auto', sm: '1 / -1' } }} />
                </Box>
              </DetailSection>
            )}
            {shouldRenderVersionSection ? (
              <DetailSection title="版本信息">
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
                  <TextField required fullWidth size="small" label="版本" value={form.version} onChange={(event) => setForm((current) => ({ ...current, version: event.target.value }))} sx={fieldSx} />
                  {pageKey === 'batchRecordTemplates' ? <TextField fullWidth size="small" label="模板编码" value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} inputProps={{ maxLength: 64 }} helperText={`${form.code.length} / 64`} sx={fieldSx} /> : null}
                  {pageKey === 'batchRecordTemplates' ? <TextField fullWidth size="small" label="线下版本" value={form.offlineVersion} onChange={(event) => setForm((current) => ({ ...current, offlineVersion: event.target.value }))} inputProps={{ maxLength: 20 }} helperText={`${form.offlineVersion.length} / 20`} sx={fieldSx} /> : null}
                  <TextField required={isCreatingDhrTemplate} fullWidth size="small" label="生效时间" type="datetime-local" value={form.effectiveFrom} onChange={(event) => setForm((current) => ({ ...current, effectiveFrom: event.target.value }))} inputRef={effectiveFromInputRef} InputLabelProps={{ shrink: true }} sx={fieldSx} />
                  <TextField fullWidth size="small" label="失效时间" type="datetime-local" value={form.effectiveTo} onChange={(event) => setForm((current) => ({ ...current, effectiveTo: event.target.value }))} inputRef={effectiveToInputRef} InputLabelProps={{ shrink: true }} sx={fieldSx} />
                  <TextField fullWidth size="small" label="版本说明" multiline minRows={3} value={form.versionDescription} onChange={(event) => setForm((current) => ({ ...current, versionDescription: event.target.value }))} sx={{ gridColumn: { xs: 'auto', sm: '1 / -1' } }} />
                </Box>
              </DetailSection>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setDialogOpen(false); setCreatingVersionFrom(null); setEditingVersion(null); }}>取消</Button>
          <Button variant="contained" disabled={saveMutation.isPending} onClick={handleSubmit}>保存</Button>
        </DialogActions>
      </AppDialog>

      <AppDialog open={dhrVersionDialog !== null} onClose={() => { setDhrVersionDialog(null); setDhrVersionLabel(''); setDhrVersionCode(''); setDhrVersionOfflineVersion(''); setDhrVersionDescription(''); setDhrVersionEffectiveFrom(defaultEffectiveFromValue()); setDhrVersionEffectiveTo(''); }} fullWidth maxWidth="sm">
        <DialogTitle>{dhrVersionDialog?.mode === 'edit' ? '编辑版本' : dhrVersionDialog?.mode === 'copy' ? '复制版本' : '新增子版本'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.5} sx={{ pt: 0.5 }}>
            <TextField fullWidth size="small" label="批记录模板" value={dhrVersionDialog?.row.name ?? ''} InputProps={{ readOnly: true }} sx={fieldSx} />
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
              <TextField required fullWidth size="small" label="版本" value={dhrVersionLabel} onChange={(event) => setDhrVersionLabel(event.target.value)} inputProps={{ maxLength: 64 }} sx={fieldSx} />
              <TextField fullWidth size="small" label="版本来源" value={dhrVersionDialog?.mode === 'edit' ? '编辑中的版本' : dhrVersionDialog?.sourceVersion ? `${dhrVersionDialog.sourceVersion.version}（复制目录与表单证据）` : '空白版本'} InputProps={{ readOnly: true }} sx={fieldSx} />
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
              <TextField fullWidth size="small" label="模板编码" value={dhrVersionCode} onChange={(event) => setDhrVersionCode(event.target.value)} inputProps={{ maxLength: 64 }} helperText={`${dhrVersionCode.length} / 64`} sx={fieldSx} />
              <TextField fullWidth size="small" label="线下版本" value={dhrVersionOfflineVersion} onChange={(event) => setDhrVersionOfflineVersion(event.target.value)} inputProps={{ maxLength: 20 }} helperText={`${dhrVersionOfflineVersion.length} / 20`} sx={fieldSx} />
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
              <TextField required fullWidth size="small" label="生效时间" type="datetime-local" value={dhrVersionEffectiveFrom} onChange={(event) => setDhrVersionEffectiveFrom(event.target.value)} InputLabelProps={{ shrink: true }} sx={fieldSx} />
              <TextField fullWidth size="small" label="失效时间" type="datetime-local" value={dhrVersionEffectiveTo} onChange={(event) => setDhrVersionEffectiveTo(event.target.value)} InputLabelProps={{ shrink: true }} sx={fieldSx} />
            </Box>
            <TextField fullWidth autoFocus size="small" label="版本说明" multiline minRows={3} value={dhrVersionDescription} onChange={(event) => setDhrVersionDescription(event.target.value)} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setDhrVersionDialog(null); setDhrVersionLabel(''); setDhrVersionCode(''); setDhrVersionOfflineVersion(''); setDhrVersionDescription(''); setDhrVersionEffectiveFrom(defaultEffectiveFromValue()); setDhrVersionEffectiveTo(''); }}>取消</Button>
          <Button variant="contained" disabled={!dhrVersionDialog || saveDhrVersionMutation.isPending} onClick={submitDhrVersionDialog}>确认</Button>
        </DialogActions>
      </AppDialog>

      <AppDialog open={categoryDialog.open} onClose={() => setCategoryDialog({ open: false, target: null, name: '' })} fullWidth maxWidth="xs">
        <DialogTitle>{categoryDialog.target ? '编辑分类' : '新增分类'}</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <TextField fullWidth autoFocus label="分类名称" value={categoryDialog.name} onChange={(event) => setCategoryDialog((current) => ({ ...current, name: event.target.value }))} sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCategoryDialog({ open: false, target: null, name: '' })}>取消</Button>
          <Button variant="contained" disabled={!categoryDialog.name.trim() || saveCategoryMutation.isPending} onClick={() => saveCategoryMutation.mutate()}>保存</Button>
        </DialogActions>
      </AppDialog>

      <AppDialog open={deleteCategoryTarget !== null} onClose={() => setDeleteCategoryTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle>删除分类</DialogTitle>
        <DialogContent>确认删除分类“{deleteCategoryTarget?.name}”吗？</DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteCategoryTarget(null)}>取消</Button>
          <Button color="error" variant="contained" disabled={!deleteCategoryTarget || deleteCategoryMutation.isPending} onClick={() => deleteCategoryTarget && deleteCategoryMutation.mutate(deleteCategoryTarget)}>删除</Button>
        </DialogActions>
      </AppDialog>

      <AppDialog open={deleteRowTarget !== null} onClose={() => setDeleteRowTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle>删除模板</DialogTitle>
        <DialogContent>确认删除模板“{deleteRowTarget?.name}”吗？</DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteRowTarget(null)}>取消</Button>
          <Button color="error" variant="contained" disabled={!deleteRowTarget || deleteMutation.isPending} onClick={() => deleteRowTarget && deleteMutation.mutate(deleteRowTarget)}>删除</Button>
        </DialogActions>
      </AppDialog>

      <AppDialog open={deleteVersionTarget !== null} onClose={() => setDeleteVersionTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle>删除版本</DialogTitle>
        <DialogContent>确认删除版本“{deleteVersionTarget?.version.version}”吗？</DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteVersionTarget(null)}>取消</Button>
          <Button color="error" variant="contained" disabled={!deleteVersionTarget || deleteVersionMutation.isPending} onClick={() => deleteVersionTarget && deleteVersionMutation.mutate(deleteVersionTarget)}>删除</Button>
        </DialogActions>
      </AppDialog>

      {reactDesignerState.open ? (
        <Suspense fallback={null}>
          <TemplateDesignerReactDialog
            open={reactDesignerState.open}
            row={reactDesignerState.row}
            version={reactDesignerState.version}
            saving={saveDesignerMutation.isPending || autoSaveDesignerMutation.isPending}
            onClose={() => setReactDesignerState({ open: false, row: null, version: null })}
            onSave={(payload) => saveDesignerMutation.mutateAsync(payload)}
            onAutoSave={(payload) => autoSaveDesignerMutation.mutateAsync(payload)}
          />
        </Suspense>
      ) : null}

      <DhrTemplateWorkspaceDialog
        open={dhrWorkspaceRow !== null}
        template={dhrWorkspaceRow?.row ?? null}
        initialVersionId={dhrWorkspaceRow?.initialVersionId}
        onClose={() => setDhrWorkspaceRow(null)}
      />

      <Drawer
        anchor="right"
        open={drawerRow !== null}
        onClose={closeDetailDrawer}
        sx={appContentDrawerSx}
        slotProps={{ backdrop: { sx: appContentDrawerSx } }}
        PaperProps={{ sx: appContentDrawerPaperSx }}
      >
        <Box sx={{ width: { xs: '100vw', sm: 560 }, p: 2, bgcolor: '#f7f9fc', minHeight: '100%' }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#303133' }}>信息查看</Typography>
            <IconButton size="small" onClick={closeDetailDrawer} aria-label="关闭详情"><CloseIcon /></IconButton>
          </Stack>
          {!drawerRow ? null : (
            <>
              <Box sx={{ mt: 1, borderBottom: '1px solid #e4e7ed' }}>
                <Tabs value={drawerTab} onChange={(_, value: number) => setDrawerTab(value)} aria-label={`${config.title}详情切换`}>
                  <Tab label="数据信息" />
                  <Tab label="数据审计" />
                </Tabs>
              </Box>
              {drawerTab === 0 ? (
                <Stack spacing={2} sx={{ mt: 2 }}>
                  <DetailSection title="基本信息">
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
                      {drawerBaseDetailRows.map(([label, value]) => (
                        <DetailField key={label} label={label}>{value || '-'}</DetailField>
                      ))}
                    </Box>
                  </DetailSection>
                  <DetailSection title="系统信息">
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
                      {drawerSystemDetailRows.map(([label, value]) => (
                        <DetailField key={label} label={label}>{value || '-'}</DetailField>
                      ))}
                    </Box>
                  </DetailSection>
                </Stack>
              ) : null}
              {drawerTab === 1 ? (
                <Stack spacing={2} sx={{ mt: 2 }}>
                  <DetailSection title="审计记录">
                    <Stack spacing={1}>
                      {auditQuery.isLoading ? (
                        <Box sx={{ px: 1.5, py: 3, textAlign: 'center', color: '#909399', bgcolor: '#fff', border: '1px solid #e4e7ed', borderRadius: '4px' }}>
                          <Typography variant="body2">审计记录加载中</Typography>
                        </Box>
                      ) : auditQuery.isError ? (
                        <Box sx={{ px: 1.5, py: 3, textAlign: 'center', color: '#f56c6c', bgcolor: '#fff', border: '1px solid #fbc4c4', borderRadius: '4px' }}>
                          <Typography variant="body2">审计记录加载失败</Typography>
                        </Box>
                      ) : auditRecords.length === 0 ? (
                        <Box sx={{ px: 1.5, py: 3, textAlign: 'center', color: '#909399', bgcolor: '#fff', border: '1px solid #e4e7ed', borderRadius: '4px' }}>
                          <Typography variant="body2">暂无审计记录</Typography>
                        </Box>
                      ) : auditRecords.map((record) => (
                        <Accordion key={record.id} data-audit-accordion-row={record.id} disableGutters elevation={0} sx={{ border: '1px solid #e4e7ed', borderRadius: '4px !important', bgcolor: '#fff', overflow: 'hidden', '&::before': { display: 'none' }, '&.Mui-expanded': { m: 0 } }}>
                          <AccordionSummary expandIcon={<ExpandMoreIcon fontSize="small" />} sx={{ minHeight: 44, px: 1.5, '&.Mui-expanded': { minHeight: 44 }, '& .MuiAccordionSummary-content': { m: 0, minWidth: 0 }, '& .MuiAccordionSummary-content.Mui-expanded': { m: 0 } }}>
                            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.35fr', columnGap: 1, width: '100%', minWidth: 0, alignItems: 'center' }}>
                              <Typography variant="body2" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{record.operatorName}</Typography>
                              <Typography variant="body2" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{record.actionLabel}</Typography>
                              <Typography variant="body2" sx={{ color: '#606266', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatDateTime(record.operatedAt)}</Typography>
                            </Box>
                          </AccordionSummary>
                          <AccordionDetails sx={{ px: 1.5, pt: 0, pb: 1.5 }}>
                            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
                              <AuditFieldBlock title="变更前" fields={record.beforeFields} onViewSnapshot={(field) => setAuditSnapshot({ title: field.label, value: field.rawValue })} />
                              <AuditFieldBlock title="变更后" fields={record.afterFields} onViewSnapshot={(field) => setAuditSnapshot({ title: field.label, value: field.rawValue })} />
                            </Box>
                          </AccordionDetails>
                        </Accordion>
                      ))}
                    </Stack>
                  </DetailSection>
                </Stack>
              ) : null}
            </>
          )}
        </Box>
      </Drawer>
      <AppDialog open={auditSnapshot !== null} onClose={() => setAuditSnapshot(null)} fullWidth maxWidth="md" PaperProps={{ sx: { height: 'min(72vh, 760px)' } }}>
        <DialogTitle>审计快照 · {auditSnapshot?.title}</DialogTitle>
        <DialogContent dividers sx={{ minHeight: 0, overflow: 'auto', bgcolor: '#f8fafc' }}>
          <Box component="pre" sx={{ m: 0, p: 1.5, minHeight: '100%', boxSizing: 'border-box', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap', color: '#303133', bgcolor: '#fff', border: '1px solid #e4e7ed', borderRadius: 1, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: 12, lineHeight: 1.6 }}>
            {auditSnapshot ? formatAuditSnapshot(auditSnapshot.value) : ''}
          </Box>
        </DialogContent>
        <DialogActions><Button onClick={() => setAuditSnapshot(null)}>关闭</Button></DialogActions>
      </AppDialog>
    </Box>
  );
}
