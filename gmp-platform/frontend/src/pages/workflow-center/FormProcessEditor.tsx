import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import {
  Add,
  AutoFixHigh,
  Delete,
  MapOutlined,
  Publish,
  Redo,
  Save,
  Undo,
} from "@mui/icons-material";
import {
  addEdge,
  Background,
  ControlButton,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Box,
  Button,
  Chip,
  FormControl,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  SubjectSelector,
  parseSubjectRefs,
  serializeSubjectRefs,
  type SubjectRef,
} from "@/components/identity/SubjectSelector";
import { useSnackbar } from "@/components/SnackbarProvider";
import {
  createFormProcessVersion,
  getFormProcess,
  getFormProcessVersion,
  getFormProcessVersions,
  publishFormProcessVersion,
  saveFormProcessGraph,
  type FormProcessId,
} from "@/api/form-processes";
import {
  FlowVersionPicker,
  FlowMiniMap,
  FullScreenFlowDesigner,
  StandardFlowNode,
  findNearbyFlowNode,
  oppositeFlowDirection,
  type FlowDirection,
} from "@/components/flow-designer/FlowDesigner";
import {
  WorkflowActionConfig,
  defaultWorkflowButtons,
  type WorkflowButtonConfig,
  type WorkflowButtonEvent,
} from "@/components/flow-designer/WorkflowActionConfig";

type Kind = "START" | "APPROVAL" | "END";
type PermissionMode = "EDIT" | "READ_ONLY";
type PermissionGroupRule = {
  id?: string;
  group: string;
  subjects?: SubjectRef[];
  defaultPermission?: PermissionMode;
  editableFields?: string;
  readOnlyFields?: string;
  /** Legacy per-group action flags; migrated to node-level buttons on save. */
  canSave?: boolean;
  canSubmit?: boolean;
};
type Config = {
  permissionGroups?: string[];
  permissionGroupRules?: PermissionGroupRule[];
  conflictPolicy?: "READ_ONLY_FIRST";
  defaultPermission?: PermissionMode;
  readOnlyFields?: string;
  editableFields?: string;
  approvers?: string;
  approverSubjects?: SubjectRef[];
  returnToEntry?: boolean;
  fieldSlots?: string[];
  buttons?: WorkflowButtonConfig[];
  buttonEvents?: WorkflowButtonEvent[];
  guardMode?: "NONE" | "BLOCK_ON_INVALID" | "WARN_ON_INVALID";
};
type NodeData = {
  label: string;
  kind: Kind;
  config?: Config;
  editable?: boolean;
  selected?: boolean;
  quickMenuDirection?: FlowDirection | null;
  quickDirections?: FlowDirection[];
  canUseQuickAction?: boolean;
  onOpenQuickMenu?: (direction: FlowDirection) => void;
  onQuickAdd?: (direction: FlowDirection) => void;
};
type FlowNode = Node<NodeData>;
type Version = {
  id: FormProcessId;
  versionNumber: number;
  status: string;
  isCurrent?: boolean;
  nodesJson?: string | null;
  edgesJson?: string | null;
};
type Graph = { nodes: FlowNode[]; edges: Edge[] };

const initialNodes: FlowNode[] = [
  {
    id: "start",
    type: "formProcessNode",
    position: { x: 360, y: 80 },
    data: {
      label: "填报",
      kind: "START",
      config: {
        permissionGroups: [],
        permissionGroupRules: [],
        conflictPolicy: "READ_ONLY_FIRST",
        defaultPermission: "EDIT",
        buttons: [
          { id: "save", label: "保存", action: "SAVE", visible: true },
          { id: "submit", label: "提交", action: "SUBMIT", visible: true },
        ],
        buttonEvents: [],
        guardMode: "BLOCK_ON_INVALID",
      },
    },
  },
  {
    id: "end",
    type: "formProcessNode",
    position: { x: 360, y: 470 },
    data: { label: "结束", kind: "END", config: {} },
  },
];
const appearance = {
  START: { color: "#1677c8", background: "#e8f4ff" },
  APPROVAL: { color: "#1677c8", background: "#edf6ff" },
  END: { color: "#677386", background: "#eef1f5" },
};
const formProcessNodeSize = (node: FlowNode) =>
  node.data.kind === "START" || node.data.kind === "END"
    ? { width: 96, height: 52 }
    : { width: 148, height: 60 };
