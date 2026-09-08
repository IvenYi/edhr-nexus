import TableStateCell from '@/components/TableStateCell';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Add, DeleteOutline, EditOutlined, RestartAlt, Search, TuneRounded, ViewColumnRounded, VisibilityOutlined } from '@mui/icons-material';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Popover,
  Stack,
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
import ConfirmDialog from '@/components/ConfirmDialog';
import { useSnackbar } from '@/components/SnackbarProvider';
import {
  createWorkApplicabilityRule,
  deleteWorkApplicabilityRule,
  getWorkTemplateVersions,
  listWorkApplicabilityRules,
  listWorkTemplates,
  updateWorkApplicabilityRule,
  type WorkflowId,
} from '@/api/workflow-work';
import { getProcessOperations, getProcessProductFamilies, getProducts, type OperationRecord, type ProductFamilyRecord, type ProductRecord } from '@/api/master-data';
import type { PageResult } from '@/types/common';
import WorkFlowPreviewDialog, { type WorkFlowPreviewVersion } from './components/WorkFlowPreviewDialog';

type RuleType = 'GLOBAL' | 'SCOPED' | 'EXCEPTION';
type WorkTemplate = { id: WorkflowId; name: string; code?: string | null; currentFlowVersionNumber?: number | null };
type WorkRule = { id: WorkflowId; definitionId: WorkflowId; definitionName: string; definitionCode?: string | null; ruleType: RuleType; productFamilyId?: WorkflowId | null; productId?: WorkflowId | null; operationId?: WorkflowId | null; description?: string | null; updatedAt?: string | null };
type RuleDraft = { definitionId: string; ruleType: RuleType; productFamilyId: string; productId: string; operationId: string; description: string };
type RuleFilters = { keyword: string; ruleType: 'ALL' | RuleType; productFamilyId: string; productId: string; operationId: string };
type WorkRuleColumnId = 'definitionName' | 'definitionCode' | 'ruleType' | 'scope' | 'updatedAt' | 'actions';
interface WorkRuleColumn { id: WorkRuleColumnId; label: string; width: number; configurable?: boolean; }

const headerCellSx = { bgcolor: '#f5f7fa', color: '#606266', fontWeight: 600, whiteSpace: 'nowrap', height: 48, py: 0.75 };
const ACTION_COLUMN_WIDTH = 96;
const RULE_COLUMN_STORAGE_KEY = 'work-applicability-rule-list-columns:v1';
const RULE_COLUMNS: WorkRuleColumn[] = [
  { id: 'definitionName', label: '作业名称', width: 220 },
  { id: 'definitionCode', label: '编码', width: 160, configurable: true },
  { id: 'ruleType', label: '适用方式', width: 130, configurable: true },
  { id: 'scope', label: '适用范围', width: 320, configurable: true },
  { id: 'updatedAt', label: '更新时间', width: 172, configurable: true },
  { id: 'actions', label: '操作', width: ACTION_COLUMN_WIDTH },
];
const typeLabel: Record<RuleType, string> = { GLOBAL: '全局适用', SCOPED: '指定范围', EXCEPTION: '例外排除' };
const emptyDraft = (): RuleDraft => ({ definitionId: '', ruleType: 'GLOBAL', productFamilyId: '', productId: '', operationId: '', description: '' });
const emptyFilters = (): RuleFilters => ({ keyword: '', ruleType: 'ALL', productFamilyId: '', productId: '', operationId: '' });
const toolbarIconSx = { width: 36, height: 36, border: '1px solid #e4e7ed', borderRadius: 1, color: '#606266', bgcolor: '#fff', '&:hover': { color: '#1890ff', bgcolor: '#e8f4ff' } };

