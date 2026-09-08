import TableStateCell from '@/components/TableStateCell';
import {
  useQuery,
  useMutation,
  useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Pagination,
  Snackbar,
  Alert,
  CircularProgress,
} from '@mui/material';
import AppDialog from '@/components/AppDialog';
import { Add, Edit, Delete } from '@mui/icons-material';
import { getBindingRules, createBindingRule, updateBindingRule, deleteBindingRule } from '@/api/workflow-binding';
import { BUSINESS_TYPES, WORKFLOW_STATUS_MAP } from '@/utils/constants';
import type { PageResult } from '@/types/common';

interface BindingRule {
  id: number;
  name: string;
  businessType: string;
  templateName: string;
  priority: number;
  status: string;
  description: string;
}

export default function BindingRuleList() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', businessType: '', templateName: '', priority: 0, description: '' });
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['binding-rules', page],
    queryFn: async () => {
      const res = await getBindingRules({ page, size: 10 });
      return res.data.data as PageResult<BindingRule>;
    },
  });

  const saveMutation = useMutation({
    mutationFn: (body: typeof form) =>
      editingId ? updateBindingRule(editingId, body) : createBindingRule(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['binding-rules'] });
      setOpen(false); setEditingId(null); setForm({ name: '', businessType: '', templateName: '', priority: 0, description: '' });
      setSnackbar({ open: true, message: editingId ? '更新成功' : '创建成功', severity: 'success' });
    },
    onError: () => setSnackbar({ open: true, message: '操作失败', severity: 'error' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteBindingRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['binding-rules'] });
      setSnackbar({ open: true, message: '删除成功', severity: 'success' });
    },
  });

  const handleEdit = (item: BindingRule) => {
    setEditingId(item.id);
    setForm({ name: item.name, businessType: item.businessType, templateName: item.templateName,
      priority: item.priority, description: item.description || '' });
    setOpen(true);
  };

  const content = data?.content ?? [];

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h5">流程绑定配置</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={() => { setEditingId(null); setForm({ name: '', businessType: '', templateName: '', priority: 0, description: '' }); setOpen(true); }}>新增绑定</Button>
      </Box>
      <TableContainer>
        <Table>
          <TableHead><TableRow><TableCell>ID</TableCell><TableCell>名称</TableCell><TableCell>业务类型</TableCell><TableCell>流程模板</TableCell><TableCell>优先级</TableCell><TableCell>描述</TableCell><TableCell align="center" sx={{ width: 96, minWidth: 96 }}>操作</TableCell></TableRow></TableHead>
          <TableBody>
            {isLoading ? <TableRow><TableStateCell colSpan={7} align="center"><CircularProgress size={24} /></TableStateCell></TableRow>
            : isError ? <TableRow><TableStateCell colSpan={7} align="center">加载失败</TableStateCell></TableRow>
            : content.length === 0 ? <TableRow><TableStateCell colSpan={7} align="center">暂无数据</TableStateCell></TableRow>
            : content.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.id}</TableCell><TableCell>{item.name}</TableCell><TableCell>{item.businessType}</TableCell>
                <TableCell>{item.templateName}</TableCell><TableCell>{item.priority}</TableCell><TableCell>{item.description}</TableCell>
                <TableCell align="center" sx={{ width: 96, minWidth: 96 }}>
                  <Tooltip title="编辑"><IconButton size="small" aria-label="编辑" onClick={() => handleEdit(item)}><Edit fontSize="small" /></IconButton></Tooltip>
                  <Tooltip title="删除"><IconButton size="small" color="error" aria-label="删除" onClick={() => setDeleteConfirm(item.id)}><Delete fontSize="small" /></IconButton></Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {data && data.totalPages > 1 && <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}><Pagination count={data.totalPages} page={page} onChange={(_, p) => setPage(p)} /></Box>}
      <AppDialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingId ? '编辑绑定规则' : '新增绑定规则'}</DialogTitle>
        <DialogContent>
          <TextField label="名称" fullWidth margin="normal" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <TextField select label="业务类型" fullWidth margin="normal" value={form.businessType} onChange={(e) => setForm({ ...form, businessType: e.target.value })}>
            {BUSINESS_TYPES.map((bt) => <MenuItem key={bt.value} value={bt.value}>{bt.label}</MenuItem>)}
          </TextField>
          <TextField label="流程模板" fullWidth margin="normal" value={form.templateName} onChange={(e) => setForm({ ...form, templateName: e.target.value })} />
          <TextField label="优先级" type="number" fullWidth margin="normal" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} />
          <TextField label="描述" fullWidth margin="normal" multiline rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>取消</Button>
          <Button variant="contained" onClick={() => saveMutation.mutate(form)} disabled={!form.name || !form.businessType || saveMutation.isPending}>保存</Button>
        </DialogActions>
      </AppDialog>
      <AppDialog open={deleteConfirm !== null} onClose={() => setDeleteConfirm(null)}>
        <DialogTitle>确认删除</DialogTitle><DialogContent>确定要删除该绑定规则吗？</DialogContent>
        <DialogActions><Button onClick={() => setDeleteConfirm(null)}>取消</Button><Button color="error" variant="contained" onClick={() => { if (deleteConfirm) { deleteMutation.mutate(deleteConfirm); setDeleteConfirm(null); } }}>删除</Button></DialogActions>
      </AppDialog>
      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
