import {
  Fragment,
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import {
  AccountTreeOutlined,
  Add,
  ArrowDownwardOutlined,
  CheckOutlined,
  ChevronRight,
  Close,
  DeleteOutline,
  ExpandMore,
  FactCheckOutlined,
  FolderOutlined,
  MapOutlined,
  NotificationsOutlined,
  PublishOutlined,
  SaveOutlined,
  SchemaOutlined,
  AutoFixHighOutlined,
  RedoOutlined,
  Search,
  UndoOutlined,
  VisibilityOutlined,
} from "@mui/icons-material";
import {
  addEdge,
  Background,
  ControlButton,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Box,
  Alert,
  Autocomplete,
  Button,
  Chip,
  ClickAwayListener,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Popper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AppDialog from "@/components/AppDialog";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useSnackbar } from "@/components/SnackbarProvider";
import {
  copyWorkTemplateVersionToDraft,
  createWorkTemplateVersion,
  getWorkTemplate,
  getWorkTemplateVersion,
  getWorkTemplateVersions,
  getWorkFormProcessReferences,
  publishWorkTemplateVersion,
  saveWorkTemplateVersionGraph,
  type WorkflowId,
  type WorkFormProcessReferenceStatus,
} from "@/api/workflow-work";
import {
  getFormTemplateVersion,
  getFormTemplates,
  type TemplateModelingRecord,
  type TemplateVersionRecord,
} from "@/api/template-modeling";
import { parseReactTemplateDesignerDocument } from "@/pages/master-data/template-designer-react/utils/document";
import {
  FormCanvasPreview,
  type PreviewFieldPermission,
} from "@/pages/master-data/DhrTemplateWorkspaceDialog";
import {
  parseSubjectRefs,
  type SubjectRef,
} from "@/components/identity/SubjectSelector";
import { ConditionRuleDialog } from "@/components/condition-builder/ConditionRuleDialog";
import {
  countConditionClauses,
  summarizeConditionExpression,
  type ConditionExpression,
} from "@/components/condition-builder/ConditionRuleBuilder";
import {
  WORK_CONDITION_ADAPTER,
  WORK_CONDITION_FIELD_SNAPSHOT,
} from "./workConditionAdapter";
import {
  getFormProcessVersion,
  getFormProcessVersions,
  listFormProcesses,
} from "@/api/form-processes";
import {
  FlowVersionPicker,
  FlowMiniMap,
  FullScreenFlowDesigner,
  FlowQuickTooltip,
  StandardFlowNode,
  findNearbyFlowNode,
  oppositeFlowDirection,
  type FlowDirection,
} from "@/components/flow-designer/FlowDesigner";

type Version = {
  id: WorkflowId;
  versionNumber: number;
  status: "DRAFT" | "PUBLISHED" | string;
  isCurrent: boolean;
  publishedAt?: string | null;
  nodesJson?: string | null;
  edgesJson?: string | null;
  virtual?: boolean;
};
type WorkNodeKind =
  | "START"
  | "END"
  | "FORM"
  | "NOTIFICATION"
  | "CONFIRMATION"
  | "CONDITION";
type ConditionBranch = {
  id: string;
  name: string;
  conditionRule: ConditionExpression | null;
  fieldCatalogVersion?: string;
  fieldSnapshot?: Record<string, string>;
};
type WorkNodeData = {
  label: string;
  kind?: WorkNodeKind;
  validationError?: string;
  config?: {
    formTemplateVersionId?: string;
    formTemplateName?: string;
    formProcessVersionId?: string;
    formProcessName?: string;
    fieldMappings?: Record<string, string>;
    fieldPermissions?: Record<
      string,
      {
        defaultPermission?: "EDIT" | "READ_ONLY";
        editableFieldIds?: string[];
        readOnlyFieldIds?: string[];
      }
    >;
    eventBindings?: Record<string, { fieldId?: string }>;
    recipients?: string;
    message?: string;
    confirmationInstruction?: string;
    conditionBranches?: ConditionBranch[];
    conditionDefaultBranch?: { id: string; name: "否则" };
  };
};
type FlowNode = Node<WorkNodeData>;
type FlowGraph = { nodes: FlowNode[]; edges: Edge[] };
type FlowValidationResult = {
  valid: boolean;
  message: string | null;
  nodeErrors: Record<string, string>;
};
type FlowWorkspaceHandle = {
  graph: () => FlowGraph;
  deleteNode: (nodeId: string) => void;
  markSaved: () => void;
  selection: () => string | null;
  outdatedFormProcessReferenceCount: () => number;
  validateForPublish: () => boolean;
  refreshPublishValidation: () => Promise<{
    directoryLoaded: boolean;
    formReferenceError: boolean;
  }>;
  markFormReferenceErrors: () => void;
};

type WorkFormOption = {
  id: string;
  templateId: string;
  code?: string | null;
  name: string;
  version: string;
  categoryName?: string | null;
  status: string;
};

type WorkFormProcessOption = {
  id: string;
  versionId: string;
  name: string;
  versionNumber: number;
  isCurrent?: boolean;
};
type FormFieldOption = {
  id: string;
  code: string;
  name: string;
  type?: string;
};
type ProcessPermissionSubject = {
  id: string;
  label: string;
  members: string;
  defaultPermission: "EDIT" | "READ_ONLY";
  stage: "填报" | "审批";
  openAccess?: boolean;
};
type ProcessBuiltinEvent = {
  key: string;
  nodeId: string;
  nodeLabel: string;
  event: "BEFORE" | "AFTER";
  action: "SAVE" | "SUBMIT" | "APPROVE" | "RETURN";
  builtin: "FILL_SIGN_FIELD";
};

function pruneFieldPermissions(
  permissions: NonNullable<WorkNodeData["config"]>["fieldPermissions"],
  subjects: ProcessPermissionSubject[],
  fields: FormFieldOption[],
) {
  if (!permissions) return {};
  const subjectIds = new Set(subjects.map((subject) => subject.id));
  const fieldIds = new Set(fields.map((field) => field.id));
  return Object.fromEntries(
    Object.entries(permissions)
      .filter(([subjectId]) => subjectIds.has(subjectId))
      .map(([subjectId, rule]) => [
        subjectId,
        {
          ...rule,
          editableFieldIds: (rule.editableFieldIds ?? []).filter((id) =>
            fieldIds.has(id),
          ),
          readOnlyFieldIds: (rule.readOnlyFieldIds ?? []).filter((id) =>
            fieldIds.has(id),
          ),
        },
      ]),
  );
}

function pruneEventBindings(
  bindings: NonNullable<WorkNodeData["config"]>["eventBindings"],
  events: ProcessBuiltinEvent[],
  fields: FormFieldOption[],
) {
  if (!bindings) return {};
  const eventKeys = new Set(events.map((event) => event.key));
  const fieldIds = new Set(fields.map((field) => field.id));
  return Object.fromEntries(
    Object.entries(bindings)
      .filter(
        ([eventKey, binding]) =>
          eventKeys.has(eventKey) &&
          (!binding?.fieldId || fieldIds.has(binding.fieldId)),
      )
      .map(([eventKey, binding]) => [
        eventKey,
        binding?.fieldId ? { fieldId: binding.fieldId } : {},
      ]),
  );
}

function processPermissionSubjects(
  version: { nodesJson?: string | null } | null | undefined,
): ProcessPermissionSubject[] {
  if (!version?.nodesJson) return [];
  try {
    const nodes = JSON.parse(version.nodesJson) as Array<{
      id?: string;
      data?: {
        kind?: string;
        label?: string;
        config?: {
          permissionGroups?: string[];
          permissionGroupRules?: Array<{
            id?: string;
            group?: string;
            subjects?: SubjectRef[];
            defaultPermission?: "EDIT" | "READ_ONLY";
          }>;
          approvers?: string;
          approverSubjects?: SubjectRef[];
          defaultPermission?: "EDIT" | "READ_ONLY";
        };
      };
    }>;
    const subjects: ProcessPermissionSubject[] = [];
    nodes.forEach((node) => {
      const config = node.data?.config;
      if (node.data?.kind === "START") {
        const rules: Array<{
          id?: string;
          group?: string;
          subjects?: SubjectRef[];
          defaultPermission?: "EDIT" | "READ_ONLY";
        }> = config?.permissionGroupRules?.length
          ? config.permissionGroupRules
          : (config?.permissionGroups ?? []).map((group) => ({
              group,
              defaultPermission: "EDIT" as const,
            }));
        rules.forEach((rule, index) => {
          const refs = rule.subjects ?? parseSubjectRefs(rule.group);
          const validRefs = refs.filter((ref) => ref.type !== "LEGACY");
          if (validRefs.length)
            subjects.push({
              id: `start:${rule.id ?? `legacy-${index}`}`,
              label: `填报权限组 ${index + 1}`,
              members: validRefs
                .map(
                  (ref) =>
                    `${ref.nameSnapshot}${ref.type === "DEPARTMENT" ? (ref.departmentScope === "SELF_ONLY" ? "（本部门）" : "（含下级）") : ""}`,
                )
                .join("、"),
              defaultPermission: rule.defaultPermission ?? "EDIT",
              stage: "填报",
            });
        });
        if (!rules.length)
          subjects.push({
            id: "start:open",
            label: "填报权限组",
            members: "未配置主体，所有人可填报",
            defaultPermission: config?.defaultPermission ?? "EDIT",
            stage: "填报",
            openAccess: true,
          });
      }
      if (node.data?.kind === "APPROVAL") {
        const refs =
          config?.approverSubjects ?? parseSubjectRefs(config?.approvers);
        subjects.push({
          id: `approval:${node.id ?? subjects.length}`,
          label: String(node.data?.label ?? "审批节点"),
          members: refs.length
            ? refs
                .map(
                  (ref) =>
                    `${ref.nameSnapshot}${ref.type === "DEPARTMENT" ? (ref.departmentScope === "SELF_ONLY" ? "（本部门）" : "（含下级）") : ""}`,
                )
                .join("、")
            : "未配置审批主体，所有人可审批",
          defaultPermission: config?.defaultPermission ?? "EDIT",
          stage: "审批",
          openAccess: refs.length === 0,
        });
      }
    });
    return subjects;
  } catch {
    return [];
  }
}

function processBuiltinEvents(
  version: { nodesJson?: string | null } | null | undefined,
): ProcessBuiltinEvent[] {
  if (!version?.nodesJson) return [];
  try {
    const nodes = JSON.parse(version.nodesJson) as Array<{
      id?: string;
      data?: {
        label?: string;
        config?: {
          buttonEvents?: Array<{
            id?: string;
            event?: "BEFORE" | "AFTER";
            action?: ProcessBuiltinEvent["action"];
            builtin?: "FILL_SIGN_FIELD";
            signatureMethod?: "ACCOUNT_PASSWORD";
            enabled?: boolean;
          }>;
        };
      };
    }>;
    const events: ProcessBuiltinEvent[] = [];
    nodes.forEach((node) => {
      (node.data?.config?.buttonEvents ?? []).forEach((event, index) => {
        if (event.enabled === false) return;
        const id = String(event.id ?? `event-${index + 1}`).trim();
        const action = event.action;
        if (!id || !event.event || !action) return;
        const isSignature =
          (!event.builtin || event.builtin === "FILL_SIGN_FIELD") &&
          (!event.signatureMethod ||
            event.signatureMethod === "ACCOUNT_PASSWORD") &&
          ["SAVE", "SUBMIT", "APPROVE", "RETURN"].includes(action);
        if (
          !isSignature ||
          (event.builtin && event.builtin !== "FILL_SIGN_FIELD")
        )
          return;
        if (event.event !== "BEFORE") return;
        events.push({
          key: `${node.id ?? "node"}:${id}`,
          nodeId: String(node.id ?? "node"),
          nodeLabel: String(node.data?.label ?? "流程节点"),
          event: event.event,
          action,
          builtin: "FILL_SIGN_FIELD",
        });
      });
    });
    return events.filter((event) => event.builtin === "FILL_SIGN_FIELD");
  } catch {
    return [];
  }
}

function templateFields(
  version: TemplateVersionRecord | null | undefined,
): FormFieldOption[] {
  if (!version?.modelDesignJson) return [];
  try {
    const parsed = JSON.parse(version.modelDesignJson) as {
      payload?: { fields?: unknown[] };
      fields?: unknown[];
    };
    const fields = Array.isArray(parsed.payload?.fields)
      ? parsed.payload.fields
      : Array.isArray(parsed.fields)
        ? parsed.fields
        : [];
    return fields
      .map((field, index) => {
        const source = (
          field && typeof field === "object" ? field : {}
        ) as Record<string, unknown>;
        const id = String(source.id ?? source.code ?? `field-${index + 1}`);
        const code = String(source.code ?? id);
        const name = String(source.name ?? code);
        return {
          id,
          code,
          name,
          type: source.type ? String(source.type) : undefined,
        };
      })
      .filter((field) => field.id && field.name);
  } catch {
    return [];
  }
}

function isEffectiveFormVersion(status: string | null | undefined) {
  return (
    String(status ?? "")
      .trim()
      .toUpperCase() === "ACTIVE"
  );
}

const HISTORY_LIMIT = 50;

const nodeDimensions = {
  boundary: { width: 96, height: 52 },
  standard: { width: 148, height: 60 },
};

const FLOW_CENTER_X = 480;
const FLOW_START_CENTER_Y = 100;
const FLOW_EMPTY_END_CENTER_Y = 480;
const FLOW_LEVEL_GAP = 180;
// Keep the condition decision itself stable while letting the branch cards
// occupy a separate row underneath it. The outer node may grow to fit the row,
// but the decision body never changes width as branches are added.
const CONDITION_CORE_WIDTH = 260;
const CONDITION_CORE_HEIGHT = 92;
const CONDITION_BRANCH_CARD_WIDTH = 156;
const CONDITION_BRANCH_CARD_HEIGHT = 68;
const CONDITION_BRANCH_GAP = 14;
const CONDITION_BRANCH_TOP = CONDITION_CORE_HEIGHT + 16;
const CONDITION_BRANCH_BOTTOM_PADDING = 18;
const CONDITION_BRANCH_SIDE_PADDING = 16;
// These controls are rendered inside the branch-row container, so their
// vertical offsets are relative to the cards, not to the outer node.
const CONDITION_BRANCH_QUICK_ACTION_TOP = CONDITION_BRANCH_CARD_HEIGHT + 8;
// A condition outlet owns a vertical lane. Keep adjacent lanes wider than a
// branch card so branches remain visually and spatially independent.
const CONDITION_BRANCH_LANE_GAP =
  CONDITION_BRANCH_CARD_WIDTH + CONDITION_BRANCH_GAP;
const FLOW_EDGE_MARKER = { type: MarkerType.ArrowClosed, color: "#8a97a6" };
const FLOW_EDGE_DEFAULTS = { type: "smoothstep", markerEnd: FLOW_EDGE_MARKER };

function nodeSizeForKind(kind: WorkNodeKind | undefined) {
  return kind === "START" || kind === "END"
    ? nodeDimensions.boundary
    : kind === "CONDITION"
      ? { width: CONDITION_CORE_WIDTH, height: CONDITION_CORE_HEIGHT }
      : nodeDimensions.standard;
}

function conditionNodeWidth(outletCount: number) {
  const branchRowWidth =
    outletCount * CONDITION_BRANCH_CARD_WIDTH +
    Math.max(0, outletCount - 1) * CONDITION_BRANCH_GAP +
    CONDITION_BRANCH_SIDE_PADDING * 2;
  return Math.max(CONDITION_CORE_WIDTH, branchRowWidth);
}

function conditionBranchCenterOffset(index: number, total: number) {
  const width = conditionNodeWidth(total);
  const branchRowWidth =
    total * CONDITION_BRANCH_CARD_WIDTH +
    Math.max(0, total - 1) * CONDITION_BRANCH_GAP;
  const rowLeft = (width - branchRowWidth) / 2;
  return (
    rowLeft +
    index * (CONDITION_BRANCH_CARD_WIDTH + CONDITION_BRANCH_GAP) +
    CONDITION_BRANCH_CARD_WIDTH / 2
  );
}

function conditionBranchCenterX(node: FlowNode, index: number, total: number) {
  return node.position.x + conditionBranchCenterOffset(index, total);
}

function conditionNodeSize(config: WorkNodeData["config"] | undefined) {
  const outletCount = conditionBranchesForConfig(config).length + 1;
  return {
    width: conditionNodeWidth(outletCount),
    height:
      CONDITION_BRANCH_TOP +
      CONDITION_BRANCH_CARD_HEIGHT +
      CONDITION_BRANCH_BOTTOM_PADDING,
  };
}

function nodeSize(node: FlowNode) {
  if (node.data.kind === "CONDITION") {
    return conditionNodeSize(node.data.config);
  }
  return nodeSizeForKind(node.data.kind);
}

function dimensionsForKind(
  kind: WorkNodeKind | undefined,
  config?: WorkNodeData["config"],
) {
  return kind === "CONDITION"
    ? conditionNodeSize(config)
    : nodeSizeForKind(kind);
}

function centeredPosition(
  centerX: number,
  centerY: number,
  kind: WorkNodeKind | undefined,
  config?: WorkNodeData["config"],
) {
  const dimensions = dimensionsForKind(kind, config);
  return {
    x: centerX - dimensions.width / 2,
    y: centerY - dimensions.height / 2,
  };
}

function boundaryNode(kind: "START" | "END"): FlowNode {
  return {
    id: kind === "START" ? "start" : "end",
    type: "workNode",
    selectable: false,
    position: centeredPosition(
      FLOW_CENTER_X,
      kind === "START" ? FLOW_START_CENTER_Y : FLOW_EMPTY_END_CENTER_Y,
      kind,
    ),
    data: { label: kind === "START" ? "开始" : "结束", kind, config: {} },
  };
}

function transientDraft(templateId: WorkflowId): Version {
  const graph: FlowGraph = {
    nodes: [boundaryNode("START"), boundaryNode("END")],
    edges: [],
  };
  return {
    id: `transient-draft-${templateId}`,
    versionNumber: 1,
    status: "DRAFT",
    isCurrent: false,
    virtual: true,
    nodesJson: JSON.stringify(graph.nodes),
    edgesJson: JSON.stringify(graph.edges),
  };
}

function withFlowMarker(edge: Edge): Edge {
  const isConditionBranchEdge = Boolean(
    edge.sourceHandle?.startsWith("condition-") &&
    edge.sourceHandle !== "condition-input",
  );
  return {
    ...FLOW_EDGE_DEFAULTS,
    ...edge,
    // Keep all flow connections orthogonal. Condition branch edges must also
    // be normalized here so quick-add and previously saved edges use the same
    // elbow path instead of falling back to a diagonal straight segment.
    type: isConditionBranchEdge
      ? "smoothstep"
      : (edge.type ?? FLOW_EDGE_DEFAULTS.type),
    markerEnd: edge.markerEnd ?? FLOW_EDGE_MARKER,
  };
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

const CONDITION_DEFAULT_BRANCH = {
  id: "condition-default",
  name: "否则" as const,
};

function conditionBranchesForConfig(
  config: WorkNodeData["config"] | undefined,
): ConditionBranch[] {
  if (Array.isArray(config?.conditionBranches)) {
    return config.conditionBranches
      .filter((branch) => Boolean(branch?.id && branch?.name))
      .map((branch) => ({
        id: String(branch.id),
        name: String(branch.name),
        conditionRule: branch.conditionRule ?? null,
        fieldCatalogVersion: branch.fieldCatalogVersion,
        fieldSnapshot: branch.fieldSnapshot,
      }));
  }
  return [];
}

function normalizedConditionConfig(
  config: WorkNodeData["config"] | undefined,
): NonNullable<WorkNodeData["config"]> {
  const branches = conditionBranchesForConfig(config);
  return {
    ...(config ?? {}),
    conditionBranches:
      branches.length > 0
        ? branches
        : [{ id: "condition-1", name: "条件 1", conditionRule: null }],
    conditionDefaultBranch: CONDITION_DEFAULT_BRANCH,
  };
}

function conditionHandleForBranch(branchId: string) {
  return branchId.startsWith("condition-") ? branchId : `condition-${branchId}`;
}

function isConditionBranchHandle(handle: string, branches: ConditionBranch[]) {
  return [
    ...branches.map((branch) => conditionHandleForBranch(branch.id)),
    "condition-default",
  ].includes(handle);
}

function validateFlowGraphForPublish(
  graph: FlowGraph,
  referenceableFormVersionIds?: Set<string>,
): FlowValidationResult {
  const nodeErrors: Record<string, string> = {};
  const addNodeError = (nodeId: string, message: string) => {
    if (nodeId && !nodeErrors[nodeId]) nodeErrors[nodeId] = message;
  };
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  const conditionHandles = new Map<string, Set<string>>();
  graph.nodes.forEach((node) => {
    incoming.set(node.id, []);
    outgoing.set(node.id, []);
    if (node.data.kind === "FORM") {
      const formVersionId = node.data.config?.formTemplateVersionId;
      if (!formVersionId) {
        addNodeError(node.id, "请选择生效表单版本");
      } else if (
        referenceableFormVersionIds &&
        !referenceableFormVersionIds.has(String(formVersionId))
      ) {
        addNodeError(node.id, "请选择当前生效的表单版本");
      }
    }
    if (node.data.kind === "CONDITION") {
      const branches = conditionBranchesForConfig(node.data.config);
      if (branches.some((branch) => !branch.conditionRule))
        addNodeError(node.id, "请配置所有条件分支规则");
    }
  });

  const starts = graph.nodes.filter((node) => node.data.kind === "START");
  const ends = graph.nodes.filter((node) => node.data.kind === "END");
  if (starts.length !== 1)
    starts.forEach((node) => addNodeError(node.id, "流程只能有一个开始节点"));
  if (ends.length !== 1)
    ends.forEach((node) => addNodeError(node.id, "流程只能有一个结束节点"));
  let hasConnectionError = false;
  const edgeKeys = new Set<string>();
  graph.edges.forEach((edge) => {
    const source = nodesById.get(edge.source);
    const target = nodesById.get(edge.target);
    if (!source || !target) {
      hasConnectionError = true;
      addNodeError(source?.id ?? edge.source, "连线引用了不存在的节点");
      addNodeError(target?.id ?? edge.target, "连线引用了不存在的节点");
      return;
    }
    if (source.id === target.id) {
      hasConnectionError = true;
      addNodeError(source.id, "节点不能连接自身");
      return;
    }
    const sourceHandle = edge.sourceHandle ?? "";
    const targetHandle = edge.targetHandle ?? "";
    const edgeKey = `${source.id}->${target.id}#${sourceHandle}`;
    if (!edgeKeys.add(edgeKey)) {
      hasConnectionError = true;
      addNodeError(source.id, "同一出口不能重复创建连线");
      return;
    }
    if (source.data.kind === "CONDITION") {
      const handles = conditionHandles.get(source.id) ?? new Set<string>();
      const branches = conditionBranchesForConfig(source.data.config);
      const allowedHandles = [
        ...branches.map((branch) => conditionHandleForBranch(branch.id)),
        "condition-default",
      ];
      if (
        !sourceHandle ||
        !allowedHandles.includes(sourceHandle) ||
        handles.has(sourceHandle)
      ) {
        hasConnectionError = true;
        addNodeError(source.id, "条件分支出口只能各连接一条连线");
      }
      handles.add(sourceHandle);
      conditionHandles.set(source.id, handles);
    } else if ((outgoing.get(source.id)?.length ?? 0) > 0) {
      hasConnectionError = true;
      addNodeError(source.id, "普通节点只能有一条出口连线");
    }
    if (source.data.kind === "END") {
      hasConnectionError = true;
      addNodeError(source.id, "结束节点不能继续连接其他节点");
    }
    if (target.data.kind === "START") {
      hasConnectionError = true;
      addNodeError(target.id, "开始节点不能有进入连线");
    }
    if (
      target.data.kind === "CONDITION" &&
      targetHandle &&
      targetHandle !== "condition-input"
    ) {
      hasConnectionError = true;
      addNodeError(
        target.id,
        "条件节点只能从顶部入口进入，条件出口不能作为进入点",
      );
    }
    incoming.get(target.id)?.push(source.id);
    outgoing.get(source.id)?.push(target.id);
  });

  if (starts.length === 1 && (incoming.get(starts[0].id)?.length ?? 0) > 0) {
    hasConnectionError = true;
    addNodeError(starts[0].id, "开始节点不能有进入连线");
  }
  if (ends.length === 1 && (outgoing.get(ends[0].id)?.length ?? 0) > 0) {
    hasConnectionError = true;
    addNodeError(ends[0].id, "结束节点不能继续连接其他节点");
  }
  graph.nodes.forEach((node) => {
    if (
      node.data.kind !== "START" &&
      (incoming.get(node.id)?.length ?? 0) === 0
    ) {
      hasConnectionError = true;
      addNodeError(node.id, "节点缺少进入连线");
    }
    if (
      node.data.kind !== "END" &&
      (outgoing.get(node.id)?.length ?? 0) === 0
    ) {
      hasConnectionError = true;
      addNodeError(node.id, "节点缺少出口连线");
    }
    if (node.data.kind === "CONDITION") {
      const branches = conditionBranchesForConfig(node.data.config);
      const expectedHandles = [
        ...branches.map((branch) => conditionHandleForBranch(branch.id)),
        "condition-default",
      ];
      const connectedHandles = new Set(
        graph.edges
          .filter((edge) => edge.source === node.id)
          .map((edge) => edge.sourceHandle ?? ""),
      );
      if (expectedHandles.some((handle) => !connectedHandles.has(handle))) {
        hasConnectionError = true;
        addNodeError(node.id, "条件分支的每个出口都需要连接到后续节点");
      }
    }
  });

  if (starts.length === 1 && ends.length === 1) {
    const visit = (root: string, adjacency: Map<string, string[]>) => {
      const visited = new Set<string>();
      const queue = [root];
      while (queue.length) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);
        adjacency.get(current)?.forEach((next) => {
          if (!visited.has(next)) queue.push(next);
        });
      }
      return visited;
    };
    const reachableFromStart = visit(starts[0].id, outgoing);
    const reverse = new Map<string, string[]>();
    graph.nodes.forEach((node) => reverse.set(node.id, []));
    graph.edges.forEach((edge) => reverse.get(edge.target)?.push(edge.source));
    const canReachEnd = visit(ends[0].id, reverse);
    graph.nodes.forEach((node) => {
      if (!reachableFromStart.has(node.id) || !canReachEnd.has(node.id)) {
        hasConnectionError = true;
        addNodeError(node.id, "节点未连接在开始到结束的完整流程中");
      }
    });
  }

  const hasConfigurationError = Object.keys(nodeErrors).some((nodeId) => {
    const message = nodeErrors[nodeId];
    return (
      message === "请选择生效表单版本" ||
      message === "请配置所有条件分支规则"
    );
  });
  const message = hasConfigurationError
    ? "请先补全标红节点的必填配置后再发布。"
    : hasConnectionError || starts.length !== 1 || ends.length !== 1
      ? "请检查流程连线，确保所有节点从开始节点连接到结束节点。"
      : null;
  return {
    valid:
      Object.keys(nodeErrors).length === 0 &&
      starts.length === 1 &&
      ends.length === 1 &&
      !hasConnectionError,
    message,
    nodeErrors,
  };
}

