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
  RestartAlt,
  Search,
  TuneRounded,
  ViewColumnRounded,
} from '@mui/icons-material';
import {
  createBusinessDictionary,
  createBusinessDictionaryItem,
  deleteBusinessDictionary,
  deleteBusinessDictionaryItem,
  getBusinessDictionaries,
  getBusinessDictionaryItems,
  reorderBusinessDictionaryItems,
  updateBusinessDictionary,
  updateBusinessDictionaryItem,
  type BusinessDictionaryItemRecord,
  type BusinessDictionaryRecord,
} from '@/api/system';
import { getAuditLogs, type AuditLogItem } from '@/api/audit';
import StatusBadge from '@/components/StatusBadge';
import type { PageResult } from '@/types/common';

type DictionaryColumnId = 'name' | 'code' | 'itemCount' | 'status' | 'createdBy' | 'createdAt' | 'updatedBy' | 'updatedAt' | 'actions';
type DictionaryItemColumnId = 'label' | 'value' | 'sortOrder' | 'status' | 'createdBy' | 'createdAt' | 'updatedBy' | 'updatedAt' | 'actions';
type ConfigurableDictionaryColumnId = Exclude<DictionaryColumnId, 'actions'>;
type ConfigurableDictionaryItemColumnId = Exclude<DictionaryItemColumnId, 'actions'>;
type ColumnId = DictionaryColumnId | DictionaryItemColumnId;

interface TableColumn<T extends string> {
  id: T;
  label: string;
  defaultWidth: number;
  minWidth: number;
  resizable?: boolean;
  align?: 'left' | 'center' | 'right';
}

interface ColumnSettings<T extends string> {
  version: number;
  order: T[];
  hidden: T[];
}

interface DictionaryFilters {
  keyword: string;
  status: string;
}

interface ItemFilters {
  keyword: string;
  status: string;
}

interface DictionaryForm {
  code: string;
  name: string;
  description: string;
  status: string;
  sortOrder: string;
}

interface ItemForm {
  value: string;
  label: string;
  sortOrder: string;
  status: string;
  remark: string;
}

interface AuditFieldRow {
  label: string;
  value: string;
}

interface AuditRecord {
  id: string;
  operatorName: string;
  actionLabel: string;
  operatedAt?: string;
  beforeFields: AuditFieldRow[];
  afterFields: AuditFieldRow[];
}

type DetailTarget =
  | { type: 'dictionary'; data: BusinessDictionaryRecord }
  | { type: 'item'; data: BusinessDictionaryItemRecord };

const PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [20, 50, 100, 200] as const;
const TABLE_DATA_ROW_HEIGHT = 40;
const FIELD_COLUMN_MIN_WIDTH = 80;
const ACTION_COLUMN_WIDTH = 96;
const BUSINESS_DICTIONARY_COLUMN_WIDTH_STORAGE_PREFIX = 'business-dictionary-column-widths:';
const BUSINESS_DICTIONARY_COLUMN_SETTINGS_STORAGE_PREFIX = 'business-dictionary-column-settings:';
const BUSINESS_DICTIONARY_ITEM_COLUMN_WIDTH_STORAGE_PREFIX = 'business-dictionary-item-column-widths:';
const BUSINESS_DICTIONARY_ITEM_COLUMN_SETTINGS_STORAGE_PREFIX = 'business-dictionary-item-column-settings:';
const COLUMN_SETTINGS_VERSION = 1;
const QUERY_BUTTON_SX = { height: 40, width: 80, minWidth: 80 };

const dictionaryColumns: Array<TableColumn<DictionaryColumnId>> = [
  { id: 'name', label: '字典名称', defaultWidth: 160, minWidth: FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'code', label: '字典编码', defaultWidth: 170, minWidth: FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'itemCount', label: '字典项数', defaultWidth: 100, minWidth: FIELD_COLUMN_MIN_WIDTH, resizable: true, align: 'right' },
  { id: 'status', label: '状态', defaultWidth: 96, minWidth: FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'createdBy', label: '创建人', defaultWidth: 120, minWidth: FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'createdAt', label: '创建时间', defaultWidth: 160, minWidth: 130, resizable: true },
  { id: 'updatedBy', label: '更新人', defaultWidth: 120, minWidth: FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'updatedAt', label: '更新时间', defaultWidth: 160, minWidth: 130, resizable: true },
  { id: 'actions', label: '操作', defaultWidth: ACTION_COLUMN_WIDTH, minWidth: ACTION_COLUMN_WIDTH, align: 'center' },
];

const itemColumns: Array<TableColumn<DictionaryItemColumnId>> = [
  { id: 'label', label: '字典项名称', defaultWidth: 160, minWidth: FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'value', label: '字典项值', defaultWidth: 160, minWidth: FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'sortOrder', label: '排序', defaultWidth: 88, minWidth: FIELD_COLUMN_MIN_WIDTH, resizable: true, align: 'right' },
  { id: 'status', label: '状态', defaultWidth: 96, minWidth: FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'createdBy', label: '创建人', defaultWidth: 120, minWidth: FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'createdAt', label: '创建时间', defaultWidth: 160, minWidth: 130, resizable: true },
  { id: 'updatedBy', label: '更新人', defaultWidth: 120, minWidth: FIELD_COLUMN_MIN_WIDTH, resizable: true },
  { id: 'updatedAt', label: '更新时间', defaultWidth: 160, minWidth: 130, resizable: true },
  { id: 'actions', label: '操作', defaultWidth: ACTION_COLUMN_WIDTH, minWidth: ACTION_COLUMN_WIDTH, align: 'center' },
];

const emptyDictionaryFilters: DictionaryFilters = { keyword: '', status: 'ALL' };
const emptyItemFilters: ItemFilters = { keyword: '', status: 'ALL' };
const emptyDictionaryForm: DictionaryForm = { code: '', name: '', description: '', status: 'ACTIVE', sortOrder: '0' };
const emptyItemForm: ItemForm = { value: '', label: '', sortOrder: '0', status: 'ACTIVE', remark: '' };

const statusOptions = [
  { value: 'ALL', label: '全部' },
  { value: 'ACTIVE', label: '启用' },
  { value: 'DISABLED', label: '禁用' },
] as const;

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
};

const emptyTableBodyCellSx = {
  height: '100%',
  py: 0,
  borderBottom: '1px solid #ebeef5',
  color: '#909399',
};

const emptyTableRowSx = { height: '100%' };

const appContentDrawerSx = {
  top: 0,
  bottom: 0,
  zIndex: (theme: { zIndex: { drawer: number } }) => theme.zIndex.drawer + 3,
};

const appContentDrawerPaperSx = {
  zIndex: (theme: { zIndex: { drawer: number } }) => theme.zIndex.drawer + 3,
  height: 'auto',
  transform: 'none !important',
  transition: 'none !important',
};

const dictionaryAuditFieldLabels: Record<string, string> = {
  code: '字典编码',
  name: '字典名称',
  description: '描述',
  status: '状态',
  statusLabel: '状态',
  sortOrder: '排序',
  builtin: '是否内置',
  createdBy: '创建人',
  createdAt: '创建时间',
  updatedBy: '更新人',
  updatedAt: '更新时间',
  value: '字典项值',
  label: '字典项名称',
  remark: '备注',
  dictionaryName: '所属字典',
  dictionaryCode: '所属字典编码',
};

const actionLabelMap: Record<string, string> = {
  CREATE: '新增',
  UPDATE: '编辑',
  DELETE: '删除',
  REORDER: '排序调整',
};

