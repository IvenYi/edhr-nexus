import TableStateCell from '@/components/TableStateCell';
import { type MouseEvent, type ReactNode, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
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
import { Add, Close, Delete, Edit, RestartAlt, Search } from '@mui/icons-material';
import AppDialog from '@/components/AppDialog';
import ConfirmDialog from '@/components/ConfirmDialog';
import StatusBadge from '@/components/StatusBadge';
import { getAuditLogs, type AuditLogItem } from '@/api/audit';
import {
  createWorkshop,
  deleteWorkshop,
  getWorkshops,
  updateWorkshop,
  type WorkshopPayload,
  type WorkshopRecord,
} from '@/api/workshops';
import type { PageResult } from '@/types/common';

interface WorkshopFilters {
  keyword: string;
  status: 'ALL' | 'ACTIVE' | 'INACTIVE';
}

interface WorkshopForm {
  code: string;
  name: string;
  description: string;
  status: 'ACTIVE' | 'INACTIVE';
}

interface AuditField {
  label: string;
  value: string;
}

const PAGE_SIZE_OPTIONS = [20, 50, 100, 200] as const;
const emptyFilters: WorkshopFilters = { keyword: '', status: 'ALL' };
const emptyForm: WorkshopForm = { code: '', name: '', description: '', status: 'ACTIVE' };
const fieldSx = { '& .MuiInputBase-root': { minHeight: 40 } };
const queryButtonSx = { height: 40, width: 80, minWidth: 80 };
const headerCellSx = {
  height: 48,
  py: 0,
  color: '#606266',
  fontWeight: 600,
  bgcolor: '#f5f7fa',
  borderBottom: '1px solid #e4e7ed',
};
const bodyCellSx = {
  height: 40,
  py: 0,
  color: '#303133',
  borderBottom: 'none',
  boxShadow: 'inset 0 -1px 0 #ebeef5',
};
const appContentDrawerSx = {
  top: 0,
  bottom: 0,
  zIndex: (theme: { zIndex: { drawer: number } }) => theme.zIndex.drawer + 3,
  '& .MuiBackdrop-root': { top: 0 },
};
const appContentDrawerPaperSx = {
  ...appContentDrawerSx,
  width: { xs: '100vw', sm: 560 },
  height: '100vh',
  bgcolor: '#f7f9fc',
  transform: 'none !important',
};
const auditFieldLabels: Record<string, string> = {
  code: '车间编码',
  name: '车间名称',
  description: '描述',
  status: '状态',
};
const actionLabels: Record<string, string> = { CREATE: '新增', UPDATE: '编辑', DELETE: '删除' };

function statusLabel(status?: string) {
  return status === 'ACTIVE' ? '启用' : status === 'INACTIVE' ? '停用' : status || '-';
}

function formatDateTime(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.replace('T', ' ').slice(0, 16);
  const pad = (input: number) => String(input).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseSnapshot(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function auditFields(value: unknown): AuditField[] {
  return Object.entries(parseSnapshot(value)).map(([field, fieldValue]) => ({
    label: auditFieldLabels[field] ?? field,
    value: field === 'status' ? statusLabel(String(fieldValue)) : fieldValue === null || fieldValue === '' ? '-' : String(fieldValue),
  }));
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box sx={{ bgcolor: '#fff', border: '1px solid #e4e7ed', borderRadius: 1, overflow: 'hidden' }}>
      <Box sx={{ px: 1.5, py: 1, bgcolor: '#f8fafc', borderBottom: '1px solid #e4e7ed' }}>
        <Typography sx={{ fontWeight: 600, color: '#303133' }}>{title}</Typography>
      </Box>
      <Box sx={{ p: 1.5 }}>{children}</Box>
    </Box>
  );
}

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" sx={{ display: 'block', mb: 0.5, color: '#909399' }}>{label}</Typography>
      <Box sx={{ color: '#303133', fontSize: 14, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{children || '-'}</Box>
    </Box>
  );
}

function AuditSnapshot({ title, fields }: { title: string; fields: AuditField[] }) {
  return (
    <Box sx={{ p: 1, bgcolor: '#f8fafc', border: '1px solid #e4e7ed', borderRadius: 1 }}>
      <Typography variant="caption" sx={{ display: 'block', mb: 0.75, color: '#606266', fontWeight: 600 }}>{title}</Typography>
      <Stack spacing={0.75}>
        {fields.length === 0 ? <Typography variant="caption" sx={{ color: '#909399' }}>无</Typography> : fields.map((field) => (
          <Box key={field.label} sx={{ display: 'grid', gridTemplateColumns: '88px minmax(0, 1fr)', gap: 1 }}>
            <Typography variant="caption" sx={{ color: '#606266' }}>{field.label}</Typography>
            <Typography variant="caption" sx={{ color: '#303133', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{field.value}</Typography>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : '操作失败，请稍后重试';
}

export default function WorkshopManagementPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<WorkshopFilters>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<WorkshopFilters>(emptyFilters);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingWorkshop, setEditingWorkshop] = useState<WorkshopRecord | null>(null);
  const [form, setForm] = useState<WorkshopForm>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<WorkshopRecord | null>(null);
  const [selectedWorkshop, setSelectedWorkshop] = useState<WorkshopRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState(0);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const workshopsQuery = useQuery({
    queryKey: ['workshops', appliedFilters, page, pageSize],
    queryFn: () => getWorkshops({
      keyword: appliedFilters.keyword.trim() || undefined,
      status: appliedFilters.status === 'ALL' ? undefined : appliedFilters.status,
      page,
      size: pageSize,
    }),
  });
  const rows = workshopsQuery.data?.content ?? [];

  const auditQuery = useQuery({
    queryKey: ['workshop-audit', selectedWorkshop?.id],
    queryFn: async () => {
      const response = await getAuditLogs({ entityType: 'WORKSHOP', entityId: selectedWorkshop?.id, page: 1, size: 200 });
      return (response.data.data as PageResult<AuditLogItem>).content ?? [];
    },
    enabled: drawerOpen && drawerTab === 1 && Boolean(selectedWorkshop?.id),
  });

  const saveMutation = useMutation({
    mutationFn: (payload: WorkshopPayload) => editingWorkshop
      ? updateWorkshop(editingWorkshop.id, payload)
      : createWorkshop(payload),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['workshops'] });
      setDialogOpen(false);
      setSelectedWorkshop((current) => current?.id === saved.id ? saved : current);
      setSnackbar({ open: true, message: editingWorkshop ? '车间编辑成功' : '车间新增成功', severity: 'success' });
    },
    onError: (error) => setSnackbar({ open: true, message: errorMessage(error), severity: 'error' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteWorkshop(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workshops'] });
      if (selectedWorkshop?.id === deleteTarget?.id) {
        setDrawerOpen(false);
        setSelectedWorkshop(null);
      }
      setDeleteTarget(null);
      setSnackbar({ open: true, message: '车间删除成功', severity: 'success' });
    },
    onError: (error) => setSnackbar({ open: true, message: errorMessage(error), severity: 'error' }),
  });

  const totalPages = Math.max(workshopsQuery.data?.totalPages ?? 0, 1);
  const canSave = form.code.trim().length > 0 && form.name.trim().length > 0 && !saveMutation.isPending;
  const auditEvents = useMemo(() => auditQuery.data ?? [], [auditQuery.data]);

  const openCreateDialog = () => {
    setEditingWorkshop(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEditDialog = (workshop: WorkshopRecord) => {
    setEditingWorkshop(workshop);
    setForm({
      code: workshop.code,
      name: workshop.name,
      description: workshop.description ?? '',
      status: workshop.status,
    });
    setDialogOpen(true);
  };

  const openDetail = (workshop: WorkshopRecord) => {
    setSelectedWorkshop(workshop);
    setDrawerTab(0);
    setDrawerOpen(true);
  };

  const stopRowClick = (event: MouseEvent) => event.stopPropagation();

  return (
    <Box data-workshop-management-page sx={{ height: 'calc(100vh - 150px)', minHeight: 0, bgcolor: '#fff', border: '1px solid #e4e7ed', borderRadius: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ height: 48, px: 2, borderBottom: '1px solid #e4e7ed', flexShrink: 0 }}>
        <Box>
          <Typography sx={{ fontWeight: 600, color: '#303133' }}>车间管理</Typography>
          <Typography variant="caption" sx={{ color: '#909399' }}>维护车间基础信息与启停状态</Typography>
        </Box>
        <Button size="small" variant="contained" startIcon={<Add />} onClick={openCreateDialog}>新增车间</Button>
      </Stack>

      <Box sx={{ p: 1.5, borderBottom: '1px solid #e4e7ed', flexShrink: 0 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(220px, 1fr) 140px auto auto' }, gap: 1, alignItems: 'center' }}>
          <TextField
            size="small"
            placeholder="车间名称/编码"
            value={filters.keyword}
            onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                setAppliedFilters(filters);
                setPage(1);
              }
            }}
            sx={fieldSx}
            InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
          />
          <TextField select size="small" label="状态" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as WorkshopFilters['status'] }))} sx={fieldSx}>
            <MenuItem value="ALL">全部</MenuItem>
            <MenuItem value="ACTIVE">启用</MenuItem>
            <MenuItem value="INACTIVE">停用</MenuItem>
          </TextField>
          <Button size="small" variant="outlined" startIcon={<RestartAlt />} sx={queryButtonSx} onClick={() => { setFilters(emptyFilters); setAppliedFilters(emptyFilters); setPage(1); }}>重置</Button>
          <Button size="small" variant="contained" startIcon={<Search />} sx={queryButtonSx} onClick={() => { setAppliedFilters(filters); setPage(1); }}>查询</Button>
        </Box>
      </Box>

      <TableContainer sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <Table stickyHeader size="small" sx={{ tableLayout: 'fixed', minWidth: 820, height: rows.length === 0 ? '100%' : 'auto' }}>
          <colgroup>
            <col style={{ width: 180 }} />
            <col style={{ width: 220 }} />
            <col />
            <col style={{ width: 100 }} />
            <col style={{ width: 104 }} />
          </colgroup>
          <TableHead>
            <TableRow>
              <TableCell sx={headerCellSx}>车间编码</TableCell>
              <TableCell sx={headerCellSx}>车间名称</TableCell>
              <TableCell sx={headerCellSx}>描述</TableCell>
              <TableCell sx={headerCellSx}>状态</TableCell>
              <TableCell align="center" sx={{ ...headerCellSx, position: 'sticky', right: 0, zIndex: 4 }}>操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody sx={{ height: rows.length === 0 ? '100%' : 'auto' }}>
            {workshopsQuery.isLoading ? (
              <TableRow sx={{ height: '100%' }}><TableStateCell colSpan={5} align="center" sx={{ borderBottom: 'none' }}><CircularProgress size={24} /></TableStateCell></TableRow>
            ) : workshopsQuery.isError ? (
              <TableRow sx={{ height: '100%' }}><TableStateCell colSpan={5} align="center" sx={{ borderBottom: 'none', color: '#909399' }}>加载失败，请稍后重试</TableStateCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow sx={{ height: '100%' }}><TableStateCell colSpan={5} align="center" sx={{ borderBottom: 'none', color: '#909399' }}>暂无车间数据</TableStateCell></TableRow>
            ) : rows.map((workshop) => (
              <TableRow key={workshop.id} hover onClick={() => openDetail(workshop)} sx={{ cursor: 'pointer', '& .MuiTableCell-root': bodyCellSx }}>
                <TableCell>{workshop.code}</TableCell>
                <TableCell><Typography component="span" sx={{ color: '#1890ff', fontSize: 14 }}>{workshop.name}</Typography></TableCell>
                <TableCell sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{workshop.description || '-'}</TableCell>
                <TableCell><StatusBadge label={statusLabel(workshop.status)} color={workshop.status === 'ACTIVE' ? 'success' : 'default'} /></TableCell>
                <TableCell align="center" onClick={stopRowClick} sx={{ position: 'sticky', right: 0, bgcolor: '#fff', boxShadow: '-6px 0 8px -8px rgba(0,0,0,.35)' }}>
                  <Tooltip title="编辑"><IconButton size="small" aria-label={`编辑车间 ${workshop.name}`} onClick={() => openEditDialog(workshop)}><Edit fontSize="small" /></IconButton></Tooltip>
                  <Tooltip title={workshop.deletable ? '删除' : '车间已被引用，只能停用'}>
                    <span><IconButton size="small" color="error" disabled={!workshop.deletable} aria-label={`删除车间 ${workshop.name}`} onClick={() => setDeleteTarget(workshop)}><Delete fontSize="small" /></IconButton></span>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Box sx={{ minHeight: 52, px: 2, borderTop: '1px solid #e4e7ed', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexShrink: 0 }}>
        <Typography sx={{ color: '#909399' }}>共 {workshopsQuery.data?.totalElements ?? 0} 条数据</Typography>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Pagination page={page} count={totalPages} color="primary" size="small" onChange={(_, value) => setPage(value)} />
          <FormControl size="small" sx={{ minWidth: 116 }}>
            <Select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} sx={{ height: 32, fontSize: 14 }}>
              {PAGE_SIZE_OPTIONS.map((option) => <MenuItem key={option} value={option}>{option} 条/页</MenuItem>)}
            </Select>
          </FormControl>
        </Stack>
      </Box>

      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        sx={appContentDrawerSx}
        slotProps={{ backdrop: { sx: appContentDrawerSx } }}
        PaperProps={{ sx: appContentDrawerPaperSx }}
      >
        <Box sx={{ minHeight: '100%', p: 2 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
            <Box>
              <Typography sx={{ fontWeight: 600, color: '#303133' }}>{selectedWorkshop?.name || '车间详情'}</Typography>
              <Typography variant="caption" sx={{ color: '#909399' }}>{selectedWorkshop?.code || '-'}</Typography>
            </Box>
            <Tooltip title="关闭" placement="left" arrow><IconButton size="small" aria-label="关闭车间详情" onClick={() => setDrawerOpen(false)}><Close fontSize="small" /></IconButton></Tooltip>
          </Stack>
          <Box sx={{ mb: 1.5, bgcolor: '#fff', borderBottom: '1px solid #e4e7ed' }}>
            <Tabs value={drawerTab} onChange={(_, value: number) => setDrawerTab(value)} aria-label="车间详情切换">
              <Tab label="详情" />
              <Tab label="数据审计" />
            </Tabs>
          </Box>
          {drawerTab === 0 ? (
            <Stack spacing={1.5}>
              <DetailSection title="基本信息">
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                  <DetailField label="车间编码">{selectedWorkshop?.code}</DetailField>
                  <DetailField label="车间名称">{selectedWorkshop?.name}</DetailField>
                  <DetailField label="状态"><StatusBadge label={statusLabel(selectedWorkshop?.status)} color={selectedWorkshop?.status === 'ACTIVE' ? 'success' : 'default'} /></DetailField>
                  <DetailField label="引用情况">{selectedWorkshop?.referenced ? '已被引用，编码锁定且不能删除' : '未被引用'}</DetailField>
                  <Box sx={{ gridColumn: '1 / -1' }}><DetailField label="描述">{selectedWorkshop?.description || '-'}</DetailField></Box>
                </Box>
              </DetailSection>
              <DetailSection title="更新时间">
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                  <DetailField label="创建时间">{formatDateTime(selectedWorkshop?.createdAt)}</DetailField>
                  <DetailField label="更新时间">{formatDateTime(selectedWorkshop?.updatedAt)}</DetailField>
                </Box>
              </DetailSection>
            </Stack>
          ) : auditQuery.isLoading ? (
            <Box sx={{ py: 5, textAlign: 'center' }}><CircularProgress size={24} /></Box>
          ) : auditQuery.isError ? (
            <Stack spacing={1.5} alignItems="center" sx={{ py: 5, color: '#909399' }}>
              <Typography color="inherit">数据审计加载失败</Typography>
              <Button size="small" variant="outlined" onClick={() => auditQuery.refetch()}>重新加载</Button>
            </Stack>
          ) : auditEvents.length === 0 ? (
            <Box sx={{ py: 5, textAlign: 'center', color: '#909399' }}>暂无审计记录</Box>
          ) : (
            <Stack spacing={1.5}>
              {auditEvents.map((event) => (
                <Box key={String(event.id)} sx={{ p: 1.5, bgcolor: '#fff', border: '1px solid #e4e7ed', borderRadius: 1 }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                    <Typography sx={{ fontWeight: 600, color: '#303133' }}>{event.actionLabel || actionLabels[(event.action ?? '').toUpperCase()] || event.action || '-'}</Typography>
                    <Typography variant="caption" sx={{ color: '#909399' }}>{formatDateTime(event.operationTime || event.createdAt)}</Typography>
                  </Stack>
                  <Typography variant="caption" sx={{ display: 'block', mb: 1, color: '#606266' }}>操作人：{event.operatorDisplayName || event.operatorAccount || '-'}</Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
                    <AuditSnapshot title="变更前" fields={auditFields(event.contentBefore)} />
                    <AuditSnapshot title="变更后" fields={auditFields(event.contentAfter)} />
                  </Box>
                </Box>
              ))}
            </Stack>
          )}
        </Box>
      </Drawer>

      <AppDialog open={dialogOpen} onClose={() => !saveMutation.isPending && setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingWorkshop ? '编辑车间' : '新增车间'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              required
              label="车间编码"
              value={form.code}
              disabled={Boolean(editingWorkshop && !editingWorkshop.codeEditable)}
              helperText={editingWorkshop && !editingWorkshop.codeEditable ? '该车间已被引用，编码不可修改' : '租户内唯一，最多64个字符'}
              inputProps={{ maxLength: 64 }}
              onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
            />
            <TextField required label="车间名称" value={form.name} inputProps={{ maxLength: 128 }} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
            <TextField label="描述" value={form.description} multiline minRows={3} inputProps={{ maxLength: 512 }} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
            <TextField select required label="状态" value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as WorkshopForm['status'] }))}>
              <MenuItem value="ACTIVE">启用</MenuItem>
              <MenuItem value="INACTIVE">停用</MenuItem>
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialogOpen(false)} disabled={saveMutation.isPending}>取消</Button>
          <Button
            variant="contained"
            disabled={!canSave}
            onClick={() => saveMutation.mutate({ code: form.code, name: form.name, description: form.description || undefined, status: form.status })}
          >
            {saveMutation.isPending ? '保存中...' : '保存'}
          </Button>
        </DialogActions>
      </AppDialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="确认删除车间"
        message={`确定删除车间「${deleteTarget?.name || ''}」吗？删除后无法恢复。`}
        confirmText="删除"
        destructive
        loading={deleteMutation.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />

      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar((current) => ({ ...current, open: false }))} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((current) => ({ ...current, open: false }))}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