function normalizeFlowGraph(version: Version): FlowGraph {
  const parsedNodes = parseJson<FlowNode[]>(version.nodesJson, [])
    .filter((node) => {
      if (node.data?.kind !== "CONDITION") return true;
      const config = node.data.config as Record<string, unknown> | undefined;
      const branches = config?.conditionBranches;
      const defaultBranch = config?.conditionDefaultBranch as
        | Record<string, unknown>
        | undefined;
      const hasLegacyField = [
        "conditionRule",
        "conditionFieldCatalogVersion",
        "conditionFieldSnapshot",
        "conditionExpression",
      ].some((field) => field in (config ?? {}));
      const hasLegacyBranchField =
        Array.isArray(branches) &&
        branches.some(
          (branch) => branch && typeof branch === "object" && "rule" in branch,
        );
      return (
        Array.isArray(branches) &&
        branches.length > 0 &&
        !hasLegacyField &&
        !hasLegacyBranchField &&
        defaultBranch?.id === "condition-default" &&
        defaultBranch?.name === "否则"
      );
    })
    .map((node) => ({
      ...node,
      selectable: false,
      type:
        node.type === "input" ||
        node.type === "output" ||
        node.type === "default"
          ? "workNode"
          : node.type,
      data: {
        ...node.data,
        kind:
          node.data?.kind ??
          (node.type === "input"
            ? "START"
            : node.type === "output"
              ? "END"
              : "FORM"),
        config:
          node.data?.kind === "CONDITION"
            ? normalizedConditionConfig(node.data?.config)
            : { ...(node.data?.config ?? {}) },
      },
    }));
  const hasStart = parsedNodes.some((node) => node.data.kind === "START");
  const hasEnd = parsedNodes.some((node) => node.data.kind === "END");
  const nodes = [
    ...(hasStart ? parsedNodes : [boundaryNode("START"), ...parsedNodes]),
    ...(hasEnd ? [] : [boundaryNode("END")]),
  ];
  const hasWorkNodes = nodes.some(
    (node) => node.data.kind !== "START" && node.data.kind !== "END",
  );
  if (!hasWorkNodes) {
    nodes.forEach((node) => {
      if (node.data.kind === "START")
        node.position = centeredPosition(
          FLOW_CENTER_X,
          FLOW_START_CENTER_Y,
          "START",
        );
      if (node.data.kind === "END")
        node.position = centeredPosition(
          FLOW_CENTER_X,
          FLOW_EMPTY_END_CENTER_Y,
          "END",
        );
    });
  }
  const parsedEdges = parseJson<Edge[]>(version.edgesJson, []);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edges = parsedEdges.filter((edge) => {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) return false;
    if (source.data.kind !== "CONDITION") return true;
    return isConditionBranchHandle(
      edge.sourceHandle ?? "",
      conditionBranchesForConfig(source.data.config),
    );
  });
  const normalizedEdges =
    parsedEdges.length > 0 || hasStart || hasEnd
      ? edges.map((edge) => withFlowMarker(edge))
      : [withFlowMarker({ id: "start-end", source: "start", target: "end" })];
  return { nodes, edges: normalizedEdges };
}

function invalidConditionTargetNodeIds(graph: FlowGraph) {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  return new Set(
    graph.edges
      .filter(
        (edge) =>
          nodeById.get(edge.target)?.data.kind === "CONDITION" &&
          edge.targetHandle !== "condition-input",
      )
      .map((edge) => edge.target),
  );
}

const nodeAppearance: Record<
  WorkNodeKind,
  { label: string; color: string; background: string }
> = {
  START: { label: "开始", color: "#1677c8", background: "#e8f4ff" },
  END: { label: "结束", color: "#677386", background: "#eef1f5" },
  FORM: { label: "表单填写", color: "#1677c8", background: "#f2f8ff" },
  NOTIFICATION: { label: "消息通知", color: "#8a5a00", background: "#fff8e8" },
  CONFIRMATION: { label: "人工确认", color: "#217a4b", background: "#effaf3" },
  CONDITION: { label: "条件分支", color: "#7650b5", background: "#f6f1ff" },
};

function nodeCaption(data: WorkNodeData) {
  const config = data.config ?? {};
  if (data.kind === "FORM")
    return [config.formTemplateName || "选择表单", config.formProcessName]
      .filter(Boolean)
      .join(" · ");
  if (data.kind === "NOTIFICATION") return config.recipients || "设置接收人";
  if (data.kind === "CONFIRMATION")
    return config.confirmationInstruction || "设置确认要求";
  if (data.kind === "CONDITION") {
    const branches = conditionBranchesForConfig(config);
    const configuredCount = branches.filter(
      (branch) => branch.conditionRule,
    ).length;
    return `${branches.length} 条条件分支${configuredCount < branches.length ? ` · ${branches.length - configuredCount} 条待配置` : ""}`;
  }
  return "";
}

type QuickDirection = FlowDirection;

const QUICK_CONNECT_MAX_DISTANCE = 180;
const QUICK_CONNECT_MAX_CROSS_OFFSET = 96;
// Condition outlets own independent vertical lanes. This must stay narrower
// than half a lane so quick-add never captures a sibling branch node.
const CONDITION_BRANCH_QUICK_CONNECT_MAX_CROSS_OFFSET = Math.min(
  48,
  Math.floor(CONDITION_BRANCH_LANE_GAP / 3),
);
const CONDITION_BRANCH_QUICK_BUTTON_TOP = 0;
const CONDITION_BRANCH_QUICK_MENU_TOP = CONDITION_BRANCH_CARD_HEIGHT + 34;

type QuickActionContextValue = {
  editable: boolean;
  selectedNodeId: string | null;
  validationErrors: Record<string, string>;
  menu: { nodeId: string; direction: QuickDirection } | null;
  branchMenu: { nodeId: string; branchId: string } | null;
  onOpen: (nodeId: string, direction: QuickDirection) => void;
  onAdd: (
    nodeId: string,
    direction: QuickDirection,
    kind: Exclude<WorkNodeKind, "START" | "END">,
  ) => void;
  onOpenBranch: (nodeId: string, branchId: string) => void;
  onAddBranch: (
    nodeId: string,
    branchId: string,
    kind: Exclude<WorkNodeKind, "START" | "END">,
  ) => void;
  canUseDirection: (nodeId: string) => boolean;
  canUseBranch: (nodeId: string, branchId: string) => boolean;
};

const QuickActionContext = createContext<QuickActionContextValue | null>(null);

const oppositeDirection = oppositeFlowDirection;

function sourceHandleForDirection(node: FlowNode, direction: QuickDirection) {
  return `source-${direction}`;
}

function quickDirections(kind: WorkNodeKind): QuickDirection[] {
  if (kind === "START") return ["bottom"];
  if (kind === "END") return [];
  if (kind === "CONDITION") return [];
  return ["top", "right", "bottom", "left"];
}

function nodeHandleStyle(direction: QuickDirection, offset = 0) {
  const base = {
    width: 9,
    height: 9,
    border: "1px solid #8c99a8",
    background: "#fff",
    zIndex: 3,
  };
  if (direction === "top" || direction === "bottom")
    return { ...base, left: `calc(50% + ${offset}px)` };
  return { ...base, top: `calc(50% + ${offset}px)` };
}

function conditionBranchHandleStyle(index: number, total: number) {
  return {
    width: 10,
    height: 10,
    left: "50%",
    top: "auto",
    bottom: -6,
    transform: "translateX(-50%)",
    border: "1px solid #7650b5",
    background: "#fff",
    zIndex: 4,
  };
}

function conditionBranchQuickHitAreaStyle(index: number, total: number) {
  return {
    position: "absolute" as const,
    left: conditionBranchCenterOffset(index, total),
    // Keep a continuous transparent bridge from the card outlet to the action
    // without covering the branch card itself.
    top: CONDITION_BRANCH_QUICK_ACTION_TOP,
    width: 54,
    height: 50,
    transform: "translateX(-50%)",
    zIndex: 6,
    pointerEvents: "auto" as const,
  };
}

function conditionBranchQuickButtonStyle() {
  return {
    position: "absolute" as const,
    left: 9,
    top: CONDITION_BRANCH_QUICK_BUTTON_TOP,
    width: 28,
    minWidth: 28,
    height: 24,
    p: 0,
    border: 0,
    borderRadius: 0,
    bgcolor: "transparent",
    color: "#2498df",
    boxShadow: "none",
    "&:hover": { bgcolor: "transparent", boxShadow: "none" },
    "& .MuiTouchRipple-root": { display: "none" },
  };
}

function conditionBranchMenuStyle(index: number, total: number) {
  return {
    position: "absolute" as const,
    left: conditionBranchCenterOffset(index, total),
    // Anchor the menu to the branch action rather than to the entire node.
    top: CONDITION_BRANCH_QUICK_MENU_TOP,
    transform: "translateX(-50%)",
    zIndex: 7,
    p: 0.5,
    bgcolor: "#fff",
    border: "1px solid #d9e2ec",
    borderRadius: 1,
    boxShadow: "0 4px 14px rgba(31,45,61,.16)",
    whiteSpace: "nowrap",
  };
}

function AlignmentGuides({
  guides,
}: {
  guides: { vertical: number | null; horizontal: number | null };
}) {
  const { getViewport } = useReactFlow();
  const viewport = getViewport();
  return (
    <>
      {guides.vertical !== null ? (
        <Box
          aria-hidden="true"
          sx={{
            position: "absolute",
            left: guides.vertical * viewport.zoom + viewport.x,
            top: 0,
            bottom: 0,
            width: "1px",
            bgcolor: "#1677c8",
            opacity: 0.75,
            zIndex: 3,
            pointerEvents: "none",
          }}
        />
      ) : null}
      {guides.horizontal !== null ? (
        <Box
          aria-hidden="true"
          sx={{
            position: "absolute",
            top: guides.horizontal * viewport.zoom + viewport.y,
            left: 0,
            right: 0,
            height: "1px",
            bgcolor: "#1677c8",
            opacity: 0.75,
            zIndex: 3,
            pointerEvents: "none",
          }}
        />
      ) : null}
    </>
  );
}

function WorkFormPreviewDialog({
  option,
  onClose,
}: {
  option: WorkFormOption | null;
  onClose: () => void;
}) {
  const previewQuery = useQuery({
    queryKey: ["work-node-form-preview", option?.templateId, option?.id],
    enabled: Boolean(option?.templateId && option?.id),
    queryFn: async () =>
      (await getFormTemplateVersion(option!.templateId, option!.id)).data.data,
  });
  const previewDocument = useMemo(() => {
    if (!option || !previewQuery.data) return null;
    const row: TemplateModelingRecord = {
      id: option.templateId,
      code: option.code,
      name: option.name,
      type: "FORM_TEMPLATE",
    };
    return parseReactTemplateDesignerDocument(
      row,
      previewQuery.data as TemplateVersionRecord,
    );
  }, [option, previewQuery.data]);
  return (
    <AppDialog
      open={Boolean(option)}
      onClose={onClose}
      fullWidth
      maxWidth="lg"
      sx={{ zIndex: (theme) => theme.zIndex.modal + 200 }}
    >
      <DialogTitle sx={{ pr: 6 }}>
        <Typography component="div" variant="h6" noWrap>
          {option ? `${option.name} / ${option.version}` : "表单预览"}
        </Typography>
        <Typography variant="caption" sx={{ color: "#909399" }}>
          {option?.categoryName?.trim() || "未分类"}
          {option?.code ? ` · 表单编码：${option.code}` : ""}
        </Typography>
      </DialogTitle>
      <DialogContent
        dividers
        sx={{
          height: "min(72vh, 760px)",
          minHeight: 420,
          p: 0,
          display: "flex",
          flexDirection: "column",
          bgcolor: "#eef3f8",
        }}
      >
        {previewQuery.isLoading ? (
          <Box
            sx={{
              flex: 1,
              display: "grid",
              placeItems: "center",
              color: "#909399",
            }}
          >
            正在加载表单预览...
          </Box>
        ) : previewQuery.isError ? (
          <Typography sx={{ p: 3, color: "#c62828" }}>
            无法加载该表单版本
          </Typography>
        ) : previewDocument ? (
          <FormCanvasPreview document={previewDocument} />
        ) : (
          <Typography sx={{ p: 3, color: "#909399" }}>
            该表单暂无可预览的设计内容
          </Typography>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.25 }}>
        <Button onClick={onClose}>关闭</Button>
      </DialogActions>
    </AppDialog>
  );
}

