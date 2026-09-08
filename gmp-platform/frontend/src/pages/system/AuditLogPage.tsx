import TableStateCell from '@/components/TableStateCell';
import {
  type DragEvent as ReactDragEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type SyntheticEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Drawer,
  IconButton,
  InputAdornment,
  MenuItem,
  Pagination,
  Popover,
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
import { Close, DragIndicator, ImageOutlined, RestartAlt, Search, TuneRounded, ViewColumnRounded } from '@mui/icons-material';
import { getAuditLogs, type AuditLogItem } from '@/api/audit';
import StatusBadge from '@/components/StatusBadge';
import type { PageResult } from '@/types/common';
import { SIDEBAR_MODULES } from '@/utils/constants';

type AuditColumnId =
  | 'operatorDisplayName'
  | 'operatorAccount'
  | 'operationTime'
  | 'actionLabel'
  | 'triggerMethod'
  | 'moduleName'
  | 'menuName'
  | 'functionName';

interface AuditColumn {
  id: AuditColumnId;
  label: string;
  defaultWidth: number;
  minWidth: number;
  resizable?: boolean;
}

interface AuditColumnSettings {
  order: AuditColumnId[];
  hidden: AuditColumnId[];
}

interface AuditFilters {
  operatorName: string;
  operatorAccount: string;
  action: string;
  moduleName: string;
  menuName: string;
}

interface AuditFieldRow {
  label: string;
  value: ReactNode;
}

const PAGE_SIZE = 20;
const AUDIT_PAGE_SIZE_OPTIONS = [20, 50, 100, 200] as const;
const AUDIT_COLUMN_WIDTH_STORAGE_PREFIX = 'audit-log-column-widths:';
const AUDIT_COLUMN_SETTINGS_STORAGE_PREFIX = 'audit-log-column-settings:';
const TABLE_DATA_ROW_HEIGHT = 40;
const AUDIT_FIELD_COLUMN_MIN_WIDTH = 88;
const AUDIT_LOG_PAGE_HEIGHT = 'calc(100vh - 142px)';
const AUDIT_QUERY_FIELD_SX = {
  '& .MuiInputBase-root': { height: 40 },
  '& .MuiInputBase-input': { boxSizing: 'border-box' },
};
const AUDIT_QUERY_BUTTON_SX = { height: 40, width: 80, minWidth: 80 };

const emptyFilters: AuditFilters = {
  operatorName: '',
  operatorAccount: '',
  action: '',
  moduleName: '',
  menuName: '',
};

const auditColumns: AuditColumn[] = [
  { id: 'operatorDisplayName', label: '操作人', defaultWidth: 120, minWidth: AUDIT_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'operatorAccount', label: '账号', defaultWidth: 120, minWidth: AUDIT_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'operationTime', label: '操作时间', defaultWidth: 160, minWidth: 140, resizable: true },
  { id: 'actionLabel', label: '操作动作', defaultWidth: 110, minWidth: AUDIT_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'triggerMethod', label: '触发方式', defaultWidth: 110, minWidth: AUDIT_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'moduleName', label: '功能模块', defaultWidth: 120, minWidth: AUDIT_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'menuName', label: '菜单', defaultWidth: 120, minWidth: AUDIT_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'functionName', label: '具体功能', defaultWidth: 150, minWidth: 120, resizable: true },
];

const actionOptions = [
  { value: 'CREATE', label: '新增' },
  { value: 'UPDATE', label: '编辑' },
  { value: 'DELETE', label: '删除' },
  { value: 'ENABLE', label: '启用' },
  { value: 'DISABLE', label: '禁用' },
  { value: 'RESET_PASSWORD', label: '重置密码' },
  { value: 'PERMISSION_UPDATE', label: '权限设置' },
  { value: 'UPLOAD', label: '上传' },
  { value: 'IMPORT', label: '导入' },
  { value: 'EXPORT', label: '导出' },
  { value: 'REORDER', label: '排序调整' },
  { value: 'BATCH_DELETE', label: '批量删除' },
  { value: 'MOVE', label: '移动' },
  { value: 'UPLOAD_LOGO', label: '上传系统 Logo' },
  { value: 'UPLOAD_FAVICON', label: '上传网站图标' },
  { value: 'DELETE_LOGO', label: '删除系统 Logo' },
  { value: 'DELETE_FAVICON', label: '删除网站图标' },
  { value: 'LOGIN', label: '登录' },
  { value: 'LOGOUT', label: '退出' },
];

const fieldSx = {
  '& .MuiInputBase-root': {
    height: 40,
  },
  '& .MuiInputBase-input': {
    boxSizing: 'border-box',
  },
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
};

const emptyTableBodyCellSx = {
  height: '100%',
  py: 0,
  borderBottom: '1px solid #ebeef5',
  color: '#909399',
};

const emptyTableRowSx = {
  height: '100%',
};

const appContentDrawerSx = {
  top: 0,
  bottom: 0,
  height: '100vh',
  zIndex: 1300,
};

const appContentDrawerPaperSx = {
  ...appContentDrawerSx,
  top: 0,
  bottom: 0,
  height: 'auto',
  transform: 'none !important',
  transition: 'none !important',
  width: { xs: '100%', sm: 620 },
};

function isAuditColumnId(value: unknown): value is AuditColumnId {
  return typeof value === 'string' && auditColumns.some((column) => column.id === value);
}

function getCurrentUserPreferenceStorageKey(prefix: string): string {
  if (typeof window === 'undefined') return `${prefix}anonymous`;
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null') as { id?: string | number; username?: string; displayName?: string } | null;
    return `${prefix}${String(user?.id ?? user?.username ?? user?.displayName ?? 'anonymous')}`;
  } catch {
    return `${prefix}anonymous`;
  }
}

