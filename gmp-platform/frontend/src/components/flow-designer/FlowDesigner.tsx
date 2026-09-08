import {
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  ArrowBackOutlined,
  ArrowDownwardOutlined,
  ArrowForwardOutlined,
  ArrowUpwardOutlined,
  Close,
  ContentCopyOutlined,
} from "@mui/icons-material";
import {
  Box,
  Button,
  Chip,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { Handle, MiniMap, Position, type Node } from "@xyflow/react";
import AppDialog from "@/components/AppDialog";

export type FlowDirection = "top" | "right" | "bottom" | "left";

export const flowDirectionPosition: Record<FlowDirection, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
};

export const oppositeFlowDirection: Record<FlowDirection, FlowDirection> = {
  top: "bottom",
  right: "left",
  bottom: "top",
  left: "right",
};

export const STANDARD_FLOW_DIRECTIONS: FlowDirection[] = [
  "top",
  "right",
  "bottom",
  "left",
];

const FLOW_MINIMAP_NODE_COLORS: Record<string, string> = {
  START: "#91caff",
  END: "#cbd5e1",
  FORM: "#91caff",
  APPROVAL: "#91caff",
  NOTIFICATION: "#ffd591",
  CONFIRMATION: "#95de64",
  CONDITION: "#c9b8e8",
};

function flowMiniMapNodeColor(node: Node) {
  const kind = String(
    (node.data as { kind?: unknown } | undefined)?.kind ?? "",
  );
  return FLOW_MINIMAP_NODE_COLORS[kind] ?? "#cbd5e1";
}

export function FlowMiniMap() {
  return (
    <MiniMap
      nodeColor={flowMiniMapNodeColor}
      nodeStrokeColor="#7f91a5"
      nodeStrokeWidth={1}
      nodeBorderRadius={4}
      bgColor="#f8fafc"
      maskColor="rgba(22, 119, 200, 0.08)"
      maskStrokeColor="#91caff"
      maskStrokeWidth={1}
      ariaLabel="流程缩略地图"
      style={{
        width: 176,
        height: 112,
        padding: 6,
        right: 16,
        bottom: 16,
        border: "1px solid #dfe6ee",
        borderRadius: 6,
        background: "#fff",
        boxShadow: "0 3px 12px rgba(31, 45, 61, 0.12)",
      }}
    />
  );
}

export type FlowNodeGeometry = {
  id: string;
  position: { x: number; y: number };
};

export function findNearbyFlowNode<T extends FlowNodeGeometry>({
  sourceNode,
  nodes,
  direction,
  getSize,
  maxDistance = 180,
  maxCrossOffset = 96,
  isCandidate = () => true,
}: {
  sourceNode: T;
  nodes: T[];
  direction: FlowDirection;
  getSize: (node: T) => { width: number; height: number };
  maxDistance?: number;
  maxCrossOffset?: number;
  isCandidate?: (node: T) => boolean;
}) {
  const sourceSize = getSize(sourceNode);
  const sourceCenter = {
    x: sourceNode.position.x + sourceSize.width / 2,
    y: sourceNode.position.y + sourceSize.height / 2,
  };
  const sourceEdge = {
    top: sourceNode.position.y,
    right: sourceNode.position.x + sourceSize.width,
    bottom: sourceNode.position.y + sourceSize.height,
    left: sourceNode.position.x,
  }[direction];
  return (
    nodes
      .filter((node) => node.id !== sourceNode.id && isCandidate(node))
      .map((node) => {
        const size = getSize(node);
        const center = {
          x: node.position.x + size.width / 2,
          y: node.position.y + size.height / 2,
        };
        const targetEdge = {
          top: node.position.y + size.height,
          right: node.position.x,
          bottom: node.position.y,
          left: node.position.x + size.width,
        }[direction];
        const distance = Math.abs(targetEdge - sourceEdge);
        const crossOffset =
          direction === "top" || direction === "bottom"
            ? Math.abs(center.x - sourceCenter.x)
            : Math.abs(center.y - sourceCenter.y);
        const isAhead =
          direction === "top"
            ? center.y < sourceCenter.y
            : direction === "bottom"
              ? center.y > sourceCenter.y
              : direction === "left"
                ? center.x < sourceCenter.x
                : center.x > sourceCenter.x;
        return { node, distance, crossOffset, isAhead };
      })
      .filter(
        ({ distance, crossOffset, isAhead }) =>
          isAhead && distance <= maxDistance && crossOffset <= maxCrossOffset,
      )
      .sort(
        (left, right) =>
          left.distance +
          left.crossOffset * 0.35 -
          (right.distance + right.crossOffset * 0.35),
      )[0]?.node ?? null
  );
}

