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
import { useMutation,
  useQuery,
  useQueryClient } from '@tanstack/react-query';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Pagination,
  Popover,
  Select,
  Snackbar,
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
import { Add, Close, Delete, DragIndicator, Edit, ExpandMore, LockReset, RestartAlt, Search, TuneRounded, ViewColumnRounded } from '@mui/icons-material';
import {
  createUser,
  deleteUser,
  getDepartmentTree,
  getRoles,
  getUsers,
  resetUserPassword,
  updateUser,
} from '@/api/identity';
import { getAuditLogs } from '@/api/audit';
import { AUDIT_ACTION_MAP, USER_STATUS_MAP } from '@/utils/constants';
import StatusBadge from '@/components/StatusBadge';
import type { PageResult } from '@/types/common';

interface ApiUser {
  id: string | number;
  tenantId?: string | number;
  username: string;
  displayName?: string;
  name?: string;
  email?: string;
  phone?: string;
  status: string;
  roleIds?: Array<string | number>;
  departmentIds?: Array<string | number>;
  primaryDepartmentId?: string | number | null;
  lastLoginAt?: string;
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
  electronicSignatureStatus?: string;
  electronicSignatureCertifiedAt?: string;
  electronicSignatureExpiresAt?: string;
}

interface UserRow {
  id: string;
  username: string;
  displayName: string;
  email?: string;
  phone?: string;
  status: string;
  departmentName: string;
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
  electronicSignatureStatus: string;
  electronicSignatureCertifiedAt?: string;
  electronicSignatureExpiresAt?: string;
  roleIds: string[];
  departmentIds: string[];
  primaryDepartmentId?: string | null;
}

interface Role {
  id: string | number;
  code: string;
  name: string;
}

interface DepartmentNode {
  id: string | number;
  code: string;
  name: string;
  children?: DepartmentNode[];
}

interface FlatDepartment {
  id: string;
  name: string;
  depth: number;
  path: string[];
}

interface UserForm {
  username: string;
  displayName: string;
  email: string;
  phone: string;
  status: string;
  password: string;
  roleIds: string[];
  primaryDepartmentId: string;
}

interface AuditEvent {
  id: string | number;
  entityType?: string;
  entityId?: string | number;
  action?: string;
  contentBefore?: unknown;
  contentAfter?: unknown;
  detail?: string;
  operatorName?: string;
  createdAt?: string;
  reason?: string;
}

interface UserAuditRecord {
  id: string;
  operatorName: string;
  actionLabel: string;
  operatedAt?: string;
  beforeFields: AuditFieldRow[];
  afterFields: AuditFieldRow[];
}

interface AuditFieldRow {
  key?: string;
  label: string;
  value: string;
}

interface AuditDisplayContext {
  departmentPathById: Map<string, string>;
  roleNameById: Map<string, string>;
}

type UserColumnId =
  | 'select'
  | 'displayName'
  | 'username'
  | 'phone'
  | 'departmentName'
  | 'roleName'
  | 'status'
  | 'electronicSignatureStatus'
  | 'electronicSignatureCertifiedAt'
  | 'electronicSignatureExpiresAt'
  | 'createdBy'
  | 'createdAt'
  | 'updatedBy'
  | 'updatedAt'
  | 'actions';

type ConfigurableUserColumnId = Exclude<UserColumnId, 'select' | 'actions'>;

interface UserColumn {
  id: UserColumnId;
  label: string;
  defaultWidth: number;
  minWidth: number;
  resizable?: boolean;
  align?: 'left' | 'center' | 'right';
}

type UserColumnWidths = Partial<Record<UserColumnId, number>>;

interface UserColumnSettings {
  order: ConfigurableUserColumnId[];
  hidden: ConfigurableUserColumnId[];
}

interface UserFilters {
  displayName: string;
  username: string;
  status: string;
  phone: string;
  createdFrom: string;
  createdTo: string;
}

const PAGE_SIZE = 20;
const USER_PAGE_SIZE_OPTIONS = [20, 50, 100, 200] as const;
const USER_FETCH_PAGE_SIZE = 200;
const USER_COLUMN_WIDTH_STORAGE_PREFIX = 'user-management-column-widths:';
const USER_COLUMN_SETTINGS_STORAGE_PREFIX = 'user-management-column-settings:';
const USER_FIELD_COLUMN_MIN_WIDTH = 60;
const SYSTEM_SUPER_ADMIN_USERNAME = 'admin';
const TABLE_DATA_ROW_HEIGHT = 40;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CHINA_MOBILE_PATTERN = /^1[3-9]\d{9}$/;

const emptyForm: UserForm = {
  username: '',
  displayName: '',
  email: '',
  phone: '',
  status: 'ACTIVE',
  password: '',
  roleIds: [],
  primaryDepartmentId: '',
};

const emptyFilters: UserFilters = {
  displayName: '',
  username: '',
  status: 'ALL',
  phone: '',
  createdFrom: '',
  createdTo: '',
};

const userFieldSx = {
  '& .MuiInputBase-root': {
    height: 40,
  },
  '& .MuiInputBase-input': {
    boxSizing: 'border-box',
  },
};

const userSelectSx = {
  ...userFieldSx,
  '& .MuiSelect-select': {
    minHeight: '20px',
    display: 'flex',
    alignItems: 'center',
    overflow: 'hidden',
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

const dateFieldSx = {
  userSelect: 'none',
  '& input': {
    userSelect: 'none',
    cursor: 'pointer',
  },
};

const appContentDrawerSx = {
  top: 0,
  bottom: 0,
  zIndex: 1300,
};

const appContentDrawerPaperSx = {
  ...appContentDrawerSx,
  height: 'auto',
  transform: 'none !important',
  transition: 'none !important',
};

const userManagementWorkspaceHeight = { xs: 'auto', lg: 'calc(100vh - 150px)' };
const USER_ACTION_COLUMN_WIDTH = 128;

const userColumns: UserColumn[] = [
  { id: 'select', label: '', defaultWidth: 50, minWidth: 50, resizable: false, align: 'center' },
  { id: 'displayName', label: '姓名', defaultWidth: 140, minWidth: USER_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'username', label: '账号', defaultWidth: 140, minWidth: USER_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'phone', label: '手机号', defaultWidth: 132, minWidth: USER_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'departmentName', label: '所属组织', defaultWidth: 180, minWidth: USER_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'roleName', label: '岗位角色', defaultWidth: 150, minWidth: USER_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'status', label: '状态', defaultWidth: 96, minWidth: USER_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'electronicSignatureStatus', label: '电子签状态', defaultWidth: 118, minWidth: USER_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'electronicSignatureCertifiedAt', label: '电子签认证时间', defaultWidth: 150, minWidth: USER_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'electronicSignatureExpiresAt', label: '电子签过期时间', defaultWidth: 150, minWidth: USER_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'createdBy', label: '创建人', defaultWidth: 120, minWidth: USER_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'createdAt', label: '创建时间', defaultWidth: 130, minWidth: USER_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'updatedBy', label: '更新人', defaultWidth: 120, minWidth: USER_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'updatedAt', label: '更新时间', defaultWidth: 130, minWidth: USER_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'actions', label: '操作', defaultWidth: USER_ACTION_COLUMN_WIDTH, minWidth: USER_ACTION_COLUMN_WIDTH, resizable: false },
];

function isConfigurableUserColumn(column: UserColumn): column is UserColumn & { id: ConfigurableUserColumnId } {
  return column.id !== 'select' && column.id !== 'actions';
}

function isConfigurableUserColumnId(value: unknown): value is ConfigurableUserColumnId {
  return typeof value === 'string' && userColumns.some((column) => column.id === value && isConfigurableUserColumn(column));
}

function getConfigurableUserColumnIds(): ConfigurableUserColumnId[] {
  return userColumns.filter(isConfigurableUserColumn).map((column) => column.id);
}

const auditFieldLabelMap: Record<string, string> = {
  username: '账号',
  displayName: '姓名',
  name: '姓名',
  email: '邮箱',
  phone: '手机号',
  status: '状态',
  organizationName: '所属组织',
  organization: '所属组织',
  primaryDepartmentId: '所属组织',
  departmentId: '所属组织',
  departmentIds: '所属组织',
  departmentName: '所属组织',
  roleIds: '岗位角色',
  roles: '岗位角色',
  password: '密码',
  createdBy: '创建人',
  createdAt: '创建时间',
  updatedBy: '更新人',
  updatedAt: '更新时间',
};

const auditFieldOrder = [
  'username',
  'displayName',
  'password',
  'email',
  'phone',
  'status',
  'organizationName',
  'organization',
  'primaryDepartmentId',
  'departmentId',
  'departmentIds',
  'departmentName',
  'roleIds',
  'roles',
];

function toId(value: string | number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

function flattenDepartments(nodes: DepartmentNode[], depth = 0, parentPath: string[] = []): FlatDepartment[] {
  return nodes.flatMap((node) => {
    const path = [...parentPath, node.name];
    return [
      { id: toId(node.id), name: node.name, depth, path },
      ...flattenDepartments(node.children ?? [], depth + 1, path),
    ];
  });
}

function getDepartmentPathLabel(item: FlatDepartment): string {
  return item.path.join('/');
}

function getDepartmentSelectValueLabel(value: string, departmentPathById: Map<string, string>): string {
  if (!value) return '未分配';
  return departmentPathById.get(value) ?? value;
}

function formatDate(value?: string): string {
  if (!value) return '-';
  return value.length > 10 ? value.slice(0, 10) : value;
}

function formatDateTime(value?: string): string {
  if (!value) return '-';
  return value.replace('T', ' ').slice(0, 16);
}

function includesText(value: string | undefined, keyword: string): boolean {
  if (!keyword.trim()) return true;
  return (value ?? '').toLowerCase().includes(keyword.trim().toLowerCase());
}

function getUserStatusMeta(status: string) {
  return USER_STATUS_MAP[status as keyof typeof USER_STATUS_MAP] ?? { label: status, color: 'default' as const };
}

function getElectronicSignatureStatusMeta(status: string) {
  const normalized = status || 'UNCERTIFIED';
  if (normalized === 'CERTIFIED') return { label: '已认证', color: 'success' as const };
  if (normalized === 'EXPIRED') return { label: '已过期', color: 'error' as const };
  return { label: '未认证', color: 'default' as const };
}

function getUserFormValidationError(form: UserForm): string {
  if (!form.username.trim()) return '请输入账号';
  if (!form.displayName.trim()) return '请输入姓名';
  if (!form.primaryDepartmentId) return '请选择所属组织';
  if (form.roleIds.length === 0) return '请选择岗位角色';
  if (form.email.trim() && !EMAIL_PATTERN.test(form.email.trim())) {
    return '请输入正确的邮箱地址';
  }
  if (form.phone.trim() && !CHINA_MOBILE_PATTERN.test(form.phone.trim())) {
    return '请输入正确的手机号';
  }
  return '';
}

function getApiErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null) {
    const response = (error as { response?: { data?: { message?: string } } }).response;
    if (response?.data?.message) return response.data.message;
  }

  if (error instanceof Error && error.message) return error.message;

  return fallback;
}

function getAuditActionLabel(action?: string): string {
  if (!action) return '操作';
  return AUDIT_ACTION_MAP[action as keyof typeof AUDIT_ACTION_MAP]?.label || action;
}

function getOperatorName(value?: string): string {
  return value?.trim() || '系统记录';
}

function getUserRoleSummary(user: UserRow, roleNameById: Map<string, string>): string {
  if (user.roleIds.length === 0) return '-';
  return user.roleIds.map((roleId) => roleNameById.get(roleId) || roleId).join('、');
}

function isSystemSuperAdminUsername(username?: string): boolean {
  return username?.trim().toLowerCase() === SYSTEM_SUPER_ADMIN_USERNAME;
}

function isSystemSuperAdminUser(user: UserRow, roleNameById: Map<string, string>): boolean {
  const roleSummary = getUserRoleSummary(user, roleNameById);
  return isSystemSuperAdminUsername(user.username) || (user.id === '1' && roleSummary.includes('系统管理员'));
}

function getUserCreatedBy(user: UserRow): string {
  return user.createdBy?.trim() || '-';
}

function getUserOperatorName(value: string | undefined, userDisplayNameByIdentity: Map<string, string>): string {
  const key = value?.trim();
  if (!key) return '-';
  return userDisplayNameByIdentity.get(key) ?? key;
}

function preserveAuditJsonLargeNumbers(raw: string): string {
  return raw.replace(/([:[,])\s*(-?\d{16,})(?=\s*[,}\]])/g, '$1"$2"');
}

function normalizeAuditValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;

  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^-?\d{16,}$/.test(trimmed)) return trimmed;

  try {
    return JSON.parse(preserveAuditJsonLargeNumbers(trimmed));
  } catch {
    return trimmed;
  }
}

function getAuditFieldLabel(field: string): string {
  return auditFieldLabelMap[field] ?? field;
}

function getAuditFieldOrderIndex(field: string): number {
  const index = auditFieldOrder.indexOf(field);
  return index === -1 ? auditFieldOrder.length : index;
}

function sortAuditFieldRows(entries: Array<[string, unknown]>): Array<[string, unknown]> {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => {
      const orderDelta = getAuditFieldOrderIndex(left.entry[0]) - getAuditFieldOrderIndex(right.entry[0]);
      return orderDelta === 0 ? left.index - right.index : orderDelta;
    })
    .map((item) => item.entry);
}

function dedupeAuditFieldRows(rows: AuditFieldRow[]): AuditFieldRow[] {
  const seenRows = new Set<string>();
  return rows.filter((row) => {
    const signature = `${row.label}\u0000${row.value}`;
    if (seenRows.has(signature)) return false;
    seenRows.add(signature);
    return true;
  });
}

function getAuditRoleDisplayValue(field: string, trimmed: string, context?: AuditDisplayContext): string {
  if (field === 'roles') return trimmed;
  return context?.roleNameById.get(trimmed) ?? `未知岗位角色(${trimmed})`;
}

function getAuditOrganizationDisplayValue(field: string, trimmed: string): string {
  if (field === 'organizationName' || field === 'organization' || field === 'departmentName') return trimmed;
  return `历史组织ID(${trimmed})`;
}

function getAuditScalarDisplayValue(field: string, trimmed: string, context?: AuditDisplayContext): string {
  if (field === 'status') {
    const statusKey = trimmed.toUpperCase() as keyof typeof USER_STATUS_MAP;
    return USER_STATUS_MAP[statusKey]?.label ?? trimmed;
  }

  if (field === 'organizationName' || field === 'organization' || field === 'departmentName' || field === 'primaryDepartmentId' || field === 'departmentId' || field === 'departmentIds') {
    return getAuditOrganizationDisplayValue(field, trimmed);
  }

  if (field === 'roleIds' || field === 'roles') {
    return getAuditRoleDisplayValue(field, trimmed, context);
  }

  return trimmed;
}

function getAuditDisplayValue(field: string, value: unknown, context?: AuditDisplayContext): string {
  const normalized = normalizeAuditValue(value);
  if (normalized === undefined || normalized === null) return '-';

  if (typeof normalized === 'string') {
    const trimmed = normalized.trim();
    if (!trimmed || trimmed === 'undefined') return '-';
    return getAuditScalarDisplayValue(field, trimmed, context);
  }

  if (Array.isArray(normalized)) {
    if (normalized.length === 0) return '-';
    return normalized.map((item) => getAuditDisplayValue(field, item, context)).join('、');
  }

  if (typeof normalized === 'number') {
    return getAuditScalarDisplayValue(field, String(normalized), context);
  }

  if (typeof normalized === 'object') {
    const entries = Object.entries(normalized as Record<string, unknown>);
    if (entries.length === 0) return '-';
    return entries
      .map(([nestedField, fieldValue]) => `${getAuditFieldLabel(nestedField)}:${getAuditDisplayValue(nestedField, fieldValue, context)}`)
      .join('；');
  }

  return String(normalized);
}

function formatAuditFieldRows(value: unknown, context: AuditDisplayContext): AuditFieldRow[] {
  const normalized = normalizeAuditValue(value);
  if (normalized === undefined || normalized === null || normalized === '') return [];

  if (typeof normalized === 'object' && !Array.isArray(normalized)) {
    const record = normalized as Record<string, unknown>;
    const hasOrganizationSnapshot = record.organizationName !== undefined || record.organization !== undefined;
    const rows = sortAuditFieldRows(Object.entries(record)
      .filter(([field]) => !hasOrganizationSnapshot || !['primaryDepartmentId', 'departmentId', 'departmentIds', 'departmentName'].includes(field))).map(([field, fieldValue]) => ({
      key: field,
      label: getAuditFieldLabel(field),
      value: getAuditDisplayValue(field, fieldValue, context),
    }));
    return dedupeAuditFieldRows(rows);
  }

  return [{ key: 'content', label: '内容', value: getAuditDisplayValue('content', normalized, context) }];
}

function isAuditEventForUser(item: AuditEvent, user: UserRow): boolean {
  const entityType = String(item.entityType ?? '').toLowerCase();
  const entityId = String(item.entityId ?? '');
  const userId = String(user.id);
  const payload = [
    item.contentBefore,
    item.contentAfter,
    item.detail,
    item.reason,
  ].map((value) => (typeof value === 'string' ? value : JSON.stringify(value ?? '')))
    .join(' ')
    .toLowerCase();
  const isUserEntity = entityType.includes('user') || entityType.includes('account');
  return (
    (isUserEntity && entityId === userId) ||
    payload.includes(userId.toLowerCase()) ||
    payload.includes(user.username.toLowerCase())
  );
}

function getUserAuditRecords(
  selectedUser: UserRow | null,
  auditEvents: AuditEvent[],
  context: AuditDisplayContext,
): UserAuditRecord[] {
  if (!selectedUser) return [];

  return auditEvents
    .filter((item) => isAuditEventForUser(item, selectedUser))
    .map((item) => ({
      id: String(item.id),
      operatorName: getOperatorName(item.operatorName),
      actionLabel: getAuditActionLabel(item.action),
      operatedAt: item.createdAt,
      beforeFields: formatAuditFieldRows(item.contentBefore, context),
      afterFields: formatAuditFieldRows(item.contentAfter ?? item.detail ?? item.reason, context),
    }));
}