function getAuditColumnWidthStorageKey(): string {
  return getCurrentUserPreferenceStorageKey(AUDIT_COLUMN_WIDTH_STORAGE_PREFIX);
}

function getAuditColumnSettingsStorageKey(): string {
  return getCurrentUserPreferenceStorageKey(AUDIT_COLUMN_SETTINGS_STORAGE_PREFIX);
}

function normalizeAuditColumnSettings(value: unknown): AuditColumnSettings {
  const defaults = auditColumns.map((column) => column.id);
  const parsed = value as { order?: unknown[]; hidden?: unknown[] } | null | undefined;
  const seen = new Set<AuditColumnId>();
  const storedOrder = Array.isArray(parsed?.order) ? parsed.order : [];
  const order = [
    ...storedOrder.filter((id): id is AuditColumnId => {
      if (!isAuditColumnId(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    }),
    ...defaults.filter((id) => !seen.has(id)),
  ];
  const hidden = Array.from(new Set(
    (Array.isArray(parsed?.hidden) ? parsed.hidden : [])
      .filter((id): id is AuditColumnId => isAuditColumnId(id) && order.includes(id)),
  ));
  if (hidden.length >= order.length && order.length > 0) {
    return { order, hidden: hidden.filter((id) => id !== order[0]) };
  }
  return { order, hidden };
}

function loadAuditColumnSettings(storageKey: string): AuditColumnSettings {
  if (typeof window === 'undefined') return normalizeAuditColumnSettings(null);
  try {
    const raw = localStorage.getItem(storageKey);
    return normalizeAuditColumnSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeAuditColumnSettings(null);
  }
}

function loadAuditColumnWidths(storageKey: string): Partial<Record<AuditColumnId, number>> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return auditColumns.reduce<Partial<Record<AuditColumnId, number>>>((result, column) => {
      const width = Number(parsed[column.id]);
      if (Number.isFinite(width)) result[column.id] = Math.max(column.minWidth, width);
      return result;
    }, {});
  } catch {
    return {};
  }
}

function getColumnSettingsItems(settings: AuditColumnSettings): AuditColumn[] {
  const columnsById = new Map(auditColumns.map((column) => [column.id, column]));
  return settings.order.map((id) => columnsById.get(id)).filter((column): column is AuditColumn => Boolean(column));
}

function getVisibleAuditColumns(settings: AuditColumnSettings): AuditColumn[] {
  return getColumnSettingsItems(settings).filter((column) => !settings.hidden.includes(column.id));
}

function formatDateTime(value?: string): string {
  if (!value) return '-';
  const normalized = value.replace('T', ' ');
  return normalized.length >= 16 ? normalized.slice(0, 16) : normalized;
}

function getDisplayValue(value: unknown): ReactNode {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '是' : '否';
  return JSON.stringify(value);
}

function getTextDisplayValue(value: unknown): string {
  const display = getDisplayValue(value);
  return typeof display === 'string' || typeof display === 'number' ? String(display) : '';
}

function tryParseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

const auditFieldLabelMap: Record<string, string> = {
  id: '数据ID',
  entityType: '对象类型',
  entityId: '对象ID',
  tenantId: '租户',
  operatorId: '操作人ID',
  operatorName: '操作人',
  operatorAccount: '账号',
  moduleName: '功能模块',
  menuName: '菜单',
  functionName: '具体功能',
  dataSummary: '操作数据',
  action: '操作动作',
  source: '来源',
  sourceLabel: '来源',
  triggerMethod: '触发方式',
  displayName: '显示名称',
  name: '名称',
  code: '编码',
  username: '账号',
  display_name: '姓名',
  realName: '姓名',
  status: '状态',
  description: '描述',
  phone: '手机号',
  email: '邮箱',
  organizationName: '所属组织',
  organization: '所属组织',
  primaryDepartmentId: '所属组织',
  departmentId: '所属组织',
  departmentIds: '所属组织',
  departmentName: '所属组织',
  roles: '岗位角色',
  roleIds: '岗位角色',
  permissionIds: '菜单权限',
  isBuiltin: '是否内置',
  builtin: '是否内置',
  systemName: '系统名称',
  browserTitle: '浏览器标签名称',
  systemLogoFileId: '系统 Logo 文件ID',
  browserIconFileId: '网站图标文件ID',
  systemLogo: '系统 Logo 快照',
  browserIcon: '网站图标快照',
  logoWidth: 'Logo 宽度',
  logoHeight: 'Logo 高度',
  group: '图标分组',
  groups: '图标分组',
  groupId: '所属分组ID',
  groupName: '所属分组',
  icons: '图标素材',
  deletedIcons: '删除图标',
  file: '文件快照',
  fileId: '文件 ID',
  builtinKey: '内置图标Key',
  tags: '标签',
  sortOrder: '排序',
  previewUrl: '预览地址',
  fileUrl: '文件地址',
  originalName: '原始文件名',
  mimeType: '文件类型',
  fileSize: '文件大小',
  md5Hash: '文件校验值',
  targetType: '文件用途',
  targetId: '关联对象',
  createdBy: '创建人',
  createdAt: '创建时间',
  updatedBy: '更新人',
  updatedAt: '更新时间',
};

const auditFieldOrder = [
  'name',
  'displayName',
  'systemName',
  'browserTitle',
  'systemLogo',
  'browserIcon',
  'systemLogoFileId',
  'browserIconFileId',
  'logoWidth',
  'logoHeight',
  'groupName',
  'groupId',
  'organizationName',
  'organization',
  'sourceLabel',
  'source',
  'tags',
  'file',
  'fileId',
  'previewUrl',
  'builtinKey',
  'sortOrder',
  'createdBy',
  'createdAt',
  'updatedBy',
  'updatedAt',
];

