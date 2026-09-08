import TableStateCell from '@/components/TableStateCell';
import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  CircularProgress,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  InputAdornment,
  MenuItem,
  Pagination,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tab,
  Tabs,
  TextField,
  Typography,
  Button,
  IconButton,
  Tooltip,
} from '@mui/material';
import { Cancel, Close, DescriptionOutlined, ExpandMore, PlayCircleOutline, RestartAlt, Search, StopCircleOutlined } from '@mui/icons-material';
import AppDialog from '@/components/AppDialog';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useSnackbar } from '@/components/SnackbarProvider';
import StatusBadge from '@/components/StatusBadge';
import { getAuditLogs, type AuditLogItem } from '@/api/audit';
import { cancelProductionObject, endProductionObject, listBatches, type BatchRecord } from '@/api/work-orders';
import type { PageResult } from '@/types/common';
import { toProductionAuditFields, type ProductionAuditField } from '@/utils/productionAudit';

const PAGE_SIZE = 20;
const statusLabels: Record<string, string> = {
  CREATED: '已创建',
  IN_PROGRESS: '生产中',
  COMPLETED: '已完成',
  EARLY_TERMINATED: '提前结束',
  CANCELLED: '已取消',
};
const statusColors: Record<string, 'success' | 'warning' | 'error' | 'info' | 'default'> = {
  CREATED: 'info',
  IN_PROGRESS: 'warning',
  COMPLETED: 'success',
  EARLY_TERMINATED: 'error',
  CANCELLED: 'default',
};
const tableHeaderCellSx = {
  bgcolor: '#f5f7fa',
  color: '#606266',
  fontWeight: 600,
  whiteSpace: 'nowrap',
  height: 48,
  py: 0,
  borderBottom: '1px solid #e4e7ed',
};
const tableRowSx = {
  '& > .MuiTableCell-root': {
    height: 40,
    py: 0.5,
    borderBottom: '1px solid #ebeef5',
  },
};
const statusColumnSx = {
  position: 'sticky' as const,
  right: 128,
  zIndex: 2,
  width: 110,
  minWidth: 110,
  maxWidth: 110,
  bgcolor: '#fff',
  backgroundClip: 'padding-box',
  boxShadow: '-6px 0 8px -8px rgba(0, 0, 0, 0.35)',
  whiteSpace: 'nowrap',
};
const operationColumnSx = {
  position: 'sticky' as const,
  right: 0,
  zIndex: 2,
  width: 128,
  minWidth: 128,
  maxWidth: 128,
  bgcolor: '#fff',
  backgroundClip: 'padding-box',
  whiteSpace: 'nowrap',
};
const drawerRootSx = {
  top: 0,
  bottom: 0,
  zIndex: (theme: { zIndex: { drawer: number } }) => theme.zIndex.drawer + 2,
  '& .MuiBackdrop-root': { top: 0 },
};
const drawerPaperSx = {
  ...drawerRootSx,
  width: { xs: '100vw', sm: 560 },
  top: 0,
  bottom: 0,
  height: '100vh',
  transform: 'none !important',
};
function formatDateTime(value?: string | null): string {
  if (!value) return '-';
  return value.replace('T', ' ').slice(0, 16);
}

function statusBadge(status: string) {
  return <StatusBadge label={statusLabels[status] || status || '-'} color={statusColors[status] || 'default'} />;
}

function auditActionLabel(item: AuditLogItem): string {
  if (item.action === 'CREATE') return '新增';
  return '修改';
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return <Box sx={{ bgcolor: '#fff', border: '1px solid #e4e7ed', borderRadius: 1, overflow: 'hidden' }}>
    <Box sx={{ px: 1.5, py: 1, borderBottom: '1px solid #e4e7ed', bgcolor: '#f8fafc' }}>
      <Typography variant="body2" sx={{ fontWeight: 600, color: '#303133' }}>{title}</Typography>
    </Box>
    <Box sx={{ p: 1.5 }}>{children}</Box>
  </Box>;
}