export type FlowQuickAction = {
  id: string;
  label: string;
  icon?: ReactNode;
};

export type FlowVersionSummary = {
  id: string | number;
  versionNumber: number;
  status: string;
  isCurrent?: boolean;
};

export function flowVersionStatusLabel(version: FlowVersionSummary) {
  if (version.status === "DRAFT") return "草稿";
  if (version.isCurrent) return "当前发布";
  if (version.status === "PUBLISHED") return "历史版本";
  return version.status;
}

export function FullScreenFlowDesigner({
  title,
  subject,
  actions,
  headerContent,
  onClose,
  children,
  overlays,
}: {
  title: string;
  subject?: string | null;
  actions?: ReactNode;
  headerContent?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  overlays?: ReactNode;
}) {
  return (
    <AppDialog
      open
      fullScreen
      hideCloseButton
      onClose={onClose}
      PaperProps={{
        sx: {
          width: "100%",
          height: "100%",
          borderRadius: 0,
          bgcolor: "#f6f8f9",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        },
      }}
    >
      <DialogTitle
        sx={{
          px: { xs: 1.5, md: 2.5 },
          py: 1.25,
          borderBottom: "1px solid #e4e7ed",
          bgcolor: "#fff",
        }}
      >
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 2,
            minHeight: 34,
          }}
        >
          <Stack
            direction="row"
            spacing={1.5}
            alignItems="center"
            sx={{ minWidth: 0, flex: 1 }}
          >
            <Typography variant="h6" noWrap>
              {title}
            </Typography>
            {subject ? (
              <Typography variant="body2" noWrap sx={{ color: "#606266" }}>
                {subject}
              </Typography>
            ) : null}
            {headerContent ? (
              <Box sx={{ minWidth: 0, ml: { md: 1 } }}>{headerContent}</Box>
            ) : null}
          </Stack>
          <Stack
            direction="row"
            spacing={0.75}
            alignItems="center"
            sx={{ flexShrink: 0 }}
          >
            {actions}
            <Tooltip title="关闭" arrow>
              <IconButton size="small" aria-label="关闭" onClick={onClose}>
                <Close fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>
      </DialogTitle>
      <DialogContent
        dividers
        sx={{
          p: { xs: 1, md: 1.5 },
          flex: 1,
          width: "100%",
          minWidth: 0,
          minHeight: 0,
          boxSizing: "border-box",
          display: "flex",
          overflow: "hidden",
        }}
      >
        {children}
      </DialogContent>
      {overlays}
    </AppDialog>
  );
}

function nodeHandleStyle(direction: FlowDirection) {
  const base = {
    width: 9,
    height: 9,
    border: "1px solid #8c99a8",
    background: "#fff",
    zIndex: 3,
  };
  if (direction === "top" || direction === "bottom")
    return { ...base, left: "50%" };
  return { ...base, top: "50%" };
}