function operationColumnSx(layer: 'head' | 'body') {
  return {
    position: 'sticky' as const,
    right: 0,
    zIndex: layer === 'head' ? 10 : 5,
    width: ACTION_COLUMN_WIDTH,
    minWidth: ACTION_COLUMN_WIDTH,
    maxWidth: ACTION_COLUMN_WIDTH,
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

function displayName(item: { name?: string | null; code?: string | null } | undefined, id?: string | number | null) {
  return item?.name || item?.code || (id ? `ID ${id}` : '不限');
}

function displayOption(item: { name?: string | null; code?: string | null } | undefined, id?: string | number | null) {
  if (!item) return id ? `ID ${id}` : '不限';
  return item.name && item.code ? `${item.name} / ${item.code}` : displayName(item, id);
}

function RuleStepTitle({ number, title, description }: { number: number; title: string; description: string }) {
  return <Stack direction="row" spacing={1.25} alignItems="center"><Box sx={{ width: 28, height: 28, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: '#2f73d9', color: '#fff', fontWeight: 700, fontSize: 14 }}>{number}</Box><Typography sx={{ fontWeight: 650 }}>{title}</Typography><Typography variant="body2" sx={{ color: '#909399' }}>{description}</Typography></Stack>;
}

export default function WorkApplicabilityRulesTab() {
  const queryClient = useQueryClient();
  const { showMessage } = useSnackbar();
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const [tableContainerWidth, setTableContainerWidth] = useState(0);
  const [columnAnchor, setColumnAnchor] = useState<HTMLElement | null>(null);
  const [hiddenColumns, setHiddenColumns] = useState<WorkRuleColumnId[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(RULE_COLUMN_STORAGE_KEY) || '[]');
      return Array.isArray(stored) ? stored.filter((columnId): columnId is WorkRuleColumnId => RULE_COLUMNS.some((column) => column.id === columnId && column.configurable)) : [];
    } catch {
      return [];
    }
  });
  const [editing, setEditing] = useState<WorkRule | null | undefined>(undefined);
  const [draft, setDraft] = useState<RuleDraft>(emptyDraft());
  const [deleting, setDeleting] = useState<WorkRule | null>(null);
  const [previewingVersion, setPreviewingVersion] = useState<WorkFlowPreviewVersion | null>(null);
  const [filterDraft, setFilterDraft] = useState<RuleFilters>(emptyFilters());
  const [submittedFilters, setSubmittedFilters] = useState<RuleFilters>(emptyFilters());
  const rules = useQuery({ queryKey: ['work-applicability-rules'], queryFn: async () => (await listWorkApplicabilityRules()).data.data as WorkRule[] });
  const templates = useQuery({ queryKey: ['work-templates', 'rule-options'], queryFn: async () => (await listWorkTemplates({ page: 1, size: 200 })).data.data as PageResult<WorkTemplate> });
  const families = useQuery({ queryKey: ['work-rule-product-families'], queryFn: async () => (await getProcessProductFamilies({ page: 1, size: 500 })).data.data as PageResult<ProductFamilyRecord> });
  const products = useQuery({ queryKey: ['work-rule-products'], queryFn: async () => (await getProducts({ page: 1, size: 500 })).data.data as PageResult<ProductRecord> });
  const operations = useQuery({ queryKey: ['work-rule-operations'], queryFn: async () => (await getProcessOperations({ page: 1, size: 500 })).data.data as PageResult<OperationRecord> });
  const definitionId = draft.definitionId || null;
  const versions = useQuery({
    queryKey: ['work-template-versions', definitionId, 'rule-preview'],
    enabled: Boolean(definitionId),
    queryFn: async () => (await getWorkTemplateVersions(definitionId!)).data.data as WorkFlowPreviewVersion[],
  });
  const selectedTemplate = (templates.data?.content ?? []).find((template) => String(template.id) === String(definitionId)) ?? null;
  const publishedVersion = useMemo(() => (versions.data ?? []).find((version) => version.isCurrent && version.status === 'PUBLISHED') ?? null, [versions.data]);
  const hasScope = draft.ruleType === 'GLOBAL' || Boolean(draft.productFamilyId || draft.productId || draft.operationId);
  const family = (families.data?.content ?? []).find((item) => String(item.id) === draft.productFamilyId);
  const product = (products.data?.content ?? []).find((item) => String(item.id) === draft.productId);
  const operation = (operations.data?.content ?? []).find((item) => String(item.id) === draft.operationId);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['work-applicability-rules'] });
    queryClient.invalidateQueries({ queryKey: ['work-templates'] });
  };
  const save = useMutation({
    mutationFn: () => {
      const body = {
        ruleType: draft.ruleType,
        productFamilyId: draft.productFamilyId || null,
        productId: draft.productId || null,
        operationId: draft.operationId || null,
        description: draft.description.trim() || null,
      };
      return editing ? updateWorkApplicabilityRule(editing.definitionId, editing.id, body) : createWorkApplicabilityRule(definitionId!, body);
    },
    onSuccess: () => { invalidate(); setEditing(undefined); showMessage(editing ? '作业适用规则已更新' : '作业适用规则已创建', 'success'); },
    onError: () => showMessage('保存失败，请检查作业模板和规则信息', 'error'),
  });
  const remove = useMutation({
    mutationFn: (rule: WorkRule) => deleteWorkApplicabilityRule(rule.definitionId, rule.id),
    onSuccess: () => { invalidate(); setDeleting(null); showMessage('作业适用规则已删除', 'success'); },
    onError: () => showMessage('删除失败', 'error'),
  });
  const openCreate = () => { setDraft(emptyDraft()); setEditing(null); };
  const openEdit = (rule: WorkRule) => {
    setDraft({ definitionId: String(rule.definitionId), ruleType: rule.ruleType, productFamilyId: rule.productFamilyId ? String(rule.productFamilyId) : '', productId: rule.productId ? String(rule.productId) : '', operationId: rule.operationId ? String(rule.operationId) : '', description: rule.description ?? '' });
    setEditing(rule);
  };
  const scopeLabel = (rule: WorkRule) => {
    if (rule.ruleType === 'GLOBAL') return '全部范围';
    const parts = [
      rule.productFamilyId ? `产品簇：${displayName((families.data?.content ?? []).find((item) => String(item.id) === String(rule.productFamilyId)), rule.productFamilyId)}` : null,
      rule.productId ? `产品：${displayName((products.data?.content ?? []).find((item) => String(item.id) === String(rule.productId)), rule.productId)}` : null,
      rule.operationId ? `工序：${displayName((operations.data?.content ?? []).find((item) => String(item.id) === String(rule.operationId)), rule.operationId)}` : null,
    ].filter(Boolean);
    return parts.length ? parts.join('；') : '未配置范围';
  };
  const summary = useMemo(() => {
    if (!selectedTemplate) return '请选择作业后查看该规则的生效范围。';
    if (draft.ruleType === 'GLOBAL') return `“${selectedTemplate.name}”将适用于所有产品和工序。`;
    const ranges = [
      draft.productFamilyId ? `产品簇“${displayName(family, draft.productFamilyId)}”` : null,
      draft.productId ? `产品“${displayName(product, draft.productId)}”` : null,
      draft.operationId ? `工序“${displayName(operation, draft.operationId)}”` : null,
    ].filter(Boolean).join('的');
    if (!ranges) return '请至少选择一个范围。';
    return draft.ruleType === 'EXCEPTION'
      ? `“${selectedTemplate.name}”将不适用于${ranges}；例外排除优先于指定范围和全局适用。`
      : `“${selectedTemplate.name}”将适用于${ranges}；指定范围优先于全局适用。`;
  }, [draft, family, operation, product, selectedTemplate]);
  const rows = useMemo(() => {
    const keyword = submittedFilters.keyword.trim().toLocaleLowerCase();
    return (rules.data ?? []).filter((rule) => {
      const matchesKeyword = !keyword || [rule.definitionName, rule.definitionCode].some((value) => value?.toLocaleLowerCase().includes(keyword));
      return matchesKeyword
        && (submittedFilters.ruleType === 'ALL' || rule.ruleType === submittedFilters.ruleType)
        && (!submittedFilters.productFamilyId || String(rule.productFamilyId ?? '') === submittedFilters.productFamilyId)
        && (!submittedFilters.productId || String(rule.productId ?? '') === submittedFilters.productId)
        && (!submittedFilters.operationId || String(rule.operationId ?? '') === submittedFilters.operationId);
    });
  }, [rules.data, submittedFilters]);
  const visibleColumns = useMemo(() => RULE_COLUMNS.filter((column) => column.id === 'actions' || !hiddenColumns.includes(column.id)), [hiddenColumns]);
  const tableMinWidth = useMemo(() => visibleColumns.reduce((total, column) => total + column.width, 0), [visibleColumns]);
  const tableWidth = Math.max(tableMinWidth, Math.floor(tableContainerWidth));

  useEffect(() => { localStorage.setItem(RULE_COLUMN_STORAGE_KEY, JSON.stringify(hiddenColumns)); }, [hiddenColumns]);
  useEffect(() => {
    const element = tableContainerRef.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) => setTableContainerWidth(entry.contentRect.width));
    observer.observe(element);
    setTableContainerWidth(element.clientWidth);
    return () => observer.disconnect();
  }, []);

  const renderCell = (rule: WorkRule, column: WorkRuleColumn) => {
    switch (column.id) {
      case 'definitionName': return <TableCell key={column.id}>{rule.definitionName}</TableCell>;
      case 'definitionCode': return <TableCell key={column.id}>{rule.definitionCode || '-'}</TableCell>;
      case 'ruleType': return <TableCell key={column.id}>{typeLabel[rule.ruleType]}</TableCell>;
      case 'scope': return <TableCell key={column.id} sx={{ maxWidth: column.width, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={scopeLabel(rule)}>{scopeLabel(rule)}</TableCell>;
      case 'updatedAt': return <TableCell key={column.id}>{formatDateTime(rule.updatedAt)}</TableCell>;
      case 'actions': return <TableCell key={column.id} align="center" sx={operationColumnSx('body')}><Box sx={{ display: 'flex', flexWrap: 'nowrap', justifyContent: 'center', alignItems: 'center', gap: 0 }}><Tooltip title="编辑" arrow><IconButton size="small" aria-label="编辑" onClick={() => openEdit(rule)}><EditOutlined fontSize="small" /></IconButton></Tooltip><Tooltip title="删除" arrow><IconButton size="small" aria-label="删除" color="error" onClick={() => setDeleting(rule)}><DeleteOutline fontSize="small" /></IconButton></Tooltip></Box></TableCell>;
      default: return null;
    }
  };

  return <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, bgcolor: '#fff', overflow: 'hidden' }}>
    <Box sx={{ flex: '0 0 auto', px: 2, py: 1.5, borderBottom: '1px solid #ebeef5', bgcolor: '#fff' }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(220px, 1.3fr) repeat(4, minmax(150px, 1fr)) auto' }, gap: 1.25, alignItems: 'end' }}>
        <TextField size="small" label="作业名称/编码" placeholder="请输入" value={filterDraft.keyword} onChange={(event) => setFilterDraft({ ...filterDraft, keyword: event.target.value })} onKeyDown={(event) => { if (event.key === 'Enter') setSubmittedFilters({ ...filterDraft, keyword: filterDraft.keyword.trim() }); }} InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }} />
        <TextField size="small" select label="适用方式" value={filterDraft.ruleType} onChange={(event) => setFilterDraft({ ...filterDraft, ruleType: event.target.value as RuleFilters['ruleType'] })}><MenuItem value="ALL">全部</MenuItem>{(['GLOBAL', 'SCOPED', 'EXCEPTION'] as RuleType[]).map((type) => <MenuItem key={type} value={type}>{typeLabel[type]}</MenuItem>)}</TextField>
        <TextField size="small" select label="产品簇" InputLabelProps={{ shrink: true }} value={filterDraft.productFamilyId} SelectProps={{ displayEmpty: true, renderValue: (value) => value ? displayOption((families.data?.content ?? []).find((item) => String(item.id) === String(value)), String(value)) : '不限' }} onChange={(event) => setFilterDraft({ ...filterDraft, productFamilyId: event.target.value })}><MenuItem value="">不限</MenuItem>{(families.data?.content ?? []).map((item) => <MenuItem key={item.id} value={String(item.id)}>{displayOption(item, item.id)}</MenuItem>)}</TextField>
        <TextField size="small" select label="产品" InputLabelProps={{ shrink: true }} value={filterDraft.productId} SelectProps={{ displayEmpty: true, renderValue: (value) => value ? displayOption((products.data?.content ?? []).find((item) => String(item.id) === String(value)), String(value)) : '不限' }} onChange={(event) => setFilterDraft({ ...filterDraft, productId: event.target.value })}><MenuItem value="">不限</MenuItem>{(products.data?.content ?? []).map((item) => <MenuItem key={item.id} value={String(item.id)}>{displayOption(item, item.id)}</MenuItem>)}</TextField>
        <TextField size="small" select label="工序" InputLabelProps={{ shrink: true }} value={filterDraft.operationId} SelectProps={{ displayEmpty: true, renderValue: (value) => value ? displayOption((operations.data?.content ?? []).find((item) => String(item.id) === String(value)), String(value)) : '不限' }} onChange={(event) => setFilterDraft({ ...filterDraft, operationId: event.target.value })}><MenuItem value="">不限</MenuItem>{(operations.data?.content ?? []).map((item) => <MenuItem key={item.id} value={String(item.id)}>{displayOption(item, item.id)}</MenuItem>)}</TextField>
        <Stack direction="row" spacing={1} justifyContent="flex-end"><Button size="small" variant="outlined" startIcon={<RestartAlt />} onClick={() => { const next = emptyFilters(); setFilterDraft(next); setSubmittedFilters(next); }}>重置</Button><Button size="small" variant="contained" startIcon={<Search />} onClick={() => setSubmittedFilters({ ...filterDraft, keyword: filterDraft.keyword.trim() })}>查询</Button></Stack>
      </Box>
    </Box>
    <Box sx={{ flex: '0 0 auto', px: 2, py: 0.75, minHeight: 48, borderBottom: '1px solid #ebeef5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <Tooltip title="字段设置" arrow><IconButton size="small" aria-label="字段设置" onClick={(event) => setColumnAnchor(event.currentTarget)} sx={toolbarIconSx}><Box aria-hidden="true" sx={{ position: 'relative', width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><ViewColumnRounded sx={{ fontSize: 21 }} /><TuneRounded sx={{ position: 'absolute', right: -3, bottom: -2, fontSize: 13, p: '1px', borderRadius: '50%', bgcolor: '#fff', boxShadow: '0 0 0 1px #fff' }} /></Box></IconButton></Tooltip>
      <Button size="small" variant="contained" startIcon={<Add />} onClick={openCreate}>新增适用规则</Button>
    </Box>
    <TableContainer ref={tableContainerRef} sx={{ flex: 1, width: '100%', maxWidth: '100%', minWidth: 0, minHeight: 0, overflow: 'auto' }}>
      <Table stickyHeader size="small" sx={{ width: tableWidth, minWidth: tableMinWidth, tableLayout: 'fixed', height: rules.isLoading || rules.isError || rows.length === 0 ? '100%' : 'auto' }}>
        <colgroup>{visibleColumns.map((column) => <col key={column.id} style={{ width: column.width }} />)}</colgroup>
        <TableHead><TableRow>{visibleColumns.map((column) => <TableCell key={column.id} align={column.id === 'actions' ? 'center' : undefined} sx={{ ...headerCellSx, width: column.width, ...(column.id === 'actions' ? operationColumnSx('head') : {}) }}>{column.label}</TableCell>)}</TableRow></TableHead>
        <TableBody>
          {rules.isLoading ? <TableRow><TableStateCell colSpan={visibleColumns.length} align="center" sx={{ py: 8, color: '#909399' }}>加载中...</TableStateCell></TableRow> : null}
          {rules.isError ? <TableRow><TableStateCell colSpan={visibleColumns.length} align="center" sx={{ py: 8, color: '#c62828' }}>作业适用规则加载失败</TableStateCell></TableRow> : null}
          {!rules.isLoading && !rules.isError && rows.length === 0 ? <TableRow><TableStateCell colSpan={visibleColumns.length} align="center" sx={{ py: 8, color: '#909399' }}>暂无适用规则</TableStateCell></TableRow> : null}
          {!rules.isLoading && !rules.isError ? rows.map((rule) => <TableRow key={rule.id} hover sx={{ '& > .MuiTableCell-root': { height: 40, py: 0.5, borderBottom: '1px solid #ebeef5' } }}>
            {visibleColumns.map((column) => renderCell(rule, column))}
          </TableRow>) : null}
        </TableBody>
      </Table>
    </TableContainer>
    <Popover open={Boolean(columnAnchor)} anchorEl={columnAnchor} onClose={() => setColumnAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} transformOrigin={{ vertical: 'top', horizontal: 'left' }} PaperProps={{ sx: { width: 220, p: 1.25 } }}><Typography variant="subtitle2" sx={{ px: 0.75, pb: 0.75 }}>作业适用规则字段</Typography>{RULE_COLUMNS.filter((column) => column.configurable).map((column) => <FormControlLabel key={column.id} sx={{ display: 'flex', mx: 0, '& .MuiFormControlLabel-label': { fontSize: 13 } }} control={<Checkbox size="small" checked={!hiddenColumns.includes(column.id)} onChange={(event) => setHiddenColumns((current) => event.target.checked ? current.filter((id) => id !== column.id) : [...current, column.id])} />} label={column.label} />)}</Popover>

    <AppDialog open={editing !== undefined} onClose={() => setEditing(undefined)} maxWidth="md" fullWidth>
      <DialogTitle>{editing ? '编辑作业适用规则' : '新增适用规则'}</DialogTitle>
      <DialogContent dividers sx={{ px: { xs: 2, sm: 3 }, py: { xs: 2, sm: 2.5 } }}>
        <Stack spacing={3}>
          <Box>
            <RuleStepTitle number={1} title="选择作业" description="选择需要配置适用规则的作业。" />
            <Stack spacing={1.25} sx={{ mt: 1.5 }}>
              <TextField select required disabled={Boolean(editing)} label="作业模板" fullWidth value={draft.definitionId} onChange={(event) => setDraft({ ...draft, definitionId: event.target.value })}>
                {(templates.data?.content ?? []).map((template) => {
                  const hasPublishedFlow = Boolean(template.currentFlowVersionNumber);
                  return <MenuItem key={template.id} value={String(template.id)} disabled={!hasPublishedFlow} title={hasPublishedFlow ? undefined : '该作业尚未发布作业流程版本，无法配置适用规则'} sx={!hasPublishedFlow ? { pointerEvents: 'auto', cursor: 'not-allowed' } : undefined}>
                    <Box sx={{ minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, width: '100%' }}>
                      <Typography noWrap>{template.name}{template.code ? ` / ${template.code}` : ''}</Typography>
                      {!hasPublishedFlow ? <Typography variant="caption" sx={{ flexShrink: 0, color: '#909399' }}>未发布流程</Typography> : null}
                    </Box>
                  </MenuItem>;
                })}
              </TextField>
              <Paper variant="outlined" sx={{ px: 1.5, py: 1, borderColor: publishedVersion ? '#c9e6d4' : '#e4e7ed', bgcolor: publishedVersion ? '#f6fffa' : '#fafafa' }}>
                {definitionId && versions.isLoading ? <Typography variant="body2" sx={{ mt: 0.75, color: '#909399' }}>正在读取流程信息...</Typography> : null}
                {publishedVersion ? <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between"><Stack direction="row" spacing={1} alignItems="center"><Typography variant="body2" sx={{ color: '#606266' }}>当前生效流程</Typography><Typography fontWeight={650}>流程 V{publishedVersion.versionNumber}</Typography><Chip size="small" color="success" label="已发布" /></Stack><Button size="small" variant="outlined" startIcon={<VisibilityOutlined />} sx={{ minWidth: 0 }} onClick={() => setPreviewingVersion(publishedVersion)}>预览流程</Button></Stack> : null}
                {definitionId && !versions.isLoading && !publishedVersion ? <Typography variant="body2" sx={{ color: '#909399' }}>当前作业暂未发布流程。</Typography> : null}
                {!definitionId ? <Typography variant="body2" sx={{ color: '#909399' }}>选择作业后显示当前生效流程。</Typography> : null}
              </Paper>
            </Stack>
          </Box>
          <Box>
            <RuleStepTitle number={2} title="选择适用方式" description="明确该规则在解析时如何生效。" />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={0} sx={{ mt: 2, width: 'fit-content', maxWidth: '100%' }}>
              {(['GLOBAL', 'SCOPED', 'EXCEPTION'] as RuleType[]).map((type, index) => <Button key={type} variant={draft.ruleType === type ? 'contained' : 'outlined'} onClick={() => setDraft({ ...draft, ruleType: type, ...(type === 'GLOBAL' ? { productFamilyId: '', productId: '', operationId: '' } : {}) })} sx={{ minWidth: 118, borderRadius: { xs: 1, sm: index === 0 ? '4px 0 0 4px' : index === 2 ? '0 4px 4px 0' : 0 }, mt: { xs: index ? 0.75 : 0, sm: 0 }, ml: { xs: 0, sm: index ? '-1px' : 0 }, zIndex: draft.ruleType === type ? 1 : 0 }}>{typeLabel[type]}</Button>)}
            </Stack>
            {draft.ruleType !== 'GLOBAL' ? <Box sx={{ mt: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5 }}>
              <TextField select label={draft.ruleType === 'EXCEPTION' ? '排除产品簇' : '适用产品簇'} InputLabelProps={{ shrink: true }} fullWidth value={draft.productFamilyId} SelectProps={{ displayEmpty: true, renderValue: (value) => value ? displayOption(family, value as string) : '不限' }} onChange={(event) => setDraft({ ...draft, productFamilyId: event.target.value })}><MenuItem value="">不限</MenuItem>{(families.data?.content ?? []).map((item) => <MenuItem key={item.id} value={String(item.id)}>{displayOption(item, item.id)}</MenuItem>)}</TextField>
              <TextField select label={draft.ruleType === 'EXCEPTION' ? '排除产品' : '适用产品'} InputLabelProps={{ shrink: true }} fullWidth value={draft.productId} SelectProps={{ displayEmpty: true, renderValue: (value) => value ? displayOption(product, value as string) : '不限' }} onChange={(event) => setDraft({ ...draft, productId: event.target.value })}><MenuItem value="">不限</MenuItem>{(products.data?.content ?? []).map((item) => <MenuItem key={item.id} value={String(item.id)}>{displayOption(item, item.id)}</MenuItem>)}</TextField>
              <TextField select label={draft.ruleType === 'EXCEPTION' ? '排除工序' : '适用工序'} InputLabelProps={{ shrink: true }} fullWidth value={draft.operationId} SelectProps={{ displayEmpty: true, renderValue: (value) => value ? displayOption(operation, value as string) : '不限' }} onChange={(event) => setDraft({ ...draft, operationId: event.target.value })}><MenuItem value="">不限</MenuItem>{(operations.data?.content ?? []).map((item) => <MenuItem key={item.id} value={String(item.id)}>{displayOption(item, item.id)}</MenuItem>)}</TextField>
            </Box> : null}
          </Box>
          <Box sx={{ borderLeft: '3px solid #2f73d9', bgcolor: '#f6f9ff', px: 2, py: 1.5 }}><Typography component="span" sx={{ color: '#2f4b7d', fontWeight: 650 }}>规则摘要：</Typography><Typography component="span" sx={{ color: '#47617f' }}>{summary}</Typography></Box>
          <TextField label="备注" fullWidth multiline minRows={2} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}><Button onClick={() => setEditing(undefined)}>取消</Button><Button variant="contained" disabled={!definitionId || !publishedVersion || !hasScope || save.isPending} onClick={() => save.mutate()}>保存</Button></DialogActions>
    </AppDialog>
    <WorkFlowPreviewDialog open={Boolean(previewingVersion)} templateId={definitionId} version={previewingVersion} onClose={() => setPreviewingVersion(null)} />
    <ConfirmDialog open={Boolean(deleting)} title="删除作业适用规则" message={deleting ? `确认删除作业“${deleting.definitionName}”的适用规则吗？` : ''} destructive loading={remove.isPending} onCancel={() => setDeleting(null)} onConfirm={() => deleting && remove.mutate(deleting)} />
  </Box>;
}
