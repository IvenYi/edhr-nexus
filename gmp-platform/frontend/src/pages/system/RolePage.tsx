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
  Chip,
  CircularProgress,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  FormControlLabel,
  IconButton,
  InputAdornment,
  MenuItem,
  Pagination,
  Popover,
  Radio,
  RadioGroup,
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
  Close,
  Delete,
  DragIndicator,
  Edit,
  ExpandMore,
  FactCheck,
  RestartAlt,
  Search,
  TuneRounded,
  ViewColumnRounded,
} from '@mui/icons-material';
import {
  createRole,
  deleteRole,
  getCurrentUser,
  getPermissions,
  getRolePermissions,
  getRoles,
  getUsers,
  updateRole,
  updateRolePermissions,
} from '@/api/identity';
import { getAuditLogs } from '@/api/audit';
import type { PageResult } from '@/types/common';
import { AUDIT_ACTION_MAP, type SidebarMenu, type SidebarModule, type SidebarSubMenu } from '@/utils/constants';
import { inferPermissionCode, useManagedSidebarModules } from '@/utils/menuManagement';

interface Role {
  id: string;
  code: string;
  name: string;
  description?: string;
  isBuiltin?: boolean;
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
}

interface Permission {
  id: number;
  code: string;
  name: string;
  type: 'PAGE' | 'BUTTON' | string;
  parentCode?: string | null;
  sortOrder?: number;
}

interface PermissionMenuItem {
  id: string;
  label: string;
  code?: string;
  depth: 1 | 2;
  kind: 'group' | 'item';
  permission?: Permission;
  permissionIds: number[];
  functionPermissions: Permission[];
}

interface PermissionModuleItem {
  id: string;
  label: string;
  permissionIds: number[];
  menus: PermissionMenuItem[];
}

interface RoleAssignedUserApi {
  id: string | number;
  username: string;
  displayName?: string;
  name?: string;
  status?: string;
  roleIds?: Array<string | number>;
}

interface RoleAssignedUser {
  id: string;
  username: string;
  displayName: string;
  status: string;
  roleIds: string[];
}

interface RoleForm {
  name: string;
  description: string;
}

