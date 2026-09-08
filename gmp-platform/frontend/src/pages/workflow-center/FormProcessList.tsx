import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AccountTreeOutlined,
  Add,
  AssessmentOutlined,
  Close,
  Delete,
  Edit,
  ExpandMore,
  Search,
} from "@mui/icons-material";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  CircularProgress,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  IconButton,
  InputAdornment,
  Pagination,
  Paper,
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
  Tooltip,
  Typography,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import AppDialog from "@/components/AppDialog";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useSnackbar } from "@/components/SnackbarProvider";
import {
  createFormProcess,
  deleteFormProcess,
  getFormProcess,
  getFormProcessUsage,
  getFormProcessVersions,
  listFormProcesses,
  updateFormProcess,
  type FormProcessId,
  type FormProcessUsageItem,
} from "@/api/form-processes";
import type { PageResult } from "@/types/common";
import { getAuditLogs, type AuditLogItem } from "@/api/audit";
import StatusBadge from "@/components/StatusBadge";
import TableStateCell from '@/components/TableStateCell';

type Process = {
  id: FormProcessId;
  name: string;
  code?: string | null;
  description?: string | null;
  updatedAt?: string | null;
  currentVersionNumber?: number | null;
  draftVersionNumber?: number | null;
};
const ACTION_COLUMN_WIDTH = 160;
const cellSx = { height: 40, py: 0.5, borderBottom: "1px solid #ebeef5" };
const tableRowSx = {
  "& > .MuiTableCell-root": {
    height: 40,
    py: 0.5,
    borderBottom: "1px solid #ebeef5",
  },
};
const headSx = {
  bgcolor: "#f5f7fa",
  color: "#606266",
  fontWeight: 600,
  height: 48,
  py: 0,
  borderBottom: "1px solid #e4e7ed",
  whiteSpace: "nowrap",
};
const operationColumnSx = (layer: "head" | "body") => ({
  position: "sticky" as const,
  right: 0,
  zIndex: layer === "head" ? 10 : 5,
  width: ACTION_COLUMN_WIDTH,
  minWidth: ACTION_COLUMN_WIDTH,
  maxWidth: ACTION_COLUMN_WIDTH,
  bgcolor: layer === "head" ? "#f5f7fa" : "#fff",
  backgroundClip: "padding-box",
  boxShadow: "-6px 0 8px -8px rgba(0, 0, 0, 0.35)",
  whiteSpace: "nowrap",
});
const drawerRootSx = {
  top: 0,
  bottom: 0,
  zIndex: (theme: { zIndex: { drawer: number } }) => theme.zIndex.drawer + 2,
  "& .MuiBackdrop-root": { top: 0 },
};
const drawerPaperSx = {
  ...drawerRootSx,
  width: { xs: "100vw", sm: 560 },
  height: "100vh",
  top: 0,
  bottom: 0,
  transform: "none !important",
};

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value.replace("T", " ").slice(0, 16)
    : date.toLocaleString("zh-CN", { hour12: false }).replace(/\//g, "-");
}

