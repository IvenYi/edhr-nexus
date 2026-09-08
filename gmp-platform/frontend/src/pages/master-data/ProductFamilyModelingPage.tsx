import TableStateCell from '@/components/TableStateCell';
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
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
} from "@mui/material";
import {
  Add,
  Close,
  ContentCopy,
  Delete,
  Edit,
  ExpandLess,
  ExpandMore,
  GroupOutlined,
  PlaylistAdd,
  RestartAlt,
  Search,
  TuneRounded,
  UnfoldLessRounded,
  UnfoldMoreRounded,
  ViewColumnRounded,
} from "@mui/icons-material";
import AppDialog from "@/components/AppDialog";
import ConfirmDialog from "@/components/ConfirmDialog";
import StatusBadge from "@/components/StatusBadge";
import { useSnackbar } from "@/components/SnackbarProvider";
import { getAuditLogs, type AuditLogItem } from "@/api/audit";
import {
  createProcessOwnerVersion,
  deleteProcessOwnerVersion,
  getProcessOwnerOptions,
  getProcessOwnerWorkspace,
  getProductProcessVersionAuditLogs,
  updateProcessOwnerVersion,
  type ProductProcessVersion,
  type ProductProcessVersionPayload,
} from "@/api/product-modeling";
import {
  addProductFamilyMembers,
  createProductFamily,
  deleteProductFamily,
  getProductFamilies,
  getProductFamilyMemberOptions,
  removeProductFamilyMember,
  transferProductFamilyMember,
  updateProductFamily,
  type ProductFamilyMemberOption,
  type ProductFamilyModel,
  type ProductFamilyPayload,
} from "@/api/product-family-modeling";
import type { PageResult } from "@/types/common";
import { getRdoVersionStatusMeta } from "@/utils/rdoVersionStatus";
import ProductProcessVersionEditorDialog, {
  type ProductProcessVersionDialogMode,
} from "./components/ProductProcessVersionEditorDialog";

const PAGE_SIZE = 20;
const COLUMN_STORAGE_KEY = "product-family-modeling-parent-columns:v1";
const ACTION_COLUMN_WIDTH = 160;

type ProductFamilyColumnId =
  | "name"
  | "code"
  | "memberCount"
  | "processVersionCount"
  | "updatedBy"
  | "updatedAt"
  | "actions";

interface ProductFamilyColumn {
  id: ProductFamilyColumnId;
  label: string;
  width: number;
  configurable?: boolean;
}

const PRODUCT_FAMILY_COLUMNS: ProductFamilyColumn[] = [
  { id: "name", label: "产品簇名称", width: 260, configurable: true },
  { id: "code", label: "产品簇编码", width: 170, configurable: true },
  { id: "memberCount", label: "产品成员数", width: 110, configurable: true },
  { id: "processVersionCount", label: "制程版本数", width: 120, configurable: true },
  { id: "updatedBy", label: "更新人", width: 132, configurable: true },
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

function operationColumnSx(width: number, layer: "head" | "body") {
  return {
    position: "sticky" as const,
    right: 0,
    zIndex: layer === "head" ? 10 : 6,
    width,
    minWidth: width,
    maxWidth: width,
    bgcolor: layer === "head" ? "#f5f7fa" : "#fff",
    backgroundClip: "padding-box",
    boxShadow: "-6px 0 8px -8px rgba(0, 0, 0, 0.35)",
    whiteSpace: "nowrap",
  };
}
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

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value.replace("T", " ").slice(0, 16)
    : date.toLocaleString("zh-CN", { hour12: false }).replace(/\//g, "-");
}

function formatVersionReference(
  code?: string | null,
  name?: string | null,
  version?: string | null,
) {
  return [code, name, version].filter(Boolean).join(" / ") || "-";
}

function parseAuditContent(content: unknown): Record<string, unknown> {
  if (!content) return {};
  if (typeof content === "object" && !Array.isArray(content))
    return content as Record<string, unknown>;
  if (typeof content !== "string") return {};
  try {
    const value = JSON.parse(content);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

const AUDIT_LABELS: Record<string, string> = {
  name: "名称",
  code: "编码",
  description: "备注",
  remark: "备注",
  status: "版本状态",
  processVersion: "制程版本",
  version: "版本",
  productionMode: "生产模式",
  productionForm: "生产方式",
  routeVersion: "工艺路线版本",
  routeVersionId: "工艺路线版本",
  dhrTemplateVersion: "批记录模板版本",
  dhrTemplateVersionId: "批记录模板版本",
  effectiveFrom: "生效时间",
  effectiveTo: "失效时间",
  operationBindings: "工序配置",
  operation: "工序",
  forms: "DHR 目录表单",
  documents: "文档",
  memberProductId: "成员产品 ID",
  memberProductCode: "成员产品编码",
  memberProductName: "成员产品名称",
};

const HIDDEN_AUDIT_FIELDS = new Set(["id", "productProcessId"]);

function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (value === "ACTIVE") return "生效";
  if (value === "EXPIRED") return "失效";
  if (Array.isArray(value))
    return value.length ? value.map(formatAuditValue).join("、") : "-";
  if (typeof value === "object")
    return Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !HIDDEN_AUDIT_FIELDS.has(key))
      .map(
        ([key, item]) =>
          `${AUDIT_LABELS[key] ?? key}：${formatAuditValue(item)}`,
      )
      .join("；");
  return String(value);
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
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
  children: ReactNode;
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
        {children ?? "-"}
      </Typography>
    </Box>
  );
}

interface DetailTarget {
  family: ProductFamilyModel;
  version?: ProductProcessVersion;
  initialTab?: number;
}

interface EditorTarget {
  family: ProductFamilyModel;
  versions: ProductProcessVersion[];
  mode: ProductProcessVersionDialogMode;
  target?: ProductProcessVersion;
}

