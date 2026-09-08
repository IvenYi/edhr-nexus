import TableStateCell from '@/components/TableStateCell';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode } from 'react';
import { useMutation,
  useQuery,
  useQueryClient } from '@tanstack/react-query';
import { Background, MarkerType, ReactFlow, ReactFlowProvider, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useNavigate,
  useLocation,
  useParams } from 'react-router-dom';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputAdornment,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AppDialog from '@/components/AppDialog';
import {
  Add,
  ArrowBack,
  ContentCopy,
  DeleteOutline,
  EditOutlined,
  ExpandMore,
  HistoryOutlined,
  PlaylistAddCheck,
  Search,
} from '@mui/icons-material';
import StatusBadge from '@/components/StatusBadge';
import { getRdoVersionStatusMeta } from '@/utils/rdoVersionStatus';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useSnackbar } from '@/components/SnackbarProvider';
import {
  createProductProcessVersion,
  deleteProductProcessVersion,
  getProductProcessOperationAuditLogs,
  getProductProcessVersionAuditLogs,
  getProductModelOptions,
  getProductModelWorkspace,
  type ProductModelOptions,
  type ProductModelDocumentOption,
  type ProductModelRouteOption,
  type ProductModelTemplateOption,
  type ProductProcessOperation,
  type ProductProcessVersion,
  type ProductProcessVersionPayload,
  updateProductProcessVersion,
} from '@/api/product-modeling';
import type { AuditLogItem } from '@/api/audit';
import type { PageResult } from '@/types/common';
import { getProcessRouteGraph, type RouteGraphResponse, type RouteNodeRecord } from '@/api/master-data';
import { DhrDirectoryFormPicker, DocumentPreviewDialog, FormTemplatePreviewDialog, ReferenceBindingList, isPdfDocument, type RdoVersionChoice } from './components/ProductProcessVersionEditorDialog';

type VersionDialogMode = 'create' | 'copy' | 'edit';

interface VersionForm {
  version: string;
  sourceVersionId: string | null;
  productionMode: string;
  productionForm: string;
  routeVersionId: string;
  dhrTemplateVersionId: string;
  description: string;
  effectiveFrom: string;
  effectiveTo: string;
}

interface OperationDraft {
  routeNodeKey: string;
  operationName: string;
  operationCode?: string | null;
  sortOrder: number;
  forms: Array<{ dhrTemplateItemId?: string | null; formTemplateVersionId: string; required: boolean; sortOrder: number }>;
  documents: Array<{ documentVersionId: string; sortOrder: number; pageStart?: number | null; pageEnd?: number | null }>;
}

const DEFAULT_PRODUCTION_MODE = '量产';
const PRODUCTION_MODALITY_OPTIONS = ['批次', 'SN'];

function normalizeProductionForm(value: string) {
  return PRODUCTION_MODALITY_OPTIONS.includes(value) ? value : '';
}

const emptyVersionForm: VersionForm = {
  version: 'V1.0',
  sourceVersionId: null,
  productionMode: DEFAULT_PRODUCTION_MODE,
  productionForm: '',
  routeVersionId: '',
  dhrTemplateVersionId: '',
  description: '',
  effectiveFrom: '',
  effectiveTo: '',
};

function toInputDateTime(value?: string | null) {
  return value ? value.replace(' ', 'T').slice(0, 16) : '';
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.replace('T', ' ').slice(0, 16) : date.toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-');
}

function nextVersionLabel(versions: ProductProcessVersion[]) {
  const existing = new Set(versions.map((item) => item.version.toUpperCase()));
  let candidate = versions.length + 1;
  while (existing.has(`V${candidate}.0`)) candidate += 1;
  return `V${candidate}.0`;
}

function toPayload(form: VersionForm, operationBindings?: OperationDraft[]): ProductProcessVersionPayload {
  return {
    version: form.version.trim(),
    sourceVersionId: form.sourceVersionId || null,
    productionMode: form.productionMode.trim(),
    productionForm: form.productionForm.trim(),
    routeVersionId: form.routeVersionId,
    dhrTemplateVersionId: form.dhrTemplateVersionId,
    description: form.description.trim() || null,
    effectiveFrom: form.effectiveFrom || null,
    effectiveTo: form.effectiveTo || null,
    operationBindings: operationBindings?.map((operation) => ({
      routeNodeKey: operation.routeNodeKey,
      sortOrder: operation.sortOrder,
      forms: operation.forms.map((formBinding) => ({ ...formBinding })),
      documents: operation.documents.map((documentBinding) => ({ ...documentBinding })),
    })),
  };
}

function toVersionForm(version: ProductProcessVersion, sourceVersionId: string | null = null): VersionForm {
  return {
    version: version.version,
    sourceVersionId,
    productionMode: version.productionMode,
    productionForm: normalizeProductionForm(version.productionForm),
    routeVersionId: version.routeVersionId,
    dhrTemplateVersionId: version.dhrTemplateVersionId,
    description: version.description || '',
    effectiveFrom: toInputDateTime(version.effectiveFrom),
    effectiveTo: toInputDateTime(version.effectiveTo),
  };
}

function toOperationDrafts(nodes: RouteNodeRecord[], configured: ProductProcessOperation[]): OperationDraft[] {
  const existingByNodeKey = new Map(configured.map((operation) => [operation.routeNodeKey, operation]));
  return nodes
    .filter((node) => !node.nodeType || node.nodeType === 'OPERATION')
    .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0))
    .map((node, index) => {
      const current = existingByNodeKey.get(node.nodeKey);
      return {
        routeNodeKey: node.nodeKey,
        operationName: node.operationName || node.nodeKey,
        operationCode: node.operationCode,
        sortOrder: current?.sortOrder ?? node.sortOrder ?? index + 1,
        forms: (current?.forms ?? []).map((form) => ({ dhrTemplateItemId: form.dhrTemplateItemId, formTemplateVersionId: form.formTemplateVersionId, required: form.required, sortOrder: form.sortOrder ?? 0 })),
        documents: (current?.documents ?? []).map((document) => ({ documentVersionId: document.documentVersionId, sortOrder: document.sortOrder ?? 0, pageStart: document.pageStart ?? null, pageEnd: document.pageEnd ?? null })),
      };
    });
}