function quickButtonStyle(direction: FlowDirection) {
  const common = {
    position: "absolute" as const,
    zIndex: 6,
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
  if (direction === "top") return { ...common, left: 1, top: 0 };
  if (direction === "right") return { ...common, left: 12, top: 2 };
  if (direction === "bottom") return { ...common, left: 1, top: 12 };
  return { ...common, right: 12, top: 2 };
}

function quickHitAreaStyle(direction: FlowDirection) {
  const common = {
    position: "absolute" as const,
    zIndex: 6,
    pointerEvents: "auto" as const,
  };
  if (direction === "top")
    return {
      ...common,
      left: "calc(50% - 15px)",
      top: -40,
      width: 30,
      height: 40,
    };
  if (direction === "right")
    return {
      ...common,
      left: "100%",
      top: "calc(50% - 14px)",
      width: 40,
      height: 28,
    };
  if (direction === "bottom")
    return {
      ...common,
      left: "calc(50% - 15px)",
      top: "100%",
      width: 30,
      height: 40,
    };
  return {
    ...common,
    right: "100%",
    top: "calc(50% - 14px)",
    width: 40,
    height: 28,
  };
}

function quickDirectionIcon(direction: FlowDirection) {
  if (direction === "top") return <ArrowUpwardOutlined fontSize="small" />;
  if (direction === "right") return <ArrowForwardOutlined fontSize="small" />;
  if (direction === "bottom") return <ArrowDownwardOutlined fontSize="small" />;
  return <ArrowBackOutlined fontSize="small" />;
}

// Keep the helper text beside the arrow instead of in the direction where the
// add-node menu opens. The menu then has a clear, unobstructed click target.
function quickTooltipPlacement(direction: FlowDirection) {
  if (direction === "top") return "left" as const;
  if (direction === "right") return "top" as const;
  if (direction === "bottom") return "right" as const;
  return "bottom" as const;
}

export function FlowQuickTooltip({
  children,
  title,
  direction,
  placement,
  menuOpen = false,
}: {
  children: ReactElement;
  title: string;
  direction?: FlowDirection;
  placement?: "top" | "right" | "bottom" | "left";
  menuOpen?: boolean;
}) {
  // Unmount the tooltip while its menu is open. Disabling listeners alone can
  // leave an already-open portal visible over the add-node actions.
  if (menuOpen) return <>{children}</>;
  return (
    <Tooltip
      title={title}
      placement={
        placement ?? (direction ? quickTooltipPlacement(direction) : "top")
      }
      arrow
      disableInteractive
    >
      {children}
    </Tooltip>
  );
}

function quickMenuStyle(direction: FlowDirection) {
  const common = {
    position: "absolute" as const,
    zIndex: 7,
    p: 0.5,
    bgcolor: "#fff",
    border: "1px solid #d9e2ec",
    borderRadius: 1,
    boxShadow: "0 4px 14px rgba(31,45,61,.16)",
    whiteSpace: "nowrap",
  };
  if (direction === "top")
    return {
      ...common,
      left: "50%",
      bottom: "calc(100% + 48px)",
      transform: "translateX(-50%)",
    };
  if (direction === "right")
    return {
      ...common,
      left: "calc(100% + 64px)",
      top: "50%",
      transform: "translateY(-50%)",
    };
  if (direction === "bottom")
    return {
      ...common,
      left: "50%",
      top: "calc(100% + 48px)",
      transform: "translateX(-50%)",
    };
  return {
    ...common,
    right: "calc(100% + 64px)",
    top: "50%",
    transform: "translateY(-50%)",
  };
}

export function StandardFlowNode({
  id,
  label,
  caption,
  appearance,
  width,
  height,
  boundary = false,
  start = false,
  end = false,
  editable,
  selected,
  validationMessage,
  quickDirections,
  quickArrowDirections,
  quickMenuDirection,
  quickActions,
  canUseQuickAction,
  onOpenQuickMenu,
  onQuickAdd,
}: {
  id: string;
  label: string;
  caption?: string;
  appearance: { color: string; background: string };
  width: number;
  height: number;
  boundary?: boolean;
  start?: boolean;
  end?: boolean;
  editable: boolean;
  selected: boolean;
  validationMessage?: string;
  quickDirections: FlowDirection[];
  /** Directions showing quick arrow buttons; defaults to quickDirections which always render handles. */
  quickArrowDirections?: FlowDirection[];
  quickMenuDirection?: FlowDirection | null;
  quickActions: FlowQuickAction[];
  canUseQuickAction: boolean;
  onOpenQuickMenu: (direction: FlowDirection) => void;
  onQuickAdd: (direction: FlowDirection, actionId: string) => void;
}) {
  const [bodyHovered, setBodyHovered] = useState(false);
  const [hoveredDirection, setHoveredDirection] =
    useState<FlowDirection | null>(null);
  const stopNodeEvent = (event: ReactMouseEvent) => event.stopPropagation();
  const quickVisible =
    editable &&
    (bodyHovered ||
      hoveredDirection !== null ||
      selected ||
      Boolean(quickMenuDirection));
  return (
    <Box
      className={`flow-node-shell${selected ? " flow-node-selected" : ""}${quickMenuDirection ? " flow-node-menu-open" : ""}`}
      sx={{
        position: "relative",
        boxSizing: "border-box",
        width,
        height,
        overflow: "visible",
        border: "1px solid",
        borderColor: validationMessage
          ? "#d93025"
          : selected
            ? "#1677c8"
            : `${appearance.color}55`,
        borderRadius: boundary ? 4 : 1,
        bgcolor: appearance.background,
        boxShadow: validationMessage
          ? "0 0 0 3px rgba(217,48,37,.14)"
          : selected
            ? "0 0 0 3px rgba(22,119,200,.14)"
            : "0 1px 2px rgba(31,45,61,.08)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      {!start
        ? STANDARD_FLOW_DIRECTIONS.map((direction) => (
            <Handle
              key={`target-${direction}`}
              id={`target-${direction}`}
              type="target"
              position={flowDirectionPosition[direction]}
              isConnectable={editable}
              style={nodeHandleStyle(direction)}
            />
          ))
        : null}
      <Box
        className="flow-node-body"
        onMouseEnter={() => setBodyHovered(true)}
        onMouseLeave={() => setBodyHovered(false)}
        sx={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          textAlign: "center",
          px: boundary ? 1.1 : 1,
          py: boundary ? 0.65 : 0.8,
        }}
      >
        <Typography
          noWrap
          sx={{
            color: appearance.color,
            fontSize: boundary ? 14 : 11,
            fontWeight: 650,
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: width - 20,
          }}
        >
          {label}
        </Typography>
        {!boundary && caption ? (
          <Typography
            noWrap
            sx={{
              mt: 0.25,
              maxWidth: width - 22,
              color: "#7a8796",
              fontSize: 10,
            }}
          >
            {caption}
          </Typography>
        ) : null}
      </Box>
      {validationMessage ? (
        <Typography
          component="span"
          sx={{
            position: "absolute",
            top: "calc(100% + 5px)",
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
      {!end
        ? quickDirections.map((direction) => (
            <Handle
              key={`source-${direction}`}
              id={`source-${direction}`}
              type="source"
              position={flowDirectionPosition[direction]}
              isConnectable={editable}
              style={nodeHandleStyle(direction)}
            />
          ))
        : null}
      {editable && canUseQuickAction
        ? (quickArrowDirections ?? quickDirections).map((direction) => (
            <Box
              key={direction}
              className="flow-node-quick-hit-area nodrag nopan"
              onMouseDown={stopNodeEvent}
              onPointerEnter={() => setHoveredDirection(direction)}
              onPointerLeave={() =>
                setHoveredDirection((current) =>
                  current === direction ? null : current,
                )
              }
              sx={{
                ...quickHitAreaStyle(direction),
                opacity: quickVisible
                  ? hoveredDirection === direction
                    ? 1
                    : 0.34
                  : 0,
                transition: "opacity 120ms ease",
              }}
            >
              <FlowQuickTooltip
                title="连接或添加节点"
                direction={direction}
                menuOpen={Boolean(quickMenuDirection)}
              >
                <IconButton
                  className="flow-node-quick nodrag nopan"
                  size="small"
                  aria-label={`向${direction}连接或添加节点`}
                  onMouseDown={stopNodeEvent}
                  onClick={(event) => {
                    stopNodeEvent(event);
                    onOpenQuickMenu(direction);
                  }}
                  sx={{ ...quickButtonStyle(direction), opacity: 1 }}
                >
                  {quickDirectionIcon(direction)}
                </IconButton>
              </FlowQuickTooltip>
            </Box>
          ))
        : null}
      {editable && quickMenuDirection ? (
        <Stack
          className="nodrag nopan"
          direction="row"
          spacing={0.5}
          sx={quickMenuStyle(quickMenuDirection)}
        >
          {quickActions.map((action) => (
            <Button
              key={action.id}
              className="nodrag nopan"
              size="small"
              startIcon={action.icon}
              onMouseDown={stopNodeEvent}
              onClick={(event) => {
                stopNodeEvent(event);
                onQuickAdd(quickMenuDirection, action.id);
              }}
            >
              {action.label}
            </Button>
          ))}
        </Stack>
      ) : null}
    </Box>
  );
}

function VersionRow({
  version,
  selected,
  copyable,
  copyLabel = "复制到当前草稿",
  onSelect,
  onCopy,
}: {
  version: FlowVersionSummary;
  selected: boolean;
  copyable?: boolean;
  copyLabel?: string;
  onSelect: () => void;
  onCopy?: () => void;
}) {
  return (
    <Box
      onClick={onSelect}
      sx={{
        p: 1.25,
        border: "1px solid",
        borderColor: selected ? "#91caff" : "#ebeef5",
        borderRadius: 1,
        bgcolor: selected ? "#eaf3ff" : "#fff",
        cursor: "pointer",
        "&:hover": { borderColor: "#b3d8ff" },
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={0.75}
      >
        <Typography variant="body2" fontWeight={selected ? 650 : 500}>
          流程 V{version.versionNumber}
        </Typography>
        <Stack direction="row" spacing={0.25} alignItems="center">
          {version.status === "DRAFT" || version.isCurrent ? (
            <Chip
              size="small"
              color={version.status === "DRAFT" ? "warning" : "success"}
              label={flowVersionStatusLabel(version)}
            />
          ) : null}
          {copyable && onCopy ? (
            <Tooltip title={copyLabel} arrow>
              <IconButton
                size="small"
                aria-label={copyLabel}
                onClick={(event) => {
                  event.stopPropagation();
                  onCopy();
                }}
              >
                <ContentCopyOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
          ) : null}
        </Stack>
      </Stack>
      {version.isCurrent ? (
        <Typography
          variant="caption"
          color="success.main"
          sx={{ display: "block", mt: 0.5 }}
        >
          当前对外流程
        </Typography>
      ) : null}
    </Box>
  );
}

export function FlowVersionPicker<T extends FlowVersionSummary>({
  currentVersion,
  draftVersion,
  historicalVersions,
  selectedVersion,
  onSelect,
  onCopy,
}: {
  currentVersion: T | null;
  draftVersion: T | null;
  historicalVersions: T[];
  selectedVersion: T | null;
  onSelect: (versionId: T["id"]) => void;
  onCopy?: (version: T) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const label = selectedVersion
    ? `流程 V${selectedVersion.versionNumber} · ${flowVersionStatusLabel(selectedVersion)}`
    : "选择流程版本";
  const selectVersion = (versionId: T["id"]) => {
    setExpanded(false);
    onSelect(versionId);
  };
  return (
    <Paper
      elevation={0}
      sx={{
        position: "relative",
        zIndex: 20,
        width: { xs: 190, sm: 236 },
        overflow: "visible",
        border: "1px solid #dfe6ee",
        borderRadius: 1,
        bgcolor: "#fff",
      }}
    >
      <Button
        fullWidth
        onClick={() => setExpanded((value) => !value)}
        sx={{
          justifyContent: "space-between",
          px: 1.25,
          py: 0.7,
          minHeight: 34,
          color: "#253447",
          textTransform: "none",
          fontWeight: 650,
        }}
      >
        <Typography variant="body2" noWrap>
          {label}
        </Typography>
        <Typography component="span" sx={{ color: "#7a8796", fontSize: 16 }}>
          {expanded ? "-" : "+"}
        </Typography>
      </Button>
      {expanded ? (
        <Stack
          spacing={1.25}
          sx={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            width: { xs: 300, sm: 360 },
            maxWidth: "min(360px, calc(100vw - 32px))",
            p: 1.25,
            border: "1px solid #dfe6ee",
            borderRadius: 1,
            bgcolor: "#fff",
            boxShadow: "0 8px 24px rgba(31,45,61,.16)",
            maxHeight: 420,
            overflow: "auto",
          }}
        >
          <Box>
            <Typography variant="caption" color="text.secondary">
              当前发布
            </Typography>
            <Box sx={{ mt: 0.5 }}>
              {currentVersion ? (
                <VersionRow
                  version={currentVersion}
                  selected={
                    String(selectedVersion?.id) === String(currentVersion.id)
                  }
                  copyable={Boolean(onCopy)}
                  onSelect={() => selectVersion(currentVersion.id)}
                  onCopy={() => onCopy?.(currentVersion)}
                  copyLabel={draftVersion ? "复制到当前草稿" : "复制为新草稿"}
                />
              ) : (
                <Typography variant="caption" color="text.secondary">
                  暂无
                </Typography>
              )}
            </Box>
          </Box>
          <Box sx={{ borderTop: "1px solid #edf0f4", pt: 1.25 }}>
            <Typography variant="caption" color="text.secondary">
              编辑中草稿
            </Typography>
            <Box sx={{ mt: 0.5 }}>
              {draftVersion ? (
                <VersionRow
                  version={draftVersion}
                  selected={
                    String(selectedVersion?.id) === String(draftVersion.id)
                  }
                  onSelect={() => selectVersion(draftVersion.id)}
                />
              ) : (
                <Typography variant="caption" color="text.secondary">
                  暂无
                </Typography>
              )}
            </Box>
          </Box>
          {historicalVersions.length > 0 ? (
            <Box sx={{ borderTop: "1px solid #edf0f4", pt: 1.25 }}>
              <Typography variant="caption" color="text.secondary">
                历史版本
              </Typography>
              <Stack spacing={0.75} sx={{ mt: 0.5 }}>
                {historicalVersions.map((version) => (
                  <VersionRow
                    key={String(version.id)}
                    version={version}
                    selected={
                      String(selectedVersion?.id) === String(version.id)
                    }
                    copyable={Boolean(onCopy)}
                    onSelect={() => selectVersion(version.id)}
                    onCopy={() => onCopy?.(version)}
                    copyLabel={draftVersion ? "复制到当前草稿" : "复制为新草稿"}
                  />
                ))}
              </Stack>
            </Box>
          ) : null}
        </Stack>
      ) : null}
    </Paper>
  );
}