export default function ProductFamilyModelingPage() {
  const queryClient = useQueryClient();
  const { showMessage } = useSnackbar();
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [submittedKeyword, setSubmittedKeyword] = useState("");
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [detailTarget, setDetailTarget] = useState<DetailTarget | null>(null);
  const [detailTab, setDetailTab] = useState(0);
  const [editorTarget, setEditorTarget] = useState<EditorTarget | null>(null);
  const [familyFormTarget, setFamilyFormTarget] = useState<
    ProductFamilyModel | null | undefined
  >(undefined);
  const [memberFamily, setMemberFamily] = useState<ProductFamilyModel | null>(
    null,
  );
  const [deleteFamilyTarget, setDeleteFamilyTarget] =
    useState<ProductFamilyModel | null>(null);
  const [deleteVersionTarget, setDeleteVersionTarget] = useState<{
    family: ProductFamilyModel;
    version: ProductProcessVersion;
  } | null>(null);
  const [columnAnchor, setColumnAnchor] = useState<HTMLElement | null>(null);
  const [hiddenColumns, setHiddenColumns] = useState<ProductFamilyColumnId[]>(
    () => {
      try {
        const parsed = JSON.parse(localStorage.getItem(COLUMN_STORAGE_KEY) || "[]");
        return Array.isArray(parsed)
          ? parsed.filter(
              (item): item is ProductFamilyColumnId =>
                PRODUCT_FAMILY_COLUMNS.some(
                  (column) => column.id === item && column.configurable,
                ),
            )
          : [];
      } catch {
        return [];
      }
    },
  );

  const listQuery = useQuery({
    queryKey: ["product-family-modeling", page, submittedKeyword],
    queryFn: async () =>
      (
        await getProductFamilies({
          page,
          size: PAGE_SIZE,
          keyword: submittedKeyword,
        })
      ).data.data,
  });
  const rows = listQuery.data?.content ?? [];
  const visibleColumns = useMemo(
    () =>
      PRODUCT_FAMILY_COLUMNS.filter(
        (column) => !hiddenColumns.includes(column.id),
      ),
    [hiddenColumns],
  );
  const parentTableWidth = visibleColumns.reduce(
    (total, column) => total + column.width,
    0,
  );

  useEffect(() => {
    localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(hiddenColumns));
  }, [hiddenColumns]);

  useEffect(() => {
    const current = new Set(rows.map((item) => item.id));
    setExpandedIds((ids) => ids.filter((id) => current.has(id)));
  }, [rows]);
  useEffect(() => {
    if (detailTarget) setDetailTab(detailTarget.initialTab ?? 0);
  }, [detailTarget]);

  const familyAuditQuery = useQuery({
    queryKey: ["product-family-audit", detailTarget?.family.id],
    enabled: Boolean(detailTarget && !detailTarget.version),
    queryFn: async () =>
      (
        await getAuditLogs({
          page: 1,
          size: 100,
          sort: "createdAt",
          order: "desc",
          entityType: "PRODUCT_FAMILY",
          entityId: detailTarget!.family.id,
        })
      ).data.data as PageResult<AuditLogItem>,
  });
  const versionAuditQuery = useQuery({
    queryKey: ["product-family-version-audit", detailTarget?.version?.id],
    enabled: Boolean(detailTarget?.version),
    queryFn: async () =>
      (await getProductProcessVersionAuditLogs(detailTarget!.version!.id)).data
        .data as PageResult<AuditLogItem>,
  });
  const detailEvents = detailTarget?.version
    ? (versionAuditQuery.data?.content ?? [])
    : (familyAuditQuery.data?.content ?? []);

  const invalidateFamily = async (id?: string) => {
    await queryClient.invalidateQueries({
      queryKey: ["product-family-modeling"],
    });
    if (id)
      await queryClient.invalidateQueries({
        queryKey: ["product-family-workspace", id],
      });
  };
  const fetchWorkspace = async (family: ProductFamilyModel) =>
    queryClient.fetchQuery({
      queryKey: ["product-family-workspace", family.id],
      queryFn: async () =>
        (await getProcessOwnerWorkspace("PRODUCT_FAMILY", family.id)).data.data,
    });

  const saveFamilyMutation = useMutation({
    mutationFn: ({
      target,
      payload,
    }: {
      target: ProductFamilyModel | null;
      payload: ProductFamilyPayload;
    }) =>
      target
        ? updateProductFamily(target.id, payload)
        : createProductFamily(payload),
    onSuccess: async () => {
      await invalidateFamily();
      setFamilyFormTarget(undefined);
      showMessage("产品簇已保存");
    },
    onError: (error: Error) =>
      showMessage(error.message || "保存失败", "error"),
  });
  const saveVersionMutation = useMutation({
    mutationFn: ({
      target,
      payload,
    }: {
      target: EditorTarget;
      payload: ProductProcessVersionPayload;
    }) =>
      target.mode === "edit" && target.target
        ? updateProcessOwnerVersion(
            "PRODUCT_FAMILY",
            target.family.id,
            target.target.id,
            payload,
          )
        : createProcessOwnerVersion(
            "PRODUCT_FAMILY",
            target.family.id,
            payload,
          ),
    onSuccess: async (_result, variables) => {
      await invalidateFamily(variables.target.family.id);
      setEditorTarget(null);
      showMessage("制程配置版本已保存");
    },
    onError: (error: Error) =>
      showMessage(error.message || "保存失败", "error"),
  });
  const deleteVersionMutation = useMutation({
    mutationFn: (target: {
      family: ProductFamilyModel;
      version: ProductProcessVersion;
    }) =>
      deleteProcessOwnerVersion(
        "PRODUCT_FAMILY",
        target.family.id,
        target.version.id,
      ),
    onSuccess: async (_result, target) => {
      await invalidateFamily(target.family.id);
      setDeleteVersionTarget(null);
      if (detailTarget?.version?.id === target.version.id)
        setDetailTarget(null);
      showMessage("制程配置版本已删除");
    },
    onError: (error: Error) =>
      showMessage(error.message || "删除失败", "error"),
  });
  const deleteFamilyMutation = useMutation({
    mutationFn: (family: ProductFamilyModel) => deleteProductFamily(family.id),
    onSuccess: async () => {
      await invalidateFamily();
      setDeleteFamilyTarget(null);
      setDetailTarget(null);
      showMessage("产品簇已删除");
    },
    onError: (error: Error) =>
      showMessage(error.message || "删除失败", "error"),
  });

  const toggleExpanded = (id: string) =>
    setExpandedIds((ids) =>
      ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id],
    );
  const openCreateVersion = async (family: ProductFamilyModel) => {
    try {
      const workspace = await fetchWorkspace(family);
      setEditorTarget({
        family,
        versions: workspace.model?.versions ?? [],
        mode: "create",
      });
    } catch (error) {
      showMessage(
        error instanceof Error ? error.message : "制程配置版本加载失败",
        "error",
      );
    }
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

  return (
    <Box
      sx={{
        minWidth: 0,
        height: { xs: "auto", lg: "calc(100vh - 150px)" },
        display: "flex",
        flexDirection: "column",
        gap: 1.5,
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          flex: "0 0 auto",
          border: "1px solid #e4e7ed",
          borderRadius: 1,
          bgcolor: "#fff",
          p: 2,
        }}
      >
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr))" }, gap: 1.5, alignItems: "center" }}>
          <TextField
            fullWidth
            size="small"
            label="产品簇名称/编码"
            placeholder="请输入"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submitSearch();
            }}
            sx={{ "& .MuiInputBase-root": { height: 40 }, "& .MuiInputBase-input": { boxSizing: "border-box" } }}
            InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
          />
          <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="flex-end" sx={{ gridColumn: { xs: "1", md: "3" } }}>
            <Button size="small" sx={{ height: 40, width: 80, minWidth: 80 }} variant="outlined" startIcon={<RestartAlt />} onClick={resetSearch}>重置</Button>
            <Button size="small" sx={{ height: 40, width: 80, minWidth: 80 }} variant="contained" startIcon={<Search />} onClick={submitSearch}>查询</Button>
          </Stack>
        </Box>
      </Box>

      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: 0,
          border: "1px solid #e4e7ed",
          borderRadius: 1,
          bgcolor: "#fff",
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
            gap: 2,
          }}
        >
          <Stack direction="row" spacing={0.5}>
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
            <Tooltip title="全部展开" arrow>
              <IconButton
                size="small"
                aria-label="全部展开"
                onClick={() => setExpandedIds(rows.map((item) => item.id))}
                sx={toolbarIconSx}
              >
                <UnfoldMoreRounded fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="全部收起" arrow>
              <IconButton
                size="small"
                aria-label="全部收起"
                onClick={() => setExpandedIds([])}
                sx={toolbarIconSx}
              >
                <UnfoldLessRounded fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
          <Button
            size="small"
            variant="contained"
            startIcon={<Add />}
            onClick={() => setFamilyFormTarget(null)}
          >
            新增产品簇
          </Button>
        </Box>
        <TableContainer sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          <Table
            stickyHeader
            size="small"
            sx={{
              minWidth: parentTableWidth,
              width: "100%",
              tableLayout: "fixed",
              height:
                listQuery.isLoading || listQuery.isError || rows.length === 0
                  ? "100%"
                  : "auto",
            }}
          >
            <TableHead>
              <TableRow sx={{ "& .MuiTableCell-root": tableHeaderCellSx }}>
                {visibleColumns.map((column) => (
                  <TableCell
                    key={column.id}
                    align={column.id === "actions" ? "center" : undefined}
                    sx={{
                      ...tableHeaderCellSx,
                      width: column.width,
                      minWidth: column.width,
                      ...(column.id === "actions" ? operationColumnSx(ACTION_COLUMN_WIDTH, "head") : {}),
                    }}
                  >
                    {column.label}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {listQuery.isLoading ? (
                <EmptyTableRow colSpan={visibleColumns.length} text="加载中..." />
              ) : listQuery.isError ? (
                <EmptyTableRow colSpan={visibleColumns.length} text="产品簇数据加载失败" error />
              ) : rows.length === 0 ? (
                <EmptyTableRow colSpan={visibleColumns.length} text="暂无数据" />
              ) : (
                rows.map((family) => (
                  <ProductFamilyTreeRows
                    key={family.id}
                    family={family}
                    visibleColumns={visibleColumns}
                    parentColumnCount={visibleColumns.length}
                    expanded={expandedIds.includes(family.id)}
                    onToggle={() => toggleExpanded(family.id)}
                    onView={() => setDetailTarget({ family })}
                    onMembers={() => setMemberFamily(family)}
                    onCreateVersion={() => void openCreateVersion(family)}
                    onEditFamily={() => setFamilyFormTarget(family)}
                    onDeleteFamily={() => setDeleteFamilyTarget(family)}
                    onViewVersion={(version) =>
                      setDetailTarget({ family, version })
                    }
                    onEditVersion={(version, mode, versions) =>
                      setEditorTarget({
                        family,
                        versions,
                        target: version,
                        mode,
                      })
                    }
                    onDeleteVersion={(version) =>
                      setDeleteVersionTarget({ family, version })
                    }
                  />
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
        {listQuery.data && listQuery.data.totalPages > 1 ? (
          <Box
            sx={{
              px: 2,
              py: 1,
              borderTop: "1px solid #ebeef5",
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            <Pagination
              size="small"
              count={listQuery.data.totalPages}
              page={page}
              onChange={(_, value) => setPage(value)}
            />
          </Box>
        ) : null}
      </Box>

      <Popover
        open={Boolean(columnAnchor)}
        anchorEl={columnAnchor}
        onClose={() => setColumnAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        PaperProps={{ sx: { width: 220, p: 1.25 } }}
      >
        <Typography variant="subtitle2" sx={{ px: 0.75, pb: 0.75 }}>
          父产品簇字段
        </Typography>
        {PRODUCT_FAMILY_COLUMNS.filter((column) => column.configurable).map(
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

      <ProductFamilyDetailDrawer
        target={detailTarget}
        tab={detailTab}
        onTabChange={setDetailTab}
        events={detailEvents}
        loading={
          detailTarget?.version
            ? versionAuditQuery.isLoading
            : familyAuditQuery.isLoading
        }
        error={
          detailTarget?.version
            ? versionAuditQuery.isError
            : familyAuditQuery.isError
        }
        onClose={() => setDetailTarget(null)}
      />
      {familyFormTarget !== undefined ? (
        <ProductFamilyFormDialog
          target={familyFormTarget}
          saving={saveFamilyMutation.isPending}
          onClose={() => setFamilyFormTarget(undefined)}
          onSubmit={(payload) =>
            saveFamilyMutation.mutate({ target: familyFormTarget, payload })
          }
        />
      ) : null}
      {memberFamily ? (
        <ProductFamilyMemberDialog
          family={memberFamily}
          onClose={() => setMemberFamily(null)}
          onChanged={() => void invalidateFamily(memberFamily.id)}
        />
      ) : null}
      {editorTarget ? (
        <ProductProcessVersionEditorDialog
          open
          productId={editorTarget.family.id}
          productName={editorTarget.family.name}
          productCode={editorTarget.family.code}
          loadOptions={async (dhrTemplateVersionId) =>
            (
              await getProcessOwnerOptions(
                "PRODUCT_FAMILY",
                editorTarget.family.id,
                dhrTemplateVersionId,
              )
            ).data.data
          }
          mode={editorTarget.mode}
          target={editorTarget.target}
          versions={editorTarget.versions}
          saving={saveVersionMutation.isPending}
          onClose={() => setEditorTarget(null)}
          onSubmit={(payload) =>
            saveVersionMutation.mutate({ target: editorTarget, payload })
          }
        />
      ) : null}
      <ConfirmDialog
        open={Boolean(deleteFamilyTarget)}
        title="删除产品簇"
        message={`确定删除产品簇「${deleteFamilyTarget?.name || ""}（${deleteFamilyTarget?.code || ""}）」吗？删除前需先移除产品成员和制程版本。`}
        confirmText="删除"
        destructive
        loading={deleteFamilyMutation.isPending}
        onCancel={() => setDeleteFamilyTarget(null)}
        onConfirm={() => {
          if (deleteFamilyTarget)
            deleteFamilyMutation.mutate(deleteFamilyTarget);
        }}
      />
      <ConfirmDialog
        open={Boolean(deleteVersionTarget)}
        title="删除制程配置版本"
        message={`确定删除产品簇「${deleteVersionTarget?.family.name || ""}（${deleteVersionTarget?.family.code || ""}）」的制程版本「${deleteVersionTarget?.version.version || ""}」吗？删除后不可恢复。`}
        confirmText="删除"
        destructive
        loading={deleteVersionMutation.isPending}
        onCancel={() => setDeleteVersionTarget(null)}
        onConfirm={() => {
          if (deleteVersionTarget)
            deleteVersionMutation.mutate(deleteVersionTarget);
        }}
      />
    </Box>
  );
}

function EmptyTableRow({
  colSpan,
  text,
  error = false,
}: {
  colSpan: number;
  text: string;
  error?: boolean;
}) {
  return (
    <TableRow sx={{ height: "100%" }}>
      <TableStateCell
        colSpan={colSpan}
        align="center"
        sx={{ height: "100%", color: error ? "#c62828" : "#909399" }}
      >
        {text}
      </TableStateCell>
    </TableRow>
  );
}

function ProductFamilyTreeRows({
  family,
  visibleColumns,
  parentColumnCount,
  expanded,
  onToggle,
  onView,
  onMembers,
  onCreateVersion,
  onEditFamily,
  onDeleteFamily,
  onViewVersion,
  onEditVersion,
  onDeleteVersion,
}: {
  family: ProductFamilyModel;
  visibleColumns: ProductFamilyColumn[];
  parentColumnCount: number;
  expanded: boolean;
  onToggle: () => void;
  onView: () => void;
  onMembers: () => void;
  onCreateVersion: () => void;
  onEditFamily: () => void;
  onDeleteFamily: () => void;
  onViewVersion: (version: ProductProcessVersion) => void;
  onEditVersion: (
    version: ProductProcessVersion,
    mode: ProductProcessVersionDialogMode,
    versions: ProductProcessVersion[],
  ) => void;
  onDeleteVersion: (version: ProductProcessVersion) => void;
}) {
  const workspaceQuery = useQuery({
    queryKey: ["product-family-workspace", family.id],
    enabled: expanded,
    queryFn: async () =>
      (await getProcessOwnerWorkspace("PRODUCT_FAMILY", family.id)).data.data,
  });
  const versions = workspaceQuery.data?.model?.versions ?? [];
  const renderParentCell = (column: ProductFamilyColumn) => {
    switch (column.id) {
      case "name":
        return (
          <TableCell key={column.id}>
            <Stack direction="row" alignItems="center" spacing={0.5} sx={{ minWidth: 0 }}>
              <IconButton
                size="small"
                aria-label={expanded ? "收起制程版本" : "展开制程版本"}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggle();
                }}
              >
                {expanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
              </IconButton>
              <Typography
                component="button"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onView();
                }}
                sx={{
                  border: 0,
                  p: 0,
                  minWidth: 0,
                  bgcolor: "transparent",
                  color: "#1890ff",
                  cursor: "pointer",
                  fontSize: 14,
                  textAlign: "left",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  "&:hover": { color: "#096dd9", textDecoration: "underline" },
                }}
              >
                {family.name}
              </Typography>
            </Stack>
          </TableCell>
        );
      case "code":
        return <TableCell key={column.id}>{family.code || "-"}</TableCell>;
      case "memberCount":
        return <TableCell key={column.id}>{family.memberCount}</TableCell>;
      case "processVersionCount":
        return <TableCell key={column.id}>{family.processVersionCount}</TableCell>;
      case "updatedBy":
        return <TableCell key={column.id}>{family.updatedBy || family.createdBy || "-"}</TableCell>;
      case "updatedAt":
        return <TableCell key={column.id}>{formatDateTime(family.updatedAt || family.createdAt)}</TableCell>;
      case "actions":
        return (
          <TableCell
            key={column.id}
            align="center"
            onClick={(event) => event.stopPropagation()}
            sx={operationColumnSx(ACTION_COLUMN_WIDTH, "body")}
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
              <Tooltip title="产品成员" arrow>
                <IconButton size="small" aria-label="产品成员" onClick={onMembers}>
                  <GroupOutlined fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="新增子版本" arrow>
                <IconButton size="small" aria-label="新增子版本" onClick={onCreateVersion}>
                  <PlaylistAdd fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="编辑" arrow>
                <IconButton size="small" aria-label="编辑" onClick={onEditFamily}>
                  <Edit fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="删除" arrow>
                <IconButton size="small" aria-label="删除" color="error" onClick={onDeleteFamily}>
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
    <Fragment>
      <TableRow hover onClick={onToggle} sx={{ ...tableRowSx, cursor: "pointer" }}>
        {visibleColumns.map(renderParentCell)}
      </TableRow>
      {expanded ? (
        <TableRow>
          <TableCell
            colSpan={parentColumnCount}
            sx={{ p: 0, bgcolor: "#fbfdff", borderBottom: "1px solid #ebeef5" }}
          >
            {workspaceQuery.isLoading ? (
              <Box
                sx={{
                  minHeight: 84,
                  display: "grid",
                  placeItems: "center",
                  color: "#909399",
                }}
              >
                <CircularProgress size={20} />
              </Box>
            ) : workspaceQuery.isError ? (
              <Box sx={{ px: 2, py: 2, color: "#c62828" }}>
                制程配置版本加载失败
              </Box>
            ) : versions.length === 0 ? (
              <Box
                sx={{
                  minHeight: 84,
                  display: "flex",
                  alignItems: "center",
                  px: 2,
                  color: "#909399",
                }}
              >
                <Typography variant="body2">
                  该产品簇暂无制程配置版本
                </Typography>
              </Box>
            ) : (
              <TableContainer sx={{ overflow: "auto" }}>
                <Table
                  size="small"
                  sx={{ minWidth: 1120, tableLayout: "fixed" }}
                >
                  <TableHead>
                    <TableRow sx={{ "& .MuiTableCell-root": tableHeaderCellSx }}>
                      <TableCell sx={{ ...tableHeaderCellSx, width: 132 }}>
                        制程版本号
                      </TableCell>
                      <TableCell sx={{ ...tableHeaderCellSx, width: 104 }}>
                        生产模式
                      </TableCell>
                      <TableCell sx={{ ...tableHeaderCellSx, width: 104 }}>
                        生产方式
                      </TableCell>
                      <TableCell sx={{ ...tableHeaderCellSx, width: 230 }}>
                        工艺路线版本
                      </TableCell>
                      <TableCell sx={{ ...tableHeaderCellSx, width: 230 }}>
                        批记录模板版本
                      </TableCell>
                      <TableCell sx={{ ...tableHeaderCellSx, width: 104 }}>
                        版本状态
                      </TableCell>
                      <TableCell sx={{ ...tableHeaderCellSx, width: 164 }}>
                        生效时间
                      </TableCell>
                      <TableCell sx={{ ...tableHeaderCellSx, width: 164 }}>
                        失效时间
                      </TableCell>
                      <TableCell sx={{ ...tableHeaderCellSx, width: 128 }}>
                        更新人
                      </TableCell>
                      <TableCell
                        align="center"
                        sx={{ ...tableHeaderCellSx, ...operationColumnSx(128, "head") }}
                      >
                        操作
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {versions.map((version) => (
                      <TableRow
                        key={version.id}
                        hover
                        sx={tableRowSx}
                        onClick={() => onViewVersion(version)}
                      >
                        <TableCell sx={{ color: "#1677c8", cursor: "pointer" }}>
                          {version.version}
                        </TableCell>
                        <TableCell>{version.productionMode}</TableCell>
                        <TableCell>{version.productionForm}</TableCell>
                        <TableCell>
                          {formatVersionReference(
                            version.routeCode,
                            version.routeName,
                            version.routeVersion,
                          )}
                        </TableCell>
                        <TableCell>
                          {formatVersionReference(
                            version.dhrTemplateCode,
                            version.dhrTemplateName,
                            version.dhrTemplateVersion,
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            {...getRdoVersionStatusMeta(version.status)}
                          />
                        </TableCell>
                        <TableCell>
                          {formatDateTime(version.effectiveFrom)}
                        </TableCell>
                        <TableCell>
                          {formatDateTime(version.effectiveTo)}
                        </TableCell>
                        <TableCell>{version.updatedBy || "-"}</TableCell>
                        <TableCell
                          align="center"
                          onClick={(event) => event.stopPropagation()}
                          sx={operationColumnSx(128, "body")}
                        >
                          <Tooltip title="编辑" arrow>
                            <IconButton
                              size="small"
                              aria-label="编辑"
                              onClick={() =>
                                onEditVersion(version, "edit", versions)
                              }
                            >
                              <Edit fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="复制版本" arrow>
                            <IconButton
                              size="small"
                              aria-label="复制版本"
                              onClick={() =>
                                onEditVersion(version, "copy", versions)
                              }
                            >
                              <ContentCopy fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="删除" arrow>
                            <IconButton
                              size="small"
                              aria-label="删除"
                              color="error"
                              onClick={() => onDeleteVersion(version)}
                            >
                              <Delete fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </TableCell>
        </TableRow>
      ) : null}
    </Fragment>
  );
}

function ProductFamilyDetailDrawer({
  target,
  tab,
  onTabChange,
  events,
  loading,
  error,
  onClose,
}: {
  target: DetailTarget | null;
  tab: number;
  onTabChange: (value: number) => void;
  events: AuditLogItem[];
  loading: boolean;
  error: boolean;
  onClose: () => void;
}) {
  if (!target) return null;
  const { family, version } = target;
  const title = version ? `${family.name} · ${version.version}` : family.name;
  return (
    <Drawer
      anchor="right"
      open
      onClose={onClose}
      ModalProps={{ keepMounted: true }}
      sx={drawerRootSx}
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
            {title}
          </Typography>
          <Tooltip title="关闭" arrow>
            <IconButton size="small" aria-label="关闭" onClick={onClose}>
              <Close fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
        <Tabs
          value={tab}
          onChange={(_, value) => onTabChange(value)}
          sx={{ px: 2, bgcolor: "#fff", borderBottom: "1px solid #e4e7ed" }}
        >
          <Tab label="数据信息" />
          <Tab label="数据审计" />
        </Tabs>
        <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", p: 2 }}>
          {tab === 0 ? (
            version ? (
              <Stack spacing={1.5}>
                <DetailSection title="版本信息">
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: 2,
                    }}
                  >
                    <DetailField label="制程版本">
                      {version.version}
                    </DetailField>
                    <DetailField label="版本状态">
                      <StatusBadge
                        {...getRdoVersionStatusMeta(version.status)}
                      />
                    </DetailField>
                    <DetailField label="生产模式">
                      {version.productionMode}
                    </DetailField>
                    <DetailField label="生产方式">
                      {version.productionForm}
                    </DetailField>
                    <DetailField label="生效时间">
                      {formatDateTime(version.effectiveFrom)}
                    </DetailField>
                    <DetailField label="失效时间">
                      {formatDateTime(version.effectiveTo)}
                    </DetailField>
                    <DetailField label="工艺路线版本">
                      {formatVersionReference(
                        version.routeCode,
                        version.routeName,
                        version.routeVersion,
                      )}
                    </DetailField>
                    <DetailField label="批记录模板版本">
                      {formatVersionReference(
                        version.dhrTemplateCode,
                        version.dhrTemplateName,
                        version.dhrTemplateVersion,
                      )}
                    </DetailField>
                    <DetailField label="备注">
                      {version.description}
                    </DetailField>
                  </Box>
                </DetailSection>
                <DetailSection title="已配置工序">
                  <Stack spacing={1}>
                    {version.operations.length ? (
                      version.operations.map((operation) => (
                        <Box
                          key={operation.routeNodeKey}
                          sx={{ borderBottom: "1px solid #f0f0f0", pb: 1 }}
                        >
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {[operation.operationCode, operation.operationName]
                              .filter(Boolean)
                              .join(" / ")}
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{ color: "#606266" }}
                          >
                            表单 {operation.forms.length} 个，文档{" "}
                            {operation.documents.length} 个
                          </Typography>
                        </Box>
                      ))
                    ) : (
                      <Typography variant="body2" sx={{ color: "#909399" }}>
                        暂无工序配置
                      </Typography>
                    )}
                  </Stack>
                </DetailSection>
              </Stack>
            ) : (
              <Stack spacing={1.5}>
                <DetailSection title="基本信息">
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: 2,
                    }}
                  >
                    <DetailField label="产品簇名称">{family.name}</DetailField>
                    <DetailField label="产品簇编码">{family.code}</DetailField>
                    <DetailField label="产品成员数">
                      {family.memberCount}
                    </DetailField>
                    <DetailField label="制程版本数">
                      {family.processVersionCount}
                    </DetailField>
                    <DetailField label="更新人">{family.updatedBy}</DetailField>
                    <DetailField label="描述">{family.description}</DetailField>
                    <DetailField label="备注">{family.remark}</DetailField>
                  </Box>
                </DetailSection>
              </Stack>
            )
          ) : loading ? (
            <Box sx={{ py: 8, display: "grid", placeItems: "center" }}>
              <CircularProgress size={24} />
            </Box>
          ) : error ? (
            <Box sx={{ py: 6, textAlign: "center", color: "#c62828" }}>
              数据审计加载失败
            </Box>
          ) : events.length === 0 ? (
            <Box sx={{ py: 6, textAlign: "center", color: "#909399" }}>
              暂无数据审计记录
            </Box>
          ) : (
            <Stack spacing={1.25}>
              {events.map((event) => (
                <Box
                  key={String(event.id)}
                  sx={{
                    border: "1px solid #e4e7ed",
                    borderRadius: 1,
                    bgcolor: "#fff",
                    p: 1.25,
                  }}
                >
                  <Stack direction="row" justifyContent="space-between" gap={1}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {event.actionLabel ||
                        ({ CREATE: "新增", UPDATE: "编辑", DELETE: "删除" }[
                          event.action || ""
                        ] ??
                          event.action) ||
                        "操作"}
                    </Typography>
                    <Typography variant="caption" sx={{ color: "#909399" }}>
                      {formatDateTime(event.createdAt || event.operationTime)}
                    </Typography>
                  </Stack>
                  <Typography
                    variant="caption"
                    sx={{ display: "block", mt: 0.25, color: "#606266" }}
                  >
                    {event.functionName || event.dataSummary || "-"}
                  </Typography>
                  <Stack spacing={0.75} sx={{ mt: 1 }}>
                    {[
                      ["变更前", event.contentBefore],
                      ["变更后", event.contentAfter],
                    ].map(([title, content]) => {
                      const entries = Object.entries(
                        parseAuditContent(content),
                      ).filter(
                        ([key]) =>
                          !HIDDEN_AUDIT_FIELDS.has(key) &&
                          (version || key !== "status"),
                      );
                      return entries.length ? (
                        <Box
                          key={String(title)}
                          sx={{
                            bgcolor: "#f8fafc",
                            border: "1px solid #eef0f4",
                            borderRadius: 1,
                            p: 1,
                          }}
                        >
                          <Typography
                            variant="caption"
                            sx={{ color: "#606266", fontWeight: 600 }}
                          >
                            {String(title)}
                          </Typography>
                          {entries.map(([key, value]) => (
                            <Typography
                              key={key}
                              variant="caption"
                              sx={{
                                display: "block",
                                mt: 0.35,
                                color: "#303133",
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-word",
                              }}
                            >
                              {AUDIT_LABELS[key] ?? key}：
                              {formatAuditValue(value)}
                            </Typography>
                          ))}
                        </Box>
                      ) : null;
                    })}
                  </Stack>
                </Box>
              ))}
            </Stack>
          )}
        </Box>
      </Box>
    </Drawer>
  );
}

function ProductFamilyFormDialog({
  target,
  saving,
  onClose,
  onSubmit,
}: {
  target: ProductFamilyModel | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (payload: ProductFamilyPayload) => void;
}) {
  const [form, setForm] = useState<ProductFamilyPayload>(() => ({
    code: target?.code || "",
    name: target?.name || "",
    description: target?.description || "",
    remark: target?.remark || "",
  }));
  useEffect(() => {
    setForm({
      code: target?.code || "",
      name: target?.name || "",
      description: target?.description || "",
      remark: target?.remark || "",
    });
  }, [target]);
  return (
    <AppDialog
      open
      onClose={saving ? undefined : onClose}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>{target ? "编辑产品簇" : "新增产品簇"}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.5}>
          {target ? (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "1fr",
                gap: 1.5,
                px: 0.25,
                py: 0.75,
                bgcolor: "#f8fafc",
                border: "1px solid #e4e7ed",
                borderRadius: 1,
              }}
            >
              <DetailField label="创建时间">
                {formatDateTime(target.createdAt)}
              </DetailField>
            </Box>
          ) : null}
          <TextField
            required
            size="small"
            label="产品簇名称"
            value={form.name}
            onChange={(event) =>
              setForm((value) => ({ ...value, name: event.target.value }))
            }
          />
          <TextField
            required
            size="small"
            label="产品簇编码"
            value={form.code}
            onChange={(event) =>
              setForm((value) => ({ ...value, code: event.target.value }))
            }
          />
          <TextField
            size="small"
            label="描述"
            multiline
            minRows={3}
            value={form.description || ""}
            onChange={(event) =>
              setForm((value) => ({
                ...value,
                description: event.target.value,
              }))
            }
          />
          <TextField
            size="small"
            label="备注"
            multiline
            minRows={2}
            value={form.remark || ""}
            onChange={(event) =>
              setForm((value) => ({ ...value, remark: event.target.value }))
            }
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          取消
        </Button>
        <Button
          variant="contained"
          disabled={saving || !form.name.trim() || !form.code.trim()}
          onClick={() =>
            onSubmit({
              ...form,
              code: form.code.trim(),
              name: form.name.trim(),
              description: form.description?.trim() || null,
              remark: form.remark?.trim() || null,
            })
          }
        >
          {saving ? "保存中..." : "保存"}
        </Button>
      </DialogActions>
    </AppDialog>
  );
}

function ProductFamilyMemberDialog({
  family,
  onClose,
  onChanged,
}: {
  family: ProductFamilyModel;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { showMessage } = useSnackbar();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [transferTarget, setTransferTarget] =
    useState<ProductFamilyMemberOption | null>(null);
  const optionsQuery = useQuery({
    queryKey: ["product-family-members", family.id],
    queryFn: async () =>
      (await getProductFamilyMemberOptions(family.id)).data.data,
  });
  const refresh = async () => {
    setSelectedIds([]);
    await optionsQuery.refetch();
    onChanged();
  };
  const addMutation = useMutation({
    mutationFn: () => addProductFamilyMembers(family.id, selectedIds),
    onSuccess: () => {
      void refresh();
      showMessage("产品已添加到当前产品簇");
    },
    onError: (error: Error) =>
      showMessage(error.message || "添加失败", "error"),
  });
  const transferMutation = useMutation({
    mutationFn: (item: ProductFamilyMemberOption) =>
      transferProductFamilyMember(family.id, item.productId),
    onSuccess: () => {
      setTransferTarget(null);
      void refresh();
      showMessage("产品已转移到当前产品簇");
    },
    onError: (error: Error) =>
      showMessage(error.message || "转移失败", "error"),
  });
  const removeMutation = useMutation({
    mutationFn: (item: ProductFamilyMemberOption) =>
      removeProductFamilyMember(family.id, item.productId),
    onSuccess: () => {
      void refresh();
      showMessage("产品已移出当前产品簇");
    },
    onError: (error: Error) =>
      showMessage(error.message || "移除失败", "error"),
  });
  const options = optionsQuery.data ?? [];
  const currentMembers = options.filter((item) => item.currentMember);
  const candidates = options.filter((item) => !item.currentMember);
  const toggle = (id: string) =>
    setSelectedIds((ids) =>
      ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id],
    );
  return (
    <>
      <AppDialog open onClose={onClose} fullWidth maxWidth="lg">
        <DialogTitle>产品成员 · {family.name}</DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          <Box
            sx={{
              px: 2,
              py: 1.25,
              bgcolor: "#fff8e6",
              borderBottom: "1px solid #f0dfb3",
            }}
          >
            <Typography variant="caption" sx={{ color: "#7a5b00" }}>
              移除后，若该产品自身没有可用制程版本，将无法使用产品簇兜底制程。
            </Typography>
          </Box>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                md: "minmax(0, 1.25fr) minmax(320px, 0.75fr)",
              },
              minHeight: 440,
            }}
          >
            <Box
              sx={{
                minWidth: 0,
                borderRight: { md: "1px solid #e4e7ed" },
                p: 2,
              }}
            >
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                可添加产品
              </Typography>
              {optionsQuery.isLoading ? (
                <Box sx={{ py: 8, display: "grid", placeItems: "center" }}>
                  <CircularProgress size={24} />
                </Box>
              ) : candidates.length === 0 ? (
                <Box sx={{ py: 6, color: "#909399", textAlign: "center" }}>
                  暂无可添加产品
                </Box>
              ) : (
                <TableContainer
                  sx={{
                    maxHeight: 360,
                    border: "1px solid #e4e7ed",
                    borderRadius: 1,
                  }}
                >
                  <Table stickyHeader size="small">
                    <TableHead>
                      <TableRow sx={{ "& .MuiTableCell-root": tableHeaderCellSx }}>
                        <TableCell sx={tableHeaderCellSx} padding="checkbox" />
                        <TableCell sx={tableHeaderCellSx}>产品名称</TableCell>
                        <TableCell sx={tableHeaderCellSx}>产品编码</TableCell>
                        <TableCell sx={tableHeaderCellSx}>物料类型</TableCell>
                        <TableCell sx={tableHeaderCellSx}>所属产品簇</TableCell>
                        <TableCell sx={tableHeaderCellSx} align="center">
                          操作
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {candidates.map((item) => {
                        const owned = Boolean(item.productFamilyId);
                        const checked = selectedIds.includes(item.productId);
                        return (
                          <TableRow key={item.productId} hover sx={tableRowSx}>
                            <TableCell padding="checkbox">
                              <Checkbox
                                size="small"
                                checked={checked}
                                disabled={owned}
                                onChange={() => toggle(item.productId)}
                              />
                            </TableCell>
                            <TableCell>{item.productName}</TableCell>
                            <TableCell>{item.productCode}</TableCell>
                            <TableCell>{item.materialTypeName}</TableCell>
                            <TableCell
                              sx={{ color: owned ? "#c17d00" : "#909399" }}
                            >
                              {item.productFamilyName || "-"}
                            </TableCell>
                            <TableCell align="center">
                              {owned ? (
                                <Button
                                  size="small"
                                  onClick={() => setTransferTarget(item)}
                                >
                                  转移
                                </Button>
                              ) : null}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Box>
            <Box sx={{ minWidth: 0, p: 2, bgcolor: "#fbfdff" }}>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                sx={{ mb: 1 }}
              >
                <Typography variant="subtitle2">当前产品簇成员</Typography>
                <Typography variant="caption" sx={{ color: "#909399" }}>
                  {currentMembers.length} 个
                </Typography>
              </Stack>
              {currentMembers.length === 0 ? (
                <Box sx={{ py: 6, textAlign: "center", color: "#909399" }}>
                  暂无成员
                </Box>
              ) : (
                <Stack
                  spacing={0.75}
                  sx={{ maxHeight: 360, overflow: "auto", pr: 0.25 }}
                >
                  {currentMembers.map((item) => (
                    <Box
                      key={item.productId}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        border: "1px solid #e4e7ed",
                        borderRadius: 1,
                        bgcolor: "#fff",
                        px: 1.25,
                        py: 0.75,
                      }}
                    >
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography variant="body2" noWrap>
                          {item.productName}
                        </Typography>
                        <Typography variant="caption" sx={{ color: "#909399" }}>
                          {item.productCode} · {item.materialTypeName}
                        </Typography>
                      </Box>
                      <Tooltip title="移除成员" arrow>
                        <IconButton
                          size="small"
                          color="error"
                          aria-label="移除成员"
                          disabled={removeMutation.isPending}
                          onClick={() => removeMutation.mutate(item)}
                        >
                          <Delete fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  ))}
                </Stack>
              )}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={addMutation.isPending}>
            取消
          </Button>
          <Button
            variant="contained"
            onClick={() => addMutation.mutate()}
            disabled={selectedIds.length === 0 || addMutation.isPending}
          >
            {addMutation.isPending
              ? "添加中..."
              : `添加${selectedIds.length ? ` (${selectedIds.length})` : ""}`}
          </Button>
        </DialogActions>
      </AppDialog>
      <ConfirmDialog
        open={Boolean(transferTarget)}
        title="转移产品成员"
        message={`确定将产品「${transferTarget?.productName || ""}（${transferTarget?.productCode || ""}）」从「${transferTarget?.productFamilyName || ""}」转移到「${family.name}」吗？转移只影响后续生产对象。`}
        confirmText="转移"
        loading={transferMutation.isPending}
        onCancel={() => setTransferTarget(null)}
        onConfirm={() => {
          if (transferTarget) transferMutation.mutate(transferTarget);
        }}
      />
    </>
  );
}