function WorkFlowNode({ id, data }: NodeProps<FlowNode>) {
  const kind = data.kind ?? "FORM";
  const appearance = nodeAppearance[kind];
  const boundary = kind === "START" || kind === "END";
  const quick = useContext(QuickActionContext);
  const [bodyHovered, setBodyHovered] = useState(false);
  const [hoveredBranchId, setHoveredBranchId] = useState<string | null>(null);
  const stopNodeEvent = (event: ReactMouseEvent) => {
    event.stopPropagation();
  };
  const openBranchMenu = (event: ReactMouseEvent, branchId: string) => {
    stopNodeEvent(event);
    quick?.onOpenBranch(id, branchId);
  };
  const addFromBranchMenu = (
    event: ReactMouseEvent,
    branchId: string,
    addKind: Exclude<WorkNodeKind, "START" | "END">,
  ) => {
    stopNodeEvent(event);
    quick?.onAddBranch(id, branchId, addKind);
  };
  const quickMenuDirection =
    quick?.menu?.nodeId === id ? quick.menu.direction : null;
  const branchMenuOpen = quick?.branchMenu?.nodeId === id;
  const canEdit = Boolean(quick?.editable);
  const selected = quick?.selectedNodeId === id;
  const validationMessage = quick?.validationErrors[id];
  // The transparent bridge between a node and its quick-add button is not an
  // action target, but it must keep the button visible while the pointer moves
  // from the node body to the button.
  const quickVisible =
    canEdit &&
    (bodyHovered ||
      hoveredBranchId !== null ||
      selected ||
      Boolean(quickMenuDirection) ||
      branchMenuOpen);
  const conditionBranches =
    kind === "CONDITION" ? conditionBranchesForConfig(data.config) : [];
  const dimensions =
    kind === "CONDITION"
      ? conditionNodeSize(data.config)
      : nodeSizeForKind(kind);
  if (kind !== "CONDITION") {
    return (
      <StandardFlowNode
        id={id}
        label={boundary ? appearance.label : data.label || appearance.label}
        caption={boundary ? undefined : nodeCaption(data)}
        appearance={{
          color: appearance.color,
          background: appearance.background,
        }}
        width={dimensions.width}
        height={dimensions.height}
        boundary={boundary}
        start={kind === "START"}
        end={kind === "END"}
        editable={canEdit}
        selected={Boolean(selected)}
        validationMessage={validationMessage}
        quickDirections={quickDirections(kind)}
        quickMenuDirection={quickMenuDirection}
        quickActions={[
          { id: "FORM", label: "表单填写", icon: <FactCheckOutlined /> },
          { id: "CONDITION", label: "条件分支", icon: <SchemaOutlined /> },
        ]}
        canUseQuickAction={Boolean(quick?.canUseDirection(id))}
        onOpenQuickMenu={(direction) => quick?.onOpen(id, direction)}
        onQuickAdd={(direction, actionId) =>
          quick?.onAdd(
            id,
            direction,
            actionId as Exclude<WorkNodeKind, "START" | "END">,
          )
        }
      />
    );
  }
  return (
    <Box
      className={`flow-node-shell${selected ? " flow-node-selected" : ""}`}
      sx={{
        position: "relative",
        boxSizing: "border-box",
        width: dimensions.width,
        height: dimensions.height,
        overflow: "visible",
        border: 0,
        bgcolor: "transparent",
        boxShadow: "none",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
        userSelect: "none",
        WebkitUserSelect: "none",
        "& .flow-node-quick": { pointerEvents: canEdit ? "auto" : "none" },
      }}
    >
      <>
        <Box
          className="condition-node-core"
          onMouseEnter={() => setBodyHovered(true)}
          onMouseLeave={() => setBodyHovered(false)}
          sx={{
            position: "absolute",
            top: 0,
            left: "50%",
            transform: "translateX(-50%)",
            width: CONDITION_CORE_WIDTH,
            height: CONDITION_CORE_HEIGHT,
            boxSizing: "border-box",
            zIndex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            textAlign: "center",
            px: 1,
            py: 0.8,
            border: "1px solid",
            borderColor: validationMessage
              ? "#d93025"
              : selected
                ? "#1677c8"
                : `${appearance.color}55`,
            borderRadius: 1,
            bgcolor: appearance.background,
            boxShadow: validationMessage
              ? "0 0 0 3px rgba(217,48,37,.14)"
              : selected
                ? "0 0 0 3px rgba(22,119,200,.14)"
                : "0 1px 2px rgba(31,45,61,.08)",
          }}
        >
          <Handle
            id="condition-input"
            type="target"
            position={Position.Top}
            isConnectable={canEdit}
            style={nodeHandleStyle("top")}
          />
          <Typography
            noWrap
            sx={{
              color: appearance.color,
              fontSize: 11,
              fontWeight: 650,
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: 220,
            }}
          >
            {data.label || appearance.label}
          </Typography>
          <Typography
            noWrap
            sx={{ mt: 0.25, maxWidth: 220, color: "#7a8796", fontSize: 10 }}
          >
            {nodeCaption(data)}
          </Typography>
          <Typography
            noWrap
            sx={{ mt: 0.35, maxWidth: 220, color: "#7a8796", fontSize: 10 }}
          >
            {conditionBranches.length} 条条件 + 否则
          </Typography>
        </Box>
        <Box
          className="condition-branch-connectors"
          aria-hidden="true"
          sx={{
            position: "absolute",
            top: CONDITION_CORE_HEIGHT,
            left: 0,
            width: "100%",
            height: CONDITION_BRANCH_TOP - CONDITION_CORE_HEIGHT,
            zIndex: 0,
            pointerEvents: "none",
          }}
        >
          <Box
            sx={{
              position: "absolute",
              left: "50%",
              top: 0,
              width: "1px",
              height: 8,
              bgcolor: "#c8b8e2",
            }}
          />
          {conditionBranches.length + 1 > 1 ? (
            <Box
              sx={{
                position: "absolute",
                left: conditionBranchCenterOffset(
                  0,
                  conditionBranches.length + 1,
                ),
                width:
                  conditionBranchCenterOffset(
                    conditionBranches.length,
                    conditionBranches.length + 1,
                  ) -
                  conditionBranchCenterOffset(0, conditionBranches.length + 1),
                top: 8,
                height: "1px",
                bgcolor: "#c8b8e2",
              }}
            />
          ) : null}
          {Array.from({ length: conditionBranches.length + 1 }, (_, index) => (
            <Box
              key={`condition-branch-connector-${index}`}
              sx={{
                position: "absolute",
                left: conditionBranchCenterOffset(
                  index,
                  conditionBranches.length + 1,
                ),
                top: 8,
                width: "1px",
                height: 8,
                bgcolor: "#c8b8e2",
              }}
            />
          ))}
        </Box>
        <Box
          className="condition-node-branches"
          sx={{
            position: "absolute",
            top: CONDITION_BRANCH_TOP,
            left: 0,
            width: "100%",
            height: CONDITION_BRANCH_CARD_HEIGHT,
            zIndex: 2,
          }}
        >
          {[
            ...conditionBranches.map((branch) => ({
              id: branch.id,
              label: branch.name,
              summary: branch.conditionRule
                ? summarizeConditionExpression(
                    branch.conditionRule,
                    WORK_CONDITION_ADAPTER,
                  )
                : "待配置条件规则",
              configured: Boolean(branch.conditionRule),
            })),
            {
              id: "condition-default",
              label: "否则",
              summary: "所有条件均不满足时进入",
              configured: true,
            },
          ].map((branch, index, all) => {
            const branchMenuIsOpen =
              quick?.branchMenu?.nodeId === id &&
              quick.branchMenu.branchId === branch.id;
            const branchCanUse =
              canEdit && Boolean(quick?.canUseBranch(id, branch.id));
            const branchLeft =
              conditionBranchCenterOffset(index, all.length) -
              CONDITION_BRANCH_CARD_WIDTH / 2;
            return (
              <Fragment key={`branch-${branch.id}`}>
                <Box
                  className="condition-branch-card"
                  onMouseEnter={() => setHoveredBranchId(branch.id)}
                  onMouseLeave={() =>
                    setHoveredBranchId((current) =>
                      current === branch.id ? null : current,
                    )
                  }
                  sx={{
                    position: "absolute",
                    top: 0,
                    left: branchLeft,
                    width: CONDITION_BRANCH_CARD_WIDTH,
                    height: CONDITION_BRANCH_CARD_HEIGHT,
                    boxSizing: "border-box",
                    px: 1,
                    py: 0.65,
                    border: "1px solid",
                    borderColor:
                      branch.id === "condition-default"
                        ? "#c7d0da"
                        : branch.configured
                          ? "#c9b8e8"
                          : "#e0c58f",
                    borderRadius: 1,
                    bgcolor:
                      branch.id === "condition-default"
                        ? "#f7f9fb"
                        : branch.configured
                          ? "#fbf9ff"
                          : "#fffaf0",
                    textAlign: "left",
                    overflow: "visible",
                    boxShadow: selected
                      ? "0 0 0 2px rgba(22,119,200,.10)"
                      : "0 1px 2px rgba(31,45,61,.06)",
                  }}
                >
                  <Handle
                    id={
                      branch.id === "condition-default"
                        ? "condition-default"
                        : conditionHandleForBranch(branch.id)
                    }
                    type="source"
                    position={Position.Bottom}
                    isConnectable={canEdit}
                    style={conditionBranchHandleStyle(index, all.length)}
                  />
                  <Typography
                    noWrap
                    sx={{
                      color:
                        branch.id === "condition-default"
                          ? "#596575"
                          : branch.configured
                            ? "#7650b5"
                            : "#a36b00",
                      fontSize: 10,
                      fontWeight: 650,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {branch.label}
                  </Typography>
                  <Typography
                    sx={{
                      mt: 0.35,
                      color: "#7a8796",
                      fontSize: 9,
                      lineHeight: 1.35,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {branch.summary}
                  </Typography>
                </Box>
                {branchCanUse ? (
                  <Box
                    className="flow-node-quick-hit-area nodrag nopan"
                    onMouseDown={stopNodeEvent}
                    onPointerEnter={() => setHoveredBranchId(branch.id)}
                    onPointerLeave={() =>
                      setHoveredBranchId((current) =>
                        current === branch.id ? null : current,
                      )
                    }
                    sx={{
                      ...conditionBranchQuickHitAreaStyle(index, all.length),
                      opacity: quickVisible
                        ? hoveredBranchId === branch.id
                          ? 1
                          : 0.34
                        : 0,
                      transition: "opacity 120ms ease",
                    }}
                  >
                    <FlowQuickTooltip
                      title="添加节点"
                      placement="right"
                      menuOpen={branchMenuIsOpen}
                    >
                      <IconButton
                        className="flow-node-quick nodrag nopan"
                        size="small"
                        aria-label={`在${branch.label}出口添加节点`}
                        onMouseDown={stopNodeEvent}
                        onClick={(event) => openBranchMenu(event, branch.id)}
                        sx={conditionBranchQuickButtonStyle()}
                      >
                        <ArrowDownwardOutlined fontSize="small" />
                      </IconButton>
                    </FlowQuickTooltip>
                  </Box>
                ) : null}
                {branchMenuIsOpen ? (
                  <Stack
                    className="nodrag nopan"
                    direction="row"
                    spacing={0.5}
                    sx={conditionBranchMenuStyle(index, all.length)}
                  >
                    <Button
                      className="nodrag nopan"
                      size="small"
                      startIcon={<FactCheckOutlined />}
                      onMouseDown={stopNodeEvent}
                      onClick={(event) =>
                        addFromBranchMenu(event, branch.id, "FORM")
                      }
                    >
                      表单填写
                    </Button>
                    <Button
                      className="nodrag nopan"
                      size="small"
                      startIcon={<SchemaOutlined />}
                      onMouseDown={stopNodeEvent}
                      onClick={(event) =>
                        addFromBranchMenu(event, branch.id, "CONDITION")
                      }
                    >
                      条件分支
                    </Button>
                  </Stack>
                ) : null}
              </Fragment>
            );
          })}
        </Box>
        {validationMessage ? (
          <Typography
            component="span"
            sx={{
              position: "absolute",
              top: dimensions.height + 5,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 8,
              color: "#d93025",
              fontSize: 10,
              lineHeight: 1.2,
              whiteSpace: "nowrap",
              pointerEvents: "none",
            }}
          >
            {validationMessage}
          </Typography>
        ) : null}
      </>
    </Box>
  );
}

const workflowNodeTypes = { workNode: WorkFlowNode };

function FormFieldPermissionEditor({
  subjects,
  fields,
  permissions,
  editable,
  loading,
  onChange,
}: {
  subjects: ProcessPermissionSubject[];
  fields: FormFieldOption[];
  permissions: Record<
    string,
    {
      defaultPermission?: "EDIT" | "READ_ONLY";
      editableFieldIds?: string[];
      readOnlyFieldIds?: string[];
    }
  >;
  editable: boolean;
  loading: boolean;
  onChange: (
    permissions: Record<
      string,
      {
        defaultPermission?: "EDIT" | "READ_ONLY";
        editableFieldIds?: string[];
        readOnlyFieldIds?: string[];
      }
    >,
  ) => void;
}) {
  if (loading)
    return (
      <Typography variant="caption" color="text.secondary">
        正在加载表单字段和权限主体...
      </Typography>
    );
  if (subjects.length === 0)
    return (
      <Typography variant="caption" color="text.secondary">
        该表单流程未限制填报主体或审批主体，所有已认证用户均可按流程状态操作。
      </Typography>
    );
  const fieldOptions = fields.map((field) => ({
    label: `${field.name} · ${field.code}`,
    id: field.id,
  }));
  return (
    <Box sx={{ border: "1px solid #e4e7ed", borderRadius: 1, p: 1.25 }}>
      <Typography variant="body2" fontWeight={650}>
        例外字段
      </Typography>
      <Typography
        variant="caption"
        sx={{
          display: "block",
          mt: 0.35,
          mb: 1,
          color: "#909399",
          lineHeight: 1.45,
        }}
      >
        这里不需要把全部字段逐个配置：默认权限会应用于全部字段，只选择需要相反权限的字段即可。
      </Typography>
      <Stack spacing={1}>
        {subjects.map((subject) => {
          const current = permissions[subject.id] ?? {
            defaultPermission: subject.defaultPermission,
            editableFieldIds: [],
            readOnlyFieldIds: [],
          };
          const defaultPermission =
            current.defaultPermission ?? subject.defaultPermission;
          const exceptions =
            defaultPermission === "EDIT"
              ? (current.readOnlyFieldIds ?? [])
              : (current.editableFieldIds ?? []);
          const exceptionLabel =
            defaultPermission === "EDIT" ? "例外只读字段" : "例外可编辑字段";
          return (
            <Box
              key={subject.id}
              sx={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 0.75fr) minmax(0, 1.25fr)",
                gap: 1,
                alignItems: "center",
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" noWrap title={subject.label}>
                  {subject.label}
                </Typography>
                <Typography variant="caption" sx={{ color: "#909399" }}>
                  {defaultPermission === "EDIT"
                    ? "默认全部可编辑"
                    : "默认全部只读"}
                </Typography>
              </Box>
              <Stack spacing={0.75}>
                <Typography variant="caption" sx={{ color: "#606266" }}>
                  未选择的字段：
                  {defaultPermission === "EDIT" ? "可编辑" : "只读"}
                  ；已选择的字段：
                  {defaultPermission === "EDIT" ? "只读" : "可编辑"}
                </Typography>
                <Autocomplete
                  multiple
                  size="small"
                  options={fieldOptions}
                  getOptionLabel={(option) => option.label}
                  value={fieldOptions.filter((field) =>
                    exceptions.includes(field.id),
                  )}
                  disabled={!editable || fields.length === 0}
                  onChange={(_, selected) => {
                    const ids = selected.map((field) => field.id);
                    onChange({
                      ...permissions,
                      [subject.id]: {
                        ...current,
                        editableFieldIds:
                          defaultPermission === "READ_ONLY" ? ids : [],
                        readOnlyFieldIds:
                          defaultPermission === "EDIT" ? ids : [],
                      },
                    });
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label={exceptionLabel}
                      placeholder="选择字段（可不选）"
                    />
                  )}
                />
              </Stack>
            </Box>
          );
        })}
      </Stack>
      {fields.length === 0 ? (
        <Typography
          variant="caption"
          sx={{ display: "block", mt: 1, color: "#c62828" }}
        >
          当前表单版本没有可用字段，请先完善表单模板。
        </Typography>
      ) : null}
      <Typography
        variant="caption"
        sx={{ display: "block", mt: 1, color: "#909399", lineHeight: 1.45 }}
      >
        例外字段只对当前作业节点生效，不会修改可复用的表单流程。更换表单或表单流程版本后，系统会清理已不存在的字段例外。
      </Typography>
    </Box>
  );
}

function FormPermissionConfigDialog({
  open,
  subjects,
  fields,
  document,
  permissions,
  events,
  eventBindings,
  editable,
  loading,
  onClose,
  onSave,
}: {
  open: boolean;
  subjects: ProcessPermissionSubject[];
  fields: FormFieldOption[];
  document: Parameters<typeof FormCanvasPreview>[0]["document"] | null;
  permissions: NonNullable<WorkNodeData["config"]>["fieldPermissions"];
  events: ProcessBuiltinEvent[];
  eventBindings: Record<string, { fieldId?: string }>;
  editable: boolean;
  loading: boolean;
  onClose: () => void;
  onSave: (
    permissions: NonNullable<WorkNodeData["config"]>["fieldPermissions"],
    eventBindings: Record<string, { fieldId?: string }>,
  ) => void;
}) {
  const [draft, setDraft] = useState(permissions ?? {});
  const [eventDraft, setEventDraft] = useState(eventBindings ?? {});
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(
    subjects[0]?.id ?? null,
  );
  useEffect(() => {
    if (!open) return;
    setDraft(permissions ?? {});
    setEventDraft(eventBindings ?? {});
    setSelectedSubjectId((current) =>
      subjects.some((subject) => subject.id === current)
        ? current
        : (subjects[0]?.id ?? null),
    );
  }, [open, permissions, subjects]);
  const selectedSubject =
    subjects.find((subject) => subject.id === selectedSubjectId) ?? null;
  const selectedRule = selectedSubject
    ? (draft[selectedSubject.id] ?? {
        defaultPermission: selectedSubject.defaultPermission,
        editableFieldIds: [],
        readOnlyFieldIds: [],
      })
    : null;
  const defaultPermission =
    selectedRule?.defaultPermission ??
    selectedSubject?.defaultPermission ??
    "EDIT";
  const exceptions =
    defaultPermission === "EDIT"
      ? (selectedRule?.readOnlyFieldIds ?? [])
      : (selectedRule?.editableFieldIds ?? []);
  const fieldOptions = fields.map((field) => ({
    id: field.id,
    label: `${field.name} · ${field.code}`,
  }));
  const previewPermissions = useMemo<PreviewFieldPermission | undefined>(() => {
    if (!selectedSubject) return undefined;
    const map: PreviewFieldPermission = {};
    fields.forEach((field) => {
      const isException = exceptions.includes(field.id);
      map[field.id] =
        defaultPermission === "EDIT"
          ? isException
            ? "READ_ONLY"
            : "EDIT"
          : isException
            ? "EDIT"
            : "READ_ONLY";
    });
    return map;
  }, [defaultPermission, exceptions, fields, selectedSubject]);
  const updateRule = (patch: Partial<NonNullable<typeof selectedRule>>) => {
    if (!selectedSubject) return;
    setDraft((current) => ({
      ...current,
      [selectedSubject.id]: { ...selectedRule, ...patch },
    }));
  };
  return (
    <AppDialog
      open={open}
      onClose={onClose}
      fullScreen
      PaperProps={{ sx: { height: "100dvh", borderRadius: 0 } }}
    >
      <DialogTitle sx={{ borderBottom: "1px solid #e4e7ed" }}>
        配置表单流程
      </DialogTitle>
      <DialogContent
        dividers
        sx={{
          p: 0,
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 380px",
          minHeight: 0,
          bgcolor: "#f4f7fa",
        }}
      >
        <Box
          sx={{
            minWidth: 0,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            borderRight: "1px solid #e4e7ed",
          }}
        >
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{
              px: 2,
              py: 1.25,
              bgcolor: "#fff",
              borderBottom: "1px solid #e4e7ed",
            }}
          >
            <Typography variant="subtitle2">表单预览</Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              noWrap
              sx={{ maxWidth: "48%" }}
            >
              {selectedSubject
                ? `当前预览：${selectedSubject.stage} · ${selectedSubject.label}`
                : "未配置主体，默认可编辑"}
            </Typography>
          </Stack>
          {loading ? (
            <Box
              sx={{
                flex: 1,
                display: "grid",
                placeItems: "center",
                color: "#909399",
              }}
            >
              正在加载表单...
            </Box>
          ) : document ? (
            <FormCanvasPreview
              document={document}
              fieldPermissions={previewPermissions}
            />
          ) : (
            <Box
              sx={{
                flex: 1,
                display: "grid",
                placeItems: "center",
                color: "#909399",
              }}
            >
              暂时无法预览表单
            </Box>
          )}
        </Box>
        <Box
          sx={{ minWidth: 0, minHeight: 0, overflow: "auto", bgcolor: "#fff" }}
        >
          <Stack spacing={2} sx={{ p: 2 }}>
            <Box>
              <Typography variant="subtitle2">流程阶段与权限组</Typography>
              <Typography variant="caption" color="text.secondary">
                填报按权限组配置，审批按审批节点配置。
              </Typography>
            </Box>
            {subjects.length ? (
              <Stack spacing={1}>
                {(["填报", "审批"] as const).map((stage) => {
                  const stageSubjects = subjects.filter(
                    (subject) => subject.stage === stage,
                  );
                  return stageSubjects.length ? (
                    <Box key={stage}>
                      <Typography
                        variant="caption"
                        sx={{ color: "#697586", fontWeight: 600 }}
                      >
                        {stage}阶段
                      </Typography>
                      <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                        {stageSubjects.map((subject) => (
                          <Button
                            key={subject.id}
                            size="small"
                            onClick={() => setSelectedSubjectId(subject.id)}
                            sx={{
                              justifyContent: "flex-start",
                              textAlign: "left",
                              px: 1.25,
                              py: 0.75,
                              color:
                                selectedSubjectId === subject.id
                                  ? "#1677c8"
                                  : "#303133",
                              bgcolor:
                                selectedSubjectId === subject.id
                                  ? "#edf6ff"
                                  : "transparent",
                              borderRadius: 1,
                              textTransform: "none",
                              whiteSpace: "normal",
                              overflow: "hidden",
                            }}
                          >
                            <Stack
                              sx={{ minWidth: 0, alignItems: "flex-start" }}
                            >
                              <Typography variant="body2" noWrap>
                                {subject.label}
                              </Typography>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                noWrap
                                sx={{ maxWidth: "100%" }}
                              >
                                {subject.members}
                              </Typography>
                            </Stack>
                          </Button>
                        ))}
                      </Stack>
                    </Box>
                  ) : null;
                })}
              </Stack>
            ) : (
              <Box
                sx={{
                  p: 1.25,
                  bgcolor: "#f7f9fb",
                  color: "#606266",
                  fontSize: 13,
                }}
              >
                未配置主体，所有已认证用户均可按流程状态操作。
              </Box>
            )}
            {selectedSubject ? (
              <>
                <Box>
                  <Typography variant="body2" fontWeight={600}>
                    默认权限
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      mt: 0.75,
                      color:
                        defaultPermission === "EDIT" ? "#1677c8" : "#697586",
                    }}
                  >
                    {defaultPermission === "EDIT" ? "全部可编辑" : "全部只读"}{" "}
                    <Typography
                      component="span"
                      variant="caption"
                      color="text.secondary"
                    >
                      （继承表单流程设置）
                    </Typography>
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="body2" fontWeight={600}>
                    例外字段
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    未选择的字段保持默认权限，已选择的字段使用相反权限。
                  </Typography>
                  <Autocomplete
                    multiple
                    size="small"
                    sx={{ mt: 1 }}
                    options={fieldOptions}
                    value={fieldOptions.filter((field) =>
                      exceptions.includes(field.id),
                    )}
                    getOptionLabel={(option) => option.label}
                    disabled={!editable || !fields.length}
                    onChange={(_, next) =>
                      updateRule({
                        editableFieldIds:
                          defaultPermission === "READ_ONLY"
                            ? next.map((field) => field.id)
                            : [],
                        readOnlyFieldIds:
                          defaultPermission === "EDIT"
                            ? next.map((field) => field.id)
                            : [],
                      })
                    }
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label={
                          defaultPermission === "EDIT"
                            ? "例外只读字段"
                            : "例外可编辑字段"
                        }
                        placeholder="选择字段"
                      />
                    )}
                  />
                </Box>
              </>
            ) : null}
            {events.length ? (
              <Box sx={{ pt: 1.5, borderTop: "1px solid #e4e7ed" }}>
                <Typography variant="body2" fontWeight={600}>
                  节点按钮
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  需要签名的按钮可选择将签名写入哪个表单字段。
                </Typography>
                <Box sx={{ mt: 0.75 }}>
                  <FormProcessEventBindingEditor
                    compact
                    events={events}
                    fields={fields}
                    bindings={eventDraft}
                    editable={editable}
                    loading={false}
                    onChange={setEventDraft}
                  />
                </Box>
              </Box>
            ) : null}
          </Stack>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>取消</Button>
        <Button
          variant="contained"
          onClick={() => onSave(draft, eventDraft)}
          disabled={!editable}
        >
          保存配置
        </Button>
      </DialogActions>
    </AppDialog>
  );
}