interface RoleFilters {
  name: string;
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

interface RoleAuditRecord {
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

type RoleColumnId = 'name' | 'description' | 'isBuiltin' | 'createdBy' | 'createdAt' | 'updatedBy' | 'updatedAt' | 'actions';
type ConfigurableRoleColumnId = Exclude<RoleColumnId, 'actions'>;

interface RoleColumn {
  id: RoleColumnId;
  label: string;
  defaultWidth: number;
  minWidth: number;
  resizable?: boolean;
  align?: 'left' | 'center' | 'right';
}

type RoleColumnWidths = Partial<Record<RoleColumnId, number>>;

interface RoleColumnSettings {
  version: number;
  order: ConfigurableRoleColumnId[];
  hidden: ConfigurableRoleColumnId[];
}

const PAGE_SIZE = 20;
const ROLE_PAGE_SIZE_OPTIONS = [20, 50, 100, 200] as const;
const ROLE_FETCH_PAGE_SIZE = 200;
const ROLE_PERMISSION_FETCH_SIZE = 2000;
const ROLE_COLUMN_WIDTH_STORAGE_PREFIX = 'role-management-column-widths:';
const ROLE_COLUMN_SETTINGS_STORAGE_PREFIX = 'role-management-column-settings:';
const ROLE_COLUMN_SETTINGS_VERSION = 3;
const ROLE_FIELD_COLUMN_MIN_WIDTH = 80;
const ROLE_ACTION_COLUMN_WIDTH = 128;
const TABLE_DATA_ROW_HEIGHT = 40;
const ROLE_QUERY_BUTTON_SX = { height: 40, width: 80, minWidth: 80 };
const ROLE_DATA_SCOPE_STORAGE_PREFIX = 'role-management-data-scope:';

const ROLE_DATA_SCOPE_OPTIONS = [
  { value: 'ALL', label: '全部数据', description: '可查看该菜单下全部业务数据' },
  { value: 'ORG_AND_CHILDREN', label: '本组织及下级', description: '可查看所属组织及下级组织数据' },
  { value: 'ORG_ONLY', label: '本组织', description: '仅可查看所属组织数据' },
  { value: 'SELF', label: '仅本人', description: '仅可查看本人创建或负责的数据' },
  { value: 'CUSTOM', label: '自定义', description: '预留按组织、产线、业务对象配置' },
] as const;

const emptyForm: RoleForm = {
  name: '',
  description: '',
};

const emptyFilters: RoleFilters = {
  name: '',
};

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

const roleManagementWorkspaceHeight = { xs: 'auto', lg: 'calc(100vh - 150px)' };

const appContentDrawerSx = {
  top: 0,
  zIndex: (theme: { zIndex: { drawer: number } }) => theme.zIndex.drawer + 2,
};

const appContentDrawerPaperSx = {
  ...appContentDrawerSx,
  borderLeft: '1px solid #e4e7ed',
};

const roleColumns: RoleColumn[] = [
  { id: 'name', label: '岗位角色', defaultWidth: 160, minWidth: ROLE_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'description', label: '描述', defaultWidth: 260, minWidth: ROLE_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'isBuiltin', label: '是否内置', defaultWidth: 100, minWidth: ROLE_FIELD_COLUMN_MIN_WIDTH, resizable: true, align: 'center' },
  { id: 'createdBy', label: '创建人', defaultWidth: 120, minWidth: ROLE_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'createdAt', label: '创建时间', defaultWidth: 150, minWidth: ROLE_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'updatedBy', label: '更新人', defaultWidth: 120, minWidth: ROLE_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'updatedAt', label: '更新时间', defaultWidth: 150, minWidth: ROLE_FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'actions', label: '操作', defaultWidth: ROLE_ACTION_COLUMN_WIDTH, minWidth: ROLE_ACTION_COLUMN_WIDTH, resizable: false },
];

const roleAuditFieldLabelMap: Record<string, string> = {
  code: '岗位编码',
  name: '岗位角色',
  description: '描述',
  isBuiltin: '是否内置',
  permissionIds: '菜单权限',
  createdBy: '创建人',
  createdAt: '创建时间',
  updatedBy: '更新人',
  updatedAt: '更新时间',
};

const roleAuditFieldOrder = ['code', 'name', 'description', 'isBuiltin', 'permissionIds'];
const hiddenRoleAuditFields = new Set(['code']);

function isConfigurableRoleColumn(column: RoleColumn): column is RoleColumn & { id: ConfigurableRoleColumnId } {
  return column.id !== 'actions';
}

function isConfigurableRoleColumnId(value: unknown): value is ConfigurableRoleColumnId {
  return typeof value === 'string' && roleColumns.some((column) => column.id === value && isConfigurableRoleColumn(column));
}

function getConfigurableRoleColumnIds(): ConfigurableRoleColumnId[] {
  return roleColumns.filter(isConfigurableRoleColumn).map((column) => column.id);
}

function includesText(value: unknown, keyword: string): boolean {
  return String(value ?? '').toLowerCase().includes(keyword.trim().toLowerCase());
}

function toDisplayId(value: unknown): string {
  return value === undefined || value === null ? '' : String(value);
}

function formatDateTime(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (num: number) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getApiErrorMessage(error: unknown, fallback: string): string {
  const maybeError = error as {
    response?: { data?: { message?: string; error?: string } };
    message?: string;
  };
  return maybeError.response?.data?.message || maybeError.response?.data?.error || maybeError.message || fallback;
}

function isSystemAdministratorRole(role: Role | null | undefined): boolean {
  return role?.code?.toUpperCase() === 'ADMIN' || role?.name === '系统管理员';
}

function isBuiltinRole(role: Role | null | undefined): boolean {
  return Boolean(role?.isBuiltin) || isSystemAdministratorRole(role);
}

function getRoleCreatedBy(role: Role): string {
  return role.createdBy || '系统管理员';
}

function getRoleUpdatedBy(role: Role): string {
  return role.updatedBy || role.createdBy || '系统管理员';
}

function getRoleUpdatedAt(role: Role): string | undefined {
  return role.updatedAt || role.createdAt;
}

function getAuditActionLabel(action?: string): string {
  if (!action) return '操作';
  return AUDIT_ACTION_MAP[action as keyof typeof AUDIT_ACTION_MAP]?.label || action;
}

function getOperatorName(value?: string): string {
  return value?.trim() || '系统记录';
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
  return roleAuditFieldLabelMap[field] ?? field;
}

function getAuditFieldOrderIndex(field: string): number {
  const index = roleAuditFieldOrder.indexOf(field);
  return index === -1 ? roleAuditFieldOrder.length : index;
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

function getAuditScalarDisplayValue(field: string, trimmed: string): string {
  if (field === 'isBuiltin') {
    if (trimmed === 'true') return '是';
    if (trimmed === 'false') return '否';
  }
  return trimmed;
}

function getPermissionAuditDisplayName(value: unknown, permissionNameById: ReadonlyMap<number, string>): string {
  const normalized = normalizeAuditValue(value);
  if (normalized === undefined || normalized === null) return '-';

  const trimmed = String(normalized).trim();
  if (!trimmed || trimmed === 'undefined') return '-';

  const permissionId = Number(trimmed);
  if (!Number.isFinite(permissionId)) return trimmed;

  return permissionNameById.get(permissionId) ?? `未知权限(${trimmed})`;
}

function formatPermissionAuditValue(value: unknown, permissionNameById: ReadonlyMap<number, string>): string {
  const normalized = normalizeAuditValue(value);
  if (normalized === undefined || normalized === null) return '-';

  const items = Array.isArray(normalized) ? normalized : [normalized];
  const displayNames = items
    .map((item) => getPermissionAuditDisplayName(item, permissionNameById))
    .filter((item) => item !== '-');

  return displayNames.length > 0 ? displayNames.join('、') : '-';
}

function getAuditDisplayValue(field: string, value: unknown, permissionNameById: ReadonlyMap<number, string> = new Map()): string {
  const normalized = normalizeAuditValue(value);
  if (normalized === undefined || normalized === null) return '-';

  if (field === 'permissionIds') {
    return formatPermissionAuditValue(normalized, permissionNameById);
  }

  if (typeof normalized === 'string') {
    const trimmed = normalized.trim();
    if (!trimmed || trimmed === 'undefined') return '-';
    return getAuditScalarDisplayValue(field, trimmed);
  }

  if (typeof normalized === 'boolean') {
    return normalized ? '是' : '否';
  }

  if (Array.isArray(normalized)) {
    if (normalized.length === 0) return '-';
    return normalized.map((item) => getAuditDisplayValue(field, item, permissionNameById)).join('、');
  }

  if (typeof normalized === 'number') {
    return getAuditScalarDisplayValue(field, String(normalized));
  }

  if (typeof normalized === 'object') {
    const entries = Object.entries(normalized as Record<string, unknown>);
    if (entries.length === 0) return '-';
    return entries
      .map(([nestedField, fieldValue]) => `${getAuditFieldLabel(nestedField)}:${getAuditDisplayValue(nestedField, fieldValue, permissionNameById)}`)
      .join('；');
  }

  return String(normalized);
}

function formatAuditFieldRows(value: unknown, permissionNameById: ReadonlyMap<number, string>): AuditFieldRow[] {
  const normalized = normalizeAuditValue(value);
  if (normalized === undefined || normalized === null || normalized === '') return [];

  if (typeof normalized === 'object' && !Array.isArray(normalized)) {
    return sortAuditFieldRows(Object.entries(normalized as Record<string, unknown>)
      .filter(([field]) => !hiddenRoleAuditFields.has(field))).map(([field, fieldValue]) => ({
      key: field,
      label: getAuditFieldLabel(field),
      value: getAuditDisplayValue(field, fieldValue, permissionNameById),
    }));
  }

  return [{ key: 'content', label: '内容', value: getAuditDisplayValue('content', normalized, permissionNameById) }];
}

function isAuditEventForRole(item: AuditEvent, role: Role): boolean {
  const entityType = String(item.entityType ?? '').toLowerCase();
  return entityType.includes('role') && String(item.entityId ?? '') === String(role.id);
}

function getRoleAuditRecords(
  selectedRole: Role | null,
  auditEvents: AuditEvent[],
  permissionNameById: ReadonlyMap<number, string>,
): RoleAuditRecord[] {
  if (!selectedRole) return [];

  return auditEvents
    .filter((item) => isAuditEventForRole(item, selectedRole))
    .map((item) => ({
      id: String(item.id),
      operatorName: getOperatorName(item.operatorName),
      actionLabel: getAuditActionLabel(item.action),
      operatedAt: item.createdAt,
      beforeFields: formatAuditFieldRows(item.contentBefore, permissionNameById),
      afterFields: formatAuditFieldRows(item.contentAfter ?? item.detail ?? item.reason, permissionNameById),
    }));
}

function collectSidebarMenuItems(
  menu: SidebarMenu,
  permissionByCode: Map<string, Permission>,
  childrenByCode: Map<string, Permission[]>,
  index: number,
): PermissionMenuItem[] {
  if (menu.children?.length) {
    const childItems = menu.children.map((child, childIndex) => (
      buildSidebarSubMenuItem(menu, child, permissionByCode, childrenByCode, childIndex)
    ));
    const permissionIds = childItems.flatMap((item) => item.permissionIds);
    return [
      {
        id: `group:${menu.label}:${index}`,
        label: menu.label,
        depth: 1,
        kind: 'group',
        permissionIds,
        functionPermissions: [],
      },
      ...childItems,
    ];
  }

  if (!menu.path) return [];
  return [buildSidebarPathMenuItem(menu.label, menu.path, permissionByCode, childrenByCode, 1, `item:${menu.path}`)];
}

function buildSidebarSubMenuItem(
  parentMenu: SidebarMenu,
  child: SidebarSubMenu,
  permissionByCode: Map<string, Permission>,
  childrenByCode: Map<string, Permission[]>,
  index: number,
): PermissionMenuItem {
  return buildSidebarPathMenuItem(
    child.label,
    child.path,
    permissionByCode,
    childrenByCode,
    2,
    `item:${parentMenu.label}:${child.path}:${index}`,
  );
}

function buildSidebarPathMenuItem(
  label: string,
  path: string,
  permissionByCode: Map<string, Permission>,
  childrenByCode: Map<string, Permission[]>,
  depth: 1 | 2,
  id: string,
): PermissionMenuItem {
  const code = inferPermissionCode(path);
  const permission = code ? permissionByCode.get(code) : undefined;
  const functionPermissions = permission
    ? (childrenByCode.get(permission.code) ?? []).filter((item) => item.type !== 'PAGE')
    : [];
  return {
    id,
    label,
    code,
    depth,
    kind: 'item',
    permission,
    permissionIds: [
      ...(permission ? [permission.id] : []),
      ...functionPermissions.map((item) => item.id),
    ],
    functionPermissions,
  };
}

function buildPermissionModulesFromSidebar(
  sidebarModules: SidebarModule[],
  permissions: Permission[],
  childrenByCode: Map<string, Permission[]>,
): PermissionModuleItem[] {
  const permissionByCode = new Map(permissions.map((permission) => [permission.code, permission]));
  return sidebarModules.map((module) => {
    const menus = module.menus.flatMap((menu, index) => collectSidebarMenuItems(menu, permissionByCode, childrenByCode, index));
    return {
      id: module.id,
      label: module.label,
      menus,
      permissionIds: Array.from(new Set(menus.flatMap((menu) => menu.permissionIds))),
    };
  });
}

function getRolePreferenceStorageKey(prefix: string): string {
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

function getRoleColumnWidthStorageKey(): string {
  return getRolePreferenceStorageKey(ROLE_COLUMN_WIDTH_STORAGE_PREFIX);
}

function getRoleColumnSettingsStorageKey(): string {
  return getRolePreferenceStorageKey(ROLE_COLUMN_SETTINGS_STORAGE_PREFIX);
}

function getRoleDataScopeStorageKey(roleId: string): string {
  return getRolePreferenceStorageKey(`${ROLE_DATA_SCOPE_STORAGE_PREFIX}${roleId}:`);
}

function loadRoleDataScopes(roleId: string): Record<string, string> {
  if (typeof window === 'undefined') return {};

  try {
    const raw = localStorage.getItem(getRoleDataScopeStorageKey(roleId));
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed as Record<string, string> : {};
  } catch {
    return {};
  }
}

function saveRoleDataScopes(roleId: string, scopes: Record<string, string>) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(getRoleDataScopeStorageKey(roleId), JSON.stringify(scopes));
}

async function refreshCurrentLoginUserPermissions() {
  if (typeof window === 'undefined') return;
  try {
    const res = await getCurrentUser({ skipAuthRedirect: true });
    const refreshedUser = res.data.data;
    localStorage.setItem('user', JSON.stringify(refreshedUser));
    window.dispatchEvent(new CustomEvent('edhr:auth-user-change'));
  } catch (error) {
    console.warn('刷新当前登录用户权限失败', error);
  }
}

function loadRoleColumnWidths(storageKey: string): RoleColumnWidths {
  if (typeof window === 'undefined') return {};

  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return roleColumns.reduce<RoleColumnWidths>((result, column) => {
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

function normalizeRoleColumnSettings(value: unknown): RoleColumnSettings {
  const defaults = getConfigurableRoleColumnIds();
  const defaultSettings = { version: ROLE_COLUMN_SETTINGS_VERSION, order: defaults, hidden: [] };
  const parsed = value as { version?: unknown; order?: unknown[]; hidden?: unknown[] } | null | undefined;
  if (parsed?.version !== ROLE_COLUMN_SETTINGS_VERSION) {
    return defaultSettings;
  }
  const seen = new Set<ConfigurableRoleColumnId>();
  const storedOrder = Array.isArray(parsed?.order) ? parsed.order : [];
  const order = [
    ...storedOrder.filter((id): id is ConfigurableRoleColumnId => {
      if (!isConfigurableRoleColumnId(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    }),
    ...defaults.filter((id) => !seen.has(id)),
  ];
  const hidden = Array.from(new Set(
    (Array.isArray(parsed?.hidden) ? parsed.hidden : [])
      .filter((id): id is ConfigurableRoleColumnId => isConfigurableRoleColumnId(id) && order.includes(id)),
  ));

  if (hidden.length >= order.length && order.length > 0) {
    return { version: ROLE_COLUMN_SETTINGS_VERSION, order, hidden: hidden.filter((id) => id !== order[0]) };
  }

  return { version: ROLE_COLUMN_SETTINGS_VERSION, order, hidden };
}

function loadRoleColumnSettings(storageKey: string): RoleColumnSettings {
  if (typeof window === 'undefined') return normalizeRoleColumnSettings(null);

  try {
    const raw = localStorage.getItem(storageKey);
    return normalizeRoleColumnSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeRoleColumnSettings(null);
  }
}

function getColumnSettingsItems(settings: RoleColumnSettings): Array<RoleColumn & { id: ConfigurableRoleColumnId }> {
  const columnsById = new Map(roleColumns.filter(isConfigurableRoleColumn).map((column) => [column.id, column]));
  return settings.order
    .map((id) => columnsById.get(id))
    .filter((column): column is RoleColumn & { id: ConfigurableRoleColumnId } => Boolean(column));
}

function getVisibleRoleColumns(settings: RoleColumnSettings): RoleColumn[] {
  const actionColumn = roleColumns.find((column) => column.id === 'actions');
  const visibleDataColumns = getColumnSettingsItems(settings).filter((column) => !settings.hidden.includes(column.id));
  return [...visibleDataColumns, actionColumn].filter((column): column is RoleColumn => Boolean(column));
}

function resolveRoleColumnWidths(
  columnWidths: RoleColumnWidths,
  tableContainerWidth: number,
  visibleColumns: RoleColumn[] = roleColumns,
): Record<RoleColumnId, number> {
  const resolved = roleColumns.reduce<Record<RoleColumnId, number>>((result, column) => {
    const persistedWidth = column.resizable ? columnWidths[column.id] : undefined;
    result[column.id] = Math.max(column.minWidth, persistedWidth ?? column.defaultWidth);
    return result;
  }, {} as Record<RoleColumnId, number>);

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

function getStickyActionColumnSx(column: RoleColumn, section: 'head' | 'body') {
  if (column.id !== 'actions') return {};

  return {
    position: 'sticky',
    right: 0,
    zIndex: section === 'head' ? 6 : 4,
    bgcolor: section === 'head' ? '#f5f7fa' : '#fff',
  };
}

async function fetchAllRoles(): Promise<Role[]> {
  const result: Role[] = [];
  let pageIndex = 1;
  let totalPages = 1;

  do {
    const res = await getRoles({
      page: pageIndex,
      size: ROLE_FETCH_PAGE_SIZE,
      sort: 'createdAt',
      order: 'desc',
    });
    const body = res.data.data as PageResult<Role>;
    result.push(...(body.content ?? []));
    totalPages = Math.max(body.totalPages ?? 1, 1);
    pageIndex += 1;
  } while (pageIndex <= totalPages);

  return result;
}

async function fetchAllRoleAssignedUsers(): Promise<RoleAssignedUser[]> {
  const result: RoleAssignedUser[] = [];
  let pageIndex = 1;
  let totalPages = 1;

  do {
    const res = await getUsers({
      page: pageIndex,
      size: ROLE_FETCH_PAGE_SIZE,
      sort: 'createdAt',
      order: 'desc',
    });
    const body = res.data.data as PageResult<RoleAssignedUserApi>;
    result.push(...(body.content ?? []).map((item) => ({
      id: toDisplayId(item.id),
      username: item.username,
      displayName: item.displayName || item.name || item.username,
      status: item.status || 'ACTIVE',
      roleIds: (item.roleIds ?? []).map(toDisplayId).filter(Boolean),
    })));
    totalPages = Math.max(body.totalPages ?? 1, 1);
    pageIndex += 1;
  } while (pageIndex <= totalPages);

  return result;
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box sx={{ border: '1px solid #e4e7ed', borderRadius: 1, bgcolor: '#fff', overflow: 'hidden' }}>
      <Box sx={{ px: 1.5, py: 1, borderBottom: '1px solid #e4e7ed', bgcolor: '#f5f7fa' }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#303133' }}>{title}</Typography>
      </Box>
      <Box sx={{ p: 1.5 }}>
        {children}
      </Box>
    </Box>
  );
}

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" sx={{ display: 'block', color: '#909399', mb: 0.25 }}>
        {label}
      </Typography>
      <Typography component="div" variant="body2" sx={{ color: '#303133', minHeight: 22, overflowWrap: 'anywhere' }}>
        {children}
      </Typography>
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
      <Stack spacing={0.5} sx={{ maxHeight: 240, overflow: 'auto', color: '#303133', lineHeight: 1.65, wordBreak: 'break-word' }}>
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

export default function RolePage() {
  const queryClient = useQueryClient();
  const sidebarModules = useManagedSidebarModules();
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(PAGE_SIZE);
  const [filters, setFilters] = useState<RoleFilters>(emptyFilters);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RoleForm>(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<Role | null>(null);
  const [permissionDialogOpen, setPermissionDialogOpen] = useState(false);
  const [permissionTargetRole, setPermissionTargetRole] = useState<Role | null>(null);
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<Set<number>>(new Set());
  const [selectedPermissionModuleCode, setSelectedPermissionModuleCode] = useState<string | null>(null);
  const [selectedPermissionMenuCode, setSelectedPermissionMenuCode] = useState<string | null>(null);
  const [selectedDataScopeByMenu, setSelectedDataScopeByMenu] = useState<Record<string, string>>({});
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [roleDrawerOpen, setRoleDrawerOpen] = useState(false);
  const [roleDrawerTab, setRoleDrawerTab] = useState(0);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const [tableContainerWidth, setTableContainerWidth] = useState(0);
  const [tableScrollbarWidth, setTableScrollbarWidth] = useState(0);
  const [columnWidthStorageKey] = useState(getRoleColumnWidthStorageKey);
  const [columnSettingsStorageKey] = useState(getRoleColumnSettingsStorageKey);
  const [columnWidths, setColumnWidths] = useState<RoleColumnWidths>(() => loadRoleColumnWidths(columnWidthStorageKey));
  const [columnSettings, setColumnSettings] = useState<RoleColumnSettings>(() => loadRoleColumnSettings(columnSettingsStorageKey));
  const [columnSettingsAnchorEl, setColumnSettingsAnchorEl] = useState<HTMLButtonElement | null>(null);
  const [draggingColumnId, setDraggingColumnId] = useState<ConfigurableRoleColumnId | null>(null);
  const columnSettingDragSourceRef = useRef<ConfigurableRoleColumnId | null>(null);

  const { data: rolesData, isLoading, isError } = useQuery({
    queryKey: ['roles', 'role-management-all'],
    queryFn: fetchAllRoles,
  });

  const {
    data: roleAssignedUsersData,
    isLoading: roleAssignedUsersLoading,
    isError: roleAssignedUsersError,
  } = useQuery({
    queryKey: ['role-management-users'],
    queryFn: fetchAllRoleAssignedUsers,
  });

  const { data: permissionData, isLoading: permissionsQueryLoading } = useQuery({
    queryKey: ['permissions-all'],
    queryFn: async () => {
      const res = await getPermissions({ page: 1, size: ROLE_PERMISSION_FETCH_SIZE, sort: 'sortOrder', order: 'asc' });
      const body = res.data.data as PageResult<Permission>;
      return body.content ?? [];
    },
  });

  const roles = rolesData ?? [];
  const roleAssignedUsers = roleAssignedUsersData ?? [];
  const permissions = permissionData ?? [];
  const deleteConfirmAssignedUsers = useMemo(() => {
    if (!deleteConfirm) return [];
    return roleAssignedUsers.filter((user) => user.roleIds.includes(deleteConfirm.id));
  }, [deleteConfirm, roleAssignedUsers]);
  const permissionNameById = useMemo(() => {
    const map = new Map<number, string>();
    permissions.forEach((permission) => {
      const permissionId = Number(permission.id);
      if (!Number.isFinite(permissionId)) return;

      const displayName = permission.name?.trim() || permission.code?.trim() || String(permission.id);
      map.set(permissionId, displayName);
    });
    return map;
  }, [permissions]);
  const childrenByCode = useMemo(() => {
    const map = new Map<string, Permission[]>();
    permissions.forEach((permission) => {
      if (!permission.parentCode) return;
      map.set(permission.parentCode, [...(map.get(permission.parentCode) ?? []), permission]);
    });
    for (const [key, value] of map) {
      map.set(key, value.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name, 'zh-Hans-CN')));
    }
    return map;
  }, [permissions]);
  const permissionModules = useMemo(
    () => buildPermissionModulesFromSidebar(sidebarModules, permissions, childrenByCode),
    [childrenByCode, permissions, sidebarModules],
  );
  const selectedPermissionModule = useMemo(
    () => permissionModules.find((module) => module.id === selectedPermissionModuleCode) ?? permissionModules[0] ?? null,
    [permissionModules, selectedPermissionModuleCode],
  );
  const menuPermissionsForSelectedModule = selectedPermissionModule?.menus ?? [];
  const selectedPermissionMenu = useMemo(
    () => menuPermissionsForSelectedModule.find((menu) => menu.id === selectedPermissionMenuCode)
      ?? menuPermissionsForSelectedModule.find((menu) => menu.kind === 'item')
      ?? menuPermissionsForSelectedModule[0]
      ?? null,
    [menuPermissionsForSelectedModule, selectedPermissionMenuCode],
  );
  const functionPermissionsForSelectedMenu = selectedPermissionMenu?.functionPermissions ?? [];

  const filteredRows = useMemo(() => roles.filter((role) => (
    includesText(role.name, filters.name)
  )), [filters, roles]);
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));
  const currentPage = Math.min(page, pageCount);
  const pagedRows = filteredRows.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);
  const isRoleTableEmptyState = isLoading || isError || pagedRows.length === 0;
  const columnSettingsItems = useMemo(() => getColumnSettingsItems(columnSettings), [columnSettings]);
  const visibleRoleColumns = useMemo(() => getVisibleRoleColumns(columnSettings), [columnSettings]);
  const visibleConfigurableRoleColumnCount = columnSettings.order.length - columnSettings.hidden.length;
  const resolvedColumnWidths = useMemo(
    () => resolveRoleColumnWidths(columnWidths, tableContainerWidth, visibleRoleColumns),
    [columnWidths, tableContainerWidth, visibleRoleColumns],
  );
  const totalTableWidth = visibleRoleColumns.reduce((sum, column) => sum + resolvedColumnWidths[column.id], 0);
  const roleFormValidationError = !form.name.trim()
      ? '请输入岗位角色'
      : '';

  const { data: auditEventsData } = useQuery({
    queryKey: ['role-management-audit-logs', selectedRole?.id],
    enabled: Boolean(selectedRole?.id),
    queryFn: async () => {
      const res = await getAuditLogs({
        page: 1,
        size: 100,
        sort: 'createdAt',
        order: 'desc',
        entityType: 'ROLE',
        entityId: selectedRole?.id,
      });
      const body = res.data.data as PageResult<AuditEvent>;
      return body.content ?? [];
    },
  });

  const roleAuditRecords = useMemo(
    () => getRoleAuditRecords(selectedRole, auditEventsData ?? [], permissionNameById),
    [auditEventsData, permissionNameById, selectedRole],
  );

  useEffect(() => {
    setPage(1);
  }, [filters, rowsPerPage]);

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

  useEffect(() => {
    if (!permissionDialogOpen || permissionModules.length === 0) return;
    if (!selectedPermissionModuleCode || !permissionModules.some((module) => module.id === selectedPermissionModuleCode)) {
      setSelectedPermissionModuleCode(permissionModules[0].id);
    }
  }, [permissionDialogOpen, permissionModules, selectedPermissionModuleCode]);

  useEffect(() => {
    if (!permissionDialogOpen) return;
    if (menuPermissionsForSelectedModule.length === 0) {
      setSelectedPermissionMenuCode(null);
      return;
    }
    const firstSelectableMenu = menuPermissionsForSelectedModule.find((menu) => menu.kind === 'item') ?? menuPermissionsForSelectedModule[0];
    if (!selectedPermissionMenuCode || !menuPermissionsForSelectedModule.some((menu) => menu.id === selectedPermissionMenuCode)) {
      setSelectedPermissionMenuCode(firstSelectableMenu.id);
    }
  }, [menuPermissionsForSelectedModule, permissionDialogOpen, selectedPermissionMenuCode]);

  const showSnackbar = (message: string, severity: 'success' | 'error') => {
    setSnackbar({ open: true, message, severity });
  };

  const handleSnackbarClose = (_event?: SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') return;
    setSnackbar((current) => ({ ...current, open: false }));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
      };
      return editingId ? updateRole(editingId, body) : createRole(body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      queryClient.invalidateQueries({ queryKey: ['roles-all'] });
      queryClient.invalidateQueries({ queryKey: ['role-management-audit-logs'] });
      setRoleDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      showSnackbar('保存成功', 'success');
    },
    onError: (error) => showSnackbar(getApiErrorMessage(error, '保存失败'), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteRole(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      queryClient.invalidateQueries({ queryKey: ['roles-all'] });
      queryClient.invalidateQueries({ queryKey: ['role-management-users'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['users', 'user-management-all'] });
      setDeleteConfirm(null);
      showSnackbar('删除成功', 'success');
    },
    onError: (error) => showSnackbar(getApiErrorMessage(error, '删除失败'), 'error'),
  });

  const savePermissionMutation = useMutation({
    mutationFn: async () => {
      if (!permissionTargetRole) throw new Error('missing role');
      await updateRolePermissions(permissionTargetRole.id, { permissionIds: [...selectedPermissionIds] });
      saveRoleDataScopes(permissionTargetRole.id, selectedDataScopeByMenu);
      await refreshCurrentLoginUserPermissions();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      setPermissionDialogOpen(false);
      setPermissionTargetRole(null);
      setSelectedPermissionIds(new Set());
      setSelectedPermissionModuleCode(null);
      setSelectedPermissionMenuCode(null);
      setSelectedDataScopeByMenu({});
      showSnackbar('菜单权限保存成功', 'success');
    },
    onError: (error) => showSnackbar(getApiErrorMessage(error, '菜单权限保存失败'), 'error'),
  });

  const openCreateDialog = () => {
    setEditingId(null);
    setForm(emptyForm);
    setRoleDialogOpen(true);
  };

  const openEditDialog = (row: Role) => {
    setEditingId(row.id);
    setForm({
      name: row.name,
      description: row.description ?? '',
    });
    setRoleDialogOpen(true);
  };

  const openPermissionDialog = async (row: Role) => {
    setPermissionTargetRole(row);
    setSelectedPermissionIds(new Set());
    setSelectedPermissionModuleCode(permissionModules[0]?.id ?? null);
    setSelectedPermissionMenuCode(null);
    setSelectedDataScopeByMenu(loadRoleDataScopes(row.id));
    setPermissionDialogOpen(true);
    setPermissionsLoading(true);
    try {
      const res = await getRolePermissions(row.id);
      const ids = (res.data.data as Array<number | string>).map((id) => Number(id)).filter((id) => Number.isFinite(id));
      setSelectedPermissionIds(new Set(ids));
    } catch (error) {
      showSnackbar(getApiErrorMessage(error, '菜单权限加载失败'), 'error');
    } finally {
      setPermissionsLoading(false);
    }
  };

  const openRoleDetailDrawer = (row: Role) => {
    setSelectedRole(row);
    setRoleDrawerTab(0);
    setRoleDrawerOpen(true);
  };

  const closeRoleDetailDrawer = () => {
    setRoleDrawerOpen(false);
  };

  const openDeleteConfirm = async (row: Role) => {
    if (isBuiltinRole(row)) {
      showSnackbar('系统管理员角色不允许删除', 'error');
      return;
    }
    try {
      const users = await queryClient.fetchQuery({ queryKey: ['role-management-users'], queryFn: fetchAllRoleAssignedUsers });
      const assignedUsers = users.filter((user) => user.roleIds.includes(row.id));
      if (assignedUsers.length === 0) {
        deleteMutation.mutate(row.id);
        return;
      }
      setDeleteConfirm(row);
    } catch (error) {
      showSnackbar(getApiErrorMessage(error, '受影响账号检查失败，请刷新后重试'), 'error');
    }
  };

  const handleSaveRole = () => {
    if (roleFormValidationError) {
      showSnackbar(roleFormValidationError, 'error');
      return;
    }
    saveMutation.mutate();
  };

  const resetFilters = () => {
    setFilters(emptyFilters);
  };

  const getColumnWidth = (column: RoleColumn) => resolvedColumnWidths[column.id];

  const beginColumnResize = (event: MouseEvent<HTMLDivElement>, columnId: RoleColumnId) => {
    const column = roleColumns.find((item) => item.id === columnId);
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

  const moveRoleColumnSetting = (
    sourceId: ConfigurableRoleColumnId,
    targetId: ConfigurableRoleColumnId,
    placement: 'before' | 'after' = 'before',
  ) => {
    if (sourceId === targetId) return;

    setColumnSettings((current) => {
      const nextOrder = current.order.filter((id) => id !== sourceId);
      const targetIndex = nextOrder.indexOf(targetId);
      if (targetIndex === -1) return current;
      nextOrder.splice(targetIndex + (placement === 'after' ? 1 : 0), 0, sourceId);
      return normalizeRoleColumnSettings({ ...current, order: nextOrder });
    });
  };

  const toggleRoleColumnVisibility = (columnId: ConfigurableRoleColumnId) => {
    setColumnSettings((current) => {
      const isHidden = current.hidden.includes(columnId);
      if (!isHidden && visibleConfigurableRoleColumnCount <= 1) return current;
      const hidden = isHidden
        ? current.hidden.filter((id) => id !== columnId)
        : [...current.hidden, columnId];
      return normalizeRoleColumnSettings({ ...current, hidden });
    });
  };

  const handleColumnSettingDragStart = (event: ReactDragEvent<HTMLDivElement>, columnId: ConfigurableRoleColumnId) => {
    setDraggingColumnId(columnId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', columnId);
  };

  const handleColumnSettingDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleColumnSettingDrop = (event: ReactDragEvent<HTMLDivElement>, columnId: ConfigurableRoleColumnId) => {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData('text/plain') || draggingColumnId;
    if (isConfigurableRoleColumnId(sourceId)) {
      moveRoleColumnSetting(sourceId, columnId, getColumnSettingDropPlacement(event.clientY, event.currentTarget));
    }
    setDraggingColumnId(null);
  };

  const handleColumnSettingDragEnd = () => {
    setDraggingColumnId(null);
  };

  const beginColumnSettingPointerDrag = (event: ReactPointerEvent<HTMLDivElement>, columnId: ConfigurableRoleColumnId) => {
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
        ?.closest<HTMLElement>('[data-role-column-settings-row]');
      if (!targetRow) return;
      const targetId = targetRow.dataset.columnId;
      const sourceId = columnSettingDragSourceRef.current;
      if (sourceId && isConfigurableRoleColumnId(targetId) && targetId !== sourceId) {
        moveRoleColumnSetting(sourceId, targetId, getColumnSettingDropPlacement(moveEvent.clientY, targetRow));
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

  const getPermissionSelectionState = (permissionIds: number[]) => {
    const uniqueIds = Array.from(new Set(permissionIds));
    const checkedCount = uniqueIds.filter((id) => selectedPermissionIds.has(id)).length;
    return {
      checked: uniqueIds.length > 0 && checkedCount === uniqueIds.length,
      indeterminate: checkedCount > 0 && checkedCount < uniqueIds.length,
    };
  };

  const togglePermissionIds = (permissionIds: number[]) => {
    const ids = Array.from(new Set(permissionIds));
    setSelectedPermissionIds((current) => {
      const next = new Set(current);
      const shouldSelect = !ids.every((id) => next.has(id));
      ids.forEach((id) => {
        if (shouldSelect) next.add(id);
        else next.delete(id);
      });
      return next;
    });
  };

  const updateSelectedMenuDataScope = (scope: string) => {
    if (!selectedPermissionMenu) return;
    setSelectedDataScopeByMenu((current) => ({
      ...current,
      [selectedPermissionMenu.code ?? selectedPermissionMenu.id]: scope,
    }));
  };

  const renderRoleCell = (row: Role, column: RoleColumn) => {
    const cellSx = {
      width: getColumnWidth(column),
      minWidth: column.minWidth,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      ...getStickyActionColumnSx(column, 'body'),
    };

    if (column.id === 'actions') {
      return (
        <TableCell key={column.id} align="center" sx={cellSx}>
          <Stack direction="row" spacing={0} justifyContent="center" onClick={(event) => event.stopPropagation()}>
            <Tooltip title="编辑" arrow>
              <IconButton size="small" aria-label="编辑" onClick={() => openEditDialog(row)}>
                <Edit fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="菜单权限设置" arrow>
              <IconButton size="small" aria-label="菜单权限设置" onClick={() => openPermissionDialog(row)}>
                <FactCheck fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={isBuiltinRole(row) ? '系统管理员角色不允许删除' : '删除'} arrow>
              <span>
                <IconButton
                  size="small"
                  color="error"
                  aria-label="删除"
                  disabled={isBuiltinRole(row)}
                  onClick={() => openDeleteConfirm(row)}
                >
                  <Delete fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        </TableCell>
      );
    }

    if (column.id === 'name') {
      return <TableCell key={column.id} sx={cellSx} title={row.name}>{row.name || '-'}</TableCell>;
    }

    if (column.id === 'description') {
      return <TableCell key={column.id} sx={cellSx} title={row.description || '-'}>{row.description || '-'}</TableCell>;
    }

    if (column.id === 'isBuiltin') {
      const builtin = isBuiltinRole(row);
      return (
        <TableCell key={column.id} align="center" sx={cellSx}>
          <Chip
            label={builtin ? '是' : '否'}
            size="small"
            color={builtin ? 'primary' : 'default'}
            variant="outlined"
            sx={{ height: 24 }}
          />
        </TableCell>
      );
    }

    if (column.id === 'createdBy') {
      return <TableCell key={column.id} sx={cellSx}>{getRoleCreatedBy(row)}</TableCell>;
    }

    if (column.id === 'createdAt') {
      return <TableCell key={column.id} sx={cellSx}>{formatDateTime(row.createdAt)}</TableCell>;
    }

    if (column.id === 'updatedBy') {
      return <TableCell key={column.id} sx={cellSx}>{getRoleUpdatedBy(row)}</TableCell>;
    }

    if (column.id === 'updatedAt') {
      return <TableCell key={column.id} sx={cellSx}>{formatDateTime(getRoleUpdatedAt(row))}</TableCell>;
    }

    return <TableCell key={column.id} sx={cellSx}>-</TableCell>;
  };

  return (
    <Box sx={{ height: roleManagementWorkspaceHeight, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden' }}>
      <Box
        sx={{
          bgcolor: '#fff',
          border: '1px solid #e4e7ed',
          borderRadius: 1,
          px: 2.5,
          py: 2,
          flex: '0 0 auto',
        }}
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'minmax(180px, 240px) 1fr' },
            gap: 1.5,
            alignItems: 'center',
          }}
        >
          <TextField
            label="岗位角色"
            placeholder="请输入"
            value={filters.name}
            onChange={(event) => setFilters((current) => ({ ...current, name: event.target.value }))}
            size="small"
            sx={fieldSx}
          />
          <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="flex-end">
            <Button size="small" sx={ROLE_QUERY_BUTTON_SX} variant="outlined" startIcon={<RestartAlt />} onClick={resetFilters}>重置</Button>
            <Button size="small" sx={ROLE_QUERY_BUTTON_SX} variant="contained" startIcon={<Search />} onClick={() => setPage(1)}>查询</Button>
          </Stack>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, width: '100%', maxWidth: '100%', minWidth: 0, minHeight: 0, bgcolor: '#fff', border: '1px solid #e4e7ed', borderRadius: 1, overflow: 'hidden' }}>
        <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="center" sx={{ minHeight: 48, px: 2, borderBottom: '1px solid #e4e7ed' }}>
          <Tooltip title="字段设置" arrow>
            <IconButton
              data-role-column-settings-trigger
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
          <Button size="small" variant="contained" startIcon={<Add />} onClick={openCreateDialog}>新增</Button>
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
          <Stack data-role-column-settings-panel spacing={0.5} sx={{ p: 1.5 }}>
            {columnSettingsItems.map((column) => {
              const checked = !columnSettings.hidden.includes(column.id);
              const disabled = checked && visibleConfigurableRoleColumnCount <= 1;
              return (
                <Box
                  key={column.id}
                  data-role-column-settings-row
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
                    '&:hover': { bgcolor: '#f5f7fa' },
                  }}
                >
                  <DragIndicator fontSize="small" sx={{ color: '#909399' }} />
                  <Checkbox
                    size="small"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggleRoleColumnVisibility(column.id)}
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
            <Table stickyHeader size="small" sx={{ tableLayout: 'fixed', width: totalTableWidth, minWidth: totalTableWidth, height: isRoleTableEmptyState ? '100%' : 'auto' }}>
              <colgroup>
                {visibleRoleColumns.map((column) => (
                  <col key={column.id} style={{ width: getColumnWidth(column) }} />
                ))}
              </colgroup>
              <TableHead>
                <TableRow sx={{ '& .MuiTableCell-root': tableHeaderCellSx }}>
                  {visibleRoleColumns.map((column) => (
                    <TableCell
                      key={column.id}
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
                      {column.label}
                      {column.resizable ? (
                        <Box
                          data-role-column-resizer
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
                            '&:hover': { bgcolor: '#d1e9ff' },
                            '&:hover::after': { bgcolor: '#1890ff' },
                          }}
                        />
                      ) : null}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody sx={{ height: isRoleTableEmptyState ? '100%' : 'auto' }}>
                {isLoading ? (
                  <TableRow sx={emptyTableRowSx}>
                    <TableStateCell colSpan={visibleRoleColumns.length} align="center" sx={emptyTableBodyCellSx}>
                      <CircularProgress size={24} />
                    </TableStateCell>
                  </TableRow>
                ) : isError ? (
                  <TableRow sx={emptyTableRowSx}>
                    <TableStateCell colSpan={visibleRoleColumns.length} align="center" sx={emptyTableBodyCellSx}>
                      加载失败
                    </TableStateCell>
                  </TableRow>
                ) : pagedRows.length === 0 ? (
                  <TableRow sx={emptyTableRowSx}>
                    <TableStateCell colSpan={visibleRoleColumns.length} align="center" sx={emptyTableBodyCellSx}>
                      暂无数据
                    </TableStateCell>
                  </TableRow>
                ) : pagedRows.map((row) => (
                  <TableRow
                    key={row.id}
                    hover
                    onClick={() => openRoleDetailDrawer(row)}
                    sx={{ cursor: 'pointer', '& .MuiTableCell-root': tableBodyCellSx }}
                  >
                    {visibleRoleColumns.map((column) => renderRoleCell(row, column))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Box
            data-role-action-column-shadow
            sx={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              right: tableScrollbarWidth,
              width: ROLE_ACTION_COLUMN_WIDTH,
              boxShadow: '-6px 0 8px -8px rgba(0, 0, 0, 0.35)',
              pointerEvents: 'none',
              zIndex: 7,
            }}
          />
        </Box>

        <Box
          sx={{
            minHeight: 56,
            px: 2,
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
              size="small"
              sx={{ width: 120, ...fieldSx }}
              onChange={(event) => setRowsPerPage(Number(event.target.value))}
              InputProps={{
                startAdornment: <InputAdornment position="start" sx={{ mr: 0 }}>每页</InputAdornment>,
              }}
            >
              {ROLE_PAGE_SIZE_OPTIONS.map((size) => (
                <MenuItem key={size} value={size}>{size}</MenuItem>
              ))}
            </TextField>
          </Stack>
        </Box>
      </Box>

      <Drawer anchor="right" open={roleDrawerOpen} onClose={closeRoleDetailDrawer} sx={appContentDrawerSx} slotProps={{ backdrop: { sx: appContentDrawerSx } }} PaperProps={{ sx: appContentDrawerPaperSx }}>
        <Box sx={{ width: { xs: '100vw', sm: 560 }, p: 2, bgcolor: '#f7f9fc', minHeight: '100%' }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#303133' }}>
              信息查看
            </Typography>
            <IconButton size="small" onClick={closeRoleDetailDrawer} aria-label="关闭详情">
              <Close />
            </IconButton>
          </Stack>

          {!selectedRole ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              请选择一个岗位角色查看详情。
            </Typography>
          ) : (
            <>
              <Box sx={{ mt: 1, borderBottom: '1px solid #e4e7ed' }}>
                <Tabs
                  value={roleDrawerTab}
                  onChange={(_, value: number) => setRoleDrawerTab(value)}
                  aria-label="岗位角色详情切换"
                >
                  <Tab label="数据信息" />
                  <Tab label="数据审计" />
                </Tabs>
              </Box>

              {roleDrawerTab === 0 ? (
                <Stack spacing={2} sx={{ mt: 2 }}>
                  <DetailSection title="基本信息">
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
                      <DetailField label="岗位角色">{selectedRole.name}</DetailField>
                      <DetailField label="描述">{selectedRole.description || '-'}</DetailField>
                      <DetailField label="系统内置">
                        <Chip
                          label={isBuiltinRole(selectedRole) ? '是' : '否'}
                          size="small"
                          color={isBuiltinRole(selectedRole) ? 'primary' : 'default'}
                          variant="outlined"
                        />
                      </DetailField>
                    </Box>
                  </DetailSection>

                  <DetailSection title="系统信息">
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
                      <DetailField label="创建人">{getRoleCreatedBy(selectedRole)}</DetailField>
                      <DetailField label="创建时间">{formatDateTime(selectedRole.createdAt)}</DetailField>
                      <DetailField label="更新人">{getRoleUpdatedBy(selectedRole)}</DetailField>
                      <DetailField label="更新时间">{formatDateTime(getRoleUpdatedAt(selectedRole))}</DetailField>
                    </Box>
                  </DetailSection>
                </Stack>
              ) : null}

              {roleDrawerTab === 1 ? (
                <Stack spacing={2} sx={{ mt: 2 }}>
                  <DetailSection title="审计记录">
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.35fr 32px', columnGap: 1, px: 1.5, pb: 1, color: '#606266' }}>
                      <Typography variant="caption" sx={{ fontWeight: 600 }}>操作人</Typography>
                      <Typography variant="caption" sx={{ fontWeight: 600 }}>操作动作</Typography>
                      <Typography variant="caption" sx={{ fontWeight: 600 }}>操作时间</Typography>
                      <Box aria-hidden />
                    </Box>

                    <Stack spacing={1}>
                      {roleAuditRecords.length === 0 ? (
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
                      ) : roleAuditRecords.map((record, index) => (
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
                  </DetailSection>
                </Stack>
              ) : null}
            </>
          )}
        </Box>
      </Drawer>

      <AppDialog open={roleDialogOpen} onClose={() => setRoleDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingId ? '编辑岗位角色' : '新增岗位角色'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.5} sx={{ pt: 0.5 }}>
            <TextField
              label="岗位角色"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              fullWidth
              required
              size="small"
              sx={fieldSx}
            />
            <TextField
              label="描述"
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              fullWidth
              multiline
              minRows={3}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRoleDialogOpen(false)}>取消</Button>
          <Button variant="contained" onClick={handleSaveRole} disabled={saveMutation.isPending}>
            保存
          </Button>
        </DialogActions>
      </AppDialog>

      <AppDialog hideCloseButton open={permissionDialogOpen} onClose={() => setPermissionDialogOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>菜单权限设置</Typography>
              <Typography variant="caption" sx={{ color: '#909399' }}>
                {permissionTargetRole ? permissionTargetRole.name : '请选择岗位角色'}
              </Typography>
            </Box>
            <IconButton size="small" aria-label="关闭" onClick={() => setPermissionDialogOpen(false)}>
              <Close fontSize="small" />
            </IconButton>
          </Stack>
        </DialogTitle>
        <DialogContent dividers sx={{ bgcolor: '#f7f9fc' }}>
          {permissionsLoading || permissionsQueryLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={24} /></Box>
          ) : permissionModules.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4, color: '#909399' }}>暂无权限数据</Box>
          ) : (
            <Box
              data-role-permission-designer
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: '240px 280px minmax(0, 1fr)' },
                gap: 1.5,
                minHeight: 520,
              }}
            >
              <DetailSection title="模块权限">
                <Stack spacing={0.5}>
                  {permissionModules.map((modulePermission) => {
                    const selected = selectedPermissionModule?.id === modulePermission.id;
                    const { checked, indeterminate } = getPermissionSelectionState(modulePermission.permissionIds);
                    return (
                      <Box
                        key={modulePermission.id}
                        data-role-permission-module
                        onClick={() => {
                          setSelectedPermissionModuleCode(modulePermission.id);
                          setSelectedPermissionMenuCode(null);
                        }}
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: '34px minmax(0, 1fr)',
                          alignItems: 'center',
                          minHeight: 40,
                          borderRadius: 1,
                          cursor: 'pointer',
                          border: selected ? '1px solid #91d5ff' : '1px solid transparent',
                          bgcolor: selected ? '#e8f4ff' : 'transparent',
                          '&:hover': { bgcolor: selected ? '#e8f4ff' : '#f5f7fa' },
                        }}
                      >
                        <Checkbox
                          size="small"
                          checked={checked}
                          indeterminate={indeterminate}
                          onClick={(event) => event.stopPropagation()}
                          onChange={() => togglePermissionIds(modulePermission.permissionIds)}
                          inputProps={{ 'aria-label': `${modulePermission.label}模块权限` }}
                        />
                        <Typography sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: selected ? 700 : 500 }}>
                          {modulePermission.label}
                        </Typography>
                      </Box>
                    );
                  })}
                </Stack>
              </DetailSection>

              <DetailSection title="菜单权限">
                {!selectedPermissionModule ? (
                  <Typography variant="body2" sx={{ color: '#909399', textAlign: 'center', py: 4 }}>请选择模块</Typography>
                ) : menuPermissionsForSelectedModule.length === 0 ? (
                  <Typography variant="body2" sx={{ color: '#909399', textAlign: 'center', py: 4 }}>暂无菜单权限</Typography>
                ) : (
                  <Stack spacing={0.5}>
                    {menuPermissionsForSelectedModule.map((menuPermission) => {
                      const selected = selectedPermissionMenu?.id === menuPermission.id;
                      const { checked, indeterminate } = getPermissionSelectionState(menuPermission.permissionIds);
                      return (
                        <Box
                          key={menuPermission.id}
                          data-role-permission-menu
                          onClick={() => {
                            if (menuPermission.kind === 'item') setSelectedPermissionMenuCode(menuPermission.id);
                          }}
                          sx={{
                            display: 'grid',
                            gridTemplateColumns: '34px minmax(0, 1fr) auto',
                            alignItems: 'center',
                            minHeight: 40,
                            borderRadius: 1,
                            cursor: menuPermission.kind === 'item' ? 'pointer' : 'default',
                            border: selected ? '1px solid #91d5ff' : '1px solid transparent',
                            bgcolor: selected ? '#e8f4ff' : 'transparent',
                            pl: menuPermission.depth === 2 ? 2 : 0,
                            '&:hover': { bgcolor: selected ? '#e8f4ff' : '#f5f7fa' },
                          }}
                        >
                          <Checkbox
                            size="small"
                            checked={checked}
                            indeterminate={indeterminate}
                            onClick={(event) => event.stopPropagation()}
                            onChange={() => togglePermissionIds(menuPermission.permissionIds)}
                            inputProps={{ 'aria-label': `${menuPermission.label}菜单权限` }}
                          />
                          <Typography sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: selected ? 700 : 500 }}>
                            {menuPermission.label}
                          </Typography>
                          <Chip
                            label={menuPermission.kind === 'group' ? '分组' : (menuPermission.permission ? '菜单' : '未映射')}
                            size="small"
                            variant="outlined"
                            sx={{
                              height: 24,
                              color: menuPermission.permission ? '#1890ff' : '#909399',
                              borderColor: menuPermission.permission ? '#91d5ff' : '#dcdfe6',
                            }}
                          />
                        </Box>
                      );
                    })}
                  </Stack>
                )}
              </DetailSection>

              <Stack spacing={1.5} sx={{ minWidth: 0 }}>
                <DetailSection title="功能权限">
                  {!selectedPermissionMenu ? (
                    <Typography variant="body2" sx={{ color: '#909399', textAlign: 'center', py: 4 }}>请选择菜单</Typography>
                  ) : functionPermissionsForSelectedMenu.length === 0 ? (
                    <Typography variant="body2" sx={{ color: '#909399', textAlign: 'center', py: 4 }}>暂无功能权限</Typography>
                  ) : (
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
                      {functionPermissionsForSelectedMenu.map((functionPermission) => {
                        const checked = selectedPermissionIds.has(functionPermission.id);
                        return (
                          <Box
                            key={functionPermission.id}
                            data-role-function-permission
                            sx={{
                              display: 'grid',
                              gridTemplateColumns: '34px minmax(0, 1fr)',
                              alignItems: 'center',
                              minHeight: 38,
                              border: '1px solid #e4e7ed',
                              borderRadius: 1,
                              bgcolor: '#fff',
                            }}
                          >
                            <Checkbox
                              size="small"
                              checked={checked}
                              onChange={() => togglePermissionIds([functionPermission.id])}
                              inputProps={{ 'aria-label': `${functionPermission.name}功能权限` }}
                            />
                            <Typography sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {functionPermission.name}
                            </Typography>
                          </Box>
                        );
                      })}
                    </Box>
                  )}
                </DetailSection>

                <DetailSection title="数据权限">
                  {!selectedPermissionMenu ? (
                    <Typography variant="body2" sx={{ color: '#909399', textAlign: 'center', py: 4 }}>请选择菜单</Typography>
                  ) : (
                    <Stack spacing={1}>
                      <Typography variant="body2" sx={{ color: '#606266' }}>
                        当前菜单：{selectedPermissionMenu.label}
                      </Typography>
                      <RadioGroup
                        value={selectedDataScopeByMenu[selectedPermissionMenu.code ?? selectedPermissionMenu.id] ?? 'ORG_AND_CHILDREN'}
                        onChange={(event) => updateSelectedMenuDataScope(event.target.value)}
                      >
                        {ROLE_DATA_SCOPE_OPTIONS.map((option) => (
                          <FormControlLabel
                            key={option.value}
                            value={option.value}
                            control={<Radio size="small" />}
                            label={(
                              <Box sx={{ py: 0.25 }}>
                                <Typography variant="body2" sx={{ color: '#303133' }}>{option.label}</Typography>
                                <Typography variant="caption" sx={{ color: '#909399' }}>{option.description}</Typography>
                              </Box>
                            )}
                          />
                        ))}
                      </RadioGroup>
                    </Stack>
                  )}
                </DetailSection>
              </Stack>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPermissionDialogOpen(false)}>取消</Button>
          <Button
            variant="contained"
            onClick={() => savePermissionMutation.mutate()}
            disabled={!permissionTargetRole || permissionsLoading || savePermissionMutation.isPending}
          >
            保存权限
          </Button>
        </DialogActions>
      </AppDialog>

      <AppDialog open={deleteConfirm !== null} onClose={() => setDeleteConfirm(null)} maxWidth="sm" fullWidth>
        <DialogTitle>确认删除岗位角色</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.5}>
            <Alert severity="error">危险的操作，请仔细阅读并确认数据后操作</Alert>
            <Typography variant="body2">
              本次将删除岗位角色“{deleteConfirm?.name}”。当前有以下账号还挂载了该岗位角色，确认后这些账号在用户管理中岗位角色将置空，并且账户状态会变成禁用，请确认数据无误后再操作。
            </Typography>
            <Typography variant="body2" sx={{ color: '#606266' }}>
              删除后该岗位关联的菜单权限也会同步移除。
            </Typography>
            <Box
              data-role-delete-impacted-users
              sx={{ maxHeight: 180, overflow: 'auto', border: '1px solid #e4e7ed', borderRadius: 1, bgcolor: '#f8fafc' }}
            >
              {roleAssignedUsersLoading ? (
                <Box sx={{ px: 1.5, py: 1 }}>
                  <Typography variant="body2" sx={{ color: '#909399' }}>正在检查受影响账号...</Typography>
                </Box>
              ) : roleAssignedUsersError ? (
                <Box sx={{ px: 1.5, py: 1 }}>
                  <Typography variant="body2" sx={{ color: '#f56c6c' }}>受影响账号检查失败，请刷新后重试。</Typography>
                </Box>
              ) : deleteConfirmAssignedUsers.length === 0 ? (
                <Box sx={{ px: 1.5, py: 1 }}>
                  <Typography variant="body2" sx={{ color: '#909399' }}>暂无账号挂载该岗位角色。</Typography>
                </Box>
              ) : deleteConfirmAssignedUsers.map((user) => (
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
          <Button onClick={() => setDeleteConfirm(null)}>取消</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)}
            disabled={deleteMutation.isPending || roleAssignedUsersLoading || roleAssignedUsersError}
          >
            确认删除
          </Button>
        </DialogActions>
      </AppDialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert severity={snackbar.severity} onClose={handleSnackbarClose} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