function DetailField({ label, value }: { label: string; value: ReactNode }) {
  return <Box sx={{ minWidth: 0 }}>
    <Typography variant="caption" sx={{ color: '#909399', display: 'block', mb: 0.35 }}>{label}</Typography>
    <Typography component="div" variant="body2" sx={{ color: '#303133', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{value === null || value === undefined || value === '' ? '-' : value}</Typography>
  </Box>;
}

function AuditFieldBlock({ title, fields }: { title: string; fields: ProductionAuditField[] }) {
  return <Box sx={{ border: '1px solid #e4e7ed', borderRadius: 1, bgcolor: '#f8fafc', p: 1, minWidth: 0 }}>
    <Typography variant="caption" sx={{ display: 'block', mb: 0.75, color: '#606266', fontWeight: 600 }}>{title}</Typography>
    <Stack spacing={0.75}>{fields.length === 0 ? <Typography variant="caption" sx={{ color: '#909399' }}>无</Typography> : fields.map((field) => <Box key={field.key} sx={{ display: 'grid', gridTemplateColumns: '92px minmax(0, 1fr)', gap: 1 }}><Typography variant="caption" sx={{ color: '#606266' }}>{field.label}</Typography><Typography variant="caption" sx={{ color: '#303133', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{field.value}</Typography></Box>)}</Stack>
  </Box>;
}

function BatchDetailDrawer({ detail, tab, onTabChange, auditRows, auditLoading, auditError, onClose }: {
  detail: BatchRecord | null;
  tab: number;
  onTabChange: (value: number) => void;
  auditRows: AuditLogItem[];
  auditLoading: boolean;
  auditError: boolean;
  onClose: () => void;
}) {
  return <Drawer anchor="right" open={detail !== null} onClose={onClose} sx={drawerRootSx} slotProps={{ backdrop: { sx: drawerRootSx } }} PaperProps={{ sx: drawerPaperSx }}>
    <Box sx={{ minHeight: '100%', overflow: 'auto', bgcolor: '#f7f9fc', p: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}><Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#303133' }}>信息查看</Typography><IconButton size="small" onClick={onClose} aria-label="关闭详情"><Close fontSize="small" /></IconButton></Stack>
      {detail && <>
        <Box sx={{ borderBottom: '1px solid #e4e7ed' }}><Tabs value={tab} onChange={(_, value: number) => onTabChange(value)} aria-label="批次详情切换"><Tab label="数据信息" /><Tab label="数据审计" /></Tabs></Box>
        {tab === 0 ? <Stack spacing={2} sx={{ mt: 2 }}>
          <DetailSection title="基础信息"><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.75 }}>
            <DetailField label="批次号" value={detail.objectNo} /><DetailField label="工单号" value={detail.workOrderNo} />
            <DetailField label="订单编号" value={detail.orderNumber} /><DetailField label="产品" value={detail.productName ? `${detail.productName}（${detail.productCode}）` : detail.productCode} />
            <DetailField label="制程版本" value={detail.processVersion} /><DetailField label="状态" value={statusBadge(detail.status)} />
            {detail.terminationReason && <><DetailField label="结束原因" value={detail.terminationReason} /><DetailField label="结束时间" value={formatDateTime(detail.terminationAt)} /></>}
          </Box></DetailSection>
          <DetailSection title="数量与计划"><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.75 }}>
            <DetailField label="目标数量" value={detail.targetQuantity} /><DetailField label="良品" value={detail.goodQuantity} />
            <DetailField label="NG" value={detail.ngQuantity} /><DetailField label="报废" value={detail.scrapQuantity} />
            <DetailField label="计划开始时间" value={formatDateTime(detail.plannedStartAt)} /><DetailField label="计划结束时间" value={formatDateTime(detail.plannedEndAt)} />
          </Box></DetailSection>
          <DetailSection title="备注"><Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', color: detail.remark ? '#303133' : '#909399' }}>{detail.remark || '暂无备注'}</Typography></DetailSection>
        </Stack> : <Stack spacing={1} sx={{ mt: 2 }}>
          {auditLoading ? <Box sx={{ py: 8, display: 'grid', placeItems: 'center' }}><CircularProgress size={24} /></Box> : auditError ? <Box sx={{ py: 8, textAlign: 'center', color: '#c62828' }}>数据审计加载失败</Box> : auditRows.length === 0 ? <Box sx={{ py: 8, textAlign: 'center', color: '#909399' }}>暂无数据审计记录</Box> : auditRows.map((item) => <Accordion key={item.id} disableGutters elevation={0} sx={{ border: '1px solid #e4e7ed', borderRadius: '4px !important', overflow: 'hidden', '&::before': { display: 'none' }, '&.Mui-expanded': { m: 0 } }}>
            <AccordionSummary expandIcon={<ExpandMore fontSize="small" />} sx={{ minHeight: 44, px: 1.5, '&.Mui-expanded': { minHeight: 44 }, '& .MuiAccordionSummary-content': { my: 0, minWidth: 0 }, '& .MuiAccordionSummary-content.Mui-expanded': { my: 0 } }}><Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.25fr', columnGap: 1, width: '100%', minWidth: 0 }}><Typography variant="body2" noWrap>{item.operatorDisplayName || item.operatorAccount || '-'}</Typography><Typography variant="body2" noWrap>{auditActionLabel(item)}</Typography><Typography variant="body2" noWrap sx={{ color: '#606266' }}>{formatDateTime(item.operationTime || item.createdAt)}</Typography></Box></AccordionSummary>
            <AccordionDetails sx={{ pt: 0, pb: 1.5 }}><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}><AuditFieldBlock title="变更前" fields={toProductionAuditFields(item.contentBefore, { objectNo: '批次号' })} /><AuditFieldBlock title="变更后" fields={toProductionAuditFields(item.contentAfter, { objectNo: '批次号' })} /></Box></AccordionDetails>
          </Accordion>)}
        </Stack>}
      </>}
    </Box>
  </Drawer>;
}