const auditFieldLabels: Record<string, string> = {
  name: "名称",
  code: "编码",
  description: "说明",
  status: "状态",
  versionNumber: "流程版本",
  nodes: "流程节点",
  edges: "流程连线",
  publishedAt: "发布时间",
  createdAt: "创建时间",
  updatedAt: "更新时间",
};
function parseAuditContent(content: unknown): Record<string, unknown> {
  if (content && typeof content === "object" && !Array.isArray(content))
    return content as Record<string, unknown>;
  if (typeof content !== "string") return {};
  try {
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
function formatAuditValue(value: unknown, field?: string): string {
  if (value === null || value === undefined || value === "") return "-";
  if (value === "DRAFT") return "草稿";
  if (value === "PUBLISHED") return "已发布";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (field === "nodes" || field === "edges") {
    try {
      const parsed = typeof value === "string" ? JSON.parse(value) : value;
      return Array.isArray(parsed)
        ? `${parsed.length} ${field === "nodes" ? "个节点" : "条连线"}`
        : "已配置";
    } catch {
      return "已配置";
    }
  }
  if (Array.isArray(value))
    return value.length
      ? value.map((item) => formatAuditValue(item)).join("、")
      : "-";
  if (typeof value === "object")
    return Object.entries(value as Record<string, unknown>)
      .map(
        ([key, item]) =>
          `${auditFieldLabels[key] ?? key}：${formatAuditValue(item, key)}`,
      )
      .join("；");
  return String(value);
}
function AuditBlock({ title, content }: { title: string; content: unknown }) {
  const fields = Object.entries(parseAuditContent(content)).filter(
    ([key]) =>
      !["id", "definitionId", "businessType", "type", "priority"].includes(key),
  );
  return (
    <Box
      sx={{
        border: "1px solid #e4e7ed",
        borderRadius: 1,
        bgcolor: "#f8fafc",
        p: 1.25,
      }}
    >
      <Typography
        variant="caption"
        sx={{ display: "block", mb: 0.75, color: "#606266", fontWeight: 600 }}
      >
        {title}
      </Typography>
      {fields.length === 0 ? (
        <Typography variant="caption" sx={{ color: "#909399" }}>
          无
        </Typography>
      ) : (
        <Stack spacing={0.75}>
          {fields.map(([key, value]) => (
            <Box
              key={key}
              sx={{
                display: "grid",
                gridTemplateColumns: "84px minmax(0, 1fr)",
                gap: 1,
              }}
            >
              <Typography variant="caption" sx={{ color: "#606266" }}>
                {auditFieldLabels[key] ?? key}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: "#303133",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {formatAuditValue(value, key)}
              </Typography>
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  );
}
function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Box
      sx={{
        border: "1px solid #e4e7ed",
        borderRadius: 1,
        bgcolor: "#fff",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          px: 1.5,
          py: 1,
          bgcolor: "#f8fafc",
          borderBottom: "1px solid #e4e7ed",
        }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
      </Box>
      <Box sx={{ p: 1.5 }}>{children}</Box>
    </Box>
  );
}
function DetailField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography
        variant="caption"
        sx={{ display: "block", mb: 0.35, color: "#909399" }}
      >
        {label}
      </Typography>
      <Typography
        component="div"
        variant="body2"
        sx={{
          color: "#303133",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {children || "-"}
      </Typography>
    </Box>
  );
}

function workVersionStatusLabel(
  status?: string | null,
  isCurrent?: boolean | null,
) {
  if (status === "DRAFT") return "草稿";
  if (status === "PUBLISHED" && isCurrent) return "当前发布";
  if (status === "PUBLISHED") return "历史发布";
  return status || "-";
}

function FormProcessUsagePanel({
  items,
  isLoading,
  isError,
}: {
  items: FormProcessUsageItem[];
  isLoading: boolean;
  isError: boolean;
}) {
  const groups = useMemo(() => {
    const result = new Map<
      string,
      { label: string; current: boolean; rows: FormProcessUsageItem[] }
    >();
    items.forEach((item) => {
      const key = String(item.formProcessVersionId);
      const label = item.formProcessVersionNumber
        ? `表单流程 V${item.formProcessVersionNumber}`
        : "未知版本";
      const group = result.get(key) ?? {
        label,
        current: Boolean(item.formProcessVersionIsCurrent),
        rows: [],
      };
      group.rows.push(item);
      result.set(key, group);
    });
    return Array.from(result.values()).sort(
      (left, right) => Number(right.current) - Number(left.current),
    );
  }, [items]);

  if (isLoading)
    return (
      <Box sx={{ py: 8, display: "grid", placeItems: "center" }}>
        <CircularProgress size={24} />
      </Box>
    );
  if (isError)
    return (
      <Box sx={{ py: 8, textAlign: "center", color: "#c62828" }}>
        使用情况加载失败
      </Box>
    );
  if (items.length === 0)
    return (
      <Box sx={{ py: 8, textAlign: "center", color: "#909399" }}>
        暂无作业引用该表单流程
      </Box>
    );

  return (
    <Stack spacing={1.5}>
      {groups.map((group) => (
        <DetailSection key={group.label} title={group.label}>
          <Stack spacing={1}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
              <StatusBadge
                label={group.current ? "当前发布" : "历史发布"}
                color={group.current ? "success" : "default"}
                showDot={false}
              />
              <Typography variant="caption" color="text.secondary">
                被 {group.rows.length} 个表单填报节点引用
              </Typography>
            </Box>
            {group.rows.map((item) => (
              <Box
                key={String(item.referenceId)}
                sx={{
                  border: "1px solid #e4e7ed",
                  borderRadius: 1,
                  p: 1.25,
                  bgcolor: "#fff",
                }}
              >
                <Stack
                  direction="row"
                  spacing={0.75}
                  alignItems="center"
                  sx={{ mb: 0.75 }}
                >
                  <Typography
                    variant="body2"
                    sx={{ flex: 1, minWidth: 0, fontWeight: 600 }}
                    noWrap
                  >
                    {item.workDefinitionName || "未知作业"}
                  </Typography>
                  <StatusBadge
                    label={workVersionStatusLabel(
                      item.workVersionStatus,
                      item.workVersionIsCurrent,
                    )}
                    color={
                      item.workVersionStatus === "DRAFT"
                        ? "warning"
                        : item.workVersionIsCurrent
                          ? "success"
                          : "default"
                    }
                    showDot={false}
                  />
                </Stack>
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                    gap: 1,
                  }}
                >
                  <DetailField label="作业流程版本">
                    {item.workVersionNumber
                      ? `流程 V${item.workVersionNumber}`
                      : "-"}
                  </DetailField>
                  <DetailField label="填报节点">
                    {item.workNodeLabel || item.workNodeId || "-"}
                  </DetailField>
                  <DetailField label="绑定表单">
                    {item.formTemplateName || item.formTemplateVersionId || "-"}
                  </DetailField>
                  <DetailField label="更新时间">
                    {formatDateTime(item.updatedAt)}
                  </DetailField>
                </Box>
              </Box>
            ))}
          </Stack>
        </DetailSection>
      ))}
    </Stack>
  );
}

function FormProcessAuditPanel({
  events,
  isLoading,
  isError,
}: {
  events: AuditLogItem[];
  isLoading: boolean;
  isError: boolean;
}) {
  if (isLoading)
    return (
      <Box sx={{ py: 8, display: "grid", placeItems: "center" }}>
        <CircularProgress size={24} />
      </Box>
    );
  if (isError)
    return (
      <Box sx={{ py: 8, textAlign: "center", color: "#c62828" }}>
        审计记录加载失败
      </Box>
    );
  if (events.length === 0)
    return (
      <Box sx={{ py: 8, textAlign: "center", color: "#909399" }}>
        暂无审计记录
      </Box>
    );
  return (
    <Stack spacing={1}>
      {events.map((event) => (
        <Accordion
          key={`${event.entityType}-${event.id}`}
          disableGutters
          elevation={0}
          sx={{
            border: "1px solid #e4e7ed",
            borderRadius: "4px !important",
            overflow: "hidden",
            "&::before": { display: "none" },
          }}
        >
          <AccordionSummary
            expandIcon={<ExpandMore fontSize="small" />}
            sx={{
              minHeight: 44,
              px: 1.5,
              "& .MuiAccordionSummary-content": { my: 0 },
            }}
          >
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1.25fr",
                columnGap: 1,
                width: "100%",
                minWidth: 0,
              }}
            >
              <Typography variant="body2" noWrap>
                {event.entityType === "PRODUCTION_FORM_PROCESS_VERSION"
                  ? "流程版本"
                  : "表单流程"}
              </Typography>
              <Typography variant="body2" noWrap>
                {event.actionLabel || event.action || "-"}
              </Typography>
              <Typography variant="body2" noWrap sx={{ color: "#606266" }}>
                {formatDateTime(event.operationTime || event.createdAt)}
              </Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0, pb: 1.5 }}>
            <Typography
              variant="caption"
              sx={{ display: "block", mb: 1, color: "#909399" }}
            >
              {event.functionName || "表单流程"}
            </Typography>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                gap: 1.5,
              }}
            >
              <AuditBlock title="变更前" content={event.contentBefore} />
              <AuditBlock title="变更后" content={event.contentAfter} />
            </Box>
          </AccordionDetails>
        </Accordion>
      ))}
    </Stack>
  );
}