function ReadOnlyField({ label, value }: { label: string; value?: ReactNode }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" sx={{ color: '#909399', display: 'block', mb: 0.35 }}>{label}</Typography>
      <Typography component="div" variant="body2" sx={{ color: '#303133', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value ?? '-'}</Typography>
    </Box>
  );
}

const AUDIT_FIELD_LABELS: Record<string, string> = {
  version: '版本',
  productionMode: '生产模式',
  productionForm: '生产方式',
  routeVersion: '工艺路线版本',
  dhrTemplateVersion: '批记录模板版本',
  description: '版本说明',
  effectiveFrom: '生效时间',
  effectiveTo: '失效时间',
  status: '版本状态',
  operationBindings: '工序配置',
  operation: '工序',
  forms: '待填表单',
  documents: '工序文档',
  operationCount: '已配置工序数',
};

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

function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  if (Array.isArray(value)) return value.length ? value.map(formatAuditValue).join('、') : '-';
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${AUDIT_FIELD_LABELS[key] ?? key}：${formatAuditValue(item)}`)
      .join('；');
  }
  const normalized = String(value);
  return ['ACTIVE', 'PENDING', 'EXPIRED', 'DISABLED'].includes(normalized)
    ? getRdoVersionStatusMeta(normalized).label
    : normalized;
}

function AuditFieldBlock({ title, content }: { title: string; content: unknown }) {
  const fields = Object.entries(parseAuditContent(content)).filter(([key]) => key !== 'id' && key !== 'productProcessId');
  return (
    <Box sx={{ border: '1px solid #e4e7ed', borderRadius: 1, bgcolor: '#f8fafc', p: 1.25 }}>
      <Typography variant="caption" sx={{ display: 'block', mb: 0.75, color: '#606266', fontWeight: 600 }}>{title}</Typography>
      {fields.length === 0 ? <Typography variant="caption" sx={{ color: '#909399' }}>无</Typography> : (
        <Stack spacing={0.75}>
          {fields.map(([key, value]) => (
            <Box key={key} sx={{ display: 'grid', gridTemplateColumns: '92px minmax(0, 1fr)', columnGap: 1 }}>
              <Typography variant="caption" sx={{ color: '#606266' }}>{AUDIT_FIELD_LABELS[key] ?? key}</Typography>
              <Typography variant="caption" sx={{ color: '#303133', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{formatAuditValue(value)}</Typography>
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  );
}

export default function ProductModelingWorkspacePage() {
  const { productVersionId = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { showMessage } = useSnackbar();
  const [versionDialog, setVersionDialog] = useState<{ mode: VersionDialogMode; target?: ProductProcessVersion } | null>(null);
  const [versionForm, setVersionForm] = useState<VersionForm>(emptyVersionForm);
  const [deleteTarget, setDeleteTarget] = useState<ProductProcessVersion | null>(null);
  const [operationTarget, setOperationTarget] = useState<ProductProcessVersion | null>(null);
  const [operationDrafts, setOperationDrafts] = useState<OperationDraft[]>([]);
  const [auditTarget, setAuditTarget] = useState<ProductProcessVersion | null>(null);
  const handledRouteIntent = useRef<string | null>(null);

  const workspaceQuery = useQuery({
    queryKey: ['product-modeling-workspace', productVersionId],
    enabled: Boolean(productVersionId),
    queryFn: async () => (await getProductModelWorkspace(productVersionId)).data.data,
  });
  const optionsQuery = useQuery({
    queryKey: ['product-modeling-options', productVersionId, operationTarget?.dhrTemplateVersionId || versionForm.dhrTemplateVersionId],
    enabled: Boolean(productVersionId),
    queryFn: async () => (await getProductModelOptions(productVersionId, operationTarget?.dhrTemplateVersionId || versionForm.dhrTemplateVersionId || undefined)).data.data,
    placeholderData: (previous) => previous,
  });
  const versions = workspaceQuery.data?.model?.versions ?? [];
  const options = optionsQuery.data;
  const selectedOperationRoute = useMemo(() => {
    if (!operationTarget || !options) return null;
    return options.routes.find((route) => route.id === operationTarget.routeVersionId) ?? null;
  }, [operationTarget, options]);
  const graphQuery = useQuery({
    queryKey: ['product-modeling-route-nodes', selectedOperationRoute?.routeId, selectedOperationRoute?.id],
    enabled: Boolean(selectedOperationRoute),
    queryFn: async () => (await getProcessRouteGraph(selectedOperationRoute!.routeId, selectedOperationRoute!.id)).data.data,
  });
  const versionRoute = options?.routes.find((route) => route.id === versionForm.routeVersionId) ?? null;
  const versionRouteGraphQuery = useQuery({
    queryKey: ['product-modeling-version-route-graph', versionRoute?.routeId, versionRoute?.id],
    enabled: Boolean(versionRoute),
    queryFn: async () => (await getProcessRouteGraph(versionRoute!.routeId, versionRoute!.id)).data.data,
  });
  const versionAuditQuery = useQuery({
    queryKey: ['product-modeling-version-audit', auditTarget?.id],
    enabled: Boolean(auditTarget),
    queryFn: async () => (await getProductProcessVersionAuditLogs(auditTarget!.id)).data.data as PageResult<AuditLogItem>,
  });
  const operationAuditQuery = useQuery({
    queryKey: ['product-modeling-operation-audit', auditTarget?.id],
    enabled: Boolean(auditTarget),
    queryFn: async () => (await getProductProcessOperationAuditLogs(auditTarget!.id)).data.data as PageResult<AuditLogItem>,
  });
  const auditEvents = useMemo(() => [
    ...(versionAuditQuery.data?.content ?? []),
    ...(operationAuditQuery.data?.content ?? []),
  ].sort((left, right) => Date.parse(right.createdAt ?? right.operationTime ?? '') - Date.parse(left.createdAt ?? left.operationTime ?? '')),
  [operationAuditQuery.data?.content, versionAuditQuery.data?.content]);

  useEffect(() => {
    if (operationTarget && graphQuery.data) {
      setOperationDrafts(toOperationDrafts(graphQuery.data.nodes, operationTarget.operations));
    }
  }, [operationTarget, graphQuery.data]);

  const invalidateWorkspace = () => queryClient.invalidateQueries({ queryKey: ['product-modeling-workspace', productVersionId] });
  const saveVersionMutation = useMutation({
    mutationFn: async () => {
      if (!versionDialog) throw new Error('未选择制程配置版本');
      const payload = toPayload(versionForm);
      if (versionDialog.mode === 'edit' && versionDialog.target) {
        return updateProductProcessVersion(productVersionId, versionDialog.target.id, payload);
      }
      return createProductProcessVersion(productVersionId, payload);
    },
    onSuccess: async () => {
      await invalidateWorkspace();
      setVersionDialog(null);
      showMessage('制程配置版本已保存');
    },
    onError: (error: Error) => showMessage(error.message || '保存失败', 'error'),
  });
  const deleteMutation = useMutation({
    mutationFn: (target: ProductProcessVersion) => deleteProductProcessVersion(productVersionId, target.id),
    onSuccess: async () => { await invalidateWorkspace(); setDeleteTarget(null); showMessage('制程配置版本已删除'); },
    onError: (error: Error) => showMessage(error.message || '删除失败', 'error'),
  });
  const saveOperationsMutation = useMutation({
    mutationFn: async () => {
      if (!operationTarget) throw new Error('未选择制程配置版本');
      return updateProductProcessVersion(productVersionId, operationTarget.id, toPayload(toVersionForm(operationTarget), operationDrafts));
    },
    onSuccess: async () => { await invalidateWorkspace(); setOperationTarget(null); showMessage('工序配置已保存'); },
    onError: (error: Error) => showMessage(error.message || '保存失败', 'error'),
  });

  const openVersionDialog = (mode: VersionDialogMode, target?: ProductProcessVersion) => {
    if (mode === 'edit' && target) {
      setVersionForm(toVersionForm(target));
    } else if (mode === 'copy' && target) {
      setVersionForm({ ...toVersionForm(target, target.id), version: nextVersionLabel(versions), productionMode: DEFAULT_PRODUCTION_MODE, effectiveFrom: '', effectiveTo: '' });
    } else {
      setVersionForm({ ...emptyVersionForm, version: versions.length === 0 ? 'V1.0' : nextVersionLabel(versions) });
    }
    setVersionDialog({ mode, target });
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const intent = params.get('intent');
    const versionId = params.get('versionId');
    const key = `${intent || ''}:${versionId || ''}`;
    if (!intent || handledRouteIntent.current === key || workspaceQuery.isLoading) return;
    const target = versionId ? versions.find((item) => item.id === versionId) : undefined;
    if (intent !== 'create' && !target) return;
    handledRouteIntent.current = key;
    if (intent === 'create') openVersionDialog('create');
    if (intent === 'configure' && target) setOperationTarget(target);
    if (intent === 'edit' && target) openVersionDialog('edit', target);
    if (intent === 'copy' && target) openVersionDialog('copy', target);
    if (intent === 'audit' && target) setAuditTarget(target);
    if (intent === 'delete' && target) setDeleteTarget(target);
  }, [location.search, versions, workspaceQuery.isLoading]);

  if (workspaceQuery.isLoading || optionsQuery.isLoading) {
    return <Box sx={{ minHeight: 320, display: 'grid', placeItems: 'center' }}><CircularProgress size={28} /></Box>;
  }
  if (workspaceQuery.error || optionsQuery.error || !workspaceQuery.data || !options) {
    return <Box sx={{ p: 2, color: '#c62828' }}>产品建模信息加载失败，请返回产品管理后重试。</Box>;
  }
  const product = workspaceQuery.data.product;

  return (
    <Box sx={{ minWidth: 0, pb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Tooltip title="返回产品管理"><IconButton size="small" onClick={() => navigate('/master-data/products')}><ArrowBack fontSize="small" /></IconButton></Tooltip>
        <Typography variant="h6" sx={{ fontWeight: 600, color: '#303133' }}>产品建模</Typography>
        <Chip size="small" label={`${product.name} ${product.version || ''}`.trim()} sx={{ bgcolor: '#eef6ff', color: '#1677c8' }} />
        <Box sx={{ ml: 'auto' }}><Button variant="contained" startIcon={<Add />} onClick={() => openVersionDialog('create')}>新建制程配置版本</Button></Box>
      </Box>

      <Box sx={{ border: '1px solid #e4e7ed', borderRadius: 1, bgcolor: '#fff', px: 2, py: 1.5, mb: 2 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(6, minmax(0, 1fr))' }, gap: 2 }}>
          <ReadOnlyField label="产品名称" value={product.name} />
          <ReadOnlyField label="产品编码" value={product.code} />
          <ReadOnlyField label="物料版本" value={product.version} />
          <ReadOnlyField label="物料类型" value={product.materialTypeName} />
          <ReadOnlyField label="规格型号" value={product.specification} />
          <ReadOnlyField label="单位" value={product.unit} />
        </Box>
      </Box>

      <Box sx={{ border: '1px solid #e4e7ed', borderRadius: 1, bgcolor: '#fff', overflow: 'hidden' }}>
        <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid #ebeef5', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="subtitle2" sx={{ color: '#303133', fontWeight: 600 }}>制程配置版本</Typography>
        </Box>
        <TableContainer>
          <Table size="small" sx={{ minWidth: 1120 }}>
            <TableHead><TableRow>
              {['版本', '生产模式', '生产方式', '工艺路线版本', '批记录模板版本', '版本状态', '生效时间', '失效时间', '更新时间', '操作'].map((label) => <TableCell key={label} sx={{ bgcolor: '#f5f7fa', color: '#606266', fontWeight: 600, whiteSpace: 'nowrap' }}>{label}</TableCell>)}
            </TableRow></TableHead>
            <TableBody>
              {versions.length === 0 ? <TableRow><TableStateCell colSpan={10} align="center" sx={{ py: 8, color: '#909399' }}>尚未创建制程配置版本</TableStateCell></TableRow> : versions.map((version) => {
                const meta = getRdoVersionStatusMeta(version.status);
                return <TableRow hover key={version.id}>
                  <TableCell sx={{ fontWeight: 500 }}>{version.version}</TableCell>
                  <TableCell>{version.productionMode}</TableCell>
                  <TableCell>{version.productionForm}</TableCell>
                  <TableCell>{[version.routeCode, version.routeName, version.routeVersion].filter(Boolean).join(' / ') || '-'}</TableCell>
                  <TableCell>{[version.dhrTemplateCode, version.dhrTemplateName, version.dhrTemplateVersion].filter(Boolean).join(' / ') || '-'}</TableCell>
                  <TableCell><StatusBadge label={meta.label} color={meta.color} /></TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(version.effectiveFrom)}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(version.effectiveTo)}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(version.updatedAt)}</TableCell>
                  <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                    <Tooltip title="配置工序"><IconButton size="small" color="primary" onClick={() => setOperationTarget(version)}><PlaylistAddCheck fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="编辑版本"><IconButton size="small" onClick={() => openVersionDialog('edit', version)}><EditOutlined fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="复制版本"><IconButton size="small" onClick={() => openVersionDialog('copy', version)}><ContentCopy fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="数据审计"><IconButton size="small" onClick={() => setAuditTarget(version)}><HistoryOutlined fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="删除版本"><IconButton size="small" color="error" onClick={() => setDeleteTarget(version)}><DeleteOutline fontSize="small" /></IconButton></Tooltip>
                  </TableCell>
                </TableRow>;
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      <VersionDialog
        open={Boolean(versionDialog)}
        mode={versionDialog?.mode ?? 'create'}
        form={versionForm}
        options={options}
        graph={versionRouteGraphQuery.data}
        onChange={setVersionForm}
        onClose={() => setVersionDialog(null)}
        onSubmit={() => saveVersionMutation.mutate()}
        saving={saveVersionMutation.isPending}
      />
      <OperationDialog
        open={Boolean(operationTarget)}
        version={operationTarget}
        options={options}
        drafts={operationDrafts}
        onChange={setOperationDrafts}
        loadingRoute={graphQuery.isLoading}
        graph={graphQuery.data}
        onClose={() => setOperationTarget(null)}
        onSubmit={() => saveOperationsMutation.mutate()}
        saving={saveOperationsMutation.isPending}
      />
      <ProductModelAuditDialog
        open={Boolean(auditTarget)}
        version={auditTarget}
        events={auditEvents}
        loading={versionAuditQuery.isLoading || operationAuditQuery.isLoading}
        error={versionAuditQuery.isError || operationAuditQuery.isError}
        onClose={() => setAuditTarget(null)}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除制程配置版本"
        message={`确定删除版本「${deleteTarget?.version || ''}」吗？删除后不可恢复。`}
        confirmText="删除"
        destructive
        loading={deleteMutation.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget); }}
      />
    </Box>
  );
}

function RouteGraphPreview({ graph, selectedNodeKey, onSelectNode }: {
  graph?: RouteGraphResponse;
  selectedNodeKey?: string;
  onSelectNode?: (nodeKey: string) => void;
}) {
  const nodes = useMemo<Node[]>(() => (graph?.nodes ?? []).map((node, index) => ({
    id: node.nodeKey,
    position: {
      x: node.positionX ?? 56 + (index % 4) * 190,
      y: node.positionY ?? 48 + Math.floor(index / 4) * 110,
    },
    data: { label: node.operationName || node.nodeKey },
    style: {
      width: 148,
      minHeight: 44,
      borderRadius: 4,
      border: selectedNodeKey === node.nodeKey ? '2px solid #1677c8' : '1px solid #c9d1dc',
      background: selectedNodeKey === node.nodeKey ? '#eef6ff' : '#fff',
      color: '#303133',
      fontSize: 13,
      padding: 10,
    },
  })), [graph?.nodes, selectedNodeKey]);
  const edges = useMemo<Edge[]>(() => (graph?.relations ?? []).map((relation, index) => ({
    id: String(relation.id ?? `${relation.sourceNodeKey}-${relation.targetNodeKey}-${index}`),
    source: relation.sourceNodeKey,
    target: relation.targetNodeKey,
    label: relation.label || undefined,
    markerEnd: { type: MarkerType.ArrowClosed, color: '#8a97a6' },
    style: { stroke: '#8a97a6' },
  })), [graph?.relations]);
  if (!graph) return <Box sx={{ height: 260, display: 'grid', placeItems: 'center', border: '1px solid #e4e7ed', bgcolor: '#fafbfc', color: '#909399' }}><CircularProgress size={22} /></Box>;
  if (nodes.length === 0) return <Box sx={{ height: 180, display: 'grid', placeItems: 'center', border: '1px solid #e4e7ed', bgcolor: '#fafbfc', color: '#909399' }}>当前路线暂无节点</Box>;
  return <Box sx={{ height: 300, border: '1px solid #e4e7ed', bgcolor: '#fafbfc', overflow: 'hidden' }}>
    <ReactFlowProvider>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.22 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={Boolean(onSelectNode)}
        panOnDrag
        zoomOnDoubleClick={false}
        onNodeClick={(_, node) => onSelectNode?.(node.id)}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#dfe4ea" gap={20} size={1} />
      </ReactFlow>
    </ReactFlowProvider>
  </Box>;
}

function VersionDialog({ open, mode, form, options, graph, onChange, onClose, onSubmit, saving }: {
  open: boolean;
  mode: VersionDialogMode;
  form: VersionForm;
  options: ProductModelOptions;
  graph?: RouteGraphResponse;
  onChange: (form: VersionForm) => void;
  onClose: () => void;
  onSubmit: () => void;
  saving: boolean;
}) {
  const isEdit = mode === 'edit';
  const title = mode === 'copy' ? '复制制程配置版本' : isEdit ? '编辑制程配置版本' : '新建制程配置版本';
  const set = <K extends keyof VersionForm>(key: K, value: VersionForm[K]) => onChange({ ...form, [key]: value });
  const routeValue = options.routes.find((option) => option.id === form.routeVersionId) ?? null;
  const dhrValue = options.dhrTemplates.find((option) => option.id === form.dhrTemplateVersionId) ?? null;
  const canSubmit = Boolean(form.version.trim() && form.productionMode.trim() && form.productionForm.trim() && form.routeVersionId && form.dhrTemplateVersionId);
  return (
    <AppDialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="lg">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2, pt: 0.5 }}>
          <TextField required size="small" label="版本号" value={form.version} onChange={(event) => set('version', event.target.value)} />
          <TextField select required size="small" label="生产方式" value={form.productionForm} onChange={(event) => set('productionForm', event.target.value)}>
            {PRODUCTION_MODALITY_OPTIONS.map((option) => <MenuItem key={option} value={option}>{option}</MenuItem>)}
          </TextField>
          <Autocomplete
            options={options.routes}
            value={routeValue}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            getOptionLabel={(option) => `${option.versionCode || '-'} / ${option.routeName} / ${option.version}`}
            onChange={(_, value) => set('routeVersionId', value?.id ?? '')}
            renderInput={(params) => <TextField {...params} required size="small" label="工艺路线版本" />}
          />
          <Autocomplete
            options={options.dhrTemplates}
            value={dhrValue}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            getOptionLabel={(option) => `${option.code || '-'} / ${option.name} / ${option.version || '-'}`}
            onChange={(_, value) => set('dhrTemplateVersionId', value?.id ?? '')}
            renderInput={(params) => <TextField {...params} required size="small" label="批记录模板版本" />}
          />
          <TextField size="small" label="生效时间" type="datetime-local" value={form.effectiveFrom} onChange={(event) => set('effectiveFrom', event.target.value)} InputLabelProps={{ shrink: true }} />
          <TextField size="small" label="失效时间" type="datetime-local" value={form.effectiveTo} onChange={(event) => set('effectiveTo', event.target.value)} InputLabelProps={{ shrink: true }} />
          <TextField sx={{ gridColumn: { sm: '1 / -1' } }} size="small" label="版本说明" value={form.description} onChange={(event) => set('description', event.target.value)} multiline minRows={3} />
        </Box>
        {form.routeVersionId && <Box sx={{ mt: 2 }}><Typography variant="subtitle2" sx={{ mb: 1, color: '#303133' }}>工艺路线</Typography><RouteGraphPreview graph={graph} /></Box>}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose} disabled={saving}>取消</Button>
        <Button variant="contained" onClick={onSubmit} disabled={!canSubmit || saving}>{saving ? '保存中...' : '保存'}</Button>
      </DialogActions>
    </AppDialog>
  );
}

function ProductModelAuditDialog({ open, version, events, loading, error, onClose }: {
  open: boolean;
  version: ProductProcessVersion | null;
  events: AuditLogItem[];
  loading: boolean;
  error: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState(0);
  useEffect(() => { if (open) setTab(0); }, [open]);
  return (
    <AppDialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>制程配置版本详情</DialogTitle>
      <DialogContent dividers sx={{ minHeight: 420 }}>
        <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mb: 2 }}>
          <Tab label="数据信息" />
          <Tab label="数据审计" />
        </Tabs>
        {tab === 0 && version && (
          <Stack spacing={2}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
              <ReadOnlyField label="版本" value={version.version} />
              <ReadOnlyField label="生产模式" value={version.productionMode} />
              <ReadOnlyField label="生产方式" value={version.productionForm} />
              <ReadOnlyField label="工艺路线版本" value={[version.routeCode, version.routeName, version.routeVersion].filter(Boolean).join(' / ')} />
              <ReadOnlyField label="批记录模板版本" value={[version.dhrTemplateCode, version.dhrTemplateName, version.dhrTemplateVersion].filter(Boolean).join(' / ')} />
              <ReadOnlyField label="版本状态" value={<StatusBadge {...getRdoVersionStatusMeta(version.status)} />} />
              <ReadOnlyField label="生效时间" value={formatDateTime(version.effectiveFrom)} />
              <ReadOnlyField label="失效时间" value={formatDateTime(version.effectiveTo)} />
              <ReadOnlyField label="创建人" value={version.createdBy} />
              <ReadOnlyField label="创建时间" value={formatDateTime(version.createdAt)} />
              <ReadOnlyField label="更新时间" value={formatDateTime(version.updatedAt)} />
            </Box>
            <Box>
              <Typography variant="caption" sx={{ display: 'block', mb: 0.5, color: '#909399' }}>版本说明</Typography>
              <Typography variant="body2" sx={{ color: '#303133', whiteSpace: 'pre-wrap' }}>{version.description || '-'}</Typography>
            </Box>
          </Stack>
        )}
        {tab === 1 && (loading ? (
          <Box sx={{ py: 8, display: 'grid', placeItems: 'center' }}><CircularProgress size={24} /></Box>
        ) : error ? (
          <Typography sx={{ py: 8, color: '#c62828', textAlign: 'center' }}>审计记录加载失败</Typography>
        ) : events.length === 0 ? (
          <Typography sx={{ py: 8, color: '#909399', textAlign: 'center' }}>暂无审计记录</Typography>
        ) : (
          <Stack spacing={1}>
            {events.map((event) => (
              <Accordion key={`${event.entityType}-${event.id}`} disableGutters elevation={0} sx={{ border: '1px solid #e4e7ed', '&:before': { display: 'none' } }}>
                <AccordionSummary expandIcon={<ExpandMore fontSize="small" />}>
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.25fr', gap: 1, width: '100%', minWidth: 0 }}>
                    <Typography variant="body2" noWrap>{event.operatorDisplayName || event.operatorAccount || '-'}</Typography>
                    <Typography variant="body2" noWrap>{event.actionLabel || event.action || '-'}</Typography>
                    <Typography variant="body2" noWrap sx={{ color: '#606266' }}>{formatDateTime(event.operationTime || event.createdAt)}</Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 0 }}>
                  <Typography variant="caption" sx={{ display: 'block', mb: 1, color: '#909399' }}>{event.functionName || '制程配置版本'}</Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
                    <AuditFieldBlock title="变更前" content={event.contentBefore} />
                    <AuditFieldBlock title="变更后" content={event.contentAfter} />
                  </Box>
                </AccordionDetails>
              </Accordion>
            ))}
          </Stack>
        ))}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}><Button onClick={onClose}>关闭</Button></DialogActions>
    </AppDialog>
  );
}

function OperationDialog({ open, version, options, graph, drafts, onChange, loadingRoute, onClose, onSubmit, saving }: {
  open: boolean;
  version: ProductProcessVersion | null;
  options: ProductModelOptions;
  graph?: RouteGraphResponse;
  drafts: OperationDraft[];
  onChange: (drafts: OperationDraft[]) => void;
  loadingRoute: boolean;
  onClose: () => void;
  onSubmit: () => void;
  saving: boolean;
}) {
  const updateDraft = (nodeKey: string, update: (draft: OperationDraft) => OperationDraft) => {
    onChange(drafts.map((draft) => draft.routeNodeKey === nodeKey ? update(draft) : draft));
  };
  const [selectedNodeKey, setSelectedNodeKey] = useState('');
  const [previewForm, setPreviewForm] = useState<ProductModelTemplateOption | null>(null);
  const [previewDocument, setPreviewDocument] = useState<ProductModelDocumentOption | null>(null);
  useEffect(() => {
    if (open) setSelectedNodeKey(drafts[0]?.routeNodeKey ?? '');
  }, [open, drafts.length]);
  const formOptionMap = useMemo(() => new Map(options.formTemplates.map((option) => [option.dhrTemplateItemId || option.id, option])), [options.formTemplates]);
  const documentOptionMap = useMemo(() => new Map(options.documents.map((option) => [option.id, option])), [options.documents]);
  return <>
    <AppDialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="lg">
      <DialogTitle>配置工序表单与文档 {version ? `- ${version.version}` : ''}</DialogTitle>
      <DialogContent dividers sx={{ minHeight: 560 }}>
        {loadingRoute ? <Box sx={{ py: 8, display: 'grid', placeItems: 'center' }}><CircularProgress size={24} /></Box> : drafts.length === 0 ? (
          <Typography sx={{ py: 8, textAlign: 'center', color: '#909399' }}>当前工艺路线没有可配置的工序节点</Typography>
        ) : <Stack spacing={1.5}>
          <RouteGraphPreview graph={graph} selectedNodeKey={selectedNodeKey} onSelectNode={setSelectedNodeKey} />
          <Typography variant="caption" sx={{ color: '#909399' }}>选择路线中的工序节点后配置表单与文档</Typography>
          {drafts.filter((draft) => draft.routeNodeKey === selectedNodeKey).map((draft) => {
            const selectedForms = draft.forms.map((binding) => formOptionMap.get(binding.dhrTemplateItemId || binding.formTemplateVersionId)).filter((item): item is ProductModelTemplateOption => Boolean(item));
            const selectedDocuments = draft.documents.map((binding) => documentOptionMap.get(binding.documentVersionId)).filter((item): item is ProductModelDocumentOption => Boolean(item));
            return <Accordion key={draft.routeNodeKey} disableGutters elevation={0} sx={{ border: '1px solid #e4e7ed', '&:before': { display: 'none' } }}>
              <AccordionSummary expandIcon={<ExpandMore />} sx={{ minHeight: 46, '& .MuiAccordionSummary-content': { my: 1 } }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                  <Typography variant="subtitle2" sx={{ color: '#303133' }}>{draft.operationName}</Typography>
                  {draft.operationCode && <Chip size="small" variant="outlined" label={draft.operationCode} />}
                  <Typography variant="caption" sx={{ color: '#909399' }}>{draft.forms.length} 个表单，{draft.documents.length} 个工序文档</Typography>
                </Stack>
              </AccordionSummary>
              <AccordionDetails sx={{ borderTop: '1px solid #ebeef5', pt: 2 }}>
                <Stack spacing={2}>
                  <ReferenceBindingList
                    label="DHR 目录表单"
                    options={options.formTemplates}
                    value={selectedForms}
                    getOptionId={(option) => option.dhrTemplateItemId || option.id}
                    toChoice={(option): RdoVersionChoice => ({ id: option.dhrTemplateItemId || option.id, parentId: `${option.templateId}:${option.directoryName || ''}`, parentName: [option.directoryName, option.name].filter(Boolean).join(' / '), version: option.version, versionCode: option.versionCode, categoryName: option.categoryName })}
                    getOptionLabel={(option) => [option.name, option.version].filter(Boolean).join(' / ')}
                    emptyText="该批记录模板中暂无可引用表单"
                    addControl={<DhrDirectoryFormPicker
                      options={options.formTemplates}
                    directories={options.dhrDirectories}
                    selectedIds={selectedForms.map((option) => option.dhrTemplateItemId || option.id)}
                      onConfirm={(selections) => updateDraft(draft.routeNodeKey, (current) => {
                        const existing = new Set(current.forms.map((item) => item.formTemplateVersionId));
                        const additions = selections.filter((selection) => !existing.has(selection.formTemplateVersionId));
                        return { ...current, forms: [...current.forms, ...additions.map((selection) => ({ dhrTemplateItemId: selection.dhrTemplateItemId, formTemplateVersionId: selection.formTemplateVersionId, required: true, sortOrder: 0 }))] };
                      })}
                      emptyText="该批记录模板中暂无可引用表单"
                      onPreview={setPreviewForm}
                      previewOpen={Boolean(previewForm)}
                    />}
                    onAdd={() => undefined}
                    onPreview={setPreviewForm}
                    onRemove={(id) => updateDraft(draft.routeNodeKey, (current) => ({ ...current, forms: current.forms.filter((item) => (item.dhrTemplateItemId || item.formTemplateVersionId) !== id) }))}
                    onMove={(id, direction) => updateDraft(draft.routeNodeKey, (current) => {
                      const index = current.forms.findIndex((item) => (item.dhrTemplateItemId || item.formTemplateVersionId) === id);
                      const nextIndex = index + direction;
                      if (index < 0 || nextIndex < 0 || nextIndex >= current.forms.length) return current;
                      const forms = [...current.forms]; [forms[index], forms[nextIndex]] = [forms[nextIndex], forms[index]];
                      return { ...current, forms };
                    })}
                    renderDetails={(option) => {
                      const binding = draft.forms.find((item) => (item.dhrTemplateItemId || item.formTemplateVersionId) === (option.dhrTemplateItemId || option.id));
                      return <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                        {option.code ? <Typography variant="caption" sx={{ color: '#909399' }}>表单编码：{option.code}</Typography> : null}
                        {binding ? <Stack component="label" direction="row" spacing={0.25} alignItems="center" sx={{ cursor: 'pointer' }}><Checkbox size="small" checked={binding.required} onChange={(event) => updateDraft(draft.routeNodeKey, (current) => ({ ...current, forms: current.forms.map((item) => (item.dhrTemplateItemId || item.formTemplateVersionId) === (option.dhrTemplateItemId || option.id) ? { ...item, required: event.target.checked } : item) }))} sx={{ p: 0.25 }} /><Typography variant="caption" sx={{ color: '#606266' }}>工序结束前完成</Typography></Stack> : null}
                      </Stack>;
                    }}
                  />
                  <Divider />
                  <ReferenceBindingList
                    label="文档"
                    addLabel="添加文档"
                    options={options.documents.map((option) => ({ ...option, pageStart: null, pageEnd: null }))}
                    value={selectedDocuments.map((option) => ({ ...option, pageStart: draft.documents.find((item) => item.documentVersionId === option.id)?.pageStart ?? null, pageEnd: draft.documents.find((item) => item.documentVersionId === option.id)?.pageEnd ?? null }))}
                    getOptionId={(option) => option.id}
                    toChoice={(option): RdoVersionChoice => ({ id: option.id, parentId: option.documentId, parentName: option.title || '-', version: option.version, versionCode: option.code, categoryName: option.documentCategoryName })}
                    getOptionLabel={(option) => [option.title, option.version].filter(Boolean).join(' / ')}
                    emptyText="暂无可引用文档版本"
                    onAdd={(ids) => updateDraft(draft.routeNodeKey, (current) => {
                      const existing = new Set(current.documents.map((item) => item.documentVersionId));
                      return { ...current, documents: [...current.documents, ...ids.filter((id) => !existing.has(id)).map((id) => ({ documentVersionId: id, sortOrder: 0, pageStart: null, pageEnd: null }))] };
                    })}
                    onPreview={setPreviewDocument}
                    previewOpen={Boolean(previewDocument)}
                    onRemove={(id) => updateDraft(draft.routeNodeKey, (current) => ({ ...current, documents: current.documents.filter((item) => item.documentVersionId !== id) }))}
                    onMove={(id, direction) => updateDraft(draft.routeNodeKey, (current) => {
                      const index = current.documents.findIndex((item) => item.documentVersionId === id);
                      const nextIndex = index + direction;
                      if (index < 0 || nextIndex < 0 || nextIndex >= current.documents.length) return current;
                      const documents = [...current.documents]; [documents[index], documents[nextIndex]] = [documents[nextIndex], documents[index]];
                      return { ...current, documents };
                    })}
                    renderDetails={(option) => isPdfDocument(option) ? <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1 }}>
                      <TextField size="small" type="number" label="展示起始页" value={option.pageStart ?? ''} onChange={(event) => updateDraft(draft.routeNodeKey, (current) => ({ ...current, documents: current.documents.map((item) => item.documentVersionId === option.id ? { ...item, pageStart: event.target.value === '' ? null : Number(event.target.value) } : item) }))} inputProps={{ min: 1, step: 1 }} sx={{ width: { xs: '100%', sm: 150 } }} />
                      <TextField size="small" type="number" label="展示结束页" value={option.pageEnd ?? ''} onChange={(event) => updateDraft(draft.routeNodeKey, (current) => ({ ...current, documents: current.documents.map((item) => item.documentVersionId === option.id ? { ...item, pageEnd: event.target.value === '' ? null : Number(event.target.value) } : item) }))} inputProps={{ min: 1, step: 1 }} sx={{ width: { xs: '100%', sm: 150 } }} />
                    </Stack> : null}
                  />
                </Stack>
              </AccordionDetails>
            </Accordion>;
          })}
        </Stack>}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose} disabled={saving}>取消</Button>
        <Button variant="contained" onClick={onSubmit} disabled={saving || loadingRoute}>{saving ? '保存中...' : '保存'}</Button>
      </DialogActions>
    </AppDialog>
    <FormTemplatePreviewDialog option={previewForm} onClose={() => setPreviewForm(null)} />
    <DocumentPreviewDialog option={previewDocument} onClose={() => setPreviewDocument(null)} />
  </>;
}

function DocumentReferenceDialog({ open, initialCategoryName, options, selectedIds, onClose, onConfirm }: {
  open: boolean;
  initialCategoryName: string;
  options: ProductModelDocumentOption[];
  selectedIds: string[];
  onClose: () => void;
  onConfirm: (selected: ProductModelDocumentOption[]) => void;
}) {
  const [categoryName, setCategoryName] = useState(initialCategoryName);
  const [keyword, setKeyword] = useState('');
  const [selected, setSelected] = useState<string[]>(selectedIds);
  useEffect(() => { if (open) { setCategoryName(initialCategoryName); setKeyword(''); setSelected(selectedIds); } }, [initialCategoryName, open, selectedIds]);
  const optionMap = useMemo(() => new Map(options.map((option) => [option.id, option])), [options]);
  const categoryNames = useMemo(() => Array.from(new Set(options.map((option) => option.documentCategoryName || '未分类'))), [options]);
  const visible = useMemo(() => options.filter((option) => {
    if (categoryName !== 'ALL' && (option.documentCategoryName || '未分类') !== categoryName) return false;
    const text = `${option.code || ''} ${option.title || ''} ${option.version || ''}`.toLowerCase();
    return !keyword.trim() || text.includes(keyword.trim().toLowerCase());
  }), [categoryName, keyword, options]);
  const groups = useMemo(() => Array.from(visible.reduce((result, option) => {
    const current = result.get(option.documentId) ?? [];
    current.push(option); result.set(option.documentId, current); return result;
  }, new Map<string, ProductModelDocumentOption[]>()).values()), [visible]);
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const selectedOptions = selected.map((id) => optionMap.get(id)).filter((item): item is ProductModelDocumentOption => Boolean(item));
  return <AppDialog open={open} onClose={onClose} fullWidth maxWidth="lg"><DialogTitle>引用工序文档</DialogTitle><DialogContent dividers sx={{ minHeight: 480 }}>
    <Tabs value={categoryName} onChange={(_, value) => setCategoryName(value)} sx={{ mb: 1.5 }}><Tab value="ALL" label="全部" />{categoryNames.map((name) => <Tab key={name} value={name} label={name} />)}</Tabs>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 310px' }, gap: 2 }}>
      <Box sx={{ minWidth: 0 }}><TextField fullWidth size="small" placeholder="搜索文档名称、编码或版本" value={keyword} onChange={(event) => setKeyword(event.target.value)} InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }} sx={{ mb: 1.25 }} />
        <Box sx={{ border: '1px solid #e4e7ed', borderRadius: 1, maxHeight: 340, overflow: 'auto' }}>{groups.length === 0 ? <Typography sx={{ p: 4, color: '#909399', textAlign: 'center' }}>未找到可引用的文档版本</Typography> : groups.map((versions) => {
          const parent = versions[0]; return <Box key={parent.documentId} sx={{ borderBottom: '1px solid #ebeef5', '&:last-child': { borderBottom: 0 } }}><Box sx={{ px: 1.5, py: 1, bgcolor: '#f8fafc', display: 'flex', alignItems: 'center', gap: 1 }}><Chip size="small" variant="outlined" label={parent.documentCategoryName || '未分类'} /><Typography variant="body2" sx={{ fontWeight: 600 }}>{parent.code || '-'} / {parent.title || '-'}</Typography></Box>{versions.map((option) => { const disabled = option.status !== 'ACTIVE' && !selected.includes(option.id); return <Box key={option.id} sx={{ pl: 2, pr: 1.5, py: 0.75, display: 'flex', alignItems: 'center', gap: 1 }}><Checkbox size="small" checked={selected.includes(option.id)} disabled={disabled} onChange={() => toggle(option.id)} /><Typography variant="body2" sx={{ flex: 1 }}>版本 {option.version || '-'}</Typography><StatusBadge {...getRdoVersionStatusMeta(option.status)} /></Box>; })}</Box>;
        })}</Box>
      </Box>
      <Box sx={{ border: '1px solid #e4e7ed', borderRadius: 1, minWidth: 0 }}><Box sx={{ px: 1.5, py: 1, borderBottom: '1px solid #ebeef5' }}><Typography variant="subtitle2">已选文档版本（{selectedOptions.length}）</Typography></Box><Stack spacing={0.75} sx={{ p: 1.25, maxHeight: 382, overflow: 'auto' }}>{selectedOptions.length === 0 ? <Typography variant="body2" sx={{ color: '#909399', py: 2, textAlign: 'center' }}>尚未选择文档版本</Typography> : selectedOptions.map((option) => <Box key={option.id} sx={{ display: 'flex', gap: 0.75, alignItems: 'flex-start' }}><Chip size="small" label={option.documentCategoryName || '未分类'} /><Typography variant="caption" sx={{ flex: 1, color: '#303133', wordBreak: 'break-word' }}>{option.code || '-'} / {option.title || '-'} / {option.version || '-'}</Typography><IconButton size="small" onClick={() => toggle(option.id)}><DeleteOutline fontSize="small" /></IconButton></Box>)}</Stack></Box>
    </Box>
  </DialogContent><DialogActions sx={{ px: 3, py: 1.5 }}><Button onClick={onClose}>取消</Button><Button variant="contained" onClick={() => onConfirm(selectedOptions)}>确定</Button></DialogActions></AppDialog>;
}
