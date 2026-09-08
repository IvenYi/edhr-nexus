import TableStateCell from '@/components/TableStateCell';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Pagination, CircularProgress,
} from '@mui/material';
import { getSignatures } from '@/api/signatures';
import StatusBadge from '@/components/StatusBadge';
import type { PageResult } from '@/types/common';

interface Signature {
  id: number;
  signerName: string;
  signatureType: string;
  targetType: string;
  targetId: number;
  status: string;
  signedAt: string;
}

const SIG_STATUS_MAP: Record<string, { label: string; color: 'success' | 'error' | 'warning' | 'default' }> = {
  SIGNED: { label: '已签署', color: 'success' },
  PENDING: { label: '待签署', color: 'warning' },
  REVOKED: { label: '已撤销', color: 'error' },
};

export default function SignatureLogPage() {
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['signatures', page],
    queryFn: async () => {
      const res = await getSignatures({ page, size: 10 });
      return res.data.data as PageResult<Signature>;
    },
  });

  const content = data?.content ?? [];

  return (
    <Box>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h5">签名记录</Typography>
      </Box>
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>签署人</TableCell>
              <TableCell>签名类型</TableCell>
              <TableCell>目标类型</TableCell>
              <TableCell>目标ID</TableCell>
              <TableCell>状态</TableCell>
              <TableCell>签署时间</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow><TableStateCell colSpan={7} align="center"><CircularProgress size={24} /></TableStateCell></TableRow>
            ) : isError ? (
              <TableRow><TableStateCell colSpan={7} align="center">加载失败</TableStateCell></TableRow>
            ) : content.length === 0 ? (
              <TableRow><TableStateCell colSpan={7} align="center">暂无数据</TableStateCell></TableRow>
            ) : (
              content.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.id}</TableCell>
                  <TableCell>{item.signerName}</TableCell>
                  <TableCell>{item.signatureType}</TableCell>
                  <TableCell>{item.targetType}</TableCell>
                  <TableCell>{item.targetId}</TableCell>
                  <TableCell>
                    <StatusBadge
                      label={SIG_STATUS_MAP[item.status]?.label || item.status}
                      color={SIG_STATUS_MAP[item.status]?.color || 'default'}
                    />
                  </TableCell>
                  <TableCell>{item.signedAt}</TableCell>
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
