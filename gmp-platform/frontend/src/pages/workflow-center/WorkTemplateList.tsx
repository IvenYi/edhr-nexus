import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AccountTreeOutlined,
  Add,
  Close,
  Delete,
  Edit,
  ExpandMore as AccordionExpandMore,
  RestartAlt,
  Search,
  TuneRounded,
  ViewColumnRounded,
} from "@mui/icons-material";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Pagination,
  Popover,
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
import StatusBadge from "@/components/StatusBadge";
import { useSnackbar } from "@/components/SnackbarProvider";
import { getAuditLogs, type AuditLogItem } from "@/api/audit";
import {
  createWorkTemplate,
  deleteWorkTemplate,
  getWorkApplicabilityRules,
  getWorkTemplate,
  getWorkTemplateVersions,
  listWorkApplicabilityRules,
  listWorkTemplates,
  updateWorkTemplate,
  type WorkflowId,
} from "@/api/workflow-work";
import {
  getProcessOperations,
  getProcessProductFamilies,
  getProducts,
  type OperationRecord,
  type ProductFamilyRecord,
  type ProductRecord,
} from "@/api/master-data";
import type { PageResult } from "@/types/common";
import WorkApplicabilityRulesTab from "./WorkApplicabilityRulesTab";

interface WorkTemplate {
  id: WorkflowId;
  name: string;
  code?: string | null;
  status?: string;
  description?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  currentFlowVersionNumber?: number | null;
}

interface WorkFlowVersion {
  id: WorkflowId;
  versionNumber: number;
  status: string;
  isCurrent: boolean;
  publishedAt?: string | null;
  createdAt?: string | null;
}

type RuleType = "GLOBAL" | "SCOPED" | "EXCEPTION";
interface WorkApplicabilityRule {
  id: WorkflowId;
  definitionId: WorkflowId;
  definitionName: string;
  definitionCode?: string | null;
  ruleType: RuleType;
  productFamilyId?: WorkflowId | null;
  productId?: WorkflowId | null;
  operationId?: WorkflowId | null;
  isActive: boolean;
  updatedAt?: string | null;
}

type WorkTemplateColumnId =
  | "name"
  | "code"
  | "publishedFlow"
  | "applicabilityRules"
  | "description"
  | "updatedAt"
  | "actions";
interface WorkTemplateColumn {
  id: WorkTemplateColumnId;
  label: string;
  width: number;
  configurable?: boolean;
}

const PAGE_SIZE = 20;
const COLUMN_STORAGE_KEY = "work-template-list-columns:v2";
const ACTION_COLUMN_WIDTH = 128;
const WORK_TEMPLATE_COLUMNS: WorkTemplateColumn[] = [
  { id: "name", label: "作业名称", width: 260, configurable: true },
  { id: "code", label: "编码", width: 180, configurable: true },
  {
    id: "publishedFlow",
    label: "当前已发布流程",
    width: 190,
    configurable: true,
  },
  {
    id: "applicabilityRules",
    label: "适用规则",
    width: 120,
    configurable: true,
  },
  { id: "description", label: "备注", width: 260, configurable: true },
  { id: "updatedAt", label: "更新时间", width: 172, configurable: true },
  { id: "actions", label: "操作", width: ACTION_COLUMN_WIDTH },
];
const tableHeaderCellSx = {
  bgcolor: "#f5f7fa",
  color: "#606266",
  fontWeight: 600,
  whiteSpace: "nowrap",
  height: 48,
  py: 0,
  borderBottom: "1px solid #e4e7ed",
};
const tableRowSx = {
  "& > .MuiTableCell-root": {
    height: 40,
    py: 0.5,
    borderBottom: "1px solid #ebeef5",
  },
};
const toolbarIconSx = {
  width: 36,
  height: 36,
  border: "1px solid #e4e7ed",
  borderRadius: 1,
  color: "#606266",
  bgcolor: "#fff",
  "&:hover": { color: "#1890ff", bgcolor: "#e8f4ff" },
};
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
const ruleTypeLabel: Record<RuleType, string> = {
  EXCEPTION: "例外排除",
  SCOPED: "指定范围",
  GLOBAL: "全局适用",
};