const parse = <T,>(value: string | null | undefined, fallback: T): T => {
  try {
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
};
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const fieldTokens = (value: unknown) =>
  String(value ?? "")
    .split(/[\n,，]/)
    .map((item) => item.trim())
    .filter((item) => item && item !== "*");

function permissionSettings(config?: {
  defaultPermission?: PermissionMode;
  editableFields?: string;
  readOnlyFields?: string;
}) {
  const defaultPermission: PermissionMode =
    config?.defaultPermission ??
    (String(config?.readOnlyFields ?? "")
      .split(/[\n,，]/)
      .map((item) => item.trim())
      .includes("*")
      ? "READ_ONLY"
      : "EDIT");
  const exceptions =
    defaultPermission === "EDIT"
      ? fieldTokens(config?.readOnlyFields)
      : fieldTokens(config?.editableFields);
  return { defaultPermission, exceptions };
}

function defaultPermissionPatch(
  defaultPermission: PermissionMode,
): Pick<Config, "defaultPermission"> {
  return { defaultPermission };
}

/** Keep old field-level settings readable, but never persist them again. */
function serializeNodesForSave(currentNodes: FlowNode[]) {
  return currentNodes.map((node) => {
    if (node.data.kind !== "START" && node.data.kind !== "APPROVAL") {
      return node;
    }
    const {
      editableFields: _editableFields,
      readOnlyFields: _readOnlyFields,
      fieldSlots: _fieldSlots,
      ...config
    } = node.data.config ?? {};
    const permissionGroupRules = config.permissionGroupRules?.map((rule) => {
      const {
        editableFields: _ruleEditableFields,
        readOnlyFields: _ruleReadOnlyFields,
        canSave: _legacyCanSave,
        canSubmit: _legacyCanSubmit,
        ...cleanRule
      } = rule;
      return {
        ...cleanRule,
        ...(rule.subjects ? { subjects: rule.subjects, group: serializeSubjectRefs(rule.subjects) } : {}),
      };
    });
    return {
      ...node,
      data: {
        ...node.data,
        config: {
          ...config,
          buttons: config.buttons?.length
            ? config.buttons
            : defaultWorkflowButtons(node.data.kind),
          buttonEvents: config.buttonEvents ?? [],
          ...(permissionGroupRules ? { permissionGroupRules } : {}),
          ...(config.approverSubjects ? { approverSubjects: config.approverSubjects, approvers: serializeSubjectRefs(config.approverSubjects) } : {}),
        },
      },
    };
  });
}

function FormProcessNode({ id, data }: NodeProps<FlowNode>) {
  const handleDirections: FlowDirection[] =
    data.kind === "START"
      ? ["bottom"]
      : data.kind === "APPROVAL"
        ? ["top", "right", "bottom", "left"]
        : [];
  const arrowDirections: FlowDirection[] =
    data.quickDirections ??
    handleDirections;
  return (
    <StandardFlowNode
      id={id}
      label={data.label}
      caption={
        data.kind === "START"
          ? "现场填报权限"
          : data.kind === "APPROVAL"
            ? "任一审批人完成"
            : "流程完成"
      }
      appearance={appearance[data.kind]}
      width={data.kind === "START" || data.kind === "END" ? 96 : 148}
      height={data.kind === "START" || data.kind === "END" ? 52 : 60}
      boundary={data.kind !== "APPROVAL"}
      start={data.kind === "START"}
      end={data.kind === "END"}
      editable={Boolean(data.editable)}
      selected={Boolean(data.selected)}
      quickDirections={handleDirections}
      quickArrowDirections={arrowDirections}
      quickMenuDirection={data.quickMenuDirection}
      quickActions={[
        {
          id: "APPROVAL",
          label: "审批节点",
          icon: <Publish fontSize="small" />,
        },
      ]}
      canUseQuickAction={Boolean(data.canUseQuickAction)}
      onOpenQuickMenu={(direction) => data.onOpenQuickMenu?.(direction)}
      onQuickAdd={(direction) => data.onQuickAdd?.(direction)}
    />
  );
}
const nodeTypes = { formProcessNode: FormProcessNode };

function EntryPermissionGroupEditor({
  config,
  editable,
  onChange,
}: {
  config?: Config;
  editable: boolean;
  onChange: (patch: Partial<Config>) => void;
}) {
  const rules: PermissionGroupRule[] = config?.permissionGroupRules?.length
    ? config.permissionGroupRules
    : (config?.permissionGroups ?? []).map((group) => ({
        group,
      }));
  const displayRules: PermissionGroupRule[] = rules.length
    ? rules
    : [];
  const updateRules = (next: PermissionGroupRule[]) =>
    onChange({
      permissionGroupRules: next,
      permissionGroups: next.map((rule) => rule.group.trim()).filter(Boolean),
      conflictPolicy: "READ_ONLY_FIRST",
    });
  return (
    <Box sx={{ border: "1px solid #e4e7ed", borderRadius: 1, p: 1.25 }}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mb: 1 }}
      >
        <Typography variant="body2" fontWeight={600}>
          填报权限组
        </Typography>
        <Stack direction="row" spacing={0.5}>
          <Button
            size="small"
            variant="text"
            startIcon={<Add />}
            onClick={() =>
              updateRules([
                ...rules,
                {
                  id: `permission-group-${Date.now()}-${rules.length}`,
                  group: "",
                  defaultPermission: "EDIT",
                },
              ])
            }
            disabled={!editable}
          >
            添加
          </Button>
        </Stack>
      </Stack>
      <Typography
        variant="caption"
        color="text.secondary"
        noWrap
        sx={{ display: "block", overflow: "hidden", textOverflow: "ellipsis" }}
      >
        每组选择填报主体并设置默认权限；同一人员命中多个主体时，只读优先。
      </Typography>
      <Stack spacing={1} sx={{ mt: 1 }}>
        {displayRules.map((rule, index) => (
          <Box
            key={`${index}-${rule.group}`}
            sx={{
              p: 1.25,
              bgcolor: "#f8fafc",
              border: "1px solid #eef1f5",
              borderRadius: 1,
            }}
          >
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              sx={{ mb: 0.75, minHeight: 28 }}
            >
              <Typography variant="caption" fontWeight={600} color="text.secondary">
                填报组 {index + 1}
              </Typography>
              {editable && rules.length > 0 ? (
                <Tooltip title="删除权限组" arrow>
                  <IconButton
                    size="small"
                    aria-label={`删除填报权限组 ${index + 1}`}
                    onClick={() =>
                      updateRules(rules.filter((_, i) => i !== index))
                    }
                    sx={{
                      width: 28,
                      height: 28,
                      color: "#909399",
                      '&:hover': { color: "#d4380d", bgcolor: "#fff1f0" },
                    }}
                  >
                    <Delete fontSize="small" />
                  </IconButton>
                </Tooltip>
              ) : null}
            </Stack>
            <SubjectSelector
              value={rule.subjects ?? parseSubjectRefs(rule.group)}
              disabled={!editable}
              label="填报主体"
              onChange={(subjects) =>
                updateRules(
                  displayRules.map((item, i) =>
                    i === index
                      ? { ...item, subjects, group: serializeSubjectRefs(subjects) }
                      : item,
                  ),
                )
              }
            />
            <FormControl size="small" fullWidth sx={{ mt: 0.75 }}>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
                默认权限
              </Typography>
              <Select
                value={permissionSettings(rule).defaultPermission}
                disabled={!editable}
                onChange={(event) =>
                  updateRules(
                    displayRules.map((item, i) =>
                      i === index
                        ? {
                            ...item,
                            defaultPermission: event.target.value as PermissionMode,
                          }
                        : item,
                    ),
                  )
                }
              >
                <MenuItem value="EDIT">全部可编辑</MenuItem>
                <MenuItem value="READ_ONLY">全部只读</MenuItem>
              </Select>
            </FormControl>
          </Box>
        ))}
        {displayRules.length === 0 ? (
          <Typography
            variant="caption"
            color="text.secondary"
            noWrap
            sx={{ display: "block", overflow: "hidden", textOverflow: "ellipsis" }}
          >
            未配置填报权限组时，所有人都可以填报；如需限制，再点击“添加”设置主体。
          </Typography>
        ) : null}
      </Stack>
    </Box>
  );
}