function getAuditFieldLabel(field: string): string {
  return auditFieldLabelMap[field] ?? formatUnknownAuditFieldLabel(field);
}

function formatUnknownAuditFieldLabel(field: string): string {
  if (/[\u4e00-\u9fff]/.test(field)) return field;
  return '扩展字段';
}

function sortAuditEntries(entries: Array<[string, unknown]>): Array<[string, unknown]> {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => {
      const leftIndex = auditFieldOrder.indexOf(left.entry[0]);
      const rightIndex = auditFieldOrder.indexOf(right.entry[0]);
      const leftOrder = leftIndex === -1 ? auditFieldOrder.length : leftIndex;
      const rightOrder = rightIndex === -1 ? auditFieldOrder.length : rightIndex;
      return leftOrder === rightOrder ? left.index - right.index : leftOrder - rightOrder;
    })
    .map((item) => item.entry);
}

function translateAuditScalar(field: string, value: string): string {
  if (!value || value === 'undefined') return '-';
  if (field === 'source') {
    const sourceMap: Record<string, string> = { BUILTIN: '系统内置', UPLOAD: '用户上传', IMPORT: '导入' };
    return sourceMap[value.toUpperCase()] ?? value;
  }
  if (field === 'status') {
    const statusMap: Record<string, string> = { ACTIVE: '正常', DISABLED: '禁用', ENABLED: '启用', INACTIVE: '停用' };
    return statusMap[value.toUpperCase()] ?? value;
  }
  if (field === 'organizationName' || field === 'organization' || field === 'departmentName') {
    return value;
  }
  if (field === 'primaryDepartmentId' || field === 'departmentId' || field === 'departmentIds') {
    return `历史组织ID(${value})`;
  }
  return value;
}