export default function BatchManagementPage() {
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [submittedKeyword, setSubmittedKeyword] = useState('');
  const [status, setStatus] = useState('');
  const [detail, setDetail] = useState<BatchRecord | null>(null);
  const [detailTab, setDetailTab] = useState(0);
  const [cancelTarget, setCancelTarget] = useState<BatchRecord | null>(null);
  const [endTarget, setEndTarget] = useState<BatchRecord | null>(null);
  const [endReason, setEndReason] = useState('');
  const { showMessage } = useSnackbar();
  const queryClient = useQueryClient();

  const batches = useQuery({
    queryKey: ['production-batches', page, submittedKeyword, status],
    queryFn: async () => (await listBatches({ page, size: PAGE_SIZE, keyword: submittedKeyword, status })).data.data as PageResult<BatchRecord>,
  });
  const audit = useQuery({
    queryKey: ['production-batch-audit', detail?.id],
    enabled: Boolean(detail && detailTab === 1),
    queryFn: async () => {
      const response = await getAuditLogs({ entityType: 'PRODUCTION_OBJECT', entityId: detail!.id, page: 1, size: 100 });
      return ((response.data.data as PageResult<AuditLogItem>).content ?? []);
    },
  });
  const rows = batches.data?.content ?? [];
  const auditRows = useMemo(() => audit.data ?? [], [audit.data]);

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelProductionObject(id),
    onSuccess: () => { showMessage('批次已取消'); setCancelTarget(null); void queryClient.invalidateQueries({ queryKey: ['production-batches'] }); },
    onError: () => showMessage('批次取消失败，请稍后重试', 'error'),
  });
  const endMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => endProductionObject(id, reason),
    onSuccess: () => { showMessage('批次已提前结束'); setEndTarget(null); setEndReason(''); void queryClient.invalidateQueries({ queryKey: ['production-batches'] }); },
    onError: () => showMessage('批次提前结束失败，请检查状态和结束原因', 'error'),
  });

  const notifyUnavailable = (label: string) => showMessage(`${label}将在生产执行模块上线后提供`, 'info');

  const submitSearch = () => {
    setPage(1);
    setSubmittedKeyword(keyword.trim());
  };

  return (
    <Box sx={{ height: { xs: 'auto', lg: 'calc(100vh - 150px)' }, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 1.5, overflow: 'hidden' }}>
      <Box sx={{ flex: '0 0 auto', border: '1px solid #e4e7ed', borderRadius: 1, bgcolor: '#fff', p: 2 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5, alignItems: 'center' }}>
          <TextField
            fullWidth
            size="small"
            label="批次号/工单号/产品"
            placeholder="请输入"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') submitSearch(); }}
            sx={{ '& .MuiInputBase-root': { height: 40 }, '& .MuiInputBase-input': { boxSizing: 'border-box' } }}
            InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
          />
          <TextField select fullWidth size="small" label="状态" value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }} sx={{ '& .MuiInputBase-root': { height: 40 } }}>
            <MenuItem value="">全部</MenuItem>
            {Object.entries(statusLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
          </TextField>
          <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="flex-end">
            <Button size="small" sx={{ height: 40, width: 80, minWidth: 80 }} variant="outlined" startIcon={<RestartAlt />} onClick={() => { setKeyword(''); setSubmittedKeyword(''); setStatus(''); setPage(1); }}>重置</Button>
            <Button size="small" sx={{ height: 40, width: 80, minWidth: 80 }} variant="contained" startIcon={<Search />} onClick={submitSearch}>查询</Button>
          </Stack>
        </Box>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', border: '1px solid #e4e7ed', borderRadius: 1, bgcolor: '#fff', overflow: 'hidden' }}>
        <Box sx={{ flex: '0 0 auto', px: 2, py: 0.75, minHeight: 48, borderBottom: '1px solid #ebeef5', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
          <Typography variant="body2" sx={{ color: '#606266' }}>由工单生产对象拆分生成</Typography>
        </Box>
        <TableContainer sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <Table stickyHeader size="small" sx={{ minWidth: 1340, tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 180 }} /><col style={{ width: 170 }} /><col style={{ width: 190 }} /><col style={{ width: 150 }} />
              <col style={{ width: 110 }} /><col style={{ width: 100 }} /><col style={{ width: 100 }} /><col style={{ width: 100 }} />
              <col style={{ width: 160 }} /><col style={{ width: 160 }} /><col style={{ width: 110 }} /><col style={{ width: 128 }} />
            </colgroup>
            <TableHead>
              <TableRow sx={{ '& .MuiTableCell-root': tableHeaderCellSx }}>
                {['批次号', '工单号', '产品', '制程版本', '目标数量', '良品', 'NG', '报废', '计划开始', '计划结束', '状态', '操作'].map((label) => (
                  <TableCell key={label} align={label === '操作' ? 'center' : undefined} sx={label === '操作' ? { ...tableHeaderCellSx, ...operationColumnSx, bgcolor: '#f5f7fa', zIndex: 4 } : label === '状态' ? { ...tableHeaderCellSx, ...statusColumnSx, bgcolor: '#f5f7fa', zIndex: 4 } : tableHeaderCellSx}>{label}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {batches.isLoading && <TableRow><TableStateCell colSpan={12} align="center" sx={{ height: 240 }}><CircularProgress size={24} /></TableStateCell></TableRow>}
              {batches.isError && <TableRow><TableStateCell colSpan={12} align="center" sx={{ height: 240, color: '#c62828' }}>批次数据加载失败</TableStateCell></TableRow>}
              {!batches.isLoading && !batches.isError && rows.length === 0 && <TableRow><TableStateCell colSpan={12} align="center" sx={{ height: 240, color: '#909399' }}>暂无批次数据</TableStateCell></TableRow>}
              {!batches.isLoading && !batches.isError && rows.map((row) => (
                <TableRow key={row.id} hover tabIndex={0} onClick={() => { setDetail(row); setDetailTab(0); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { setDetail(row); setDetailTab(0); } }} sx={{ ...tableRowSx, cursor: 'pointer' }}>
                  <TableCell sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }} title={row.objectNo}>{row.objectNo}</TableCell>
                  <TableCell sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.workOrderNo}>{row.workOrderNo}</TableCell>
                  <TableCell sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${row.productName}（${row.productCode}）`}><Typography variant="body2" noWrap>{row.productName}</Typography><Typography variant="caption" display="block" color="text.secondary" noWrap>{row.productCode}</Typography></TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{row.processVersion || '-'}</TableCell>
                  <TableCell>{row.targetQuantity}</TableCell><TableCell>{row.goodQuantity}</TableCell><TableCell>{row.ngQuantity}</TableCell><TableCell>{row.scrapQuantity}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(row.plannedStartAt)}</TableCell><TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(row.plannedEndAt)}</TableCell><TableCell sx={statusColumnSx}>{statusBadge(row.status)}</TableCell>
                  <TableCell align="center" onClick={(event) => event.stopPropagation()} sx={operationColumnSx}>
                    {['IN_PROGRESS', 'COMPLETED', 'EARLY_TERMINATED'].includes(row.status) ? <Tooltip title="DHR" arrow><IconButton size="small" aria-label="查看DHR" onClick={() => notifyUnavailable('DHR 查看')}><DescriptionOutlined fontSize="small" /></IconButton></Tooltip> : <Tooltip title="DHR（开工后可用）" arrow><span><IconButton size="small" disabled aria-label="DHR 暂不可用"><DescriptionOutlined fontSize="small" /></IconButton></span></Tooltip>}
                    {['IN_PROGRESS', 'COMPLETED', 'EARLY_TERMINATED'].includes(row.status) ? <Tooltip title="执行详情" arrow><IconButton size="small" aria-label="执行详情" onClick={() => notifyUnavailable('执行详情')}><PlayCircleOutline fontSize="small" /></IconButton></Tooltip> : <Tooltip title="执行详情（开工后可用）" arrow><span><IconButton size="small" disabled aria-label="执行详情暂不可用"><PlayCircleOutline fontSize="small" /></IconButton></span></Tooltip>}
                    {row.status === 'IN_PROGRESS' ? <Tooltip title="结束" arrow><IconButton size="small" aria-label="提前结束批次" color="warning" onClick={() => { setEndTarget(row); setEndReason(''); }}><StopCircleOutlined fontSize="small" /></IconButton></Tooltip> : row.status === 'CREATED' ? <Tooltip title="取消" arrow><IconButton size="small" aria-label="取消批次" color="error" onClick={() => setCancelTarget(row)}><Cancel fontSize="small" /></IconButton></Tooltip> : <Tooltip title="结束（仅进行中的批次可用）" arrow><span><IconButton size="small" disabled aria-label="结束暂不可用"><StopCircleOutlined fontSize="small" /></IconButton></span></Tooltip>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <Box sx={{ flex: '0 0 auto', minHeight: 56, px: 2, borderTop: '1px solid #ebeef5', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="body2" sx={{ color: '#606266' }}>共 {batches.data?.totalElements ?? 0} 条数据</Typography>
          {(batches.data?.totalPages ?? 0) > 1 && <Pagination size="small" count={batches.data?.totalPages} page={page} onChange={(_, value) => setPage(value)} />}
        </Box>
      </Box>

      <BatchDetailDrawer detail={detail} tab={detailTab} onTabChange={setDetailTab} auditRows={auditRows} auditLoading={audit.isLoading} auditError={audit.isError} onClose={() => setDetail(null)} />
      <ConfirmDialog open={cancelTarget !== null} title="取消批次" message={cancelTarget ? `确定取消批次「${cancelTarget.objectNo}」吗？取消后不能再开工。` : ''} confirmText="取消批次" destructive loading={cancelMutation.isPending} onCancel={() => setCancelTarget(null)} onConfirm={() => cancelTarget && cancelMutation.mutate(cancelTarget.id)} />
      <AppDialog open={endTarget !== null} onClose={() => { setEndTarget(null); setEndReason(''); }} maxWidth="sm" fullWidth>
        <DialogTitle>提前结束批次</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ color: '#606266', mb: 1.5 }}>批次「{endTarget?.objectNo ?? '-'}」将进入“提前结束”，生产执行和后续 DHR 推进将停止。</Typography>
          <TextField autoFocus fullWidth required multiline minRows={3} label="结束原因" placeholder="请输入提前结束原因" value={endReason} onChange={(event) => setEndReason(event.target.value)} error={endReason.length > 0 && !endReason.trim()} helperText="结束原因必填" />
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 1.5 }}><Button onClick={() => { setEndTarget(null); setEndReason(''); }}>取消</Button><Button variant="contained" color="warning" disabled={!endReason.trim() || endMutation.isPending} onClick={() => endTarget && endMutation.mutate({ id: endTarget.id, reason: endReason.trim() })}>{endMutation.isPending ? '提交中...' : '确认结束'}</Button></DialogActions>
      </AppDialog>
    </Box>
  );
}
