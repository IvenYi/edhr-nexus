import TableStateCell from '@/components/TableStateCell';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Box,
  CircularProgress,
  MenuItem,
  Pagination,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { getLoginLogs, type LoginLogItem } from '@/api/loginLogs';
import StatusBadge from '@/components/StatusBadge';

const LOGIN_LOG_EVENT_TYPE_OPTIONS = [
  { label: '登录', value: 'LOGIN' },
  { label: '登出', value: 'LOGOUT' },
];

const PAGE_SIZE = 20;

function formatDateTime(value?: string) {
  if (!value) return '-';
  return value.replace('T', ' ').slice(0, 19);
}

function getEventTone(eventType: string): 'success' | 'info' | 'default' {
  if (eventType === 'LOGIN') return 'success';
  if (eventType === 'LOGOUT') return 'info';
  return 'default';
}

function readDisplayValue(value?: string | number | null) {
  return value === undefined || value === null || value === '' ? '-' : String(value);
}

export default function LoginLogPage() {
  const [page, setPage] = useState(1);
  const [eventType, setEventType] = useState('');
  const [keyword, setKeyword] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['login-logs', page, eventType, keyword, startTime, endTime],
    queryFn: () => getLoginLogs({
      page,
      size: PAGE_SIZE,
      eventType: eventType || undefined,
      keyword: keyword || undefined,
      startTime: startTime || undefined,
      endTime: endTime || undefined,
    }),
  });

  const content = data?.content ?? [];
  const isEmptyState = isLoading || isError || content.length === 0;

  return (
    <Box sx={{ height: '100%', minHeight: 'calc(100vh - 142px)', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between" gap={2}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>登录日志</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5} flexWrap="wrap">
          <TextField
            select
            size="small"
            label="事件类型"
            value={eventType}
            onChange={(event) => { setEventType(event.target.value); setPage(1); }}
            sx={{ minWidth: 140 }}
          >
            <MenuItem value="">全部</MenuItem>
            {LOGIN_LOG_EVENT_TYPE_OPTIONS.map((option) => (
              <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            label="操作人/账号"
            value={keyword}
            onChange={(event) => { setKeyword(event.target.value); setPage(1); }}
            sx={{ minWidth: 180 }}
          />
          <TextField
            size="small"
            label="开始时间"
            type="datetime-local"
            value={startTime}
            onChange={(event) => { setStartTime(event.target.value); setPage(1); }}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 190 }}
          />
          <TextField
            size="small"
            label="结束时间"
            type="datetime-local"
            value={endTime}
            onChange={(event) => { setEndTime(event.target.value); setPage(1); }}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 190 }}
          />
        </Stack>
      </Stack>

      <TableContainer sx={{ flex: 1, border: '1px solid #e4e7ed', borderRadius: 1, bgcolor: '#fff' }}>
        <Table stickyHeader size="small" sx={{ minWidth: 1120, height: isEmptyState ? '100%' : 'auto' }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 170 }}>时间</TableCell>
              <TableCell sx={{ width: 100 }}>事件类型</TableCell>
              <TableCell sx={{ width: 140 }}>操作人</TableCell>
              <TableCell sx={{ width: 150 }}>账号</TableCell>
              <TableCell sx={{ width: 140 }}>登录/登出方式</TableCell>
              <TableCell sx={{ width: 110 }}>平台</TableCell>
              <TableCell sx={{ width: 130 }}>客户端类型</TableCell>
              <TableCell sx={{ width: 120 }}>浏览器</TableCell>
              <TableCell sx={{ width: 150 }}>IP</TableCell>
            </TableRow>
          </TableHead>
          <TableBody sx={{ height: isEmptyState ? '100%' : 'auto' }}>
            {isLoading ? (
              <TableRow><TableStateCell colSpan={9} align="center"><CircularProgress size={24} /></TableStateCell></TableRow>
            ) : isError ? (
              <TableRow><TableStateCell colSpan={9} align="center">加载失败</TableStateCell></TableRow>
            ) : content.length === 0 ? (
              <TableRow><TableStateCell colSpan={9} align="center">暂无登录日志</TableStateCell></TableRow>
            ) : (
              content.map((item: LoginLogItem) => (
                <TableRow key={item.id} hover>
                  <TableCell>{formatDateTime(item.occurredAt)}</TableCell>
                  <TableCell>
                    <StatusBadge label={item.eventTypeLabel || item.actionLabel || item.eventType} color={getEventTone(item.eventType)} />
                  </TableCell>
                  <TableCell>{readDisplayValue(item.operatorName)}</TableCell>
                  <TableCell>{readDisplayValue(item.username)}</TableCell>
                  <TableCell>{item.authMethodLabel || item.authMethod}</TableCell>
                  <TableCell>{item.platformLabel || item.platform}</TableCell>
                  <TableCell>{item.clientTypeLabel || item.clientType}</TableCell>
                  <TableCell>{readDisplayValue(item.browser)}</TableCell>
                  <TableCell>{readDisplayValue(item.ipAddress)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {data && data.totalPages > 1 && (
        <Stack alignItems="center">
          <Pagination count={data.totalPages} page={page} onChange={(_, nextPage) => setPage(nextPage)} />
        </Stack>
      )}
    </Box>
  );
}