export default function FormProcessEditor() {
  const { id = "" } = useParams();
  const processId = id as FormProcessId;
  const navigate = useNavigate();
  const { showMessage } = useSnackbar();
  const queryClient = useQueryClient();
  const [selectedVersionId, setSelectedVersionId] =
    useState<FormProcessId | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedPanelTab, setSelectedPanelTab] = useState<"property" | "buttons">("property");
  const [showMiniMap, setShowMiniMap] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmation, setConfirmation] = useState<
    "close" | "switch" | "publish" | null
  >(null);
  const [pendingVersionId, setPendingVersionId] =
    useState<FormProcessId | null>(null);
  const [menu, setMenu] = useState<{
    nodeId: string;
    direction: FlowDirection;
  } | null>(null);
  const [nodes, setNodes, onNodesChange] =
    useNodesState<FlowNode>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;
  const undoRef = useRef<Graph[]>([]);
  const redoRef = useRef<Graph[]>([]);
  const skipGraphResetRef = useRef<{
    id: string;
    nodesJson?: string | null;
    edgesJson?: string | null;
  } | null>(null);
  const dragRef = useRef<Graph | null>(null);
  const initialVersionAttempted = useRef(false);
  const [history, setHistory] = useState({ undo: 0, redo: 0 });
  const definition = useQuery({
    queryKey: ["form-process", processId],
    queryFn: async () =>
      (await getFormProcess(processId)).data.data as {
        name: string;
        code?: string | null;
      },
  });
  const versions = useQuery({
    queryKey: ["form-process-versions", processId],
    queryFn: async () =>
      (await getFormProcessVersions(processId)).data.data as Version[],
  });
  const summary = useMemo(() => {
    const list = versions.data ?? [];
    return (
      list.find((item) => item.status === "DRAFT") ??
      list.find((item) => item.isCurrent) ??
      list[0] ??
      null
    );
  }, [versions.data]);
  const selectedSummary =
    (versions.data ?? []).find(
      (item) => String(item.id) === String(selectedVersionId),
    ) ?? summary;
  const versionQuery = useQuery({
    queryKey: ["form-process-version", processId, selectedSummary?.id],
    enabled: Boolean(selectedSummary?.id),
    queryFn: async () =>
      (await getFormProcessVersion(processId, selectedSummary!.id)).data
        .data as Version,
  });
  const selectedVersion = versionQuery.data ?? selectedSummary;
  const editable = selectedVersion?.status === "DRAFT";
  useEffect(() => {
    if (
      versions.isSuccess &&
      !(versions.data ?? []).length &&
      !initialVersionAttempted.current
    ) {
      initialVersionAttempted.current = true;
      createFormProcessVersion(processId)
        .then(() =>
          queryClient.invalidateQueries({
            queryKey: ["form-process-versions", processId],
          }),
        )
        .catch(() => showMessage("初始化草稿失败", "error"));
    }
  }, [versions.isSuccess, versions.data, processId, queryClient, showMessage]);
  useEffect(() => {
    if (!selectedVersion) return;
    const skipReset = skipGraphResetRef.current;
    if (skipReset) {
      skipGraphResetRef.current = null;
      if (
        String(skipReset.id) === String(selectedVersion.id) &&
        skipReset.nodesJson === selectedVersion.nodesJson &&
        skipReset.edgesJson === selectedVersion.edgesJson
      )
        return;
    }
    const loadedNodes = parse<FlowNode[]>(
      selectedVersion.nodesJson,
      initialNodes,
    );
    setNodes(loadedNodes);
    setEdges(parse<Edge[]>(selectedVersion.edgesJson, []));
    // 版本数据刷新时保持仍存在的选中节点，保存草稿不打断当前配置。
    setSelectedNodeId((current) =>
      current && loadedNodes.some((node) => node.id === current)
        ? current
        : "start",
    );
    setDirty(false);
    undoRef.current = [];
    redoRef.current = [];
    setHistory({ undo: 0, redo: 0 });
  }, [
    selectedVersion?.id,
    selectedVersion?.nodesJson,
    selectedVersion?.edgesJson,
    setNodes,
    setEdges,
  ]);
  const graph = (): Graph => ({
    nodes: clone(nodesRef.current),
    edges: clone(edgesRef.current),
  });
  const record = (before: Graph) => {
    undoRef.current = [...undoRef.current.slice(-49), clone(before)];
    redoRef.current = [];
    setHistory({ undo: undoRef.current.length, redo: 0 });
  };
  const apply = (next: Graph, before?: Graph) => {
    if (before) record(before);
    setNodes(clone(next.nodes));
    setEdges(clone(next.edges));
    setDirty(true);
  };
  const undo = () => {
    if (!editable || !undoRef.current.length) return;
    const previous = undoRef.current.pop()!;
    redoRef.current.push(graph());
    apply(previous);
    setHistory({ undo: undoRef.current.length, redo: redoRef.current.length });
  };
  const redo = () => {
    if (!editable || !redoRef.current.length) return;
    const next = redoRef.current.pop()!;
    undoRef.current.push(graph());
    apply(next);
    setHistory({ undo: undoRef.current.length, redo: redoRef.current.length });
  };
  const updateNodeData = (
    nodeId: string,
    patch: Partial<NodeData>,
    configPatch?: Partial<Config>,
  ) => {
    if (!editable) return;
    const before = graph();
    const next = graph();
    next.nodes = next.nodes.map((node) =>
      node.id === nodeId
        ? {
            ...node,
            data: {
              ...node.data,
              ...patch,
              config: { ...node.data.config, ...configPatch },
            },
          }
        : node,
    );
    apply(next, before);
  };
  const addApproval = (
    sourceId?: string,
    direction: FlowDirection = "bottom",
  ) => {
    if (!editable) return;
    const before = graph();
    const source = before.nodes.find((node) => node.id === sourceId);
    const id = `approval-${Date.now()}`;
    const position = source
      ? {
          x:
            source.position.x +
            (direction === "right" ? 190 : direction === "left" ? -190 : 0),
          y:
            source.position.y +
            (direction === "bottom" ? 130 : direction === "top" ? -130 : 0),
        }
      : { x: 360, y: 250 };
    const node: FlowNode = {
      id,
      type: "formProcessNode",
      position,
      data: {
        label: "审批",
        kind: "APPROVAL",
        config: {
          approvers: "",
          defaultPermission: "EDIT",
          returnToEntry: true,
          buttons: defaultWorkflowButtons("APPROVAL"),
          buttonEvents: [],
          guardMode: "BLOCK_ON_INVALID",
        },
      },
    };
    const next: Graph = {
      nodes: [...before.nodes, node],
      edges: [...before.edges],
    };
    if (source)
      next.edges = addEdge(
        {
          id:
            direction === "top" ? `${id}-${source.id}` : `${source.id}-${id}`,
          source: direction === "top" ? id : source.id,
          sourceHandle:
            direction === "top" ? "source-bottom" : `source-${direction}`,
          target: direction === "top" ? source.id : id,
          targetHandle:
            direction === "top"
              ? "target-top"
              : `target-${oppositeFlowDirection[direction]}`,
          type: "smoothstep",
          markerEnd: { type: MarkerType.ArrowClosed, color: "#8a97a6" },
        },
        next.edges,
      );
    apply(next, before);
    setSelectedNodeId(id);
    setMenu(null);
  };
  const connectNearby = (sourceId: string, direction: FlowDirection) => {
    const before = graph();
    const source = before.nodes.find((node) => node.id === sourceId);
    if (!editable || !source) return false;
    const stamp = Date.now();
    if (direction === "top") {
      // 上箭头表示“接入上方节点”：上方节点 → 当前节点。
      // 若上方节点已有后继，则把当前节点插入两者之间，保持线性流程不断链。
      if (before.edges.some((edge) => edge.target === sourceId)) return false;
      const predecessor = findNearbyFlowNode({
        sourceNode: source,
        nodes: before.nodes,
        direction,
        getSize: formProcessNodeSize,
        isCandidate: (node) =>
          node.data.kind !== "END" &&
          !before.edges.some(
            (edge) => edge.source === node.id && edge.target === sourceId,
          ),
      });
      if (!predecessor) return false;
      const outgoing = before.edges.find(
        (edge) => edge.source === predecessor.id,
      );
      if (outgoing && before.edges.some((edge) => edge.source === sourceId))
        return false;
      const next: Graph = {
        nodes: before.nodes,
        edges: outgoing
          ? before.edges.filter((edge) => edge.id !== outgoing.id)
          : [...before.edges],
      };
      next.edges = addEdge(
        {
          id: `${predecessor.id}-${source.id}-${stamp}`,
          source: predecessor.id,
          sourceHandle: outgoing?.sourceHandle ?? "source-bottom",
          target: source.id,
          targetHandle: "target-top",
          type: "smoothstep",
          markerEnd: { type: MarkerType.ArrowClosed, color: "#8a97a6" },
        },
        next.edges,
      );
      if (outgoing)
        next.edges = addEdge(
          {
            id: `${source.id}-${outgoing.target}-${stamp}`,
            source: source.id,
            sourceHandle: "source-bottom",
            target: outgoing.target,
            targetHandle: outgoing.targetHandle ?? "target-top",
            type: "smoothstep",
            markerEnd: { type: MarkerType.ArrowClosed, color: "#8a97a6" },
          },
          next.edges,
        );
      apply(next, before);
      setMenu(null);
      return true;
    }
    if (before.edges.some((edge) => edge.source === sourceId)) return false;
    const target = findNearbyFlowNode({
      sourceNode: source,
      nodes: before.nodes,
      direction,
      getSize: formProcessNodeSize,
      isCandidate: (node) =>
        node.data.kind !== "START" &&
        !before.edges.some(
          (edge) =>
            (direction !== "bottom" && edge.target === node.id) ||
            (edge.source === node.id && edge.target === sourceId),
        ),
    });
    if (!target) return false;
    // 下箭头且下方节点已有前驱时，把当前节点插入两者之间。
    const incoming =
      direction === "bottom"
        ? before.edges.find((edge) => edge.target === target.id)
        : undefined;
    if (incoming && before.edges.some((edge) => edge.target === sourceId))
      return false;
    const next: Graph = {
      nodes: before.nodes,
      edges: incoming
        ? before.edges.filter((edge) => edge.id !== incoming.id)
        : [...before.edges],
    };
    if (incoming)
      next.edges = addEdge(
        {
          id: `${incoming.source}-${source.id}-${stamp}`,
          source: incoming.source,
          sourceHandle: incoming.sourceHandle ?? "source-bottom",
          target: source.id,
          targetHandle: "target-top",
          type: "smoothstep",
          markerEnd: { type: MarkerType.ArrowClosed, color: "#8a97a6" },
        },
        next.edges,
      );
    next.edges = addEdge(
      {
        id: `${source.id}-${target.id}-${stamp}`,
        source: source.id,
        sourceHandle: incoming ? "source-bottom" : `source-${direction}`,
        target: target.id,
        targetHandle: incoming
          ? (incoming.targetHandle ?? "target-top")
          : `target-${oppositeFlowDirection[direction]}`,
        type: "smoothstep",
        markerEnd: { type: MarkerType.ArrowClosed, color: "#8a97a6" },
      },
      next.edges,
    );
    apply(next, before);
    setMenu(null);
    return true;
  };
  const addEdgeSafe = (connection: Connection) => {
    if (
      !editable ||
      !connection.source ||
      !connection.target ||
      connection.source === connection.target
    )
      return;
    const before = graph();
    if (
      before.edges.some(
        (edge) =>
          edge.source === connection.source ||
          edge.target === connection.target,
      )
    )
      return;
    apply(
      {
        nodes: before.nodes,
        edges: addEdge(
          {
            ...connection,
            id: `${connection.source}-${connection.target}-${Date.now()}`,
            type: "smoothstep",
            markerEnd: { type: MarkerType.ArrowClosed, color: "#8a97a6" },
          },
          before.edges,
        ),
      },
      before,
    );
  };
  const removeSelected = () => {
    if (!editable) return;
    if (
      selectedNodeId &&
      selectedNodeId !== "start" &&
      selectedNodeId !== "end"
    ) {
      const before = graph();
      apply(
        {
          nodes: before.nodes.filter((node) => node.id !== selectedNodeId),
          edges: before.edges.filter(
            (edge) =>
              edge.source !== selectedNodeId && edge.target !== selectedNodeId,
          ),
        },
        before,
      );
      setSelectedNodeId(null);
      setMenu(null);
      return;
    }
    if (selectedEdgeId) {
      const before = graph();
      apply(
        {
          nodes: before.nodes,
          edges: before.edges.filter((edge) => edge.id !== selectedEdgeId),
        },
        before,
      );
      setSelectedEdgeId(null);
    }
  };
  const handleCanvasKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    if (!editable) return;
    const target = event.target as HTMLElement;
    if (
      target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
    )
      return;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      removeSelected();
    }
  };
  const autoLayout = () => {
    if (!editable) return;
    const before = graph();
    const next = graph();
    const start = next.nodes.find((node) => node.data.kind === "START");
    const layoutCenterX = start
      ? start.position.x + formProcessNodeSize(start).width / 2
      : 408;
    next.nodes = [...next.nodes]
      .sort((a, b) =>
        a.id === "start"
          ? -1
          : b.id === "start"
            ? 1
            : a.id === "end"
              ? 1
              : b.id === "end"
                ? -1
                : a.position.y - b.position.y,
      )
      .map((node, index) => ({
        ...node,
        position: {
          x: layoutCenterX - formProcessNodeSize(node).width / 2,
          y: 70 + index * 125,
        },
      }));
    apply(next, before);
  };
  const save = useMutation({
    mutationFn: () =>
      saveFormProcessGraph(processId, selectedVersion!.id, {
        nodes: serializeNodesForSave(nodes),
        edges,
      }),
    onSuccess: (response) => {
      // 保存后只同步缓存、提示成功，不重置画布：保留当前选中节点、
      // 面板状态和撤销历史，便于用户继续配置。
      const saved = response.data.data as Version;
      skipGraphResetRef.current = {
        id: String(saved.id),
        nodesJson: saved.nodesJson,
        edgesJson: saved.edgesJson,
      };
      queryClient.setQueryData<Version>(
        ["form-process-version", processId, saved.id],
        saved,
      );
      setDirty(false);
      queryClient.invalidateQueries({
        queryKey: ["form-process-versions", processId],
      });
      showMessage("草稿已保存");
    },
    onError: (error) =>
      showMessage(error instanceof Error ? error.message : "保存失败", "error"),
  });
  const publish = useMutation({
    mutationFn: async () => {
      await saveFormProcessGraph(processId, selectedVersion!.id, {
        nodes: serializeNodesForSave(nodes),
        edges,
      });
      return publishFormProcessVersion(processId, selectedVersion!.id);
    },
    onSuccess: () => {
      setDirty(false);
      setConfirmation(null);
      queryClient.invalidateQueries({
        queryKey: ["form-process-versions", processId],
      });
      queryClient.invalidateQueries({
        queryKey: ["form-process-version", processId],
      });
      showMessage("表单流程已发布");
    },
    onError: (error) =>
      showMessage(error instanceof Error ? error.message : "发布失败", "error"),
  });
  const close = () => {
    if (dirty) setConfirmation("close");
    else navigate("/workflow/form-processes");
  };
  const selectVersion = (versionId: FormProcessId) => {
    skipGraphResetRef.current = null;
    if (String(versionId) === String(selectedVersion?.id)) return;
    if (dirty) {
      setPendingVersionId(versionId);
      setConfirmation("switch");
    } else setSelectedVersionId(versionId);
  };
  const selected = nodes.find((node) => node.id === selectedNodeId) ?? null;
  useEffect(() => {
    if (selected?.data.kind === "END" && selectedPanelTab !== "property") {
      setSelectedPanelTab("property");
    }
  }, [selected?.data.kind, selectedPanelTab]);
  const decoratedNodes = nodes.map((node) => {
    const hasOutgoing = edges.some((edge) => edge.source === node.id);
    const hasIncoming = edges.some((edge) => edge.target === node.id);
    const quickDirections: FlowDirection[] =
      node.data.kind === "START"
        ? hasOutgoing
          ? []
          : ["bottom"]
        : node.data.kind === "APPROVAL"
          ? [
              ...(hasIncoming ? [] : (["top"] as FlowDirection[])),
              ...(hasOutgoing
                ? []
                : (["right", "bottom", "left"] as FlowDirection[])),
            ]
          : [];
    return {
      ...node,
      data: {
        ...node.data,
        editable,
        selected: node.id === selectedNodeId,
        quickMenuDirection: menu?.nodeId === node.id ? menu.direction : null,
        quickDirections,
        canUseQuickAction: editable && quickDirections.length > 0,
        onOpenQuickMenu: (direction: FlowDirection) => {
          if (!connectNearby(node.id, direction))
            setMenu({ nodeId: node.id, direction });
        },
        onQuickAdd: (direction: FlowDirection) =>
          addApproval(node.id, direction),
      },
    };
  }) as FlowNode[];
  const confirmationMessage =
    confirmation === "publish"
      ? "发布后当前版本只读，系统会自动创建下一草稿版本。确认发布吗？"
      : confirmation === "switch"
        ? "当前草稿尚有未保存的修改，确认放弃修改并切换流程版本吗？"
        : "当前草稿尚有未保存的修改，确认不保存并关闭吗？";
  return (
    <FullScreenFlowDesigner
      title="配置表单流程"
      subject={`${definition.data?.name || "表单流程"}${definition.data?.code ? ` / ${definition.data.code}` : ""}`}
      headerContent={
        <FlowVersionPicker
          currentVersion={
            (versions.data ?? []).find((item) => item.isCurrent) ?? null
          }
          draftVersion={
            (versions.data ?? []).find((item) => item.status === "DRAFT") ??
            null
          }
          historicalVersions={(versions.data ?? []).filter(
            (item) => item.status !== "DRAFT" && !item.isCurrent,
          )}
          selectedVersion={selectedVersion}
          onSelect={selectVersion}
        />
      }
      onClose={close}
      actions={
        editable ? (
          <>
            <Button
              size="small"
              variant="outlined"
              startIcon={<Save />}
              onClick={() => save.mutate()}
              disabled={!dirty || save.isPending}
            >
              保存草稿
            </Button>
            <Button
              size="small"
              variant="contained"
              startIcon={<Publish />}
              onClick={() => setConfirmation("publish")}
              disabled={publish.isPending}
            >
              发布
            </Button>
          </>
        ) : (
          <Chip size="small" label="已发布版本只读" color="success" />
        )
      }
      overlays={
        <ConfirmDialog
          open={Boolean(confirmation)}
          title={
            confirmation === "publish"
              ? "发布表单流程"
              : confirmation === "switch"
                ? "切换流程版本"
                : "关闭流程配置"
          }
          message={confirmationMessage}
          confirmText={
            confirmation === "publish"
              ? "发布"
              : confirmation === "switch"
                ? "放弃修改并切换"
                : "不保存并关闭"
          }
          destructive={confirmation !== "publish"}
          loading={publish.isPending}
          onCancel={() => {
            setConfirmation(null);
            setPendingVersionId(null);
          }}
          onConfirm={() => {
            if (confirmation === "publish") publish.mutate();
            else if (confirmation === "switch" && pendingVersionId !== null) {
              setSelectedVersionId(pendingVersionId);
              setPendingVersionId(null);
              setDirty(false);
              setConfirmation(null);
            } else navigate("/workflow/form-processes");
          }}
        />
      }
    >
      <Box
        sx={{
          position: "relative",
          display: "flex",
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          width: "100%",
          overflow: "hidden",
        }}
      >
        <Paper
          variant="outlined"
          sx={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              lg: "minmax(0, 1fr) clamp(400px, 30vw, 480px)",
            },
            overflow: "hidden",
            borderColor: "#e4e7ed",
          }}
        >
          <ReactFlowProvider>
            <Box
              tabIndex={0}
              onKeyDown={handleCanvasKeyDown}
              sx={{ position: "relative", minWidth: 0, outline: "none" }}
            >
              <Stack
                direction="row"
                spacing={0.5}
                sx={{
                  position: "absolute",
                  zIndex: 5,
                  top: 12,
                  left: { xs: 12, md: 16 },
                  maxWidth: "calc(100% - 28px)",
                }}
              >
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<Add />}
                  onClick={() => addApproval()}
                  disabled={!editable}
                >
                  审批节点
                </Button>
              </Stack>
              <ReactFlow
                nodes={decoratedNodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={(changes) => {
                  if (!editable) return;
                  onNodesChange(changes);
                  if (changes.some((change) => change.type !== "select"))
                    setDirty(true);
                }}
                onEdgesChange={(changes) => {
                  if (!editable) return;
                  onEdgesChange(changes);
                  if (changes.some((change) => change.type !== "select"))
                    setDirty(true);
                }}
                onConnect={addEdgeSafe}
                onNodeClick={(_, node) => {
                  setSelectedNodeId(node.id);
                  setSelectedEdgeId(null);
                  setMenu(null);
                }}
                onEdgeClick={(_, edge) => {
                  setSelectedEdgeId(edge.id);
                  setSelectedNodeId(null);
                  setMenu(null);
                }}
                onPaneClick={() => {
                  setSelectedEdgeId(null);
                  setMenu(null);
                }}
                onNodeDragStart={() => {
                  dragRef.current = graph();
                }}
                onNodeDragStop={() => {
                  if (dragRef.current) {
                    record(dragRef.current);
                    dragRef.current = null;
                    setDirty(true);
                  }
                }}
                nodesConnectable={editable}
                nodesDraggable={editable}
                deleteKeyCode={null}
                defaultEdgeOptions={{
                  type: "smoothstep",
                  markerEnd: { type: MarkerType.ArrowClosed, color: "#8a97a6" },
                }}
                fitView
                fitViewOptions={{ padding: 0.35 }}
                proOptions={{ hideAttribution: true }}
              >
                <Background color="#dfe4ea" gap={20} size={1} />
                <Controls position="bottom-left">
                  <ControlButton
                    aria-label="撤销"
                    onClick={undo}
                    disabled={!history.undo}
                  >
                    <Undo fontSize="small" />
                  </ControlButton>
                  <ControlButton
                    aria-label="重做"
                    onClick={redo}
                    disabled={!history.redo}
                  >
                    <Redo fontSize="small" />
                  </ControlButton>
                  {editable ? (
                    <ControlButton
                      aria-label="一键整理布局"
                      onClick={autoLayout}
                    >
                      <AutoFixHigh fontSize="small" />
                    </ControlButton>
                  ) : null}
                  <Tooltip
                    title={showMiniMap ? "隐藏缩略地图" : "显示缩略地图"}
                    placement="right"
                    arrow
                  >
                    <ControlButton
                      aria-label={showMiniMap ? "隐藏缩略地图" : "显示缩略地图"}
                      onClick={() => setShowMiniMap((value) => !value)}
                    >
                      <MapOutlined fontSize="small" />
                    </ControlButton>
                  </Tooltip>
                </Controls>
                {showMiniMap ? <FlowMiniMap /> : null}
              </ReactFlow>
            </Box>
          </ReactFlowProvider>
          <Box
            sx={{
              borderLeft: { lg: "1px solid #e4e7ed" },
              borderTop: { xs: "1px solid #e4e7ed", lg: 0 },
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              bgcolor: "#fff",
              minHeight: 0,
            }}
          >
            {selected ? (
              <>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                  sx={{
                    px: 2,
                    py: 1.5,
                    minHeight: 58,
                    borderBottom: "1px solid #e4e7ed",
                    flexShrink: 0,
                  }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle1" fontWeight={700} noWrap>
                      节点设置
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {selected.data.label}
                    </Typography>
                  </Box>
                  {editable && selected.data.kind === "APPROVAL" ? (
                    <Tooltip title="删除节点">
                      <IconButton
                        size="small"
                        aria-label="删除节点"
                        color="error"
                        onClick={removeSelected}
                      >
                        <Delete fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  ) : null}
                </Stack>
                <Tabs
                  value={selectedPanelTab}
                  onChange={(_, value) => setSelectedPanelTab(value)}
                  variant="fullWidth"
                  sx={{
                    minHeight: 46,
                    borderBottom: "1px solid #e4e7ed",
                    flexShrink: 0,
                    "& .MuiTab-root": {
                      minHeight: 46,
                      textTransform: "none",
                      fontWeight: 600,
                      color: "#606266",
                    },
                    "& .Mui-selected": { color: "#1677c8" },
                    "& .MuiTabs-indicator": { height: 2 },
                  }}
                >
                  <Tab value="property" label="属性" />
                  {selected.data.kind !== "END" ? <Tab value="buttons" label="节点按钮" /> : null}
                </Tabs>
                {selectedPanelTab === "buttons" && selected.data.kind !== "END" ? (
                  <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", p: { xs: 1.5, md: 2 } }}>
                    <WorkflowActionConfig
                      kind={selected.data.kind === "APPROVAL" ? "APPROVAL" : "START"}
                      buttons={selected.data.config?.buttons}
                      events={selected.data.config?.buttonEvents}
                      guardMode={selected.data.config?.guardMode}
                      editable={editable}
                      onChange={(patch) => updateNodeData(selected.id, {}, patch)}
                    />
                  </Box>
                ) : null}
                {selectedPanelTab === "property" ? (
                <Stack spacing={2} sx={{ flex: 1, minHeight: 0, overflow: "auto", p: { xs: 1.5, md: 2 } }}>
                  <TextField
                    size="small"
                    label="节点名称"
                    value={selected.data.label}
                    disabled={!editable || selected.data.kind !== "APPROVAL"}
                    onChange={(event) =>
                      updateNodeData(selected.id, { label: event.target.value })
                    }
                  />
                  {selected.data.kind === "START" ? (
                    <>
                  <EntryPermissionGroupEditor
                        config={selected.data.config}
                        editable={Boolean(editable)}
                        onChange={(patch) =>
                      updateNodeData(selected.id, {}, patch)
                        }
                      />
                    </>
                  ) : null}
                  {selected.data.kind === "APPROVAL" ? (
                    <>
                      <SubjectSelector
                        value={selected.data.config?.approverSubjects ?? parseSubjectRefs(selected.data.config?.approvers)}
                        disabled={!editable}
                        label="审批主体"
                        placeholder="请选择用户、部门或角色"
                        onChange={(subjects) =>
                          updateNodeData(selected.id, {}, {
                            approverSubjects: subjects,
                            approvers: serializeSubjectRefs(subjects),
                          })
                        }
                      />
                      <Typography variant="caption" color="text.secondary" sx={{ mt: -1 }}>
                        未配置审批主体时，所有人都可以审批。
                      </Typography>
                      <FormControl size="small" fullWidth>
                        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
                          默认权限
                        </Typography>
                        <Select
                          value={permissionSettings(selected.data.config).defaultPermission}
                          disabled={!editable}
                          onChange={(event) =>
                            updateNodeData(
                              selected.id,
                              {},
                              defaultPermissionPatch(event.target.value as PermissionMode),
                            )
                          }
                        >
                          <MenuItem value="EDIT">全部可编辑</MenuItem>
                          <MenuItem value="READ_ONLY">全部只读</MenuItem>
                        </Select>
                      </FormControl>
                      <Typography variant="caption" color="text.secondary">
                        具体字段例外在作业流程的表单填写节点绑定表单后配置。
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        多人候选时任一人完成即可；退回固定回到填报阶段。
                      </Typography>
                    </>
                  ) : null}
                </Stack>
                ) : null}
              </>
            ) : (
              <Box sx={{ p: 3, color: "#909399", flex: 1, display: "grid", placeItems: "center", textAlign: "center" }}>
                <Box>
                <Typography
                  variant="subtitle2"
                  sx={{ color: "#606266", mb: 0.5 }}
                >
                  节点设置
                </Typography>
                <Typography variant="body2">
                  选择画布中的节点查看配置
                </Typography>
                </Box>
              </Box>
            )}
          </Box>
        </Paper>
      </Box>
    </FullScreenFlowDesigner>
  );
}