function formatDateTime(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.replace('T', ' ').slice(0, 16);
  const pad = (input: number) => String(input).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getStatusLabel(status?: string) {
  if (status === 'ACTIVE') return '启用';
  if (status === 'DISABLED') return '禁用';
  return status || '-';
}

function getStatusColor(status?: string): 'success' | 'error' | 'default' {
  if (status === 'ACTIVE') return 'success';
  if (status === 'DISABLED') return 'error';
  return 'default';
}

function readText(value: unknown) {
  return value === undefined || value === null || value === '' ? '-' : String(value);
}

function getApiErrorMessage(error: unknown, fallback = '操作失败') {
  if (typeof error === 'object' && error !== null) {
    const response = (error as { response?: { data?: { message?: string } } }).response;
    if (response?.data?.message) return response.data.message;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

function getCurrentUserPreferenceStorageKey(prefix: string) {
  if (typeof window === 'undefined') return `${prefix}anonymous`;
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null') as { id?: string | number; username?: string; displayName?: string } | null;
    return `${prefix}${String(user?.id ?? user?.username ?? user?.displayName ?? 'anonymous')}`;
  } catch {
    return `${prefix}anonymous`;
  }
}

function isConfigurableColumn<T extends string>(column: TableColumn<T>): column is TableColumn<Exclude<T, 'actions'>> {
  return column.id !== 'actions';
}

function normalizeColumnSettings<T extends string>(columns: Array<TableColumn<T>>, raw?: Partial<ColumnSettings<Exclude<T, 'actions'>>> | null): ColumnSettings<Exclude<T, 'actions'>> {
  const defaults = columns.filter(isConfigurableColumn).map((column) => column.id);
  if (!raw || raw.version !== COLUMN_SETTINGS_VERSION) {
    return { version: COLUMN_SETTINGS_VERSION, order: defaults, hidden: [] };
  }
  const seen = new Set<Exclude<T, 'actions'>>();
  const order = [
    ...(raw.order ?? []).filter((id): id is Exclude<T, 'actions'> => defaults.includes(id) && !seen.has(id) && (seen.add(id), true)),
    ...defaults.filter((id) => !seen.has(id)),
  ];
  const hidden = (raw.hidden ?? []).filter((id): id is Exclude<T, 'actions'> => defaults.includes(id) && order.includes(id));
  return { version: COLUMN_SETTINGS_VERSION, order, hidden: hidden.length >= order.length ? hidden.slice(1) : hidden };
}

function loadColumnSettings<T extends string>(columns: Array<TableColumn<T>>, storageKey: string): ColumnSettings<Exclude<T, 'actions'>> {
  if (typeof window === 'undefined') return normalizeColumnSettings(columns);
  try {
    return normalizeColumnSettings(columns, JSON.parse(localStorage.getItem(storageKey) || 'null'));
  } catch {
    return normalizeColumnSettings(columns);
  }
}

function loadColumnWidths<T extends string>(storageKey: string): Partial<Record<T, number>> {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || '{}');
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function getColumnSettingsItems<T extends string>(columns: Array<TableColumn<T>>, settings: ColumnSettings<Exclude<T, 'actions'>>) {
  const byId = new Map(columns.filter(isConfigurableColumn).map((column) => [column.id, column]));
  return settings.order.map((id) => byId.get(id)).filter((column): column is TableColumn<Exclude<T, 'actions'>> => Boolean(column));
}

function getVisibleColumns<T extends string>(columns: Array<TableColumn<T>>, settings: ColumnSettings<Exclude<T, 'actions'>>) {
  const actionColumn = columns.find((column) => column.id === 'actions');
  const dataColumns = getColumnSettingsItems(columns, settings).filter((column) => !settings.hidden.includes(column.id));
  return [...dataColumns, actionColumn].filter((column): column is TableColumn<T> => Boolean(column));
}

function resolveColumnWidths<T extends string>(widths: Partial<Record<T, number>>, containerWidth: number, visibleColumns: Array<TableColumn<T>>) {
  const result = {} as Record<T, number>;
  let total = 0;
  visibleColumns.forEach((column) => {
    const width = Math.max(column.minWidth, column.id === 'actions' ? column.defaultWidth : widths[column.id] ?? column.defaultWidth);
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

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function formatAuditFieldValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  if (field === 'status' || field === 'statusLabel') return getStatusLabel(String(value));
  if (field === 'builtin') return value === true || value === 'true' ? '是' : '否';
  if (field.endsWith('At') || field.endsWith('Time')) return formatDateTime(String(value));
  if (Array.isArray(value)) return value.map((item) => formatAuditFieldValue(field, item)).join(', ');
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

function toAuditFields(input: unknown): AuditFieldRow[] {
  const value = typeof input === 'string' ? safeJsonParse(input) : input;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>)
    .filter(([field]) => field !== 'id' && field !== 'displayName' && field !== 'dictionaryId')
    .map(([field, fieldValue]) => ({
      label: dictionaryAuditFieldLabels[field] ?? field,
      value: formatAuditFieldValue(field, fieldValue),
    }));
}

function getAuditRecords(events: AuditLogItem[] | undefined): AuditRecord[] {
  return (events ?? []).map((event) => ({
    id: String(event.id),
    operatorName: event.operatorDisplayName || event.operatorAccount || '-',
    actionLabel: event.actionLabel || actionLabelMap[(event.action ?? '').toUpperCase()] || event.action || '-',
    operatedAt: event.operationTime || event.createdAt,
    beforeFields: toAuditFields(event.contentBefore),
    afterFields: toAuditFields(event.contentAfter),
  }));
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box sx={{ bgcolor: '#fff', border: '1px solid #e4e7ed', borderRadius: '4px', overflow: 'hidden' }}>
      <Box sx={{ px: 1.5, py: 1, borderBottom: '1px solid #e4e7ed', bgcolor: '#f8fafc' }}>
        <Typography sx={{ fontWeight: 600, color: '#303133' }}>{title}</Typography>
      </Box>
      <Box sx={{ p: 1.5 }}>{children}</Box>
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

function AuditFieldBlock({ title, fields }: { title: string; fields: AuditFieldRow[] }) {
  return (
    <Box sx={{ border: '1px solid #e4e7ed', borderRadius: '4px', bgcolor: '#f8fafc', p: 1 }}>
      <Typography variant="caption" sx={{ display: 'block', mb: 0.75, color: '#606266', fontWeight: 600 }}>{title}</Typography>
      <Stack spacing={0.75}>
        {fields.length === 0 ? (
          <Typography variant="caption" sx={{ color: '#909399' }}>无</Typography>
        ) : fields.map((field) => (
          <Box key={field.label} sx={{ display: 'grid', gridTemplateColumns: '92px minmax(0, 1fr)', gap: 1 }}>
            <Typography variant="caption" sx={{ color: '#606266' }}>{field.label}</Typography>
            <Typography variant="caption" sx={{ color: '#303133', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{field.value}</Typography>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

function getStickyActionColumnSx(column: TableColumn<string>, layer: 'head' | 'body') {
  if (column.id !== 'actions') return {};
  return {
    position: 'sticky',
    right: 0,
    zIndex: layer === 'head' ? 8 : 4,
    bgcolor: layer === 'head' ? '#f5f7fa' : '#fff',
  };
}

export default function BusinessDictionaryPage() {
  const queryClient = useQueryClient();
  const [dictionaryPage, setDictionaryPage] = useState(1);
  const [itemPage, setItemPage] = useState(1);
  const [dictionaryPageSize, setDictionaryPageSize] = useState(PAGE_SIZE);
  const [itemPageSize, setItemPageSize] = useState(PAGE_SIZE);
  const [dictionaryFilters, setDictionaryFilters] = useState<DictionaryFilters>(emptyDictionaryFilters);
  const [itemFilters, setItemFilters] = useState<ItemFilters>(emptyItemFilters);
  const [selectedDictionaryId, setSelectedDictionaryId] = useState<string>('');
  const [dictionaryDialogOpen, setDictionaryDialogOpen] = useState(false);
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingDictionary, setEditingDictionary] = useState<BusinessDictionaryRecord | null>(null);
  const [editingItem, setEditingItem] = useState<BusinessDictionaryItemRecord | null>(null);
  const [dictionaryForm, setDictionaryForm] = useState<DictionaryForm>(emptyDictionaryForm);
  const [itemForm, setItemForm] = useState<ItemForm>(emptyItemForm);
  const [deleteDictionaryTarget, setDeleteDictionaryTarget] = useState<BusinessDictionaryRecord | null>(null);
  const [deleteItemTarget, setDeleteItemTarget] = useState<BusinessDictionaryItemRecord | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<DetailTarget | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState(0);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });

  const dictionaryTableRef = useRef<HTMLDivElement | null>(null);
  const itemTableRef = useRef<HTMLDivElement | null>(null);
  const [dictionaryTableWidth, setDictionaryTableWidth] = useState(0);
  const [itemTableWidth, setItemTableWidth] = useState(0);
  const [dictionaryScrollbarWidth, setDictionaryScrollbarWidth] = useState(0);
  const [itemScrollbarWidth, setItemScrollbarWidth] = useState(0);
  const dictionaryColumnWidthStorageKey = useMemo(() => getCurrentUserPreferenceStorageKey(BUSINESS_DICTIONARY_COLUMN_WIDTH_STORAGE_PREFIX), []);
  const dictionaryColumnSettingsStorageKey = useMemo(() => getCurrentUserPreferenceStorageKey(BUSINESS_DICTIONARY_COLUMN_SETTINGS_STORAGE_PREFIX), []);
  const itemColumnWidthStorageKey = useMemo(() => getCurrentUserPreferenceStorageKey(BUSINESS_DICTIONARY_ITEM_COLUMN_WIDTH_STORAGE_PREFIX), []);
  const itemColumnSettingsStorageKey = useMemo(() => getCurrentUserPreferenceStorageKey(BUSINESS_DICTIONARY_ITEM_COLUMN_SETTINGS_STORAGE_PREFIX), []);
  const [dictionaryColumnWidths, setDictionaryColumnWidths] = useState<Partial<Record<DictionaryColumnId, number>>>(() => loadColumnWidths(dictionaryColumnWidthStorageKey));
  const [itemColumnWidths, setItemColumnWidths] = useState<Partial<Record<DictionaryItemColumnId, number>>>(() => loadColumnWidths(itemColumnWidthStorageKey));
  const [dictionaryColumnSettings, setDictionaryColumnSettings] = useState<ColumnSettings<ConfigurableDictionaryColumnId>>(() => loadColumnSettings(dictionaryColumns, dictionaryColumnSettingsStorageKey));
  const [itemColumnSettings, setItemColumnSettings] = useState<ColumnSettings<ConfigurableDictionaryItemColumnId>>(() => loadColumnSettings(itemColumns, itemColumnSettingsStorageKey));
  const [dictionarySettingsAnchor, setDictionarySettingsAnchor] = useState<HTMLButtonElement | null>(null);
  const [itemSettingsAnchor, setItemSettingsAnchor] = useState<HTMLButtonElement | null>(null);
  const [draggingColumnId, setDraggingColumnId] = useState<string | null>(null);
  const columnSettingDragSourceRef = useRef<string | null>(null);
  const [draggingItemId, setDraggingItemId] = useState<string>('');

  const showSnackbar = (message: string, severity: 'success' | 'error') => {
    setSnackbar({ open: true, message, severity });
  };

  const handleSnackbarClose = (_event?: SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') return;
    setSnackbar((current) => ({ ...current, open: false }));
  };

  const dictionariesQuery = useQuery({
    queryKey: ['business-dictionaries', dictionaryPage, dictionaryPageSize, dictionaryFilters],
    queryFn: () => getBusinessDictionaries({
      page: dictionaryPage,
      size: dictionaryPageSize,
      keyword: dictionaryFilters.keyword.trim() || undefined,
      status: dictionaryFilters.status === 'ALL' ? undefined : dictionaryFilters.status,
      sort: 'sortOrder',
      order: 'asc',
    }),
  });

  const dictionaries = dictionariesQuery.data?.content ?? [];
  const selectedDictionary = dictionaries.find((dictionary) => String(dictionary.id) === selectedDictionaryId) ?? dictionaries[0];

  useEffect(() => {
    if (!selectedDictionaryId && dictionaries.length > 0) {
      setSelectedDictionaryId(String(dictionaries[0].id));
    } else if (selectedDictionaryId && dictionaries.length > 0 && !dictionaries.some((dictionary) => String(dictionary.id) === selectedDictionaryId)) {
      setSelectedDictionaryId(String(dictionaries[0].id));
    }
  }, [dictionaries, selectedDictionaryId]);

  const itemsQuery = useQuery({
    queryKey: ['business-dictionary-items', selectedDictionary?.id, itemPage, itemPageSize, itemFilters],
    enabled: Boolean(selectedDictionary?.id),
    queryFn: () => getBusinessDictionaryItems(selectedDictionary?.id ?? '', {
      page: itemPage,
      size: itemPageSize,
      keyword: itemFilters.keyword.trim() || undefined,
      status: itemFilters.status === 'ALL' ? undefined : itemFilters.status,
      sort: 'sortOrder',
      order: 'asc',
    }),
  });

  const items = itemsQuery.data?.content ?? [];

  const auditQuery = useQuery({
    queryKey: ['business-dictionary-audit', selectedDetail?.type, selectedDetail?.data.id],
    enabled: Boolean(selectedDetail?.data.id),
    queryFn: async () => {
      const response = await getAuditLogs({
        page: 1,
        size: 100,
        sort: 'createdAt',
        order: 'desc',
        entityType: selectedDetail?.type === 'dictionary' ? 'BUSINESS_DICTIONARY' : 'BUSINESS_DICTIONARY_ITEM',
        entityId: selectedDetail?.data.id,
      });
      return (response.data.data as PageResult<AuditLogItem>).content ?? [];
    },
  });

  const auditRecords = useMemo(() => getAuditRecords(auditQuery.data), [auditQuery.data]);
  const visibleDictionaryColumns = useMemo(() => getVisibleColumns(dictionaryColumns, dictionaryColumnSettings), [dictionaryColumnSettings]);
  const visibleItemColumns = useMemo(() => getVisibleColumns(itemColumns, itemColumnSettings), [itemColumnSettings]);
  const dictionaryColumnSettingsItems = useMemo(() => getColumnSettingsItems(dictionaryColumns, dictionaryColumnSettings), [dictionaryColumnSettings]);
  const itemColumnSettingsItems = useMemo(() => getColumnSettingsItems(itemColumns, itemColumnSettings), [itemColumnSettings]);
  const dictionaryResolvedWidths = useMemo(() => resolveColumnWidths(dictionaryColumnWidths, dictionaryTableWidth, visibleDictionaryColumns), [dictionaryColumnWidths, dictionaryTableWidth, visibleDictionaryColumns]);
  const itemResolvedWidths = useMemo(() => resolveColumnWidths(itemColumnWidths, itemTableWidth, visibleItemColumns), [itemColumnWidths, itemTableWidth, visibleItemColumns]);
  const dictionaryTotalTableWidth = visibleDictionaryColumns.reduce((sum, column) => sum + dictionaryResolvedWidths[column.id], 0);
  const itemTotalTableWidth = visibleItemColumns.reduce((sum, column) => sum + itemResolvedWidths[column.id], 0);
  const dictionaryEmptyState = dictionariesQuery.isLoading || dictionariesQuery.isError || dictionaries.length === 0;
  const itemEmptyState = itemsQuery.isLoading || itemsQuery.isError || items.length === 0;
  const dictionaryPageCount = Math.max(1, dictionariesQuery.data?.totalPages ?? 1);
  const itemPageCount = Math.max(1, itemsQuery.data?.totalPages ?? 1);
  const itemTotalElements = itemsQuery.data?.totalElements ?? 0;
  const canReorderCurrentItems = Boolean(selectedDictionary) && itemTotalElements > 0 && itemTotalElements === items.length;

  useEffect(() => {
    localStorage.setItem(dictionaryColumnWidthStorageKey, JSON.stringify(dictionaryColumnWidths));
  }, [dictionaryColumnWidthStorageKey, dictionaryColumnWidths]);

  useEffect(() => {
    localStorage.setItem(itemColumnWidthStorageKey, JSON.stringify(itemColumnWidths));
  }, [itemColumnWidthStorageKey, itemColumnWidths]);

  useEffect(() => {
    localStorage.setItem(dictionaryColumnSettingsStorageKey, JSON.stringify(dictionaryColumnSettings));
  }, [dictionaryColumnSettingsStorageKey, dictionaryColumnSettings]);

  useEffect(() => {
    localStorage.setItem(itemColumnSettingsStorageKey, JSON.stringify(itemColumnSettings));
  }, [itemColumnSettingsStorageKey, itemColumnSettings]);

  useEffect(() => {
    const observeTable = (node: HTMLDivElement | null, setWidth: (value: number) => void, setScrollbar: (value: number) => void) => {
      if (!node) return undefined;
      const update = () => {
        setWidth(node.clientWidth);
        setScrollbar(Math.max(0, node.offsetWidth - node.clientWidth));
      };
      update();
      const observer = new ResizeObserver(update);
      observer.observe(node);
      return () => observer.disconnect();
    };
    const cleanupDictionary = observeTable(dictionaryTableRef.current, setDictionaryTableWidth, setDictionaryScrollbarWidth);
    const cleanupItem = observeTable(itemTableRef.current, setItemTableWidth, setItemScrollbarWidth);
    return () => {
      cleanupDictionary?.();
      cleanupItem?.();
    };
  }, []);

  const invalidateDictionaries = () => queryClient.invalidateQueries({ queryKey: ['business-dictionaries'] });
  const invalidateItems = () => queryClient.invalidateQueries({ queryKey: ['business-dictionary-items'] });

  const dictionarySaveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        code: dictionaryForm.code.trim().toUpperCase(),
        name: dictionaryForm.name.trim(),
        description: dictionaryForm.description.trim() || undefined,
        status: dictionaryForm.status,
        sortOrder: Number(dictionaryForm.sortOrder || 0),
      };
      return editingDictionary
        ? updateBusinessDictionary(editingDictionary.id, payload)
        : createBusinessDictionary(payload);
    },
    onSuccess: async (saved) => {
      await invalidateDictionaries();
      setSelectedDictionaryId(String(saved.id));
      setDictionaryDialogOpen(false);
      showSnackbar('业务字典已保存', 'success');
    },
    onError: (error) => showSnackbar(getApiErrorMessage(error, '业务字典保存失败'), 'error'),
  });

  const itemSaveMutation = useMutation({
    mutationFn: () => {
      if (!selectedDictionary?.id) throw new Error('请先选择业务字典');
      const payload = {
        value: itemForm.value.trim(),
        label: itemForm.label.trim(),
        sortOrder: Number(itemForm.sortOrder || 0),
        status: itemForm.status,
        remark: itemForm.remark.trim() || undefined,
      };
      return editingItem
        ? updateBusinessDictionaryItem(editingItem.id, payload)
        : createBusinessDictionaryItem(selectedDictionary.id, payload);
    },
    onSuccess: async () => {
      await Promise.all([invalidateItems(), invalidateDictionaries()]);
      setItemDialogOpen(false);
      showSnackbar('字典项已保存', 'success');
    },
    onError: (error) => showSnackbar(getApiErrorMessage(error, '字典项保存失败'), 'error'),
  });

  const deleteDictionaryMutation = useMutation({
    mutationFn: (dictionary: BusinessDictionaryRecord) => deleteBusinessDictionary(dictionary.id),
    onSuccess: async () => {
      setDeleteDictionaryTarget(null);
      setSelectedDictionaryId('');
      await invalidateDictionaries();
      showSnackbar('业务字典已删除', 'success');
    },
    onError: (error) => showSnackbar(getApiErrorMessage(error, '业务字典删除失败'), 'error'),
  });

  const deleteItemMutation = useMutation({
    mutationFn: (item: BusinessDictionaryItemRecord) => deleteBusinessDictionaryItem(item.id),
    onSuccess: async () => {
      setDeleteItemTarget(null);
      await Promise.all([invalidateItems(), invalidateDictionaries()]);
      showSnackbar('字典项已删除', 'success');
    },
    onError: (error) => showSnackbar(getApiErrorMessage(error, '字典项删除失败'), 'error'),
  });

  const reorderItemsMutation = useMutation({
    mutationFn: (ids: Array<string | number>) => {
      if (!selectedDictionary?.id) throw new Error('请先选择业务字典');
      return reorderBusinessDictionaryItems({ dictionaryId: selectedDictionary.id, ids });
    },
    onSuccess: async () => {
      await invalidateItems();
      showSnackbar('字典项排序已保存', 'success');
    },
    onError: (error) => showSnackbar(getApiErrorMessage(error, '字典项排序失败'), 'error'),
  });

  const openDictionaryDialog = (dictionary?: BusinessDictionaryRecord) => {
    setEditingDictionary(dictionary ?? null);
    setDictionaryForm(dictionary ? {
      code: dictionary.code,
      name: dictionary.name,
      description: dictionary.description ?? '',
      status: dictionary.status || 'ACTIVE',
      sortOrder: String(dictionary.sortOrder ?? 0),
    } : emptyDictionaryForm);
    setDictionaryDialogOpen(true);
  };

  const openItemDialog = (item?: BusinessDictionaryItemRecord) => {
    if (!selectedDictionary?.id) {
      showSnackbar('请先选择业务字典', 'error');
      return;
    }
    setEditingItem(item ?? null);
    setItemForm(item ? {
      value: item.value,
      label: item.label,
      sortOrder: String(item.sortOrder ?? 0),
      status: item.status || 'ACTIVE',
      remark: item.remark ?? '',
    } : emptyItemForm);
    setItemDialogOpen(true);
  };

  const openDetailDrawer = (target: DetailTarget) => {
    setSelectedDetail(target);
    setDrawerTab(0);
    setDrawerOpen(true);
  };

  const submitDictionaryForm = () => {
    if (!dictionaryForm.name.trim()) {
      showSnackbar('请填写字典名称', 'error');
      return;
    }
    if (!dictionaryForm.code.trim()) {
      showSnackbar('请填写字典编码', 'error');
      return;
    }
    dictionarySaveMutation.mutate();
  };

  const submitItemForm = () => {
    if (!itemForm.label.trim()) {
      showSnackbar('请填写字典项名称', 'error');
      return;
    }
    if (!itemForm.value.trim()) {
      showSnackbar('请填写字典项值', 'error');
      return;
    }
    itemSaveMutation.mutate();
  };

  const beginColumnResize = <T extends string>(
    event: MouseEvent<HTMLDivElement>,
    column: TableColumn<T>,
    getWidth: (columnId: T) => number,
    setWidths: React.Dispatch<React.SetStateAction<Partial<Record<T, number>>>>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = getWidth(column.id);
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const handleMouseMove = (moveEvent: globalThis.MouseEvent) => {
      const nextWidth = Math.max(column.minWidth, startWidth + moveEvent.clientX - startX);
      setWidths((current) => ({ ...current, [column.id]: nextWidth }));
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

  const handleColumnSettingDragStart = (event: ReactDragEvent<HTMLDivElement>, columnId: string) => {
    columnSettingDragSourceRef.current = columnId;
    setDraggingColumnId(columnId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', columnId);
  };

  const handleColumnSettingDragEnd = () => {
    columnSettingDragSourceRef.current = null;
    setDraggingColumnId(null);
  };

  const moveColumnSetting = <T extends string>(
    sourceId: string | null,
    targetId: T,
    setSettings: React.Dispatch<React.SetStateAction<ColumnSettings<T>>>,
  ) => {
    if (!sourceId || sourceId === targetId) return;
    setSettings((current) => {
      const nextOrder = current.order.filter((id) => id !== sourceId);
      const targetIndex = nextOrder.indexOf(targetId);
      nextOrder.splice(targetIndex < 0 ? nextOrder.length : targetIndex, 0, sourceId as T);
      return { ...current, order: nextOrder };
    });
  };

  const beginColumnSettingPointerDrag = <T extends string>(
    event: ReactPointerEvent<HTMLDivElement>,
    columnId: T,
    rowSelector: string,
    setSettings: React.Dispatch<React.SetStateAction<ColumnSettings<T>>>,
  ) => {
    if (event.button !== 0) return;
    columnSettingDragSourceRef.current = columnId;
    setDraggingColumnId(columnId);
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    const handlePointerMove = (moveEvent: PointerEvent) => {
      const targetRow = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)?.closest(rowSelector) as HTMLElement | null;
      const targetId = targetRow?.dataset.columnId as T | undefined;
      if (targetId) moveColumnSetting(columnSettingDragSourceRef.current, targetId, setSettings);
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

  const toggleColumnVisibility = <T extends string>(columnId: T, setSettings: React.Dispatch<React.SetStateAction<ColumnSettings<T>>>) => {
    setSettings((current) => {
      const hidden = current.hidden.includes(columnId)
        ? current.hidden.filter((id) => id !== columnId)
        : [...current.hidden, columnId];
      if (hidden.length >= current.order.length) return current;
      return { ...current, hidden };
    });
  };

  const handleItemDragStart = (event: ReactDragEvent<HTMLTableRowElement>, itemId: string) => {
    if (!canReorderCurrentItems) {
      event.preventDefault();
      showSnackbar('当前字典项未完整加载，请切换到能显示全部字典项的页大小后再排序', 'error');
      return;
    }
    setDraggingItemId(itemId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', itemId);
  };

  const handleItemDrop = (event: ReactDragEvent<HTMLTableRowElement>, targetId: string) => {
    event.preventDefault();
    if (!canReorderCurrentItems) {
      setDraggingItemId('');
      showSnackbar('当前字典项未完整加载，请切换到能显示全部字典项的页大小后再排序', 'error');
      return;
    }
    const sourceId = draggingItemId || event.dataTransfer.getData('text/plain');
    setDraggingItemId('');
    if (!sourceId || sourceId === targetId) return;
    const ids = items.map((item) => String(item.id));
    const sourceIndex = ids.indexOf(sourceId);
    const targetIndex = ids.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const nextIds = [...ids];
    const [moved] = nextIds.splice(sourceIndex, 1);
    nextIds.splice(targetIndex, 0, moved);
    reorderItemsMutation.mutate(nextIds);
  };

  const renderColumnSettingsPopover = <T extends string>({
    anchor,
    onClose,
    items,
    settings,
    setSettings,
    rowAttr,
  }: {
    anchor: HTMLButtonElement | null;
    onClose: () => void;
    items: Array<TableColumn<T>>;
    settings: ColumnSettings<T>;
    setSettings: React.Dispatch<React.SetStateAction<ColumnSettings<T>>>;
    rowAttr: string;
  }) => (
    <Popover
      open={Boolean(anchor)}
      anchorEl={anchor}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      PaperProps={{ sx: { mt: 1, width: 220, border: '1px solid #e4e7ed', borderRadius: 1, boxShadow: '0 8px 24px rgba(0,0,0,.12)' } }}
    >
      <Stack data-business-dictionary-column-settings-panel spacing={0.5} sx={{ p: 1.5 }}>
        {items.map((column) => {
          const checked = !settings.hidden.includes(column.id);
          const disabled = checked && settings.order.length - settings.hidden.length <= 1;
          return (
            <Box
              key={column.id}
              data-business-dictionary-column-settings-row
              data-column-id={column.id}
              {...{ [rowAttr]: '' }}
              draggable
              onDragStart={(event) => handleColumnSettingDragStart(event, column.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                moveColumnSetting(columnSettingDragSourceRef.current, column.id, setSettings);
              }}
              onDragEnd={handleColumnSettingDragEnd}
              onPointerDown={(event) => beginColumnSettingPointerDrag(event, column.id, `[${rowAttr}]`, setSettings)}
              sx={{ display: 'grid', gridTemplateColumns: '24px 34px minmax(0, 1fr)', alignItems: 'center', minHeight: 40, borderRadius: 1, cursor: 'move', touchAction: 'none', color: checked ? '#1890ff' : '#a8abb2', opacity: draggingColumnId === column.id ? 0.55 : 1, '&:hover': { bgcolor: '#f5f7fa' } }}
            >
              <DragIndicator fontSize="small" sx={{ color: '#909399' }} />
              <input
                aria-label={`${column.label}字段显隐`}
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={() => toggleColumnVisibility(column.id, setSettings)}
                onClick={(event) => event.stopPropagation()}
                style={{ width: 16, height: 16 }}
              />
              <Typography sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{column.label}</Typography>
            </Box>
          );
        })}
      </Stack>
    </Popover>
  );

  const renderFieldSettingsButton = (onClick: (event: MouseEvent<HTMLButtonElement>) => void, testId: string) => (
    <Tooltip title="字段设置" arrow>
      <IconButton
        data-business-dictionary-column-settings-trigger={testId}
        size="small"
        aria-label="字段设置"
        onClick={onClick}
        sx={{ width: 36, height: 36, border: '1px solid #e4e7ed', borderRadius: 1, color: '#606266', bgcolor: '#fff', '&:hover': { color: '#1890ff', bgcolor: '#e8f4ff' } }}
      >
        <Box aria-hidden="true" sx={{ position: 'relative', width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <ViewColumnRounded sx={{ fontSize: 21 }} />
          <TuneRounded sx={{ position: 'absolute', right: -3, bottom: -2, fontSize: 13, p: '1px', borderRadius: '50%', bgcolor: '#fff', boxShadow: '0 0 0 1px #fff' }} />
        </Box>
      </IconButton>
    </Tooltip>
  );

  const renderDictionaryCell = (dictionary: BusinessDictionaryRecord, column: TableColumn<DictionaryColumnId>) => {
    const sx = {
      width: dictionaryResolvedWidths[column.id],
      minWidth: column.minWidth,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      ...getStickyActionColumnSx(column, 'body'),
    };
    if (column.id === 'actions') {
      return (
        <TableCell key={column.id} align="center" sx={sx}>
          <Stack direction="row" spacing={0} justifyContent="center">
            <Tooltip title="编辑" arrow>
              <IconButton size="small" aria-label="编辑" onClick={(event) => { event.stopPropagation(); openDictionaryDialog(dictionary); }}>
                <Edit fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={dictionary.builtin ? '系统内置业务字典不能删除' : '删除'} arrow>
              <span>
                <IconButton size="small" aria-label="删除" color="error" disabled={Boolean(dictionary.builtin)} onClick={(event) => { event.stopPropagation(); setDeleteDictionaryTarget(dictionary); }}>
                  <Delete fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        </TableCell>
      );
    }
    return (
      <TableCell key={column.id} align={column.align} sx={sx} title={getDictionaryDisplayValue(dictionary, column.id)}>
        {column.id === 'status' ? <StatusBadge label={getStatusLabel(dictionary.status)} color={getStatusColor(dictionary.status)} /> : getDictionaryDisplayValue(dictionary, column.id)}
      </TableCell>
    );
  };

  const renderItemCell = (item: BusinessDictionaryItemRecord, column: TableColumn<DictionaryItemColumnId>) => {
    const sx = {
      width: itemResolvedWidths[column.id],
      minWidth: column.minWidth,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      ...getStickyActionColumnSx(column, 'body'),
    };
    if (column.id === 'actions') {
      return (
        <TableCell key={column.id} align="center" sx={sx}>
          <Stack direction="row" spacing={0} justifyContent="center">
            <Tooltip title="编辑" arrow>
              <IconButton size="small" aria-label="编辑" onClick={(event) => { event.stopPropagation(); openItemDialog(item); }}>
                <Edit fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={item.builtin ? '系统内置字典项不能删除' : '删除'} arrow>
              <span>
                <IconButton size="small" aria-label="删除" color="error" disabled={Boolean(item.builtin)} onClick={(event) => { event.stopPropagation(); setDeleteItemTarget(item); }}>
                  <Delete fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        </TableCell>
      );
    }
    return (
      <TableCell key={column.id} align={column.align} sx={sx} title={getItemDisplayValue(item, column.id)}>
        {column.id === 'status' ? <StatusBadge label={getStatusLabel(item.status)} color={getStatusColor(item.status)} /> : getItemDisplayValue(item, column.id)}
      </TableCell>
    );
  };

  function getDictionaryDisplayValue(dictionary: BusinessDictionaryRecord, columnId: DictionaryColumnId) {
    if (columnId === 'status') return getStatusLabel(dictionary.status);
    if (columnId === 'createdAt') return formatDateTime(dictionary.createdAt);
    if (columnId === 'updatedAt') return formatDateTime(dictionary.updatedAt || dictionary.createdAt);
    if (columnId === 'updatedBy') return dictionary.updatedBy || dictionary.createdBy || '-';
    if (columnId === 'itemCount') return String(dictionary.itemCount ?? 0);
    return readText(dictionary[columnId as keyof BusinessDictionaryRecord]);
  }

  function getItemDisplayValue(item: BusinessDictionaryItemRecord, columnId: DictionaryItemColumnId) {
    if (columnId === 'status') return getStatusLabel(item.status);
    if (columnId === 'createdAt') return formatDateTime(item.createdAt);
    if (columnId === 'updatedAt') return formatDateTime(item.updatedAt || item.createdAt);
    if (columnId === 'updatedBy') return item.updatedBy || item.createdBy || '-';
    return readText(item[columnId as keyof BusinessDictionaryItemRecord]);
  }

  const renderTableHeader = <T extends ColumnId>(
    columns: Array<TableColumn<T>>,
    widths: Record<T, number>,
    beginResize: (event: MouseEvent<HTMLDivElement>, column: TableColumn<T>) => void,
  ) => (
    <TableHead>
      <TableRow sx={{ '& .MuiTableCell-root': tableHeaderCellSx }}>
        {columns.map((column) => (
          <TableCell
            key={column.id}
            align={column.align}
            sx={{ width: widths[column.id], minWidth: column.minWidth, position: 'sticky', top: 0, zIndex: 5, userSelect: 'none', ...(column.resizable ? { pr: 2 } : {}), ...getStickyActionColumnSx(column, 'head') }}
          >
            {column.label}
            {column.resizable ? (
              <Box
                data-business-dictionary-column-resizer
                onMouseDown={(event) => beginResize(event, column)}
                sx={{ position: 'absolute', top: 0, right: 0, zIndex: 3, width: 8, height: '100%', cursor: 'col-resize', userSelect: 'none', '&::after': { content: '""', position: 'absolute', top: '50%', right: 0, transform: 'translateY(-50%)', width: '1px', height: 18, bgcolor: '#dcdfe6' }, '&:hover': { bgcolor: '#d1e9ff' }, '&:hover::after': { bgcolor: '#1890ff' } }}
              />
            ) : null}
          </TableCell>
        ))}
      </TableRow>
    </TableHead>
  );

  return (
    <Box data-business-dictionary-page sx={{ height: 'calc(100vh - 150px)', minHeight: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(420px, 0.92fr) minmax(0, 1.08fr)' }, gap: 1.5, overflow: 'hidden' }}>
      <Box sx={{ bgcolor: '#fff', border: '1px solid #e4e7ed', borderRadius: 1, minWidth: 0, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ height: 48, px: 2, borderBottom: '1px solid #e4e7ed', flexShrink: 0 }}>
          <Typography sx={{ fontWeight: 600, color: '#303133' }}>业务字典</Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            {renderFieldSettingsButton((event) => setDictionarySettingsAnchor(event.currentTarget), 'dictionary')}
            <Button size="small" variant="contained" startIcon={<Add />} onClick={() => openDictionaryDialog()}>新增字典</Button>
          </Stack>
        </Stack>
        <Box sx={{ p: 1.5, borderBottom: '1px solid #e4e7ed', flexShrink: 0 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(160px, 1fr) 120px auto auto' }, gap: 1, alignItems: 'center' }}>
            <TextField
              size="small"
              placeholder="字典名称/编码"
              value={dictionaryFilters.keyword}
              onChange={(event) => setDictionaryFilters((current) => ({ ...current, keyword: event.target.value }))}
              sx={fieldSx}
              InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
            />
            <TextField select size="small" label="状态" value={dictionaryFilters.status} onChange={(event) => setDictionaryFilters((current) => ({ ...current, status: event.target.value }))} sx={fieldSx}>
              {statusOptions.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
            </TextField>
            <Button size="small" sx={QUERY_BUTTON_SX} variant="outlined" startIcon={<RestartAlt />} onClick={() => { setDictionaryFilters(emptyDictionaryFilters); setDictionaryPage(1); }}>重置</Button>
            <Button size="small" sx={QUERY_BUTTON_SX} variant="contained" startIcon={<Search />} onClick={() => setDictionaryPage(1)}>查询</Button>
          </Box>
        </Box>
        <Box sx={{ position: 'relative', flex: 1, minHeight: 0, minWidth: 0 }}>
          <TableContainer ref={dictionaryTableRef} sx={{ width: '100%', maxWidth: '100%', minWidth: 0, height: '100%', minHeight: 0, overflow: 'auto' }}>
            <Table stickyHeader size="small" sx={{ tableLayout: 'fixed', width: dictionaryTotalTableWidth, minWidth: dictionaryTotalTableWidth, height: dictionaryEmptyState ? '100%' : 'auto' }}>
              <colgroup>{visibleDictionaryColumns.map((column) => <col key={column.id} style={{ width: dictionaryResolvedWidths[column.id] }} />)}</colgroup>
              {renderTableHeader(visibleDictionaryColumns, dictionaryResolvedWidths, (event, column) => beginColumnResize(event, column, (id) => dictionaryResolvedWidths[id], setDictionaryColumnWidths))}
              <TableBody sx={{ height: dictionaryEmptyState ? '100%' : 'auto' }}>
                {dictionariesQuery.isLoading ? (
                  <TableRow sx={emptyTableRowSx}><TableStateCell colSpan={visibleDictionaryColumns.length} align="center" sx={emptyTableBodyCellSx}><CircularProgress size={24} /></TableStateCell></TableRow>
                ) : dictionariesQuery.isError ? (
                  <TableRow sx={emptyTableRowSx}><TableStateCell colSpan={visibleDictionaryColumns.length} align="center" sx={emptyTableBodyCellSx}>加载失败</TableStateCell></TableRow>
                ) : dictionaries.length === 0 ? (
                  <TableRow sx={emptyTableRowSx}><TableStateCell colSpan={visibleDictionaryColumns.length} align="center" sx={emptyTableBodyCellSx}>暂无数据</TableStateCell></TableRow>
                ) : dictionaries.map((dictionary) => (
                  <TableRow
                    key={dictionary.id}
                    hover
                    selected={String(dictionary.id) === String(selectedDictionary?.id)}
                    onClick={() => {
                      setSelectedDictionaryId(String(dictionary.id));
                      setItemPage(1);
                      openDetailDrawer({ type: 'dictionary', data: dictionary });
                    }}
                    sx={{ cursor: 'pointer', '& .MuiTableCell-root': tableBodyCellSx, '&.Mui-selected': { bgcolor: '#e8f4ff' }, '&.Mui-selected:hover': { bgcolor: '#d1e9ff' } }}
                  >
                    {visibleDictionaryColumns.map((column) => renderDictionaryCell(dictionary, column))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Box data-business-dictionary-action-column-shadow sx={{ position: 'absolute', top: 0, bottom: 0, right: dictionaryScrollbarWidth, width: ACTION_COLUMN_WIDTH, boxShadow: '-6px 0 8px -8px rgba(0,0,0,.35)', pointerEvents: 'none', zIndex: 7 }} />
        </Box>
        <Box sx={{ minHeight: 52, px: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexShrink: 0, borderTop: '1px solid #e4e7ed' }}>
          <Typography sx={{ color: '#909399' }}>共 {dictionariesQuery.data?.totalElements ?? 0} 条数据</Typography>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Pagination page={dictionaryPage} count={dictionaryPageCount} color="primary" size="small" onChange={(_, value) => setDictionaryPage(value)} />
            <FormControl size="small" sx={{ minWidth: 116 }}>
              <Select value={dictionaryPageSize} onChange={(event) => { setDictionaryPageSize(Number(event.target.value)); setDictionaryPage(1); }} sx={{ height: 32, fontSize: 14 }}>
                {PAGE_SIZE_OPTIONS.map((option) => <MenuItem key={option} value={option}>{option} 条/页</MenuItem>)}
              </Select>
            </FormControl>
          </Stack>
        </Box>
      </Box>

      <Box sx={{ bgcolor: '#fff', border: '1px solid #e4e7ed', borderRadius: 1, minWidth: 0, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ height: 48, px: 2, borderBottom: '1px solid #e4e7ed', flexShrink: 0 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 600, color: '#303133' }}>字典项</Typography>
            <Typography variant="caption" sx={{ color: '#909399' }}>{selectedDictionary ? `${selectedDictionary.name} / ${selectedDictionary.code}` : '请选择业务字典'}</Typography>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            {renderFieldSettingsButton((event) => setItemSettingsAnchor(event.currentTarget), 'item')}
            <Button size="small" variant="contained" startIcon={<Add />} disabled={!selectedDictionary} onClick={() => openItemDialog()}>新增字典项</Button>
          </Stack>
        </Stack>
        <Box sx={{ p: 1.5, borderBottom: '1px solid #e4e7ed', flexShrink: 0 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(160px, 1fr) 120px auto auto' }, gap: 1, alignItems: 'center' }}>
            <TextField
              size="small"
              placeholder="字典项名称/值"
              value={itemFilters.keyword}
              onChange={(event) => setItemFilters((current) => ({ ...current, keyword: event.target.value }))}
              sx={fieldSx}
              InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
            />
            <TextField select size="small" label="状态" value={itemFilters.status} onChange={(event) => setItemFilters((current) => ({ ...current, status: event.target.value }))} sx={fieldSx}>
              {statusOptions.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
            </TextField>
            <Button size="small" sx={QUERY_BUTTON_SX} variant="outlined" startIcon={<RestartAlt />} onClick={() => { setItemFilters(emptyItemFilters); setItemPage(1); }}>重置</Button>
            <Button size="small" sx={QUERY_BUTTON_SX} variant="contained" startIcon={<Search />} onClick={() => setItemPage(1)}>查询</Button>
          </Box>
        </Box>
        <Box sx={{ position: 'relative', flex: 1, minHeight: 0, minWidth: 0 }}>
          <TableContainer ref={itemTableRef} sx={{ width: '100%', maxWidth: '100%', minWidth: 0, height: '100%', minHeight: 0, overflow: 'auto' }}>
            <Table stickyHeader size="small" sx={{ tableLayout: 'fixed', width: itemTotalTableWidth, minWidth: itemTotalTableWidth, height: itemEmptyState ? '100%' : 'auto' }}>
              <colgroup>{visibleItemColumns.map((column) => <col key={column.id} style={{ width: itemResolvedWidths[column.id] }} />)}</colgroup>
              {renderTableHeader(visibleItemColumns, itemResolvedWidths, (event, column) => beginColumnResize(event, column, (id) => itemResolvedWidths[id], setItemColumnWidths))}
              <TableBody sx={{ height: itemEmptyState ? '100%' : 'auto' }}>
                {!selectedDictionary ? (
                  <TableRow sx={emptyTableRowSx}><TableStateCell colSpan={visibleItemColumns.length} align="center" sx={emptyTableBodyCellSx}>请选择业务字典</TableStateCell></TableRow>
                ) : itemsQuery.isLoading ? (
                  <TableRow sx={emptyTableRowSx}><TableStateCell colSpan={visibleItemColumns.length} align="center" sx={emptyTableBodyCellSx}><CircularProgress size={24} /></TableStateCell></TableRow>
                ) : itemsQuery.isError ? (
                  <TableRow sx={emptyTableRowSx}><TableStateCell colSpan={visibleItemColumns.length} align="center" sx={emptyTableBodyCellSx}>加载失败</TableStateCell></TableRow>
                ) : items.length === 0 ? (
                  <TableRow sx={emptyTableRowSx}><TableStateCell colSpan={visibleItemColumns.length} align="center" sx={emptyTableBodyCellSx}>暂无数据</TableStateCell></TableRow>
                ) : items.map((item) => (
                  <TableRow
                    key={item.id}
                    hover
                    draggable={!item.builtin && canReorderCurrentItems}
                    onDragStart={(event) => handleItemDragStart(event, String(item.id))}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => handleItemDrop(event, String(item.id))}
                    onDragEnd={() => setDraggingItemId('')}
                    onClick={() => openDetailDrawer({ type: 'item', data: item })}
                    sx={{ cursor: 'pointer', '& .MuiTableCell-root': tableBodyCellSx, opacity: draggingItemId === String(item.id) ? 0.55 : 1 }}
                  >
                    {visibleItemColumns.map((column) => renderItemCell(item, column))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Box data-business-dictionary-item-action-column-shadow sx={{ position: 'absolute', top: 0, bottom: 0, right: itemScrollbarWidth, width: ACTION_COLUMN_WIDTH, boxShadow: '-6px 0 8px -8px rgba(0,0,0,.35)', pointerEvents: 'none', zIndex: 7 }} />
        </Box>
        <Box sx={{ minHeight: 52, px: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexShrink: 0, borderTop: '1px solid #e4e7ed' }}>
          <Typography sx={{ color: '#909399' }}>共 {itemTotalElements} 条数据</Typography>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Pagination page={itemPage} count={itemPageCount} color="primary" size="small" onChange={(_, value) => setItemPage(value)} />
            <FormControl size="small" sx={{ minWidth: 116 }}>
              <Select value={itemPageSize} onChange={(event) => { setItemPageSize(Number(event.target.value)); setItemPage(1); }} sx={{ height: 32, fontSize: 14 }}>
                {PAGE_SIZE_OPTIONS.map((option) => <MenuItem key={option} value={option}>{option} 条/页</MenuItem>)}
              </Select>
            </FormControl>
          </Stack>
        </Box>
      </Box>

      {renderColumnSettingsPopover({
        anchor: dictionarySettingsAnchor,
        onClose: () => setDictionarySettingsAnchor(null),
        items: dictionaryColumnSettingsItems,
        settings: dictionaryColumnSettings,
        setSettings: setDictionaryColumnSettings,
        rowAttr: 'data-dictionary-column-settings-row',
      })}
      {renderColumnSettingsPopover({
        anchor: itemSettingsAnchor,
        onClose: () => setItemSettingsAnchor(null),
        items: itemColumnSettingsItems,
        settings: itemColumnSettings,
        setSettings: setItemColumnSettings,
        rowAttr: 'data-item-column-settings-row',
      })}

      <Drawer anchor="right" open={drawerOpen} onClose={() => setDrawerOpen(false)} sx={appContentDrawerSx} slotProps={{ backdrop: { sx: appContentDrawerSx } }} PaperProps={{ sx: appContentDrawerPaperSx }}>
        <Box sx={{ width: { xs: '100vw', sm: 560 }, p: 2, bgcolor: '#f7f9fc', minHeight: '100%' }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#303133' }}>信息查看</Typography>
            <IconButton size="small" onClick={() => setDrawerOpen(false)} aria-label="关闭详情"><Close /></IconButton>
          </Stack>
          {selectedDetail ? (
            <>
              <Box sx={{ mt: 1, borderBottom: '1px solid #e4e7ed' }}>
                <Tabs value={drawerTab} onChange={(_, value: number) => setDrawerTab(value)} aria-label="业务字典详情切换">
                  <Tab label="数据信息" />
                  <Tab label="数据审计" />
                </Tabs>
              </Box>
              {drawerTab === 0 ? (
                <Stack spacing={2} sx={{ mt: 2 }}>
                  <DetailSection title="基本信息">
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
                      {selectedDetail.type === 'dictionary' ? (
                        <>
                          <DetailField label="字典名称">{selectedDetail.data.name}</DetailField>
                          <DetailField label="字典编码">{selectedDetail.data.code}</DetailField>
                          <DetailField label="字典项数">{selectedDetail.data.itemCount ?? 0}</DetailField>
                          <DetailField label="状态">{getStatusLabel(selectedDetail.data.status)}</DetailField>
                          <DetailField label="是否内置">{selectedDetail.data.builtin ? '是' : '否'}</DetailField>
                          <DetailField label="描述">{selectedDetail.data.description || '-'}</DetailField>
                        </>
                      ) : (
                        <>
                          <DetailField label="字典项名称">{selectedDetail.data.label}</DetailField>
                          <DetailField label="字典项值">{selectedDetail.data.value}</DetailField>
                          <DetailField label="所属字典">{selectedDetail.data.dictionaryName}</DetailField>
                          <DetailField label="排序">{selectedDetail.data.sortOrder ?? 0}</DetailField>
                          <DetailField label="状态">{getStatusLabel(selectedDetail.data.status)}</DetailField>
                          <DetailField label="备注">{selectedDetail.data.remark || '-'}</DetailField>
                        </>
                      )}
                    </Box>
                  </DetailSection>
                  <DetailSection title="系统信息">
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
                      <DetailField label="创建人">{selectedDetail.data.createdBy || '-'}</DetailField>
                      <DetailField label="创建时间">{formatDateTime(selectedDetail.data.createdAt)}</DetailField>
                      <DetailField label="更新人">{selectedDetail.data.updatedBy || selectedDetail.data.createdBy || '-'}</DetailField>
                      <DetailField label="更新时间">{formatDateTime(selectedDetail.data.updatedAt || selectedDetail.data.createdAt)}</DetailField>
                    </Box>
                  </DetailSection>
                </Stack>
              ) : null}
              {drawerTab === 1 ? (
                <Stack spacing={2} sx={{ mt: 2 }}>
                  <DetailSection title="审计记录">
                    <Stack spacing={1}>
                      {auditRecords.length === 0 ? (
                        <Box sx={{ px: 1.5, py: 3, textAlign: 'center', color: '#909399', bgcolor: '#fff', border: '1px solid #e4e7ed', borderRadius: '4px' }}>
                          <Typography variant="body2">暂无审计记录</Typography>
                        </Box>
                      ) : auditRecords.map((record) => (
                        <Accordion key={record.id} data-audit-accordion-row={record.id} disableGutters elevation={0} sx={{ border: '1px solid #e4e7ed', borderRadius: '4px !important', bgcolor: '#fff', overflow: 'hidden', '&::before': { display: 'none' }, '&.Mui-expanded': { m: 0 } }}>
                          <AccordionSummary expandIcon={<ExpandMore fontSize="small" />} sx={{ minHeight: 44, px: 1.5, '&.Mui-expanded': { minHeight: 44 }, '& .MuiAccordionSummary-content': { m: 0, minWidth: 0 }, '& .MuiAccordionSummary-content.Mui-expanded': { m: 0 } }}>
                            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.35fr', columnGap: 1, width: '100%', minWidth: 0, alignItems: 'center' }}>
                              <Typography variant="body2" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{record.operatorName}</Typography>
                              <Typography variant="body2" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{record.actionLabel}</Typography>
                              <Typography variant="body2" sx={{ color: '#606266', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatDateTime(record.operatedAt)}</Typography>
                            </Box>
                          </AccordionSummary>
                          <AccordionDetails sx={{ px: 1.5, pt: 0, pb: 1.5 }}>
                            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
                              <AuditFieldBlock title="变更前" fields={record.beforeFields} />
                              <AuditFieldBlock title="变更后" fields={record.afterFields} />
                            </Box>
                          </AccordionDetails>
                        </Accordion>
                      ))}
                    </Stack>
                  </DetailSection>
                </Stack>
              ) : null}
            </>
          ) : null}
        </Box>
      </Drawer>

      <AppDialog open={dictionaryDialogOpen} onClose={() => setDictionaryDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingDictionary ? '编辑业务字典' : '新增业务字典'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.5} sx={{ pt: 0.5 }}>
            <TextField label="字典名称" value={dictionaryForm.name} required size="small" fullWidth sx={fieldSx} onChange={(event) => setDictionaryForm((current) => ({ ...current, name: event.target.value }))} />
            <TextField label="字典编码" value={dictionaryForm.code} required size="small" fullWidth sx={fieldSx} onChange={(event) => setDictionaryForm((current) => ({ ...current, code: event.target.value }))} />
            <TextField select label="状态" value={dictionaryForm.status} size="small" fullWidth sx={fieldSx} onChange={(event) => setDictionaryForm((current) => ({ ...current, status: event.target.value }))}>
              {statusOptions.filter((option) => option.value !== 'ALL').map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
            </TextField>
            <TextField label="排序" type="number" value={dictionaryForm.sortOrder} size="small" fullWidth sx={fieldSx} onChange={(event) => setDictionaryForm((current) => ({ ...current, sortOrder: event.target.value }))} />
            <TextField label="描述" value={dictionaryForm.description} multiline rows={3} fullWidth onChange={(event) => setDictionaryForm((current) => ({ ...current, description: event.target.value }))} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDictionaryDialogOpen(false)}>取消</Button>
          <Button variant="contained" onClick={submitDictionaryForm} disabled={dictionarySaveMutation.isPending}>{dictionarySaveMutation.isPending ? '保存中...' : '保存'}</Button>
        </DialogActions>
      </AppDialog>

      <AppDialog open={itemDialogOpen} onClose={() => setItemDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingItem ? '编辑字典项' : '新增字典项'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.5} sx={{ pt: 0.5 }}>
            <TextField label="字典项名称" value={itemForm.label} required size="small" fullWidth sx={fieldSx} onChange={(event) => setItemForm((current) => ({ ...current, label: event.target.value }))} />
            <TextField label="字典项值" value={itemForm.value} required size="small" fullWidth sx={fieldSx} onChange={(event) => setItemForm((current) => ({ ...current, value: event.target.value }))} />
            <TextField select label="状态" value={itemForm.status} size="small" fullWidth sx={fieldSx} onChange={(event) => setItemForm((current) => ({ ...current, status: event.target.value }))}>
              {statusOptions.filter((option) => option.value !== 'ALL').map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
            </TextField>
            <TextField label="排序" type="number" value={itemForm.sortOrder} size="small" fullWidth sx={fieldSx} onChange={(event) => setItemForm((current) => ({ ...current, sortOrder: event.target.value }))} />
            <TextField label="备注" value={itemForm.remark} multiline rows={3} fullWidth onChange={(event) => setItemForm((current) => ({ ...current, remark: event.target.value }))} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setItemDialogOpen(false)}>取消</Button>
          <Button variant="contained" onClick={submitItemForm} disabled={itemSaveMutation.isPending}>{itemSaveMutation.isPending ? '保存中...' : '保存'}</Button>
        </DialogActions>
      </AppDialog>

      <AppDialog open={deleteDictionaryTarget !== null} onClose={() => setDeleteDictionaryTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>确认删除业务字典</DialogTitle>
        <DialogContent dividers><Alert severity="error">确定删除「{deleteDictionaryTarget?.name ?? ''}」吗？若字典下存在字典项，后端会拒绝本次删除。</Alert></DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDictionaryTarget(null)}>取消</Button>
          <Button color="error" variant="contained" disabled={deleteDictionaryMutation.isPending} onClick={() => deleteDictionaryTarget && deleteDictionaryMutation.mutate(deleteDictionaryTarget)}>删除</Button>
        </DialogActions>
      </AppDialog>

      <AppDialog open={deleteItemTarget !== null} onClose={() => setDeleteItemTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>确认删除字典项</DialogTitle>
        <DialogContent dividers><Alert severity="error">确定删除「{deleteItemTarget?.label ?? ''}」吗？此操作不可撤销。</Alert></DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteItemTarget(null)}>取消</Button>
          <Button color="error" variant="contained" disabled={deleteItemMutation.isPending} onClick={() => deleteItemTarget && deleteItemMutation.mutate(deleteItemTarget)}>删除</Button>
        </DialogActions>
      </AppDialog>

      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={handleSnackbarClose} anchorOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <Alert severity={snackbar.severity} variant="filled" onClose={handleSnackbarClose}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