function formatFileSize(value: unknown): string {
  const size = Number(value);
  if (!Number.isFinite(size) || size <= 0) return getTextDisplayValue(value) || '-';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function isPreviewUrl(value: unknown): value is string {
  return typeof value === 'string' && /^\/api\/v1\/files\/[^/]+\/public-preview/.test(value);
}

function buildAuditMenuPathByName(moduleName?: string, menuName?: string): string {
  const normalizedMenuName = String(menuName ?? '').trim();
  if (!normalizedMenuName || normalizedMenuName === '-') return '-';
  if (normalizedMenuName.includes('·')) return normalizedMenuName;
  for (const module of SIDEBAR_MODULES) {
    for (const menu of module.menus) {
      if (menu.children?.some((child) => child.label === normalizedMenuName)) return `${menu.label} · ${normalizedMenuName}`;
      if (menu.label === normalizedMenuName) return `${module.label} · ${normalizedMenuName}`;
    }
  }
  const normalizedModuleName = String(moduleName ?? '').trim();
  if (!normalizedModuleName || normalizedModuleName === '-' || normalizedModuleName === normalizedMenuName) return normalizedMenuName;
  return `${normalizedModuleName} · ${normalizedMenuName}`;
}

function normalizeAuditModuleName(value?: string): string {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '-';
  const map: Record<string, string> = {
    系统: '系统',
    系统管理: '系统',
    组织: '系统',
    组织管理: '系统',
    安全: '系统',
    安全管理: '系统',
  };
  return map[trimmed] ?? trimmed;
}

function getAuditMenuDisplayName(rowOrModuleName?: AuditLogItem | string, menuName?: string): string {
  if (typeof rowOrModuleName === 'object' && rowOrModuleName !== null) {
    return buildAuditMenuPathByName(rowOrModuleName.moduleName, rowOrModuleName.menuName);
  }
  return buildAuditMenuPathByName(rowOrModuleName, menuName);
}

function getAuditFunctionDisplayName(value?: string): string {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '-';
  if (!trimmed.includes('·')) return trimmed;
  const parts = trimmed.split(/\s*·\s*/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : trimmed;
}

function getAuditColumnValue(row: AuditLogItem, columnId: AuditColumnId): ReactNode {
  if (columnId === 'actionLabel') return row.actionLabel || row.action || '-';
  if (columnId === 'operationTime') return formatDateTime(row.operationTime || row.createdAt);
  if (columnId === 'triggerMethod') return row.triggerMethodLabel || row.triggerMethod || '-';
  if (columnId === 'moduleName') return normalizeAuditModuleName(row.moduleName);
  if (columnId === 'menuName') return getAuditMenuDisplayName(row);
  if (columnId === 'functionName') return getAuditFunctionDisplayName(row.functionName);
  return getDisplayValue(row[columnId]);
}

function isAuditMediaField(field: string): boolean {
  const normalized = field.toLowerCase();
  return normalized.includes('icon') ||
    normalized.includes('logo') ||
    normalized.includes('file') ||
    normalized.includes('preview') ||
    normalized.includes('favicon') ||
    field === 'systemLogo' ||
    field === 'browserIcon';
}

function getPreviewUrlFromRecord(record: Record<string, unknown>): string {
  if (isPreviewUrl(record.previewUrl)) return record.previewUrl;
  if (isPreviewUrl(record.fileUrl)) return record.fileUrl;
  const file = record.file;
  if (file && typeof file === 'object' && !Array.isArray(file)) {
    const fileRecord = file as Record<string, unknown>;
    if (isPreviewUrl(fileRecord.previewUrl)) return fileRecord.previewUrl;
  }
  return '';
}

function AuditPreviewImage({ src, alt }: { src: string; alt: string }) {
  const [loadFailed, setLoadFailed] = useState(false);
  useEffect(() => {
    setLoadFailed(false);
  }, [src]);
  if (!src || loadFailed) return <ImageOutlined sx={{ fontSize: 28, color: '#c0c4cc' }} />;
  return (
    <Box
      component="img"
      src={src}
      alt={alt}
      onError={() => setLoadFailed(true)}
      sx={{ width: 36, height: 36, objectFit: 'contain', border: '1px solid #e4e7ed', borderRadius: 1, bgcolor: '#fff' }}
    />
  );
}

function formatAuditMediaSnapshot(field: string, record: Record<string, unknown>): ReactNode {
  const mediaPreviewUrl = getPreviewUrlFromRecord(record);
  const rows = sortAuditEntries(Object.entries(record)).filter(([, entry]) => {
    if (entry === null || entry === undefined || entry === '') return false;
    if (typeof entry === 'object' && !Array.isArray(entry) && Object.keys(entry as Record<string, unknown>).length === 0) return false;
    return true;
  });
  return (
    <Stack spacing={0.75}>
      {mediaPreviewUrl ? (
        <Stack direction="row" spacing={1} alignItems="center">
          <AuditPreviewImage src={mediaPreviewUrl} alt={String(record.displayName ?? record.name ?? getAuditFieldLabel(field))} />
          <Typography sx={{ color: '#606266', fontSize: 12, wordBreak: 'break-all' }}>预览地址：{mediaPreviewUrl}</Typography>
        </Stack>
      ) : null}
      {rows.map(([nestedField, entry]) => (
        <Box key={nestedField} sx={{ display: 'grid', gridTemplateColumns: '92px 1fr', gap: 1 }}>
          <Typography sx={{ color: '#909399', fontSize: 12 }}>{getAuditFieldLabel(nestedField)}</Typography>
          <Typography component="div" sx={{ color: '#303133', fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {formatAuditValue(nestedField, entry)}
          </Typography>
        </Box>
      ))}
    </Stack>
  );
}

function formatAuditValue(field: string, value: unknown): ReactNode {
  const parsed = tryParseJson(value);
  if (parsed === null || parsed === undefined || parsed === '') return '-';
  if (typeof parsed === 'string') return translateAuditScalar(field, parsed.trim());
  if (typeof parsed === 'number') return field === 'fileSize' ? formatFileSize(parsed) : String(parsed);
  if (typeof parsed === 'boolean') return parsed ? '是' : '否';
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) return '-';
    return (
      <Stack spacing={0.5}>
        {parsed.map((item, index) => (
          <Box key={index} sx={{ pl: 1, borderLeft: '2px solid #dcdfe6' }}>
            {formatAuditValue(field, item)}
          </Box>
        ))}
      </Stack>
    );
  }
  if (typeof parsed === 'object') {
    const record = parsed as Record<string, unknown>;
    if (isAuditMediaField(field) || getPreviewUrlFromRecord(record)) {
      return formatAuditMediaSnapshot(field, record);
    }
    const previewUrl = getPreviewUrlFromRecord(record);
    const rows = sortAuditEntries(Object.entries(record)).filter(([, entry]) => {
      if (entry === null || entry === undefined || entry === '') return false;
      if (typeof entry === 'object' && !Array.isArray(entry) && Object.keys(entry as Record<string, unknown>).length === 0) return false;
      return true;
    });
    return (
      <Stack spacing={0.75}>
        {previewUrl ? (
          <Stack direction="row" spacing={1} alignItems="center">
            <AuditPreviewImage src={previewUrl} alt={String(record.displayName ?? record.name ?? getAuditFieldLabel(field))} />
            <Typography sx={{ color: '#606266', fontSize: 12, wordBreak: 'break-all' }}>{previewUrl}</Typography>
          </Stack>
        ) : null}
        {rows.map(([nestedField, entry]) => (
          <Box key={nestedField} sx={{ display: 'grid', gridTemplateColumns: '92px 1fr', gap: 1 }}>
            <Typography sx={{ color: '#909399', fontSize: 12 }}>{getAuditFieldLabel(nestedField)}</Typography>
            <Typography component="div" sx={{ color: '#303133', fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {formatAuditValue(nestedField, entry)}
            </Typography>
          </Box>
        ))}
      </Stack>
    );
  }
  return String(parsed);
}

function formatAuditRows(value: unknown): AuditFieldRow[] {
  const parsed = tryParseJson(value);
  if (parsed === null || parsed === undefined || parsed === '') return [];
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    return [{ label: '内容', value: getDisplayValue(parsed) }];
  }
  const record = parsed as Record<string, unknown>;
  const hasOrganizationSnapshot = record.organizationName !== undefined || record.organization !== undefined;
  return sortAuditEntries(Object.entries(record)
    .filter(([key]) => !hasOrganizationSnapshot || !['primaryDepartmentId', 'departmentId', 'departmentIds', 'departmentName'].includes(key)))
    .filter(([, entry]) => {
      if (entry === null || entry === undefined || entry === '') return false;
      if (typeof entry === 'object' && !Array.isArray(entry) && Object.keys(entry as Record<string, unknown>).length === 0) return false;
      return true;
    })
    .map(([key, entry]) => ({
      label: getAuditFieldLabel(key),
      value: formatAuditValue(key, entry),
    }));
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box sx={{ border: '1px solid #e4e7ed', borderRadius: 1, overflow: 'hidden', bgcolor: '#fff' }}>
      <Box sx={{ px: 2, py: 1, bgcolor: '#f5f7fa', borderBottom: '1px solid #e4e7ed' }}>
        <Typography sx={{ fontWeight: 600, color: '#303133' }}>{title}</Typography>
      </Box>
      <Box sx={{ p: 2 }}>{children}</Box>
    </Box>
  );
}

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 1, minHeight: 28, alignItems: 'start' }}>
      <Typography sx={{ color: '#909399', fontSize: 13 }}>{label}</Typography>
      <Typography sx={{ color: '#303133', fontSize: 13, wordBreak: 'break-word' }}>{children || '-'}</Typography>
    </Box>
  );
}

