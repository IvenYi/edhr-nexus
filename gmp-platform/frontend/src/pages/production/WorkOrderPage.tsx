import TableStateCell from '@/components/TableStateCell';
import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
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
  Radio,
  RadioGroup,
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
  Add,
  Cancel,
  Check,
  Close,
  Clear,
  Edit,
  ExpandMore,
  PlayArrow,
  RestartAlt,
  Search,
  ViewList,
  UploadFile,
  PlaylistAdd,
  DeleteOutline,
  Visibility,
  InfoOutlined,
} from '@mui/icons-material';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import AppDialog from '@/components/AppDialog';
import ConfirmDialog from '@/components/ConfirmDialog';
import StatusBadge from '@/components/StatusBadge';
import { useSnackbar } from '@/components/SnackbarProvider';
import { getAuditLogs, type AuditLogItem } from '@/api/audit';
import { getProductModelingProducts, getProductModelWorkspace, type ProductModelSource, type ProductProcessVersion } from '@/api/product-modeling';
import {
  cancelProductionObject,
  cancelWorkOrder,
  closeWorkOrder,
  completeProductionObject,
  createWorkOrder,
  listProductionObjects,
  listProcessOptions,
  listWorkOrders,
  splitProductionObjectsBatch,
  startProductionObject,
  updateWorkOrder,
  type ProcessOption,
  type ProductionObject,
  type WorkOrder,
} from '@/api/work-orders';
import type { PageResult } from '@/types/common';
import { toProductionAuditFields, type ProductionAuditField } from '@/utils/productionAudit';

const PAGE_SIZE = 20;
const statusLabels: Record<string, string> = {
  CREATED: '已创建',
  IN_PROCESS: '生产中',
  COMPLETED: '已完成',
  CLOSED: '已关闭',
  CANCELLED: '已取消',
};
const objectStatusLabels: Record<string, string> = {
  CREATED: '已创建',
  IN_PROGRESS: '生产中',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
};
const formLabels: Record<string, string> = { SN: 'SN', BATCH: '批次', 批次: '批次', '批次转SN': '批次转SN' };
const statusColors: Record<string, 'success' | 'warning' | 'error' | 'info' | 'default'> = {
  CREATED: 'info',
  IN_PROCESS: 'warning',
  IN_PROGRESS: 'warning',
  COMPLETED: 'success',
  CLOSED: 'default',
  CANCELLED: 'error',
};
const tableHeaderCellSx = {
  bgcolor: '#f5f7fa', color: '#606266', fontWeight: 600, whiteSpace: 'nowrap', height: 48, py: 0,
  borderBottom: '1px solid #e4e7ed',
};
const tableRowSx = { '& > .MuiTableCell-root': { height: 40, py: 0.5, borderBottom: '1px solid #ebeef5' } };
const statusColumnSx = {
  position: 'sticky' as const, right: 128, zIndex: 2, width: 104, minWidth: 104, maxWidth: 104,
  bgcolor: '#fff', backgroundClip: 'padding-box', boxShadow: '-6px 0 8px -8px rgba(0, 0, 0, 0.35)', whiteSpace: 'nowrap',
};
const operationColumnSx = {
  position: 'sticky' as const, right: 0, zIndex: 2, width: 128, minWidth: 128, maxWidth: 128,
  bgcolor: '#fff', backgroundClip: 'padding-box', whiteSpace: 'nowrap',
};
const clearableSelectSx = {
  '& .MuiSelect-icon': { transition: 'opacity 120ms ease' },
  '& .select-clear-adornment': {
    position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', margin: 0,
    zIndex: 2, pointerEvents: 'none',
  },
  '& .select-clear-button': {
    opacity: 0, pointerEvents: 'none', color: '#909399', transition: 'opacity 120ms ease',
  },
  '&.has-value:hover .MuiSelect-icon, &.has-value:focus-within .MuiSelect-icon': { opacity: 0 },
  '&.has-value:hover .select-clear-button, &.has-value:focus-within .select-clear-button': { opacity: 0.55, pointerEvents: 'auto' },
  '& .select-clear-button:hover': { opacity: 0.85 },
};
const drawerRootSx = {
  top: 0, bottom: 0, zIndex: (theme: { zIndex: { drawer: number } }) => theme.zIndex.drawer + 2,
  '& .MuiBackdrop-root': { top: 0 },
};
const drawerPaperSx = { ...drawerRootSx, width: { xs: '100vw', sm: 560 }, top: 0, bottom: 0, height: '100vh', transform: 'none !important' };

interface WorkOrderForm {
  orderNo: string;
  orderNumber: string;
  productId: string;
  processVersionId: string;
  plannedQuantity: string;
  plannedStartAt: string;
  plannedEndAt: string;
  remark: string;
}

interface AuditRecord {
  id: string;
  operatorName: string;
  actionLabel: string;
  operatedAt?: string;
  beforeFields: ProductionAuditField[];
  afterFields: ProductionAuditField[];
}

const emptyForm = (): WorkOrderForm => ({ orderNo: '', orderNumber: '', productId: '', processVersionId: '', plannedQuantity: '', plannedStartAt: '', plannedEndAt: '', remark: '' });

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.replace('T', ' ').slice(0, 19) : date.toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-');
}

function toInputDateTime(value?: string | null) { return value ? value.replace(' ', 'T').slice(0, 16) : ''; }

function toAuditRecords(events: AuditLogItem[] | undefined): AuditRecord[] {
  const labels: Record<string, string> = { CREATE: '新增', UPDATE: '修改', CANCEL: '修改', STATUS_CHANGE: '修改' };
  const actionLabelFor = (event: AuditLogItem) => {
    const action = (event.action || '').toUpperCase();
    return event.actionLabel || labels[action] || (action === 'CREATE' ? '新增' : '修改');
  };
  return (events ?? []).map((event) => ({
    id: String(event.id),
    operatorName: event.operatorDisplayName || event.operatorAccount || '-',
    actionLabel: actionLabelFor(event),
    operatedAt: event.operationTime || event.createdAt,
    beforeFields: toProductionAuditFields(event.contentBefore),
    afterFields: toProductionAuditFields(event.contentAfter),
  }));
}