function FormProcessUsageDialog({
  target,
  onClose,
}: {
  target: Process | null;
  onClose: () => void;
}) {
  const usage = useQuery({
    queryKey: ["form-process-usage", target?.id],
    enabled: Boolean(target),
    queryFn: async () =>
      (await getFormProcessUsage(target!.id)).data
        .data as FormProcessUsageItem[],
  });

  return (
    <AppDialog open={Boolean(target)} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{target?.name || "表单流程"} · 使用情况</DialogTitle>
      <DialogContent
        dividers
        sx={{ bgcolor: "#f7f9fc", minHeight: 280, px: { xs: 2, sm: 3 }, py: 2 }}
      >
        <FormProcessUsagePanel
          items={usage.data ?? []}
          isLoading={usage.isPending}
          isError={usage.isError}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose}>关闭</Button>
      </DialogActions>
    </AppDialog>
  );
}

function FormProcessDetailDrawer({
  target,
  onClose,
}: {
  target: Process | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useState(0);
  const definition = useQuery({
    queryKey: ["form-process", target?.id, "detail"],
    enabled: Boolean(target),
    queryFn: async () =>
      (await getFormProcess(target!.id)).data.data as Process,
  });
  const versions = useQuery({
    queryKey: ["form-process-versions", target?.id, "detail"],
    enabled: Boolean(target),
    queryFn: async () =>
      (await getFormProcessVersions(target!.id)).data.data as Array<{
        id: FormProcessId;
        versionNumber: number;
        status: string;
        isCurrent?: boolean;
        publishedAt?: string | null;
      }>,
  });
  const audit = useQuery({
    queryKey: [
      "form-process-audit",
      target?.id,
      (versions.data ?? []).map((item) => item.id).join(","),
    ],
    enabled: Boolean(target),
    queryFn: async () => {
      const ids = [target!.id, ...(versions.data ?? []).map((item) => item.id)];
      const responses = await Promise.all(
        ids.map((entityId, index) =>
          getAuditLogs({
            page: 1,
            size: 100,
            sort: "createdAt",
            order: "desc",
            entityType:
              index === 0
                ? "PRODUCTION_FORM_PROCESS"
                : "PRODUCTION_FORM_PROCESS_VERSION",
            entityId,
          }),
        ),
      );
      return responses.flatMap(
        (response) =>
          (response.data.data as PageResult<AuditLogItem>).content ?? [],
      );
    },
  });
  useEffect(() => setTab(0), [target?.id]);
  const events = useMemo(
    () =>
      Array.from(
        new Map(
          (audit.data ?? []).map((event) => [String(event.id), event]),
        ).values(),
      ).sort(
        (left, right) =>
          new Date(right.operationTime || right.createdAt || 0).getTime() -
          new Date(left.operationTime || left.createdAt || 0).getTime(),
      ),
    [audit.data],
  );
  const currentVersion = (versions.data ?? []).find(
    (item) => item.isCurrent && item.status === "PUBLISHED",
  );
  return (
    <Drawer
      anchor="right"
      open={Boolean(target)}
      onClose={onClose}
      sx={drawerRootSx}
      slotProps={{ backdrop: { sx: drawerRootSx } }}
      PaperProps={{ sx: drawerPaperSx }}
    >
      <Box
        sx={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          bgcolor: "#f7f9fc",
        }}
      >
        <Box
          sx={{
            minHeight: 56,
            px: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            bgcolor: "#fff",
            borderBottom: "1px solid #e4e7ed",
          }}
        >
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {target?.name || "表单流程详情"}
          </Typography>
          <Tooltip title="关闭" arrow>
            <IconButton size="small" aria-label="关闭详情" onClick={onClose}>
              <Close fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
        <Tabs
          value={tab}
          onChange={(_, value) => setTab(value)}
          sx={{ px: 2, bgcolor: "#fff", borderBottom: "1px solid #e4e7ed" }}
        >
          <Tab label="数据信息" />
          <Tab label="数据审计" />
        </Tabs>
        <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", p: 2 }}>
          {tab === 0 ? (
            <Stack spacing={1.5}>
              <DetailSection title="基本信息">
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                    gap: 1.75,
                  }}
                >
                  <DetailField label="流程名称">
                    {definition.data?.name ?? target?.name}
                  </DetailField>
                  <DetailField label="编码">
                    {definition.data?.code ?? target?.code ?? "-"}
                  </DetailField>
                  <DetailField label="当前已发布版本">
                    {currentVersion
                      ? `流程 V${currentVersion.versionNumber}`
                      : "暂未发布"}
                  </DetailField>
                  <DetailField label="版本数量">
                    {versions.data?.length ?? 0}
                  </DetailField>
                  <DetailField label="说明">
                    {definition.data?.description ?? target?.description ?? "-"}
                  </DetailField>
                </Box>
              </DetailSection>
              <DetailSection title="系统信息">
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                    gap: 1.75,
                  }}
                >
                  <DetailField label="创建时间">
                    {formatDateTime(
                      (definition.data as Process & { createdAt?: string })
                        ?.createdAt,
                    )}
                  </DetailField>
                  <DetailField label="更新时间">
                    {formatDateTime(
                      definition.data?.updatedAt ?? target?.updatedAt,
                    )}
                  </DetailField>
                  <DetailField label="发布时间">
                    {formatDateTime(currentVersion?.publishedAt)}
                  </DetailField>
                </Box>
              </DetailSection>
            </Stack>
          ) : (
            <FormProcessAuditPanel
              events={events}
              isLoading={audit.isLoading}
              isError={audit.isError}
            />
          )}
        </Box>
      </Box>
    </Drawer>
  );
}

