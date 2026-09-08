import TableStateCell from '@/components/TableStateCell';
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Drawer,
  FormControlLabel,
  IconButton,
  InputAdornment,
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
import {
  Close,
  ContentCopy,
  Delete,
  Edit,
  ExpandLess,
  ExpandMore,
  ExpandMore as AccordionExpandMore,
  PlaylistAdd,
  RestartAlt,
  Search,
  TuneRounded,
  UnfoldLessRounded,
  UnfoldMoreRounded,
  ViewColumnRounded,
} from '@mui/icons-material';
import StatusBadge from '@/components/StatusBadge';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useSnackbar } from '@/components/SnackbarProvider';
import { getAuditLogs, type AuditLogItem } from '@/api/audit';
import {
  createProductProcessVersion,
  deleteProductProcessVersion,
  getProductModelWorkspace,
  getProductModelingProducts,
  getProductProcessOperationAuditLogs,
  getProductProcessVersionAuditLogs,
  updateProductProcessVersion,
  type ProductModelSource,
  type ProductProcessVersion,
  type ProductProcessVersionPayload,
} from '@/api/product-modeling';
import type { PageResult } from '@/types/common';
import { getRdoVersionStatusMeta } from '@/utils/rdoVersionStatus';
import ProductProcessVersionEditorDialog, { type ProductProcessVersionDialogMode } from './components/ProductProcessVersionEditorDialog';

const PAGE_SIZE = 20;
const COLUMN_STORAGE_KEY = 'product-modeling-parent-columns:v1';
const ACTION_COLUMN_WIDTH = 128;

type ParentColumnId = 'name' | 'code' | 'materialType' | 'specification' | 'versionCount' | 'updatedBy' | 'actions';

interface ParentColumn {
  id: ParentColumnId;
  label: string;
  width: number;
  minWidth: number;
  configurable?: boolean;
}

const PARENT_COLUMNS: ParentColumn[] = [
  { id: 'name', label: '产品名称', width: 236, minWidth: 180, configurable: true },
  { id: 'code', label: '产品编码', width: 170, minWidth: 128, configurable: true },
  { id: 'materialType', label: '物料类型', width: 126, minWidth: 105, configurable: true },
  { id: 'specification', label: '规格型号', width: 178, minWidth: 128, configurable: true },
  { id: 'versionCount', label: '配置版本数', width: 112, minWidth: 96, configurable: true },
  { id: 'updatedBy', label: '更新人', width: 124, minWidth: 96, configurable: true },
  { id: 'actions', label: '操作', width: ACTION_COLUMN_WIDTH, minWidth: ACTION_COLUMN_WIDTH },
];

type VersionColumnId = 'version' | 'productionMode' | 'productionForm' | 'route' | 'dhrTemplate' | 'status' | 'effectiveFrom' | 'effectiveTo' | 'description' | 'updatedBy' | 'updatedAt' | 'actions';

interface VersionColumn {
  id: VersionColumnId;
  label: string;
  width: number;
  minWidth: number;
}

const VERSION_COLUMNS: VersionColumn[] = [
  { id: 'version', label: '制程版本号', width: 132, minWidth: 132 },
  { id: 'productionMode', label: '生产模式', width: 104, minWidth: 104 },
  { id: 'productionForm', label: '生产方式', width: 104, minWidth: 104 },
  { id: 'route', label: '工艺路线版本', width: 230, minWidth: 180 },
  { id: 'dhrTemplate', label: '批记录模板版本', width: 230, minWidth: 180 },
  { id: 'status', label: '版本状态', width: 104, minWidth: 104 },
  { id: 'effectiveFrom', label: '生效时间', width: 164, minWidth: 150 },
  { id: 'effectiveTo', label: '失效时间', width: 164, minWidth: 150 },
  { id: 'description', label: '备注', width: 180, minWidth: 140 },
  { id: 'updatedBy', label: '更新人', width: 118, minWidth: 100 },
  { id: 'updatedAt', label: '更新时间', width: 164, minWidth: 150 },
  { id: 'actions', label: '操作', width: ACTION_COLUMN_WIDTH, minWidth: ACTION_COLUMN_WIDTH },
];

const tableHeaderCellSx = { bgcolor: '#f5f7fa', color: '#606266', fontWeight: 600, whiteSpace: 'nowrap', height: 48, py: 0, borderBottom: '1px solid #e4e7ed' };
const tableRowSx = { '& > .MuiTableCell-root': { height: 40, py: 0.5, borderBottom: '1px solid #ebeef5' } };
const toolbarIconSx = { width: 36, height: 36, border: '1px solid #e4e7ed', borderRadius: 1, color: '#606266', bgcolor: '#fff', '&:hover': { color: '#1890ff', bgcolor: '#e8f4ff' } };
const drawerRootSx = {
  top: 0,
  bottom: 0,
  zIndex: (theme: { zIndex: { drawer: number } }) => theme.zIndex.drawer + 2,
  '& .MuiBackdrop-root': { top: 0 },
};
const drawerPaperSx = { ...drawerRootSx, width: { xs: '100vw', sm: 560 }, height: '100vh', top: 0, bottom: 0, transform: 'none !important' };