function FormProcessEventBindingEditor({
  events,
  fields,
  bindings,
  compact = false,
  editable,
  loading,
  onChange,
}: {
  events: ProcessBuiltinEvent[];
  fields: FormFieldOption[];
  bindings: Record<string, { fieldId?: string }>;
  compact?: boolean;
  editable: boolean;
  loading: boolean;
  onChange: (bindings: Record<string, { fieldId?: string }>) => void;
}) {
  if (loading) {
    return (
      <Typography variant="caption" color="text.secondary">
        正在加载表单事件和字段...
      </Typography>
    );
  }
  if (events.length === 0) return null;
  const signatureFields = fields.filter((field) => {
    const type = String(field.type ?? "")
      .toLowerCase()
      .replace(/[ _-]/g, "");
    return ["signature", "electronicsignature", "sign"].includes(type);
  });
  const fieldOptions = (signatureFields.length ? signatureFields : fields).map(
    (field) => ({
      label: `${field.name} · ${field.code}`,
      id: field.id,
    }),
  );
  const eventGroups = Array.from(
    events.reduce((groups, event) => {
      const current = groups.get(event.nodeId) ?? [];
      current.push(event);
      groups.set(event.nodeId, current);
      return groups;
    }, new Map<string, ProcessBuiltinEvent[]>()),
  );
  return (
    <Box
      sx={
        compact
          ? undefined
          : { border: "1px solid #e4e7ed", borderRadius: 1, p: 1.25 }
      }
    >
      {!compact ? (
        <>
          <Typography variant="body2" fontWeight={650}>
            内置事件字段
          </Typography>
          <Typography
            variant="caption"
            sx={{
              display: "block",
              mt: 0.35,
              mb: 1,
              color: "#909399",
              lineHeight: 1.45,
            }}
          >
            需要签名的按钮会在执行前要求账户密码，并将签名写入这里绑定的表单字段。
          </Typography>
        </>
      ) : null}
      <Stack spacing={1.25}>
        {eventGroups.map(([nodeId, nodeEvents]) => (
          <Box
            key={nodeId}
            sx={{
              borderBottom: compact ? "1px solid #eef1f4" : undefined,
              pb: compact ? 1 : 0,
            }}
          >
            {compact ? (
              <Typography
                variant="caption"
                sx={{
                  display: "block",
                  mb: 0.5,
                  color: "#697586",
                  fontWeight: 600,
                }}
              >
                {nodeEvents[0]?.nodeLabel}
              </Typography>
            ) : null}
            <Stack spacing={0.75}>
              {nodeEvents.map((event) => {
                const selected =
                  fieldOptions.find(
                    (field) => field.id === bindings[event.key]?.fieldId,
                  ) ?? null;
                return (
                  <Box
                    key={event.key}
                    sx={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) minmax(220px, 1fr)",
                      gap: 1.25,
                      alignItems: "center",
                      py: compact ? 0.75 : 0,
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      {!compact ? (
                        <Typography
                          variant="body2"
                          noWrap
                          title={event.nodeLabel}
                        >
                          {event.nodeLabel}
                        </Typography>
                      ) : null}
                      <Typography variant="caption" sx={{ color: "#909399" }}>
                        {event.action === "SAVE"
                          ? "保存"
                          : event.action === "SUBMIT"
                            ? "提交"
                            : event.action === "APPROVE"
                              ? "审批"
                              : "退回"}{" "}
                        · 账户密码签名
                      </Typography>
                    </Box>
                    <Autocomplete
                      size="small"
                      options={fieldOptions}
                      value={selected}
                      getOptionLabel={(option) => option.label}
                      disabled={!editable || fieldOptions.length === 0}
                      onChange={(_, next) => {
                        const nextBindings = { ...bindings };
                        if (next)
                          nextBindings[event.key] = { fieldId: next.id };
                        else delete nextBindings[event.key];
                        onChange(nextBindings);
                      }}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="目标签名字段"
                          placeholder="请选择字段"
                        />
                      )}
                    />
                  </Box>
                );
              })}
            </Stack>
          </Box>
        ))}
      </Stack>
      {fieldOptions.length === 0 ? (
        <Typography
          variant="caption"
          sx={{ display: "block", mt: 1, color: "#c62828" }}
        >
          当前表单没有可绑定的字段。
        </Typography>
      ) : null}
    </Box>
  );
}

const FlowWorkspace = forwardRef<
  FlowWorkspaceHandle,
  {
    version: Version;
    templateId: WorkflowId;
    onDirtyChange: (dirty: boolean) => void;
    skipGraphResetRef: {
      current: {
        id: string;
        nodesJson?: string | null;
        edgesJson?: string | null;
      } | null;
    };
    restoreSelectionRef: { current: string | null };
    onRequestDeleteConditionNode: (
      nodeId: string,
      descendantCount: number,
    ) => void;
  }