function statusBadge(status: string, labels: Record<string, string>) {
  return <StatusBadge label={labels[status] || status || '-'} color={statusColors[status] || 'default'} />;
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return <Box sx={{ bgcolor: '#fff', border: '1px solid #e4e7ed', borderRadius: 1, overflow: 'hidden' }}>
    <Box sx={{ px: 1.5, py: 1, borderBottom: '1px solid #e4e7ed', bgcolor: '#f8fafc' }}><Typography sx={{ fontWeight: 600, color: '#303133' }}>{title}</Typography></Box>
    <Box sx={{ p: 1.5 }}>{children}</Box>
  </Box>;
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return <Box sx={{ bgcolor: '#fff', border: '1px solid #e4e7ed', borderRadius: 1, overflow: 'hidden' }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: { xs: 1.5, sm: 2 }, py: 1.25, bgcolor: '#f8fafc', borderBottom: '1px solid #e4e7ed' }}>
      <Box sx={{ width: 3, height: 18, borderRadius: 1, bgcolor: '#1890ff', flex: '0 0 auto' }} />
      <Typography variant="subtitle2" sx={{ color: '#303133', fontWeight: 600 }}>{title}</Typography>
    </Box>
    <Box sx={{ p: { xs: 1.5, sm: 2 } }}>{children}</Box>
  </Box>;
}

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return <Box sx={{ minWidth: 0 }}><Typography variant="caption" sx={{ color: '#909399', display: 'block', mb: 0.5 }}>{label}</Typography><Typography variant="body2" sx={{ color: '#303133', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{children || '-'}</Typography></Box>;
}

function AuditFieldBlock({ title, fields }: { title: string; fields: ProductionAuditField[] }) {
  return <Box sx={{ border: '1px solid #e4e7ed', borderRadius: 1, bgcolor: '#f8fafc', p: 1 }}>
    <Typography variant="caption" sx={{ display: 'block', mb: 0.75, color: '#606266', fontWeight: 600 }}>{title}</Typography>
    <Stack spacing={0.75}>{fields.length === 0 ? <Typography variant="caption" sx={{ color: '#909399' }}>无</Typography> : fields.map((field) => <Box key={field.key} sx={{ display: 'grid', gridTemplateColumns: '84px minmax(0, 1fr)', gap: 1 }}><Typography variant="caption" sx={{ color: '#606266' }}>{field.label}</Typography><Typography variant="caption" sx={{ color: '#303133', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{field.value}</Typography></Box>)}</Stack>
  </Box>;
}

function WorkOrderDetailDrawer({ open, order, tab, onTabChange, auditRecords, auditLoading, auditError, onClose }: {
  open: boolean;
  order: WorkOrder | null;
  tab: number;
  onTabChange: (value: number) => void;
  auditRecords: AuditRecord[];
  auditLoading: boolean;
  auditError: boolean;
  onClose: () => void;
}) {
  return <Drawer anchor="right" open={open} onClose={onClose} sx={drawerRootSx} slotProps={{ backdrop: { sx: drawerRootSx } }} PaperProps={{ sx: drawerPaperSx }}>
    <Box sx={{ minHeight: '100%', overflow: 'auto', bgcolor: '#f7f9fc', p: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}><Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#303133' }}>信息查看</Typography><IconButton size="small" onClick={onClose} aria-label="关闭详情"><Close fontSize="small" /></IconButton></Stack>
      {order && <><Box sx={{ borderBottom: '1px solid #e4e7ed' }}><Tabs value={tab} onChange={(_, value: number) => onTabChange(value)} aria-label="工单详情切换"><Tab label="数据信息" /><Tab label="数据审计" /></Tabs></Box>
        {tab === 0 ? <Stack spacing={2} sx={{ mt: 2 }}>
          <DetailSection title="工单信息"><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.75 }}>
            <DetailField label="工单编号">{order.orderNo}</DetailField><DetailField label="订单编号">{order.orderNumber}</DetailField>
            <DetailField label="产品名称">{order.productName}</DetailField><DetailField label="产品编码">{order.productCode}</DetailField>
            <DetailField label="制程版本">{order.processVersion}</DetailField><DetailField label="生产模式">{order.productionMode}</DetailField>
            <DetailField label="生产形态">{formLabels[order.productionForm || ''] || order.productionForm}</DetailField><DetailField label="计划数量">{order.plannedQuantity}</DetailField>
            <DetailField label="计划开始时间">{formatDateTime(order.plannedStartAt)}</DetailField><DetailField label="计划结束时间">{formatDateTime(order.plannedEndAt)}</DetailField>
            <DetailField label="工单状态">{statusBadge(order.status, statusLabels)}</DetailField><DetailField label="备注">{order.remark}</DetailField>
          </Box></DetailSection>
          <DetailSection title="系统信息"><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.75 }}><DetailField label="创建时间">{formatDateTime(order.createdAt)}</DetailField><DetailField label="更新时间">{formatDateTime(order.updatedAt)}</DetailField></Box></DetailSection>
        </Stack> : <Stack spacing={1} sx={{ mt: 2 }}>
          {auditLoading ? <Box sx={{ py: 8, display: 'grid', placeItems: 'center' }}><CircularProgress size={24} /></Box> : auditError ? <Box sx={{ py: 8, textAlign: 'center', color: '#c62828' }}>审计记录加载失败</Box> : auditRecords.length === 0 ? <Box sx={{ py: 8, textAlign: 'center', color: '#909399' }}>暂无审计记录</Box> : auditRecords.map((record) => <Accordion key={record.id} disableGutters elevation={0} sx={{ border: '1px solid #e4e7ed', borderRadius: '4px !important', overflow: 'hidden', '&::before': { display: 'none' }, '&.Mui-expanded': { m: 0 } }}>
            <AccordionSummary expandIcon={<ExpandMore fontSize="small" />} sx={{ minHeight: 44, px: 1.5, '&.Mui-expanded': { minHeight: 44 }, '& .MuiAccordionSummary-content': { my: 0 }, '& .MuiAccordionSummary-content.Mui-expanded': { my: 0 } }}><Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.25fr', columnGap: 1, width: '100%', minWidth: 0 }}><Typography variant="body2" noWrap>{record.operatorName}</Typography><Typography variant="body2" noWrap>{record.actionLabel}</Typography><Typography variant="body2" noWrap sx={{ color: '#606266' }}>{formatDateTime(record.operatedAt)}</Typography></Box></AccordionSummary>
            <AccordionDetails sx={{ pt: 0, pb: 1.5 }}><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}><AuditFieldBlock title="变更前" fields={record.beforeFields} /><AuditFieldBlock title="变更后" fields={record.afterFields} /></Box></AccordionDetails>
          </Accordion>)}
        </Stack>}
      </>}
    </Box>
  </Drawer>;
}

function ProcessVersionOption({ version }: { version: ProductProcessVersion | ProcessOption }) {
  return <Box sx={{ py: 0.25 }}><Typography variant="body2" sx={{ color: '#303133' }}>{version.version}</Typography><Typography variant="caption" display="block" sx={{ color: '#909399' }}>工艺路线版本：{version.routeVersion || '-'}</Typography><Typography variant="caption" display="block" sx={{ color: '#909399' }}>DHR模板版本：{version.dhrTemplateVersion || '-'}</Typography></Box>;
}

function ProcessVersionValue({ version }: { version: ProductProcessVersion | undefined }) {
  if (!version) return null;
  return <Typography variant="body2" noWrap sx={{ color: '#303133', overflow: 'hidden', textOverflow: 'ellipsis' }}>
    {version.version}
    <Typography component="span" variant="caption" sx={{ ml: 1, color: '#909399' }}>工艺路线 {version.routeVersion || '-'} · DHR模板 {version.dhrTemplateVersion || '-'}</Typography>
  </Typography>;
}

function ProcessVersionPreviewDialog({ open, version, loading, error, onClose }: {
  open: boolean;
  version?: ProductProcessVersion;
  loading: boolean;
  error: boolean;
  onClose: () => void;
}) {
  return <AppDialog open={open} onClose={onClose} maxWidth="md" fullWidth>
    <DialogTitle>{version?.version ? `制程版本预览 - ${version.version}` : '制程版本预览'}</DialogTitle>
    <DialogContent dividers sx={{ p: { xs: 1.5, sm: 2.5 }, bgcolor: '#f6f8f9' }}>
      {loading ? <Box sx={{ py: 8, display: 'grid', placeItems: 'center' }}><CircularProgress size={24} /></Box> : error || !version ? <Box sx={{ py: 8, textAlign: 'center', color: '#c62828' }}>制程版本详情加载失败</Box> : <Stack spacing={1.5}>
        <FormSection title="版本信息"><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
          <DetailField label="制程版本">{version.version}</DetailField><DetailField label="版本状态">{version.status || '-'}</DetailField>
          <DetailField label="生产模式">{version.productionMode}</DetailField><DetailField label="生产形态">{version.productionForm}</DetailField>
          <DetailField label="工艺路线版本">{version.routeCode || version.routeName ? `${version.routeCode || ''}${version.routeCode && version.routeName ? ' · ' : ''}${version.routeName || ''}（${version.routeVersion || '-'}）` : version.routeVersion || '-'}</DetailField>
          <DetailField label="批记录模板版本">{version.dhrTemplateCode || version.dhrTemplateName ? `${version.dhrTemplateCode || ''}${version.dhrTemplateCode && version.dhrTemplateName ? ' · ' : ''}${version.dhrTemplateName || ''}（${version.dhrTemplateVersion || '-'}）` : version.dhrTemplateVersion || '-'}</DetailField>
          <DetailField label="备注">{version.description || '-'}</DetailField>
        </Box></FormSection>
        <FormSection title={`工序配置（${version.operations?.length || 0}）`}>
          {version.operations?.length ? <Stack spacing={1}>{version.operations.map((operation, index) => <Box key={operation.id || operation.routeNodeKey} sx={{ p: 1.25, bgcolor: '#fbfdff', border: '1px solid #e4e7ed', borderRadius: 1 }}>
            <Typography variant="body2" sx={{ color: '#303133', fontWeight: 600 }}>{index + 1}. {operation.operationName}</Typography>
            <Typography variant="caption" sx={{ color: '#909399' }}>表单 {operation.forms?.length || 0} 个 · 文件 {operation.documents?.length || 0} 个</Typography>
          </Box>)}</Stack> : <Typography variant="body2" sx={{ color: '#909399' }}>暂无工序配置</Typography>}
        </FormSection>
      </Stack>}
    </DialogContent>
    <DialogActions sx={{ px: 3, py: 1.5 }}><Button onClick={onClose}>关闭</Button></DialogActions>
  </AppDialog>;
}