export default function FormProcessList() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const { showMessage } = useSnackbar();
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [editing, setEditing] = useState<Process | null | undefined>(undefined);
  const [deleteId, setDeleteId] = useState<FormProcessId | null>(null);
  const [detailTarget, setDetailTarget] = useState<Process | null>(null);
  const [usageTarget, setUsageTarget] = useState<Process | null>(null);
  const [form, setForm] = useState({ name: "", code: "", description: "" });
  const query = useQuery({
    queryKey: ["form-processes", page, submitted],
    queryFn: async () =>
      (await listFormProcesses({ page, size: 20, keyword: submitted })).data
        .data as PageResult<Process>,
  });
  const save = useMutation({
    mutationFn: () =>
      editing ? updateFormProcess(editing.id, form) : createFormProcess(form),
    onSuccess: (response) => {
      client.invalidateQueries({ queryKey: ["form-processes"] });
      setEditing(undefined);
      setForm({ name: "", code: "", description: "" });
      if (editing) showMessage("表单流程信息已更新");
      else {
        showMessage("表单流程已创建");
        navigate(`/workflow/form-processes/${response.data.data.id}`);
      }
    },
    onError: (e) =>
      showMessage(e instanceof Error ? e.message : "保存失败", "error"),
  });
  const remove = useMutation({
    mutationFn: (id: FormProcessId) => deleteFormProcess(id),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["form-processes"] });
      setDeleteId(null);
      showMessage("表单流程已删除");
    },
    onError: (e) =>
      showMessage(e instanceof Error ? e.message : "删除失败", "error"),
  });
  const rows = query.data?.content ?? [];
  const submitSearch = () => {
    setPage(1);
    setSubmitted(keyword.trim());
  };
  const openCreate = () => {
    setForm({ name: "", code: "", description: "" });
    setEditing(null);
  };
  const openEdit = (row: Process) => {
    setForm({
      name: row.name,
      code: row.code ?? "",
      description: row.description ?? "",
    });
    setEditing(row);
  };
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 1.5,
        minHeight: "100%",
      }}
    >
      <Paper variant="outlined" sx={{ p: 2, borderColor: "#e4e7ed" }}>
        <Box
          component="form"
          onSubmit={(e) => {
            e.preventDefault();
            submitSearch();
          }}
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "minmax(240px, 360px) auto" },
            gap: 1.5,
            alignItems: "center",
          }}
        >
          <TextField
            size="small"
            label="流程名称/编码"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button
              variant="outlined"
              onClick={() => {
                setKeyword("");
                setSubmitted("");
                setPage(1);
              }}
              sx={{ minWidth: 80 }}
            >
              重置
            </Button>
            <Button type="submit" variant="contained" sx={{ minWidth: 80 }}>
              查询
            </Button>
          </Box>
        </Box>
      </Paper>
      <Paper
        variant="outlined"
        sx={{
          flex: 1,
          minHeight: 0,
          borderColor: "#e4e7ed",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            height: 48,
            px: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            borderBottom: "1px solid #e4e7ed",
          }}
        >
          <Button variant="contained" startIcon={<Add />} onClick={openCreate}>
            新建表单流程
          </Button>
        </Box>
        <TableContainer sx={{ flex: 1, overflow: "auto" }}>
          <Table
            stickyHeader
            size="small"
            sx={{ minWidth: 820, tableLayout: "fixed" }}
          >
            <TableHead>
              <TableRow sx={{ "& .MuiTableCell-root": headSx }}>
                <TableCell sx={{ ...headSx, width: 240 }}>流程名称</TableCell>
                <TableCell sx={{ ...headSx, width: 160 }}>编码</TableCell>
                <TableCell sx={{ ...headSx, width: 180 }}>版本状态</TableCell>
                <TableCell sx={{ ...headSx }}>说明</TableCell>
                <TableCell sx={{ ...headSx, width: 170 }}>更新时间</TableCell>
                <TableCell
                  sx={{ ...headSx, ...operationColumnSx("head") }}
                  align="center"
                >
                  操作
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {query.isPending ? (
                <TableRow>
                  <TableStateCell
                    colSpan={6}
                    align="center"
                    sx={{ ...cellSx, py: 5, color: "#909399" }}
                  >
                    正在加载...
                  </TableStateCell>
                </TableRow>
              ) : query.isError ? (
                <TableRow>
                  <TableStateCell
                    colSpan={6}
                    align="center"
                    sx={{ ...cellSx, py: 5, color: "#c62828" }}
                  >
                    加载失败，请重试
                  </TableStateCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableStateCell
                    colSpan={6}
                    align="center"
                    sx={{ ...cellSx, py: 5, color: "#909399" }}
                  >
                    暂无数据
                  </TableStateCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow
                    key={String(row.id)}
                    hover
                    tabIndex={0}
                    onClick={() => setDetailTarget(row)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setDetailTarget(row);
                      }
                    }}
                    sx={{
                      ...tableRowSx,
                      cursor: "pointer",
                      "&:focus-visible": {
                        outline: "2px solid #1677c8",
                        outlineOffset: -2,
                      },
                    }}
                  >
                    <TableCell sx={cellSx}>
                      <Typography noWrap sx={{ color: "#303133" }}>
                        {row.name}
                      </Typography>
                    </TableCell>
                    <TableCell
                      sx={{
                        ...cellSx,
                        fontFamily: "monospace",
                        color: "#606266",
                      }}
                    >
                      {row.code || "-"}
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <Stack
                        direction="row"
                        spacing={0.75}
                        alignItems="center"
                        sx={{ minWidth: 0, whiteSpace: "nowrap" }}
                      >
                        {row.currentVersionNumber ? (
                          <StatusBadge
                            label={`当前 V${row.currentVersionNumber}`}
                            color="success"
                            showDot={false}
                          />
                        ) : row.draftVersionNumber ? (
                          <StatusBadge
                            label={`草稿 V${row.draftVersionNumber}`}
                            color="warning"
                            showDot={false}
                          />
                        ) : (
                          <StatusBadge
                            label="未发布"
                            color="default"
                            showDot={false}
                          />
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <Typography noWrap sx={{ color: "#606266" }}>
                        {row.description || "-"}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ ...cellSx, color: "#606266" }}>
                      {formatDateTime(row.updatedAt)}
                    </TableCell>
                    <TableCell
                      sx={{ ...cellSx, ...operationColumnSx("body") }}
                      align="center"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Tooltip title="使用情况" arrow>
                        <IconButton
                          size="small"
                          aria-label="使用情况"
                          onClick={() => setUsageTarget(row)}
                        >
                          <AssessmentOutlined fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="配置流程" arrow>
                        <IconButton
                          size="small"
                          aria-label="配置流程"
                          onClick={() =>
                            navigate(`/workflow/form-processes/${row.id}`)
                          }
                        >
                          <AccountTreeOutlined fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="编辑" arrow>
                        <IconButton
                          size="small"
                          aria-label="编辑"
                          onClick={() => openEdit(row)}
                        >
                          <Edit fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="删除" arrow>
                        <IconButton
                          size="small"
                          aria-label="删除"
                          color="error"
                          onClick={() => setDeleteId(row.id)}
                        >
                          <Delete fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <Box
          sx={{
            height: 56,
            px: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid #e4e7ed",
          }}
        >
          <Typography variant="body2" color="text.secondary">
            共 {query.data?.totalElements ?? 0} 条数据
          </Typography>
          {query.data && query.data.totalPages > 1 ? (
            <Pagination
              size="small"
              count={query.data.totalPages}
              page={page}
              onChange={(_, value) => setPage(value)}
            />
          ) : null}
        </Box>
      </Paper>
      <AppDialog
        open={editing !== undefined}
        onClose={() => setEditing(undefined)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{editing ? "编辑表单流程" : "新建表单流程"}</DialogTitle>
        <DialogContent dividers sx={{ px: { xs: 2, sm: 3 }, py: 2 }}>
          <DetailSection title="基本信息">
            <Stack spacing={1.5}>
              <TextField
                autoFocus
                required
                size="small"
                label="流程名称"
                fullWidth
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <TextField
                size="small"
                label="流程编码"
                fullWidth
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
              <TextField
                size="small"
                label="说明"
                fullWidth
                multiline
                minRows={3}
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </Stack>
          </DetailSection>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 1.5 }}>
          <Button onClick={() => setEditing(undefined)}>取消</Button>
          <Button
            variant="contained"
            disabled={!form.name.trim() || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending
              ? editing
                ? "保存中..."
                : "创建中..."
              : editing
                ? "保存"
                : "创建"}
          </Button>
        </DialogActions>
      </AppDialog>
      <ConfirmDialog
        open={deleteId !== null}
        title="删除表单流程"
        message="删除后，该流程的所有版本配置将一并删除，确认继续吗？"
        confirmText="删除"
        destructive
        loading={remove.isPending}
        onCancel={() => setDeleteId(null)}
        onConfirm={() => deleteId !== null && remove.mutate(deleteId)}
      />
      <FormProcessDetailDrawer
        target={detailTarget}
        onClose={() => setDetailTarget(null)}
      />
      <FormProcessUsageDialog
        target={usageTarget}
        onClose={() => setUsageTarget(null)}
      />
    </Box>
  );
}