>(
  (
    {
      version,
      templateId,
      onDirtyChange,
      skipGraphResetRef,
      restoreSelectionRef,
      onRequestDeleteConditionNode,
    },
    ref,
  ) => {
    const editable = version.status === "DRAFT";
    const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(
      normalizeFlowGraph(version).nodes,
    );
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(
      normalizeFlowGraph(version).edges,
    );
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
      restoreSelectionRef.current,
    );
    const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
    const [showMiniMap, setShowMiniMap] = useState(false);
    const [previewForm, setPreviewForm] = useState<WorkFormOption | null>(null);
    const [permissionConfigOpen, setPermissionConfigOpen] = useState(false);
    const [conditionRuleDialogOpen, setConditionRuleDialogOpen] =
      useState(false);
    const [conditionRuleDraft, setConditionRuleDraft] =
      useState<ConditionExpression | null>(null);
    const [selectedConditionBranchId, setSelectedConditionBranchId] = useState<
      string | null
    >(null);
    const [validationError, setValidationError] = useState<string | null>(null);
    const [validationErrors, setValidationErrors] = useState<
      Record<string, string>
    >({});
    const [formPickerOpen, setFormPickerOpen] = useState(false);
    const [formPickerSearch, setFormPickerSearch] = useState("");
    const [expandedFormCategories, setExpandedFormCategories] = useState<
      Set<string>
    >(() => new Set());
    const [expandedFormParents, setExpandedFormParents] = useState<Set<string>>(
      () => new Set(),
    );
    const [quickMenu, setQuickMenu] = useState<{
      nodeId: string;
      direction: QuickDirection;
    } | null>(null);
    const [branchMenu, setBranchMenu] = useState<{
      nodeId: string;
      branchId: string;
    } | null>(null);
    const [guides, setGuides] = useState<{
      vertical: number | null;
      horizontal: number | null;
    }>({ vertical: null, horizontal: null });
    const [historyState, setHistoryState] = useState({ undo: 0, redo: 0 });
    const flowInstanceRef = useRef<ReactFlowInstance<FlowNode, Edge> | null>(
      null,
    );
    const canvasRootRef = useRef<HTMLDivElement>(null);
    const formPickerAnchorRef = useRef<HTMLDivElement>(null);
    const dirtyRef = useRef(false);
    const nodesRef = useRef(nodes);
    const edgesRef = useRef(edges);
    const undoStackRef = useRef<FlowGraph[]>([]);
    const redoStackRef = useRef<FlowGraph[]>([]);
    const dragStartGraphRef = useRef<FlowGraph | null>(null);
    nodesRef.current = nodes;
    edgesRef.current = edges;
    const formTemplates = useQuery({
      queryKey: ["form-templates", "work-node-picker"],
      queryFn: async () => {
        const records: TemplateModelingRecord[] = [];
        let page = 1;
        let totalPages = 1;
        do {
          const pageResult = (await getFormTemplates({ page, size: 100 })).data
            .data;
          records.push(...(pageResult.content ?? []));
          totalPages = Math.max(pageResult.totalPages ?? 1, 1);
          page += 1;
        } while (page <= totalPages);
        return records.flatMap((template) =>
          (template.versions ?? [])
            .filter((version) => isEffectiveFormVersion(version.status))
            .map(
              (version): WorkFormOption => ({
                id: String(version.id),
                templateId: String(template.id),
                code: template.code,
                name: template.name,
                version: version.version,
                categoryName: template.categoryName,
                status: version.status ?? "",
              }),
            ),
        );
      },
    });
    const formProcesses = useQuery({
      queryKey: ["form-processes", "work-node-picker"],
      queryFn: async () => {
        const result = (await listFormProcesses({ page: 1, size: 100 })).data
          .data as { content?: Array<{ id: string | number; name: string }> };
        const definitions = result.content ?? [];
        const options: WorkFormProcessOption[] = [];
        for (const definition of definitions) {
          const versions = (await getFormProcessVersions(definition.id)).data
            .data as Array<{
            id: string | number;
            versionNumber: number;
            status: string;
            isCurrent?: boolean;
          }>;
          versions
            .filter(
              (version) => version.status === "PUBLISHED" && version.isCurrent,
            )
            .forEach((version) =>
              options.push({
                id: String(definition.id),
                versionId: String(version.id),
                name: definition.name,
                versionNumber: version.versionNumber,
                isCurrent: version.isCurrent,
              }),
            );
        }
        return options;
      },
    });
    const formProcessReferences = useQuery({
      queryKey: ["work-form-process-references", templateId, version.id],
      enabled: !version.virtual,
      queryFn: async () =>
        (await getWorkFormProcessReferences(templateId, version.id)).data
          .data as WorkFormProcessReferenceStatus[],
    });
    const outdatedFormProcessReferences = (
      formProcessReferences.data ?? []
    ).filter((reference) => {
      if (!reference.outdated) return false;
      const localNode = nodes.find((node) => node.id === reference.nodeId);
      const localVersionId = localNode?.data.config?.formProcessVersionId;
      if (!localNode || !localVersionId) return false;
      return !(formProcesses.data ?? []).some(
        (option) => option.versionId === String(localVersionId),
      );
    });
    const currentGraph = (): FlowGraph => ({
      nodes: nodesRef.current,
      edges: edgesRef.current,
    });
    const cloneGraph = (graph: FlowGraph): FlowGraph =>
      JSON.parse(JSON.stringify(graph)) as FlowGraph;
    const sameGraph = (left: FlowGraph, right: FlowGraph) =>
      JSON.stringify(left) === JSON.stringify(right);
    const hasDirectConnection = (
      sourceId: string,
      targetId: string,
      graphEdges = edges,
    ) =>
      graphEdges.some(
        (edge) => edge.source === sourceId && edge.target === targetId,
      );
    const hasReverseConnection = (
      sourceId: string,
      targetId: string,
      graphEdges = edges,
    ) => hasDirectConnection(targetId, sourceId, graphEdges);
    const hasOutgoingConnection = (sourceId: string, graphEdges = edges) =>
      graphEdges.some((edge) => edge.source === sourceId);
    const canReceiveConnection = (
      targetId: string,
      targetHandle?: string | null,
    ) => {
      const targetNode = nodesRef.current.find((node) => node.id === targetId);
      if (!targetNode || targetNode.data.kind === "START") return false;
      if (targetNode.data.kind === "CONDITION")
        return targetHandle === "condition-input";
      return !isConditionBranchHandle(
        targetHandle ?? "",
        conditionBranchesForConfig(targetNode.data.config),
      );
    };
    const targetHandleForNode = (
      targetNode: FlowNode,
      direction: QuickDirection,
    ) =>
      targetNode.data.kind === "CONDITION"
        ? "condition-input"
        : `target-${oppositeDirection[direction]}`;
    const canCreateConnection = (
      sourceId: string,
      sourceHandle?: string | null,
      graphEdges = edges,
    ) => {
      const sourceNode = nodesRef.current.find((node) => node.id === sourceId);
      if (!sourceNode || sourceNode.data.kind === "END") return false;
      if (sourceNode.data.kind === "CONDITION") {
        const branches = conditionBranchesForConfig(sourceNode.data.config);
        if (!sourceHandle || !isConditionBranchHandle(sourceHandle, branches))
          return false;
        return !graphEdges.some(
          (edge) =>
            edge.source === sourceId && edge.sourceHandle === sourceHandle,
        );
      }
      return !hasOutgoingConnection(sourceId, graphEdges);
    };
    const canUseQuickDirection = (sourceId: string) =>
      canCreateConnection(sourceId);
    const canUseQuickBranch = (sourceId: string, branchId: string) =>
      canCreateConnection(
        sourceId,
        conditionHandleForBranch(branchId),
        edgesRef.current,
      );
    const updateHistoryCounts = () =>
      setHistoryState({
        undo: undoStackRef.current.length,
        redo: redoStackRef.current.length,
      });
    const recordHistory = (before = currentGraph()) => {
      if (!editable) return;
      undoStackRef.current = [
        ...undoStackRef.current.slice(-(HISTORY_LIMIT - 1)),
        cloneGraph(before),
      ];
      redoStackRef.current = [];
      updateHistoryCounts();
    };
    const applyHistoryGraph = (graph: FlowGraph) => {
      setNodes(cloneGraph(graph).nodes);
      setEdges(cloneGraph(graph).edges);
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setQuickMenu(null);
      setBranchMenu(null);
      markDirty();
    };
    const undo = () => {
      if (!editable || undoStackRef.current.length === 0) return;
      const previous = undoStackRef.current.pop()!;
      redoStackRef.current.push(cloneGraph(currentGraph()));
      applyHistoryGraph(previous);
      updateHistoryCounts();
    };
    const redo = () => {
      if (!editable || redoStackRef.current.length === 0) return;
      const next = redoStackRef.current.pop()!;
      undoStackRef.current.push(cloneGraph(currentGraph()));
      applyHistoryGraph(next);
      updateHistoryCounts();
    };
    const markDirty = () => {
      setValidationError(null);
      setValidationErrors({});
      if (!dirtyRef.current) {
        dirtyRef.current = true;
        onDirtyChange(true);
      }
    };

    const findAvailablePosition = (
      preferred: { x: number; y: number },
      kind: WorkNodeKind = "FORM",
    ) => {
      const dimensions = dimensionsForKind(
        kind,
        kind === "CONDITION" ? normalizedConditionConfig({}) : undefined,
      );
      const overlaps = (candidate: { x: number; y: number }) =>
        nodes.some((node) => {
          const dimensionsOfOther = nodeSize(node);
          return (
            candidate.x < node.position.x + dimensionsOfOther.width + 24 &&
            candidate.x + dimensions.width + 24 > node.position.x &&
            candidate.y < node.position.y + dimensionsOfOther.height + 24 &&
            candidate.y + dimensions.height + 24 > node.position.y
          );
        });
      if (!overlaps(preferred)) return preferred;
      const stepX = dimensions.width + 36;
      const stepY = dimensions.height + 48;
      for (let ring = 1; ring <= 8; ring += 1) {
        for (let column = -ring; column <= ring; column += 1) {
          for (const row of [-ring, ring]) {
            const candidate = {
              x: preferred.x + column * stepX,
              y: preferred.y + row * stepY,
            };
            if (!overlaps(candidate)) return candidate;
          }
        }
        for (let row = -ring + 1; row < ring; row += 1) {
          for (const column of [-ring, ring]) {
            const candidate = {
              x: preferred.x + column * stepX,
              y: preferred.y + row * stepY,
            };
            if (!overlaps(candidate)) return candidate;
          }
        }
      }
      return {
        x: preferred.x + (nodes.length + 1) * 32,
        y: preferred.y + (nodes.length + 1) * 20,
      };
    };

    const positionForDirection = (
      sourceNode: FlowNode,
      targetKind: Exclude<WorkNodeKind, "START" | "END">,
      direction: QuickDirection,
      gap = 80,
    ) => {
      const sourceDimensions = nodeSize(sourceNode);
      const targetConfig =
        targetKind === "CONDITION" ? normalizedConditionConfig({}) : undefined;
      const targetDimensions = dimensionsForKind(targetKind, targetConfig);
      const sourceCenterX = sourceNode.position.x + sourceDimensions.width / 2;
      const sourceCenterY = sourceNode.position.y + sourceDimensions.height / 2;
      const targetCenter =
        direction === "top"
          ? {
              x: sourceCenterX,
              y:
                sourceCenterY -
                sourceDimensions.height / 2 -
                targetDimensions.height / 2 -
                gap,
            }
          : direction === "bottom"
            ? {
                x: sourceCenterX,
                y:
                  sourceCenterY +
                  sourceDimensions.height / 2 +
                  targetDimensions.height / 2 +
                  gap,
              }
            : direction === "left"
              ? {
                  x:
                    sourceCenterX -
                    sourceDimensions.width / 2 -
                    targetDimensions.width / 2 -
                    gap,
                  y: sourceCenterY,
                }
              : {
                  x:
                    sourceCenterX +
                    sourceDimensions.width / 2 +
                    targetDimensions.width / 2 +
                    gap,
                  y: sourceCenterY,
                };
      return centeredPosition(
        targetCenter.x,
        targetCenter.y,
        targetKind,
        targetConfig,
      );
    };

    const nearbyNodeForDirection = (
      sourceNode: FlowNode,
      direction: QuickDirection,
    ) => {
      const connectedTargets = new Set(
        edges
          .filter(
            (edge) =>
              edge.source === sourceNode.id &&
              edge.sourceHandle ===
                sourceHandleForDirection(sourceNode, direction),
          )
          .map((edge) => edge.target),
      );
      return findNearbyFlowNode({
        sourceNode,
        nodes,
        direction,
        getSize: nodeSize,
        maxDistance: QUICK_CONNECT_MAX_DISTANCE,
        maxCrossOffset: QUICK_CONNECT_MAX_CROSS_OFFSET,
        isCandidate: (node) =>
          node.data.kind !== "START" &&
          !connectedTargets.has(node.id) &&
          !hasReverseConnection(sourceNode.id, node.id) &&
          canReceiveConnection(node.id, targetHandleForNode(node, direction)),
      });
    };

    const nearbyNodeForConditionBranch = (
      sourceNode: FlowNode,
      branchId: string,
    ) => {
      const branches = conditionBranchesForConfig(sourceNode.data.config);
      const branchIndex =
        branchId === "condition-default"
          ? branches.length
          : branches.findIndex((branch) => branch.id === branchId);
      if (branchIndex < 0) return null;
      const sourceSize = nodeSize(sourceNode);
      const sourceBottom = sourceNode.position.y + sourceSize.height;
      const branchCenterX = conditionBranchCenterX(
        sourceNode,
        branchIndex,
        branches.length + 1,
      );
      const branchHandle = conditionHandleForBranch(branchId);
      const connectedTargets = new Set(
        edges
          .filter(
            (edge) =>
              edge.source === sourceNode.id &&
              edge.sourceHandle === branchHandle,
          )
          .map((edge) => edge.target),
      );
      // A node already claimed by another outlet of this condition belongs to that
      // branch's lane. It must never be offered as a nearby target for this one.
      const targetsUsedByOtherBranches = new Set(
        edges
          .filter(
            (edge) =>
              edge.source === sourceNode.id &&
              edge.sourceHandle !== branchHandle,
          )
          .map((edge) => edge.target),
      );
      return (
        nodes
          .filter(
            (node) =>
              node.id !== sourceNode.id &&
              node.data.kind !== "START" &&
              !connectedTargets.has(node.id) &&
              !targetsUsedByOtherBranches.has(node.id) &&
              !hasReverseConnection(sourceNode.id, node.id) &&
              canReceiveConnection(
                node.id,
                node.data.kind === "CONDITION"
                  ? "condition-input"
                  : "target-top",
              ),
          )
          .map((node) => {
            const size = nodeSize(node);
            const centerX = node.position.x + size.width / 2;
            const distance = node.position.y - sourceBottom;
            return {
              node,
              distance,
              crossOffset: Math.abs(centerX - branchCenterX),
            };
          })
          .filter(
            ({ distance, crossOffset }) =>
              distance >= 0 &&
              distance <= QUICK_CONNECT_MAX_DISTANCE &&
              crossOffset <= CONDITION_BRANCH_QUICK_CONNECT_MAX_CROSS_OFFSET,
          )
          .sort(
            (left, right) =>
              left.distance +
              left.crossOffset * 0.35 -
              (right.distance + right.crossOffset * 0.35),
          )[0]?.node ?? null
      );
    };

    const alignNodes = () => {
      if (!editable) return;
      const before = currentGraph();
      const start = nodes.find((node) => node.data.kind === "START");
      const end = nodes.find((node) => node.data.kind === "END");
      const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]));
      edges.forEach((edge) => {
        outgoing.get(edge.source)?.push(edge.target);
      });
      const levels = new Map<string, number>();
      const queue = start ? [start.id] : [];
      if (start) levels.set(start.id, 0);
      while (queue.length) {
        const current = queue.shift()!;
        const nextLevel = (levels.get(current) ?? 0) + 1;
        outgoing.get(current)?.forEach((target) => {
          if (target !== end?.id && !levels.has(target)) {
            levels.set(target, nextLevel);
            queue.push(target);
          }
        });
      }
      const maxLevel = Math.max(0, ...Array.from(levels.values()));
      nodes
        .filter(
          (node) =>
            node.data.kind !== "START" &&
            node.data.kind !== "END" &&
            !levels.has(node.id),
        )
        .forEach((node, index) => levels.set(node.id, maxLevel + 1 + index));
      const lastLevel = Math.max(maxLevel, ...Array.from(levels.values()));
      const preferredX = new Map<string, number>();
      if (start) preferredX.set(start.id, FLOW_CENTER_X);
      const layoutQueue = start ? [start.id] : [];
      const visitedLayout = new Set<string>();
      while (layoutQueue.length) {
        const sourceId = layoutQueue.shift()!;
        if (visitedLayout.has(sourceId)) continue;
        visitedLayout.add(sourceId);
        const source = nodes.find((node) => node.id === sourceId);
        if (!source) continue;
        const sourceX = preferredX.get(sourceId) ?? FLOW_CENTER_X;
        const sourceEdges = edges.filter((edge) => edge.source === sourceId);
        const conditionBranches =
          source.data.kind === "CONDITION"
            ? conditionBranchesForConfig(source.data.config)
            : [];
        const handles =
          source.data.kind === "CONDITION"
            ? [
                ...conditionBranches.map((branch) =>
                  conditionHandleForBranch(branch.id),
                ),
                "condition-default",
              ]
            : [];
        sourceEdges.forEach((edge) => {
          const branchIndex = handles.indexOf(edge.sourceHandle ?? "");
          const laneOffset =
            branchIndex >= 0
              ? (branchIndex - (handles.length - 1) / 2) *
                CONDITION_BRANCH_LANE_GAP
              : 0;
          if (!preferredX.has(edge.target))
            preferredX.set(edge.target, sourceX + laneOffset);
          layoutQueue.push(edge.target);
        });
      }
      const groups = new Map<number, FlowNode[]>();
      nodes
        .filter(
          (node) => node.data.kind !== "START" && node.data.kind !== "END",
        )
        .forEach((node) => {
          const level = levels.get(node.id) ?? 0;
          groups.set(level, [...(groups.get(level) ?? []), node]);
        });
      const centerX = FLOW_CENTER_X;
      const levelGap = FLOW_LEVEL_GAP;
      const next = nodes.map((node) => {
        if (node.data.kind === "START")
          return {
            ...node,
            position: centeredPosition(centerX, FLOW_START_CENTER_Y, "START"),
          };
        if (node.data.kind === "END")
          return {
            ...node,
            position: centeredPosition(
              centerX,
              Math.max(
                FLOW_EMPTY_END_CENTER_Y,
                FLOW_START_CENTER_Y + (lastLevel + 1) * levelGap,
              ),
              "END",
            ),
          };
        return {
          ...node,
          position: centeredPosition(
            preferredX.get(node.id) ?? centerX,
            FLOW_START_CENTER_Y + (levels.get(node.id) ?? 1) * levelGap,
            node.data.kind,
            node.data.config,
          ),
        };
      });
      groups.forEach((group) => {
        const ordered = [...group].sort(
          (left, right) =>
            (preferredX.get(left.id) ?? centerX) -
            (preferredX.get(right.id) ?? centerX),
        );
        let cursor = Number.NEGATIVE_INFINITY;
        const placed = ordered.map((node) => {
          const dimensions = nodeSize(node);
          const desired = preferredX.get(node.id) ?? centerX;
          const minimum =
            cursor === Number.NEGATIVE_INFINITY
              ? desired
              : cursor + dimensions.width / 2 + 52;
          const actual = Math.max(desired, minimum);
          cursor = actual + dimensions.width / 2;
          return { node, actual };
        });
        if (placed.length > 1) {
          const first = placed[0].actual - nodeSize(placed[0].node).width / 2;
          const last =
            placed[placed.length - 1].actual +
            nodeSize(placed[placed.length - 1].node).width / 2;
          const shift = centerX - (first + last) / 2;
          placed.forEach(({ node, actual }) => {
            const target = next.find((candidate) => candidate.id === node.id);
            if (target)
              target.position = centeredPosition(
                actual + shift,
                target.position.y + nodeSize(node).height / 2,
                node.data.kind,
                node.data.config,
              );
          });
        }
      });
      setNodes(next);
      requestAnimationFrame(() =>
        flowInstanceRef.current?.fitView({
          padding: 0.32,
          minZoom: 0.52,
          maxZoom: 0.82,
          duration: 240,
        }),
      );
      markDirty();
      if (!sameGraph(before, { nodes: next, edges })) recordHistory(before);
    };

    const addQuickNode = (
      sourceNode: FlowNode,
      direction: QuickDirection,
      kind: Exclude<WorkNodeKind, "START" | "END">,
    ) => {
      if (!editable || !canCreateConnection(sourceNode.id)) return;
      const before = currentGraph();
      const id = `${kind.toLowerCase()}-${Date.now()}`;
      let targetPosition = positionForDirection(sourceNode, kind, direction);
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const candidate = positionForDirection(
          sourceNode,
          kind,
          direction,
          80 + attempt * 80,
        );
        targetPosition = findAvailablePosition(candidate, kind);
        if (
          targetPosition.x === candidate.x &&
          targetPosition.y === candidate.y
        )
          break;
      }
      const newNode: FlowNode = {
        id,
        type: "workNode",
        selectable: false,
        position: targetPosition,
        data: {
          label: nodeAppearance[kind].label,
          kind,
          config: kind === "CONDITION" ? normalizedConditionConfig({}) : {},
        },
      };
      const edge: Edge = withFlowMarker({
        id: `${sourceNode.id}-${id}`,
        source: sourceNode.id,
        sourceHandle: sourceHandleForDirection(sourceNode, direction),
        target: id,
        targetHandle:
          kind === "CONDITION"
            ? "condition-input"
            : `target-${oppositeDirection[direction]}`,
      });
      setNodes((current) => [...current, newNode]);
      setEdges((current) => addEdge(edge, current));
      setSelectedNodeId(id);
      setSelectedConditionBranchId(null);
      setSelectedEdgeId(null);
      setQuickMenu(null);
      setBranchMenu(null);
      markDirty();
      recordHistory(before);
    };

    const addConditionBranchNode = (
      sourceNodeId: string,
      branchId: string,
      kind: Exclude<WorkNodeKind, "START" | "END">,
    ) => {
      const sourceNode = nodesRef.current.find(
        (node) => node.id === sourceNodeId,
      );
      if (!editable || !sourceNode || sourceNode.data.kind !== "CONDITION")
        return;
      const sourceHandle = conditionHandleForBranch(branchId);
      if (!canCreateConnection(sourceNode.id, sourceHandle, edgesRef.current))
        return;
      const before = currentGraph();
      const branches = conditionBranchesForConfig(sourceNode.data.config);
      const branchIndex =
        branchId === "condition-default"
          ? branches.length
          : branches.findIndex((branch) => branch.id === branchId);
      if (branchIndex < 0) return;
      const sourceSize = nodeSize(sourceNode);
      const targetConfig =
        kind === "CONDITION" ? normalizedConditionConfig({}) : undefined;
      const targetSize = dimensionsForKind(kind, targetConfig);
      const branchCenterX = conditionBranchCenterX(
        sourceNode,
        branchIndex,
        branches.length + 1,
      );
      const sourceBottom = sourceNode.position.y + sourceSize.height;
      const preferred = centeredPosition(
        branchCenterX,
        sourceBottom + targetSize.height / 2 + 112,
        kind,
        targetConfig,
      );
      // Branches deliberately own vertical lanes. Generic radial collision search
      // is fine for ordinary nodes but may move a new branch node into a sibling
      // lane, which makes the visual mapping between outlet and node ambiguous.
      const hasCollision = (candidate: { x: number; y: number }) =>
        nodesRef.current.some((node) => {
          const other = nodeSize(node);
          return (
            candidate.x < node.position.x + other.width + 24 &&
            candidate.x + targetSize.width + 24 > node.position.x &&
            candidate.y < node.position.y + other.height + 24 &&
            candidate.y + targetSize.height + 24 > node.position.y
          );
        });
      let position = preferred;
      for (
        let attempt = 1;
        attempt <= 12 && hasCollision(position);
        attempt += 1
      ) {
        position = {
          ...preferred,
          y: preferred.y + attempt * (targetSize.height + 72),
        };
      }
      const id = `${kind.toLowerCase()}-${Date.now()}`;
      const newNode: FlowNode = {
        id,
        type: "workNode",
        selectable: false,
        position,
        data: {
          label: nodeAppearance[kind].label,
          kind,
          config: kind === "CONDITION" ? normalizedConditionConfig({}) : {},
        },
      };
      const edge: Edge = withFlowMarker({
        id: `${sourceNode.id}-${id}`,
        source: sourceNode.id,
        sourceHandle,
        target: id,
        targetHandle: kind === "CONDITION" ? "condition-input" : "target-top",
      });
      setNodes((current) => [...current, newNode]);
      setEdges((current) => addEdge(edge, current));
      setSelectedNodeId(id);
      setSelectedConditionBranchId(null);
      setSelectedEdgeId(null);
      markDirty();
      recordHistory(before);
    };

    const connectQuickDirection = (
      sourceNode: FlowNode,
      direction: QuickDirection,
      targetNode: FlowNode,
    ) => {
      if (
        !editable ||
        !canCreateConnection(sourceNode.id, null, edgesRef.current)
      )
        return;
      const before = currentGraph();
      if (
        sourceNode.id === targetNode.id ||
        hasReverseConnection(sourceNode.id, targetNode.id, before.edges)
      )
        return;
      const sourceHandle = sourceHandleForDirection(sourceNode, direction);
      const targetHandle = targetHandleForNode(targetNode, direction);
      const existing = edges.find(
        (edge) =>
          edge.source === sourceNode.id &&
          edge.target === targetNode.id &&
          edge.sourceHandle === sourceHandle,
      );
      if (existing) {
        setSelectedEdgeId(existing.id);
        setSelectedNodeId(null);
        setQuickMenu(null);
        return;
      }
      const edge: Edge = withFlowMarker({
        id: `${sourceNode.id}-${targetNode.id}-${Date.now()}`,
        source: sourceNode.id,
        sourceHandle,
        target: targetNode.id,
        targetHandle,
      });
      setEdges((current) => addEdge(edge, current));
      setSelectedEdgeId(edge.id);
      setSelectedNodeId(null);
      setSelectedConditionBranchId(null);
      setQuickMenu(null);
      setBranchMenu(null);
      markDirty();
      recordHistory(before);
    };

    useEffect(() => {
      // 保存草稿只同步缓存数据，不重置画布，保留选中节点与撤销历史。
      const skipReset = skipGraphResetRef.current;
      if (skipReset) {
        skipGraphResetRef.current = null;
        restoreSelectionRef.current = null;
        if (
          String(skipReset.id) === String(version.id) &&
          skipReset.nodesJson === version.nodesJson &&
          skipReset.edgesJson === version.edgesJson
        )
          return;
      }
      const graph = normalizeFlowGraph(version);
      const invalidConditionTargets = invalidConditionTargetNodeIds(graph);
      setNodes(graph.nodes);
      setEdges(graph.edges);
      // 版本数据刷新时，若当前选中节点仍存在于图中则保持选中，
      // 避免保存草稿等无感刷新打断用户正在进行的配置。
      setSelectedNodeId((current) =>
        current && graph.nodes.some((node) => node.id === current)
          ? current
          : "start",
      );
      setSelectedConditionBranchId(null);
      setSelectedEdgeId(null);
      setValidationError(
        invalidConditionTargets.size > 0
          ? "存在连入条件分支出口的非法连线，请删除后重新连接到条件节点顶部入口。"
          : null,
      );
      setValidationErrors(
        Object.fromEntries(
          [...invalidConditionTargets].map((nodeId) => [
            nodeId,
            "条件节点只能从顶部入口进入",
          ]),
        ),
      );
      undoStackRef.current = [];
      redoStackRef.current = [];
      updateHistoryCounts();
      dirtyRef.current = false;
      onDirtyChange(false);
    }, [
      version.id,
      version.nodesJson,
      version.edgesJson,
      setNodes,
      setEdges,
      onDirtyChange,
    ]);

    const formOptions = useMemo(
      () =>
        [...(formTemplates.data ?? [])].sort((left, right) => {
          const category = (
            left.categoryName?.trim() || "未分类"
          ).localeCompare(right.categoryName?.trim() || "未分类", "zh-CN");
          if (category !== 0) return category;
          const name = left.name.localeCompare(right.name, "zh-CN");
          return name !== 0
            ? name
            : right.version.localeCompare(left.version, "zh-CN");
        }),
      [formTemplates.data],
    );
    const referenceableFormVersionIds = useMemo(
      () => new Set(formOptions.map((option) => String(option.id))),
      [formOptions],
    );

    const validateGraphForPublish = () => {
      const result = validateFlowGraphForPublish(
        { nodes, edges },
        formTemplates.isSuccess ? referenceableFormVersionIds : undefined,
      );
      setValidationError(result.message);
      setValidationErrors(result.nodeErrors);
      return result.valid;
    };

    const refreshPublishValidation = async () => {
      const refreshed = await formTemplates.refetch();
      const refreshedFormVersionIds = new Set(
        (refreshed.data ?? []).map((option) => String(option.id)),
      );
      const result = validateFlowGraphForPublish(
        { nodes, edges },
        refreshed.isSuccess ? refreshedFormVersionIds : undefined,
      );
      setValidationError(result.message);
      setValidationErrors(result.nodeErrors);
      return {
        directoryLoaded: refreshed.isSuccess,
        formReferenceError: nodes.some(
          (node) =>
            node.data.kind === "FORM" &&
            (!node.data.config?.formTemplateVersionId ||
              !refreshedFormVersionIds.has(
                String(node.data.config.formTemplateVersionId),
              )),
        ),
      };
    };
    const markFormReferenceErrors = () => {
      const formNodeErrors = Object.fromEntries(
        nodes
          .filter((node) => node.data.kind === "FORM")
          .map((node) => [
            node.id,
            node.data.config?.formTemplateVersionId
              ? "请选择当前生效的表单版本"
              : "请选择生效表单版本",
          ]),
      );
      if (Object.keys(formNodeErrors).length > 0) {
        setValidationError("存在不能引用的表单版本");
        setValidationErrors((current) => ({ ...current, ...formNodeErrors }));
      }
    };

    useImperativeHandle(
      ref,
      () => ({
        graph: () => ({ nodes, edges }),
        deleteNode: deleteNodeById,
        markSaved: () => {
          dirtyRef.current = false;
          onDirtyChange(false);
        },
        selection: () => selectedNodeId,
        outdatedFormProcessReferenceCount: () =>
          outdatedFormProcessReferences.length,
        validateForPublish: validateGraphForPublish,
        refreshPublishValidation,
        markFormReferenceErrors,
      }),
      [
        nodes,
        edges,
        selectedNodeId,
        onDirtyChange,
        formTemplates.isSuccess,
        referenceableFormVersionIds,
        formTemplates.refetch,
        outdatedFormProcessReferences.length,
      ],
    );

    const selectedNode =
      nodes.find((node) => node.id === selectedNodeId) ?? null;
    const selectedConditionBranches =
      selectedNode?.data.kind === "CONDITION"
        ? conditionBranchesForConfig(selectedNode.data.config)
        : [];
    const selectedConditionBranch =
      selectedConditionBranches.find(
        (branch) => branch.id === selectedConditionBranchId,
      ) ??
      selectedConditionBranches[0] ??
      null;
    const selectedFormOption =
      formOptions.find(
        (option) =>
          option.id === selectedNode?.data.config?.formTemplateVersionId,
      ) ?? null;
    const selectedProcessOption =
      (formProcesses.data ?? []).find(
        (option) =>
          option.versionId === selectedNode?.data.config?.formProcessVersionId,
      ) ?? null;
    const selectedFormProcessReference =
      (formProcessReferences.data ?? []).find(
        (reference) => reference.nodeId === selectedNode?.id,
      ) ?? null;
    const selectedOutdatedFormProcessReference =
      selectedFormProcessReference?.outdated &&
      !(formProcesses.data ?? []).some(
        (option) =>
          option.versionId ===
          String(selectedNode?.data.config?.formProcessVersionId ?? ""),
      )
        ? selectedFormProcessReference
        : null;
    const upgradeSelectedFormProcess = () => {
      if (!editable || !selectedOutdatedFormProcessReference) return;
      const latestVersionId = String(
        selectedOutdatedFormProcessReference.latestFormProcessVersionId ?? "",
      );
      const latestOption = (formProcesses.data ?? []).find(
        (option) => option.versionId === latestVersionId,
      );
      updateSelectedNode({
        config: {
          formProcessVersionId: latestVersionId,
          formProcessName: latestOption
            ? `${latestOption.name} · V${latestOption.versionNumber}`
            : `${selectedOutdatedFormProcessReference.formProcessName || "表单流程"} · V${selectedOutdatedFormProcessReference.latestFormProcessVersionNumber}`,
        },
      });
    };
    const selectedHistoricalProcessLabel =
      selectedNode?.data.config?.formProcessVersionId && !selectedProcessOption
        ? `${selectedNode.data.config.formProcessName || "已保存版本"}（历史版本）`
        : "";
    const selectedProcessVersionQuery = useQuery({
      queryKey: [
        "form-process-version",
        selectedProcessOption?.id,
        selectedNode?.data.config?.formProcessVersionId,
      ],
      enabled: Boolean(
        selectedProcessOption?.id &&
        selectedNode?.data.config?.formProcessVersionId,
      ),
      queryFn: async () =>
        (
          await getFormProcessVersion(
            selectedProcessOption!.id,
            selectedNode!.data.config!.formProcessVersionId!,
          )
        ).data.data as { nodesJson?: string | null },
    });
    const selectedTemplateVersionQuery = useQuery({
      queryKey: [
        "form-template-version",
        selectedFormOption?.templateId,
        selectedFormOption?.id,
      ],
      enabled: Boolean(selectedFormOption),
      queryFn: async () =>
        (
          await getFormTemplateVersion(
            selectedFormOption!.templateId,
            selectedFormOption!.id,
          )
        ).data.data,
    });
    const selectedProcessSubjects = useMemo(
      () => processPermissionSubjects(selectedProcessVersionQuery.data),
      [selectedProcessVersionQuery.data],
    );
    const selectedProcessBuiltinEvents = useMemo(
      () => processBuiltinEvents(selectedProcessVersionQuery.data),
      [selectedProcessVersionQuery.data],
    );
    const selectedTemplateFields = useMemo(
      () => templateFields(selectedTemplateVersionQuery.data),
      [selectedTemplateVersionQuery.data],
    );
    const selectedPreviewDocument = useMemo(() => {
      if (!selectedFormOption || !selectedTemplateVersionQuery.data)
        return null;
      const row: TemplateModelingRecord = {
        id: selectedFormOption.templateId,
        code: selectedFormOption.code,
        name: selectedFormOption.name,
        type: "FORM_TEMPLATE",
      };
      return parseReactTemplateDesignerDocument(
        row,
        selectedTemplateVersionQuery.data as TemplateVersionRecord,
      );
    }, [selectedFormOption, selectedTemplateVersionQuery.data]);
    const closePreview = () => {
      setPreviewForm(null);
      // Dialog focus restoration can arrive after ClickAwayListener's document
      // event. Restore the picker on the next task so closing a preview does not
      // discard the user's current form selection context.
      window.setTimeout(() => setFormPickerOpen(true), 0);
    };
    const formGroups = useMemo(() => {
      const keyword = formPickerSearch.trim().toLocaleLowerCase();
      const groups = new Map<string, WorkFormOption[]>();
      formOptions.forEach((option) => {
        if (
          keyword &&
          !`${option.name} ${option.version} ${option.code ?? ""} ${option.categoryName ?? ""}`
            .toLocaleLowerCase()
            .includes(keyword)
        )
          return;
        const category = option.categoryName?.trim() || "未分类";
        groups.set(category, [...(groups.get(category) ?? []), option]);
      });
      return [...groups.entries()]
        .sort(([left], [right]) => left.localeCompare(right, "zh-CN"))
        .map(([category, options]) => {
          const parents = new Map<string, WorkFormOption[]>();
          options.forEach((option) =>
            parents.set(option.templateId, [
              ...(parents.get(option.templateId) ?? []),
              option,
            ]),
          );
          return {
            category,
            parents: [...parents.entries()].map(([templateId, versions]) => ({
              templateId,
              name: versions[0].name,
              code: versions[0].code,
              versions,
            })),
          };
        });
    }, [formOptions, formPickerSearch]);
    useEffect(() => {
      if (!formPickerOpen) return;
      setExpandedFormCategories((current) => {
        const next = new Set(current);
        formGroups.forEach((group) => {
          if (!next.has(group.category)) next.add(group.category);
        });
        return next;
      });
      if (formPickerSearch.trim()) {
        setExpandedFormParents((current) => {
          const next = new Set(current);
          formGroups.forEach((group) =>
            group.parents.forEach((parent) =>
              next.add(`${group.category}::${parent.templateId}`),
            ),
          );
          return next;
        });
      }
    }, [formGroups, formPickerOpen, formPickerSearch]);
    useEffect(() => {
      if (!editable && formPickerOpen) {
        setFormPickerOpen(false);
        setFormPickerSearch("");
      }
    }, [editable, formPickerOpen]);
    const addNode = (kind: Exclude<WorkNodeKind, "START" | "END">) => {
      if (!editable) return;
      const before = currentGraph();
      const id = `${kind.toLowerCase()}-${Date.now()}`;
      const label = nodeAppearance[kind].label;
      setNodes((current) => [
        ...current,
        {
          id,
          type: "workNode",
          selectable: false,
          position: findAvailablePosition(
            {
              x: 140 + current.length * 70,
              y: 120 + (current.length % 3) * 110,
            },
            kind,
          ),
          data: {
            label,
            kind,
            config: kind === "CONDITION" ? normalizedConditionConfig({}) : {},
          },
        },
      ]);
      setSelectedNodeId(id);
      setSelectedEdgeId(null);
      markDirty();
      recordHistory(before);
    };

    const addConditionBranch = () => {
      if (!editable || !selectedNode || selectedNode.data.kind !== "CONDITION")
        return;
      const before = currentGraph();
      const branches = conditionBranchesForConfig(selectedNode.data.config);
      const branch: ConditionBranch = {
        id: `condition-${Date.now()}`,
        name: `条件 ${branches.length + 1}`,
        conditionRule: null,
      };
      setNodes((current) =>
        current.map((node) =>
          node.id !== selectedNode.id
            ? node
            : {
                ...node,
                data: {
                  ...node.data,
                  config: {
                    ...node.data.config,
                    conditionBranches: [...branches, branch],
                    conditionDefaultBranch: CONDITION_DEFAULT_BRANCH,
                  },
                },
              },
        ),
      );
      setConditionRuleDraft(null);
      setConditionRuleDialogOpen(false);
      setSelectedConditionBranchId(branch.id);
      markDirty();
      recordHistory(before);
    };

    const updateConditionBranch = (
      branchId: string,
      patch: Partial<ConditionBranch>,
    ) => {
      if (!editable || !selectedNode || selectedNode.data.kind !== "CONDITION")
        return;
      const branches = conditionBranchesForConfig(selectedNode.data.config);
      const before = currentGraph();
      setNodes((current) =>
        current.map((node) =>
          node.id !== selectedNode.id
            ? node
            : {
                ...node,
                data: {
                  ...node.data,
                  config: {
                    ...node.data.config,
                    conditionBranches: branches.map((branch) =>
                      branch.id === branchId ? { ...branch, ...patch } : branch,
                    ),
                    conditionDefaultBranch: CONDITION_DEFAULT_BRANCH,
                  },
                },
              },
        ),
      );
      markDirty();
      recordHistory(before);
    };

    const deleteConditionBranch = (branchId: string) => {
      if (!editable || !selectedNode || selectedNode.data.kind !== "CONDITION")
        return;
      const branches = conditionBranchesForConfig(selectedNode.data.config);
      if (branches.length <= 1) return;
      const before = currentGraph();
      const handle = conditionHandleForBranch(branchId);
      setNodes((current) =>
        current.map((node) =>
          node.id !== selectedNode.id
            ? node
            : {
                ...node,
                data: {
                  ...node.data,
                  config: {
                    ...node.data.config,
                    conditionBranches: branches.filter(
                      (branch) => branch.id !== branchId,
                    ),
                    conditionDefaultBranch: CONDITION_DEFAULT_BRANCH,
                  },
                },
              },
        ),
      );
      setEdges((current) =>
        current.filter(
          (edge) =>
            !(edge.source === selectedNode.id && edge.sourceHandle === handle),
        ),
      );
      setSelectedConditionBranchId(null);
      markDirty();
      recordHistory(before);
    };

    const updateSelectedNode = (
      patch: Partial<WorkNodeData> & {
        config?: Partial<NonNullable<WorkNodeData["config"]>>;
      },
    ) => {
      if (!editable || !selectedNode) return;
      const before = currentGraph();
      setNodes((current) =>
        current.map((node) =>
          node.id !== selectedNode.id
            ? node
            : {
                ...node,
                data: {
                  ...node.data,
                  ...patch,
                  config: { ...node.data.config, ...patch.config },
                },
              },
        ),
      );
      markDirty();
      recordHistory(before);
    };

    useEffect(() => {
      if (
        selectedNode?.data.kind !== "FORM" ||
        !selectedProcessVersionQuery.isSuccess ||
        !selectedTemplateVersionQuery.isSuccess
      )
        return;
      const current = selectedNode.data.config?.fieldPermissions ?? {};
      const next = pruneFieldPermissions(
        current,
        selectedProcessSubjects,
        selectedTemplateFields,
      );
      const currentBindings = selectedNode.data.config?.eventBindings ?? {};
      const nextBindings = pruneEventBindings(
        currentBindings,
        selectedProcessBuiltinEvents,
        selectedTemplateFields,
      );
      if (
        JSON.stringify(current) !== JSON.stringify(next) ||
        JSON.stringify(currentBindings) !== JSON.stringify(nextBindings)
      ) {
        updateSelectedNode({
          config: { fieldPermissions: next, eventBindings: nextBindings },
        });
      }
    }, [
      selectedNode?.id,
      selectedNode?.data.config?.fieldPermissions,
      selectedProcessVersionQuery.isSuccess,
      selectedTemplateVersionQuery.isSuccess,
      selectedProcessSubjects,
      selectedProcessBuiltinEvents,
      selectedTemplateFields,
    ]);

    const conditionDeletionSet = (
      conditionId: string,
      graph = currentGraph(),
    ) => {
      const outgoing = new Map<string, string[]>();
      const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
      graph.edges.forEach((edge) => {
        outgoing.set(edge.source, [
          ...(outgoing.get(edge.source) ?? []),
          edge.target,
        ]);
      });

      const reachable = new Set<string>();
      const queue = [...(outgoing.get(conditionId) ?? [])];
      while (queue.length > 0) {
        const nodeId = queue.shift()!;
        const node = nodeById.get(nodeId);
        if (
          nodeId === conditionId ||
          reachable.has(nodeId) ||
          node?.data.kind === "START" ||
          node?.data.kind === "END"
        )
          continue;
        reachable.add(nodeId);
        queue.push(...(outgoing.get(nodeId) ?? []));
      }

      // A shared downstream node belongs to another branch as well. Keep it and
      // everything below it so deleting this condition cannot break that branch.
      const protectedNodes = new Set<string>();
      reachable.forEach((nodeId) => {
        if (
          graph.edges.some(
            (edge) =>
              edge.target === nodeId &&
              edge.source !== conditionId &&
              !reachable.has(edge.source),
          )
        ) {
          protectedNodes.add(nodeId);
        }
      });
      const protectedQueue = [...protectedNodes];
      while (protectedQueue.length > 0) {
        const nodeId = protectedQueue.shift()!;
        (outgoing.get(nodeId) ?? []).forEach((targetId) => {
          if (reachable.has(targetId) && !protectedNodes.has(targetId)) {
            protectedNodes.add(targetId);
            protectedQueue.push(targetId);
          }
        });
      }

      return new Set([
        conditionId,
        ...[...reachable].filter((nodeId) => !protectedNodes.has(nodeId)),
      ]);
    };

    const deleteNodeById = (nodeId: string) => {
      if (!editable) return;
      const node = nodesRef.current.find((current) => current.id === nodeId);
      if (!node || node.data.kind === "START" || node.data.kind === "END")
        return;
      const before = currentGraph();
      const deletedNodeIds =
        node.data.kind === "CONDITION"
          ? conditionDeletionSet(nodeId, before)
          : new Set([nodeId]);
      setNodes((current) =>
        current.filter((currentNode) => !deletedNodeIds.has(currentNode.id)),
      );
      setEdges((current) =>
        current.filter(
          (edge) =>
            !deletedNodeIds.has(edge.source) &&
            !deletedNodeIds.has(edge.target),
        ),
      );
      setSelectedNodeId(null);
      setSelectedConditionBranchId(null);
      setSelectedEdgeId(null);
      markDirty();
      recordHistory(before);
    };

    const requestDeleteSelectedNode = () => {
      if (
        !editable ||
        !selectedNode ||
        selectedNode.data.kind === "START" ||
        selectedNode.data.kind === "END"
      )
        return;
      if (selectedNode.data.kind === "CONDITION") {
        const descendantCount = Math.max(
          conditionDeletionSet(selectedNode.id).size - 1,
          0,
        );
        onRequestDeleteConditionNode(selectedNode.id, descendantCount);
        return;
      }
      deleteNodeById(selectedNode.id);
    };

    const deleteSelectedEdge = () => {
      if (!editable || !selectedEdgeId) return;
      const before = currentGraph();
      setEdges((current) =>
        current.filter((edge) => edge.id !== selectedEdgeId),
      );
      setSelectedEdgeId(null);
      markDirty();
      recordHistory(before);
    };

    const handleCanvasKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!editable) return;
      const target = event.target as HTMLElement;
      if (
        target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
      )
        return;
      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (modifier && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        if (selectedNodeId) requestDeleteSelectedNode();
        else if (selectedEdgeId) deleteSelectedEdge();
      }
    };

    const updateAlignmentGuides = (dragged: FlowNode) => {
      const width = nodeSize(dragged).width;
      const height = nodeSize(dragged).height;
      const currentX = [
        dragged.position.x,
        dragged.position.x + width / 2,
        dragged.position.x + width,
      ];
      const currentY = [
        dragged.position.y,
        dragged.position.y + height / 2,
        dragged.position.y + height,
      ];
      let vertical: number | null = null;
      let horizontal: number | null = null;
      for (const other of nodes) {
        if (other.id === dragged.id) continue;
        const otherWidth = nodeSize(other).width;
        const otherHeight = nodeSize(other).height;
        const otherX = [
          other.position.x,
          other.position.x + otherWidth / 2,
          other.position.x + otherWidth,
        ];
        const otherY = [
          other.position.y,
          other.position.y + otherHeight / 2,
          other.position.y + otherHeight,
        ];
        if (vertical === null) {
          const match = currentX.find((value) =>
            otherX.some((candidate) => Math.abs(value - candidate) <= 8),
          );
          if (match !== undefined)
            vertical = otherX.reduce(
              (closest, candidate) =>
                Math.abs(candidate - match) < Math.abs(closest - match)
                  ? candidate
                  : closest,
              otherX[0],
            );
        }
        if (horizontal === null) {
          const match = currentY.find((value) =>
            otherY.some((candidate) => Math.abs(value - candidate) <= 8),
          );
          if (match !== undefined)
            horizontal = otherY.reduce(
              (closest, candidate) =>
                Math.abs(candidate - match) < Math.abs(closest - match)
                  ? candidate
                  : closest,
              otherY[0],
            );
        }
        if (vertical !== null && horizontal !== null) break;
      }
      setGuides({ vertical, horizontal });
    };

    const snapPositionToAlignment = (dragged: FlowNode) => {
      const width = nodeSize(dragged).width;
      const height = nodeSize(dragged).height;
      const currentX = [
        dragged.position.x,
        dragged.position.x + width / 2,
        dragged.position.x + width,
      ];
      const currentY = [
        dragged.position.y,
        dragged.position.y + height / 2,
        dragged.position.y + height,
      ];
      let bestX: { delta: number; value: number } | null = null;
      let bestY: { delta: number; value: number } | null = null;
      for (const other of nodes) {
        if (other.id === dragged.id) continue;
        const otherWidth = nodeSize(other).width;
        const otherHeight = nodeSize(other).height;
        const otherX = [
          other.position.x,
          other.position.x + otherWidth / 2,
          other.position.x + otherWidth,
        ];
        const otherY = [
          other.position.y,
          other.position.y + otherHeight / 2,
          other.position.y + otherHeight,
        ];
        for (const value of currentX) {
          for (const candidate of otherX) {
            const delta = candidate - value;
            if (
              Math.abs(delta) <= 12 &&
              (!bestX || Math.abs(delta) < bestX.delta)
            )
              bestX = {
                delta: Math.abs(delta),
                value: dragged.position.x + delta,
              };
          }
        }
        for (const value of currentY) {
          for (const candidate of otherY) {
            const delta = candidate - value;
            if (
              Math.abs(delta) <= 12 &&
              (!bestY || Math.abs(delta) < bestY.delta)
            )
              bestY = {
                delta: Math.abs(delta),
                value: dragged.position.y + delta,
              };
          }
        }
      }
      return {
        x: bestX ? bestX.value : dragged.position.x,
        y: bestY ? bestY.value : dragged.position.y,
      };
    };

    const selectedKind = selectedNode?.data.kind;
    const nodeTool = (
      kind: Exclude<WorkNodeKind, "START" | "END">,
      icon: ReactNode,
    ) => (
      <Button
        key={kind}
        size="small"
        startIcon={icon}
        onClick={() => addNode(kind)}
      >
        {nodeAppearance[kind].label}
      </Button>
    );

    const quickActions = {
      editable,
      selectedNodeId,
      validationErrors,
      menu: quickMenu,
      onOpen: (nodeId: string, direction: QuickDirection) => {
        const source = nodes.find((node) => node.id === nodeId);
        const nearby = source
          ? nearbyNodeForDirection(source, direction)
          : null;
        if (source && nearby) connectQuickDirection(source, direction, nearby);
        else
          setQuickMenu((current) =>
            current?.nodeId === nodeId && current.direction === direction
              ? null
              : { nodeId, direction },
          );
      },
      onAdd: (
        nodeId: string,
        direction: QuickDirection,
        kind: Exclude<WorkNodeKind, "START" | "END">,
      ) => {
        const source = nodes.find((node) => node.id === nodeId);
        if (source) addQuickNode(source, direction, kind);
      },
      branchMenu,
      onOpenBranch: (nodeId: string, branchId: string) => {
        const source = nodes.find((node) => node.id === nodeId);
        const nearby = source
          ? nearbyNodeForConditionBranch(source, branchId)
          : null;
        if (source && nearby) {
          const before = currentGraph();
          const sourceHandle = conditionHandleForBranch(branchId);
          const targetHandle =
            nearby.data.kind === "CONDITION" ? "condition-input" : "target-top";
          if (!hasReverseConnection(source.id, nearby.id, before.edges)) {
            const edge: Edge = withFlowMarker({
              id: `${source.id}-${nearby.id}-${Date.now()}`,
              source: source.id,
              sourceHandle,
              target: nearby.id,
              targetHandle,
            });
            setEdges((current) => addEdge(edge, current));
            setSelectedEdgeId(edge.id);
            setSelectedNodeId(null);
            setQuickMenu(null);
            setBranchMenu(null);
            markDirty();
            recordHistory(before);
          }
        } else {
          setQuickMenu(null);
          setBranchMenu((current) =>
            current?.nodeId === nodeId && current.branchId === branchId
              ? null
              : { nodeId, branchId },
          );
        }
      },
      onAddBranch: (
        nodeId: string,
        branchId: string,
        kind: Exclude<WorkNodeKind, "START" | "END">,
      ) => {
        setSelectedNodeId(nodeId);
        setBranchMenu(null);
        addConditionBranchNode(nodeId, branchId, kind);
      },
      canUseDirection: canUseQuickDirection,
      canUseBranch: canUseQuickBranch,
    } satisfies QuickActionContextValue;

    return (
      <Paper
        variant="outlined"
        sx={{
          width: "100%",
          height: "100%",
          minWidth: 0,
          minHeight: 0,
          flex: 1,
          overflow: "hidden",
          bgcolor: "#fbfcfe",
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            lg: "minmax(0, 1fr) clamp(400px, 30vw, 480px)",
          },
          gridTemplateRows: {
            xs: selectedNode ? "minmax(0, 1fr) minmax(280px, 42%)" : "1fr",
            lg: "1fr",
          },
        }}
      >
        <ReactFlowProvider>
          <Box
            ref={canvasRootRef}
            tabIndex={0}
            onKeyDown={handleCanvasKeyDown}
            onDragStartCapture={(event) => event.preventDefault()}
            sx={{
              width: "100%",
              height: "100%",
              minWidth: 0,
              minHeight: 0,
              position: "relative",
              userSelect: "none",
              WebkitUserSelect: "none",
              "& .react-flow__pane, & .react-flow__viewport, & .react-flow__node, & .react-flow__node *":
                { userSelect: "none", WebkitUserSelect: "none" },
              "& .react-flow__selection": {
                display: "none !important",
                visibility: "hidden !important",
                pointerEvents: "none !important",
              },
            }}
          >
            {editable ? (
              <Stack
                direction="row"
                spacing={0.5}
                sx={{
                  position: "absolute",
                  zIndex: 11,
                  top: 12,
                  left: { xs: 12, md: 16 },
                  maxWidth: "calc(100% - 28px)",
                  p: 0.5,
                  bgcolor: "#fff",
                  border: "1px solid #e4e7ed",
                  borderRadius: 1,
                  flexWrap: "nowrap",
                }}
              >
                {nodeTool("FORM", <FactCheckOutlined fontSize="small" />)}
                {nodeTool("CONDITION", <SchemaOutlined fontSize="small" />)}
              </Stack>
            ) : null}
            <QuickActionContext.Provider value={quickActions}>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={workflowNodeTypes}
                onNodeClick={(_, node) => {
                  canvasRootRef.current?.focus({ preventScroll: true });
                  setSelectedNodeId(node.id);
                  setSelectedEdgeId(null);
                  setQuickMenu(null);
                  setBranchMenu(null);
                }}
                onPaneClick={() => {
                  canvasRootRef.current?.focus({ preventScroll: true });
                  setSelectedEdgeId(null);
                  setQuickMenu(null);
                  setBranchMenu(null);
                }}
                onEdgeClick={(_, edge) => {
                  canvasRootRef.current?.focus({ preventScroll: true });
                  if (editable) {
                    setSelectedEdgeId(edge.id);
                    setSelectedNodeId(null);
                  }
                  setQuickMenu(null);
                  setBranchMenu(null);
                }}
                onNodeDragStart={() => {
                  dragStartGraphRef.current = currentGraph();
                  setQuickMenu(null);
                  setBranchMenu(null);
                }}
                onNodeDrag={(_, node) => {
                  const snappedPosition = snapPositionToAlignment(node);
                  const snappedNode =
                    snappedPosition.x === node.position.x &&
                    snappedPosition.y === node.position.y
                      ? node
                      : { ...node, position: snappedPosition };
                  if (snappedNode !== node)
                    setNodes((current) =>
                      current.map((item) =>
                        item.id === node.id
                          ? { ...item, position: snappedPosition }
                          : item,
                      ),
                    );
                  updateAlignmentGuides(snappedNode);
                }}
                onNodeDragStop={() => {
                  setGuides({ vertical: null, horizontal: null });
                  if (
                    dragStartGraphRef.current &&
                    !sameGraph(dragStartGraphRef.current, currentGraph())
                  )
                    recordHistory(dragStartGraphRef.current);
                  dragStartGraphRef.current = null;
                }}
                onInit={(instance) => {
                  flowInstanceRef.current = instance;
                }}
                onNodesChange={
                  editable
                    ? (changes) => {
                        onNodesChange(changes);
                        if (changes.some((change) => change.type !== "select"))
                          markDirty();
                      }
                    : undefined
                }
                onEdgesChange={
                  editable
                    ? (changes) => {
                        onEdgesChange(changes);
                        if (changes.some((change) => change.type !== "select"))
                          markDirty();
                      }
                    : undefined
                }
                isValidConnection={
                  editable
                    ? (connection) =>
                        connection.source !== connection.target &&
                        canCreateConnection(
                          connection.source,
                          connection.sourceHandle,
                        ) &&
                        canReceiveConnection(
                          connection.target,
                          connection.targetHandle,
                        ) &&
                        !hasReverseConnection(
                          connection.source,
                          connection.target,
                        )
                    : undefined
                }
                onConnect={
                  editable
                    ? (connection: Connection) => {
                        const before = currentGraph();
                        if (
                          connection.source === connection.target ||
                          !canCreateConnection(
                            connection.source,
                            connection.sourceHandle,
                            before.edges,
                          ) ||
                          !canReceiveConnection(
                            connection.target,
                            connection.targetHandle,
                          ) ||
                          hasReverseConnection(
                            connection.source,
                            connection.target,
                            before.edges,
                          )
                        )
                          return;
                        const targetNode = nodesRef.current.find(
                          (node) => node.id === connection.target,
                        );
                        const normalizedConnection = {
                          ...connection,
                          targetHandle:
                            targetNode?.data.kind === "CONDITION"
                              ? "condition-input"
                              : connection.targetHandle,
                        };
                        setEdges((current) =>
                          addEdge(
                            withFlowMarker({
                              ...normalizedConnection,
                              id: `${connection.source}-${connection.target}-${Date.now()}`,
                            }),
                            current,
                          ),
                        );
                        setSelectedEdgeId(null);
                        markDirty();
                        recordHistory(before);
                      }
                    : undefined
                }
                snapToGrid
                snapGrid={[2, 2]}
                selectionOnDrag={false}
                selectionKeyCode="__flow_selection_disabled__"
                multiSelectionKeyCode="__flow_multi_selection_disabled__"
                selectNodesOnDrag={false}
                nodesConnectable={editable}
                nodesDraggable={editable}
                elementsSelectable
                deleteKeyCode={null}
                defaultEdgeOptions={FLOW_EDGE_DEFAULTS}
                fitView
                fitViewOptions={{ padding: 0.32, minZoom: 0.52, maxZoom: 0.82 }}
                proOptions={{ hideAttribution: true }}
              >
                <Background color="#dfe4ea" gap={20} size={1} />
                <Controls position="bottom-left">
                  {editable ? (
                    <>
                      <Tooltip
                        title="撤销（Ctrl/Cmd+Z）"
                        placement="right"
                        arrow
                      >
                        <ControlButton
                          aria-label="撤销"
                          onClick={undo}
                          disabled={historyState.undo === 0}
                        >
                          <UndoOutlined fontSize="small" />
                        </ControlButton>
                      </Tooltip>
                      <Tooltip
                        title="重做（Ctrl/Cmd+Shift+Z）"
                        placement="right"
                        arrow
                      >
                        <ControlButton
                          aria-label="重做"
                          onClick={redo}
                          disabled={historyState.redo === 0}
                        >
                          <RedoOutlined fontSize="small" />
                        </ControlButton>
                      </Tooltip>
                    </>
                  ) : null}
                  {editable ? (
                    <Tooltip title="一键整理布局" placement="right" arrow>
                      <ControlButton
                        aria-label="一键整理布局"
                        onClick={alignNodes}
                      >
                        <AutoFixHighOutlined fontSize="small" />
                      </ControlButton>
                    </Tooltip>
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
              <AlignmentGuides guides={guides} />
            </QuickActionContext.Provider>
          </Box>
        </ReactFlowProvider>
        <Box
          sx={{
            borderLeft: { lg: "1px solid #e4e7ed" },
            borderTop: { xs: "1px solid #e4e7ed", lg: 0 },
            bgcolor: "#fff",
            overflow: "auto",
            minHeight: 0,
          }}
        >
          {editable && outdatedFormProcessReferences.length > 0 ? (
            <Alert
              severity="warning"
              sx={{ m: 1.5, mb: 0, alignItems: "center" }}
              action={
                <Button
                  color="inherit"
                  size="small"
                  onClick={() =>
                    setSelectedNodeId(outdatedFormProcessReferences[0].nodeId)
                  }
                >
                  查看
                </Button>
              }
            >
              有 {outdatedFormProcessReferences.length}{" "}
              个表单填报节点仍在使用旧版表单流程，建议升级到当前发布版本。
            </Alert>
          ) : null}
          {selectedNode ? (
            <>
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{ px: 1.5, py: 1.25, borderBottom: "1px solid #e4e7ed" }}
              >
                <Typography variant="subtitle2" fontWeight={650}>
                  节点设置
                </Typography>
                <IconButton
                  size="small"
                  aria-label="关闭节点设置"
                  onClick={() => setSelectedNodeId(null)}
                >
                  <Close fontSize="small" />
                </IconButton>
              </Stack>
              <Stack spacing={1.75} sx={{ p: 1.5 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    节点类型
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 0.5 }}>
                    {nodeAppearance[selectedKind ?? "FORM"].label}
                  </Typography>
                </Box>
                {selectedKind !== "START" && selectedKind !== "END" ? (
                  <TextField
                    size="small"
                    label="节点名称"
                    value={selectedNode.data.label || ""}
                    onChange={(event) =>
                      updateSelectedNode({ label: event.target.value })
                    }
                    disabled={!editable}
                    fullWidth
                  />
                ) : null}
                {selectedKind === "FORM" ? (
                  <>
                    {selectedOutdatedFormProcessReference ? (
                      <Alert
                        severity="warning"
                        sx={{ alignItems: "flex-start" }}
                      >
                        <Stack spacing={1}>
                          <Typography variant="body2">
                            当前使用表单流程 V
                            {
                              selectedOutdatedFormProcessReference.formProcessVersionNumber
                            }
                            ，已有新版 V
                            {
                              selectedOutdatedFormProcessReference.latestFormProcessVersionNumber
                            }
                            。
                          </Typography>
                          {selectedOutdatedFormProcessReference.upgradeBlockers
                            ?.length ? (
                            <Typography variant="caption" component="div">
                              暂不能直接升级：
                              {selectedOutdatedFormProcessReference.upgradeBlockers.join(
                                "；",
                              )}
                            </Typography>
                          ) : null}
                          {selectedOutdatedFormProcessReference.upgradeAvailable ? (
                            <Box>
                              <Button
                                size="small"
                                variant="outlined"
                                onClick={upgradeSelectedFormProcess}
                              >
                                {`升级到 V${selectedOutdatedFormProcessReference.latestFormProcessVersionNumber}`}
                              </Button>
                            </Box>
                          ) : null}
                        </Stack>
                      </Alert>
                    ) : null}
                    <Box
                      ref={formPickerAnchorRef}
                      className={selectedFormOption ? "has-value" : undefined}
                      sx={{
                        position: "relative",
                        "& .form-picker-end-adornment": {
                          position: "absolute",
                          right: 4,
                          top: "50%",
                          transform: "translateY(-50%)",
                          margin: 0,
                          zIndex: 2,
                          pointerEvents: "none",
                        },
                        "& .form-picker-clear-button": {
                          opacity: 0,
                          pointerEvents: "none",
                          color: "#909399",
                          transition: "opacity 120ms ease",
                        },
                        "& .form-picker-expand-icon": {
                          transition: "opacity 120ms ease",
                        },
                        "&.has-value:hover .form-picker-expand-icon, &.has-value:focus-within .form-picker-expand-icon":
                          { opacity: 0 },
                        "&.has-value:hover .form-picker-clear-button, &.has-value:focus-within .form-picker-clear-button":
                          { opacity: 0.55, pointerEvents: "auto" },
                        "& .form-picker-clear-button:hover": { opacity: 0.85 },
                      }}
                    >
                      <TextField
                        size="small"
                        required
                        fullWidth
                        label="业务单据"
                        value={
                          selectedFormOption
                            ? `${selectedFormOption.name} · ${selectedFormOption.version}`
                            : ""
                        }
                        placeholder="请选择生效业务单据版本"
                        error={
                          Boolean(
                            selectedNode && validationErrors[selectedNode.id],
                          ) && !selectedFormOption
                        }
                        helperText={
                          selectedNode &&
                          validationErrors[selectedNode.id] &&
                          !selectedFormOption
                            ? validationErrors[selectedNode.id]
                            : formTemplates.isError
                              ? "业务单据列表加载失败"
                              : "请选择一个生效的业务单据版本"
                        }
                        disabled={!editable || formTemplates.isLoading}
                        onClick={() => {
                          if (editable) setFormPickerOpen(true);
                        }}
                        onChange={(event) => {
                          if (!editable) return;
                          setFormPickerSearch(event.target.value);
                          setFormPickerOpen(true);
                        }}
                        InputProps={{
                          readOnly: Boolean(selectedFormOption),
                          endAdornment: (
                            <InputAdornment
                              position="end"
                              className="form-picker-end-adornment"
                            >
                              {selectedFormOption ? (
                                <Tooltip title="清除引用" arrow>
                                  <IconButton
                                    className="form-picker-clear-button"
                                    size="small"
                                    aria-label="清除引用业务单据"
                                    onMouseDown={(event) =>
                                      event.stopPropagation()
                                    }
                                    onClick={() => {
                                      if (!editable) return;
                                      setValidationError(null);
                                      updateSelectedNode({
                                        config: {
                                          formTemplateVersionId: "",
                                          formTemplateName: "",
                                          fieldPermissions: {},
                                          eventBindings: {},
                                        },
                                      });
                                      setFormPickerSearch("");
                                      setFormPickerOpen(true);
                                    }}
                                  >
                                    <Close fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              ) : null}
                              <ExpandMore
                                className="form-picker-expand-icon"
                                sx={{
                                  transform: formPickerOpen
                                    ? "rotate(180deg)"
                                    : "none",
                                }}
                              />
                            </InputAdornment>
                          ),
                        }}
                      />
                      <Popper
                        open={editable && formPickerOpen}
                        anchorEl={formPickerAnchorRef.current}
                        placement="bottom-start"
                        style={{
                          zIndex: 1400,
                          width: "min(560px, calc(100vw - 32px))",
                        }}
                      >
                        <ClickAwayListener
                          onClickAway={() => setFormPickerOpen(false)}
                        >
                          <Paper
                            elevation={8}
                            sx={{
                              mt: 0.5,
                              overflow: "hidden",
                              border: "1px solid #d9e2ec",
                            }}
                          >
                            <Box
                              sx={{ p: 1, borderBottom: "1px solid #e4e7ed" }}
                            >
                              <TextField
                                autoFocus
                                size="small"
                                fullWidth
                                placeholder="搜索分类、表单名称、版本或编码"
                                value={formPickerSearch}
                                onChange={(event) =>
                                  setFormPickerSearch(event.target.value)
                                }
                                InputProps={{
                                  startAdornment: (
                                    <InputAdornment position="start">
                                      <Search fontSize="small" />
                                    </InputAdornment>
                                  ),
                                }}
                              />
                            </Box>
                            <Box sx={{ maxHeight: 360, overflow: "auto" }}>
                              {formTemplates.isError ? (
                                <Typography
                                  sx={{ p: 2, color: "#c62828", fontSize: 13 }}
                                >
                                  表单列表加载失败
                                </Typography>
                              ) : formGroups.length === 0 ? (
                                <Typography
                                  sx={{ p: 2, color: "#909399", fontSize: 13 }}
                                >
                                  暂无匹配的生效表单版本
                                </Typography>
                              ) : (
                                formGroups.map((group) => {
                                  const categoryExpanded =
                                    expandedFormCategories.has(group.category);
                                  return (
                                    <Box key={group.category}>
                                      <Button
                                        fullWidth
                                        onClick={() =>
                                          setExpandedFormCategories(
                                            (current) => {
                                              const next = new Set(current);
                                              if (next.has(group.category))
                                                next.delete(group.category);
                                              else next.add(group.category);
                                              return next;
                                            },
                                          )
                                        }
                                        startIcon={
                                          categoryExpanded ? (
                                            <ExpandMore />
                                          ) : (
                                            <ChevronRight />
                                          )
                                        }
                                        sx={{
                                          justifyContent: "flex-start",
                                          px: 1.5,
                                          py: 0.75,
                                          borderRadius: 0,
                                          bgcolor: "#f5f7fa",
                                          color: "#4f5b6a",
                                          fontSize: 12,
                                          fontWeight: 650,
                                          "&:hover": { bgcolor: "#edf2f7" },
                                        }}
                                      >
                                        <FolderOutlined
                                          fontSize="small"
                                          sx={{ color: "#d69a24" }}
                                        />
                                        {group.category}
                                      </Button>
                                      {categoryExpanded
                                        ? group.parents.map((parent) => {
                                            const parentKey = `${group.category}::${parent.templateId}`;
                                            const parentExpanded =
                                              expandedFormParents.has(
                                                parentKey,
                                              );
                                            return (
                                              <Box
                                                key={parent.templateId}
                                                sx={{
                                                  borderTop:
                                                    "1px solid #f0f2f5",
                                                }}
                                              >
                                                <Button
                                                  fullWidth
                                                  onClick={() =>
                                                    setExpandedFormParents(
                                                      (current) => {
                                                        const next = new Set(
                                                          current,
                                                        );
                                                        if (next.has(parentKey))
                                                          next.delete(
                                                            parentKey,
                                                          );
                                                        else
                                                          next.add(parentKey);
                                                        return next;
                                                      },
                                                    )
                                                  }
                                                  startIcon={
                                                    parentExpanded ? (
                                                      <ExpandMore />
                                                    ) : (
                                                      <ChevronRight />
                                                    )
                                                  }
                                                  sx={{
                                                    justifyContent:
                                                      "flex-start",
                                                    px: 2.5,
                                                    py: 0.7,
                                                    borderRadius: 0,
                                                    color: "#303133",
                                                    fontSize: 13,
                                                    fontWeight: 600,
                                                    textTransform: "none",
                                                    "&:hover": {
                                                      bgcolor: "#f8fafc",
                                                    },
                                                  }}
                                                >
                                                  <FactCheckOutlined
                                                    fontSize="small"
                                                    sx={{ color: "#1677c8" }}
                                                  />
                                                  <Typography
                                                    noWrap
                                                    sx={{
                                                      minWidth: 0,
                                                      flex: 1,
                                                      textAlign: "left",
                                                    }}
                                                  >
                                                    {parent.name}
                                                  </Typography>
                                                  <Typography
                                                    component="span"
                                                    sx={{
                                                      ml: 1,
                                                      color: "#909399",
                                                      fontSize: 11,
                                                      fontWeight: 400,
                                                    }}
                                                  >
                                                    {parent.versions.length}{" "}
                                                    个生效版本
                                                  </Typography>
                                                </Button>
                                                {parentExpanded
                                                  ? parent.versions.map(
                                                      (option) => (
                                                        <Box
                                                          key={option.id}
                                                          sx={{
                                                            pl: 5,
                                                            pr: 1,
                                                            py: 0.7,
                                                            display: "flex",
                                                            alignItems:
                                                              "center",
                                                            gap: 1,
                                                            cursor: "pointer",
                                                            bgcolor:
                                                              selectedFormOption?.id ===
                                                              option.id
                                                                ? "#e8f4ff"
                                                                : "#fff",
                                                            "&:hover": {
                                                              bgcolor:
                                                                "#f2f8ff",
                                                            },
                                                          }}
                                                          onClick={() => {
                                                            setValidationError(
                                                              null,
                                                            );
                                                            updateSelectedNode({
                                                              config: {
                                                                formTemplateVersionId:
                                                                  option.id,
                                                                formTemplateName: `${option.name} · ${option.version}`,
                                                              },
                                                            });
                                                            setFormPickerOpen(
                                                              false,
                                                            );
                                                            setFormPickerSearch(
                                                              "",
                                                            );
                                                          }}
                                                        >
                                                          <CheckOutlined
                                                            fontSize="small"
                                                            sx={{
                                                              color:
                                                                selectedFormOption?.id ===
                                                                option.id
                                                                  ? "#1677c8"
                                                                  : "transparent",
                                                            }}
                                                          />
                                                          <Stack
                                                            spacing={0.1}
                                                            sx={{
                                                              minWidth: 0,
                                                              flex: 1,
                                                            }}
                                                          >
                                                            <Typography
                                                              noWrap
                                                              sx={{
                                                                fontSize: 13,
                                                                color:
                                                                  "#303133",
                                                              }}
                                                            >
                                                              {option.version}
                                                            </Typography>
                                                            <Typography
                                                              noWrap
                                                              sx={{
                                                                fontSize: 11,
                                                                color:
                                                                  "#909399",
                                                              }}
                                                            >
                                                              {option.code
                                                                ? `编码：${option.code}`
                                                                : "未设置编码"}
                                                            </Typography>
                                                          </Stack>
                                                          <Tooltip
                                                            title="预览表单"
                                                            arrow
                                                          >
                                                            <IconButton
                                                              size="small"
                                                              aria-label={`预览${option.name} ${option.version}`}
                                                              onMouseDown={(
                                                                event,
                                                              ) => {
                                                                event.preventDefault();
                                                                event.stopPropagation();
                                                              }}
                                                              onClick={(
                                                                event,
                                                              ) => {
                                                                event.preventDefault();
                                                                event.stopPropagation();
                                                                setPreviewForm(
                                                                  option,
                                                                );
                                                              }}
                                                            >
                                                              <VisibilityOutlined fontSize="small" />
                                                            </IconButton>
                                                          </Tooltip>
                                                        </Box>
                                                      ),
                                                    )
                                                  : null}
                                              </Box>
                                            );
                                          })
                                        : null}
                                    </Box>
                                  );
                                })
                              )}
                            </Box>
                          </Paper>
                        </ClickAwayListener>
                      </Popper>
                    </Box>
                    <Box
                      className={
                        selectedNode.data.config?.formProcessVersionId
                          ? "form-process-picker has-value"
                          : "form-process-picker"
                      }
                      sx={{
                        position: "relative",
                        width: "100%",
                        "& .form-process-clear-button": {
                          opacity: 0,
                          pointerEvents: "none",
                          color: "#909399",
                          transition: "opacity 120ms ease",
                          position: "absolute",
                          right: 30,
                          top: 20,
                          transform: "translateY(-50%)",
                          zIndex: 2,
                        },
                        "&.has-value:hover .form-process-clear-button, &.has-value:focus-within .form-process-clear-button":
                          { opacity: 0.55, pointerEvents: "auto" },
                        "&.has-value:hover .form-process-select-icon, &.has-value:focus-within .form-process-select-icon":
                          { opacity: 0 },
                        "& .form-process-clear-button:hover": { opacity: 0.85 },
                        "& .form-process-select-icon": {
                          transition: "opacity 120ms ease",
                        },
                      }}
                    >
                      <FormControl size="small" fullWidth>
                        <InputLabel id="form-process-select-label">
                          表单流程
                        </InputLabel>
                        <Select
                          className="form-process-select"
                          labelId="form-process-select-label"
                          label="表单流程"
                          value={
                            selectedNode.data.config?.formProcessVersionId || ""
                          }
                          renderValue={(value) => {
                            if (!value) {
                              return (
                                <Typography color="text.secondary">
                                  请选择表单流程（可选）
                                </Typography>
                              );
                            }
                            const option = (formProcesses.data ?? []).find(
                              (item) => item.versionId === String(value),
                            );
                            return option
                              ? `${option.name} · V${option.versionNumber}`
                              : selectedHistoricalProcessLabel;
                          }}
                          disabled={!editable || formProcesses.isLoading}
                          IconComponent={(props) => (
                            <ExpandMore
                              {...props}
                              className={`${props.className ?? ""} form-process-select-icon`}
                            />
                          )}
                          onChange={(event) => {
                            const option = (formProcesses.data ?? []).find(
                              (item) =>
                                item.versionId === String(event.target.value),
                            );
                            updateSelectedNode({
                              config: {
                                formProcessVersionId: String(
                                  event.target.value,
                                ),
                                formProcessName: option
                                  ? `${option.name} · V${option.versionNumber}`
                                  : "",
                              },
                            });
                          }}
                        >
                          {(formProcesses.data ?? []).map((option) => (
                            <MenuItem
                              key={option.versionId}
                              value={option.versionId}
                            >
                              {option.name} · V{option.versionNumber}
                            </MenuItem>
                          ))}
                          {selectedHistoricalProcessLabel ? (
                            <MenuItem
                              value={
                                selectedNode?.data.config
                                  ?.formProcessVersionId ?? ""
                              }
                              disabled
                            >
                              {selectedHistoricalProcessLabel}
                            </MenuItem>
                          ) : null}
                        </Select>
                        {selectedNode.data.config?.formProcessVersionId ? (
                          <Tooltip title="清除表单流程" arrow>
                            <IconButton
                              className="form-process-clear-button"
                              size="small"
                              aria-label="清除表单流程"
                              onMouseDown={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                              }}
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                if (!editable) return;
                                updateSelectedNode({
                                  config: {
                                    formProcessVersionId: "",
                                    formProcessName: "",
                                    fieldPermissions: {},
                                    eventBindings: {},
                                  },
                                });
                              }}
                            >
                              <Close fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        ) : null}
                        <Typography
                          variant="caption"
                          sx={{ mt: 0.5, color: "#909399" }}
                        >
                          {formProcesses.isError
                            ? "表单流程加载失败"
                            : "发布作业流程前可选；选择后固定当前已发布版本"}
                        </Typography>
                      </FormControl>
                    </Box>
                    {selectedProcessOption ? (
                      <>
                        <Box
                          sx={{
                            p: 1.25,
                            bgcolor: "#f7f9fb",
                            border: "1px solid #e4e7ed",
                            borderRadius: 1,
                          }}
                        >
                          <Typography variant="body2" fontWeight={600}>
                            字段权限
                          </Typography>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: "block", mt: 0.4 }}
                          >
                            按主体设置默认权限，必要时指定少量例外字段。
                          </Typography>
                          <Button
                            size="small"
                            variant="outlined"
                            sx={{ mt: 1 }}
                            onClick={() => setPermissionConfigOpen(true)}
                            disabled={
                              !editable ||
                              selectedProcessVersionQuery.isLoading ||
                              selectedTemplateVersionQuery.isLoading
                            }
                          >
                            配置字段权限
                          </Button>
                        </Box>
                      </>
                    ) : null}
                  </>
                ) : null}
                {selectedKind === "NOTIFICATION" ? (
                  <>
                    <TextField
                      size="small"
                      label="接收人"
                      value={selectedNode.data.config?.recipients || ""}
                      onChange={(event) =>
                        updateSelectedNode({
                          config: { recipients: event.target.value },
                        })
                      }
                      disabled={!editable}
                      fullWidth
                    />
                    <TextField
                      size="small"
                      label="通知内容"
                      value={selectedNode.data.config?.message || ""}
                      onChange={(event) =>
                        updateSelectedNode({
                          config: { message: event.target.value },
                        })
                      }
                      disabled={!editable}
                      multiline
                      minRows={3}
                      fullWidth
                    />
                  </>
                ) : null}
                {selectedKind === "CONFIRMATION" ? (
                  <TextField
                    size="small"
                    label="确认要求"
                    value={
                      selectedNode.data.config?.confirmationInstruction || ""
                    }
                    onChange={(event) =>
                      updateSelectedNode({
                        config: { confirmationInstruction: event.target.value },
                      })
                    }
                    disabled={!editable}
                    multiline
                    minRows={3}
                    fullWidth
                  />
                ) : null}
                {selectedKind === "CONDITION" ? (
                  <Stack spacing={1.25}>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        条件分支
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{ mt: 0.35, color: "#5f6b7a", lineHeight: 1.55 }}
                      >
                        按分支从上到下依次判断，命中第一个满足条件的分支；均不满足时进入“否则”。
                      </Typography>
                    </Box>
                    <Stack spacing={0.75}>
                      {selectedConditionBranches.map((branch, index) => {
                        const connected = edges.find(
                          (edge) =>
                            edge.source === selectedNode.id &&
                            edge.sourceHandle ===
                              conditionHandleForBranch(branch.id),
                        );
                        const ruleSummary = branch.conditionRule
                          ? summarizeConditionExpression(
                              branch.conditionRule,
                              WORK_CONDITION_ADAPTER,
                            )
                          : "尚未配置条件规则";
                        return (
                          <Box
                            key={branch.id}
                            sx={{
                              p: 1,
                              border: "1px solid #e4e7ed",
                              borderRadius: 1,
                              bgcolor: "#fff",
                            }}
                          >
                            <Stack
                              direction="row"
                              alignItems="center"
                              spacing={0.75}
                            >
                              <Chip
                                size="small"
                                label={`条件 ${index + 1}`}
                                sx={{
                                  color: "#7650b5",
                                  bgcolor: "#f3edff",
                                  height: 24,
                                }}
                              />
                              <Typography
                                variant="body2"
                                fontWeight={650}
                                sx={{ flex: 1 }}
                              >
                                {branch.name}
                              </Typography>
                              {editable &&
                              selectedConditionBranches.length > 1 ? (
                                <Tooltip title="删除此条件分支" arrow>
                                  <IconButton
                                    size="small"
                                    aria-label={`删除${branch.name}`}
                                    onClick={() =>
                                      deleteConditionBranch(branch.id)
                                    }
                                  >
                                    <DeleteOutline fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              ) : null}
                            </Stack>
                            <Typography
                              variant="caption"
                              sx={{
                                display: "block",
                                mt: 0.65,
                                color: branch.conditionRule
                                  ? "#4b5563"
                                  : "#a36b00",
                                lineHeight: 1.5,
                              }}
                            >
                              {ruleSummary}
                            </Typography>
                            <Stack
                              direction="row"
                              spacing={0.5}
                              sx={{ mt: 0.75, flexWrap: "wrap", rowGap: 0.5 }}
                            >
                              <Button
                                size="small"
                                variant={
                                  branch.conditionRule ? "text" : "outlined"
                                }
                                onClick={() => {
                                  setSelectedConditionBranchId(branch.id);
                                  setConditionRuleDraft(branch.conditionRule);
                                  setConditionRuleDialogOpen(true);
                                }}
                                disabled={!editable && !branch.conditionRule}
                              >
                                {editable
                                  ? branch.conditionRule
                                    ? `编辑规则（${countConditionClauses(branch.conditionRule)} 条）`
                                    : "配置条件规则"
                                  : "查看条件规则"}
                              </Button>
                              {connected ? (
                                <Typography
                                  variant="caption"
                                  sx={{ alignSelf: "center", color: "#1677c8" }}
                                >
                                  已连接后续节点
                                </Typography>
                              ) : (
                                <Typography
                                  variant="caption"
                                  sx={{ alignSelf: "center", color: "#a36b00" }}
                                >
                                  请在画布分支出口添加后续节点
                                </Typography>
                              )}
                            </Stack>
                          </Box>
                        );
                      })}
                    </Stack>
                    {editable ? (
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<Add />}
                        onClick={addConditionBranch}
                        sx={{ alignSelf: "flex-start" }}
                      >
                        添加条件分支
                      </Button>
                    ) : null}
                    <Box
                      sx={{
                        p: 1,
                        border: "1px solid #e4e7ed",
                        borderRadius: 1,
                        bgcolor: "#f7f8fa",
                      }}
                    >
                      <Stack direction="row" alignItems="center" spacing={0.75}>
                        <Chip
                          size="small"
                          label="否则"
                          sx={{
                            color: "#697586",
                            bgcolor: "#e9edf2",
                            height: 24,
                          }}
                        />
                        <Typography
                          variant="body2"
                          fontWeight={650}
                          sx={{ flex: 1 }}
                        >
                          默认分支
                        </Typography>
                      </Stack>
                      <Typography
                        variant="caption"
                        sx={{ display: "block", mt: 0.65, color: "#697586" }}
                      >
                        所有条件分支均不满足时进入此出口，不配置规则。
                      </Typography>
                      {edges.some(
                        (edge) =>
                          edge.source === selectedNode.id &&
                          edge.sourceHandle === "condition-default",
                      ) ? (
                        <Typography
                          variant="caption"
                          sx={{ display: "block", mt: 0.5, color: "#1677c8" }}
                        >
                          已连接后续节点
                        </Typography>
                      ) : (
                        <Typography
                          variant="caption"
                          sx={{ display: "block", mt: 0.5, color: "#a36b00" }}
                        >
                          请在画布“否则”出口添加后续节点
                        </Typography>
                      )}
                    </Box>
                  </Stack>
                ) : null}
                {editable &&
                selectedKind !== "START" &&
                selectedKind !== "END" ? (
                  <Button
                    color="error"
                    variant="text"
                    startIcon={<DeleteOutline />}
                    onClick={requestDeleteSelectedNode}
                    sx={{ alignSelf: "flex-start" }}
                  >
                    删除节点
                  </Button>
                ) : null}
              </Stack>
            </>
          ) : (
            <Box sx={{ p: 3, color: "#909399" }}>
              <Typography
                variant="subtitle2"
                sx={{ color: "#606266", mb: 0.5 }}
              >
                节点设置
              </Typography>
              <Typography variant="body2">选择画布中的节点查看配置</Typography>
            </Box>
          )}
        </Box>
        <ConditionRuleDialog
          open={conditionRuleDialogOpen}
          value={conditionRuleDraft}
          adapter={WORK_CONDITION_ADAPTER}
          branchName={selectedConditionBranch?.name}
          readOnly={!editable}
          onClose={() => setConditionRuleDialogOpen(false)}
          onConfirm={(conditionRule) => {
            setConditionRuleDraft(conditionRule);
            if (selectedConditionBranchId)
              updateConditionBranch(selectedConditionBranchId, {
                conditionRule,
                fieldCatalogVersion: WORK_CONDITION_ADAPTER.fieldCatalogVersion,
                fieldSnapshot: WORK_CONDITION_FIELD_SNAPSHOT,
              });
            setConditionRuleDialogOpen(false);
          }}
        />
        <WorkFormPreviewDialog option={previewForm} onClose={closePreview} />
        <FormPermissionConfigDialog
          open={permissionConfigOpen}
          subjects={selectedProcessSubjects}
          fields={selectedTemplateFields}
          document={selectedPreviewDocument}
          permissions={selectedNode?.data.config?.fieldPermissions ?? {}}
          events={selectedProcessBuiltinEvents}
          eventBindings={selectedNode?.data.config?.eventBindings ?? {}}
          editable={editable}
          loading={
            selectedProcessVersionQuery.isLoading ||
            selectedTemplateVersionQuery.isLoading
          }
          onClose={() => setPermissionConfigOpen(false)}
          onSave={(fieldPermissions, eventBindings) => {
            updateSelectedNode({ config: { fieldPermissions, eventBindings } });
            setPermissionConfigOpen(false);
          }}
        />
      </Paper>
    );
  },
);