export default function WorkOrderPage() {
  const client = useQueryClient();
  const { showMessage } = useSnackbar();
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [submittedKeyword, setSubmittedKeyword] = useState('');
  const [status, setStatus] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<WorkOrder | null>(null);
  const [objectOrder, setObjectOrder] = useState<WorkOrder | null>(null);
  const [detailOrder, setDetailOrder] = useState<WorkOrder | null>(null);
  const [detailTab, setDetailTab] = useState(0);
  const [cancelTarget, setCancelTarget] = useState<WorkOrder | null>(null);
  const [cancelObject, setCancelObject] = useState<ProductionObject | null>(null);
  const [closeTarget, setCloseTarget] = useState<WorkOrder | null>(null);
  const [form, setForm] = useState<WorkOrderForm>(emptyForm);
  const [splitForm, setSplitForm] = useState({ processVersionId: '', targetQuantity: '', objectNo: '', remark: '', plannedStartAt: '', plannedEndAt: '' });
  const [splitTab, setSplitTab] = useState(0);
  const [batchAddType, setBatchAddType] = useState<'count' | 'quantity'>('count');
  const [processPreviewOpen, setProcessPreviewOpen] = useState(false);
  const [pendingObjects, setPendingObjects] = useState<Array<{ processVersionId: string; targetQuantity: string; objectNo: string; remark: string; plannedStartAt: string; plannedEndAt: string }>>([]);

  const orders = useQuery({ queryKey: ['work-orders', page, submittedKeyword, status], queryFn: async () => (await listWorkOrders({ page, size: PAGE_SIZE, keyword: submittedKeyword, status })).data.data as PageResult<WorkOrder> });
  const products = useQuery({ queryKey: ['work-order-products'], queryFn: async () => (await getProductModelingProducts({ page: 1, size: 500, status: 'ACTIVE' })).data.data as PageResult<ProductModelSource> });
  const process = useQuery({ queryKey: ['work-order-process', form.productId], enabled: Boolean(form.productId), queryFn: async () => (await getProductModelWorkspace(form.productId)).data.data });
  const objects = useQuery({ queryKey: ['production-objects', objectOrder?.id], enabled: Boolean(objectOrder), queryFn: async () => (await listProductionObjects(objectOrder!.id)).data.data });
  const processOptions = useQuery({ queryKey: ['production-process-options', objectOrder?.id], enabled: Boolean(objectOrder), queryFn: async () => (await listProcessOptions(objectOrder!.id)).data.data });
  const processPreviewQuery = useQuery({
    queryKey: ['production-process-preview', objectOrder?.productId],
    enabled: Boolean(objectOrder && processPreviewOpen && objectOrder.productId),
    queryFn: async () => (await getProductModelWorkspace(objectOrder!.productId)).data.data,
  });
  const auditQuery = useQuery({
    queryKey: ['work-order-audit', detailOrder?.id],
    enabled: detailOrder !== null,
    queryFn: async () => {
      const response = await getAuditLogs({ entityType: 'WORK_ORDER', entityId: detailOrder!.id, page: 1, size: 100 });
      return ((response.data.data as PageResult<AuditLogItem>).content ?? []);
    },
  });
  const auditRecords = useMemo(() => toAuditRecords(auditQuery.data), [auditQuery.data]);

  const save = useMutation({
    mutationFn: () => {
      const body = { orderNo: form.orderNo.trim(), orderNumber: form.orderNumber.trim() || null, productId: form.productId, processVersionId: form.processVersionId || null, plannedQuantity: Number(form.plannedQuantity), plannedStartAt: form.plannedStartAt || null, plannedEndAt: form.plannedEndAt || null, remark: form.remark.trim() };
      return editing ? updateWorkOrder(editing.id, body) : createWorkOrder(body);
    },
    onSuccess: () => { void client.invalidateQueries({ queryKey: ['work-orders'] }); setDialogOpen(false); showMessage(editing ? '工单更新成功' : '工单创建成功'); },
    onError: (error: any) => showMessage(error?.response?.data?.message || '工单保存失败', 'error'),
  });
  const cancel = useMutation({
    mutationFn: cancelWorkOrder,
    onSuccess: () => { void client.invalidateQueries({ queryKey: ['work-orders'] }); setCancelTarget(null); showMessage('工单已取消'); },
    onError: (error: any) => showMessage(error?.response?.data?.message || '工单取消失败', 'error'),
  });
  const split = useMutation({
    mutationFn: () => splitProductionObjectsBatch(objectOrder!.id, pendingObjects.map((item) => ({ processVersionId: item.processVersionId || null, targetQuantity: Number(item.targetQuantity), objectNo: item.objectNo.trim() || undefined, remark: item.remark.trim() || undefined, plannedStartAt: item.plannedStartAt || null, plannedEndAt: item.plannedEndAt || null }))),
    onSuccess: (response) => { const created = response.data.data[0]; setObjectOrder((current) => current ? { ...current, processVersionId: created.processVersionId, processVersion: created.processVersion, productionForm: created.objectType } : current); void client.invalidateQueries({ queryKey: ['production-objects', objectOrder?.id] }); void client.invalidateQueries({ queryKey: ['work-orders'] }); setPendingObjects([]); setSplitForm((current) => ({ ...current, processVersionId: created.processVersionId, targetQuantity: '', objectNo: '', remark: '', plannedStartAt: '', plannedEndAt: '' })); showMessage(`已添加 ${response.data.data.length} 个生产对象`); },
    onError: (error: any) => showMessage(error?.response?.data?.message || '生产对象创建失败', 'error'),
  });
  const objectAction = useMutation({
    mutationFn: ({ action, id }: { action: 'start' | 'complete' | 'cancel'; id: string }) => action === 'start' ? startProductionObject(id) : action === 'complete' ? completeProductionObject(id) : cancelProductionObject(id),
    onSuccess: () => { void client.invalidateQueries({ queryKey: ['production-objects', objectOrder?.id] }); void client.invalidateQueries({ queryKey: ['work-orders'] }); setCancelObject(null); showMessage('生产对象操作成功'); },
    onError: (error: any) => showMessage(error?.response?.data?.message || '生产对象操作失败', 'error'),
  });
  const close = useMutation({
    mutationFn: closeWorkOrder,
    onSuccess: () => { void client.invalidateQueries({ queryKey: ['work-orders'] }); setCloseTarget(null); showMessage('工单已关闭'); },
    onError: (error: any) => showMessage(error?.response?.data?.message || '工单关闭失败', 'error'),
  });

  const versions: ProductProcessVersion[] = process.data?.model?.versions ?? [];
  const selectedProduct = (products.data?.content ?? []).find((product) => String(product.id) === form.productId);
  const objectRows = objects.data ?? [];
  const allocated = objectRows.reduce((sum, item) => sum + Number(item.targetQuantity), 0);
  const remaining = Math.max(0, Number(objectOrder?.plannedQuantity || 0) - allocated);
  const pendingAllocated = pendingObjects.reduce((sum, item) => sum + Number(item.targetQuantity || 0), 0);
  const availableRemaining = Math.max(0, remaining - pendingAllocated);
  const canSplit = Boolean(objectOrder && objectOrder.status === 'CREATED');
  const endBeforeStart = Boolean(form.plannedStartAt && form.plannedEndAt && form.plannedEndAt < form.plannedStartAt);
  const canSave = Boolean(form.orderNo.trim() && form.productId && Number(form.plannedQuantity) > 0 && !endBeforeStart && !save.isPending);

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setDialogOpen(true); };
  const openEdit = (item: WorkOrder) => { setEditing(item); setForm({ orderNo: item.orderNo, orderNumber: item.orderNumber || '', productId: item.productId, processVersionId: item.processVersionId || '', plannedQuantity: String(item.plannedQuantity), plannedStartAt: toInputDateTime(item.plannedStartAt), plannedEndAt: toInputDateTime(item.plannedEndAt), remark: item.remark || '' }); setDialogOpen(true); };
  const openDetail = (item: WorkOrder) => { setDetailOrder(item); setDetailTab(0); };
  const openObjects = (item: WorkOrder) => { setObjectOrder(item); setProcessPreviewOpen(false); setSplitTab(0); setBatchAddType('count'); setPendingObjects([]); setSplitForm({ processVersionId: item.processVersionId || '', targetQuantity: '', objectNo: '', remark: '', plannedStartAt: '', plannedEndAt: '' }); };
  const selectedProcess = (processOptions.data ?? []).find((option) => option.id === splitForm.processVersionId);
  const selectedProductionMode = selectedProcess?.productionMode || objectOrder?.productionMode || '';
  const selectedProductionForm = selectedProcess?.productionForm || objectOrder?.productionForm || '';
  const isMassNonSn = selectedProductionMode === '量产' && ['BATCH', '批次'].includes(selectedProductionForm);
  const isSnProduction = selectedProductionForm === 'SN';
  const previewVersion = processPreviewQuery.data?.model?.versions.find((version) => version.id === objectOrder?.processVersionId);
  const addPendingObject = () => {
    const targetQuantity = isSnProduction ? 1 : Number(splitForm.targetQuantity);
    if (!splitForm.processVersionId || targetQuantity <= 0 || targetQuantity > availableRemaining) return;
    if (isSnProduction && !splitForm.objectNo.trim()) { showMessage('请输入SN编号', 'error'); return; }
    if (splitForm.plannedStartAt && splitForm.plannedEndAt && splitForm.plannedEndAt < splitForm.plannedStartAt) { showMessage('计划结束时间不能早于计划开始时间', 'error'); return; }
    if (splitForm.objectNo.trim() && (pendingObjects.some((item) => item.objectNo.trim() === splitForm.objectNo.trim()) || objectRows.some((item) => item.objectNo.trim() === splitForm.objectNo.trim()))) { showMessage('待添加清单或已拆分清单中存在重复的SN/批次号', 'error'); return; }
    setPendingObjects((current) => [...current, { ...splitForm, targetQuantity: String(targetQuantity) }]);
    setSplitForm((current) => ({ ...current, targetQuantity: '', objectNo: '', remark: '', plannedStartAt: '', plannedEndAt: '' }));
  };
  const addPendingBatch = () => {
    const input = Number(splitForm.targetQuantity);
    const count = isSnProduction || batchAddType === 'count' ? Math.floor(input) : Math.ceil(availableRemaining / input);
    if (!splitForm.processVersionId || !Number.isFinite(input) || input <= 0 || count < 1 || ((isSnProduction || batchAddType === 'count') && count > availableRemaining)) return;
    const baseQuantity = batchAddType === 'quantity' && !isSnProduction ? input : Math.floor(availableRemaining / count);
    const next = Array.from({ length: count }, (_, index) => ({
      ...splitForm,
      targetQuantity: isSnProduction ? '1' : String(index === count - 1 ? availableRemaining - (baseQuantity * (count - 1)) : baseQuantity),
      objectNo: splitForm.objectNo.trim() ? `${splitForm.objectNo.trim()}-${String(index + 1).padStart(3, '0')}` : '',
    }));
    const duplicateObject = next.find((item) => item.objectNo && (pendingObjects.some((existing) => existing.objectNo.trim() === item.objectNo) || objectRows.some((existing) => existing.objectNo.trim() === item.objectNo)));
    if (duplicateObject) { showMessage('待添加清单或已拆分清单中存在重复的SN/批次号', 'error'); return; }
    setPendingObjects((current) => [...current, ...next]);
    setSplitForm((current) => ({ ...current, targetQuantity: '', objectNo: '', remark: '', plannedStartAt: '', plannedEndAt: '' }));
  };
  const importPendingObjects = async (file?: File) => {
    if (!file) return;
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true, codepage: 65001 });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true });
      const normalizeHeader = (value: unknown) => String(value ?? '').replace(/^\ufeff/, '').trim().toLowerCase();
      const objectHeaderNames = isSnProduction ? ['sn', 'sn号', 'sn编号', '序列号', '对象编号', 'objectno'] : ['批次号', '批次编号', '对象编号', 'objectno', 'batchno'];
      const headerIndex = matrix.findIndex((row) => row.some((value) => objectHeaderNames.includes(normalizeHeader(value))));
      if (headerIndex < 0) throw new Error(`未识别到有效数据，请使用包含“${isSnProduction ? 'SN编号' : '批次号'}”的 CSV、XLS 或 XLSX 文件`);
      const headerRow = matrix[headerIndex] ?? [];
      const headerNames = headerRow.map((value) => String(value ?? '').replace(/^\ufeff/, '').trim());
      const rows = matrix.slice(headerIndex + 1)
        .filter((values) => values.some((value) => String(value ?? '').trim() !== ''))
        .map((values) => headerNames.reduce<Record<string, unknown>>((record, header, columnIndex) => {
          if (header) record[header] = values[columnIndex] ?? '';
          return record;
        }, {}));
      const normalizeDateTime = (value: unknown) => {
        if (value instanceof Date) return toInputDateTime(value.toISOString());
        const text = String(value ?? '').trim();
        if (!text) return '';
        const normalized = text.replace(/年|月/g, '-').replace(/日/g, '').replace(' ', 'T');
        return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized) ? `${normalized}:00` : normalized;
      };
      const get = (row: Record<string, unknown>, names: string[]) => { const key = Object.keys(row).find((item) => names.includes(item.trim().toLowerCase())); return key ? String(row[key] ?? '').trim() : ''; };
      const getDate = (row: Record<string, unknown>, names: string[]) => { const key = Object.keys(row).find((item) => names.includes(item.trim().toLowerCase())); return key ? normalizeDateTime(row[key]) : ''; };
      const parsedRows = rows.map((row, index) => { const quantity = get(row, ['数量', '目标数量', 'targetquantity', 'quantity']); return { rowNumber: headerIndex + index + 2, processVersionId: splitForm.processVersionId, targetQuantity: isSnProduction ? (quantity || '1') : quantity, objectNo: get(row, objectHeaderNames), remark: get(row, ['备注', 'remark']), plannedStartAt: getDate(row, ['计划开始时间', 'plannedstartat']), plannedEndAt: getDate(row, ['计划结束时间', 'plannedendat']) }; });
      const invalidQuantityRows = parsedRows.filter((row) => !Number.isFinite(Number(row.targetQuantity)) || Number(row.targetQuantity) <= 0).map((row) => row.rowNumber);
      if (invalidQuantityRows.length > 0) throw new Error(`导入失败：第 ${invalidQuantityRows.join('、')} 行数量无效，请修正后重新导入`);
      const invalidSnQuantityRows = isSnProduction ? parsedRows.filter((row) => Number(row.targetQuantity) !== 1).map((row) => row.rowNumber) : [];
      if (invalidSnQuantityRows.length > 0) throw new Error(`导入失败：SN生产形态第 ${invalidSnQuantityRows.join('、')} 行数量必须为1`);
      const invalidObjectRows = parsedRows.filter((row) => !row.objectNo).map((row) => row.rowNumber);
      if (invalidObjectRows.length > 0) throw new Error(`导入失败：第 ${invalidObjectRows.join('、')} 行${isSnProduction ? 'SN编号' : '批次号'}不能为空，请修正后重新导入`);
      const duplicateObjectRows = parsedRows.filter((row, index) => parsedRows.findIndex((item) => item.objectNo === row.objectNo) !== index || pendingObjects.some((item) => item.objectNo.trim() === row.objectNo) || objectRows.some((item) => item.objectNo.trim() === row.objectNo)).map((row) => row.rowNumber);
      if (duplicateObjectRows.length > 0) throw new Error(`导入失败：第 ${duplicateObjectRows.join('、')} 行${isSnProduction ? 'SN编号' : '批次号'}重复`);
      const invalidDateRows = parsedRows.filter((row) => row.plannedStartAt && row.plannedEndAt && row.plannedEndAt < row.plannedStartAt).map((row) => row.rowNumber);
      if (invalidDateRows.length > 0) throw new Error(`导入失败：第 ${invalidDateRows.join('、')} 行计划结束时间早于开始时间`);
      const imported = parsedRows;
      if (imported.length === 0) throw new Error(`未识别到有效数据，请使用包含“${isSnProduction ? 'SN编号' : '批次号'}”的 CSV、XLS 或 XLSX 文件`);
      const importedQuantity = imported.reduce((sum, row) => sum + Number(row.targetQuantity), 0);
      if (importedQuantity > availableRemaining) throw new Error(`导入失败：导入数量合计 ${importedQuantity} 超出剩余可分配数量 ${availableRemaining}`);
      setPendingObjects((current) => [...current, ...imported]);
      setSplitTab(1);
      showMessage(`已导入 ${imported.length} 条待添加记录`);
    } catch (error) { showMessage(error instanceof Error ? error.message : '批次导入失败', 'error'); }
  };
  const downloadImportTemplate = async () => {
    const serial = isSnProduction;
    const sheetName = serial ? 'SN导入模板' : '批次导入模板';
    const filename = serial ? '生产SN导入模板.xlsx' : '生产批次导入模板.xlsx';
    const headers = serial ? ['SN编号', '计划开始时间', '计划结束时间', '备注'] : ['批次号', '数量', '计划开始时间', '计划结束时间', '备注'];
    const example = serial ? ['SN-001', '2026-08-29 08:00', '2026-08-29 18:00', '可为空'] : ['BATCH-001', 1, '2026-08-29 08:00', '2026-08-29 18:00', '可为空'];
    const requiredColumns = new Set(serial ? ['SN编号'] : ['批次号', '数量']);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'eDHR';
    workbook.created = new Date();
    const worksheet = workbook.addWorksheet(sheetName, { properties: { tabColor: { argb: 'FF2F75B5' } }, views: [{ showGridLines: false }] });
    worksheet.columns = headers.map((header) => ({ header, key: header, width: header === '备注' ? 28 : header.includes('时间') ? 22 : 18 }));
    worksheet.mergeCells(1, 1, 1, headers.length);
    worksheet.getCell('A1').value = serial ? '生产 SN 导入模板' : '生产批次导入模板';
    worksheet.mergeCells(2, 1, 2, headers.length);
    worksheet.getCell('A2').value = `请按列填写${serial ? ' SN 编号' : '批次号、数量'}；红色表头为必填字段，示例数据请删除后再导入。`;
    worksheet.mergeCells(3, 1, 3, headers.length);
    worksheet.getCell('A3').value = `示例：${serial ? 'SN编号=SN-001；计划开始时间=2026-08-29 08:00；计划结束时间=2026-08-29 18:00；备注=可为空' : '批次号=BATCH-001；数量=1；计划开始时间=2026-08-29 08:00；计划结束时间=2026-08-29 18:00；备注=可为空'}`;
    headers.forEach((header, index) => {
      worksheet.getCell(5, index + 1).value = header;
      worksheet.getCell(6, index + 1).value = example[index];
    });
    for (let row = 7; row <= 25; row += 1) {
      headers.forEach((_, index) => { worksheet.getCell(row, index + 1).value = ''; });
    }
    const border = { style: 'thin' as const, color: { argb: 'FFD9E2F3' } };
    const bodyBorder = { top: border, left: border, bottom: border, right: border };
    worksheet.getRow(1).height = 30;
    worksheet.getRow(2).height = 24;
    worksheet.getRow(3).height = 30;
    worksheet.getRow(5).height = 28;
    worksheet.getRow(6).height = 24;
    worksheet.getCell('A1').font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF1F4E78' } };
    worksheet.getCell('A1').alignment = { horizontal: 'left', vertical: 'middle' };
    worksheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF3F8' } };
    [2, 3].forEach((rowNumber) => {
      const cell = worksheet.getCell(rowNumber, 1);
      cell.font = { name: 'Arial', size: 10, color: { argb: 'FF5B6573' } };
      cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowNumber === 2 ? 'FFF5F8FB' : 'FFFFF8E8' } };
    });
    headers.forEach((header, index) => {
      const cell = worksheet.getCell(5, index + 1);
      cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: requiredColumns.has(header) ? 'FFC62828' : 'FF1F2937' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: requiredColumns.has(header) ? 'FFFFE8E8' : 'FFE8F1F8' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = bodyBorder;
    });
    for (let row = 6; row <= 25; row += 1) {
      headers.forEach((_, index) => {
        const cell = worksheet.getCell(row, index + 1);
        cell.font = { name: 'Arial', size: 10, color: { argb: row === 6 ? 'FF5B6573' : 'FF1F2937' }, italic: row === 6 };
        cell.alignment = { vertical: 'middle', horizontal: index === headers.length - 1 ? 'left' : 'center' };
        cell.border = bodyBorder;
        if (row === 6) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBF0' } };
      });
    }
    worksheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: 25, column: headers.length } };
    worksheet.views = [{ state: 'frozen', ySplit: 5, showGridLines: false }];
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    window.setTimeout(() => {
      URL.revokeObjectURL(link.href);
      link.remove();
    }, 0);
  };
  const processVersionFor = (id: string) => (processOptions.data ?? []).find((option) => option.id === id)?.version || (id === objectOrder?.processVersionId ? objectOrder.processVersion : '-');
  const pendingTable = <TableContainer sx={{ maxHeight: { xs: 260, lg: 330 }, overflow: 'auto' }}><Table stickyHeader size="small" sx={{ minWidth: 860 }}><TableHead><TableRow sx={{ '& .MuiTableCell-root': tableHeaderCellSx }}>{[isSnProduction ? 'SN编号' : '批次号', '状态', '制程版本', '数量', '计划开始', '计划结束', '备注', '操作'].map((label) => <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{pendingObjects.length === 0 ? <TableRow><TableStateCell colSpan={8} align="center" sx={{ height: 120, color: '#909399' }}>暂无待提交{isSnProduction ? 'SN' : '批次'}</TableStateCell></TableRow> : pendingObjects.map((item, index) => <TableRow key={`${item.objectNo}-${index}`} sx={{ ...tableRowSx, bgcolor: '#fffaf0' }}><TableCell>{item.objectNo || '系统生成'}</TableCell><TableCell><StatusBadge label="待提交" color="warning" /></TableCell><TableCell>{processVersionFor(item.processVersionId)}</TableCell><TableCell>{item.targetQuantity}</TableCell><TableCell>{item.plannedStartAt ? formatDateTime(item.plannedStartAt) : '-'}</TableCell><TableCell>{item.plannedEndAt ? formatDateTime(item.plannedEndAt) : '-'}</TableCell><TableCell sx={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.remark || '-'}</TableCell><TableCell><Tooltip title="移除" arrow><IconButton size="small" aria-label="移除待添加批次" onClick={() => setPendingObjects((current) => current.filter((_, rowIndex) => rowIndex !== index))}><DeleteOutline fontSize="small" /></IconButton></Tooltip></TableCell></TableRow>)}</TableBody></Table></TableContainer>;
  const objectTable = <TableContainer sx={{ maxHeight: { xs: 360, lg: 460 }, overflow: 'auto' }}><Table stickyHeader size="small" sx={{ minWidth: 1060 }}><TableHead><TableRow sx={{ '& .MuiTableCell-root': tableHeaderCellSx }}>{[isSnProduction ? 'SN编号' : '批次号', '状态', '制程版本', '数量', '良品', 'NG', '报废', '计划开始', '计划结束', '备注'].map((label) => <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{objects.isLoading ? <TableRow><TableStateCell colSpan={10} align="center" sx={{ height: 160 }}><CircularProgress size={24} /></TableStateCell></TableRow> : objects.isError ? <TableRow><TableStateCell colSpan={10} align="center" sx={{ height: 160, color: '#c62828' }}>生产对象加载失败</TableStateCell></TableRow> : objectRows.length === 0 ? <TableRow><TableStateCell colSpan={10} align="center" sx={{ height: 160, color: '#909399' }}>暂无已拆分{isSnProduction ? 'SN' : '批次'}</TableStateCell></TableRow> : objectRows.map((item) => <TableRow key={item.id} sx={tableRowSx}><TableCell>{item.objectNo}</TableCell><TableCell>{statusBadge(item.status, objectStatusLabels)}</TableCell><TableCell>{item.processVersion}</TableCell><TableCell>{item.targetQuantity}</TableCell><TableCell>{item.goodQuantity}</TableCell><TableCell>{item.ngQuantity}</TableCell><TableCell>{item.scrapQuantity}</TableCell><TableCell>{item.plannedStartAt ? formatDateTime(item.plannedStartAt) : '-'}</TableCell><TableCell>{item.plannedEndAt ? formatDateTime(item.plannedEndAt) : '-'}</TableCell><TableCell sx={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.remark || '-'}</TableCell></TableRow>)}</TableBody></Table></TableContainer>;
  const selectProduct = (productId: string) => setForm((current) => ({ ...current, productId, processVersionId: '' }));
  const submitSearch = () => { setPage(1); setSubmittedKeyword(keyword.trim()); };

  return <Box sx={{ minWidth: 0, height: { xs: 'auto', lg: 'calc(100vh - 150px)' }, display: 'flex', flexDirection: 'column', gap: 1.5, minHeight: 0, overflow: 'hidden' }}>
    <Box sx={{ flex: '0 0 auto', border: '1px solid #e4e7ed', borderRadius: 1, bgcolor: '#fff', p: 2 }}><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5, alignItems: 'center' }}>
      <TextField fullWidth size="small" label="工单号/产品名称/编码" placeholder="请输入" value={keyword} onChange={(event) => setKeyword(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submitSearch(); }} sx={{ '& .MuiInputBase-root': { height: 40 }, '& .MuiInputBase-input': { boxSizing: 'border-box' } }} InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }} />
      <TextField select fullWidth size="small" label="状态" value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }} sx={{ '& .MuiInputBase-root': { height: 40 } }}><MenuItem value="">全部</MenuItem>{Object.entries(statusLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>
      <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="flex-end"><Button size="small" sx={{ height: 40, width: 80, minWidth: 80 }} variant="outlined" startIcon={<RestartAlt />} onClick={() => { setKeyword(''); setSubmittedKeyword(''); setStatus(''); setPage(1); }}>重置</Button><Button size="small" sx={{ height: 40, width: 80, minWidth: 80 }} variant="contained" startIcon={<Search />} onClick={submitSearch}>查询</Button></Stack>
    </Box></Box>
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, border: '1px solid #e4e7ed', borderRadius: 1, bgcolor: '#fff', overflow: 'hidden' }}>
      <Box sx={{ flex: '0 0 auto', px: 2, py: 0.75, minHeight: 48, borderBottom: '1px solid #ebeef5', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}><Button variant="contained" size="small" startIcon={<Add />} onClick={openCreate}>新建工单</Button></Box>
      <TableContainer sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}><Table stickyHeader size="small" sx={{ tableLayout: 'fixed', minWidth: 1200 }}>
        <colgroup><col style={{ width: 180 }} /><col style={{ width: 190 }} /><col style={{ width: 120 }} /><col style={{ width: 104 }} /><col style={{ width: 104 }} /><col style={{ width: 110 }} /><col style={{ width: 164 }} /><col style={{ width: 104 }} /><col style={{ width: 128 }} /></colgroup>
        <TableHead><TableRow sx={{ '& .MuiTableCell-root': tableHeaderCellSx }}>{['工单号', '产品', '制程版本', '生产模式', '生产形态', '计划数量', '创建时间', '状态', '操作'].map((label) => <TableCell key={label} align={label === '操作' ? 'center' : undefined} sx={label === '操作' ? { ...tableHeaderCellSx, ...operationColumnSx, bgcolor: '#f5f7fa', zIndex: 4 } : label === '状态' ? { ...tableHeaderCellSx, ...statusColumnSx, bgcolor: '#f5f7fa', zIndex: 4 } : tableHeaderCellSx}>{label}</TableCell>)}</TableRow></TableHead>
        <TableBody>{orders.isLoading ? <TableRow><TableStateCell colSpan={9} align="center" sx={{ height: 240, color: '#909399' }}><CircularProgress size={24} /></TableStateCell></TableRow> : orders.isError ? <TableRow><TableStateCell colSpan={9} align="center" sx={{ height: 240, color: '#c62828' }}>工单数据加载失败</TableStateCell></TableRow> : (orders.data?.content ?? []).length === 0 ? <TableRow><TableStateCell colSpan={9} align="center" sx={{ height: 240, color: '#909399' }}>暂无数据</TableStateCell></TableRow> : orders.data!.content.map((item) => <TableRow key={item.id} hover tabIndex={0} onClick={() => openDetail(item)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') openDetail(item); }} sx={{ ...tableRowSx, cursor: 'pointer' }}>
          <TableCell sx={{ whiteSpace: 'nowrap' }} title={item.orderNo}>{item.orderNo}</TableCell><TableCell sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${item.productName}（${item.productCode}）`}><Typography variant="body2" noWrap>{item.productName}</Typography><Typography variant="caption" display="block" color="text.secondary" noWrap>{item.productCode}</Typography></TableCell><TableCell sx={{ whiteSpace: 'nowrap' }}>{item.processVersion || '-'}</TableCell><TableCell sx={{ whiteSpace: 'nowrap' }}>{item.productionMode || '-'}</TableCell><TableCell sx={{ whiteSpace: 'nowrap' }}>{formLabels[item.productionForm || ''] || item.productionForm || '-'}</TableCell><TableCell>{item.plannedQuantity}</TableCell><TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(item.createdAt)}</TableCell><TableCell sx={statusColumnSx}>{statusBadge(item.status, statusLabels)}</TableCell>
          <TableCell align="center" sx={operationColumnSx} onClick={(event) => event.stopPropagation()}>
            <Tooltip title="生产对象" arrow><IconButton size="small" aria-label="生产对象" onClick={() => openObjects(item)}><ViewList fontSize="small" /></IconButton></Tooltip>
            {item.status === 'CREATED' ? <Tooltip title="编辑" arrow><IconButton size="small" aria-label="编辑" onClick={() => openEdit(item)}><Edit fontSize="small" /></IconButton></Tooltip> : <Tooltip title="编辑（仅已创建工单可用）" arrow><span><IconButton size="small" disabled aria-label="编辑暂不可用"><Edit fontSize="small" /></IconButton></span></Tooltip>}
            {item.status === 'CREATED' ? <Tooltip title="取消" arrow><IconButton size="small" aria-label="取消" color="error" onClick={() => setCancelTarget(item)}><Cancel fontSize="small" /></IconButton></Tooltip> : item.status === 'COMPLETED' ? <Tooltip title="关闭" arrow><IconButton size="small" aria-label="关闭" onClick={() => setCloseTarget(item)}><Close fontSize="small" /></IconButton></Tooltip> : <Tooltip title="取消（仅已创建工单可用）" arrow><span><IconButton size="small" disabled aria-label="取消暂不可用"><Cancel fontSize="small" /></IconButton></span></Tooltip>}
          </TableCell>
        </TableRow>)}</TableBody>
      </Table></TableContainer>
      <Box sx={{ flex: '0 0 auto', minHeight: 56, px: 2, borderTop: '1px solid #ebeef5', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><Typography variant="body2" sx={{ color: '#606266' }}>共 {orders.data?.totalElements ?? 0} 条数据</Typography>{(orders.data?.totalPages ?? 0) > 1 && <Pagination size="small" count={orders.data?.totalPages} page={page} onChange={(_, value) => setPage(value)} />}</Box>
    </Box>

    <AppDialog open={dialogOpen} onClose={save.isPending ? undefined : () => setDialogOpen(false)} maxWidth="md" fullWidth>
      <DialogTitle>{editing ? '编辑工单' : '新建工单'}</DialogTitle>
      <DialogContent dividers sx={{ p: 0, bgcolor: '#fff' }}>
        <Stack spacing={1.5} sx={{ p: { xs: 1.5, sm: 2.5 } }}>
          <FormSection title="基础信息">
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }}>
              <TextField autoFocus={!editing} required fullWidth size="small" label="工单编号" value={form.orderNo} onChange={(event) => setForm({ ...form, orderNo: event.target.value })} />
              <TextField fullWidth size="small" label="订单编号" value={form.orderNumber} onChange={(event) => setForm({ ...form, orderNumber: event.target.value })} />
              <TextField select required fullWidth size="small" label="产品" value={form.productId} onChange={(event) => selectProduct(event.target.value)} SelectProps={{ renderValue: () => selectedProduct ? `${selectedProduct.name}（${selectedProduct.code}）` : '' }} className={form.productId ? 'has-value' : undefined} sx={clearableSelectSx} InputProps={{ endAdornment: form.productId ? <InputAdornment position="end" className="select-clear-adornment"><Tooltip title="清除产品" arrow><IconButton className="select-clear-button" size="small" aria-label="清除产品" onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); selectProduct(''); }}><Clear fontSize="small" /></IconButton></Tooltip></InputAdornment> : undefined }}>
                {(products.data?.content ?? []).map((product) => <MenuItem key={product.id} value={String(product.id)}>{product.name}（{product.code}）</MenuItem>)}
              </TextField>
              <TextField select fullWidth size="small" label="制程版本" value={form.processVersionId} disabled={!form.productId || process.isLoading} onChange={(event) => setForm({ ...form, processVersionId: event.target.value })} SelectProps={{ renderValue: (selected) => <ProcessVersionValue version={versions.find((version) => version.id === String(selected))} /> }} className={form.processVersionId ? 'has-value' : undefined} sx={clearableSelectSx} InputProps={{ endAdornment: form.processVersionId ? <InputAdornment position="end" className="select-clear-adornment"><Tooltip title="清除制程版本" arrow><IconButton className="select-clear-button" size="small" aria-label="清除制程版本" onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); setForm((current) => ({ ...current, processVersionId: '' })); }}><Clear fontSize="small" /></IconButton></Tooltip></InputAdornment> : undefined }}>
                {versions.filter((version) => version.status === 'ACTIVE').map((version) => <MenuItem key={version.id} value={version.id}><ProcessVersionOption version={version} /></MenuItem>)}
              </TextField>
            </Box>
          </FormSection>
          <FormSection title="计划信息">
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }}>
              <TextField required fullWidth size="small" label="计划数量" type="number" inputProps={{ min: 0, step: 'any' }} value={form.plannedQuantity} onChange={(event) => setForm({ ...form, plannedQuantity: event.target.value })} sx={{ gridColumn: { sm: '1 / -1' } }} />
              <TextField fullWidth size="small" label="计划开始时间" type="datetime-local" InputLabelProps={{ shrink: true }} value={form.plannedStartAt} onChange={(event) => setForm({ ...form, plannedStartAt: event.target.value })} />
              <TextField fullWidth size="small" label="计划结束时间" type="datetime-local" InputLabelProps={{ shrink: true }} error={endBeforeStart} helperText={endBeforeStart ? '计划结束时间不能早于计划开始时间' : undefined} value={form.plannedEndAt} onChange={(event) => setForm({ ...form, plannedEndAt: event.target.value })} />
            </Box>
          </FormSection>
          <FormSection title="备注">
            <TextField fullWidth size="small" label="备注" placeholder="请输入备注（可选）" multiline minRows={3} value={form.remark} onChange={(event) => setForm({ ...form, remark: event.target.value })} />
          </FormSection>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}><Button onClick={() => setDialogOpen(false)} disabled={save.isPending}>取消</Button><Button variant="contained" onClick={() => save.mutate()} disabled={!canSave}>{save.isPending ? '保存中...' : '保存'}</Button></DialogActions>
    </AppDialog>

    <AppDialog open={objectOrder !== null} onClose={() => setObjectOrder(null)} maxWidth="lg" fullWidth>
      <DialogTitle>{canSplit ? '生产对象管理' : '生产对象查看'}</DialogTitle>
      <DialogContent dividers sx={{ p: { xs: 1.5, sm: 2.5 }, bgcolor: '#fff' }}>{objectOrder && <Stack spacing={2}>
        <Box sx={{ p: 1.25, bgcolor: '#fff', border: '1px solid #e4e7ed', borderRadius: 1 }}><Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(5, minmax(0, 1fr))' }, gap: 1.25, alignItems: 'center' }}><DetailField label="工单编号">{objectOrder.orderNo}</DetailField><DetailField label="产品">{objectOrder.productName || '-'}{objectOrder.productCode ? `（${objectOrder.productCode}）` : ''}</DetailField><DetailField label="生产形态">{formLabels[objectOrder.productionForm || ''] || objectOrder.productionForm || '拆分时确定'}</DetailField><DetailField label="计划数量">{objectOrder.plannedQuantity}</DetailField><DetailField label="已分配">{allocated}</DetailField><DetailField label="剩余">{remaining}</DetailField>{objectOrder.processVersionId && <Box sx={{ minWidth: 0, gridColumn: { xs: '1 / -1', sm: 'span 3' } }}><Stack direction="row" spacing={1} alignItems="center"><Box sx={{ minWidth: 0 }}><Typography variant="caption" sx={{ display: 'block', color: '#909399', mb: 0.25 }}>制程版本</Typography><Stack direction="row" spacing={0.75} alignItems="baseline"><Typography variant="body2" noWrap sx={{ color: '#303133', fontWeight: 600 }}>{selectedProcess?.version || objectOrder.processVersion || '-'}</Typography><Button size="small" variant="text" onClick={() => setProcessPreviewOpen(true)} sx={{ flexShrink: 0, minWidth: 'auto', p: 0, lineHeight: 1.4 }}>预览版本</Button></Stack><Typography variant="caption" noWrap sx={{ display: 'block', color: '#909399' }}>工艺路线 {selectedProcess?.routeVersion || '-'} · DHR模板 {selectedProcess?.dhrTemplateVersion || '-'}</Typography></Box></Stack></Box>}</Box></Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 0.9fr) minmax(480px, 1.2fr)' }, gap: 1.5, alignItems: 'start' }}>
        {canSplit && <Box sx={{ p: 1.5, bgcolor: '#fff', border: '1px solid #e4e7ed', borderRadius: 1, order: { xs: 2, lg: 2 } }}><Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}><Typography variant="subtitle2" sx={{ color: '#303133', fontWeight: 600 }}>待添加批次（{pendingObjects.length}）</Typography><Typography variant="caption" sx={{ color: '#909399' }}>提交后进入下方已拆分批次</Typography></Stack>{pendingTable}</Box>}
        {canSplit && <Box sx={{ p: 1.5, bgcolor: '#fff', border: '1px solid #e4e7ed', borderRadius: 1, order: { xs: 1, lg: 1 } }}>
          <Typography variant="subtitle2" sx={{ mb: 1.25, color: '#303133', fontWeight: 600 }}>新增{isSnProduction ? ' SN' : '批次'}生产对象</Typography>
          {!objectOrder.processVersionId && <Box sx={{ mb: 1.5, p: 1.5, bgcolor: '#f8fafc', border: '1px solid #e4e7ed', borderRadius: 1 }}><TextField select fullWidth size="small" label="制程版本" value={splitForm.processVersionId} disabled={!canSplit} onChange={(event) => setSplitForm({ ...splitForm, processVersionId: event.target.value })} SelectProps={{ displayEmpty: true, renderValue: (value) => { const selected = (processOptions.data ?? []).find((option) => option.id === String(value)); return selected ? <ProcessVersionOption version={selected} /> : <Typography variant="body2" sx={{ color: '#909399' }}>请选择制程版本</Typography>; } }}>
            <MenuItem value=""><Typography variant="body2" sx={{ color: '#909399' }}>请选择制程版本</Typography></MenuItem>{(processOptions.data ?? []).filter((option) => option.productionMode === '量产').map((option) => <MenuItem key={option.id} value={option.id}><ProcessVersionOption version={option} /></MenuItem>)}
          </TextField></Box>}
          <Tabs value={splitTab} onChange={(_, value) => setSplitTab(value)} variant="scrollable" allowScrollButtonsMobile sx={{ minHeight: 40, mb: 1.25, borderBottom: '1px solid #ebeef5', '& .MuiTabs-indicator': { height: 2 } }}><Tab sx={{ minHeight: 40, py: 0.5, px: 1.25 }} icon={<PlaylistAdd fontSize="small" />} iconPosition="start" label="批量添加" /><Tab sx={{ minHeight: 40, py: 0.5, px: 1.25 }} icon={<UploadFile fontSize="small" />} iconPosition="start" label="导入批次" /><Tab sx={{ minHeight: 40, py: 0.5, px: 1.25 }} icon={<PlaylistAdd fontSize="small" />} iconPosition="start" label="手动添加" /></Tabs>
          {splitTab === 1 ? <Box sx={{ p: 1.5, bgcolor: '#fbfdff', border: '1px dashed #b8c7d9', borderRadius: 1 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}><Stack direction="row" spacing={0.75} alignItems="center"><Typography variant="body2" sx={{ color: '#303133', fontWeight: 600 }}>按模板导入{isSnProduction ? ' SN' : '批次'}</Typography><Tooltip title={`${isSnProduction ? 'SN编号必填，数量由 SN 形态固定为 1' : '批次号、数量必填'}；计划开始时间、计划结束时间和备注可选。上传后会直接加入右侧待添加清单，确认无误后再提交。`} arrow><InfoOutlined sx={{ fontSize: 16, color: '#909399', cursor: 'help' }} /></Tooltip></Stack><Stack direction="row" spacing={0.75} alignItems="center"><Button size="small" onClick={downloadImportTemplate} disabled={!canSplit}>下载导入模板</Button><Button component="label" size="small" variant="contained" startIcon={<UploadFile />} disabled={!canSplit || !splitForm.processVersionId}>选择文件<input hidden type="file" accept=".csv,.xlsx,.xls" onChange={(event) => { void importPendingObjects(event.target.files?.[0]); event.currentTarget.value = ''; }} /></Button></Stack></Stack>
            <Typography variant="caption" sx={{ display: 'block', color: '#909399', mb: 1 }}>示例：{isSnProduction ? 'SN编号=SN-001；计划开始时间=2026-08-29 08:00；计划结束时间=2026-08-29 18:00；备注=可为空' : '批次号=BATCH-001；数量=1；计划开始时间=2026-08-29 08:00；计划结束时间=2026-08-29 18:00；备注=可为空'}</Typography>
            <Table size="small" sx={{ mb: 1.25, bgcolor: '#fff' }}><TableHead><TableRow sx={{ '& .MuiTableCell-root': tableHeaderCellSx }}>{['字段', '是否必填', '示例'].map((label) => <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead><TableBody><TableRow><TableCell>{isSnProduction ? 'SN编号' : '批次号'}</TableCell><TableCell>必填</TableCell><TableCell>{isSnProduction ? 'SN-001' : 'BATCH-001'}</TableCell></TableRow>{!isSnProduction && <TableRow><TableCell>数量</TableCell><TableCell>必填</TableCell><TableCell>1</TableCell></TableRow>}<TableRow><TableCell>计划开始时间</TableCell><TableCell>非必填</TableCell><TableCell>2026-08-29 08:00</TableCell></TableRow><TableRow><TableCell>计划结束时间</TableCell><TableCell>非必填</TableCell><TableCell>2026-08-29 18:00</TableCell></TableRow><TableRow><TableCell>备注</TableCell><TableCell>非必填</TableCell><TableCell>可为空</TableCell></TableRow></TableBody></Table>
          </Box> : <>
            {splitTab === 0 && !isSnProduction && <RadioGroup row value={batchAddType} onChange={(event) => setBatchAddType(event.target.value as 'count' | 'quantity')} sx={{ mb: 0.75 }}><FormControlLabel value="count" control={<Radio size="small" />} label="按批次数" /><FormControlLabel value="quantity" control={<Radio size="small" />} label="按每批数量" /></RadioGroup>}
            <Typography variant="caption" sx={{ display: 'block', mb: 1, color: '#909399' }}>{splitTab === 0 ? (isSnProduction ? '输入 SN 数量后，系统会按每个 SN 生成一条数量为 1 的生产对象；填写 SN 前缀后自动生成“前缀-001、前缀-002……”格式的编号。' : batchAddType === 'count' ? '输入批次数后，系统会将当前可分配数量平均分配；不能整除时，最后一批承接余数。' : '输入每批数量后，系统会按该数量生成批次，最后一批自动承接剩余数量。') : splitTab === 2 ? `填写一个${isSnProduction ? 'SN' : '批次'}的${isSnProduction ? '编号' : '数量和编号'}，可选填计划时间与备注后加入待添加清单。` : ''}</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.25 }}>
              {(splitTab !== 2 || !isSnProduction) && <TextField required size="small" label={splitTab === 0 ? (isSnProduction ? 'SN数量' : batchAddType === 'count' ? '批次数' : '每批数量') : '数量'} type="number" inputProps={{ min: 0, step: splitTab === 0 && (isSnProduction || batchAddType === 'count') ? 1 : 'any' }} value={splitForm.targetQuantity} onChange={(event) => setSplitForm({ ...splitForm, targetQuantity: event.target.value })} disabled={!canSplit} />}
              <TextField required={isSnProduction && splitTab === 2} size="small" label={isSnProduction ? 'SN编号' : '批次号（可选）'} placeholder={splitTab === 0 ? `${isSnProduction ? 'SN' : '批次'}前缀，可选` : (isSnProduction ? '请输入SN编号' : '手动输入，可选')} value={splitForm.objectNo} onChange={(event) => setSplitForm({ ...splitForm, objectNo: event.target.value })} disabled={!canSplit} />
              <TextField size="small" label="计划开始时间" type="datetime-local" InputLabelProps={{ shrink: true }} value={splitForm.plannedStartAt} onChange={(event) => setSplitForm({ ...splitForm, plannedStartAt: event.target.value })} disabled={!canSplit} />
              <TextField size="small" label="计划结束时间" type="datetime-local" InputLabelProps={{ shrink: true }} value={splitForm.plannedEndAt} onChange={(event) => setSplitForm({ ...splitForm, plannedEndAt: event.target.value })} disabled={!canSplit} />
              <TextField size="small" label="备注" multiline minRows={2} value={splitForm.remark} onChange={(event) => setSplitForm({ ...splitForm, remark: event.target.value })} disabled={!canSplit} sx={{ gridColumn: { sm: '1 / -1' } }} />
            </Box>
            <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 1.5 }}>
              {splitTab === 2 && <Button variant="contained" startIcon={<Add />} onClick={addPendingObject} disabled={!canSplit || !splitForm.processVersionId || (isSnProduction ? !splitForm.objectNo.trim() : Number(splitForm.targetQuantity) <= 0 || Number(splitForm.targetQuantity) > availableRemaining)}>加入清单</Button>}
              {splitTab === 0 && <Button variant="contained" startIcon={<PlaylistAdd />} onClick={addPendingBatch} disabled={!canSplit || !splitForm.processVersionId || Number(splitForm.targetQuantity) <= 0 || ((isSnProduction || batchAddType === 'count') && Math.floor(Number(splitForm.targetQuantity)) > availableRemaining)}>批量加入</Button>}
            </Stack>
          </>}
        </Box>}
        </Box>
        <Box sx={{ p: 1.5, bgcolor: '#fff', border: '1px solid #e4e7ed', borderRadius: 1 }}><Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}><Typography variant="subtitle2" sx={{ color: '#303133', fontWeight: 600 }}>已拆分批次（{objectRows.length}）</Typography><Typography variant="caption" sx={{ color: '#909399' }}>已落库批次</Typography></Stack>{objectTable}</Box>
      </Stack>}</DialogContent><DialogActions sx={{ px: 3, py: 1.5 }}><Button onClick={() => setObjectOrder(null)}>关闭</Button>{canSplit && <Button variant="contained" onClick={() => split.mutate()} disabled={pendingObjects.length === 0 || split.isPending}>{split.isPending ? '提交中...' : `提交待添加（${pendingObjects.length}）`}</Button>}</DialogActions></AppDialog>

    <WorkOrderDetailDrawer open={detailOrder !== null} order={detailOrder} tab={detailTab} onTabChange={setDetailTab} auditRecords={auditRecords} auditLoading={auditQuery.isLoading} auditError={auditQuery.isError} onClose={() => setDetailOrder(null)} />
    <ProcessVersionPreviewDialog open={processPreviewOpen} version={previewVersion} loading={processPreviewQuery.isLoading} error={processPreviewQuery.isError} onClose={() => setProcessPreviewOpen(false)} />
    <ConfirmDialog open={cancelTarget !== null} title="取消工单" message={cancelTarget ? `确定取消工单「${cancelTarget.orderNo}」吗？取消后将不能继续拆分生产对象。` : ''} confirmText="取消工单" destructive loading={cancel.isPending} onCancel={() => setCancelTarget(null)} onConfirm={() => cancelTarget && cancel.mutate(cancelTarget.id)} />
    <ConfirmDialog open={closeTarget !== null} title="关闭工单" message={closeTarget ? `确定关闭工单「${closeTarget.orderNo}」吗？关闭后将不能继续进行生产操作。` : ''} confirmText="关闭工单" loading={close.isPending} onCancel={() => setCloseTarget(null)} onConfirm={() => closeTarget && close.mutate(closeTarget.id)} />
    <ConfirmDialog open={cancelObject !== null} title="取消生产对象" message={cancelObject ? `确定取消生产对象「${cancelObject.objectNo}」吗？` : ''} confirmText="取消对象" destructive loading={objectAction.isPending} onCancel={() => setCancelObject(null)} onConfirm={() => cancelObject && objectAction.mutate({ action: 'cancel', id: cancelObject.id })} />
  </Box>;
}
