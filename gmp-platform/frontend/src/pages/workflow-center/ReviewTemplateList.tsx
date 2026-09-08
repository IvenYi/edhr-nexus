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
} from '@mui/material';
import AppDialog from '@/components/AppDialog';
import { Add, Edit } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import client from '@/api/client';
import { WORKFLOW_STATUS_MAP } from '@/utils/constants';
import StatusBadge from '@/components/StatusBadge';
import type { PageResult } from '@/types/common';

interface WfTemplate {
  id: number;
  name: string;
  type: string;
  status: string;
  description: string;
  createdAt: string;
}

export default function ReviewTemplateList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['review-templates', page],
    queryFn: async () => {
      const res = await client.get('/workflow/review-templates', { params: { page, size: 10 } });
      return res.data.data as PageResult<WfTemplate>;
    },
  });

  const createMutation = useMutation({
    mutationFn: (body: { name: string; description: string }) =>
      client.post('/workflow/review-templates', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-templates'] });
      setOpen(false);
      setForm({ name: '', description: '' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => client.delete(`/workflow/review-templates/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['review-templates'] }),
  });

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h5">审核流程模板</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={() => setOpen(true)}>
          创建模板
        </Button>
      </Box>
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>名称</TableCell>
              <TableCell>描述</TableCell>
              <TableCell>状态</TableCell>
              <TableCell>创建时间</TableCell>
              <TableCell align="center" sx={{ width: 64, minWidth: 64 }}>操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow><TableStateCell colSpan={6}>加载中...</TableStateCell></TableRow>
            ) : (
              data?.content?.map((t) => (
                <TableRow key={t.id}>
                  <TableCell sx={{ fontFamily: 'monospace' }}>{t.id}</TableCell>
                  <TableCell>{t.name}</TableCell>
                  <TableCell>{t.description}</TableCell>
                  <TableCell>
                    <StatusBadge
                      label={WORKFLOW_STATUS_MAP[t.status as keyof typeof WORKFLOW_STATUS_MAP]?.label || t.status}
                      color={WORKFLOW_STATUS_MAP[t.status as keyof typeof WORKFLOW_STATUS_MAP]?.color || 'default'}
                    />
                  </TableCell>
                  <TableCell>{t.createdAt}</TableCell>
                  <TableCell align="center" sx={{ width: 64, minWidth: 64 }}>
                    <Tooltip title="编辑"><IconButton size="small" aria-label="编辑" onClick={() => navigate(`/workflow/review-templates/${t.id}`)}>
                      <Edit fontSize="small" />
                    </IconButton></Tooltip>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
      {data && (
        <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
          <Pagination count={data.totalPages} page={page} onChange={(_, p) => setPage(p)} />
        </Box>
      )}
      <AppDialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>创建审核流程模板</DialogTitle>
        <DialogContent>
          <TextField label="模板名称" fullWidth margin="normal"
            value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <TextField label="描述" fullWidth margin="normal" multiline rows={3}
            value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>取消</Button>
          <Button variant="contained" onClick={() => createMutation.mutate(form)}>创建</Button>
        </DialogActions>
      </AppDialog>
    </Box>
  );
}
