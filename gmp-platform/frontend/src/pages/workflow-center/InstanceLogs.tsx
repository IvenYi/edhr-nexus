import TableStateCell from '@/components/TableStateCell';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { useState } from 'react';
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Pagination, CircularProgress,
} from '@mui/material';
import { getInstanceLogs } from '@/api/workflow-logs';
import StatusBadge from '@/components/StatusBadge';
import type { PageResult } from '@/types/common';

interface InstanceLog {
  id: number;
  nodeName: string;
  action: string;
  operatorName: string;
  comment: string;
  createdAt: string;
  status: string;
}

const LOG_STATUS_MAP: Record<string, { label: string; color: 'success' | 'error' | 'warning' | 'info' | 'default' }> = {
  COMPLETED: { label: '已完成', color: 'success' },
  REJECTED: { label: '已退回', color: 'error' },
  PROCESSING: { label: '处理中', color: 'info' },
};

export default function InstanceLogs() {
  const { id } = useParams<{ id: string }>();
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['instance-logs', id, page],
    queryFn: async () => {
      const res = await getInstanceLogs(Number(id), { page, size: 10 });
      return res.data.data as PageResult<InstanceLog>;
    },
    enabled: !!id,
  });

  const content = data?.content ?? [];

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>流程日志 - 实例 {id}</Typography>
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>节点</TableCell>
              <TableCell>操作</TableCell>
              <TableCell>操作人</TableCell>
              <TableCell>状态</TableCell>
              <TableCell>备注</TableCell>
              <TableCell>时间</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow><TableStateCell colSpan={7} align="center"><CircularProgress size={24} /></TableStateCell></TableRow>
            ) : isError ? (
              <TableRow><TableStateCell colSpan={7} align="center">加载失败</TableStateCell></TableRow>
            ) : content.length === 0 ? (
              <TableRow><TableStateCell colSpan={7} align="center">暂无日志</TableStateCell></TableRow>
            ) : (
              content.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>{log.id}</TableCell>
                  <TableCell>{log.nodeName}</TableCell>
                  <TableCell>{log.action}</TableCell>
                  <TableCell>{log.operatorName}</TableCell>
                  <TableCell>
                    <StatusBadge
                      label={LOG_STATUS_MAP[log.status]?.label || log.status}
                      color={LOG_STATUS_MAP[log.status]?.color || 'default'}
                    />
                  </TableCell>
                  <TableCell>{log.comment}</TableCell>
                  <TableCell>{log.createdAt}</TableCell>
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
