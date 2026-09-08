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
  List,
  ListItemButton,
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
import {
  Add,
  Apartment,
  Business,
  Close,
  DragIndicator,
  Edit,
  ExpandLess,
  ExpandMore,
  Groups,
  LockReset,
  PersonRemove,
  RestartAlt,
  Search,
  TuneRounded,
  ViewColumnRounded,
} from '@mui/icons-material';
import {
  createDepartment,
  createUser,
  deleteDepartment,
  getDepartmentTree,
  getRoles,
  removeUserFromOrganization,
  resetUserPassword,
  updateDepartment,
  updateUser,
} from '@/api/identity';
import { getAuditLogs } from '@/api/audit';
import StatusBadge from '@/components/StatusBadge';
import type { PageResult } from '@/types/common';
import { AUDIT_ACTION_MAP, USER_STATUS_MAP } from '@/utils/constants';

interface OrgUser {
  id: string;
  username: string;
  displayName: string;
  status: string;
  phone?: string;
  email?: string;
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
  roleIds?: string[];
  departmentIds?: string[];
  primaryDepartmentId?: string | null;
}

interface DepartmentNode {
  id: string;
  tenantId?: string;
  parentId?: string | null;
  code: string;
  name: string;
  sortOrder?: number;
  users?: OrgUser[];
  children?: DepartmentNode[];
}

interface FlatDepartment {
  node: DepartmentNode;
  depth: number;
  path: string[];
}

interface PersonnelRow {
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
  roleIds: string[];
  departmentIds: string[];
  primaryDepartmentId?: string | null;
}

interface Role {
  id: string | number;
  code: string;
  name: string;
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
  key: string;
  label: string;
  value: string;
}

interface AuditDisplayContext {
  departmentPathById: Map<string, string>;
  roleNameById: Map<string, string>;
}

type PersonnelColumnId =
  | 'select'
  | 'displayName'
  | 'username'
  | 'phone'
  | 'status'
  | 'departmentName'
  | 'roleName'
  | 'createdBy'
  | 'createdAt'
  | 'updatedBy'
  | 'updatedAt'
  | 'actions';

type ConfigurablePersonnelColumnId = Exclude<PersonnelColumnId, 'select' | 'actions'>;

interface PersonnelColumn {
  id: PersonnelColumnId;
  label: string;
  defaultWidth: number;
  minWidth: number;
  resizable?: boolean;
  align?: 'left' | 'center' | 'right';
}

type PersonnelColumnWidths = Partial<Record<PersonnelColumnId, number>>;

interface PersonnelColumnSettings {
  order: ConfigurablePersonnelColumnId[];
  hidden: ConfigurablePersonnelColumnId[];
}