function getUpdatedByValue(user: UserRow, auditRecords: UserAuditRecord[]): string {
  if (user.updatedBy) return user.updatedBy;
  const updateRecord = auditRecords.find((record) => record.actionLabel !== '创建');
  return updateRecord?.operatorName || '-';
}

function getUserPreferenceStorageKey(prefix: string): string {
  if (typeof window === 'undefined') return `${prefix}anonymous`;

  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null') as {
      id?: string | number;
      username?: string;
      displayName?: string;
    } | null;
    const userKey = user?.id ?? user?.username ?? user?.displayName ?? 'anonymous';
    return `${prefix}${String(userKey)}`;
  } catch {
    return `${prefix}anonymous`;
  }
}

function getUserColumnWidthStorageKey(): string {
  return getUserPreferenceStorageKey(USER_COLUMN_WIDTH_STORAGE_PREFIX);
}

function getUserColumnSettingsStorageKey(): string {
  return getUserPreferenceStorageKey(USER_COLUMN_SETTINGS_STORAGE_PREFIX);
}

function loadUserColumnWidths(storageKey: string): UserColumnWidths {
  if (typeof window === 'undefined') return {};

  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return userColumns.reduce<UserColumnWidths>((result, column) => {
      if (!column.resizable) return result;

      const width = Number(parsed[column.id]);
      if (Number.isFinite(width)) {
        result[column.id] = Math.max(column.minWidth, width);
      }
      return result;
    }, {});
  } catch {
    return {};
  }
}