function getWorkApiErrorMessage(error: unknown, fallback: string) {
  const response = (
    error as {
      response?: { data?: { message?: string; error?: { message?: string } } };
    }
  )?.response?.data;
  return response?.message || response?.error?.message || fallback;
}
const auditFieldLabels: Record<string, string> = {
  name: "名称",
  code: "编码",
  description: "备注",
  status: "状态",
  versionNumber: "流程版本",
  nodes: "流程节点",
  edges: "流程连线",
  publishedAt: "发布时间",
  ruleType: "适用方式",
  productFamilyId: "产品簇",
  productId: "产品",
  operationId: "工序",
  isActive: "启用状态",
  createdAt: "创建时间",
  updatedAt: "更新时间",
};

function operationColumnSx(layer: "head" | "body") {
  return {
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
  };
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value.replace("T", " ").slice(0, 16)
    : date.toLocaleString("zh-CN", { hour12: false }).replace(/\//g, "-");
}

function displayMasterDataName(
  item: { name?: string | null; code?: string | null } | undefined,
  id?: WorkflowId | null,
) {
  return item?.name || item?.code || (id ? `ID ${id}` : "未配置");
}

function parseAuditContent(content: unknown): Record<string, unknown> {
  if (!content) return {};
  if (typeof content === "object" && !Array.isArray(content))
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
  if (value === "ACTIVE") return "启用";
  if (value === "GLOBAL") return "全局适用";
  if (value === "SCOPED") return "指定范围";
  if (value === "EXCEPTION") return "例外排除";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (field === "nodes" || field === "edges") {
    const label = field === "nodes" ? "个节点" : "条连线";
    try {
      const parsed = typeof value === "string" ? JSON.parse(value) : value;
      return Array.isArray(parsed) ? `${parsed.length} ${label}` : "已配置";
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

function WorkTemplateDetailDrawer({
  target,
  onClose,
}: {
  target: WorkTemplate | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useState(0);
  const definition = useQuery({
    queryKey: ["work-template", target?.id, "detail"],
    enabled: Boolean(target),
    queryFn: async () =>
      (await getWorkTemplate(target!.id)).data.data as WorkTemplate,
  });
  const versions = useQuery({
    queryKey: ["work-template-versions", target?.id, "detail"],
    enabled: Boolean(target),
    queryFn: async () =>
      (await getWorkTemplateVersions(target!.id)).data
        .data as WorkFlowVersion[],
  });
  const rules = useQuery({
    queryKey: ["work-template-rules", target?.id, "detail"],
    enabled: Boolean(target),
    queryFn: async () =>
      (await getWorkApplicabilityRules(target!.id)).data
        .data as WorkApplicabilityRule[],
  });
  const versionIds = (versions.data ?? []).map((item) => String(item.id));
  const ruleIds = (rules.data ?? []).map((item) => String(item.id));
  const audit = useQuery({
    queryKey: [
      "work-template-audit",
      target?.id,
      versionIds.join(","),
      ruleIds.join(","),
    ],
    enabled: Boolean(target),
    queryFn: async () => {
      const requests = [
        getAuditLogs({
          page: 1,
          size: 100,
          sort: "createdAt",
          order: "desc",
          entityType: "PRODUCTION_WORK_TEMPLATE",
          entityId: target!.id,
        }),
      ];
      versionIds.forEach((entityId) =>
        requests.push(
          getAuditLogs({
            page: 1,
            size: 100,
            sort: "createdAt",
            order: "desc",
            entityType: "PRODUCTION_WORK_FLOW_VERSION",
            entityId,
          }),
        ),
      );
      ruleIds.forEach((entityId) =>
        requests.push(
          getAuditLogs({
            page: 1,
            size: 100,
            sort: "createdAt",
            order: "desc",
            entityType: "PRODUCTION_WORK_APPLICABILITY_RULE",
            entityId,
          }),
        ),
      );
      const responses = await Promise.all(requests);
      return responses.flatMap(
        (response) =>
          (response.data.data as PageResult<AuditLogItem>).content ?? [],
      );
    },
  });
  useEffect(() => {
    setTab(0);
  }, [target?.id]);
  const currentVersion =
    (versions.data ?? []).find(
      (item) => item.isCurrent && item.status === "PUBLISHED",
    ) ?? null;
  const auditEvents = useMemo(
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
  const entityLabel: Record<string, string> = {
    PRODUCTION_WORK_TEMPLATE: "作业模板",
    PRODUCTION_WORK_FLOW_VERSION: "作业流程",
    PRODUCTION_WORK_APPLICABILITY_RULE: "适用规则",
  };

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
          bgcolor: "#f6f8f9",
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
            {target?.name || "作业模板详情"}
          </Typography>
          <Tooltip title="关闭" arrow>
            <IconButton size="small" aria-label="关闭" onClick={onClose}>
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
                  <DetailField label="作业名称">
                    {definition.data?.name ?? target?.name}
                  </DetailField>
                  <DetailField label="编码">
                    {definition.data?.code ?? target?.code ?? "-"}
                  </DetailField>
                  <DetailField label="当前已发布流程">
                    {currentVersion
                      ? `流程 V${currentVersion.versionNumber}`
                      : "暂未发布"}
                  </DetailField>
                  <DetailField label="适用规则数">
                    {rules.data?.length ?? 0}
                  </DetailField>
                  <DetailField label="备注">
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
                    {formatDateTime(definition.data?.createdAt)}
                  </DetailField>
                  <DetailField label="更新时间">
                    {formatDateTime(
                      definition.data?.updatedAt ?? target?.updatedAt,
                    )}
                  </DetailField>
                  <DetailField label="流程版本数">
                    {versions.data?.length ?? 0}
                  </DetailField>
                  <DetailField label="已发布流程时间">
                    {formatDateTime(currentVersion?.publishedAt)}
                  </DetailField>
                </Box>
              </DetailSection>
            </Stack>
          ) : (
            <Stack spacing={1}>
              {audit.isLoading ? (
                <Box sx={{ py: 8, display: "grid", placeItems: "center" }}>
                  <CircularProgress size={24} />
                </Box>
              ) : audit.isError ? (
                <Box sx={{ py: 8, textAlign: "center", color: "#c62828" }}>
                  审计记录加载失败
                </Box>
              ) : auditEvents.length === 0 ? (
                <Box sx={{ py: 8, textAlign: "center", color: "#909399" }}>
                  暂无审计记录
                </Box>
              ) : (
                auditEvents.map((event) => (
                  <Accordion
                    key={`${event.entityType}-${event.id}`}
                    disableGutters
                    elevation={0}
                    sx={{
                      border: "1px solid #e4e7ed",
                      borderRadius: "4px !important",
                      overflow: "hidden",
                      "&::before": { display: "none" },
                      "&.Mui-expanded": { m: 0 },
                    }}
                  >
                    <AccordionSummary
                      expandIcon={<AccordionExpandMore fontSize="small" />}
                      sx={{
                        minHeight: 44,
                        px: 1.5,
                        "&.Mui-expanded": { minHeight: 44 },
                        "& .MuiAccordionSummary-content": { my: 0 },
                        "& .MuiAccordionSummary-content.Mui-expanded": {
                          my: 0,
                        },
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
                          {entityLabel[event.entityType || ""] || "作业模板"}
                        </Typography>
                        <Typography variant="body2" noWrap>
                          {event.actionLabel || event.action || "-"}
                        </Typography>
                        <Typography
                          variant="body2"
                          noWrap
                          sx={{ color: "#606266" }}
                        >
                          {formatDateTime(
                            event.operationTime || event.createdAt,
                          )}
                        </Typography>
                      </Box>
                    </AccordionSummary>
                    <AccordionDetails sx={{ pt: 0, pb: 1.5 }}>
                      <Typography
                        variant="caption"
                        sx={{ display: "block", mb: 1, color: "#909399" }}
                      >
                        {event.functionName ||
                          entityLabel[event.entityType || ""] ||
                          "作业模板"}
                      </Typography>
                      <Box
                        sx={{
                          display: "grid",
                          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                          gap: 1.5,
                        }}
                      >
                        <AuditBlock
                          title="变更前"
                          content={event.contentBefore}
                        />
                        <AuditBlock
                          title="变更后"
                          content={event.contentAfter}
                        />
                      </Box>
                    </AccordionDetails>
                  </Accordion>
                ))
              )}
            </Stack>
          )}
        </Box>
      </Box>
    </Drawer>
  );
}

function EmptyTableRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <TableRow>
      <TableCell
        colSpan={colSpan}
        align="center"
        sx={{ py: 8, color: "#909399" }}
      >
        {text}
      </TableCell>
    </TableRow>
  );
}

export default function WorkTemplateList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showMessage } = useSnackbar();
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const [tableContainerWidth, setTableContainerWidth] = useState(0);
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState<"definitions" | "rules">(
    "definitions",
  );
  const [keyword, setKeyword] = useState("");
  const [submittedKeyword, setSubmittedKeyword] = useState("");
  const [hiddenColumns, setHiddenColumns] = useState<WorkTemplateColumnId[]>(
    () => {
      try {
        const stored = JSON.parse(
          localStorage.getItem(COLUMN_STORAGE_KEY) || "[]",
        );
        return Array.isArray(stored)
          ? stored.filter((columnId): columnId is WorkTemplateColumnId =>
              WORK_TEMPLATE_COLUMNS.some(
                (column) => column.id === columnId && column.configurable,
              ),
            )
          : [];
      } catch {
        return [];
      }
    },
  );
  const [columnAnchor, setColumnAnchor] = useState<HTMLElement | null>(null);
  const [editing, setEditing] = useState<WorkTemplate | null | undefined>(
    undefined,
  );
  const [confirmDelete, setConfirmDelete] = useState<WorkTemplate | null>(null);
  const [detailTarget, setDetailTarget] = useState<WorkTemplate | null>(null);
  const [form, setForm] = useState({ name: "", code: "", description: "" });
  const query = useQuery({
    queryKey: ["work-templates", page, submittedKeyword],
    queryFn: async () =>
      (
        await listWorkTemplates({
          page,
          size: PAGE_SIZE,
          keyword: submittedKeyword,
        })
      ).data.data as PageResult<WorkTemplate>,
  });
  const applicabilityQuery = useQuery({
    queryKey: ["work-applicability-rules"],
    queryFn: async () =>
      (await listWorkApplicabilityRules()).data.data as WorkApplicabilityRule[],
  });
  const familiesQuery = useQuery({
    queryKey: ["work-rule-product-families"],
    queryFn: async () =>
      (await getProcessProductFamilies({ page: 1, size: 500 })).data
        .data as PageResult<ProductFamilyRecord>,
  });
  const productsQuery = useQuery({
    queryKey: ["work-rule-products"],
    queryFn: async () =>
      (await getProducts({ page: 1, size: 500 })).data
        .data as PageResult<ProductRecord>,
  });
  const operationsQuery = useQuery({
    queryKey: ["work-rule-operations"],
    queryFn: async () =>
      (await getProcessOperations({ page: 1, size: 500 })).data
        .data as PageResult<OperationRecord>,
  });
  const rows = query.data?.content ?? [];
  const rulesByDefinitionId = useMemo(() => {
    const grouped = new Map<string, WorkApplicabilityRule[]>();
    (applicabilityQuery.data ?? []).forEach((rule) => {
      const key = String(rule.definitionId);
      grouped.set(key, [...(grouped.get(key) ?? []), rule]);
    });
    return grouped;
  }, [applicabilityQuery.data]);
  const visibleColumns = useMemo(
    () =>
      WORK_TEMPLATE_COLUMNS.filter(
        (column) =>
          column.id === "actions" || !hiddenColumns.includes(column.id),
      ),
    [hiddenColumns],
  );
  const tableMinWidth = useMemo(
    () => visibleColumns.reduce((total, column) => total + column.width, 0),
    [visibleColumns],
  );
  const tableWidth = Math.max(tableMinWidth, Math.floor(tableContainerWidth));

  useEffect(() => {
    localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(hiddenColumns));
  }, [hiddenColumns]);
  useEffect(() => {
    const element = tableContainerRef.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) =>
      setTableContainerWidth(entry.contentRect.width),
    );
    observer.observe(element);
    setTableContainerWidth(element.clientWidth);
    return () => observer.disconnect();
  }, [activeTab]);

  const save = useMutation({
    mutationFn: () =>
      editing ? updateWorkTemplate(editing.id, form) : createWorkTemplate(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work-templates"] });
      setEditing(undefined);
      showMessage(editing ? "作业模板已更新" : "作业模板已创建", "success");
    },
    onError: () => showMessage("保存失败，请检查必填信息和编码唯一性", "error"),
  });
  const remove = useMutation({
    mutationFn: (id: WorkflowId) => deleteWorkTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work-templates"] });
      setConfirmDelete(null);
      showMessage("作业模板已删除", "success");
    },
    onError: (error) =>
      showMessage(
        getWorkApiErrorMessage(
          error,
          "删除失败，请确认作业模板没有已发布流程或其他配置记录",
        ),
        "error",
      ),
  });
  const openCreate = () => {
    setForm({ name: "", code: "", description: "" });
    setEditing(null);
  };
  const openEdit = (row: WorkTemplate) => {
    setForm({
      name: row.name,
      code: row.code ?? "",
      description: row.description ?? "",
    });
    setEditing(row);
  };
  const submitSearch = () => {
    setPage(1);
    setSubmittedKeyword(keyword.trim());
  };
  const resetSearch = () => {
    setKeyword("");
    setPage(1);
    setSubmittedKeyword("");
  };

  const renderCell = (row: WorkTemplate, column: WorkTemplateColumn) => {
    switch (column.id) {
      case "name":
        return (
          <TableCell key={column.id}>
            <Typography
              sx={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                color: "#303133",
              }}
            >
              {row.name}
            </Typography>
          </TableCell>
        );
      case "code":
        return <TableCell key={column.id}>{row.code || "-"}</TableCell>;
      case "publishedFlow":
        return (
          <TableCell key={column.id}>
            {row.currentFlowVersionNumber ? (
              <StatusBadge
                label={`流程 V${row.currentFlowVersionNumber}`}
                color="success"
                showDot={false}
              />
            ) : (
              <Typography sx={{ color: "#909399" }}>暂未发布</Typography>
            )}
          </TableCell>
        );
      case "applicabilityRules": {
        const rules = rulesByDefinitionId.get(String(row.id)) ?? [];
        if (rules.length === 0)
          return (
            <TableCell key={column.id} sx={{ color: "#909399" }}>
              0 条
            </TableCell>
          );
        const families = familiesQuery.data?.content ?? [];
        const products = productsQuery.data?.content ?? [];
        const operations = operationsQuery.data?.content ?? [];
        const scopeLabel = (rule: WorkApplicabilityRule) =>
          rule.ruleType === "GLOBAL"
            ? "全部范围"
            : [
                rule.productFamilyId
                  ? `产品簇：${displayMasterDataName(
                      families.find(
                        (item) =>
                          String(item.id) === String(rule.productFamilyId),
                      ),
                      rule.productFamilyId,
                    )}`
                  : null,
                rule.productId
                  ? `产品：${displayMasterDataName(
                      products.find(
                        (item) => String(item.id) === String(rule.productId),
                      ),
                      rule.productId,
                    )}`
                  : null,
                rule.operationId
                  ? `工序：${displayMasterDataName(
                      operations.find(
                        (item) => String(item.id) === String(rule.operationId),
                      ),
                      rule.operationId,
                    )}`
                  : null,
              ]
                .filter(Boolean)
                .join("；") || "未配置范围";
        return (
          <TableCell key={column.id}>
            <Tooltip
              arrow
              placement="top-start"
              title={
                <Stack spacing={0.5} sx={{ maxWidth: 420 }}>
                  {rules.map((rule) => (
                    <Typography
                      key={rule.id}
                      variant="body2"
                      sx={{ color: "#fff" }}
                    >
                      {ruleTypeLabel[rule.ruleType]}：{scopeLabel(rule)}
                    </Typography>
                  ))}
                </Stack>
              }
            >
              <Typography
                component="span"
                sx={{ color: "#1677c8", cursor: "help" }}
              >
                {rules.length} 条
              </Typography>
            </Tooltip>
          </TableCell>
        );
      }
      case "description":
        return (
          <TableCell
            key={column.id}
            sx={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={row.description || "-"}
          >
            {row.description || "-"}
          </TableCell>
        );
      case "updatedAt":
        return (
          <TableCell key={column.id}>{formatDateTime(row.updatedAt)}</TableCell>
        );
      case "actions":
        return (
          <TableCell
            key={column.id}
            align="center"
            onClick={(event) => event.stopPropagation()}
            sx={operationColumnSx("body")}
          >
            <Box
              sx={{
                display: "flex",
                flexWrap: "nowrap",
                justifyContent: "center",
                alignItems: "center",
                gap: 0,
              }}
            >
              <Tooltip title="配置流程" arrow>
                <IconButton
                  size="small"
                  aria-label="配置流程"
                  onClick={() =>
                    navigate(`/production/work-templates/${row.id}`)
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
                  onClick={() => setConfirmDelete(row)}
                >
                  <Delete fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          </TableCell>
        );
      default:
        return null;
    }
  };

  return (
    <Box
      sx={{
        minWidth: 0,
        width: "100%",
        maxWidth: "100%",
        height: { xs: "auto", lg: "calc(100vh - 150px)" },
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          border: "1px solid #e4e7ed",
          borderRadius: 1,
          bgcolor: "#fff",
          overflow: "hidden",
        }}
      >
        <Tabs
          value={activeTab}
          onChange={(_, value) => setActiveTab(value)}
          sx={{
            flex: "0 0 auto",
            px: 2,
            minHeight: 48,
            borderBottom: "1px solid #ebeef5",
          }}
        >
          <Tab value="definitions" label="作业定义" />
          <Tab value="rules" label="作业适用规则" />
        </Tabs>
        {activeTab === "rules" ? (
          <WorkApplicabilityRulesTab />
        ) : (
          <>
            <Box
              sx={{
                flex: "0 0 auto",
                px: 2,
                py: 1.5,
                borderBottom: "1px solid #ebeef5",
                bgcolor: "#fff",
              }}
            >
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "1fr",
                    md: "minmax(220px, 1fr) auto",
                  },
                  gap: 1.25,
                  alignItems: "end",
                }}
              >
                <TextField
                  fullWidth
                  size="small"
                  label="作业名称/编码"
                  placeholder="请输入"
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") submitSearch();
                  }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <Search fontSize="small" />
                      </InputAdornment>
                    ),
                  }}
                />
                <Stack direction="row" spacing={1} justifyContent="flex-end">
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<RestartAlt />}
                    onClick={resetSearch}
                  >
                    重置
                  </Button>
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={<Search />}
                    onClick={submitSearch}
                  >
                    查询
                  </Button>
                </Stack>
              </Box>
            </Box>
            <Box
              sx={{
                flex: 1,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              <Box
                sx={{
                  flex: "0 0 auto",
                  px: 2,
                  py: 0.75,
                  minHeight: 48,
                  borderBottom: "1px solid #ebeef5",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Tooltip title="字段设置" arrow>
                  <IconButton
                    size="small"
                    aria-label="字段设置"
                    onClick={(event) => setColumnAnchor(event.currentTarget)}
                    sx={toolbarIconSx}
                  >
                    <Box
                      aria-hidden="true"
                      sx={{
                        position: "relative",
                        width: 22,
                        height: 22,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <ViewColumnRounded sx={{ fontSize: 21 }} />
                      <TuneRounded
                        sx={{
                          position: "absolute",
                          right: -3,
                          bottom: -2,
                          fontSize: 13,
                          p: "1px",
                          borderRadius: "50%",
                          bgcolor: "#fff",
                          boxShadow: "0 0 0 1px #fff",
                        }}
                      />
                    </Box>
                  </IconButton>
                </Tooltip>
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<Add />}
                  onClick={openCreate}
                >
                  新增作业
                </Button>
              </Box>
              <TableContainer
                ref={tableContainerRef}
                sx={{
                  flex: 1,
                  width: "100%",
                  maxWidth: "100%",
                  minWidth: 0,
                  minHeight: 0,
                  overflow: "auto",
                }}
              >
                <Table
                  stickyHeader
                  size="small"
                  sx={{
                    width: tableWidth,
                    minWidth: tableMinWidth,
                    tableLayout: "fixed",
                    height:
                      query.isLoading || query.isError || rows.length === 0
                        ? "100%"
                        : "auto",
                  }}
                >
                  <colgroup>
                    {visibleColumns.map((column) => (
                      <col key={column.id} style={{ width: column.width }} />
                    ))}
                  </colgroup>
                  <TableHead>
                    <TableRow
                      sx={{ "& .MuiTableCell-root": tableHeaderCellSx }}
                    >
                      {visibleColumns.map((column) => (
                        <TableCell
                          key={column.id}
                          align={column.id === "actions" ? "center" : undefined}
                          sx={{
                            ...tableHeaderCellSx,
                            width: column.width,
                            ...(column.id === "actions"
                              ? operationColumnSx("head")
                              : {}),
                          }}
                        >
                          {column.label}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {query.isLoading ? (
                      <EmptyTableRow
                        colSpan={visibleColumns.length}
                        text="加载中..."
                      />
                    ) : null}
                    {query.isError ? (
                      <EmptyTableRow
                        colSpan={visibleColumns.length}
                        text="作业模板数据加载失败"
                      />
                    ) : null}
                    {!query.isLoading && !query.isError && rows.length === 0 ? (
                      <EmptyTableRow
                        colSpan={visibleColumns.length}
                        text="暂无数据"
                      />
                    ) : null}
                    {!query.isLoading && !query.isError
                      ? rows.map((row) => (
                          <TableRow
                            key={row.id}
                            hover
                            onClick={() => setDetailTarget(row)}
                            sx={{ ...tableRowSx, cursor: "pointer" }}
                          >
                            {visibleColumns.map((column) =>
                              renderCell(row, column),
                            )}
                          </TableRow>
                        ))
                      : null}
                  </TableBody>
                </Table>
              </TableContainer>
              <Box
                sx={{
                  flex: "0 0 auto",
                  minHeight: 56,
                  px: 2,
                  borderTop: "1px solid #ebeef5",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 2,
                }}
              >
                <Typography variant="body2" sx={{ color: "#909399" }}>
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
            </Box>
          </>
        )}
      </Box>
      <Popover
        open={Boolean(columnAnchor)}
        anchorEl={columnAnchor}
        onClose={() => setColumnAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        PaperProps={{ sx: { width: 220, p: 1.25 } }}
      >
        <Typography variant="subtitle2" sx={{ px: 0.75, pb: 0.75 }}>
          作业模板字段
        </Typography>
        {WORK_TEMPLATE_COLUMNS.filter((column) => column.configurable).map(
          (column) => (
            <FormControlLabel
              key={column.id}
              sx={{
                display: "flex",
                mx: 0,
                "& .MuiFormControlLabel-label": { fontSize: 13 },
              }}
              control={
                <Checkbox
                  size="small"
                  checked={!hiddenColumns.includes(column.id)}
                  disabled={column.id === "name"}
                  onChange={(event) =>
                    setHiddenColumns((current) =>
                      event.target.checked
                        ? current.filter((id) => id !== column.id)
                        : [...current, column.id],
                    )
                  }
                />
              }
              label={column.label}
            />
          ),
        )}
      </Popover>
      <AppDialog
        open={editing !== undefined}
        onClose={() => setEditing(undefined)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{editing ? "编辑作业模板" : "新增作业模板"}</DialogTitle>
        <DialogContent dividers sx={{ px: { xs: 2, sm: 3 }, py: 2 }}>
          <DetailSection title="基本信息">
            <Stack spacing={1.5}>
              <TextField
                required
                size="small"
                label="作业名称"
                fullWidth
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />
              <TextField
                required
                size="small"
                label="编码"
                fullWidth
                value={form.code}
                onChange={(event) =>
                  setForm({ ...form, code: event.target.value })
                }
              />
              <TextField
                size="small"
                label="备注"
                fullWidth
                multiline
                minRows={3}
                value={form.description}
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
              />
            </Stack>
          </DetailSection>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 1.5 }}>
          <Button onClick={() => setEditing(undefined)}>取消</Button>
          <Button
            variant="contained"
            disabled={!form.name || !form.code || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "保存中..." : "保存"}
          </Button>
        </DialogActions>
      </AppDialog>
      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="删除作业模板"
        message={
          confirmDelete
            ? `确认删除作业模板“${confirmDelete.name}”（${confirmDelete.code || "-"}）吗？`
            : ""
        }
        destructive
        loading={remove.isPending}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && remove.mutate(confirmDelete.id)}
      />
      <WorkTemplateDetailDrawer
        target={detailTarget}
        onClose={() => setDetailTarget(null)}
      />
    </Box>
  );
}
