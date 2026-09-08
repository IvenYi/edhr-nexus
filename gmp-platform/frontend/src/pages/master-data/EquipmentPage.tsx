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
  Pagination,
  Snackbar,
  Alert,
  CircularProgress,
} from '@mui/material';
import AppDialog from '@/components/AppDialog';
import { Add, Edit, Delete } from '@mui/icons-material';
import { getEquipmentTypes, createEquipmentType, updateEquipmentType, deleteEquipmentType } from '@/api/master-data';
import type { PageResult } from '@/types/common';

interface EquipmentType {
  id: number;
  code: string;
  name: string;
  description: string;
}

export default function EquipmentPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ code: '', name: '', description: '' });
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['equipment-types', page],
    queryFn: async () => {
      const res = await getEquipmentTypes({ page, size: 10 });
      return res.data.data as PageResult<EquipmentType>;
    },
  });

  const saveMutation = useMutation({
    mutationFn: (body: typeof form) =>
      editingId ? updateEquipmentType(editingId, body) : createEquipmentType(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment-types'] });
      setOpen(false); setEditingId(null); setForm({ code: '', name: '', description: '' });
      setSnackbar({ open: true, message: editingId ? '更新成功' : '创建成功', severity: 'success' });
    },
    onError: () => setSnackbar({ open: true, message: '操作失败', severity: 'error' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteEquipmentType(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment-types'] });
      setSnackbar({ open: true, message: '删除成功', severity: 'success' });
    },
  });

  const handleEdit = (item: EquipmentType) => {
    setEditingId(item.id);
    setForm({ code: item.code, name: item.name, description: item.description || '' });
    setOpen(true);
  };
  const handleAdd = () => {
    setEditingId(null); setForm({ code: '', name: '', description: '' }); setOpen(true);
  };

  const content = data?.content ?? [];

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h5">设备管理</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={handleAdd}>新增设备</Button>
      </Box>
      <TableContainer>
        <Table>
          <TableHead><TableRow><TableCell>ID</TableCell><TableCell>编码</TableCell><TableCell>名称</TableCell><TableCell>描述</TableCell><TableCell align="center" sx={{ width: 96, minWidth: 96 }}>操作</TableCell></TableRow></TableHead>
          <TableBody>
            {isLoading ? <TableRow><TableStateCell colSpan={5} align="center"><CircularProgress size={24} /></TableStateCell></TableRow>
            : isError ? <TableRow><TableStateCell colSpan={5} align="center">加载失败</TableStateCell></TableRow>
            : content.length === 0 ? <TableRow><TableStateCell colSpan={5} align="center">暂无数据</TableStateCell></TableRow>
            : content.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.id}</TableCell><TableCell>{item.code}</TableCell><TableCell>{item.name}</TableCell><TableCell>{item.description}</TableCell>
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
        <DialogTitle>{editingId ? '编辑设备' : '新增设备'}</DialogTitle>
        <DialogContent>
          <TextField label="编码" fullWidth margin="normal" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          <TextField label="名称" fullWidth margin="normal" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <TextField label="描述" fullWidth margin="normal" multiline rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>取消</Button>
          <Button variant="contained" onClick={() => saveMutation.mutate(form)} disabled={!form.code || !form.name || saveMutation.isPending}>保存</Button>
        </DialogActions>
      </AppDialog>
      <AppDialog open={deleteConfirm !== null} onClose={() => setDeleteConfirm(null)}>
        <DialogTitle>确认删除</DialogTitle>
        <DialogContent>确定要删除该设备吗？</DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>取消</Button>
          <Button color="error" variant="contained" onClick={() => { if (deleteConfirm) { deleteMutation.mutate(deleteConfirm); setDeleteConfirm(null); } }}>删除</Button>
        </DialogActions>
      </AppDialog>
      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