function AuditFieldBlock({ title, rows }: { title: string; rows: AuditFieldRow[] }) {
  return (
    <Box sx={{ flex: 1, minWidth: 0 }} data-audit-field-block>
      <Typography sx={{ mb: 1, color: '#606266', fontWeight: 600 }}>{title}</Typography>
      <Stack spacing={0.75}>
        {rows.length === 0 ? (
          <Typography sx={{ color: '#909399', fontSize: 13 }}>-</Typography>
        ) : rows.map((row, index) => (
          <Box key={`${row.label}-${index}`} sx={{ p: 1, bgcolor: '#f6f8f9', border: '1px solid #e4e7ed', borderRadius: 1 }}>
            <Typography sx={{ color: '#909399', fontSize: 12 }}>{row.label}</Typography>
            <Typography component="div" sx={{ color: '#303133', fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{row.value}</Typography>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

function AuditSummaryRecord({ title, rows }: { title: string; rows: AuditFieldRow[] }) {
  return (
    <Box sx={{ p: 1.25, bgcolor: '#fff', border: '1px solid #e4e7ed', borderRadius: 1 }}>
      <Typography sx={{ mb: 1, color: '#606266', fontWeight: 600 }}>{title}</Typography>
      <Stack spacing={0.75}>
        {rows.map((row) => (
          <Box key={row.label} sx={{ display: 'grid', gridTemplateColumns: '88px 1fr', gap: 1, minHeight: 24 }}>
            <Typography sx={{ color: '#909399', fontSize: 12 }}>{row.label}</Typography>
            <Typography component="div" sx={{ color: '#303133', fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{row.value}</Typography>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

function getActionTone(action?: string): 'success' | 'warning' | 'error' | 'info' | 'default' {
  const key = action?.toUpperCase();
  if (key === 'CREATE' || key === 'ENABLE' || key === 'LOGIN') return 'success';
  if (key === 'DELETE' || key === 'DISABLE' || key === 'BATCH_DELETE' || key === 'DELETE_LOGO' || key === 'DELETE_FAVICON') return 'error';
  if (key === 'UPDATE' || key === 'PERMISSION_UPDATE' || key === 'RESET_PASSWORD' || key === 'REORDER' || key === 'MOVE') return 'warning';
  if (key === 'UPLOAD' || key === 'IMPORT' || key === 'EXPORT' || key === 'UPLOAD_LOGO' || key === 'UPLOAD_FAVICON' || key === 'LOGOUT') return 'info';
  return 'default';
}

export default function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(PAGE_SIZE);
  const [filters, setFilters] = useState<AuditFilters>(emptyFilters);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState(0);
  const [selectedAudit, setSelectedAudit] = useState<AuditLogItem | null>(null);
  const [columnSettingsStorageKey] = useState(getAuditColumnSettingsStorageKey);
  const [columnWidthStorageKey] = useState(getAuditColumnWidthStorageKey);
  const [columnSettings, setColumnSettings] = useState<AuditColumnSettings>(() => loadAuditColumnSettings(columnSettingsStorageKey));
  const [columnWidths, setColumnWidths] = useState<Partial<Record<AuditColumnId, number>>>(() => loadAuditColumnWidths(columnWidthStorageKey));
  const [columnSettingsAnchorEl, setColumnSettingsAnchorEl] = useState<HTMLButtonElement | null>(null);
  const [draggingColumnId, setDraggingColumnId] = useState<AuditColumnId | null>(null);
  const [tableContainerWidth, setTableContainerWidth] = useState(0);
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const resizingColumnRef = useRef<AuditColumnId | null>(null);

  const visibleAuditColumns = useMemo(() => getVisibleAuditColumns(columnSettings), [columnSettings]);
  const columnSettingsItems = useMemo(() => getColumnSettingsItems(columnSettings), [columnSettings]);
  const visibleConfigurableColumnCount = visibleAuditColumns.length;
  const resolvedColumnWidths = useMemo(() => auditColumns.reduce<Record<AuditColumnId, number>>((result, column) => {
    result[column.id] = Math.max(column.minWidth, columnWidths[column.id] ?? column.defaultWidth);
    return result;
  }, {} as Record<AuditColumnId, number>), [columnWidths]);
  const totalTableWidth = useMemo(
    () => visibleAuditColumns.reduce((sum, column) => sum + resolvedColumnWidths[column.id], 0),
    [resolvedColumnWidths, visibleAuditColumns],
  );
  const resolvedTableWidth = Math.max(totalTableWidth, tableContainerWidth);

  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem(columnSettingsStorageKey, JSON.stringify(columnSettings));
  }, [columnSettings, columnSettingsStorageKey]);

  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem(columnWidthStorageKey, JSON.stringify(columnWidths));
  }, [columnWidthStorageKey, columnWidths]);

  useEffect(() => {
    const node = tableContainerRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const updateWidth = () => setTableContainerWidth(node.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['audit-logs', page, rowsPerPage, filters],
    queryFn: async () => {
      const params: Record<string, unknown> = { page, size: rowsPerPage };
      if (filters.operatorName) params.operatorName = filters.operatorName;
      if (filters.operatorAccount) params.operatorAccount = filters.operatorAccount;
      if (filters.action) params.action = filters.action;
      if (filters.moduleName) params.moduleName = filters.moduleName;
      if (filters.menuName) params.menuName = filters.menuName;
      const res = await getAuditLogs(params);
      return res.data.data as PageResult<AuditLogItem>;
    },
  });

  const rows = useMemo(() => {
    return data?.content ?? [];
  }, [data?.content]);

  const pageCount = data?.totalPages ?? Math.max(1, Math.ceil(rows.length / rowsPerPage));
  const totalElements = data?.totalElements ?? rows.length;
  const isAuditTableEmptyState = isLoading || isError || rows.length === 0;
  const beforeRows = useMemo(() => formatAuditRows(selectedAudit?.contentBefore), [selectedAudit?.contentBefore]);
  const afterRows = useMemo(() => formatAuditRows(selectedAudit?.contentAfter ?? selectedAudit?.reason), [selectedAudit?.contentAfter, selectedAudit?.reason]);
  const operatedDataRows = useMemo<AuditFieldRow[]>(() => selectedAudit ? [
    { label: '操作人', value: getDisplayValue(selectedAudit.operatorDisplayName) },
    { label: '操作动作', value: getDisplayValue(selectedAudit.actionLabel || selectedAudit.action) },
    { label: '操作时间', value: formatDateTime(selectedAudit.operationTime || selectedAudit.createdAt) },
    { label: '操作数据', value: getDisplayValue(selectedAudit.dataSummary) },
    { label: '快照指纹', value: getDisplayValue(selectedAudit.snapshotHash) },
  ] : [], [selectedAudit]);

  const resetFilters = () => {
    setFilters(emptyFilters);
    setPage(1);
  };

  const updateFilter = (key: keyof AuditFilters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };

  const openAuditDetailDrawer = (row: AuditLogItem) => {
    setSelectedAudit(row);
    setDrawerTab(0);
    setDrawerOpen(true);
  };

  const moveAuditColumnSetting = (sourceId: AuditColumnId, targetId: AuditColumnId) => {
    if (sourceId === targetId) return;
    setColumnSettings((current) => {
      const nextOrder = current.order.filter((id) => id !== sourceId);
      const targetIndex = nextOrder.indexOf(targetId);
      if (targetIndex === -1) return current;
      nextOrder.splice(targetIndex, 0, sourceId);
      return normalizeAuditColumnSettings({ ...current, order: nextOrder });
    });
  };

  const toggleAuditColumnVisibility = (columnId: AuditColumnId) => {
    setColumnSettings((current) => {
      const isHidden = current.hidden.includes(columnId);
      if (!isHidden && visibleConfigurableColumnCount <= 1) return current;
      const hidden = isHidden
        ? current.hidden.filter((id) => id !== columnId)
        : [...current.hidden, columnId];
      return normalizeAuditColumnSettings({ ...current, hidden });
    });
  };

  const handleColumnSettingDragStart = (event: ReactDragEvent<HTMLDivElement>, columnId: AuditColumnId) => {
    setDraggingColumnId(columnId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', columnId);
  };

  const handleColumnSettingDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleColumnSettingDrop = (event: ReactDragEvent<HTMLDivElement>, targetId: AuditColumnId) => {
    event.preventDefault();
    const sourceId = draggingColumnId ?? event.dataTransfer.getData('text/plain');
    if (isAuditColumnId(sourceId)) moveAuditColumnSetting(sourceId, targetId);
    setDraggingColumnId(null);
  };

  const beginColumnResize = (event: MouseEvent<HTMLDivElement> | ReactPointerEvent<HTMLDivElement>, column: AuditColumn) => {
    if (!column.resizable) return;
    event.preventDefault();
    event.stopPropagation();
    if (resizingColumnRef.current) return;
    const startX = event.clientX;
    const startWidth = resolvedColumnWidths[column.id];
    const previousCursor = document.body.style.cursor;
    const originalUserSelect = document.body.style.userSelect;
    const isPointerEvent = event.type === 'pointerdown';
    resizingColumnRef.current = column.id;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const resizeColumn = (moveEvent: globalThis.MouseEvent | globalThis.PointerEvent) => {
      const width = Math.max(column.minWidth, startWidth + moveEvent.clientX - startX);
      setColumnWidths((current) => ({ ...current, [column.id]: width }));
    };

    const stopResize = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = originalUserSelect;
      resizingColumnRef.current = null;
      window.removeEventListener(isPointerEvent ? 'pointermove' : 'mousemove', resizeColumn as EventListener);
      window.removeEventListener(isPointerEvent ? 'pointerup' : 'mouseup', stopResize);
    };

    window.addEventListener(isPointerEvent ? 'pointermove' : 'mousemove', resizeColumn as EventListener);
    window.addEventListener(isPointerEvent ? 'pointerup' : 'mouseup', stopResize);
  };

  const renderCell = (row: AuditLogItem, column: AuditColumn) => {
    const cellSx = {
      ...tableBodyCellSx,
      width: resolvedColumnWidths[column.id],
      maxWidth: resolvedColumnWidths[column.id],
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    };
    if (column.id === 'actionLabel') {
      return (
        <TableCell key={column.id} sx={cellSx}>
          <StatusBadge label={row.actionLabel || row.action || '-'} color={getActionTone(row.action)} />
        </TableCell>
      );
    }
    if (column.id === 'operationTime') {
      return <TableCell key={column.id} sx={cellSx}>{formatDateTime(row.operationTime || row.createdAt)}</TableCell>;
    }
    if (column.id === 'triggerMethod') {
      return <TableCell key={column.id} sx={cellSx}>{row.triggerMethodLabel || row.triggerMethod || '-'}</TableCell>;
    }
    const value = getAuditColumnValue(row, column.id);
    return <TableCell key={column.id} title={getTextDisplayValue(value)} sx={cellSx}>{value}</TableCell>;
  };

  return (
    <Box data-audit-log-page sx={{ height: AUDIT_LOG_PAGE_HEIGHT, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: '#f6f8f9' }}>
      <Stack spacing={1.5} sx={{ flex: 1, minHeight: 0 }}>
        <Box sx={{ bgcolor: '#fff', border: '1px solid #e4e7ed', borderRadius: 1, p: 2 }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' },
              rowGap: 1.5,
              columnGap: 2,
              alignItems: 'center',
            }}
          >
            <TextField size="small" label="操作人" value={filters.operatorName} onChange={(event) => updateFilter('operatorName', event.target.value)} sx={{ ...AUDIT_QUERY_FIELD_SX, width: '100%' }} />
            <TextField size="small" label="账号" value={filters.operatorAccount} onChange={(event) => updateFilter('operatorAccount', event.target.value)} sx={{ ...AUDIT_QUERY_FIELD_SX, width: '100%' }} />
            <TextField select size="small" label="操作动作" value={filters.action} onChange={(event) => updateFilter('action', event.target.value)} sx={{ ...AUDIT_QUERY_FIELD_SX, width: '100%' }}>
              <MenuItem value="">全部</MenuItem>
              {actionOptions.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
            </TextField>
            <TextField size="small" label="功能模块" value={filters.moduleName} onChange={(event) => updateFilter('moduleName', event.target.value)} sx={{ ...AUDIT_QUERY_FIELD_SX, width: '100%' }} />
            <TextField size="small" label="菜单" value={filters.menuName} onChange={(event) => updateFilter('menuName', event.target.value)} sx={{ ...AUDIT_QUERY_FIELD_SX, width: '100%' }} />
            <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="flex-end">
              <Button size="small" sx={AUDIT_QUERY_BUTTON_SX} variant="outlined" startIcon={<RestartAlt />} onClick={resetFilters}>重置</Button>
              <Button size="small" sx={AUDIT_QUERY_BUTTON_SX} variant="contained" startIcon={<Search />} onClick={() => setPage(1)}>查询</Button>
            </Stack>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, bgcolor: '#fff', border: '1px solid #e4e7ed', borderRadius: 1, overflow: 'hidden' }}>
          <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="center" sx={{ minHeight: 48, px: 2, borderBottom: '1px solid #e4e7ed' }}>
            <Tooltip title="字段设置" arrow>
              <IconButton
                data-audit-log-column-settings-trigger
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
            <Typography sx={{ color: '#606266', fontSize: 13 }}>审计日志用于追踪系统内关键数据与权限变更</Typography>
          </Stack>
          <Popover
            open={Boolean(columnSettingsAnchorEl)}
            anchorEl={columnSettingsAnchorEl}
            onClose={() => setColumnSettingsAnchorEl(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            transformOrigin={{ vertical: 'top', horizontal: 'left' }}
            PaperProps={{ sx: { mt: 1, width: 230, border: '1px solid #e4e7ed', borderRadius: 1, boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)' } }}
          >
            <Stack data-audit-log-column-settings-panel sx={{ py: 1 }}>
              {columnSettingsItems.map((column) => {
                const checked = !columnSettings.hidden.includes(column.id);
                return (
                  <Stack
                    key={column.id}
                    data-audit-log-column-settings-row
                    direction="row"
                    alignItems="center"
                    spacing={1}
                    draggable
                    onDragStart={(event) => handleColumnSettingDragStart(event, column.id)}
                    onDragOver={handleColumnSettingDragOver}
                    onDrop={(event) => handleColumnSettingDrop(event, column.id)}
                    sx={{ px: 1.25, py: 0.75, cursor: 'grab', '&:hover': { bgcolor: '#f5f7fa' } }}
                  >
                    <DragIndicator sx={{ fontSize: 18, color: '#c0c4cc' }} />
                    <Checkbox size="small" checked={checked} onChange={() => toggleAuditColumnVisibility(column.id)} />
                    <Typography sx={{ fontSize: 13, color: '#303133' }}>{column.label}</Typography>
                  </Stack>
                );
              })}
            </Stack>
          </Popover>

          <Box sx={{ position: 'relative', flex: 1, minHeight: 0 }}>
            <TableContainer ref={tableContainerRef} data-audit-log-table-scroll sx={{ height: '100%', overflow: 'auto' }}>
              <Table stickyHeader size="small" sx={{ tableLayout: 'fixed', width: resolvedTableWidth, minWidth: resolvedTableWidth, height: isAuditTableEmptyState ? '100%' : 'auto' }}>
                <colgroup>
                  {visibleAuditColumns.map((column) => (
                    <col key={column.id} style={{ width: resolvedColumnWidths[column.id] }} />
                  ))}
                </colgroup>
                <TableHead>
                  <TableRow sx={{ '& .MuiTableCell-root': tableHeaderCellSx }}>
                    {visibleAuditColumns.map((column) => (
                      <TableCell
                        key={column.id}
                        sx={{ width: resolvedColumnWidths[column.id], minWidth: column.minWidth, position: 'sticky', top: 0, zIndex: 5, userSelect: 'none', pr: 2 }}
                      >
                        {column.label}
                        {column.resizable ? (
                          <Box
                            data-audit-log-column-resizer
                            onPointerDown={(event) => beginColumnResize(event, column)}
                            onMouseDown={(event) => beginColumnResize(event, column)}
                            sx={{ position: 'absolute', top: 0, right: 0, width: 8, height: '100%', cursor: 'col-resize', zIndex: 3, '&::after': { content: '""', position: 'absolute', top: '50%', right: 3, width: '1px', height: 18, transform: 'translateY(-50%)', bgcolor: '#dcdfe6' }, '&:hover::after': { bgcolor: '#1890ff' } }}
                          />
                        ) : null}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody sx={{ height: isAuditTableEmptyState ? '100%' : 'auto' }}>
                  {isLoading ? (
                    <TableRow sx={emptyTableRowSx}>
                      <TableStateCell colSpan={visibleAuditColumns.length} align="center" sx={emptyTableBodyCellSx}><CircularProgress size={24} /></TableStateCell>
                    </TableRow>
                  ) : isError ? (
                    <TableRow sx={emptyTableRowSx}>
                      <TableStateCell colSpan={visibleAuditColumns.length} align="center" sx={emptyTableBodyCellSx}>加载失败</TableStateCell>
                    </TableRow>
                  ) : rows.length === 0 ? (
                    <TableRow sx={emptyTableRowSx}>
                      <TableStateCell colSpan={visibleAuditColumns.length} align="center" sx={emptyTableBodyCellSx}>暂无审计记录</TableStateCell>
                    </TableRow>
                  ) : rows.map((row) => (
                    <TableRow key={row.id} hover onClick={() => openAuditDetailDrawer(row)} sx={{ cursor: 'pointer', '& .MuiTableCell-root': tableBodyCellSx }}>
                      {visibleAuditColumns.map((column) => renderCell(row, column))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>

          <Box sx={{ minHeight: 56, px: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
            <Typography sx={{ color: '#909399' }}>共 {totalElements} 条数据</Typography>
            <Stack direction="row" spacing={2} alignItems="center">
              <Pagination page={page} count={Math.max(pageCount, 1)} color="primary" size="small" onChange={(_, value) => setPage(value)} />
              <TextField
                select
                value={rowsPerPage}
                sx={{ width: 110 }}
                onChange={(event) => {
                  setRowsPerPage(Number(event.target.value));
                  setPage(1);
                }}
                InputProps={{
                  startAdornment: <InputAdornment position="start" sx={{ mr: 0 }}>每页</InputAdornment>,
                }}
              >
                {AUDIT_PAGE_SIZE_OPTIONS.map((size) => (
                  <MenuItem key={size} value={size}>{size}</MenuItem>
                ))}
              </TextField>
            </Stack>
          </Box>
        </Box>
      </Stack>

      <Drawer anchor="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        sx={appContentDrawerSx}
        slotProps={{ backdrop: { sx: appContentDrawerSx } }}
        PaperProps={{ sx: appContentDrawerPaperSx }}
      >
        <Stack sx={{ height: '100%', minHeight: 0 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ minHeight: 56, px: 2, borderBottom: '1px solid #e4e7ed' }}>
            <Typography sx={{ fontWeight: 600, color: '#303133' }}>信息查看</Typography>
            <IconButton onClick={() => setDrawerOpen(false)} aria-label="关闭审计日志详情"><Close /></IconButton>
          </Stack>
          <Tabs value={drawerTab} onChange={(_: SyntheticEvent, value: number) => setDrawerTab(value)} aria-label="审计日志详情切换" sx={{ minHeight: 44, borderBottom: '1px solid #e4e7ed' }}>
            <Tab label="数据信息" />
            <Tab label="数据审计" />
          </Tabs>
          <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 2, bgcolor: '#f6f8f9' }}>
            {drawerTab === 0 && selectedAudit ? (
              <Stack spacing={1.5}>
                <DetailSection title="行为信息">
                  <Stack spacing={1}>
                    <DetailField label="操作人">{selectedAudit.operatorDisplayName}</DetailField>
                    <DetailField label="账号">{selectedAudit.operatorAccount}</DetailField>
                    <DetailField label="操作时间">{formatDateTime(selectedAudit.operationTime || selectedAudit.createdAt)}</DetailField>
                    <DetailField label="操作动作">{selectedAudit.actionLabel || selectedAudit.action}</DetailField>
                  </Stack>
                </DetailSection>
                <DetailSection title="操作对象">
                  <Stack spacing={1}>
                    <DetailField label="功能模块">{normalizeAuditModuleName(selectedAudit.moduleName)}</DetailField>
                    <DetailField label="菜单">{getAuditMenuDisplayName(selectedAudit)}</DetailField>
                    <DetailField label="具体功能">{getAuditFunctionDisplayName(selectedAudit.functionName)}</DetailField>
                  </Stack>
                </DetailSection>
                <DetailSection title="环境信息">
                  <Stack spacing={1}>
                    <DetailField label="触发方式">{selectedAudit.triggerMethodLabel || selectedAudit.triggerMethod}</DetailField>
                    <DetailField label="IP地址">{selectedAudit.ipAddress}</DetailField>
                    <DetailField label="快照指纹">{selectedAudit.snapshotHash}</DetailField>
                    <DetailField label="说明">{selectedAudit.reason}</DetailField>
                  </Stack>
                </DetailSection>
              </Stack>
            ) : null}
            {drawerTab === 1 ? (
              <DetailSection title="审计记录">
                {selectedAudit ? (
                  <Stack spacing={1.5}>
                    <AuditSummaryRecord title="操作数据" rows={operatedDataRows} />
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                      <AuditFieldBlock title="变更前" rows={beforeRows} />
                      <AuditFieldBlock title="变更后" rows={afterRows} />
                    </Stack>
                  </Stack>
                ) : (
                  <Typography sx={{ color: '#909399' }}>暂无审计记录</Typography>
                )}
              </DetailSection>
            ) : null}
          </Box>
        </Stack>
      </Drawer>
    </Box>
  );
}