function normalizeUserColumnSettings(value: unknown): UserColumnSettings {
  const defaults = getConfigurableUserColumnIds();
  const parsed = value as { order?: unknown[]; hidden?: unknown[] } | null | undefined;
  const seen = new Set<ConfigurableUserColumnId>();
  const storedOrder = Array.isArray(parsed?.order) ? parsed.order : [];
  const order = [
    ...storedOrder.filter((id): id is ConfigurableUserColumnId => {
      if (!isConfigurableUserColumnId(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    }),
    ...defaults.filter((id) => !seen.has(id)),
  ];
  const hidden = Array.from(new Set(
    (Array.isArray(parsed?.hidden) ? parsed.hidden : [])
      .filter((id): id is ConfigurableUserColumnId => isConfigurableUserColumnId(id) && order.includes(id)),
  ));

  if (hidden.length >= order.length && order.length > 0) {
    return { order, hidden: hidden.filter((id) => id !== order[0]) };
  }

  return { order, hidden };
}

function loadUserColumnSettings(storageKey: string): UserColumnSettings {
  if (typeof window === 'undefined') return normalizeUserColumnSettings(null);

  try {
    const raw = localStorage.getItem(storageKey);
    return normalizeUserColumnSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeUserColumnSettings(null);
  }
}

function getColumnSettingsItems(settings: UserColumnSettings): Array<UserColumn & { id: ConfigurableUserColumnId }> {
  const columnsById = new Map(userColumns.filter(isConfigurableUserColumn).map((column) => [column.id, column]));
  return settings.order
    .map((id) => columnsById.get(id))
    .filter((column): column is UserColumn & { id: ConfigurableUserColumnId } => Boolean(column));
}

function getVisibleUserColumns(settings: UserColumnSettings): UserColumn[] {
  const selectColumn = userColumns.find((column) => column.id === 'select');
  const actionColumn = userColumns.find((column) => column.id === 'actions');
  const visibleDataColumns = getColumnSettingsItems(settings).filter((column) => !settings.hidden.includes(column.id));
  return [selectColumn, ...visibleDataColumns, actionColumn].filter((column): column is UserColumn => Boolean(column));
}

function resolveUserColumnWidths(
  columnWidths: UserColumnWidths,
  tableContainerWidth: number,
  visibleColumns: UserColumn[] = userColumns,
): Record<UserColumnId, number> {
  const resolved = userColumns.reduce<Record<UserColumnId, number>>((result, column) => {
    const persistedWidth = column.resizable ? columnWidths[column.id] : undefined;
    result[column.id] = Math.max(column.minWidth, persistedWidth ?? column.defaultWidth);
    return result;
  }, {} as Record<UserColumnId, number>);

  const baseTotalWidth = visibleColumns.reduce((sum, column) => sum + resolved[column.id], 0);
  const availableWidth = Math.floor(tableContainerWidth);
  if (!Number.isFinite(availableWidth) || availableWidth <= baseTotalWidth) {
    return resolved;
  }

  const flexibleColumns = visibleColumns.filter((column) => column.resizable);
  const flexibleWeight = flexibleColumns.reduce((sum, column) => sum + column.defaultWidth, 0);
  if (flexibleWeight <= 0) return resolved;

  const spareWidth = availableWidth - baseTotalWidth;
  let assignedSpareWidth = 0;
  flexibleColumns.forEach((column, index) => {
    const extraWidth = index === flexibleColumns.length - 1
      ? spareWidth - assignedSpareWidth
      : Math.floor((spareWidth * column.defaultWidth) / flexibleWeight);
    assignedSpareWidth += extraWidth;
    resolved[column.id] += extraWidth;
  });

  return resolved;
}

function getStickyActionColumnSx(column: UserColumn, section: 'head' | 'body') {
  if (column.id !== 'actions') return {};

  return {
    position: 'sticky',
    right: 0,
    zIndex: section === 'head' ? 6 : 4,
    bgcolor: section === 'head' ? '#f5f7fa' : '#fff',
  };
}

function openDatePickerWithoutSelection(event: MouseEvent<HTMLDivElement>) {
  event.preventDefault();

  const input = event.currentTarget.querySelector<HTMLInputElement>('input[type="date"]');
  if (!input) return;

  if (typeof input.showPicker === 'function') {
    input.focus({ preventScroll: true });
    try {
      input.showPicker();
    } catch {
      // Some browsers reject showPicker unless the event is considered a trusted user gesture.
    }
    return;
  }

  input.focus({ preventScroll: true });
}

async function fetchAllUsers(): Promise<ApiUser[]> {
  const result: ApiUser[] = [];
  let pageIndex = 1;
  let totalPages = 1;

  do {
    const res = await getUsers({
      page: pageIndex,
      size: USER_FETCH_PAGE_SIZE,
      sort: 'createdAt',
      order: 'desc',
    });
    const body = res.data.data as PageResult<ApiUser>;
    result.push(...(body.content ?? []));
    totalPages = Math.max(body.totalPages ?? 1, 1);
    pageIndex += 1;
  } while (pageIndex <= totalPages);

  return result;
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box sx={{ p: 1.5, bgcolor: '#fff', border: '1px solid #e4e7ed', borderRadius: 1 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>{title}</Typography>
      <Divider sx={{ mb: 1 }} />
      {children}
    </Box>
  );
}

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box sx={{ minHeight: 54 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography component="div" variant="body2" sx={{ wordBreak: 'break-word' }}>{children || '-'}</Typography>
    </Box>
  );
}

function AuditFieldBlock({
  title,
  kind,
  fields,
}: {
  title: string;
  kind: 'before' | 'after';
  fields: AuditFieldRow[];
}) {
  return (
    <Box
      data-audit-field-before={kind === 'before' ? 'true' : undefined}
      data-audit-field-after={kind === 'after' ? 'true' : undefined}
      sx={{
        minHeight: 176,
        p: 1.5,
        bgcolor: '#f5f7fa',
        border: '1px solid #dcdfe6',
        borderRadius: 1,
        overflow: 'hidden',
      }}
    >
      <Typography variant="body2" sx={{ color: '#606266', mb: 1 }}>
        {title}
      </Typography>
      <Stack
        spacing={0.5}
        sx={{
          maxHeight: 240,
          overflow: 'auto',
          color: '#303133',
          lineHeight: 1.65,
          wordBreak: 'break-word',
        }}
      >
        {fields.length === 0 ? (
          <Typography variant="caption" sx={{ color: '#303133', lineHeight: 1.65 }}>
            -
          </Typography>
        ) : fields.map((field, index) => (
          <Box key={`${field.label}-${index}`} sx={{ display: 'flex', gap: 0.5, alignItems: 'baseline', minWidth: 0 }}>
            <Typography component="span" variant="caption" sx={{ flex: '0 0 auto', color: '#606266', lineHeight: 1.65 }}>
              {field.label}:
            </Typography>
            <Typography component="span" variant="caption" sx={{ minWidth: 0, color: '#303133', lineHeight: 1.65, wordBreak: 'break-word' }}>
              {field.value}
            </Typography>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

export default function UserPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(PAGE_SIZE);
  const [filters, setFilters] = useState<UserFilters>(emptyFilters);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [resetDialog, setResetDialog] = useState<{ id: string; username: string } | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; username: string } | null>(null);
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [userDrawerOpen, setUserDrawerOpen] = useState(false);
  const [userDrawerTab, setUserDrawerTab] = useState(0);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const [tableContainerWidth, setTableContainerWidth] = useState(0);
  const [tableScrollbarWidth, setTableScrollbarWidth] = useState(0);
  const columnWidthStorageKey = useMemo(() => getUserColumnWidthStorageKey(), []);
  const columnSettingsStorageKey = useMemo(() => getUserColumnSettingsStorageKey(), []);
  const [columnWidths, setColumnWidths] = useState<UserColumnWidths>(() => loadUserColumnWidths(columnWidthStorageKey));
  const [columnSettings, setColumnSettings] = useState<UserColumnSettings>(() => loadUserColumnSettings(columnSettingsStorageKey));
  const [columnSettingsAnchorEl, setColumnSettingsAnchorEl] = useState<HTMLButtonElement | null>(null);
  const [draggingColumnId, setDraggingColumnId] = useState<ConfigurableUserColumnId | null>(null);
  const columnSettingDragSourceRef = useRef<ConfigurableUserColumnId | null>(null);
  const resizingColumnRef = useRef<UserColumnId | null>(null);

  const { data: usersData, isLoading, isError } = useQuery({
    queryKey: ['users', 'user-management-all'],
    queryFn: fetchAllUsers,
  });

  const { data: roleData } = useQuery({
    queryKey: ['roles-all'],
    queryFn: async () => {
      const res = await getRoles({ page: 1, size: 200 });
      const body = res.data.data as PageResult<Role>;
      return body.content ?? [];
    },
  });

  const { data: departmentData } = useQuery({
    queryKey: ['departments-tree'],
    queryFn: async () => {
      const res = await getDepartmentTree();
      return res.data.data as DepartmentNode[];
    },
  });

  const { data: auditEventsData } = useQuery({
    queryKey: ['user-management-audit-logs', selectedUser?.id],
    enabled: Boolean(selectedUser?.id),
    queryFn: async () => {
      const res = await getAuditLogs({
        page: 1,
        size: 100,
        entityType: 'USER_ACCOUNT',
        entityId: selectedUser?.id,
      });
      const body = res.data.data as PageResult<AuditEvent>;
      return body.content ?? [];
    },
  });

  const roles = roleData ?? [];
  const roleNameById = useMemo(() => new Map(roles.map((role) => [toId(role.id), role.name])), [roles]);
  const departmentOptions = useMemo(() => flattenDepartments(departmentData ?? []), [departmentData]);
  const departmentPathById = useMemo(
    () => new Map(departmentOptions.map((item) => [item.id, getDepartmentPathLabel(item)])),
    [departmentOptions],
  );

  const users = useMemo<UserRow[]>(() => (usersData ?? []).map((item) => {
    const primaryDepartmentId = toId(item.primaryDepartmentId);
    const departmentIds = (item.departmentIds ?? []).map(toId).filter(Boolean);
    const departmentId = primaryDepartmentId || departmentIds[0] || '';
    return {
      id: toId(item.id),
      username: item.username,
      displayName: item.displayName || item.name || item.username,
      email: item.email,
      phone: item.phone,
      status: item.status || 'ACTIVE',
      departmentName: departmentId ? departmentPathById.get(departmentId) || '-' : '-',
      createdBy: item.createdBy,
      createdAt: item.createdAt,
      updatedBy: item.updatedBy || item.createdBy,
      updatedAt: item.updatedAt || item.createdAt,
      electronicSignatureStatus: item.electronicSignatureStatus || 'UNCERTIFIED',
      electronicSignatureCertifiedAt: item.electronicSignatureCertifiedAt,
      electronicSignatureExpiresAt: item.electronicSignatureExpiresAt,
      roleIds: (item.roleIds ?? []).map(toId).filter(Boolean),
      departmentIds,
      primaryDepartmentId: primaryDepartmentId || null,
    };
  }), [departmentPathById, usersData]);
  const userDisplayNameByIdentity = useMemo(() => {
    const identityMap = new Map<string, string>();
    users.forEach((user) => {
      identityMap.set(user.id, user.displayName);
      identityMap.set(user.username, user.displayName);
      identityMap.set(user.displayName, user.displayName);
    });
    return identityMap;
  }, [users]);

  const filteredRows = useMemo(() => users.filter((item) => {
    const createdDate = formatDate(item.createdAt);
    return (
      includesText(item.displayName, filters.displayName) &&
      includesText(item.username, filters.username) &&
      includesText(item.phone, filters.phone) &&
      (filters.status === 'ALL' || item.status === filters.status) &&
      (!filters.createdFrom || createdDate >= filters.createdFrom) &&
      (!filters.createdTo || createdDate <= filters.createdTo)
    );
  }), [filters, users]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));
  const currentPage = Math.min(page, pageCount);
  const pagedRows = filteredRows.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);
  const columnSettingsItems = useMemo(() => getColumnSettingsItems(columnSettings), [columnSettings]);
  const visibleUserColumns = useMemo(() => getVisibleUserColumns(columnSettings), [columnSettings]);
  const visibleConfigurableColumnCount = columnSettings.order.length - columnSettings.hidden.length;
  const resolvedColumnWidths = useMemo(
    () => resolveUserColumnWidths(columnWidths, tableContainerWidth, visibleUserColumns),
    [columnWidths, tableContainerWidth, visibleUserColumns],
  );
  const totalTableWidth = visibleUserColumns.reduce((sum, column) => sum + resolvedColumnWidths[column.id], 0);
  const userAuditRecords = useMemo(
    () => getUserAuditRecords(selectedUser, auditEventsData ?? [], { departmentPathById, roleNameById }),
    [auditEventsData, departmentPathById, roleNameById, selectedUser],
  );
  const selectablePagedRows = useMemo(
    () => pagedRows.filter((row) => !isSystemSuperAdminUser(row, roleNameById)),
    [pagedRows, roleNameById],
  );
  const selectedBatchDeleteUsers = useMemo(
    () => users.filter((user) => selectedUserIds.has(user.id)),
    [selectedUserIds, users],
  );
  const selectedDeletableBatchUsers = useMemo(
    () => selectedBatchDeleteUsers.filter((user) => !isSystemSuperAdminUser(user, roleNameById)),
    [roleNameById, selectedBatchDeleteUsers],
  );
  const allPagedRowsSelected = selectablePagedRows.length > 0 && selectablePagedRows.every((row) => selectedUserIds.has(row.id));
  const isPagedRowsPartiallySelected = selectablePagedRows.some((row) => selectedUserIds.has(row.id)) && !allPagedRowsSelected;
  const isUserTableEmptyState = isLoading || isError || pagedRows.length === 0;
  const formValidationError = getUserFormValidationError(form);
  const emailFormatError = Boolean(form.email.trim()) && !EMAIL_PATTERN.test(form.email.trim());
  const phoneFormatError = Boolean(form.phone.trim()) && !CHINA_MOBILE_PATTERN.test(form.phone.trim());

  useEffect(() => {
    const node = tableContainerRef.current;
    if (!node) return undefined;

    const updateWidth = () => {
      setTableContainerWidth(node.getBoundingClientRect().width);
      setTableScrollbarWidth(Math.max(0, node.offsetWidth - node.clientWidth));
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const showSnackbar = (message: string, severity: 'success' | 'error') => {
    setSnackbar({ open: true, message, severity });
  };

  const closeSnackbar = () => setSnackbar((current) => ({ ...current, open: false }));

  const handleSnackbarClose = (_event?: SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') return;
    closeSnackbar();
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(columnWidthStorageKey, JSON.stringify(columnWidths));
  }, [columnWidthStorageKey, columnWidths]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(columnSettingsStorageKey, JSON.stringify(columnSettings));
  }, [columnSettingsStorageKey, columnSettings]);

  useEffect(() => {
    setSelectedUserIds((current) => {
      const next = new Set(
        [...current].filter((id) => {
          const user = users.find((item) => item.id === id);
          return !user || !isSystemSuperAdminUser(user, roleNameById);
        }),
      );
      return next.size === current.size ? current : next;
    });
  }, [roleNameById, users]);

  const beginColumnResize = (event: MouseEvent<HTMLDivElement> | ReactPointerEvent<HTMLDivElement>, column: UserColumn) => {
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

  const getColumnSettingDropPlacement = (
    clientY: number,
    targetRow: HTMLElement,
  ): 'before' | 'after' => {
    const rect = targetRow.getBoundingClientRect();
    return clientY > rect.top + rect.height / 2 ? 'after' : 'before';
  };

  const moveUserColumnSetting = (
    sourceId: ConfigurableUserColumnId,
    targetId: ConfigurableUserColumnId,
    placement: 'before' | 'after' = 'before',
  ) => {
    if (sourceId === targetId) return;

    setColumnSettings((current) => {
      const nextOrder = current.order.filter((id) => id !== sourceId);
      const targetIndex = nextOrder.indexOf(targetId);
      if (targetIndex === -1) return current;
      nextOrder.splice(targetIndex + (placement === 'after' ? 1 : 0), 0, sourceId);
      return normalizeUserColumnSettings({ ...current, order: nextOrder });
    });
  };

  const toggleUserColumnVisibility = (columnId: ConfigurableUserColumnId) => {
    setColumnSettings((current) => {
      const isHidden = current.hidden.includes(columnId);
      if (!isHidden && visibleConfigurableColumnCount <= 1) return current;
      const hidden = isHidden
        ? current.hidden.filter((id) => id !== columnId)
        : [...current.hidden, columnId];
      return normalizeUserColumnSettings({ ...current, hidden });
    });
  };

  const handleColumnSettingDragStart = (event: ReactDragEvent<HTMLDivElement>, columnId: ConfigurableUserColumnId) => {
    setDraggingColumnId(columnId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', columnId);
  };

  const handleColumnSettingDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleColumnSettingDrop = (event: ReactDragEvent<HTMLDivElement>, columnId: ConfigurableUserColumnId) => {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData('text/plain') || draggingColumnId;
    if (isConfigurableUserColumnId(sourceId)) {
      moveUserColumnSetting(sourceId, columnId, getColumnSettingDropPlacement(event.clientY, event.currentTarget));
    }
    setDraggingColumnId(null);
  };

  const handleColumnSettingDragEnd = () => {
    setDraggingColumnId(null);
  };

  const beginColumnSettingPointerDrag = (event: ReactPointerEvent<HTMLDivElement>, columnId: ConfigurableUserColumnId) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('input,button')) return;

    event.preventDefault();
    columnSettingDragSourceRef.current = columnId;
    setDraggingColumnId(columnId);
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none';

    const moveColumnByPointer = (moveEvent: globalThis.PointerEvent) => {
      const targetRow = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)
        ?.closest<HTMLElement>('[data-user-column-settings-row]');
      if (!targetRow) return;
      const targetId = targetRow.dataset.columnId;
      const sourceId = columnSettingDragSourceRef.current;
      if (sourceId && isConfigurableUserColumnId(targetId) && targetId !== sourceId) {
        moveUserColumnSetting(sourceId, targetId, getColumnSettingDropPlacement(moveEvent.clientY, targetRow));
      }
    };

    const stopPointerDrag = () => {
      document.body.style.userSelect = previousUserSelect;
      columnSettingDragSourceRef.current = null;
      setDraggingColumnId(null);
      window.removeEventListener('pointermove', moveColumnByPointer);
      window.removeEventListener('pointerup', stopPointerDrag);
    };

    window.addEventListener('pointermove', moveColumnByPointer);
    window.addEventListener('pointerup', stopPointerDrag);
  };

  const updateCreatedFrom = (value: string) => {
    setFilters((current) => ({
      ...current,
      createdFrom: value,
      createdTo: current.createdTo && value && current.createdTo < value ? value : current.createdTo,
    }));
    setPage(1);
  };

  const updateCreatedTo = (value: string) => {
    setFilters((current) => ({
      ...current,
      createdTo: value,
      createdFrom: current.createdFrom && value && current.createdFrom > value ? value : current.createdFrom,
    }));
    setPage(1);
  };

  const resetFilters = () => {
    setFilters(emptyFilters);
    setPage(1);
  };

  const toggleUserSelection = (id: string, checked?: boolean) => {
    const targetUser = users.find((user) => user.id === id);
    if (targetUser && isSystemSuperAdminUser(targetUser, roleNameById)) return;

    setSelectedUserIds((current) => {
      const next = new Set(current);
      const shouldSelect = checked ?? !next.has(id);
      shouldSelect ? next.add(id) : next.delete(id);
      return next;
    });
  };

  const togglePageUserSelection = (checked: boolean) => {
    setSelectedUserIds((current) => {
      const next = new Set(current);
      selectablePagedRows.forEach((row) => {
        checked ? next.add(row.id) : next.delete(row.id);
      });
      return next;
    });
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const primaryDepartmentId = form.primaryDepartmentId || null;
      const body = {
        username: form.username,
        displayName: form.displayName,
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        status: form.status,
        password: form.password || undefined,
        roleIds: form.roleIds,
        departmentIds: primaryDepartmentId ? [primaryDepartmentId] : [],
        primaryDepartmentId,
      };
      return editingId ? updateUser(editingId, body) : createUser(body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['departments-tree'] });
      queryClient.invalidateQueries({ queryKey: ['user-management-audit-logs'] });
      setOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      showSnackbar('用户保存成功', 'success');
    },
    onError: (error) => showSnackbar(getApiErrorMessage(error, '用户保存失败'), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!deleteConfirm) throw new Error('missing user');
      const targetUser = users.find((user) => user.id === deleteConfirm.id);
      if ((targetUser && isSystemSuperAdminUser(targetUser, roleNameById)) || isSystemSuperAdminUsername(deleteConfirm.username)) {
        throw new Error('系统超级管理员账号不允许删除');
      }
      await deleteUser(deleteConfirm.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['departments-tree'] });
      setDeleteConfirm(null);
      setSelectedUser(null);
      setUserDrawerOpen(false);
      showSnackbar('用户删除成功', 'success');
    },
    onError: (error) => showSnackbar(getApiErrorMessage(error, '用户删除失败'), 'error'),
  });

  const batchDeleteMutation = useMutation({
    mutationFn: async () => {
      const blockedBatchDeleteUsers = selectedBatchDeleteUsers.filter((user) => isSystemSuperAdminUser(user, roleNameById));
      if (blockedBatchDeleteUsers.length > 0) {
        throw new Error('系统超级管理员账号不允许删除');
      }
      const userIds = selectedDeletableBatchUsers.map((user) => user.id);
      if (userIds.length === 0) throw new Error('请选择需要删除的账号');
      await Promise.all(userIds.map((id) => deleteUser(id)));
      return userIds;
    },
    onSuccess: (userIds) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['departments-tree'] });
      queryClient.invalidateQueries({ queryKey: ['user-management-audit-logs'] });
      setBatchDeleteConfirm(false);
      setSelectedUserIds(new Set());
      if (selectedUser && userIds.includes(selectedUser.id)) {
        setSelectedUser(null);
        setUserDrawerOpen(false);
      }
      showSnackbar(`已删除 ${userIds.length} 个用户`, 'success');
    },
    onError: (error) => showSnackbar(getApiErrorMessage(error, '批量删除失败'), 'error'),
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      if (!resetDialog) throw new Error('missing user');
      await resetUserPassword(resetDialog.id, { password: newPassword });
    },
    onSuccess: () => {
      setResetDialog(null);
      setNewPassword('');
      showSnackbar('密码已重置', 'success');
    },
    onError: (error) => showSnackbar(getApiErrorMessage(error, '密码重置失败'), 'error'),
  });

  const openCreateDialog = () => {
    setEditingId(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEditDialog = (item: UserRow) => {
    setEditingId(item.id);
    setForm({
      username: item.username,
      displayName: item.displayName,
      email: item.email || '',
      phone: item.phone || '',
      status: item.status || 'ACTIVE',
      password: '',
      roleIds: item.roleIds.slice(0, 1),
      primaryDepartmentId: item.primaryDepartmentId || '',
    });
    setOpen(true);
  };

  const openUserDetailDrawer = (row: UserRow) => {
    setSelectedUser(row);
    setUserDrawerTab(0);
    setUserDrawerOpen(true);
  };

  const closeUserDetailDrawer = () => {
    setUserDrawerOpen(false);
  };

  const handleSaveUser = () => {
    const validationError = formValidationError;
    if (validationError) {
      showSnackbar(getUserFormValidationError(form) || '用户保存失败', 'error');
      return;
    }
    saveMutation.mutate();
  };

  const openDeleteConfirm = (row: UserRow) => {
    if (isSystemSuperAdminUser(row, roleNameById)) {
      showSnackbar('系统超级管理员账号不允许删除', 'error');
      return;
    }
    setDeleteConfirm({ id: row.id, username: row.username });
  };

  const renderCell = (row: UserRow, column: UserColumn) => {
    const cellSx = {
      ...tableBodyCellSx,
      width: resolvedColumnWidths[column.id],
      minWidth: resolvedColumnWidths[column.id],
      maxWidth: resolvedColumnWidths[column.id],
      textAlign: column.align ?? 'left',
      ...getStickyActionColumnSx(column, 'body'),
    };

    if (column.id === 'select') {
      return (
        <TableCell
          key={column.id}
          padding="checkbox"
          align={column.align}
          sx={cellSx}
          onClick={(event) => {
            event.stopPropagation();
            if (isSystemSuperAdminUser(row, roleNameById)) return;
            toggleUserSelection(row.id);
          }}
        >
	          <Checkbox
	            size="small"
	            checked={selectedUserIds.has(row.id)}
              disabled={isSystemSuperAdminUser(row, roleNameById)}
	            onClick={(event) => event.stopPropagation()}
	            onChange={(event) => toggleUserSelection(row.id, event.target.checked)}
	          />
        </TableCell>
      );
    }

    if (column.id === 'displayName') {
      return <TableCell key={column.id} sx={cellSx}>{row.displayName}</TableCell>;
    }

    if (column.id === 'username') {
      return <TableCell key={column.id} sx={cellSx}>{row.username}</TableCell>;
    }

    if (column.id === 'phone') {
      return <TableCell key={column.id} sx={cellSx}>{row.phone || '-'}</TableCell>;
    }

    if (column.id === 'departmentName') {
      return (
        <TableCell key={column.id} sx={cellSx} title={row.departmentName}>
          <Typography sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {row.departmentName}
          </Typography>
        </TableCell>
      );
    }

    if (column.id === 'roleName') {
      return (
        <TableCell key={column.id} sx={cellSx} title={getUserRoleSummary(row, roleNameById)}>
          <Typography sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {getUserRoleSummary(row, roleNameById)}
          </Typography>
        </TableCell>
      );
    }

    if (column.id === 'status') {
      const meta = getUserStatusMeta(row.status);
      return (
        <TableCell key={column.id} sx={cellSx}>
          <StatusBadge label={meta.label} color={meta.color} />
        </TableCell>
      );
    }

    if (column.id === 'electronicSignatureStatus') {
      const meta = getElectronicSignatureStatusMeta(row.electronicSignatureStatus);
      return (
        <TableCell key={column.id} sx={cellSx}>
          <StatusBadge label={meta.label} color={meta.color} />
        </TableCell>
      );
    }

    if (column.id === 'electronicSignatureCertifiedAt') {
      return <TableCell key={column.id} sx={cellSx}>{formatDateTime(row.electronicSignatureCertifiedAt)}</TableCell>;
    }

    if (column.id === 'electronicSignatureExpiresAt') {
      return <TableCell key={column.id} sx={cellSx}>{formatDateTime(row.electronicSignatureExpiresAt)}</TableCell>;
    }

    if (column.id === 'createdBy') {
      return <TableCell key={column.id} sx={cellSx}>{getUserOperatorName(row.createdBy, userDisplayNameByIdentity)}</TableCell>;
    }

    if (column.id === 'createdAt') {
      return <TableCell key={column.id} sx={cellSx}>{formatDateTime(row.createdAt)}</TableCell>;
    }

    if (column.id === 'updatedBy') {
      return <TableCell key={column.id} sx={cellSx}>{getUserOperatorName(row.updatedBy, userDisplayNameByIdentity)}</TableCell>;
    }

    if (column.id === 'updatedAt') {
      return <TableCell key={column.id} sx={cellSx}>{formatDateTime(row.updatedAt)}</TableCell>;
    }

    return (
      <TableCell key={column.id} sx={cellSx}>
        <Stack direction="row" spacing={0} onClick={(event) => event.stopPropagation()}>
          <Tooltip title="编辑" arrow>
            <IconButton size="small" aria-label="编辑" onClick={() => openEditDialog(row)}>
              <Edit fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="重置密码" arrow>
            <IconButton
              size="small"
              aria-label="重置密码"
              onClick={() => {
                setResetDialog({ id: row.id, username: row.username });
                setNewPassword('');
              }}
            >
              <LockReset fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={isSystemSuperAdminUser(row, roleNameById) ? '系统超级管理员账号不允许删除' : '删除'} arrow>
            <IconButton
              size="small"
              color="error"
              aria-label="删除"
              disabled={isSystemSuperAdminUser(row, roleNameById)}
              onClick={() => openDeleteConfirm(row)}
            >
              <Delete fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </TableCell>
    );
  };

	  return (
	    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, height: userManagementWorkspaceHeight, width: '100%', maxWidth: '100%', minWidth: 0, overflow: 'hidden' }}>
	      <Box sx={{ p: 2, minWidth: 0, bgcolor: '#fff', border: '1px solid #e4e7ed', borderRadius: 1 }}>
	        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: '16px 20px', alignItems: 'center' }}>
          <TextField
            label="姓名"
            value={filters.displayName}
            onChange={(event) => {
              setFilters({ ...filters, displayName: event.target.value });
              setPage(1);
            }}
            size="small"
            placeholder="请输入"
          />
          <TextField
            label="账号"
            value={filters.username}
            onChange={(event) => {
              setFilters({ ...filters, username: event.target.value });
              setPage(1);
            }}
            size="small"
            placeholder="请输入"
          />
          <FormControl size="small">
            <InputLabel>状态</InputLabel>
            <Select
              label="状态"
              value={filters.status}
              onChange={(event) => {
                setFilters({ ...filters, status: event.target.value });
                setPage(1);
              }}
            >
              <MenuItem value="ALL">全部</MenuItem>
              {Object.entries(USER_STATUS_MAP).map(([value, meta]) => (
                <MenuItem key={value} value={value}>{meta.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="手机号"
            value={filters.phone}
            onChange={(event) => {
              setFilters({ ...filters, phone: event.target.value });
              setPage(1);
            }}
            size="small"
            placeholder="请输入"
          />
	          <Stack direction="row" spacing={1} alignItems="center">
	            <TextField
	              label="创建时间"
	              type="date"
	              value={filters.createdFrom}
	              onChange={(event) => updateCreatedFrom(event.target.value)}
	              onInput={(event) => updateCreatedFrom((event.target as HTMLInputElement).value)}
	              onMouseDown={openDatePickerWithoutSelection}
	              size="small"
	              fullWidth
	              sx={dateFieldSx}
	              InputLabelProps={{ shrink: true }}
	              inputProps={{ max: filters.createdTo || undefined }}
	            />
	            <Typography sx={{ color: '#909399' }}>-</Typography>
	            <TextField
	              type="date"
	              value={filters.createdTo}
	              onChange={(event) => updateCreatedTo(event.target.value)}
	              onInput={(event) => updateCreatedTo((event.target as HTMLInputElement).value)}
	              onMouseDown={openDatePickerWithoutSelection}
	              size="small"
	              fullWidth
	              sx={dateFieldSx}
	              inputProps={{ min: filters.createdFrom || undefined }}
	            />
	          </Stack>
	          <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="flex-end">
	            <Button variant="outlined" startIcon={<RestartAlt />} onClick={resetFilters}>重置</Button>
	            <Button variant="contained" startIcon={<Search />} onClick={() => setPage(1)}>查询</Button>
	          </Stack>
        </Box>
      </Box>

		      <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, width: '100%', maxWidth: '100%', minWidth: 0, minHeight: 0, bgcolor: '#fff', border: '1px solid #e4e7ed', borderRadius: 1, overflow: 'hidden' }}>
	        <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="center" sx={{ minHeight: 48, px: 2, borderBottom: '1px solid #e4e7ed' }}>
	          <Tooltip title="字段设置" arrow>
	            <IconButton
	              data-user-column-settings-trigger
	              size="small"
	              aria-label="字段设置"
	              onClick={(event) => setColumnSettingsAnchorEl(event.currentTarget)}
	              sx={{
	                width: 36,
	                height: 36,
	                border: '1px solid #e4e7ed',
	                borderRadius: 1,
	                color: '#606266',
	                bgcolor: '#fff',
	                '&:hover': {
	                  color: '#1890ff',
	                  bgcolor: '#e8f4ff',
	                },
	              }}
	            >
	              <Box
	                aria-hidden="true"
	                sx={{
	                  position: 'relative',
	                  width: 22,
	                  height: 22,
	                  display: 'inline-flex',
	                  alignItems: 'center',
	                  justifyContent: 'center',
	                }}
	              >
	                <ViewColumnRounded sx={{ fontSize: 21 }} />
	                <TuneRounded
	                  sx={{
	                    position: 'absolute',
	                    right: -3,
	                    bottom: -2,
	                    fontSize: 13,
	                    p: '1px',
	                    borderRadius: '50%',
	                    bgcolor: '#fff',
	                    boxShadow: '0 0 0 1px #fff',
	                  }}
	                />
	              </Box>
	            </IconButton>
	          </Tooltip>
	          <Stack direction="row" spacing={1} justifyContent="flex-end" alignItems="center">
	            <Button
	              size="small"
	              variant="outlined"
	              color="error"
	              startIcon={<Delete />}
	              disabled={selectedDeletableBatchUsers.length === 0}
	              onClick={() => setBatchDeleteConfirm(true)}
	            >
	              批量删除
	            </Button>
	            <Button size="small" variant="contained" startIcon={<Add />} onClick={openCreateDialog}>新增</Button>
	          </Stack>
	        </Stack>
	        <Popover
	          open={Boolean(columnSettingsAnchorEl)}
	          anchorEl={columnSettingsAnchorEl}
	          onClose={() => setColumnSettingsAnchorEl(null)}
	          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
	          transformOrigin={{ vertical: 'top', horizontal: 'left' }}
	          PaperProps={{
	            sx: {
	              mt: 1,
	              width: 220,
	              overflow: 'visible',
	              border: '1px solid #e4e7ed',
	              borderRadius: 1,
	              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
	              '&::before': {
	                content: '""',
	                position: 'absolute',
	                top: -7,
	                left: 28,
	                width: 12,
	                height: 12,
	                bgcolor: '#fff',
	                borderTop: '1px solid #e4e7ed',
	                borderLeft: '1px solid #e4e7ed',
	                transform: 'rotate(45deg)',
	              },
	            },
	          }}
	        >
	          <Stack data-user-column-settings-panel spacing={0.5} sx={{ p: 1.5 }}>
	            {columnSettingsItems.map((column) => {
	              const checked = !columnSettings.hidden.includes(column.id);
	              const disabled = checked && visibleConfigurableColumnCount <= 1;
	              return (
	                <Box
	                  key={column.id}
	                  data-user-column-settings-row
	                  data-column-id={column.id}
	                  draggable
	                  onDragStart={(event) => handleColumnSettingDragStart(event, column.id)}
	                  onDragOver={handleColumnSettingDragOver}
	                  onDrop={(event) => handleColumnSettingDrop(event, column.id)}
	                  onDragEnd={handleColumnSettingDragEnd}
	                  onPointerDown={(event) => beginColumnSettingPointerDrag(event, column.id)}
	                  sx={{
	                    display: 'grid',
	                    gridTemplateColumns: '24px 34px minmax(0, 1fr)',
	                    alignItems: 'center',
	                    minHeight: 40,
	                    borderRadius: 1,
	                    cursor: 'move',
	                    touchAction: 'none',
	                    color: checked ? '#1890ff' : '#a8abb2',
	                    '&:hover': {
	                      bgcolor: '#f5f7fa',
	                    },
	                  }}
	                >
	                  <DragIndicator fontSize="small" sx={{ color: '#909399' }} />
	                  <Checkbox
	                    size="small"
	                    checked={checked}
	                    disabled={disabled}
	                    onChange={() => toggleUserColumnVisibility(column.id)}
	                    inputProps={{ 'aria-label': `${column.label}字段显隐` }}
	                  />
	                  <Typography sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
	                    {column.label}
	                  </Typography>
	                </Box>
	              );
	            })}
	          </Stack>
	        </Popover>
		        <Box sx={{ position: 'relative', flex: 1, width: '100%', maxWidth: '100%', minWidth: 0, minHeight: 0 }}>
	          <TableContainer
	            ref={tableContainerRef}
	            sx={{
	              width: '100%',
	              maxWidth: '100%',
	              minWidth: 0,
	              height: '100%',
	              minHeight: 0,
	              overflow: 'auto',
	            }}
	          >
	          <Table stickyHeader size="small" sx={{ tableLayout: 'fixed', width: totalTableWidth, minWidth: totalTableWidth, height: isUserTableEmptyState ? '100%' : 'auto' }}>
	            <colgroup>
	              {visibleUserColumns.map((column) => (
	                <col key={column.id} style={{ width: resolvedColumnWidths[column.id] }} />
	              ))}
	            </colgroup>
		            <TableHead>
		              <TableRow sx={{ '& .MuiTableCell-root': tableHeaderCellSx }}>
		                {visibleUserColumns.map((column) => (
		                  <TableCell
		                    key={column.id}
	                    padding={column.id === 'select' ? 'checkbox' : 'normal'}
	                    align={column.align}
		                    sx={{
		                      width: resolvedColumnWidths[column.id],
		                      minWidth: column.minWidth,
		                      position: 'sticky',
                          top: 0,
                          zIndex: 5,
		                      userSelect: 'none',
		                      ...(column.resizable ? { pr: 2 } : {}),
		                      ...getStickyActionColumnSx(column, 'head'),
	                    }}
	                  >
                    {column.id === 'select' ? (
	                      <Checkbox
	                        size="small"
	                        checked={allPagedRowsSelected}
	                        indeterminate={isPagedRowsPartiallySelected}
                          disabled={selectablePagedRows.length === 0}
	                        onClick={(event) => event.stopPropagation()}
	                        onChange={(event) => togglePageUserSelection(event.target.checked)}
	                      />
                    ) : column.label}
                    {column.resizable ? (
	                      <Box
	                        data-user-column-resizer
	                        onPointerDown={(event) => beginColumnResize(event, column)}
	                        onMouseDown={(event) => beginColumnResize(event, column)}
	                        sx={{
                          position: 'absolute',
                          top: 0,
                          right: 0,
                          width: 8,
                          height: '100%',
                          cursor: 'col-resize',
                          zIndex: 3,
                          userSelect: 'none',
                          '&::after': {
                            content: '""',
                            position: 'absolute',
                            top: '50%',
                            right: 3,
                            width: '1px',
                            height: 18,
                            transform: 'translateY(-50%)',
                            bgcolor: '#dcdfe6',
                          },
                          '&:hover::after': {
                            bgcolor: '#1890ff',
                          },
                        }}
                      />
                    ) : null}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
	            <TableBody sx={{ height: isUserTableEmptyState ? '100%' : 'auto' }}>
	              {isLoading ? (
	                <TableRow sx={emptyTableRowSx}>
	                  <TableStateCell colSpan={visibleUserColumns.length} align="center" sx={emptyTableBodyCellSx}>
	                    <CircularProgress size={24} />
	                  </TableStateCell>
	                </TableRow>
	              ) : isError ? (
	                <TableRow sx={emptyTableRowSx}>
	                  <TableStateCell colSpan={visibleUserColumns.length} align="center" sx={emptyTableBodyCellSx}>
	                    加载失败
	                  </TableStateCell>
	                </TableRow>
	              ) : pagedRows.length === 0 ? (
	                <TableRow sx={emptyTableRowSx}>
	                  <TableStateCell colSpan={visibleUserColumns.length} align="center" sx={emptyTableBodyCellSx}>
	                    暂无数据
	                  </TableStateCell>
                </TableRow>
              ) : pagedRows.map((row) => (
                <TableRow
                  key={row.id}
                  hover
	                  onClick={() => openUserDetailDrawer(row)}
	                  sx={{ cursor: 'pointer', '& .MuiTableCell-root': tableBodyCellSx }}
	                >
	                  {visibleUserColumns.map((column) => renderCell(row, column))}
	                </TableRow>
              ))}
            </TableBody>
          </Table>
	          </TableContainer>
	          <Box
	            data-user-action-column-shadow
	            sx={{
	              position: 'absolute',
	              top: 0,
	              bottom: 0,
	              right: tableScrollbarWidth,
	              width: USER_ACTION_COLUMN_WIDTH,
	              boxShadow: '-6px 0 8px -8px rgba(0, 0, 0, 0.35)',
	              pointerEvents: 'none',
	              zIndex: 7,
	            }}
	          />
	        </Box>
	        <Box
	          sx={{
	            minHeight: 56,
	            px: '20px',
	            display: 'flex',
	            alignItems: 'center',
	            justifyContent: 'space-between',
	            gap: 2,
	            borderTop: 'none',
	          }}
	        >
	          <Typography sx={{ color: '#909399' }}>共 {filteredRows.length} 条数据</Typography>
	          <Stack direction="row" spacing={2} alignItems="center">
	            <Pagination
	              page={currentPage}
	              count={pageCount}
	              color="primary"
	              size="small"
	              onChange={(_, value) => setPage(value)}
	            />
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
	              {USER_PAGE_SIZE_OPTIONS.map((size) => (
	                <MenuItem key={size} value={size}>{size}</MenuItem>
	              ))}
	            </TextField>
	          </Stack>
	        </Box>
      </Box>

      <Drawer anchor="right"
        open={userDrawerOpen}
        onClose={closeUserDetailDrawer}
        sx={appContentDrawerSx}
        slotProps={{ backdrop: { sx: appContentDrawerSx } }}
        PaperProps={{ sx: appContentDrawerPaperSx }}
      >
        <Box sx={{ width: { xs: '100vw', sm: 560 }, p: 2, bgcolor: '#f7f9fc', minHeight: '100%' }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#303133' }}>
              信息查看
            </Typography>
            <IconButton size="small" onClick={closeUserDetailDrawer} aria-label="关闭详情">
              <Close />
            </IconButton>
          </Stack>

          {!selectedUser ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              请选择一名用户查看详情。
            </Typography>
          ) : (
            <>
              <Box sx={{ mt: 1, borderBottom: '1px solid #e4e7ed' }}>
                <Tabs
                  value={userDrawerTab}
                  onChange={(_, value: number) => setUserDrawerTab(value)}
                  aria-label="用户详情切换"
                >
                  <Tab label="数据信息" />
                  <Tab label="数据审计" />
                </Tabs>
              </Box>

              {userDrawerTab === 0 ? (
                <Stack spacing={2} sx={{ mt: 2 }}>
                  <DetailSection title="基本信息">
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
                      <DetailField label="姓名">{selectedUser.displayName}</DetailField>
                      <DetailField label="账号">{selectedUser.username}</DetailField>
                      <DetailField label="手机号">{selectedUser.phone || '-'}</DetailField>
                      <DetailField label="邮箱">{selectedUser.email || '-'}</DetailField>
                      <DetailField label="状态">
                        <StatusBadge
                          label={getUserStatusMeta(selectedUser.status).label}
                          color={getUserStatusMeta(selectedUser.status).color}
                        />
                      </DetailField>
                    </Box>
                  </DetailSection>

                  <DetailSection title="组织与角色">
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
                      <DetailField label="所属组织">{selectedUser.departmentName}</DetailField>
                      <DetailField label="岗位角色">{getUserRoleSummary(selectedUser, roleNameById)}</DetailField>
                    </Box>
                  </DetailSection>

                  <DetailSection title="电子签名">
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
                      <DetailField label="电子签状态">
                        <StatusBadge
                          label={getElectronicSignatureStatusMeta(selectedUser.electronicSignatureStatus).label}
                          color={getElectronicSignatureStatusMeta(selectedUser.electronicSignatureStatus).color}
                        />
                      </DetailField>
                      <DetailField label="认证时间">{formatDateTime(selectedUser.electronicSignatureCertifiedAt)}</DetailField>
                      <DetailField label="过期时间">{formatDateTime(selectedUser.electronicSignatureExpiresAt)}</DetailField>
                    </Box>
                  </DetailSection>

                  <DetailSection title="系统信息">
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
	                      <DetailField label="创建人">{getUserCreatedBy(selectedUser)}</DetailField>
                      <DetailField label="创建时间">{formatDateTime(selectedUser.createdAt)}</DetailField>
                      <DetailField label="更新人">{getUpdatedByValue(selectedUser, userAuditRecords)}</DetailField>
                      <DetailField label="更新时间">{formatDateTime(selectedUser.updatedAt)}</DetailField>
                    </Box>
                  </DetailSection>
                </Stack>
              ) : null}

              {userDrawerTab === 1 ? (
                <Stack spacing={2} sx={{ mt: 2 }}>
                  <DetailSection title="审计记录">
                    <Box data-audit-accordion-list sx={{ overflow: 'hidden' }}>
                      <Box
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr 1.35fr 32px',
                          columnGap: 1,
                          px: 1.5,
                          py: 1,
                          color: '#606266',
                          bgcolor: '#f5f7fa',
                          border: '1px solid #e4e7ed',
                          borderBottom: 'none',
                          borderRadius: '4px 4px 0 0',
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        <Typography variant="caption" sx={{ fontWeight: 600 }}>操作人</Typography>
                        <Typography variant="caption" sx={{ fontWeight: 600 }}>操作动作</Typography>
                        <Typography variant="caption" sx={{ fontWeight: 600 }}>操作时间</Typography>
                        <Box aria-hidden />
                      </Box>

                      <Stack spacing={1}>
                        {userAuditRecords.length === 0 ? (
                          <Box
                            sx={{
                              px: 1.5,
                              py: 3,
                              textAlign: 'center',
                              color: '#909399',
                              bgcolor: '#fff',
                              border: '1px solid #e4e7ed',
                              borderRadius: '4px',
                            }}
                          >
                            <Typography variant="body2">暂无审计记录</Typography>
                          </Box>
                        ) : userAuditRecords.map((record, index) => (
                          <Accordion
                            key={record.id}
                            data-audit-accordion-row={record.id}
                            disableGutters
                            elevation={0}
                            sx={{
                              border: '1px solid #e4e7ed',
                              borderRadius: '4px !important',
                              bgcolor: '#fff',
                              overflow: 'hidden',
                              '&::before': { display: 'none' },
                              '&.Mui-expanded': { m: 0 },
                            }}
                          >
                            <AccordionSummary
                              expandIcon={<ExpandMore fontSize="small" />}
                              aria-label={`展开审计记录 ${index + 1}`}
                              sx={{
                                minHeight: 44,
                                px: 1.5,
                                '&.Mui-expanded': { minHeight: 44 },
                                '& .MuiAccordionSummary-content': { m: 0, minWidth: 0 },
                                '& .MuiAccordionSummary-content.Mui-expanded': { m: 0 },
                              }}
                            >
                              <Box
                                sx={{
                                  display: 'grid',
                                  gridTemplateColumns: '1fr 1fr 1.35fr',
                                  columnGap: 1,
                                  width: '100%',
                                  minWidth: 0,
                                  alignItems: 'center',
                                }}
                              >
                                <Typography variant="body2" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {record.operatorName}
                                </Typography>
                                <Typography variant="body2" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {record.actionLabel}
                                </Typography>
                                <Typography variant="body2" sx={{ color: '#606266', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {formatDateTime(record.operatedAt)}
                                </Typography>
                              </Box>
                            </AccordionSummary>
                            <AccordionDetails sx={{ px: 1.5, pt: 0, pb: 1.5 }}>
                              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
                                <AuditFieldBlock title="变更前" kind="before" fields={record.beforeFields} />
                                <AuditFieldBlock title="变更后" kind="after" fields={record.afterFields} />
                              </Box>
                            </AccordionDetails>
                          </Accordion>
                        ))}
                      </Stack>
                    </Box>
                  </DetailSection>
                </Stack>
              ) : null}
            </>
          )}
        </Box>
      </Drawer>

      <AppDialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editingId ? '编辑用户' : '新增用户'}</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, rowGap: 1.5, columnGap: 1.5 }}>
            <TextField
              label="账号"
              required
              value={form.username}
              onChange={(event) => setForm({ ...form, username: event.target.value })}
              fullWidth
              disabled={Boolean(editingId)}
              size="small"
              sx={userFieldSx}
            />
            <TextField
              label="姓名"
              value={form.displayName}
              onChange={(event) => setForm({ ...form, displayName: event.target.value })}
              fullWidth
              required
              size="small"
              sx={userFieldSx}
            />
            {!editingId ? (
              <TextField
                label="初始密码"
                type="password"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                fullWidth
                size="small"
                sx={userFieldSx}
              />
            ) : null}
            <FormControl fullWidth required size="small" sx={userSelectSx}>
              <InputLabel>所属组织</InputLabel>
              <Select
                label="所属组织"
                value={form.primaryDepartmentId}
                onChange={(event) => setForm({ ...form, primaryDepartmentId: String(event.target.value) })}
                renderValue={(value) => getDepartmentSelectValueLabel(String(value), departmentPathById)}
              >
                <MenuItem value="">未分配</MenuItem>
                {departmentOptions.map((item) => (
                  <MenuItem key={item.id} value={item.id}>
                    <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                      <Box aria-hidden sx={{ width: item.depth * 22, flex: '0 0 auto' }} />
                      <Typography sx={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.name}
                      </Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth required size="small" sx={userSelectSx}>
              <InputLabel>岗位角色</InputLabel>
              <Select
                label="岗位角色"
                value={form.roleIds[0] ?? ''}
                onChange={(event) => setForm({
                  ...form,
                  roleIds: event.target.value ? [String(event.target.value)] : [],
                })}
              >
                {roles.map((role) => (
                  <MenuItem key={toId(role.id)} value={toId(role.id)}>{role.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="邮箱"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              fullWidth
              size="small"
              error={emailFormatError}
              helperText={emailFormatError ? '请输入正确的邮箱地址' : undefined}
              sx={userFieldSx}
            />
            <TextField
              label="手机号"
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
              fullWidth
              size="small"
              error={phoneFormatError}
              helperText={phoneFormatError ? '请输入正确的手机号' : undefined}
              sx={userFieldSx}
            />
            <FormControl fullWidth size="small" sx={userSelectSx}>
              <InputLabel>状态</InputLabel>
              <Select
                label="状态"
                value={form.status}
                onChange={(event) => setForm({ ...form, status: event.target.value })}
              >
                {Object.entries(USER_STATUS_MAP).map(([value, meta]) => (
                  <MenuItem key={value} value={value}>{meta.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>取消</Button>
          <Button
            variant="contained"
            onClick={handleSaveUser}
            disabled={
              !form.username ||
              !form.displayName ||
              !form.primaryDepartmentId ||
              form.roleIds.length === 0 ||
              saveMutation.isPending
            }
          >
            保存
          </Button>
        </DialogActions>
      </AppDialog>

      <AppDialog open={resetDialog !== null} onClose={() => setResetDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>重置密码</DialogTitle>
        <DialogContent dividers>
          <TextField
            label="新密码"
            type="password"
            fullWidth
            size="small"
            sx={{ mt: 1, ...userFieldSx }}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetDialog(null)}>取消</Button>
          <Button variant="contained" onClick={() => resetMutation.mutate()} disabled={!newPassword || resetMutation.isPending}>确认</Button>
        </DialogActions>
      </AppDialog>

      <AppDialog open={deleteConfirm !== null} onClose={() => setDeleteConfirm(null)} maxWidth="xs" fullWidth>
        <DialogTitle>确认删除账号</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2">
            确定要删除账号 {deleteConfirm?.username} 吗？删除后该账号将无法继续登录系统。
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>取消</Button>
          <Button color="error" variant="contained" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>删除</Button>
        </DialogActions>
      </AppDialog>

      <AppDialog open={batchDeleteConfirm} onClose={() => setBatchDeleteConfirm(false)} maxWidth="sm" fullWidth>
        <DialogTitle>确认批量删除账号</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.5}>
            <Alert severity="error">危险的操作，请仔细阅读并确认数据后操作</Alert>
            <Typography variant="body2">
              本次将删除已勾选的 {selectedBatchDeleteUsers.length} 个账号。删除后账号将无法继续登录系统，请确认数据无误后再操作。
            </Typography>
            <Box sx={{ maxHeight: 180, overflow: 'auto', border: '1px solid #e4e7ed', borderRadius: 1, bgcolor: '#f8fafc' }}>
              {selectedBatchDeleteUsers.map((user) => (
                <Box
                  key={user.id}
                  sx={{
                    px: 1.5,
                    py: 1,
                    borderBottom: '1px solid #e4e7ed',
                    '&:last-of-type': { borderBottom: 'none' },
                  }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{user.displayName}</Typography>
                  <Typography variant="caption" sx={{ color: '#606266' }}>{user.username}</Typography>
                </Box>
              ))}
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBatchDeleteConfirm(false)}>取消</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => batchDeleteMutation.mutate()}
            disabled={batchDeleteMutation.isPending || selectedBatchDeleteUsers.length === 0}
          >
            确认删除
          </Button>
        </DialogActions>
      </AppDialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        onClose={handleSnackbarClose}
      >
        <Alert severity={snackbar.severity} onClose={closeSnackbar}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
