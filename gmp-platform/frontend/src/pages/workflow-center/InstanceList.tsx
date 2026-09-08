import TableStateCell from '@/components/TableStateCell';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Pagination, CircularProgress, IconButton, Tooltip,
} from '@mui/material';
import { HistoryOutlined, VisibilityOutlined } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { listInstances } from '@/api/workflow-instances';
import { INSTANCE_STATUS_MAP } from '@/utils/constants';
import StatusBadge from '@/components/StatusBadge';
import type { PageResult } from '@/types/common';

interface WorkflowInstance {
  id: number;
  templateName: string;
  businessKey: string;
  status: string;
  startUserName: string;
  startTime: string;
  endTime: string;
}

export default function InstanceList() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['workflow-instances', page],
    queryFn: async () => {
      const res = await listInstances({ page, size: 10 });
      return res.data.data as PageResult<WorkflowInstance>;
    },
  });

  const content = data?.content ?? [];

  return (
    <Box>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h5">流程实例列表</Typography>
      </Box>
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>模板名称</TableCell>
              <TableCell>业务编号</TableCell>
              <TableCell>状态</TableCell>
              <TableCell>发起人</TableCell>
              <TableCell>开始时间</TableCell>
              <TableCell>结束时间</TableCell>
              <TableCell align="center" sx={{ width: 96, minWidth: 96 }}>操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow><TableStateCell colSpan={8} align="center"><CircularProgress size={24} /></TableStateCell></TableRow>
            ) : isError ? (
              <TableRow><TableStateCell colSpan={8} align="center">加载失败</TableStateCell></TableRow>
            ) : content.length === 0 ? (
              <TableRow><TableStateCell colSpan={8} align="center">暂无数据</TableStateCell></TableRow>
            ) : (
              content.map((item) => (
                <TableRow key={item.id}>
                  <TableCell sx={{ fontFamily: 'monospace' }}>{item.id}</TableCell>
                  <TableCell>{item.templateName}</TableCell>
                  <TableCell>{item.businessKey}</TableCell>
                  <TableCell>
                    <StatusBadge
                      label={INSTANCE_STATUS_MAP[item.status as keyof typeof INSTANCE_STATUS_MAP]?.label || item.status}
                      color={INSTANCE_STATUS_MAP[item.status as keyof typeof INSTANCE_STATUS_MAP]?.color || 'default'}
                    />
                  </TableCell>
                  <TableCell>{item.startUserName}</TableCell>
                  <TableCell>{item.startTime}</TableCell>
                  <TableCell>{item.endTime || '-'}</TableCell>
                  <TableCell align="center" sx={{ width: 96, minWidth: 96 }}>
                    <Tooltip title="详情"><IconButton size="small" aria-label="详情" onClick={() => navigate(`/workflow/instances/${item.id}`)}><VisibilityOutlined fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="日志"><IconButton size="small" aria-label="日志" onClick={() => navigate(`/workflow/instances/${item.id}/logs`)}><HistoryOutlined fontSize="small" /></IconButton></Tooltip>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
      {data && data.totalPages > 1 && (
        <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
          <Pagination count={data.totalPages} page={page} onChange={(_, p) => setPage(p)} />
        </Box>
      )}
    </Box>
  );
}