const PAGE_SIZE = 20;
const PERSONNEL_COLUMN_WIDTH_STORAGE_PREFIX = 'organization-personnel-column-widths:';
const PERSONNEL_COLUMN_SETTINGS_STORAGE_PREFIX = 'organization-personnel-column-settings:';
const TABLE_DATA_ROW_HEIGHT = 40;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CHINA_MOBILE_PATTERN = /^1[3-9]\d{9}$/;
const emptyUserForm: UserForm = {
  username: '',
  displayName: '',
  email: '',
  phone: '',
  status: 'ACTIVE',
  password: '',
  roleIds: [],
  primaryDepartmentId: '',
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

const appContentDrawerSx = {
  top: 0,
  bottom: 0,
  zIndex: 1300,
};

const appContentDrawerPaperSx = {
  ...appContentDrawerSx,
  height: 'auto',
};

const organizationWorkspaceHeight = { xs: 'auto', lg: 'calc(100vh - 150px)' };
const PERSONNEL_FIELD_COLUMN_MIN_WIDTH = 60;
const PERSONNEL_ACTION_COLUMN_WIDTH = 128;

const dateFieldSx = {
  userSelect: 'none',
  '& input': {
    userSelect: 'none',
    cursor: 'pointer',
  },
};

const personnelColumns: PersonnelColumn[] = [
  { id: 'select', label: '', defaultWidth: 50, minWidth: 50, resizable: false, align: 'center' },
  { id: 'displayName', label: '姓名', defaultWidth: 140, minWidth: PERSONNEL_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'username', label: '账号', defaultWidth: 140, minWidth: PERSONNEL_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'phone', label: '手机号', defaultWidth: 132, minWidth: PERSONNEL_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'departmentName', label: '所属组织', defaultWidth: 160, minWidth: PERSONNEL_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'roleName', label: '岗位角色', defaultWidth: 150, minWidth: PERSONNEL_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'status', label: '状态', defaultWidth: 96, minWidth: PERSONNEL_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'createdBy', label: '创建人', defaultWidth: 120, minWidth: PERSONNEL_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'createdAt', label: '创建时间', defaultWidth: 130, minWidth: PERSONNEL_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'updatedBy', label: '更新人', defaultWidth: 120, minWidth: PERSONNEL_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'updatedAt', label: '更新时间', defaultWidth: 130, minWidth: PERSONNEL_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'actions', label: '操作', defaultWidth: PERSONNEL_ACTION_COLUMN_WIDTH, minWidth: PERSONNEL_ACTION_COLUMN_WIDTH, resizable: false },
];

function isConfigurablePersonnelColumn(
  column: PersonnelColumn,
): column is PersonnelColumn & { id: ConfigurablePersonnelColumnId } {
  return column.id !== 'select' && column.id !== 'actions';
}

function isConfigurablePersonnelColumnId(value: unknown): value is ConfigurablePersonnelColumnId {
  return typeof value === 'string' && personnelColumns.some((column) =>
    column.id === value && isConfigurablePersonnelColumn(column),
  );
}

function getConfigurablePersonnelColumnIds(): ConfigurablePersonnelColumnId[] {
  return personnelColumns.filter(isConfigurablePersonnelColumn).map((column) => column.id);
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
  password: '初始密码',
  createdBy: '创建人',
  createdAt: '创建时间',
  updatedBy: '更新人',
  updatedAt: '更新时间',
};
const auditFieldOrder = ['username', 'displayName', 'password', 'email', 'phone', 'status', 'organizationName', 'organization', 'primaryDepartmentId', 'departmentId', 'departmentIds', 'departmentName', 'roleIds', 'roles'];

function flattenDepartments(nodes: DepartmentNode[], depth = 0, parentPath: string[] = []): FlatDepartment[] {
  return nodes.flatMap((node) => [
    { node, depth, path: [...parentPath, node.name] },
    ...flattenDepartments(node.children ?? [], depth + 1, [...parentPath, node.name]),
  ]);
}

function getDepartmentPathLabel(item: FlatDepartment): string {
  return item.path.join('/');
}

function getDepartmentSelectValueLabel(value: string, departmentPathById: Map<string, string>): string {
  if (!value) return '未分配';
  return departmentPathById.get(value) ?? value;
}

function getLevelLabel(depth: number): string {
  if (depth === 0) return '公司主体';
  if (depth === 1) return '部门';
  return '班组';
}

function getChildLabel(depth: number): string | null {
  if (depth === 0) return '新增部门';
  if (depth === 1) return '新增班组';
  return null;
}

function countUsers(node: DepartmentNode): number {
  return (node.users?.length ?? 0) + (node.children ?? []).reduce((sum, child) => sum + countUsers(child), 0);
}

function getDeleteBlockReason(node: DepartmentNode | undefined): string {
  if (!node) return '';

  const hasChildOrganizations = (node.children?.length ?? 0) > 0;
  const hasUsers = countUsers(node) > 0;

  if (hasChildOrganizations && hasUsers) return '该组织下存在子组织或用户，无法删除';
  if (hasChildOrganizations) return '该组织下存在子组织，无法删除';
  if (hasUsers) return '该组织下存在用户，无法删除';
  return '';
}

function collectPersonnel(node: DepartmentNode | undefined, includeChildren: boolean, parentPath: string[] = []): PersonnelRow[] {
  if (!node) return [];

  const departmentPath = [...parentPath, node.name];
  const rows = (node.users ?? []).map((user) => ({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    phone: user.phone,
    status: user.status,
    departmentName: departmentPath.join('/'),
    createdBy: user.createdBy,
    createdAt: user.createdAt,
    updatedBy: user.updatedBy || user.createdBy,
    updatedAt: user.updatedAt || user.createdAt,
    roleIds: user.roleIds ?? [],
    departmentIds: user.departmentIds ?? [],
    primaryDepartmentId: user.primaryDepartmentId,
  }));

  if (!includeChildren) return rows;

  return [
    ...rows,
    ...(node.children ?? []).flatMap((child) => collectPersonnel(child, true, departmentPath)),
  ];
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

function getUserRoleSummary(user: PersonnelRow, roleNameById: Map<string, string>): string {
  if (user.roleIds.length === 0) return '-';
  return user.roleIds.map((roleId) => roleNameById.get(roleId) || roleId).join('、');
}

function getPersonnelCreatedBy(user: PersonnelRow, roleNameById: Map<string, string>): string {
  if (user.createdBy?.trim()) return user.createdBy;
  const roleSummary = getUserRoleSummary(user, roleNameById);
  return roleSummary.includes('系统管理员') ? '系统管理员' : '-';
}

function getPersonnelUpdatedBy(user: PersonnelRow, roleNameById: Map<string, string>): string {
  if (user.updatedBy?.trim()) return user.updatedBy;
  return getPersonnelCreatedBy(user, roleNameById);
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

function getAuditScalarDisplayValue(field: string, trimmed: string, context?: AuditDisplayContext): string {
  if (field === 'status') {
    const statusKey = trimmed.toUpperCase() as keyof typeof USER_STATUS_MAP;
    return USER_STATUS_MAP[statusKey]?.label ?? trimmed;
  }

  if (field === 'organizationName' || field === 'organization' || field === 'departmentName') {
    return trimmed;
  }

  if (field === 'primaryDepartmentId' || field === 'departmentId' || field === 'departmentIds') {
    return `历史组织ID(${trimmed})`;
  }

  if (field === 'roleIds' || field === 'roles') {
    return context?.roleNameById.get(trimmed) ?? trimmed;
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

function isAuditEventForUser(item: AuditEvent, user: PersonnelRow): boolean {
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
  selectedUser: PersonnelRow | null,
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

function getUpdatedByValue(user: PersonnelRow, auditRecords: UserAuditRecord[], roleNameById: Map<string, string>): string {
  if (user.updatedBy) return user.updatedBy;
  const updateRecord = auditRecords.find((record) => record.actionLabel !== '创建');
  return updateRecord?.operatorName || getPersonnelCreatedBy(user, roleNameById);
}

function getPersonnelPreferenceStorageKey(prefix: string): string {
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

function getPersonnelColumnWidthStorageKey(): string {
  return getPersonnelPreferenceStorageKey(PERSONNEL_COLUMN_WIDTH_STORAGE_PREFIX);
}

function getPersonnelColumnSettingsStorageKey(): string {
  return getPersonnelPreferenceStorageKey(PERSONNEL_COLUMN_SETTINGS_STORAGE_PREFIX);
}

function loadPersonnelColumnWidths(storageKey: string): PersonnelColumnWidths {
  if (typeof window === 'undefined') return {};

  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return personnelColumns.reduce<PersonnelColumnWidths>((result, column) => {
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

function normalizePersonnelColumnSettings(value: unknown): PersonnelColumnSettings {
  const defaults = getConfigurablePersonnelColumnIds();
  const parsed = value as { order?: unknown[]; hidden?: unknown[] } | null | undefined;
  const seen = new Set<ConfigurablePersonnelColumnId>();
  const storedOrder = Array.isArray(parsed?.order) ? parsed.order : [];
  const order = [
    ...storedOrder.filter((id): id is ConfigurablePersonnelColumnId => {
      if (!isConfigurablePersonnelColumnId(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    }),
    ...defaults.filter((id) => !seen.has(id)),
  ];
  const hidden = Array.from(new Set(
    (Array.isArray(parsed?.hidden) ? parsed.hidden : [])
      .filter((id): id is ConfigurablePersonnelColumnId => isConfigurablePersonnelColumnId(id) && order.includes(id)),
  ));

  if (hidden.length >= order.length && order.length > 0) {
    return { order, hidden: hidden.filter((id) => id !== order[0]) };
  }

  return { order, hidden };
}

function loadPersonnelColumnSettings(storageKey: string): PersonnelColumnSettings {
  if (typeof window === 'undefined') return normalizePersonnelColumnSettings(null);

  try {
    const raw = localStorage.getItem(storageKey);
    return normalizePersonnelColumnSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizePersonnelColumnSettings(null);
  }
}

function getColumnSettingsItems(
  settings: PersonnelColumnSettings,
): Array<PersonnelColumn & { id: ConfigurablePersonnelColumnId }> {
  const columnsById = new Map(personnelColumns.filter(isConfigurablePersonnelColumn).map((column) => [column.id, column]));
  return settings.order
    .map((id) => columnsById.get(id))
    .filter((column): column is PersonnelColumn & { id: ConfigurablePersonnelColumnId } => Boolean(column));
}

function getVisiblePersonnelColumns(settings: PersonnelColumnSettings): PersonnelColumn[] {
  const selectColumn = personnelColumns.find((column) => column.id === 'select');
  const actionColumn = personnelColumns.find((column) => column.id === 'actions');
  const visibleDataColumns = getColumnSettingsItems(settings).filter((column) => !settings.hidden.includes(column.id));
  return [selectColumn, ...visibleDataColumns, actionColumn].filter((column): column is PersonnelColumn => Boolean(column));
}

function resolvePersonnelColumnWidths(
  columnWidths: PersonnelColumnWidths,
  tableContainerWidth: number,
  visibleColumns: PersonnelColumn[] = personnelColumns,
): Record<PersonnelColumnId, number> {
  const resolved = personnelColumns.reduce<Record<PersonnelColumnId, number>>((result, column) => {
    const persistedWidth = column.resizable ? columnWidths[column.id] : undefined;
    result[column.id] = Math.max(column.minWidth, persistedWidth ?? column.defaultWidth);
    return result;
  }, {} as Record<PersonnelColumnId, number>);

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

function getStickyActionColumnSx(column: PersonnelColumn, section: 'head' | 'body') {
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
          <Box
            key={`${field.key}-${index}`}
            sx={{ display: 'flex', gap: 0.5, alignItems: 'baseline', minWidth: 0 }}
          >
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

export default function OrganizationPage() {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [parentId, setParentId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '' });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userForm, setUserForm] = useState<UserForm>(emptyUserForm);
  const [resetDialog, setResetDialog] = useState<{ id: string; username: string } | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [removeUserConfirm, setRemoveUserConfirm] = useState<{ id: string; username: string } | null>(null);
  const [selectedUser, setSelectedUser] = useState<PersonnelRow | null>(null);
  const [selectedPersonnelIds, setSelectedPersonnelIds] = useState<Set<string>>(new Set());
  const [userDrawerOpen, setUserDrawerOpen] = useState(false);
  const [userDrawerTab, setUserDrawerTab] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    name: '',
    username: '',
    phone: '',
    status: 'ALL',
    createdFrom: '',
    createdTo: '',
  });
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });
  const [columnWidthStorageKey] = useState(getPersonnelColumnWidthStorageKey);
  const [columnWidths, setColumnWidths] = useState<PersonnelColumnWidths>(() =>
    loadPersonnelColumnWidths(columnWidthStorageKey),
  );
  const [columnSettingsStorageKey] = useState(getPersonnelColumnSettingsStorageKey);
  const [columnSettings, setColumnSettings] = useState<PersonnelColumnSettings>(() =>
    loadPersonnelColumnSettings(columnSettingsStorageKey),
  );
  const [columnSettingsAnchorEl, setColumnSettingsAnchorEl] = useState<HTMLButtonElement | null>(null);
  const [draggingColumnId, setDraggingColumnId] = useState<ConfigurablePersonnelColumnId | null>(null);
  const columnSettingDragSourceRef = useRef<ConfigurablePersonnelColumnId | null>(null);
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const [tableContainerWidth, setTableContainerWidth] = useState(0);
  const [tableScrollbarWidth, setTableScrollbarWidth] = useState(0);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['departments-tree'],
    queryFn: async () => {
      const res = await getDepartmentTree();
      return res.data.data as DepartmentNode[];
    },
  });

  const { data: roleData } = useQuery({
    queryKey: ['roles-all'],
    queryFn: async () => {
      const res = await getRoles({ page: 1, size: 200 });
      const body = res.data.data as PageResult<Role>;
      return body.content ?? [];
    },
  });

  const { data: auditLogData } = useQuery({
    queryKey: ['organization-user-audit-logs', selectedUser?.id],
    enabled: userDrawerOpen && Boolean(selectedUser),
    queryFn: async () => {
      const res = await getAuditLogs({
        page: 1,
        size: 200,
        sort: 'createdAt',
        order: 'desc',
        entityType: 'USER_ACCOUNT',
        entityId: selectedUser?.id,
      });
      return res.data.data as PageResult<AuditEvent>;
    },
  });

  const departments = data ?? [];
  const flatDepartments = useMemo(() => flattenDepartments(departments), [departments]);
  const departmentPathById = useMemo(
    () => new Map(flatDepartments.map((item) => [item.node.id, getDepartmentPathLabel(item)])),
    [flatDepartments],
  );
  const departmentOptions = useMemo(
    () => flatDepartments.map((item) => ({
      id: item.node.id,
      depth: item.depth,
      name: item.node.name,
      pathLabel: getDepartmentPathLabel(item),
    })),
    [flatDepartments],
  );
  const roles = roleData ?? [];
  const roleNameById = useMemo(
    () => new Map(roles.map((role) => [String(role.id), role.name])),
    [roles],
  );
  const auditLogItems = auditLogData?.content ?? [];
  const userAuditRecords = useMemo(
    () => getUserAuditRecords(selectedUser, auditLogItems, { departmentPathById, roleNameById }),
    [selectedUser, auditLogItems, departmentPathById, roleNameById],
  );
  const selected = flatDepartments.find((item) => item.node.id === selectedId) ?? flatDepartments[0];
  const allRows = useMemo(
    () => collectPersonnel(selected?.node, true, selected ? selected.path.slice(0, -1) : []),
    [selected],
  );
  const filteredRows = useMemo(() => {
    return allRows.filter((row) => {
      const createdDate = row.createdAt?.slice(0, 10) ?? '';
      const matchesCreatedFrom = !filters.createdFrom || (createdDate && createdDate >= filters.createdFrom);
      const matchesCreatedTo = !filters.createdTo || (createdDate && createdDate <= filters.createdTo);

      return (
        includesText(row.displayName, filters.name) &&
        includesText(row.username, filters.username) &&
        includesText(row.phone, filters.phone) &&
        (filters.status === 'ALL' || row.status === filters.status) &&
        matchesCreatedFrom &&
        matchesCreatedTo
      );
    });
  }, [allRows, filters]);
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pagedRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const isPersonnelTableEmptyState = pagedRows.length === 0;
  const pagedRowIds = useMemo(() => pagedRows.map((row) => row.id), [pagedRows]);
  const selectedPagedRowCount = pagedRowIds.filter((id) => selectedPersonnelIds.has(id)).length;
  const allPagedRowsSelected = pagedRowIds.length > 0 && selectedPagedRowCount === pagedRowIds.length;
  const isPagedRowsPartiallySelected = selectedPagedRowCount > 0 && selectedPagedRowCount < pagedRowIds.length;
  const columnSettingsItems = useMemo(() => getColumnSettingsItems(columnSettings), [columnSettings]);
  const visiblePersonnelColumns = useMemo(() => getVisiblePersonnelColumns(columnSettings), [columnSettings]);
  const visibleConfigurablePersonnelColumnCount = columnSettings.order.length - columnSettings.hidden.length;
  const resolvedColumnWidths = useMemo(
    () => resolvePersonnelColumnWidths(columnWidths, tableContainerWidth, visiblePersonnelColumns),
    [columnWidths, tableContainerWidth, visiblePersonnelColumns],
  );
  const totalTableWidth = useMemo(
    () => visiblePersonnelColumns.reduce((sum, column) => sum + resolvedColumnWidths[column.id], 0),
    [resolvedColumnWidths, visiblePersonnelColumns],
  );
  const dialogParent = parentId !== null
    ? flatDepartments.find((item) => item.node.id === parentId)
    : undefined;
  const editingDepartment = editingId
    ? flatDepartments.find((item) => item.node.id === editingId)?.node
    : undefined;
  const deleteBlockReason = getDeleteBlockReason(editingDepartment);
  const dialogTitle = editingId
    ? '编辑组织节点'
    : parentId === null
      ? '新增公司主体'
      : dialogParent?.depth === 0
        ? '新增部门'
        : dialogParent?.depth === 1
          ? '新增班组'
          : '新增组织节点';
  const userFormValidationError = getUserFormValidationError(userForm);
  const emailFormatError = Boolean(userForm.email.trim()) && !EMAIL_PATTERN.test(userForm.email.trim());
  const phoneFormatError = Boolean(userForm.phone.trim()) && !CHINA_MOBILE_PATTERN.test(userForm.phone.trim());
  const showSnackbar = (message: string, severity: 'success' | 'error') => {
    setSnackbar({ open: true, message, severity });
  };
  const closeSnackbar = () => {
    setSnackbar((current) => ({ ...current, open: false }));
  };
  const handleSnackbarClose = (_event?: SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') return;
    closeSnackbar();
  };

  useEffect(() => {
    if (flatDepartments.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((current) => {
      if (current && flatDepartments.some((item) => item.node.id === current)) return current;
      return flatDepartments[0].node.id;
    });
    setExpanded((current) => {
      if (current.size > 0) return current;
      return new Set(flatDepartments.map((item) => item.node.id));
    });
  }, [flatDepartments]);

  useEffect(() => {
    setPage(1);
  }, [filters, selectedId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(columnWidthStorageKey, JSON.stringify(columnWidths));
  }, [columnWidthStorageKey, columnWidths]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(columnSettingsStorageKey, JSON.stringify(columnSettings));
  }, [columnSettingsStorageKey, columnSettings]);

  useEffect(() => {
    const container = tableContainerRef.current;
    if (!container) return undefined;

    const updateTableContainerWidth = () => {
      setTableContainerWidth(container.clientWidth);
      setTableScrollbarWidth(Math.max(0, container.offsetWidth - container.clientWidth));
    };

    updateTableContainerWidth();

    const observer = new ResizeObserver(updateTableContainerWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const saveMutation = useMutation({
    mutationFn: (body: { name: string; parentId?: string | null }) =>
      editingId ? updateDepartment(editingId, body) : createDepartment(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments-tree'] });
      setDialogOpen(false);
      setEditingId(null);
      setForm({ name: '' });
      showSnackbar(editingId ? '更新成功' : '创建成功', 'success');
    },
    onError: (error) => showSnackbar(getApiErrorMessage(error, '操作失败'), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteDepartment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments-tree'] });
      setDeleteConfirm(null);
      showSnackbar('删除成功', 'success');
    },
    onError: (error) => showSnackbar(getApiErrorMessage(error, '删除失败'), 'error'),
  });

  const saveUserMutation = useMutation({
    mutationFn: () => {
      const primaryDepartmentId = userForm.primaryDepartmentId || selected?.node.id || '';
      const body = {
        username: userForm.username,
        displayName: userForm.displayName,
        email: userForm.email.trim() || undefined,
        phone: userForm.phone.trim() || undefined,
        status: userForm.status,
        password: userForm.password || undefined,
        roleIds: userForm.roleIds,
        departmentIds: primaryDepartmentId ? [primaryDepartmentId] : [],
        primaryDepartmentId: primaryDepartmentId || null,
      };
      return editingUserId ? updateUser(editingUserId, body) : createUser(body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments-tree'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['organization-user-audit-logs'] });
      setUserDialogOpen(false);
      setEditingUserId(null);
      setUserForm(emptyUserForm);
      showSnackbar('用户保存成功', 'success');
    },
    onError: (error) => showSnackbar(getApiErrorMessage(error, '用户保存失败'), 'error'),
  });

  const resetPasswordMutation = useMutation({
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

  const removeUserMutation = useMutation({
    mutationFn: async () => {
      if (!removeUserConfirm) throw new Error('missing user');
      await removeUserFromOrganization(removeUserConfirm.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments-tree'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setRemoveUserConfirm(null);
      setSelectedUser(null);
      setUserDrawerOpen(false);
      showSnackbar('用户已移出组织', 'success');
    },
    onError: (error) => showSnackbar(getApiErrorMessage(error, '移出失败'), 'error'),
  });

  const toggleExpand = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const openCreateDialog = (pid: string | null) => {
    setEditingId(null);
    setParentId(pid);
    setForm({ name: '' });
    if (pid !== null) {
      setExpanded((current) => new Set(current).add(pid));
    }
    setDialogOpen(true);
  };

  const openEditDialog = (item: DepartmentNode) => {
    setEditingId(item.id);
    setParentId(item.parentId ?? null);
    setForm({ name: item.name });
    setDialogOpen(true);
  };

  const openDeleteConfirmFromEditDialog = () => {
    if (!editingId) return;
    setDialogOpen(false);
    setDeleteConfirm(editingId);
  };

  const openCreateUserDialog = () => {
    if (!selected) {
      showSnackbar('请先选择组织节点', 'error');
      return;
    }
    setEditingUserId(null);
    setUserForm({ ...emptyUserForm, primaryDepartmentId: selected.node.id });
    setUserDialogOpen(true);
  };

  const openEditUserDialog = (row: PersonnelRow) => {
    setEditingUserId(row.id);
    setUserForm({
      username: row.username,
      displayName: row.displayName,
      email: row.email ?? '',
      phone: row.phone ?? '',
      status: row.status || 'ACTIVE',
      password: '',
      roleIds: row.roleIds,
      primaryDepartmentId: row.primaryDepartmentId ?? row.departmentIds[0] ?? selected?.node.id ?? '',
    });
    setUserDialogOpen(true);
  };

  const openUserDetailDrawer = (row: PersonnelRow) => {
    setSelectedUser(row);
    setUserDrawerTab(0);
    setUserDrawerOpen(true);
  };

  const handleSaveUser = () => {
    const validationError = userFormValidationError;
    if (validationError) {
      showSnackbar(getUserFormValidationError(userForm) || '用户保存失败', 'error');
      return;
    }
    saveUserMutation.mutate();
  };

  const closeUserDetailDrawer = () => {
    setUserDrawerOpen(false);
  };

  const resetFilters = () => {
    setFilters({
      name: '',
      username: '',
      phone: '',
      status: 'ALL',
      createdFrom: '',
      createdTo: '',
    });
  };

  const updateCreatedFrom = (value: string) => {
    setFilters((current) => ({
      ...current,
      createdFrom: value,
      createdTo: current.createdTo && value && current.createdTo < value ? value : current.createdTo,
    }));
  };

  const updateCreatedTo = (value: string) => {
    setFilters((current) => ({
      ...current,
      createdTo: current.createdFrom && value && value < current.createdFrom ? current.createdFrom : value,
    }));
  };

  const getColumnWidth = (column: PersonnelColumn) => resolvedColumnWidths[column.id];

  const beginColumnResize = (event: MouseEvent<HTMLDivElement>, columnId: PersonnelColumnId) => {
    const column = personnelColumns.find((item) => item.id === columnId);
    if (!column?.resizable) return;

    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = getColumnWidth(column);
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const resizeColumn = (moveEvent: globalThis.MouseEvent) => {
      const nextWidth = Math.max(column.minWidth, startWidth + moveEvent.clientX - startX);
      setColumnWidths((current) => ({ ...current, [columnId]: nextWidth }));
    };

    const stopResize = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener('mousemove', resizeColumn);
      window.removeEventListener('mouseup', stopResize);
    };

    window.addEventListener('mousemove', resizeColumn);
    window.addEventListener('mouseup', stopResize);
  };

  const getColumnSettingDropPlacement = (
    clientY: number,
    targetRow: HTMLElement,
  ): 'before' | 'after' => {
    const rect = targetRow.getBoundingClientRect();
    return clientY > rect.top + rect.height / 2 ? 'after' : 'before';
  };

  const movePersonnelColumnSetting = (
    sourceId: ConfigurablePersonnelColumnId,
    targetId: ConfigurablePersonnelColumnId,
    placement: 'before' | 'after' = 'before',
  ) => {
    if (sourceId === targetId) return;

    setColumnSettings((current) => {
      const nextOrder = current.order.filter((id) => id !== sourceId);
      const targetIndex = nextOrder.indexOf(targetId);
      if (targetIndex === -1) return current;
      nextOrder.splice(targetIndex + (placement === 'after' ? 1 : 0), 0, sourceId);
      return normalizePersonnelColumnSettings({ ...current, order: nextOrder });
    });
  };

  const togglePersonnelColumnVisibility = (columnId: ConfigurablePersonnelColumnId) => {
    setColumnSettings((current) => {
      const isHidden = current.hidden.includes(columnId);
      if (!isHidden && visibleConfigurablePersonnelColumnCount <= 1) return current;
      const hidden = isHidden
        ? current.hidden.filter((id) => id !== columnId)
        : [...current.hidden, columnId];
      return normalizePersonnelColumnSettings({ ...current, hidden });
    });
  };

  const handleColumnSettingDragStart = (
    event: ReactDragEvent<HTMLDivElement>,
    columnId: ConfigurablePersonnelColumnId,
  ) => {
    setDraggingColumnId(columnId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', columnId);
  };

  const handleColumnSettingDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleColumnSettingDrop = (
    event: ReactDragEvent<HTMLDivElement>,
    columnId: ConfigurablePersonnelColumnId,
  ) => {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData('text/plain') || draggingColumnId;
    if (isConfigurablePersonnelColumnId(sourceId)) {
      movePersonnelColumnSetting(sourceId, columnId, getColumnSettingDropPlacement(event.clientY, event.currentTarget));
    }
    setDraggingColumnId(null);
  };

  const handleColumnSettingDragEnd = () => {
    setDraggingColumnId(null);
  };

  const beginColumnSettingPointerDrag = (
    event: ReactPointerEvent<HTMLDivElement>,
    columnId: ConfigurablePersonnelColumnId,
  ) => {
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
        ?.closest<HTMLElement>('[data-personnel-column-settings-row]');
      if (!targetRow) return;
      const targetId = targetRow.dataset.columnId;
      const sourceId = columnSettingDragSourceRef.current;
      if (sourceId && isConfigurablePersonnelColumnId(targetId) && targetId !== sourceId) {
        movePersonnelColumnSetting(sourceId, targetId, getColumnSettingDropPlacement(moveEvent.clientY, targetRow));
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

  const togglePersonnelSelection = (rowId: string, checked?: boolean) => {
    setSelectedPersonnelIds((current) => {
      const next = new Set(current);
      const shouldSelect = checked ?? !next.has(rowId);
      if (shouldSelect) {
        next.add(rowId);
      } else {
        next.delete(rowId);
      }
      return next;
    });
  };

  const togglePagePersonnelSelection = (checked: boolean) => {
    setSelectedPersonnelIds((current) => {
      const next = new Set(current);
      pagedRowIds.forEach((rowId) => {
        if (checked) {
          next.add(rowId);
        } else {
          next.delete(rowId);
        }
      });
      return next;
    });
  };

  const renderPersonnelCell = (row: PersonnelRow, column: PersonnelColumn) => {
    const cellSx = {
      ...tableBodyCellSx,
      width: getColumnWidth(column),
      minWidth: column.minWidth,
      ...getStickyActionColumnSx(column, 'body'),
    };

    if (column.id === 'select') {
      return (
        <TableCell
          key={column.id}
          padding="checkbox"
          align={column.align}
          onClick={(event) => {
            event.stopPropagation();
            togglePersonnelSelection(row.id);
          }}
          sx={{ ...cellSx, cursor: 'default' }}
        >
          <Checkbox
            size="small"
            checked={selectedPersonnelIds.has(row.id)}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => togglePersonnelSelection(row.id, event.target.checked)}
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

    if (column.id === 'status') {
      return (
        <TableCell key={column.id} sx={cellSx}>
          <StatusBadge
            label={getUserStatusMeta(row.status).label}
            color={getUserStatusMeta(row.status).color}
          />
        </TableCell>
      );
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
      const roleSummary = getUserRoleSummary(row, roleNameById);
      return (
        <TableCell key={column.id} sx={cellSx} title={roleSummary}>
          <Typography sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {roleSummary}
          </Typography>
        </TableCell>
      );
    }

    if (column.id === 'createdBy') {
      return <TableCell key={column.id} sx={cellSx}>{getPersonnelCreatedBy(row, roleNameById)}</TableCell>;
    }

    if (column.id === 'createdAt') {
      return <TableCell key={column.id} sx={cellSx}>{formatDateTime(row.createdAt)}</TableCell>;
    }

    if (column.id === 'updatedBy') {
      return <TableCell key={column.id} sx={cellSx}>{getPersonnelUpdatedBy(row, roleNameById)}</TableCell>;
    }

    if (column.id === 'updatedAt') {
      return <TableCell key={column.id} sx={cellSx}>{formatDateTime(row.updatedAt)}</TableCell>;
    }

    return (
      <TableCell key={column.id} sx={cellSx}>
        <Stack
          direction="row"
          spacing={0.25}
          onClick={(event) => event.stopPropagation()}
          sx={{ alignItems: 'center' }}
        >
          <Tooltip title="编辑" arrow>
            <IconButton size="small" aria-label="编辑" onClick={() => openEditUserDialog(row)}>
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
          <Tooltip title="移出" arrow>
            <IconButton
              size="small"
              aria-label="移出"
              onClick={() => setRemoveUserConfirm({ id: row.id, username: row.username })}
            >
              <PersonRemove fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </TableCell>
    );
  };

  const renderNode = (node: DepartmentNode, depth: number) => {
    const hasChildren = (node.children?.length ?? 0) > 0;
    const isSelected = selected?.node.id === node.id;
    const childLabel = getChildLabel(depth);
    const nodeIcon = depth === 0
      ? <Business fontSize="small" />
      : depth === 1
        ? <Apartment fontSize="small" />
        : <Groups fontSize="small" />;

    return (
      <Box key={node.id}>
        <ListItemButton
          selected={isSelected}
          onClick={() => setSelectedId(node.id)}
          sx={{
            minHeight: 44,
            mb: '5px',
            pl: 1,
            pr: 0.75,
            borderRadius: '5px',
            color: '#303133',
            '&.Mui-selected': {
              bgcolor: '#e8f4ff',
              color: '#1890ff',
            },
            '&.Mui-selected:hover': {
              bgcolor: '#e8f4ff',
            },
          }}
        >
          {hasChildren ? (
            <IconButton
              size="small"
              onClick={(event) => {
                event.stopPropagation();
                toggleExpand(node.id);
              }}
              sx={{ mr: 0.5, color: 'inherit' }}
            >
              {expanded.has(node.id) ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
            </IconButton>
          ) : (
            <Box
              sx={{
                width: depth >= 2 ? 5 : 30,
                mr: depth >= 2 ? 0 : 0.5,
                flex: depth >= 2 ? '0 0 5px' : '0 0 30px',
              }}
            />
          )}
          <Box sx={{ display: 'flex', alignItems: 'center', mr: 1, color: 'inherit' }}>
            {nodeIcon}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              title={node.name}
              sx={{ fontSize: 14, fontWeight: isSelected ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {node.name}
            </Typography>
            <Typography sx={{ fontSize: 12, color: isSelected ? '#1890ff' : '#909399' }}>
              {getLevelLabel(depth)} · {countUsers(node)} 人
            </Typography>
          </Box>
          {childLabel ? (
            <IconButton
              size="small"
              title={childLabel}
              onClick={(event) => {
                event.stopPropagation();
                openCreateDialog(node.id);
              }}
              sx={{ color: isSelected ? '#1890ff' : '#909399' }}
            >
              <Add fontSize="small" />
            </IconButton>
          ) : null}
          <IconButton
            size="small"
            title="编辑组织"
            onClick={(event) => {
              event.stopPropagation();
              openEditDialog(node);
            }}
            sx={{ color: isSelected ? '#1890ff' : '#909399' }}
          >
            <Edit fontSize="small" />
          </IconButton>
        </ListItemButton>
        {expanded.has(node.id) && hasChildren && (
          <Box
            data-organization-tree-branch
            sx={{
              position: 'relative',
              ml: 0,
              pl: '30px',
            }}
          >
            <Box
              data-organization-tree-guide
              sx={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: '23px',
                transform: 'translateX(-50%)',
                width: '1px',
                bgcolor: '#dcdfe6',
              }}
            />
            {node.children!.map((child) => renderNode(child, depth + 1))}
          </Box>
        )}
      </Box>
    );
  };

  return (
    <Box sx={{ minHeight: 0 }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: '266px minmax(0, 1fr)' },
          alignItems: 'stretch',
          gap: '20px',
          minHeight: organizationWorkspaceHeight,
          height: organizationWorkspaceHeight,
        }}
      >
        <Box
          sx={{
            bgcolor: '#fff',
            border: '1px solid #e4e7ed',
            borderRadius: '5px',
            overflow: 'hidden',
            height: '100%',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Box
            sx={{
              height: 56,
              px: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid #e4e7ed',
            }}
          >
            <Typography sx={{ fontSize: 16, fontWeight: 600, color: '#303133' }}>组织架构</Typography>
          </Box>

          {isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress size={24} /></Box>
          ) : isError ? (
            <Box sx={{ textAlign: 'center', py: 6, color: '#909399' }}>加载失败</Box>
          ) : departments.length === 0 ? (
            <Box sx={{ px: 2, py: 5, textAlign: 'center', color: '#909399', flex: 1 }}>
              <Typography sx={{ mb: 2 }}>暂无组织架构</Typography>
              <Typography sx={{ mb: 2.5, fontSize: 13, lineHeight: 1.6 }}>
                创建公司主体后，可在公司节点下新增部门，再在部门下新增班组。
              </Typography>
              <Button variant="contained" startIcon={<Add />} onClick={() => openCreateDialog(null)}>
                新增公司主体
              </Button>
            </Box>
          ) : (
            <List disablePadding sx={{ p: '10px', flex: 1, minHeight: 0, overflow: 'auto' }}>
              {departments.map((department) => renderNode(department, 0))}
            </List>
          )}
        </Box>

        <Box sx={{ minWidth: 0, height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <Box
            sx={{
              bgcolor: '#fff',
              border: '1px solid #e4e7ed',
              borderRadius: '5px',
              p: '20px',
              mb: '20px',
            }}
          >
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' },
                gap: '16px 20px',
                alignItems: 'center',
              }}
            >
              <TextField
                label="姓名"
                placeholder="请输入"
                value={filters.name}
                onChange={(event) => setFilters({ ...filters, name: event.target.value })}
              />
              <TextField
                label="账号"
                placeholder="请输入"
                value={filters.username}
                onChange={(event) => setFilters({ ...filters, username: event.target.value })}
              />
              <TextField
                select
                label="状态"
                value={filters.status}
                onChange={(event) => setFilters({ ...filters, status: event.target.value })}
              >
                <MenuItem value="ALL">全部</MenuItem>
                {Object.entries(USER_STATUS_MAP).map(([value, meta]) => (
                  <MenuItem key={value} value={value}>{meta.label}</MenuItem>
                ))}
              </TextField>
              <TextField
                label="手机号"
                placeholder="请输入"
                value={filters.phone}
                onChange={(event) => setFilters({ ...filters, phone: event.target.value })}
              />
              <Stack direction="row" spacing={1} alignItems="center">
                <TextField
                  label="创建时间"
                  type="date"
                  value={filters.createdFrom}
                  onInput={(event) => updateCreatedFrom((event.target as HTMLInputElement).value)}
                  onChange={(event) => updateCreatedFrom(event.target.value)}
                  onMouseDown={openDatePickerWithoutSelection}
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ max: filters.createdTo || undefined }}
                  fullWidth
                  sx={dateFieldSx}
                />
                <Typography sx={{ color: '#909399' }}>-</Typography>
                <TextField
                  type="date"
                  value={filters.createdTo}
                  onInput={(event) => updateCreatedTo((event.target as HTMLInputElement).value)}
                  onChange={(event) => updateCreatedTo(event.target.value)}
                  onMouseDown={openDatePickerWithoutSelection}
                  inputProps={{ min: filters.createdFrom || undefined }}
                  fullWidth
                  sx={dateFieldSx}
                />
              </Stack>
              <Stack direction="row" spacing={1.5} justifyContent={{ xs: 'flex-start', md: 'flex-end' }}>
                <Button variant="outlined" startIcon={<RestartAlt />} onClick={resetFilters}>
                  重置
                </Button>
                <Button variant="contained" startIcon={<Search />} onClick={() => setPage(1)}>
                  查询
                </Button>
              </Stack>
            </Box>
          </Box>

          <Box
            sx={{
              bgcolor: '#fff',
              border: '1px solid #e4e7ed',
              borderRadius: '5px',
              overflow: 'hidden',
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <Box
              sx={{
                minHeight: 48,
                px: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 2,
                borderBottom: '1px solid #e4e7ed',
              }}
            >
              <Tooltip title="字段设置" arrow>
                <IconButton
                  data-personnel-column-settings-trigger
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
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<Add />}
                  onClick={openCreateUserDialog}
                  disabled={!selected}
                >
                  新增
                </Button>
              </Stack>
            </Box>
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
              <Stack data-personnel-column-settings-panel spacing={0.5} sx={{ p: 1.5 }}>
                {columnSettingsItems.map((column) => {
                  const checked = !columnSettings.hidden.includes(column.id);
                  const disabled = checked && visibleConfigurablePersonnelColumnCount <= 1;
                  return (
                    <Box
                      key={column.id}
                      data-personnel-column-settings-row
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
                        onChange={() => togglePersonnelColumnVisibility(column.id)}
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

	            <Box sx={{ position: 'relative', flex: 1, minHeight: 0 }}>
	              <TableContainer ref={tableContainerRef} sx={{ width: '100%', height: '100%', minHeight: 0, overflow: 'auto' }}>
                <Table stickyHeader size="small" sx={{ tableLayout: 'fixed', width: totalTableWidth, minWidth: totalTableWidth, height: isPersonnelTableEmptyState ? '100%' : 'auto' }}>
                <colgroup>
                  {visiblePersonnelColumns.map((column) => (
                    <col key={column.id} style={{ width: getColumnWidth(column) }} />
                  ))}
                </colgroup>
                <TableHead>
                  <TableRow sx={{ '& .MuiTableCell-root': tableHeaderCellSx }}>
                    {visiblePersonnelColumns.map((column) => (
                      <TableCell
                        key={column.id}
                        padding={column.id === 'select' ? 'checkbox' : 'normal'}
                        align={column.align}
                        sx={{
                          width: getColumnWidth(column),
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
                            disabled={pagedRows.length === 0}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) => togglePagePersonnelSelection(event.target.checked)}
                          />
                        ) : column.label}
                        {column.resizable ? (
                          <Box
                            data-column-resizer
                            onMouseDown={(event) => beginColumnResize(event, column.id)}
                            sx={{
                              position: 'absolute',
                              top: 0,
                              right: 0,
                              zIndex: 3,
                              width: 8,
                              height: '100%',
                              cursor: 'col-resize',
                              userSelect: 'none',
                              '&::after': {
                                content: '""',
                                position: 'absolute',
                                top: '50%',
                                right: 0,
                                transform: 'translateY(-50%)',
                                width: '1px',
                                height: 18,
                                bgcolor: '#dcdfe6',
                                borderRadius: '1px',
                                transition: 'background-color 120ms ease',
                              },
                              '&:hover': {
                                bgcolor: '#d1e9ff',
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
	                <TableBody sx={{ height: isPersonnelTableEmptyState ? '100%' : 'auto' }}>
	                  {isPersonnelTableEmptyState ? (
	                    <TableRow sx={emptyTableRowSx}>
	                      <TableStateCell colSpan={visiblePersonnelColumns.length} align="center" sx={emptyTableBodyCellSx}>
	                        {selected ? '暂无人员' : '请选择左侧组织节点'}
	                      </TableStateCell>
                    </TableRow>
                  ) : pagedRows.map((row) => (
                    <TableRow
                      key={`${row.departmentName}-${row.id}`}
                      hover
                      onClick={() => openUserDetailDrawer(row)}
                      sx={{ cursor: 'pointer', '& .MuiTableCell-root': tableBodyCellSx }}
                    >
                      {visiblePersonnelColumns.map((column) => renderPersonnelCell(row, column))}
                    </TableRow>
                  ))}
                </TableBody>
	                </Table>
	              </TableContainer>
	              <Box
	                data-personnel-action-column-shadow
	                sx={{
	                  position: 'absolute',
	                  top: 0,
	                  bottom: 0,
	                  right: tableScrollbarWidth,
	                  width: PERSONNEL_ACTION_COLUMN_WIDTH,
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
                  page={Math.min(page, pageCount)}
                  count={pageCount}
                  color="primary"
                  size="small"
                  onChange={(_, value) => setPage(value)}
                />
                <TextField
                  select
                  value={PAGE_SIZE}
                  sx={{ width: 110 }}
                  InputProps={{
                    startAdornment: <InputAdornment position="start" sx={{ mr: 0 }}>每页</InputAdornment>,
                  }}
                >
                  <MenuItem value={PAGE_SIZE}>{PAGE_SIZE}</MenuItem>
                </TextField>
              </Stack>
            </Box>
          </Box>
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
            <Typography variant="body2" color="text.secondary" sx={{ mt: 4 }}>
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
                      <DetailField label="岗位角色">
                        {selectedUser.roleIds.length > 0
                          ? selectedUser.roleIds.map((roleId) => roleNameById.get(roleId) || roleId).join('、')
                          : '-'}
                      </DetailField>
                    </Box>
                  </DetailSection>

                  <DetailSection title="系统信息">
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
                      <DetailField label="创建人">{getPersonnelCreatedBy(selectedUser, roleNameById)}</DetailField>
                      <DetailField label="创建时间">{formatDateTime(selectedUser.createdAt)}</DetailField>
                      <DetailField label="更新人">{getUpdatedByValue(selectedUser, userAuditRecords, roleNameById)}</DetailField>
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
                              <Box
                                sx={{
                                  display: 'grid',
                                  gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                                  gap: 1.5,
                                }}
                              >
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

      <AppDialog open={userDialogOpen} onClose={() => setUserDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editingUserId ? '编辑用户' : '新增用户'}</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, rowGap: 1.5, columnGap: 1.5 }}>
            <TextField
              label="账号"
              required
              value={userForm.username}
              onChange={(event) => setUserForm({ ...userForm, username: event.target.value })}
              fullWidth
              disabled={Boolean(editingUserId)}
              size="small"
              sx={userFieldSx}
            />
            <TextField
              label="姓名"
              value={userForm.displayName}
              onChange={(event) => setUserForm({ ...userForm, displayName: event.target.value })}
              fullWidth
              required
              size="small"
              sx={userFieldSx}
            />
            {!editingUserId && (
              <TextField
                label="初始密码"
                type="password"
                placeholder="不填则使用默认密码"
                value={userForm.password}
                onChange={(event) => setUserForm({ ...userForm, password: event.target.value })}
                fullWidth
                size="small"
                sx={userFieldSx}
              />
            )}
            <TextField
              label="邮箱"
              value={userForm.email}
              onChange={(event) => setUserForm({ ...userForm, email: event.target.value })}
              fullWidth
              size="small"
              error={emailFormatError}
              helperText={emailFormatError ? '请输入正确的邮箱地址' : undefined}
              sx={userFieldSx}
            />
            <TextField
              label="手机号"
              value={userForm.phone}
              onChange={(event) => setUserForm({ ...userForm, phone: event.target.value })}
              fullWidth
              size="small"
              error={phoneFormatError}
              helperText={phoneFormatError ? '请输入正确的手机号' : undefined}
              sx={userFieldSx}
            />
            <TextField
              select
              label="状态"
              value={userForm.status}
              onChange={(event) => setUserForm({ ...userForm, status: event.target.value })}
              fullWidth
              size="small"
              sx={userFieldSx}
              SelectProps={{
                renderValue: (value) => {
                  const meta = getUserStatusMeta(String(value));
                  return <StatusBadge label={meta.label} color={meta.color} />;
                },
              }}
            >
              {Object.entries(USER_STATUS_MAP).map(([value, meta]) => (
                <MenuItem key={value} value={value}>
                  <StatusBadge label={meta.label} color={meta.color} />
                </MenuItem>
              ))}
            </TextField>
            <FormControl fullWidth required size="small" sx={userSelectSx}>
              <InputLabel required>所属组织</InputLabel>
              <Select
                label="所属组织"
                value={userForm.primaryDepartmentId}
                onChange={(event) => setUserForm({ ...userForm, primaryDepartmentId: String(event.target.value) })}
                renderValue={(value) => getDepartmentSelectValueLabel(String(value), departmentPathById)}
              >
                <MenuItem value="">未分配</MenuItem>
                {departmentOptions.map((item) => (
                  <MenuItem key={item.id} value={item.id}>
                    <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                      <Box
                        aria-hidden
                        sx={{
                          width: item.depth * 22,
                          flex: '0 0 auto',
                        }}
                      />
                      <Typography sx={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.name}
                      </Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth required size="small" sx={userSelectSx}>
              <InputLabel required>岗位角色</InputLabel>
              <Select
                label="岗位角色"
                value={userForm.roleIds[0] ?? ''}
                onChange={(event) => setUserForm({
                  ...userForm,
                  roleIds: event.target.value ? [String(event.target.value)] : [],
                })}
              >
                <MenuItem value="">未选择</MenuItem>
                {roles.map((role) => (
                  <MenuItem key={String(role.id)} value={String(role.id)}>{role.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUserDialogOpen(false)}>取消</Button>
          <Button
            variant="contained"
            onClick={handleSaveUser}
            disabled={
              !userForm.username ||
              !userForm.displayName ||
              !userForm.primaryDepartmentId ||
              userForm.roleIds.length === 0 ||
              saveUserMutation.isPending
            }
          >
            保存
          </Button>
        </DialogActions>
      </AppDialog>

      <AppDialog open={resetDialog !== null} onClose={() => setResetDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>重置密码</DialogTitle>
        <DialogContent>
          <Typography sx={{ mt: 1, mb: 1.5, color: '#606266' }}>
            用户：{resetDialog?.username}
          </Typography>
          <TextField
            label="新密码"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            fullWidth
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetDialog(null)}>取消</Button>
          <Button
            variant="contained"
            onClick={() => resetPasswordMutation.mutate()}
            disabled={!newPassword || resetPasswordMutation.isPending}
          >
            确认
          </Button>
        </DialogActions>
      </AppDialog>

      <AppDialog open={removeUserConfirm !== null} onClose={() => setRemoveUserConfirm(null)}>
        <DialogTitle>确认移出人员</DialogTitle>
        <DialogContent>
          确定要将用户 {removeUserConfirm?.username} 移出当前组织架构吗？用户信息、账号和角色会保留，所属组织将变为未分配。
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRemoveUserConfirm(null)}>取消</Button>
          <Button
            variant="contained"
            onClick={() => removeUserMutation.mutate()}
            disabled={removeUserMutation.isPending}
          >
            移出
          </Button>
        </DialogActions>
      </AppDialog>

      <AppDialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{dialogTitle}</DialogTitle>
        <DialogContent>
          {!editingId && (
            <Box
              sx={{
                mt: 1,
                mb: 1,
                p: 1.5,
                border: '1px solid #e4e7ed',
                borderRadius: '5px',
                bgcolor: '#f6f8f9',
              }}
            >
              <Typography sx={{ fontSize: 13, color: '#606266' }}>
                新增层级：{dialogTitle.replace('新增', '')}
              </Typography>
              <Typography sx={{ mt: 0.5, fontSize: 13, color: '#606266' }}>
                上级组织：{dialogParent?.node.name ?? '无（公司主体）'}
              </Typography>
            </Box>
          )}
          <TextField label="名称" fullWidth margin="normal" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'space-between', px: 3, pb: 2 }}>
          <Box>
            {editingId && (
              <Box component="span" title={deleteBlockReason || '删除组织节点'}>
                <Button
                  color="error"
                  variant="outlined"
                  onClick={openDeleteConfirmFromEditDialog}
                  disabled={Boolean(deleteBlockReason)}
                >
                  删除
                </Button>
              </Box>
            )}
          </Box>
          <Stack direction="row" spacing={1.5}>
            <Button onClick={() => setDialogOpen(false)}>取消</Button>
            <Button
              variant="contained"
              onClick={() => saveMutation.mutate({ name: form.name, parentId })}
              disabled={!form.name || saveMutation.isPending}
            >
              保存
            </Button>
          </Stack>
        </DialogActions>
      </AppDialog>

      <AppDialog open={deleteConfirm !== null} onClose={() => setDeleteConfirm(null)}>
        <DialogTitle>确认删除</DialogTitle>
        <DialogContent>确定要删除该组织节点吗？</DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>取消</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm)}
          >
            删除
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