function operationColumnSx(width: number, layer: 'head' | 'body') {
  return {
    position: 'sticky' as const,
    right: 0,
    zIndex: layer === 'head' ? 10 : 5,
    width,
    minWidth: width,
    maxWidth: width,
    bgcolor: layer === 'head' ? '#f5f7fa' : '#fff',
    backgroundClip: 'padding-box',
    boxShadow: '-6px 0 8px -8px rgba(0, 0, 0, 0.35)',
    whiteSpace: 'nowrap',
  };
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.replace('T', ' ').slice(0, 16) : date.toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-');
}

function formatVersionReference(code?: string | null, name?: string | null, version?: string | null) {
  return [code, name, version].filter(Boolean).join(' / ') || '-';
}

function parseAuditContent(content: unknown): Record<string, unknown> {
  if (!content) return {};
  if (typeof content === 'object' && !Array.isArray(content)) return content as Record<string, unknown>;
  if (typeof content !== 'string') return {};
  try {
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

const AUDIT_LABELS: Record<string, string> = {
  name: '名称', code: '编码', version: '版本', productionMode: '生产模式', productionForm: '生产方式',
  routeVersion: '工艺路线版本', dhrTemplateVersion: '批记录模板版本', description: '备注',
  effectiveFrom: '生效时间', effectiveTo: '失效时间', operationBindings: '工序配置',
  operation: '工序', forms: 'DHR 目录表单', documents: 'SOP 文档', operationCount: '已配置工序数',
  materialTypeName: '物料类型', specification: '规格型号', unit: '单位', status: '状态',
};

function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  if (value === 'ACTIVE') return '生效';
  if (value === 'EXPIRED') return '失效';
  if (Array.isArray(value)) return value.length ? value.map(formatAuditValue).join('、') : '-';
  if (typeof value === 'object') return Object.entries(value as Record<string, unknown>).map(([key, item]) => `${AUDIT_LABELS[key] ?? key}：${formatAuditValue(item)}`).join('；');
  return String(value);
}

function AuditBlock({ title, content }: { title: string; content: unknown }) {
  const fields = Object.entries(parseAuditContent(content)).filter(([key]) => key !== 'id' && key !== 'productProcessId');
  return <Box sx={{ border: '1px solid #e4e7ed', borderRadius: 1, bgcolor: '#f8fafc', p: 1.25 }}>
    <Typography variant="caption" sx={{ display: 'block', mb: 0.75, color: '#606266', fontWeight: 600 }}>{title}</Typography>
    {fields.length === 0 ? <Typography variant="caption" sx={{ color: '#909399' }}>无</Typography> : <Stack spacing={0.75}>{fields.map(([key, value]) => <Box key={key} sx={{ display: 'grid', gridTemplateColumns: '92px minmax(0, 1fr)', gap: 1 }}><Typography variant="caption" sx={{ color: '#606266' }}>{AUDIT_LABELS[key] ?? key}</Typography><Typography variant="caption" sx={{ color: '#303133', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{formatAuditValue(value)}</Typography></Box>)}</Stack>}
  </Box>;
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return <Box sx={{ border: '1px solid #e4e7ed', borderRadius: 1, bgcolor: '#fff', overflow: 'hidden' }}><Box sx={{ px: 1.5, py: 1, bgcolor: '#f8fafc', borderBottom: '1px solid #e4e7ed' }}><Typography variant="body2" sx={{ fontWeight: 600 }}>{title}</Typography></Box><Box sx={{ p: 1.5 }}>{children}</Box></Box>;
}

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return <Box sx={{ minWidth: 0 }}><Typography variant="caption" sx={{ display: 'block', mb: 0.35, color: '#909399' }}>{label}</Typography><Typography component="div" variant="body2" sx={{ color: '#303133', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{children || '-'}</Typography></Box>;
}

interface DetailTarget {
  product: ProductModelSource;
  version?: ProductProcessVersion;
  initialTab?: number;
}

interface EditorTarget {
  product: ProductModelSource;
  versions: ProductProcessVersion[];
  mode: ProductProcessVersionDialogMode;
  target?: ProductProcessVersion;
}

export default function ProductModelingPage() {
  const queryClient = useQueryClient();
  const { showMessage } = useSnackbar();
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [submittedKeyword, setSubmittedKeyword] = useState('');
  const [expandedProductIds, setExpandedProductIds] = useState<string[]>([]);
  const [detailTarget, setDetailTarget] = useState<DetailTarget | null>(null);
  const [detailTab, setDetailTab] = useState(0);
  const [editorTarget, setEditorTarget] = useState<EditorTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ product: ProductModelSource; version: ProductProcessVersion } | null>(null);
  const [columnAnchor, setColumnAnchor] = useState<HTMLElement | null>(null);
  const [hiddenColumns, setHiddenColumns] = useState<ParentColumnId[]>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(COLUMN_STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.filter((item): item is ParentColumnId => PARENT_COLUMNS.some((column) => column.id === item && column.configurable)) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => { localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(hiddenColumns)); }, [hiddenColumns]);
  const query = useQuery({
    queryKey: ['product-modeling-products', page, submittedKeyword],
    queryFn: async () => (await getProductModelingProducts({ page, size: PAGE_SIZE, keyword: submittedKeyword, status: 'ALL' })).data.data,
  });
  const rows = query.data?.content ?? [];
  const visibleColumns = useMemo(() => PARENT_COLUMNS.filter((column) => !hiddenColumns.includes(column.id)), [hiddenColumns]);
  const parentTableWidth = visibleColumns.reduce((total, column) => total + column.width, 0);
  const versionTableWidth = VERSION_COLUMNS.reduce((total, column) => total + column.width, 0);
  const sharedTableWidth = Math.max(parentTableWidth, versionTableWidth);
  const parentActionSpacerWidth = Math.max(0, versionTableWidth - parentTableWidth);
  const versionActionSpacerWidth = Math.max(0, parentTableWidth - versionTableWidth);
  const parentTableColumnCount = visibleColumns.length + (parentActionSpacerWidth > 0 ? 1 : 0);
  const isTableEmptyState = query.isLoading || query.isError || rows.length === 0;

  useEffect(() => {
    const currentIds = new Set(rows.map((row) => row.id));
    setExpandedProductIds((current) => current.filter((id) => currentIds.has(id)));
  }, [rows]);
  useEffect(() => { if (detailTarget) setDetailTab(detailTarget.initialTab ?? 0); }, [detailTarget]);

  const parentAuditQuery = useQuery({
    queryKey: ['product-modeling-source-material-audit', detailTarget?.product.id],
    enabled: Boolean(detailTarget && !detailTarget.version),
    queryFn: async () => (await getAuditLogs({ page: 1, size: 100, sort: 'createdAt', order: 'desc', entityType: 'MATERIAL', entityId: detailTarget!.product.id })).data.data as PageResult<AuditLogItem>,
  });
  const versionAuditQuery = useQuery({
    queryKey: ['product-modeling-version-audit', detailTarget?.version?.id],
    enabled: Boolean(detailTarget?.version),
    queryFn: async () => (await getProductProcessVersionAuditLogs(detailTarget!.version!.id)).data.data as PageResult<AuditLogItem>,
  });
  const operationAuditQuery = useQuery({
    queryKey: ['product-modeling-operation-audit', detailTarget?.version?.id],
    enabled: Boolean(detailTarget?.version),
    queryFn: async () => (await getProductProcessOperationAuditLogs(detailTarget!.version!.id)).data.data as PageResult<AuditLogItem>,
  });
  const detailAuditEvents = useMemo(() => {
    if (!detailTarget?.version) return parentAuditQuery.data?.content ?? [];
    return [...(versionAuditQuery.data?.content ?? []), ...(operationAuditQuery.data?.content ?? [])]
      .sort((left, right) => Date.parse(right.createdAt ?? right.operationTime ?? '') - Date.parse(left.createdAt ?? left.operationTime ?? ''));
  }, [detailTarget?.version, operationAuditQuery.data?.content, parentAuditQuery.data?.content, versionAuditQuery.data?.content]);

  const invalidateProduct = async (productId: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['product-modeling-products'] }),
      queryClient.invalidateQueries({ queryKey: ['product-modeling-workspace', productId] }),
    ]);
  };
  const saveVersionMutation = useMutation({
    mutationFn: ({ target, payload }: { target: EditorTarget; payload: ProductProcessVersionPayload }) => target.mode === 'edit' && target.target
      ? updateProductProcessVersion(target.product.id, target.target.id, payload)
      : createProductProcessVersion(target.product.id, payload),
    onSuccess: async (_result, variables) => {
      await invalidateProduct(variables.target.product.id);
      setEditorTarget(null);
      showMessage('制程配置版本已保存');
    },
    onError: (error: Error) => showMessage(error.message || '保存失败', 'error'),
  });
  const deleteMutation = useMutation({
    mutationFn: ({ product, version }: { product: ProductModelSource; version: ProductProcessVersion }) => deleteProductProcessVersion(product.id, version.id),
    onSuccess: async (_result, variables) => {
      await invalidateProduct(variables.product.id);
      setDeleteTarget(null);
      if (detailTarget?.version?.id === variables.version.id) setDetailTarget(null);
      showMessage('制程配置版本已删除');
    },
    onError: (error: Error) => showMessage(error.message || '删除失败', 'error'),
  });

  const toggleExpanded = (id: string) => setExpandedProductIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const fetchWorkspace = async (product: ProductModelSource) => queryClient.fetchQuery({
    queryKey: ['product-modeling-workspace', product.id],
    queryFn: async () => (await getProductModelWorkspace(product.id)).data.data,
  });
  const openCreateEditor = async (product: ProductModelSource) => {
    try {
      const workspace = await fetchWorkspace(product);
      setEditorTarget({ product, versions: workspace.model?.versions ?? [], mode: 'create' });
    } catch (error) {
      showMessage(error instanceof Error ? error.message : '产品制程版本加载失败', 'error');
    }
  };
  const openOnlyVersionDelete = async (product: ProductModelSource) => {
    try {
      const workspace = await fetchWorkspace(product);
      const versions = workspace.model?.versions ?? [];
      if (versions.length !== 1) {
        showMessage('该产品的制程版本已变化，请展开后在对应版本行操作。', 'error');
        return;
      }
      setDeleteTarget({ product, version: versions[0] });
    } catch (error) {
      showMessage(error instanceof Error ? error.message : '产品制程版本加载失败', 'error');
    }
  };

  const submitSearch = () => { setPage(1); setSubmittedKeyword(keyword.trim()); };
  const resetSearch = () => { setKeyword(''); setPage(1); setSubmittedKeyword(''); };

  return <Box sx={{ minWidth: 0, height: { xs: 'auto', lg: 'calc(100vh - 150px)' }, display: 'flex', flexDirection: 'column', gap: 1.5, minHeight: 0, overflow: 'hidden' }}>
    <Box sx={{ flex: '0 0 auto', border: '1px solid #e4e7ed', borderRadius: 1, bgcolor: '#fff', p: 2 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5, alignItems: 'center' }}>
        <TextField fullWidth size="small" label="产品名称/编码" placeholder="请输入" value={keyword} onChange={(event) => setKeyword(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submitSearch(); }} sx={{ '& .MuiInputBase-root': { height: 40 }, '& .MuiInputBase-input': { boxSizing: 'border-box' } }} InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }} />
        <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="flex-end" sx={{ gridColumn: { xs: '1', md: '3' } }}>
          <Button size="small" sx={{ height: 40, width: 80, minWidth: 80 }} variant="outlined" startIcon={<RestartAlt />} onClick={resetSearch}>重置</Button>
          <Button size="small" sx={{ height: 40, width: 80, minWidth: 80 }} variant="contained" startIcon={<Search />} onClick={submitSearch}>查询</Button>
        </Stack>
      </Box>
    </Box>

    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, border: '1px solid #e4e7ed', borderRadius: 1, bgcolor: '#fff', overflow: 'hidden' }}>
      <Box sx={{ flex: '0 0 auto', px: 2, py: 0.75, minHeight: 48, borderBottom: '1px solid #ebeef5', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Tooltip title="字段设置" arrow><IconButton size="small" aria-label="字段设置" onClick={(event) => setColumnAnchor(event.currentTarget)} sx={toolbarIconSx}>
            <Box aria-hidden="true" sx={{ position: 'relative', width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <ViewColumnRounded sx={{ fontSize: 21 }} />
              <TuneRounded sx={{ position: 'absolute', right: -3, bottom: -2, fontSize: 13, p: '1px', borderRadius: '50%', bgcolor: '#fff', boxShadow: '0 0 0 1px #fff' }} />
            </Box>
          </IconButton></Tooltip>
          <Tooltip title="全部展开" arrow><IconButton size="small" aria-label="全部展开" onClick={() => setExpandedProductIds(rows.map((row) => row.id))} sx={toolbarIconSx}><UnfoldMoreRounded fontSize="small" /></IconButton></Tooltip>
          <Tooltip title="全部收起" arrow><IconButton size="small" aria-label="全部收起" onClick={() => setExpandedProductIds([])} sx={toolbarIconSx}><UnfoldLessRounded fontSize="small" /></IconButton></Tooltip>
        </Stack>
        <Typography variant="body2" sx={{ color: '#606266' }}>由物料管理中“半成品、产成品”自动派生</Typography>
      </Box>
      <TableContainer sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <Table stickyHeader size="small" sx={{ width: sharedTableWidth, minWidth: sharedTableWidth, tableLayout: 'fixed', height: isTableEmptyState ? '100%' : 'auto' }}>
          <colgroup>{visibleColumns.map((column) => <Fragment key={column.id}>{column.id === 'actions' && parentActionSpacerWidth > 0 ? <col data-product-parent-action-spacer style={{ width: parentActionSpacerWidth }} /> : null}<col style={{ width: column.width }} /></Fragment>)}</colgroup>
          <TableHead><TableRow sx={{ '& .MuiTableCell-root': tableHeaderCellSx }}>{visibleColumns.map((column) => <Fragment key={column.id}>{column.id === 'actions' && parentActionSpacerWidth > 0 ? <TableCell data-product-parent-action-spacer aria-hidden="true" sx={{ width: parentActionSpacerWidth, minWidth: parentActionSpacerWidth, maxWidth: parentActionSpacerWidth, p: 0, ...tableHeaderCellSx }} /> : null}<TableCell sx={{ ...tableHeaderCellSx, width: column.width, minWidth: column.minWidth, ...(column.id === 'actions' ? operationColumnSx(column.width, 'head') : {}) }}>{column.label}</TableCell></Fragment>)}</TableRow></TableHead>
          <TableBody sx={{ height: isTableEmptyState ? '100%' : 'auto' }}>
            {query.isLoading ? <TableRow sx={{ height: '100%' }}><TableStateCell colSpan={parentTableColumnCount} align="center" sx={{ height: '100%', color: '#909399' }}>加载中...</TableStateCell></TableRow> : query.isError ? <TableRow sx={{ height: '100%' }}><TableStateCell colSpan={parentTableColumnCount} align="center" sx={{ height: '100%', color: '#c62828' }}>产品管理数据加载失败</TableStateCell></TableRow> : rows.length === 0 ? <TableRow sx={{ height: '100%' }}><TableStateCell colSpan={parentTableColumnCount} align="center" sx={{ height: '100%', color: '#909399' }}>暂无数据</TableStateCell></TableRow> : rows.map((product) => <ProductTreeRows key={product.id} product={product} visibleColumns={visibleColumns} expanded={expandedProductIds.includes(product.id)} parentTableColumnCount={parentTableColumnCount} sharedTableWidth={sharedTableWidth} parentActionSpacerWidth={parentActionSpacerWidth} versionActionSpacerWidth={versionActionSpacerWidth} onToggle={() => toggleExpanded(product.id)} onViewProduct={() => setDetailTarget({ product })} onAddVersion={() => void openCreateEditor(product)} onDeleteOnlyVersion={() => void openOnlyVersionDelete(product)} onViewVersion={(version, tab = 0) => setDetailTarget({ product, version, initialTab: tab })} onEditVersion={(version, mode, versions) => setEditorTarget({ product, versions, target: version, mode })} onDeleteVersion={(version) => setDeleteTarget({ product, version })} />)}
          </TableBody>
        </Table>
      </TableContainer>
      <Box sx={{ flex: '0 0 auto', minHeight: 56, px: 2, borderTop: '1px solid #ebeef5', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><Typography variant="body2" sx={{ color: '#606266' }}>共 {query.data?.totalElements ?? 0} 条数据</Typography>{(query.data?.totalPages ?? 0) > 1 ? <Pagination size="small" count={query.data?.totalPages} page={page} onChange={(_, value) => setPage(value)} /> : null}</Box>
    </Box>

    <Popover open={Boolean(columnAnchor)} anchorEl={columnAnchor} onClose={() => setColumnAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }} PaperProps={{ sx: { width: 220, p: 1.25 } }}>
      <Typography variant="subtitle2" sx={{ px: 0.75, pb: 0.75 }}>父产品字段</Typography>
      {PARENT_COLUMNS.filter((column) => column.configurable).map((column) => <FormControlLabel key={column.id} sx={{ display: 'flex', mx: 0, '& .MuiFormControlLabel-label': { fontSize: 13 } }} control={<Checkbox size="small" checked={!hiddenColumns.includes(column.id)} disabled={column.id === 'name'} onChange={(event) => setHiddenColumns((current) => event.target.checked ? current.filter((id) => id !== column.id) : [...current, column.id])} />} label={column.label} />)}
    </Popover>

    <ProductDetailDrawer target={detailTarget} tab={detailTab} onTabChange={setDetailTab} events={detailAuditEvents} loading={detailTarget?.version ? versionAuditQuery.isLoading || operationAuditQuery.isLoading : parentAuditQuery.isLoading} error={detailTarget?.version ? versionAuditQuery.isError || operationAuditQuery.isError : parentAuditQuery.isError} onClose={() => setDetailTarget(null)} />
    {editorTarget ? <ProductProcessVersionEditorDialog open productId={editorTarget.product.id} productName={editorTarget.product.name} productCode={editorTarget.product.code} mode={editorTarget.mode} target={editorTarget.target} versions={editorTarget.versions} saving={saveVersionMutation.isPending} onClose={() => setEditorTarget(null)} onSubmit={(payload) => saveVersionMutation.mutate({ target: editorTarget, payload })} /> : null}
    <ConfirmDialog open={Boolean(deleteTarget)} title="删除制程配置版本" message={`确定删除产品「${deleteTarget?.product.name || ''}」的制程版本「${deleteTarget?.version.version || ''}」吗？删除后不可恢复。`} confirmText="删除" destructive loading={deleteMutation.isPending} onCancel={() => setDeleteTarget(null)} onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget); }} />
  </Box>;
}

function ProductTreeRows({
  product,
  visibleColumns,
  expanded,
  parentTableColumnCount,
  sharedTableWidth,
  parentActionSpacerWidth,
  versionActionSpacerWidth,
  onToggle,
  onViewProduct,
  onAddVersion,
  onDeleteOnlyVersion,
  onViewVersion,
  onEditVersion,
  onDeleteVersion,
}: {
  product: ProductModelSource;
  visibleColumns: ParentColumn[];
  expanded: boolean;
  parentTableColumnCount: number;
  sharedTableWidth: number;
  parentActionSpacerWidth: number;
  versionActionSpacerWidth: number;
  onToggle: () => void;
  onViewProduct: () => void;
  onAddVersion: () => void;
  onDeleteOnlyVersion: () => void;
  onViewVersion: (version: ProductProcessVersion, tab?: number) => void;
  onEditVersion: (version: ProductProcessVersion, mode: 'edit' | 'copy', versions: ProductProcessVersion[]) => void;
  onDeleteVersion: (version: ProductProcessVersion) => void;
}) {
  const workspaceQuery = useQuery({
    queryKey: ['product-modeling-workspace', product.id],
    enabled: expanded,
    queryFn: async () => (await getProductModelWorkspace(product.id)).data.data,
  });
  const versions = workspaceQuery.data?.model?.versions ?? [];
  const renderParentCell = (column: ParentColumn) => {
    switch (column.id) {
      case 'name': return <TableCell key={column.id}><Stack direction="row" spacing={0.5} alignItems="center" sx={{ minWidth: 0 }}><Tooltip title={expanded ? '收起制程版本' : '展开制程版本'} arrow><IconButton size="small" aria-label={expanded ? '收起制程版本' : '展开制程版本'} onClick={(event) => { event.stopPropagation(); onToggle(); }}>{expanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}</IconButton></Tooltip><Typography component="button" type="button" onClick={(event) => { event.stopPropagation(); onViewProduct(); }} sx={{ p: 0, minWidth: 0, border: 0, bgcolor: 'transparent', font: 'inherit', color: '#1890ff', fontWeight: 500, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left', '&:hover': { color: '#096dd9', textDecoration: 'underline' } }}>{product.name}</Typography></Stack></TableCell>;
      case 'code': return <TableCell key={column.id}>{product.code || '-'}</TableCell>;
      case 'materialType': return <TableCell key={column.id}>{product.materialTypeName || '-'}</TableCell>;
      case 'specification': return <TableCell key={column.id} sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.specification || '-'}</TableCell>;
      case 'versionCount': return <TableCell key={column.id}>{product.modelVersionCount}</TableCell>;
      case 'updatedBy': return <TableCell key={column.id}>{product.updatedBy || product.createdBy || '-'}</TableCell>;
      case 'actions': return <TableCell key={column.id} align="center" onClick={(event) => event.stopPropagation()} sx={operationColumnSx(column.width, 'body')}><Tooltip title="新增子版本" arrow><IconButton size="small" aria-label="新增子版本" onClick={onAddVersion}><PlaylistAdd fontSize="small" /></IconButton></Tooltip>{product.modelVersionCount === 1 ? <Tooltip title="删除" arrow><IconButton size="small" color="error" aria-label="删除" onClick={onDeleteOnlyVersion}><Delete fontSize="small" /></IconButton></Tooltip> : null}</TableCell>;
      default: return null;
    }
  };
  return <>
    <TableRow hover onClick={onToggle} sx={{ ...tableRowSx, cursor: 'pointer' }}>
      {visibleColumns.map((column) => <Fragment key={column.id}>{column.id === 'actions' && parentActionSpacerWidth > 0 ? <TableCell data-product-parent-action-spacer aria-hidden="true" sx={{ width: parentActionSpacerWidth, minWidth: parentActionSpacerWidth, maxWidth: parentActionSpacerWidth, p: 0 }} /> : null}{renderParentCell(column)}</Fragment>)}
    </TableRow>
    {expanded ? <TableRow sx={{ '& > .MuiTableCell-root': { borderBottom: 'none' } }}><TableCell colSpan={parentTableColumnCount} sx={{ p: 0, bgcolor: '#fbfdff' }}>
      {workspaceQuery.isLoading ? <Box sx={{ minHeight: 84, display: 'grid', placeItems: 'center', color: '#909399' }}><CircularProgress size={20} /></Box> : workspaceQuery.isError ? <Box sx={{ px: 2, py: 2, color: '#c62828' }}>制程配置版本加载失败</Box> : versions.length === 0 ? <Box sx={{ minHeight: 72, display: 'flex', alignItems: 'center', px: 2, color: '#909399', bgcolor: '#fbfdff' }}>暂无制程配置版本</Box> : <TableContainer sx={{ width: '100%', bgcolor: '#fff', overflow: 'visible' }}><Table stickyHeader size="small" aria-label="产品制程配置版本列表" sx={{ tableLayout: 'fixed', width: sharedTableWidth, minWidth: sharedTableWidth }}><colgroup>{VERSION_COLUMNS.map((column) => <Fragment key={column.id}>{column.id === 'actions' && versionActionSpacerWidth > 0 ? <col data-product-version-action-spacer style={{ width: versionActionSpacerWidth }} /> : null}<col style={{ width: column.width }} /></Fragment>)}</colgroup><TableHead><TableRow sx={{ '& .MuiTableCell-root': tableHeaderCellSx }}>{VERSION_COLUMNS.map((column) => <Fragment key={column.id}>{column.id === 'actions' && versionActionSpacerWidth > 0 ? <TableCell data-product-version-action-spacer aria-hidden="true" sx={{ width: versionActionSpacerWidth, minWidth: versionActionSpacerWidth, maxWidth: versionActionSpacerWidth, p: 0, ...tableHeaderCellSx }} /> : null}<TableCell align={column.id === 'actions' ? 'center' : undefined} sx={{ ...tableHeaderCellSx, width: column.width, minWidth: column.minWidth, ...(column.id === 'actions' ? operationColumnSx(column.width, 'head') : {}) }}>{column.label}</TableCell></Fragment>)}</TableRow></TableHead><TableBody>{versions.map((version) => <ProductVersionTableRow key={version.id} version={version} versionActionSpacerWidth={versionActionSpacerWidth} onOpen={() => onViewVersion(version)} onEdit={() => onEditVersion(version, 'edit', versions)} onCopy={() => onEditVersion(version, 'copy', versions)} onDelete={() => onDeleteVersion(version)} />)}</TableBody></Table></TableContainer>}
    </TableCell></TableRow> : null}
  </>;
}

function ProductVersionTableRow({ version, versionActionSpacerWidth, onOpen, onEdit, onCopy, onDelete }: {
  version: ProductProcessVersion;
  versionActionSpacerWidth: number;
  onOpen: () => void;
  onEdit: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const status = getRdoVersionStatusMeta(version.status);
  const cellSx = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
  const renderCell = (column: VersionColumn) => {
    switch (column.id) {
      case 'version': return <TableCell key={column.id} sx={{ ...cellSx, fontWeight: 600 }}>{version.version}</TableCell>;
      case 'productionMode': return <TableCell key={column.id} sx={cellSx}>{version.productionMode || '-'}</TableCell>;
      case 'productionForm': return <TableCell key={column.id} sx={cellSx}>{version.productionForm || '-'}</TableCell>;
      case 'route': return <TableCell key={column.id} sx={cellSx} title={formatVersionReference(version.routeCode, version.routeName, version.routeVersion)}>{formatVersionReference(version.routeCode, version.routeName, version.routeVersion)}</TableCell>;
      case 'dhrTemplate': return <TableCell key={column.id} sx={cellSx} title={formatVersionReference(version.dhrTemplateCode, version.dhrTemplateName, version.dhrTemplateVersion)}>{formatVersionReference(version.dhrTemplateCode, version.dhrTemplateName, version.dhrTemplateVersion)}</TableCell>;
      case 'status': return <TableCell key={column.id} sx={cellSx}><StatusBadge {...status} /></TableCell>;
      case 'effectiveFrom': return <TableCell key={column.id} sx={{ ...cellSx, whiteSpace: 'nowrap' }}>{formatDateTime(version.effectiveFrom)}</TableCell>;
      case 'effectiveTo': return <TableCell key={column.id} sx={{ ...cellSx, whiteSpace: 'nowrap' }}>{formatDateTime(version.effectiveTo)}</TableCell>;
      case 'description': return <TableCell key={column.id} sx={cellSx} title={version.description || '-'}>{version.description || '-'}</TableCell>;
      case 'updatedBy': return <TableCell key={column.id} sx={cellSx}>{version.updatedBy || version.createdBy || '-'}</TableCell>;
      case 'updatedAt': return <TableCell key={column.id} sx={{ ...cellSx, whiteSpace: 'nowrap' }}>{formatDateTime(version.updatedAt || version.createdAt)}</TableCell>;
      case 'actions': return <TableCell key={column.id} align="center" onClick={(event) => event.stopPropagation()} sx={operationColumnSx(column.width, 'body')}>
      <Tooltip title="编辑版本" arrow><IconButton size="small" aria-label="编辑版本" onClick={onEdit}><Edit fontSize="small" /></IconButton></Tooltip>
      <Tooltip title="复制版本" arrow><IconButton size="small" aria-label="复制版本" onClick={onCopy}><ContentCopy fontSize="small" /></IconButton></Tooltip>
      <Tooltip title="删除" arrow><IconButton size="small" color="error" aria-label="删除" onClick={onDelete}><Delete fontSize="small" /></IconButton></Tooltip>
      </TableCell>;
      default: return null;
    }
  };
  return <TableRow hover onClick={onOpen} sx={{ ...tableRowSx, cursor: 'pointer' }}>{VERSION_COLUMNS.map((column) => <Fragment key={column.id}>{column.id === 'actions' && versionActionSpacerWidth > 0 ? <TableCell data-product-version-action-spacer aria-hidden="true" sx={{ width: versionActionSpacerWidth, minWidth: versionActionSpacerWidth, maxWidth: versionActionSpacerWidth, p: 0 }} /> : null}{renderCell(column)}</Fragment>)}</TableRow>;
}

function ProductDetailDrawer({ target, tab, onTabChange, events, loading, error, onClose }: {
  target: DetailTarget | null;
  tab: number;
  onTabChange: (tab: number) => void;
  events: AuditLogItem[];
  loading: boolean;
  error: boolean;
  onClose: () => void;
}) {
  const version = target?.version;
  const status = version ? getRdoVersionStatusMeta(version.status) : undefined;
  return <Drawer anchor="right" open={Boolean(target)} onClose={onClose} sx={drawerRootSx} slotProps={{ backdrop: { sx: drawerRootSx } }} PaperProps={{ sx: drawerPaperSx }}>
    <Box sx={{ minHeight: '100%', overflow: 'auto', bgcolor: '#f7f9fc', p: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}><Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{version ? '制程配置版本详情' : '产品信息'}</Typography><IconButton size="small" onClick={onClose} aria-label="关闭详情"><Close fontSize="small" /></IconButton></Stack>
      {target ? <>
        <Box sx={{ borderBottom: '1px solid #e4e7ed' }}><Tabs value={tab} onChange={(_, value: number) => onTabChange(value)} aria-label="产品管理详情"><Tab label="数据信息" /><Tab label="数据审计" /></Tabs></Box>
        {tab === 0 ? <Stack spacing={2} sx={{ mt: 2 }}>
          <DetailSection title={version ? '制程版本信息' : '来源物料信息'}><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.75 }}>
            {version ? <>
              <DetailField label="产品名称">{target.product.name}</DetailField><DetailField label="产品编码">{target.product.code}</DetailField>
              <DetailField label="制程版本">{version.version}</DetailField><DetailField label="版本状态">{status ? <StatusBadge {...status} /> : '-'}</DetailField>
              <DetailField label="生产模式">{version.productionMode}</DetailField><DetailField label="生产方式">{version.productionForm}</DetailField>
              <DetailField label="工艺路线版本">{formatVersionReference(version.routeCode, version.routeName, version.routeVersion)}</DetailField><DetailField label="批记录模板版本">{formatVersionReference(version.dhrTemplateCode, version.dhrTemplateName, version.dhrTemplateVersion)}</DetailField>
              <DetailField label="生效时间">{formatDateTime(version.effectiveFrom)}</DetailField><DetailField label="失效时间">{formatDateTime(version.effectiveTo)}</DetailField><DetailField label="备注">{version.description || '-'}</DetailField>
            </> : <>
              <DetailField label="产品名称">{target.product.name}</DetailField><DetailField label="产品编码">{target.product.code}</DetailField>
              <DetailField label="物料版本">{target.product.version || '-'}</DetailField><DetailField label="物料类型">{target.product.materialTypeName || '-'}</DetailField>
              <DetailField label="规格型号">{target.product.specification || '-'}</DetailField><DetailField label="单位">{target.product.unit || '-'}</DetailField>
              <DetailField label="已配置制程版本">{target.product.modelVersionCount}</DetailField><DetailField label="来源">物料管理</DetailField>
            </>}
          </Box></DetailSection>
          <DetailSection title="系统信息"><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.75 }}><DetailField label="创建人">{version?.createdBy || target.product.createdBy || '-'}</DetailField><DetailField label="创建时间">{formatDateTime(version?.createdAt || target.product.createdAt)}</DetailField><DetailField label="更新人">{version?.updatedBy || version?.createdBy || target.product.updatedBy || target.product.createdBy || '-'}</DetailField><DetailField label="更新时间">{formatDateTime(version?.updatedAt || version?.createdAt || target.product.updatedAt || target.product.createdAt)}</DetailField></Box></DetailSection>
        </Stack> : <Stack spacing={1} sx={{ mt: 2 }}>
          {loading ? <Box sx={{ py: 8, display: 'grid', placeItems: 'center' }}><CircularProgress size={24} /></Box> : error ? <Box sx={{ py: 8, textAlign: 'center', color: '#c62828' }}>审计记录加载失败</Box> : events.length === 0 ? <Box sx={{ py: 8, textAlign: 'center', color: '#909399' }}>暂无审计记录</Box> : events.map((event) => <Accordion key={`${event.entityType}-${event.id}`} disableGutters elevation={0} sx={{ border: '1px solid #e4e7ed', borderRadius: '4px !important', overflow: 'hidden', '&::before': { display: 'none' }, '&.Mui-expanded': { m: 0 } }}><AccordionSummary expandIcon={<AccordionExpandMore fontSize="small" />} sx={{ minHeight: 44, px: 1.5, '&.Mui-expanded': { minHeight: 44 }, '& .MuiAccordionSummary-content': { my: 0 }, '& .MuiAccordionSummary-content.Mui-expanded': { my: 0 } }}><Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.25fr', columnGap: 1, width: '100%', minWidth: 0 }}><Typography variant="body2" noWrap>{event.operatorDisplayName || event.operatorAccount || '-'}</Typography><Typography variant="body2" noWrap>{event.actionLabel || event.action || '-'}</Typography><Typography variant="body2" noWrap sx={{ color: '#606266' }}>{formatDateTime(event.operationTime || event.createdAt)}</Typography></Box></AccordionSummary><AccordionDetails sx={{ pt: 0, pb: 1.5 }}><Typography variant="caption" sx={{ display: 'block', mb: 1, color: '#909399' }}>{event.functionName || (version ? '制程配置版本' : '物料管理')}</Typography><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}><AuditBlock title="变更前" content={event.contentBefore} /><AuditBlock title="变更后" content={event.contentAfter} /></Box></AccordionDetails></Accordion>)}
        </Stack>}
      </> : null}
    </Box>
  </Drawer>;
}