FlowWorkspace.displayName = "FlowWorkspace";

export default function WorkTemplateEditor() {
  const { id = "" } = useParams();
  const templateId = id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showMessage } = useSnackbar();
  const flowRef = useRef<FlowWorkspaceHandle>(null);
  const skipGraphResetRef = useRef<{
    id: string;
    nodesJson?: string | null;
    edgesJson?: string | null;
  } | null>(null);
  const restoreSelectionRef = useRef<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<WorkflowId | null>(
    null,
  );
  const [dirty, setDirty] = useState(false);
  const [confirmation, setConfirmation] = useState<
    | "copy"
    | "copy-unsaved"
    | "publish"
    | "switch"
    | "close"
    | "delete-condition"
    | null
  >(null);
  const [copySource, setCopySource] = useState<Version | null>(null);
  const [pendingVersionId, setPendingVersionId] = useState<WorkflowId | null>(
    null,
  );
  const [pendingDeleteNodeId, setPendingDeleteNodeId] = useState<string | null>(
    null,
  );
  const [pendingDeleteDescendantCount, setPendingDeleteDescendantCount] =
    useState(0);

  const definition = useQuery({
    queryKey: ["work-template", templateId],
    queryFn: async () =>
      (await getWorkTemplate(templateId)).data.data as {
        name: string;
        code?: string;
      },
    retry: 2,
  });
  const versions = useQuery({
    queryKey: ["work-template-versions", templateId],
    queryFn: async () => {
      const response = await getWorkTemplateVersions(templateId);
      return response.data.data as Version[];
    },
    retry: 2,
    refetchOnMount: "always",
  });
  const selectedVersionQuery = useQuery({
    queryKey: ["work-template-version", templateId, selectedVersionId],
    enabled: Boolean(selectedVersionId),
    queryFn: async () =>
      (await getWorkTemplateVersion(templateId, selectedVersionId!)).data
        .data as Version,
    retry: 2,
  });
  const refresh = () => {
    queryClient.invalidateQueries({
      queryKey: ["work-template-versions", templateId],
    });
    queryClient.invalidateQueries({
      queryKey: ["work-template-version", templateId],
    });
    queryClient.invalidateQueries({
      queryKey: ["work-form-process-references", templateId],
    });
    queryClient.invalidateQueries({ queryKey: ["work-templates"] });
  };
  const syncSavedVersion = (response: { data: { data: Version } }) => {
    const saved = response.data.data;
    queryClient.setQueryData<Version>(
      ["work-template-version", templateId, saved.id],
      saved,
    );
    queryClient.setQueryData<Version[]>(
      ["work-template-versions", templateId],
      (items) =>
        items?.map((item) =>
          String(item.id) === String(saved.id) ? { ...item, ...saved } : item,
        ),
    );
  };
  const saveGraph = useMutation({
    mutationFn: ({
      versionId,
      graph,
    }: {
      versionId: WorkflowId;
      graph: FlowGraph;
    }) => saveWorkTemplateVersionGraph(templateId, versionId, graph),
    onSuccess: (response) => {
      const savedGraphVersion = (response as { data: { data: Version } }).data
        .data;
      skipGraphResetRef.current = {
        id: String(savedGraphVersion.id),
        nodesJson: savedGraphVersion.nodesJson,
        edgesJson: savedGraphVersion.edgesJson,
      };
      syncSavedVersion(response as { data: { data: Version } });
      flowRef.current?.markSaved();
      setDirty(false);
      showMessage("草稿已保存");
      refresh();
    },
    onError: (error) => {
      showMessage(
        error instanceof Error ? error.message : "草稿保存失败",
        "error",
      );
    },
  });
  const handlePublishError = async (error: unknown) => {
    const message = error instanceof Error ? error.message : "流程发布失败";
    if (message.includes("表单") && flowRef.current) {
      const validation = await flowRef.current.refreshPublishValidation();
      if (!validation.directoryLoaded || !validation.formReferenceError)
        flowRef.current.markFormReferenceErrors();
    }
    showMessage(message, "error");
  };
  const publish = useMutation({
    mutationFn: async ({
      versionId,
      graph,
      saveFirst,
    }: {
      versionId: WorkflowId;
      graph: FlowGraph;
      saveFirst: boolean;
    }) => {
      await saveWorkTemplateVersionGraph(templateId, versionId, graph);
      return publishWorkTemplateVersion(templateId, versionId);
    },
    onSuccess: () => {
      setDirty(false);
      setConfirmation(null);
      showMessage("流程已发布");
      refresh();
    },
    onError: handlePublishError,
  });
  const saveTransientDraft = useMutation({
    mutationFn: async (graph: FlowGraph) => {
      const created = await createWorkTemplateVersion(templateId);
      return saveWorkTemplateVersionGraph(
        templateId,
        created.data.data.id,
        graph,
      );
    },
    onSuccess: (response) => {
      // 虚拟草稿首次保存：版本实体化会导致画布重挂载，预先记录选中节点
      // 并跳过重置，让保存后仍停留在当前配置位置。
      restoreSelectionRef.current = flowRef.current?.selection() ?? null;
      const transientSavedVersion = (response as { data: { data: Version } })
        .data.data;
      skipGraphResetRef.current = {
        id: String(transientSavedVersion.id),
        nodesJson: transientSavedVersion.nodesJson,
        edgesJson: transientSavedVersion.edgesJson,
      };
      syncSavedVersion(response as { data: { data: Version } });
      setDirty(false);
      setSelectedVersionId(response.data.data.id);
      showMessage("草稿已保存");
      refresh();
    },
    onError: (error) => {
      showMessage(
        error instanceof Error ? error.message : "草稿保存失败",
        "error",
      );
    },
  });
  const publishTransientDraft = useMutation({
    mutationFn: async (graph: FlowGraph) => {
      const created = await createWorkTemplateVersion(templateId);
      const saved = await saveWorkTemplateVersionGraph(
        templateId,
        created.data.data.id,
        graph,
      );
      return publishWorkTemplateVersion(templateId, saved.data.data.id);
    },
    onSuccess: (response) => {
      setDirty(false);
      setConfirmation(null);
      setSelectedVersionId(response.data.data.id);
      showMessage("流程已发布");
      refresh();
    },
    onError: handlePublishError,
  });
  const copyToDraft = useMutation({
    mutationFn: async ({
      sourceVersionId,
      graph,
      saveFirst,
    }: {
      sourceVersionId: WorkflowId;
      graph: FlowGraph;
      saveFirst: boolean;
    }) => {
      let targetDraft = persistedDraftVersion;
      if (saveFirst) {
        if (!targetDraft) {
          const created = await createWorkTemplateVersion(templateId);
          targetDraft = created.data.data as Version;
        }
        await saveWorkTemplateVersionGraph(templateId, targetDraft.id, graph);
      }
      return copyWorkTemplateVersionToDraft(
        templateId,
        sourceVersionId,
        saveFirst ? false : !targetDraft,
      );
    },
    onSuccess: (response) => {
      setDirty(false);
      setConfirmation(null);
      setCopySource(null);
      setSelectedVersionId(response.data.data.id);
      refresh();
    },
  });

  const versionList = versions.data ?? [];
  const currentVersion =
    versionList.find((version) => version.isCurrent) ?? null;
  const persistedDraftVersion =
    versionList.find((version) => version.status === "DRAFT") ?? null;
  const draftVersion =
    persistedDraftVersion ??
    (versions.data ? transientDraft(templateId) : null);
  const historicalVersions = versionList.filter(
    (version) => version.status === "PUBLISHED" && !version.isCurrent,
  );
  const nextDraftVersionNumber =
    Math.max(0, ...versionList.map((version) => version.versionNumber)) + 1;
  const selectedSummary =
    versionList.find(
      (version) => String(version.id) === String(selectedVersionId),
    ) ??
    currentVersion ??
    draftVersion ??
    versionList[0] ??
    null;
  const selectedVersion = selectedVersionQuery.data ?? selectedSummary;
  const versionLoading = versions.isPending;
  const selectedIsDraft = selectedVersion?.status === "DRAFT";
  const selectedPublished = selectedVersion?.status === "PUBLISHED";

  useEffect(() => {
    if (
      selectedSummary &&
      !selectedSummary.virtual &&
      (!selectedVersionId ||
        !versionList.some(
          (version) => String(version.id) === String(selectedVersionId),
        ))
    ) {
      setSelectedVersionId(selectedSummary.id);
    }
  }, [selectedSummary, selectedVersionId, versionList]);

  useEffect(() => {
    setSelectedVersionId(null);
    setDirty(false);
  }, [templateId]);

  const selectVersion = (versionId: WorkflowId) => {
    skipGraphResetRef.current = null;
    restoreSelectionRef.current = null;
    if (String(versionId).startsWith("transient-draft-")) {
      setSelectedVersionId(null);
      setDirty(false);
      return;
    }
    if (String(versionId) !== String(selectedVersionId)) {
      if (dirty) {
        setPendingVersionId(versionId);
        setConfirmation("switch");
      } else {
        setSelectedVersionId(versionId);
        setDirty(false);
      }
    }
  };
  const saveDraft = () => {
    if (!selectedVersion || !selectedIsDraft) return;
    const graph = flowRef.current?.graph() ?? { nodes: [], edges: [] };
    if (selectedVersion.virtual) saveTransientDraft.mutate(graph);
    else saveGraph.mutate({ versionId: selectedVersion.id, graph });
  };
  const requestCopy = (source: Version) => {
    setCopySource(source);
    setConfirmation(dirty ? "copy-unsaved" : "copy");
  };
  const requestDeleteConditionNode = (
    nodeId: string,
    descendantCount: number,
  ) => {
    setPendingDeleteNodeId(nodeId);
    setPendingDeleteDescendantCount(descendantCount);
    setConfirmation("delete-condition");
  };
  const close = () => {
    if (dirty) setConfirmation("close");
    else navigate("/production/work-templates");
  };
  const confirm = () => {
    if (confirmation === "copy" && copySource)
      copyToDraft.mutate({
        sourceVersionId: copySource.id,
        graph: { nodes: [], edges: [] },
        saveFirst: false,
      });
    if (confirmation === "publish" && selectedVersion) {
      if (!flowRef.current?.validateForPublish()) {
        setConfirmation(null);
        return;
      }
      const graph = flowRef.current?.graph() ?? { nodes: [], edges: [] };
      if (selectedVersion.virtual) publishTransientDraft.mutate(graph);
      else
        publish.mutate({
          versionId: selectedVersion.id,
          graph,
          saveFirst: dirty,
        });
    }
    if (confirmation === "switch" && pendingVersionId) {
      skipGraphResetRef.current = null;
      restoreSelectionRef.current = null;
      setSelectedVersionId(pendingVersionId);
      setPendingVersionId(null);
      setDirty(false);
      setConfirmation(null);
    }
    if (confirmation === "close") navigate("/production/work-templates");
    if (confirmation === "delete-condition" && pendingDeleteNodeId) {
      flowRef.current?.deleteNode(pendingDeleteNodeId);
      setPendingDeleteNodeId(null);
      setPendingDeleteDescendantCount(0);
      setConfirmation(null);
    }
  };
  const confirmationDetails = useMemo(() => {
    if (confirmation === "copy")
      return draftVersion
        ? {
            title: "复制已发布流程",
            message: `确认用流程 V${copySource?.versionNumber ?? ""} 覆盖当前草稿 V${draftVersion.versionNumber} 吗？当前草稿中的节点、连线和节点配置将被替换，已发布历史不会受到影响。`,
            confirmText: "复制并覆盖",
            destructive: true,
          }
        : {
            title: "复制为新草稿",
            message: `确认以流程 V${copySource?.versionNumber ?? ""} 的配置创建流程 V${nextDraftVersionNumber} 草稿吗？已发布历史不会受到影响。`,
            confirmText: "创建草稿",
            destructive: false,
          };
    if (confirmation === "publish")
      return {
        title: "发布流程",
        message: `确认发布流程 V${selectedVersion?.versionNumber ?? ""} 吗？${dirty ? "当前未保存的修改将一并保存。" : ""}发布后不可编辑。系统将自动生成继承该配置的下一草稿版本。${
          (flowRef.current?.outdatedFormProcessReferenceCount() ?? 0) > 0
            ? ` 当前有 ${flowRef.current?.outdatedFormProcessReferenceCount()} 个表单填报节点仍使用旧版表单流程，建议先升级。`
            : ""
        }`,
        confirmText: "发布",
        destructive: false,
      };
    if (confirmation === "switch")
      return {
        title: "切换流程版本",
        message: "当前草稿尚有未保存的修改，确认放弃修改并切换流程版本吗？",
        confirmText: "放弃修改并切换",
        destructive: true,
      };
    if (confirmation === "delete-condition")
      return {
        title: "删除条件节点",
        message:
          pendingDeleteDescendantCount > 0
            ? `删除条件节点后，其各条件分支下的 ${pendingDeleteDescendantCount} 个后续节点及相关连线也会一并删除。此操作可通过撤销恢复，确认继续吗？`
            : "删除条件节点后，其各条件分支下的后续节点及相关连线也会一并删除。此操作可通过撤销恢复，确认继续吗？",
        confirmText: "确认删除",
        destructive: true,
      };
    return {
      title: "关闭流程配置",
      message: "当前草稿尚有未保存的修改，确认不保存并关闭吗？",
      confirmText: "不保存并关闭",
      destructive: true,
    };
  }, [
    confirmation,
    copySource,
    draftVersion,
    nextDraftVersionNumber,
    pendingDeleteDescendantCount,
    selectedVersion,
  ]);

  return (
    <FullScreenFlowDesigner
      title="配置流程"
      subject={`${definition.data?.name || "作业模板"}${definition.data?.code ? ` / ${definition.data.code}` : ""}`}
      headerContent={
        <FlowVersionPicker
          currentVersion={currentVersion}
          draftVersion={draftVersion}
          historicalVersions={historicalVersions}
          selectedVersion={selectedVersion}
          onSelect={selectVersion}
          onCopy={requestCopy}
        />
      }
      onClose={close}
      actions={
        selectedIsDraft ? (
          <>
            <Button
              size="small"
              variant="outlined"
              startIcon={<SaveOutlined />}
              onClick={saveDraft}
              disabled={
                saveGraph.isPending ||
                saveTransientDraft.isPending ||
                (!dirty && !selectedVersion?.virtual)
              }
            >
              {saveGraph.isPending || saveTransientDraft.isPending
                ? "保存中..."
                : "保存草稿"}
            </Button>
            <Button
              size="small"
              variant="contained"
              startIcon={<PublishOutlined />}
              onClick={() => setConfirmation("publish")}
              disabled={publish.isPending || publishTransientDraft.isPending}
            >
              发布
            </Button>
          </>
        ) : null
      }
      overlays={
        <>
          <ConfirmDialog
            open={Boolean(confirmation && confirmation !== "copy-unsaved")}
            title={confirmationDetails.title}
            message={confirmationDetails.message}
            confirmText={confirmationDetails.confirmText}
            destructive={confirmationDetails.destructive}
            loading={
              publish.isPending ||
              publishTransientDraft.isPending ||
              saveTransientDraft.isPending ||
              copyToDraft.isPending
            }
            onCancel={() => {
              setConfirmation(null);
              setCopySource(null);
              setPendingVersionId(null);
              setPendingDeleteNodeId(null);
              setPendingDeleteDescendantCount(0);
            }}
            onConfirm={confirm}
          />
          <AppDialog
            open={confirmation === "copy-unsaved"}
            onClose={() => {
              setConfirmation(null);
              setCopySource(null);
            }}
            maxWidth="xs"
            fullWidth
          >
            <DialogTitle>未保存的草稿修改</DialogTitle>
            <DialogContent>
              <DialogContentText>
                当前草稿有未保存的修改。复制流程 V
                {copySource?.versionNumber ?? ""} 会覆盖当前草稿 V
                {draftVersion?.versionNumber ?? ""} 的流程配置。
              </DialogContentText>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
              <Button
                onClick={() => {
                  setConfirmation(null);
                  setCopySource(null);
                }}
                disabled={copyToDraft.isPending}
              >
                取消
              </Button>
              <Button
                color="error"
                onClick={() =>
                  copySource &&
                  copyToDraft.mutate({
                    sourceVersionId: copySource.id,
                    graph: { nodes: [], edges: [] },
                    saveFirst: false,
                  })
                }
                disabled={copyToDraft.isPending}
              >
                放弃修改并复制
              </Button>
              <Button
                variant="contained"
                onClick={() =>
                  copySource &&
                  copyToDraft.mutate({
                    sourceVersionId: copySource.id,
                    graph: flowRef.current?.graph() ?? { nodes: [], edges: [] },
                    saveFirst: true,
                  })
                }
                disabled={copyToDraft.isPending}
              >
                {copyToDraft.isPending ? "处理中..." : "保存后复制"}
              </Button>
            </DialogActions>
          </AppDialog>
        </>
      }
    >
      <Box
        sx={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          flex: 1,
          width: "100%",
          height: "100%",
          minWidth: 0,
          minHeight: 0,
        }}
      >
        {versionLoading ? (
          <Paper
            variant="outlined"
            sx={{
              width: "100%",
              height: "100%",
              display: "grid",
              placeItems: "center",
              color: "#909399",
            }}
          >
            正在加载流程版本...
          </Paper>
        ) : versions.isError ||
          (Boolean(selectedVersionId) && selectedVersionQuery.isError) ? (
          <Paper
            variant="outlined"
            sx={{
              width: "100%",
              height: "100%",
              display: "grid",
              placeItems: "center",
              color: "#c45656",
            }}
          >
            流程版本加载失败，请关闭后重新打开
          </Paper>
        ) : selectedVersion ? (
          <FlowWorkspace
            key={selectedVersion.id}
            ref={flowRef}
            version={selectedVersion}
            templateId={templateId}
            onDirtyChange={setDirty}
            skipGraphResetRef={skipGraphResetRef}
            restoreSelectionRef={restoreSelectionRef}
            onRequestDeleteConditionNode={requestDeleteConditionNode}
          />
        ) : (
          <Paper
            variant="outlined"
            sx={{
              width: "100%",
              height: "100%",
              display: "grid",
              placeItems: "center",
              color: "#909399",
            }}
          >
            暂无流程版本
          </Paper>
        )}
        {selectedPublished ? (
          <Paper
            variant="outlined"
            sx={{
              position: "absolute",
              top: 12,
              right: 12,
              zIndex: 8,
              px: 1.25,
              py: 0.75,
              bgcolor: "rgba(255,255,255,.94)",
              color: "#6b7785",
            }}
          >
            已发布流程仅供查看
          </Paper>
        ) : null}
      </Box>
    </FullScreenFlowDesigner>
  );
}
