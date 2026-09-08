import TableStateCell from '@/components/TableStateCell';
import {
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type SyntheticEvent,
  useEffect,
  useMemo,
  useRef,
  useState } from 'react';
import { useMutation,
  useQuery,
  useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Divider,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  MenuItem,
  Pagination,
  Slider,
  Snackbar,
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
  Typography,
} from '@mui/material';
import AppDialog from '@/components/AppDialog';
import {
  CloseOutlined,
  EmailOutlined,
  ExpandMore,
  FileUploadOutlined,
  VisibilityOffOutlined,
  VisibilityOutlined,
  KeyOutlined,
  PersonOutline,
  PhoneIphoneOutlined,
  PhotoCameraOutlined,
  Save,
  VerifiedUserOutlined,
} from '@mui/icons-material';
import {
  changeCurrentUserPassword,
  createPersonalSignature,
  getCurrentUser,
  updateCurrentUserProfile,
  uploadSignatureEvidence,
  uploadUserAvatar,
} from '@/api/identity';
import { getMyAuditLogs, type AuditLogItem } from '@/api/audit';
import { getMyLoginLogs, type LoginLogItem } from '@/api/loginLogs';
import StatusBadge from '@/components/StatusBadge';
import type { PageResult } from '@/types/common';
import { SESSION_STORAGE_KEYS } from '@/utils/sessionPolicy';

const COLORS = {
  primary: '#1890ff',
  primaryBlue: '#4092ff',
  primaryLight: '#e8f4ff',
  textPrimary: '#303133',
  textSecondary: '#606266',
  textDisabled: '#909399',
  divider: '#e4e7ed',
  pageBg: '#f6f8f9',
};

const SETTINGS_TABS = ['基本信息', '账号绑定', '数据审计', '登录日志'] as const;
const AUTH_USER_CHANGE_EVENT = 'edhr:auth-user-change';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CHINA_MOBILE_PATTERN = /^1[3-9]\d{9}$/;
const AVATAR_CROP_SIZE = 280;
const AVATAR_OUTPUT_SIZE = 512;
const SIGNATURE_PAD_WIDTH = 560;
const SIGNATURE_PAD_HEIGHT = 180;
const SIGNATURE_MEANING = '个人设置确认';
const SIGNATURE_CONFIRMATION_KEYS = ['exclusiveControl', 'authorizedUse', 'legalEffect'] as const;
const PERSONAL_LOG_PAGE_SIZE_OPTIONS = [20, 50, 100, 200] as const;
const PERSONAL_TABLE_DATA_ROW_HEIGHT = 40;
const FORCE_PASSWORD_CHANGE_KEY = SESSION_STORAGE_KEYS.forcePasswordChange;
const FORCE_SIGNATURE_VERIFICATION_KEY = SESSION_STORAGE_KEYS.forceSignatureVerification;

type BindingKey = 'wechat' | 'wecom' | 'dingtalk' | 'feishu';
const BINDING_ITEMS: BindingKey[] = ['wechat', 'wecom', 'dingtalk', 'feishu'];
type SignatureConfirmationKey = (typeof SIGNATURE_CONFIRMATION_KEYS)[number];

interface StoredUser {
  id?: string | number;
  username?: string;
  displayName?: string;
  name?: string;
  email?: string;
  phone?: string;
  avatarFileId?: string | number | null;
  avatarUrl?: string;
  birthday?: string | null;
  gender?: '男' | '女' | string | null;
  biography?: string | null;
  organizationName?: string | null;
  departmentIds?: string[];
  primaryDepartmentId?: string | null;
  latestSignatureId?: string | number | null;
  signatureCertifiedAt?: string | null;
  signatureExpiresAt?: string | null;
  signatureAuthMethod?: string | null;
  signatureAuthorizationNoticeFileId?: string | number | null;
  roleNames?: string[];
  roleIds?: string[];
  permissions?: string[];
}

interface PersonalSettingsState {
  displayName: string;
  gender: string;
  email: string;
  phone: string;
  organization: string;
  location: string;
  bindings: Record<BindingKey, string | null>;
}

interface PersonalAuditFieldRow {
  key?: string;
  label: string;
  value: string;
}

interface PersonalAuditRecord {
  id: string;
  operatorName: string;
  operatorAccount: string;
  operatedAt?: string;
  actionLabel: string;
  action?: string;
  beforeFields: PersonalAuditFieldRow[];
  afterFields: PersonalAuditFieldRow[];
}

interface SignatureState {
  signaturePassword: string;
  loginPassword: string;
  confirmations: Record<SignatureConfirmationKey, boolean>;
  hasHandwrittenSignature: boolean;
  idCardFrontFile: File | null;
  idCardBackFile: File | null;
}

interface PasswordState {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

interface CropOffset {
  x: number;
  y: number;
}

interface CropImageSize {
  width: number;
  height: number;
}

const defaultBindings: Record<BindingKey, string | null> = {
  wechat: null,
  wecom: null,
  dingtalk: null,
  feishu: null,
};

const defaultSignatureConfirmations: Record<SignatureConfirmationKey, boolean> = {
  exclusiveControl: false,
  authorizedUse: false,
  legalEffect: false,
};

const defaultState: PersonalSettingsState = {
  displayName: '',
  gender: '',
  email: '',
  phone: '',
  organization: '集团 - 事业群 - 技术部',
  location: '中国 • 广东省 • 深圳市',
  bindings: defaultBindings,
};

function buildSignatureStatements(account: string, name: string) {
  return [
    {
      key: 'exclusiveControl' as const,
      text: '本系统账号（{account}）及绑定的电子签名凭证由本人（{name}）专属持有、独立控制，不存在转借、共享或交由他人操作的情形；'
        .replace(/\{account\}/g, account)
        .replace(/\{name\}/g, name),
    },
    {
      key: 'authorizedUse' as const,
      text: '本人（{name}）授权该电子签名用于本系统内各类电子表单的审核、确认与批准等合规操作；'
        .replace(/\{name\}/g, name),
    },
    {
      key: 'legalEffect' as const,
      text: '所有以本账号（{account}）完成的电子签名行为，均代表本人（{name}）已完整审阅并确认对应表单的全部内容，与本人（{name}）手写签名具有同等法律效力，本人（{name}）对签署内容的真实性、准确性承担全部责任。'
        .replace(/\{account\}/g, account)
        .replace(/\{name\}/g, name),
    },
  ];
}

function readStoredUser(): StoredUser {
  const userJson = localStorage.getItem('user');
  if (!userJson) return {};
  try {
    return JSON.parse(userJson) as StoredUser;
  } catch {
    return {};
  }
}

function persistUser(nextUser: StoredUser) {
  localStorage.setItem('user', JSON.stringify(nextUser));
  window.dispatchEvent(new CustomEvent(AUTH_USER_CHANGE_EVENT));
}

function mergeUserData(currentUser: StoredUser, payload: StoredUser) {
  const nextUser: StoredUser = {
    ...readStoredUser(),
    ...currentUser,
    ...payload,
  };
  persistUser(nextUser);
  return nextUser;
}

function initials(value: string) {
  return value.trim().charAt(0) || '用';
}

function getContainedImageSize(width: number, height: number, frameSize = AVATAR_CROP_SIZE): CropImageSize {
  if (!width || !height) return { width: frameSize, height: frameSize };
  const ratio = width / height;
  if (ratio >= 1) {
    return { width: frameSize, height: frameSize / ratio };
  }
  return { width: frameSize * ratio, height: frameSize };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function loadCropImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (!source.startsWith('data:')) image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('头像图片加载失败，请重新上传'));
    image.src = source;
  });
}

async function createCroppedAvatarFile(
  source: string,
  cropOffset: CropOffset,
  cropScale: number,
  originalFileName: string,
): Promise<File> {
  const image = await loadCropImage(source);
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_OUTPUT_SIZE;
  canvas.height = AVATAR_OUTPUT_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('头像裁剪失败，请重试');

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE);
  const baseSize = getContainedImageSize(image.naturalWidth, image.naturalHeight);
  const displayWidth = baseSize.width * cropScale;
  const displayHeight = baseSize.height * cropScale;
  const imageLeft = (AVATAR_CROP_SIZE - displayWidth) / 2 + cropOffset.x;
  const imageTop = (AVATAR_CROP_SIZE - displayHeight) / 2 + cropOffset.y;
  const visibleLeft = clamp(0 - imageLeft, 0, displayWidth);
  const visibleTop = clamp(0 - imageTop, 0, displayHeight);
  const visibleRight = clamp(AVATAR_CROP_SIZE - imageLeft, 0, displayWidth);
  const visibleBottom = clamp(AVATAR_CROP_SIZE - imageTop, 0, displayHeight);
  const sourceX = (visibleLeft / displayWidth) * image.naturalWidth;
  const sourceY = (visibleTop / displayHeight) * image.naturalHeight;
  const sourceWidth = ((visibleRight - visibleLeft) / displayWidth) * image.naturalWidth;
  const sourceHeight = ((visibleBottom - visibleTop) / displayHeight) * image.naturalHeight;
  const frameScale = AVATAR_OUTPUT_SIZE / AVATAR_CROP_SIZE;
  const outputX = (imageLeft + visibleLeft) * frameScale;
  const outputY = (imageTop + visibleTop) * frameScale;
  const outputWidth = (visibleRight - visibleLeft) * frameScale;
  const outputHeight = (visibleBottom - visibleTop) * frameScale;
  if (sourceWidth > 0 && sourceHeight > 0 && outputWidth > 0 && outputHeight > 0) {
    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, outputX, outputY, outputWidth, outputHeight);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('头像裁剪失败，请重试'));
        return;
      }
      const baseName = originalFileName.replace(/\.[^.]+$/, '') || 'avatar';
      resolve(new File([blob], `${baseName}.png`, { type: 'image/png' }));
    }, 'image/png');
  });
}

function prepareSignatureCanvas(canvas: HTMLCanvasElement | null) {
  if (!canvas) return;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#1f2937';
  context.lineWidth = 2.4;
  context.lineCap = 'round';
  context.lineJoin = 'round';
}

function getSignatureCanvasPoint(canvas: HTMLCanvasElement, event: ReactPointerEvent<HTMLCanvasElement>) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

function createSignaturePadFile(canvas: HTMLCanvasElement | null): Promise<File> {
  return new Promise((resolve, reject) => {
    if (!canvas) {
      reject(new Error('请完成手写签名'));
      return;
    }
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('手写签名保存失败，请重试'));
        return;
      }
      resolve(new File([blob], 'handwritten-signature.png', { type: 'image/png' }));
    }, 'image/png');
  });
}

function extractUploadedFileId(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const data = payload as { fileId?: string | number | null; id?: string | number | null };
  const rawId = data.fileId ?? data.id;
  return rawId === null || rawId === undefined ? '' : String(rawId);
}

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error !== null) {
    const response = (error as { response?: { data?: { message?: string; error?: string; detail?: string } | string } }).response;
    const responseData = response?.data;
    if (typeof responseData === 'string' && responseData.trim()) {
      try {
        const parsed = JSON.parse(responseData) as { message?: string; error?: string; detail?: string };
        if (parsed.message) return parsed.message;
        if (parsed.detail) return parsed.detail;
        if (parsed.error) return parsed.error;
      } catch {
        return responseData;
      }
    }
    if (responseData && typeof responseData === 'object') {
      if (responseData.message) return responseData.message;
      if (responseData.detail) return responseData.detail;
      if (responseData.error) return responseData.error;
    }
  }

  if (error instanceof Error && error.message && !/^Request failed with status code \d+$/i.test(error.message)) return error.message;
  return fallback;
}

function readDisplayValue(value?: string | number | null) {
  return value === undefined || value === null || value === '' ? '-' : String(value);
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  return value.replace('T', ' ').slice(0, 19);
}

function formatSignatureTimestamp(value?: string | null) {
  if (!value) return '-';
  return value.replace('T', ' ').slice(0, 19);
}

function isExpiredSignature(expiresAt?: string | null) {
  if (!expiresAt) return false;
  const timestamp = new Date(expiresAt).getTime();
  return !Number.isNaN(timestamp) && timestamp < Date.now();
}

function getSignatureStatusMeta(certifiedAt?: string | null, expiresAt?: string | null) {
  if (!certifiedAt) {
    return {
      status: 'UNVERIFIED' as const,
      badgeLabel: '未认证',
      color: 'default' as const,
      summary: '电子签名未认证',
    };
  }
  if (isExpiredSignature(expiresAt)) {
    return {
      status: 'EXPIRED' as const,
      badgeLabel: '已过期',
      color: 'error' as const,
      summary: '电子签名已过期',
    };
  }
  return {
    status: 'CERTIFIED' as const,
    badgeLabel: '已认证',
    color: 'success' as const,
    summary: '电子签名已认证',
  };
}

function buildFilePreviewUrl(fileId: string | number | null | undefined) {
  if (fileId === null || fileId === undefined || fileId === '') return '';
  return `/api/v1/files/${fileId}/preview`;
}

async function fetchAuthenticatedFileBlob(fileUrl: string) {
  const token = localStorage.getItem('token');
  const response = await fetch(fileUrl, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    let message = '授权通知书获取失败';
    try {
      const responseText = await response.text();
      if (responseText) {
        const parsed = JSON.parse(responseText) as { message?: string; detail?: string; error?: string };
        message = parsed.message || parsed.detail || parsed.error || responseText;
      }
    } catch {
      message = `授权通知书获取失败（${response.status}）`;
    }
    throw new Error(message);
  }
  return response.blob();
}

function preservePersonalAuditJsonLargeNumbers(raw: string): string {
  return raw.replace(/([:[,])\s*(-?\d{16,})(?=\s*[,}\]])/g, '$1"$2"');
}

function normalizePersonalAuditValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;

  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^-?\d{16,}$/.test(trimmed)) return trimmed;

  try {
    return JSON.parse(preservePersonalAuditJsonLargeNumbers(trimmed));
  } catch {
    return trimmed;
  }
}

function getPersonalAuditFieldLabel(field: string): string {
  return personalAuditFieldLabelMap[field] ?? field;
}

function getPersonalAuditFieldOrderIndex(field: string): number {
  const index = personalAuditFieldOrder.indexOf(field);
  return index === -1 ? personalAuditFieldOrder.length : index;
}

function sortPersonalAuditFieldRows(entries: Array<[string, unknown]>): Array<[string, unknown]> {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => {
      const orderDelta = getPersonalAuditFieldOrderIndex(left.entry[0]) - getPersonalAuditFieldOrderIndex(right.entry[0]);
      return orderDelta === 0 ? left.index - right.index : orderDelta;
    })
    .map((item) => item.entry);
}

function dedupePersonalAuditFieldRows(rows: PersonalAuditFieldRow[]): PersonalAuditFieldRow[] {
  const seenRows = new Set<string>();
  return rows.filter((row) => {
    const signature = `${row.label}\u0000${row.value}`;
    if (seenRows.has(signature)) return false;
    seenRows.add(signature);
    return true;
  });
}

function getPersonalAuditScalarDisplayValue(field: string, trimmed: string): string {
  if (field === 'status') {
    const normalized = trimmed.toUpperCase();
    if (normalized === 'ACTIVE' || normalized === 'ENABLED') return '启用';
    if (normalized === 'DISABLED' || normalized === 'INACTIVE') return '禁用';
    if (normalized === 'LOCKED') return '锁定';
  }

  if (field === 'organizationName' || field === 'organization' || field === 'departmentName') {
    return trimmed;
  }

  if (field === 'primaryDepartmentId' || field === 'departmentId' || field === 'departmentIds') {
    return `历史组织ID(${trimmed})`;
  }

  return trimmed;
}

function getPersonalAuditDisplayValue(field: string, value: unknown): string {
  const normalized = normalizePersonalAuditValue(value);
  if (normalized === undefined || normalized === null) return '-';

  if (typeof normalized === 'string') {
    const trimmed = normalized.trim();
    if (!trimmed || trimmed === 'undefined' || trimmed === 'null') return '-';
    return getPersonalAuditScalarDisplayValue(field, trimmed);
  }

  if (Array.isArray(normalized)) {
    if (normalized.length === 0) return '-';
    return normalized.map((item) => getPersonalAuditDisplayValue(field, item)).join('、');
  }

  if (typeof normalized === 'number' || typeof normalized === 'boolean') {
    return getPersonalAuditScalarDisplayValue(field, String(normalized));
  }

  if (typeof normalized === 'object') {
    const entries = Object.entries(normalized as Record<string, unknown>);
    if (entries.length === 0) return '-';
    return entries
      .map(([nestedField, fieldValue]) => `${getPersonalAuditFieldLabel(nestedField)}:${getPersonalAuditDisplayValue(nestedField, fieldValue)}`)
      .join('；');
  }

  return String(normalized);
}

function formatPersonalAuditFieldRows(value: unknown): PersonalAuditFieldRow[] {
  const normalized = normalizePersonalAuditValue(value);
  if (normalized === undefined || normalized === null || normalized === '') return [];

  if (typeof normalized === 'object' && !Array.isArray(normalized)) {
    const record = normalized as Record<string, unknown>;
    const hasOrganizationSnapshot = record.organizationName !== undefined || record.organization !== undefined;
    const rows = sortPersonalAuditFieldRows(Object.entries(record)
      .filter(([field]) => !hasOrganizationSnapshot || !['primaryDepartmentId', 'departmentId', 'departmentIds', 'departmentName'].includes(field))).map(([field, fieldValue]) => ({
      key: field,
      label: getPersonalAuditFieldLabel(field),
      value: getPersonalAuditDisplayValue(field, fieldValue),
    }));
    return dedupePersonalAuditFieldRows(rows);
  }

  return [{ key: 'content', label: '内容', value: getPersonalAuditDisplayValue('content', normalized) }];
}

function getPersonalAuditActionLabel(item: AuditLogItem): string {
  const normalized = (item.action || '').toUpperCase();
  if (normalized === 'UPDATE') return '更新';
  if (normalized === 'CREATE') return '创建';
  if (normalized === 'DELETE') return '删除';
  return readDisplayValue(item.actionLabel || item.action);
}

function getPersonalAuditRecords(items: AuditLogItem[]): PersonalAuditRecord[] {
  return items.map((item) => ({
    id: String(item.id),
    operatorName: readDisplayValue(item.operatorDisplayName),
    operatorAccount: readDisplayValue(item.operatorAccount),
    operatedAt: item.operationTime || item.createdAt,
    actionLabel: getPersonalAuditActionLabel(item),
    action: item.action,
    beforeFields: formatPersonalAuditFieldRows(item.contentBefore),
    afterFields: formatPersonalAuditFieldRows(item.contentAfter ?? item.reason),
  }));
}

function getAuditActionTone(action?: string): 'success' | 'warning' | 'error' | 'info' | 'default' | 'primary' {
  const normalized = (action || '').toUpperCase();
  if (['CREATE', 'ENABLE', 'LOGIN'].includes(normalized)) return 'success';
  if (['DELETE', 'BATCH_DELETE', 'DISABLE'].includes(normalized)) return 'error';
  if (['RESET_PASSWORD', 'PERMISSION_UPDATE'].includes(normalized)) return 'warning';
  if (['UPDATE', 'UPLOAD', 'UPLOAD_LOGO', 'UPLOAD_FAVICON'].includes(normalized)) return 'primary';
  if (normalized === 'LOGOUT') return 'info';
  return 'default';
}

function getLoginEventTone(eventType?: string): 'success' | 'info' | 'default' {
  if (eventType === 'LOGIN') return 'success';
  if (eventType === 'LOGOUT') return 'info';
  return 'default';
}

const personalTableHeaderCellSx = {
  height: 48,
  py: 0,
  color: COLORS.textSecondary,
  fontWeight: 600,
  bgcolor: '#f5f7fa',
  borderBottom: `1px solid ${COLORS.divider}`,
  whiteSpace: 'nowrap',
};

const personalTableBodyCellSx = {
  height: PERSONAL_TABLE_DATA_ROW_HEIGHT,
  py: 0,
  borderBottom: 'none',
  boxShadow: 'inset 0 -1px 0 #ebeef5',
  whiteSpace: 'nowrap',
};

const personalEmptyTableCellSx = {
  height: '100%',
  py: 0,
  color: COLORS.textDisabled,
  borderBottom: `1px solid ${COLORS.divider}`,
};

const personalAuditFieldLabelMap: Record<string, string> = {
  username: '账号',
  displayName: '姓名',
  name: '姓名',
  email: '邮箱',
  phone: '手机',
  status: '状态',
  primaryDepartmentId: '所属组织',
  departmentId: '所属组织',
  departmentIds: '所属组织',
  departmentName: '所属组织',
  organization: '所属组织',
  organizationName: '所属组织',
  roleIds: '岗位角色',
  roles: '岗位角色',
  password: '密码',
  birthday: '生日',
  gender: '性别',
  biography: '个人简介',
  signatureCertifiedAt: '电子签名认证时间',
  signatureExpiresAt: '电子签名失效时间',
  latestSignatureId: '电子签名',
  signatureAuthorizationNoticeFileId: '授权通知书',
  createdBy: '创建人',
  createdAt: '创建时间',
  updatedBy: '更新人',
  updatedAt: '更新时间',
};

const personalAuditFieldOrder = [
  'username',
  'displayName',
  'name',
  'password',
  'email',
  'phone',
  'status',
  'organization',
  'organizationName',
  'primaryDepartmentId',
  'departmentId',
  'departmentIds',
  'departmentName',
  'roleIds',
  'roles',
  'birthday',
  'gender',
  'biography',
  'signatureCertifiedAt',
  'signatureExpiresAt',
  'latestSignatureId',
  'signatureAuthorizationNoticeFileId',
  'createdBy',
  'createdAt',
  'updatedBy',
  'updatedAt',
];

function getBindingSubtitle(bindingKey: BindingKey, value: string | null): string {
  if (value) return value;
  switch (bindingKey) {
    case 'wechat':
      return '当前未绑定绑定微信账号';
    case 'wecom':
      return '当前未绑定绑定企业微信账号';
    case 'dingtalk':
      return '当前未绑定绑定钉钉账号';
    case 'feishu':
      return '当前未绑定绑定飞书账号';
    default:
      return '';
  }
}

function getBindingTitle(bindingKey: BindingKey): string {
  switch (bindingKey) {
    case 'wechat':
      return '绑定微信';
    case 'wecom':
      return '绑定企业微信';
    case 'dingtalk':
      return '绑定钉钉';
    case 'feishu':
      return '绑定飞书';
  }
}

function BindingWechatIcon() {
  return (
    <svg width="31" height="31" viewBox="0 0 36 36" aria-hidden="true" focusable="false" style={{ display: 'block' }}>
      <path d="M15.2 9.1C9.9 9.1 5.7 12.6 5.7 17c0 2.4 1.2 4.5 3.3 6l-.8 3 3.4-1.7c1.1.4 2.3.6 3.6.6 5.2 0 9.5-3.5 9.5-7.9s-4.3-7.9-9.5-7.9Z" fill="#19be6b" />
      <path d="M21.4 14.6c4.9 0 8.9 3.2 8.9 7.2 0 2.1-1.1 4-2.9 5.3l.7 2.7-3-1.5c-1.1.4-2.3.6-3.6.6-4.9 0-8.9-3.2-8.9-7.2s3.9-7.1 8.8-7.1Z" fill="#24d486" opacity="0.92" />
      <circle cx="11.8" cy="16.3" r="1.25" fill="#ffffff" />
      <circle cx="18.1" cy="16.3" r="1.25" fill="#ffffff" />
      <circle cx="18.6" cy="21.6" r="1.1" fill="#ffffff" />
      <circle cx="24.5" cy="21.6" r="1.1" fill="#ffffff" />
    </svg>
  );
}

function BindingWeComIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 36 36" aria-hidden="true" focusable="false" style={{ display: 'block' }}>
      <path
        d="M17.2 6.5c-6.1 0-11 4.3-11 9.7 0 3.2 1.8 6 4.5 7.7l-.6 4.3 4.2-2.5c.9.2 1.9.3 2.9.3 2.7 0 5.2-.9 7.1-2.3"
        fill="none"
        stroke="#1684f6"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M22.8 23.2c1.3-.8 2.3-1.9 3-3.1" fill="none" stroke="#ffc83d" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M26.1 19.5c.4-1 .6-2 .6-3" fill="none" stroke="#18be6b" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M27.2 16.2c.9.2 1.9.7 2.7 1.4" fill="none" stroke="#18be6b" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M30.4 18.4c.5.8.8 1.8.8 2.8" fill="none" stroke="#1684f6" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M30.5 22.3c-.5.9-1.3 1.8-2.3 2.4" fill="none" stroke="#ff8f1f" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="27" cy="15.4" r="2" fill="#18be6b" />
      <circle cx="31" cy="21.2" r="2" fill="#1684f6" />
      <circle cx="27.2" cy="25" r="2" fill="#ff8f1f" />
      <circle cx="22.6" cy="23.6" r="1.8" fill="#ffc83d" />
    </svg>
  );
}

function BindingDingTalkIcon() {
  return (
    <svg width="31" height="31" viewBox="0 0 36 36" aria-hidden="true" focusable="false" style={{ display: 'block' }}>
      <path d="M7 7.2 29.6 16 21 16.9l5.6 3.6-7.2 1.1 3.1 3.1-6.3 8.4.7-8-5.9.5 3-4.7-7-.9 5.1-3.5C9.7 14.2 8 10.9 7 7.2Z" fill="#1684f6" />
      <path d="M7 7.2 29.6 16 21 16.9l-8.9-.4C9.7 14.2 8 10.9 7 7.2Z" fill="#69b7ff" />
      <path d="m14 20.9-7-.9 5.1-3.5 8.9.4-5.9 1.9 11.5 1.7-7.2 1.1-3.2 3.5.7-4.8-2.9.6Z" fill="#2f95ff" />
      <path d="m16.2 25.1.7-4.8 5.6 4.4-6.3 8.4Z" fill="#006fe6" />
    </svg>
  );
}

function BindingFeishuIcon() {
  return (
    <svg width="31" height="31" viewBox="0 0 36 36" aria-hidden="true" focusable="false" style={{ display: 'block' }}>
      <path d="M6.4 11.2c6.9 4.7 13.1 7 18.8 6.5 2.1-.2 3.7-.8 4.8-1.6-3.1 6.8-8.2 10.8-15 11.9-3.8-2-6.6-4.6-8.6-7.8v-9Z" fill="#2654f4" />
      <path d="M9.2 9h10.5c2.1 0 3.8.9 5.1 2.5l5.2 4.6c-1.1.8-2.7 1.4-4.8 1.6-5.7.5-11.9-1.8-18.8-6.5.6-1.3 1.5-2.2 2.8-2.2Z" fill="#11cfc4" />
      <path d="M6.4 20.2c3.9 2.7 8.3 4 13.3 3.7-1.4 1.8-3 3.2-4.7 4.1-3.8-2-6.6-4.6-8.6-7.8Z" fill="#4777ff" />
      <path d="M19.7 9c3.5 2.4 5.3 5.3 5.5 8.7-5.7.5-11.9-1.8-18.8-6.5 1.1 0 8.2-.7 13.3-2.2Z" fill="#ffffff" opacity="0.16" />
    </svg>
  );
}

function getBindingIcon(bindingKey: BindingKey) {
  switch (bindingKey) {
    case 'wechat':
      return <BindingWechatIcon />;
    case 'wecom':
      return <BindingWeComIcon />;
    case 'dingtalk':
      return <BindingDingTalkIcon />;
    case 'feishu':
      return <BindingFeishuIcon />;
  }
}

export default function PersonalSettingsPage() {
  const [activeTab, setActiveTab] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [auditPageSize, setAuditPageSize] = useState(20);
  const [expandedAuditRecordId, setExpandedAuditRecordId] = useState<string | null>(null);
  const [loginPage, setLoginPage] = useState(1);
  const [loginPageSize, setLoginPageSize] = useState(20);
  const [loginEventType, setLoginEventType] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const signatureDrawingRef = useRef(false);
  const queryClient = useQueryClient();
  const [state, setState] = useState<PersonalSettingsState>(defaultState);
  const [signatureState, setSignatureState] = useState<SignatureState>({
    signaturePassword: '',
    loginPassword: '',
    confirmations: defaultSignatureConfirmations,
    hasHandwrittenSignature: false,
    idCardFrontFile: null,
    idCardBackFile: null,
  });
  const [signaturePasswordVisible, setSignaturePasswordVisible] = useState(false);
  const [loginPasswordVisible, setLoginPasswordVisible] = useState(false);
  const [signatureDialogOpen, setSignatureDialogOpen] = useState(false);
  const [signatureNoticeAction, setSignatureNoticeAction] = useState<'preview' | null>(null);
  const [signatureNoticePreviewUrl, setSignatureNoticePreviewUrl] = useState('');
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [forcePasswordChangeRequired, setForcePasswordChangeRequired] = useState(
    () => localStorage.getItem(FORCE_PASSWORD_CHANGE_KEY) === 'true',
  );
  const [forceSignatureVerificationRequired, setForceSignatureVerificationRequired] = useState(
    () => localStorage.getItem(FORCE_SIGNATURE_VERIFICATION_KEY) === 'true',
  );
  const [passwordState, setPasswordState] = useState<PasswordState>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [avatarCropDialogOpen, setAvatarCropDialogOpen] = useState(false);
  const [cropImageSource, setCropImageSource] = useState('');
  const [cropFileName, setCropFileName] = useState('avatar.png');
  const [cropScale, setCropScale] = useState(1);
  const [cropOffset, setCropOffset] = useState<CropOffset>({ x: 0, y: 0 });
  const [cropImageSize, setCropImageSize] = useState<CropImageSize>({ width: 0, height: 0 });
  const [cropImageLoadFailed, setCropImageLoadFailed] = useState(false);
  const [cropSaving, setCropSaving] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const userQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const response = await getCurrentUser({ skipAuthRedirect: true });
      return response.data.data as StoredUser;
    },
  });

  const auditLogsQuery = useQuery<PageResult<AuditLogItem>>({
    queryKey: ['personal-settings-audit-logs', auditPage, auditPageSize],
    queryFn: () => getMyAuditLogs({
      page: auditPage,
      size: auditPageSize,
      sort: 'createdAt',
      order: 'desc',
    }),
    enabled: activeTab === 2,
  });

  const loginLogsQuery = useQuery<PageResult<LoginLogItem>>({
    queryKey: ['personal-settings-login-logs', loginPage, loginPageSize, loginEventType],
    queryFn: () => getMyLoginLogs({
      page: loginPage,
      size: loginPageSize,
      sort: 'occurredAt',
      eventType: loginEventType || undefined,
    }),
    enabled: activeTab === 3,
  });

  const currentUser = useMemo(() => {
    const apiUser = userQuery.data ?? {};
    const storedUser = readStoredUser();
    return {
      ...storedUser,
      ...apiUser,
    };
  }, [userQuery.data]);

  useEffect(() => {
    const displayName = currentUser.displayName || currentUser.name || currentUser.username || '管理员';
    setState((current) => ({
      ...current,
      displayName,
      gender: currentUser.gender || '',
      email: currentUser.email || '',
      phone: currentUser.phone || '',
      organization: currentUser.organizationName || '-',
    }));
  }, [currentUser]);

  useEffect(() => {
    if (!signatureDialogOpen) return;
    window.setTimeout(() => prepareSignatureCanvas(signatureCanvasRef.current), 0);
  }, [signatureDialogOpen]);

  useEffect(() => {
    if (forcePasswordChangeRequired) {
      setPasswordDialogOpen(true);
      return;
    }
    if (forceSignatureVerificationRequired) {
      setSignatureDialogOpen(true);
    }
  }, [forcePasswordChangeRequired, forceSignatureVerificationRequired]);

  const cropDisplaySize = useMemo(() => {
    const baseSize = getContainedImageSize(cropImageSize.width, cropImageSize.height);
    return {
      width: baseSize.width * cropScale,
      height: baseSize.height * cropScale,
    };
  }, [cropImageSize, cropScale]);

  const nameValue = state.displayName.trim() || currentUser.displayName || currentUser.name || currentUser.username || '管理员';
  const accountValue = currentUser.username || '-';
  const signatureGuideText = nameValue.replace(/\s+/g, '').split('').join('   ');
  const signatureStatements = useMemo(
    () => buildSignatureStatements(String(accountValue), String(nameValue)),
    [accountValue, nameValue],
  );

  const showMessage = (message: string, severity: 'success' | 'error') => {
    setSnackbar({ open: true, message, severity });
  };

  const handleSnackbarClose = (_event?: SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') return;
    setSnackbar((current) => ({ ...current, open: false }));
  };

  const profileMutation = useMutation({
    mutationFn: async (nextState: PersonalSettingsState = state) => {
      const response = await updateCurrentUserProfile({
        displayName: nextState.displayName.trim(),
        gender: nextState.gender.trim(),
        email: nextState.email.trim(),
        phone: nextState.phone.trim(),
      });
      return response.data.data as StoredUser;
    },
    onSuccess: (payload) => {
      const nextUser = mergeUserData(currentUser, payload);
      queryClient.setQueryData(['auth', 'me'], nextUser);
      showMessage('个人设置已保存', 'success');
    },
    onError: (error) => showMessage(getErrorMessage(error, '个人设置保存失败'), 'error'),
  });

  const passwordMutation = useMutation({
    mutationFn: async () => {
      await changeCurrentUserPassword({
        currentPassword: passwordState.currentPassword,
        newPassword: passwordState.newPassword,
        confirmPassword: passwordState.confirmPassword,
      });
    },
    onSuccess: () => {
      setPasswordState({ currentPassword: '', newPassword: '', confirmPassword: '' });
      localStorage.removeItem(FORCE_PASSWORD_CHANGE_KEY);
      setForcePasswordChangeRequired(false);
      setPasswordDialogOpen(false);
      if (localStorage.getItem(FORCE_SIGNATURE_VERIFICATION_KEY) === 'true') {
        setForceSignatureVerificationRequired(true);
        setSignatureDialogOpen(true);
      }
      showMessage('密码修改成功', 'success');
    },
    onError: (error) => showMessage(getErrorMessage(error, '密码修改失败'), 'error'),
  });

  const avatarMutation = useMutation({
    mutationFn: async (file: File) => {
      const response = await uploadUserAvatar(file);
      return response.data.data as StoredUser;
    },
    onSuccess: (payload) => {
      const nextUser = mergeUserData(currentUser, payload);
      queryClient.setQueryData(['auth', 'me'], nextUser);
      setAvatarCropDialogOpen(false);
      setCropSaving(false);
      showMessage('头像上传成功', 'success');
    },
    onError: (error) => {
      setCropSaving(false);
      showMessage(getErrorMessage(error, '头像上传失败'), 'error');
    },
  });

  const signatureMutation = useMutation({
    mutationFn: async () => {
      const signatureFile = await createSignaturePadFile(signatureCanvasRef.current);
      const [signatureImageResponse, idCardFrontResponse, idCardBackResponse] = await Promise.all([
        uploadSignatureEvidence(signatureFile),
        uploadSignatureEvidence(signatureState.idCardFrontFile as File),
        uploadSignatureEvidence(signatureState.idCardBackFile as File),
      ]);
      const signatureImageFileId = extractUploadedFileId(signatureImageResponse.data.data);
      const idCardFrontFileId = extractUploadedFileId(idCardFrontResponse.data.data);
      const idCardBackFileId = extractUploadedFileId(idCardBackResponse.data.data);
      const response = await createPersonalSignature({
        signaturePassword: signatureState.signaturePassword,
        loginPassword: signatureState.loginPassword,
        meaning: SIGNATURE_MEANING,
        signatureImageFileId,
        idCardFrontFileId,
        idCardBackFileId,
        statements: signatureStatements.map((statement) => ({
          key: statement.key,
          text: statement.text,
          confirmed: signatureState.confirmations[statement.key],
        })),
      });
      return response.data.data as {
        signatureId?: string;
        signedAt?: string;
        expiresAt?: string;
        authorizationNoticeFileId?: string | number | null;
        authMethod?: string;
      };
    },
    onSuccess: (payload) => {
      const nextUser = mergeUserData(currentUser, {
        latestSignatureId: payload.signatureId,
        signatureCertifiedAt: payload.signedAt,
        signatureExpiresAt: payload.expiresAt,
        signatureAuthMethod: payload.authMethod,
        signatureAuthorizationNoticeFileId: payload.authorizationNoticeFileId,
      });
      setSignatureDialogOpen(false);
      setSignatureState((current) => ({
        ...current,
        signaturePassword: '',
        loginPassword: '',
        confirmations: defaultSignatureConfirmations,
        hasHandwrittenSignature: false,
        idCardFrontFile: null,
        idCardBackFile: null,
      }));
      prepareSignatureCanvas(signatureCanvasRef.current);
      void userQuery.refetch();
      persistUser(nextUser);
      localStorage.removeItem(FORCE_SIGNATURE_VERIFICATION_KEY);
      setForceSignatureVerificationRequired(false);
      showMessage('电子签名认证成功', 'success');
    },
    onError: (error) => showMessage(getErrorMessage(error, '电子签名认证失败'), 'error'),
  });

  const resetCropState = () => {
    setCropScale(1);
    setCropOffset({ x: 0, y: 0 });
    setCropImageSize({ width: 0, height: 0 });
    setCropImageLoadFailed(false);
  };

  const handleOpenAvatarEditor = () => {
    if (!cropImageSource && avatarUrl) {
      setCropImageSource(avatarUrl);
      setCropFileName('avatar.png');
      resetCropState();
    }
    setAvatarCropDialogOpen(true);
  };

  const handleAvatarKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleOpenAvatarEditor();
    }
  };

  const handleAvatarFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showMessage('请上传图片文件', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setCropImageSource(String(reader.result || ''));
      setCropFileName(file.name || 'avatar.png');
      resetCropState();
      setAvatarCropDialogOpen(true);
    };
    reader.onerror = () => showMessage('头像图片读取失败，请重新上传', 'error');
    reader.readAsDataURL(file);
  };

  const handleAvatarUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleCropImageLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget;
    setCropImageLoadFailed(false);
    setCropImageSize({
      width: image.naturalWidth,
      height: image.naturalHeight,
    });
  };

  const handleCropImageError = () => {
    setCropImageLoadFailed(true);
    setCropImageSize({ width: 0, height: 0 });
  };

  const handleCropMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!cropImageSource) return;
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const startOffset = cropOffset;
    const handleMouseMove = (moveEvent: MouseEvent) => {
      setCropOffset({
        x: startOffset.x + moveEvent.clientX - startX,
        y: startOffset.y + moveEvent.clientY - startY,
      });
    };
    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleAvatarCropSave = async () => {
    if (!cropImageSource || cropImageLoadFailed) {
      showMessage('请先上传头像图片', 'error');
      return;
    }
    setCropSaving(true);
    try {
      const file = await createCroppedAvatarFile(cropImageSource, cropOffset, cropScale, cropFileName);
      avatarMutation.mutate(file);
    } catch (error) {
      setCropSaving(false);
      showMessage(getErrorMessage(error, '头像裁剪失败'), 'error');
    }
  };

  const handleOpenSignatureDialog = () => {
    setSignatureDialogOpen(true);
  };

  const handleCloseSignatureDialog = () => {
    if (signatureMutation.isPending || forceSignatureVerificationRequired) return;
    setSignatureDialogOpen(false);
  };

  const handleClosePasswordDialog = () => {
    if (passwordMutation.isPending || forcePasswordChangeRequired) return;
    setPasswordDialogOpen(false);
    setPasswordState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  };

  const handleSignaturePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = signatureCanvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    const point = getSignatureCanvasPoint(canvas, event);
    signatureDrawingRef.current = true;
    context.beginPath();
    context.moveTo(point.x, point.y);
  };

  const handleSignaturePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = signatureCanvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context || !signatureDrawingRef.current) return;
    const point = getSignatureCanvasPoint(canvas, event);
    context.lineTo(point.x, point.y);
    context.stroke();
    setSignatureState((current) => current.hasHandwrittenSignature ? current : { ...current, hasHandwrittenSignature: true });
  };

  const handleSignaturePointerEnd = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = signatureCanvasRef.current;
    if (canvas?.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    signatureDrawingRef.current = false;
  };

  const handleClearSignaturePad = () => {
    prepareSignatureCanvas(signatureCanvasRef.current);
    setSignatureState((current) => ({ ...current, hasHandwrittenSignature: false }));
  };

  const handleSignatureEvidenceChange = (side: 'front' | 'back', event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showMessage('请上传图片格式的身份证材料', 'error');
      return;
    }
    setSignatureState((current) => ({
      ...current,
      idCardFrontFile: side === 'front' ? file : current.idCardFrontFile,
      idCardBackFile: side === 'back' ? file : current.idCardBackFile,
    }));
  };

  const handleSignatureConfirmationChange = (key: SignatureConfirmationKey, checked: boolean) => {
    setSignatureState((current) => ({
      ...current,
      confirmations: {
        ...current.confirmations,
        [key]: checked,
      },
    }));
  };

  const handleSave = () => {
    if (state.email.trim() && !EMAIL_PATTERN.test(state.email.trim())) {
      showMessage('请输入正确的邮箱地址', 'error');
      return;
    }
    if (state.phone.trim() && !CHINA_MOBILE_PATTERN.test(state.phone.trim())) {
      showMessage('请输入正确的手机', 'error');
      return;
    }
    profileMutation.mutate(state);
  };

  const handlePasswordSubmit = () => {
    if (!passwordState.currentPassword.trim()) {
      showMessage('请输入当前密码', 'error');
      return;
    }
    if (!passwordState.newPassword.trim()) {
      showMessage('请输入新密码', 'error');
      return;
    }
    if (passwordState.newPassword !== passwordState.confirmPassword) {
      showMessage('两次输入的新密码不一致', 'error');
      return;
    }
    passwordMutation.mutate();
  };

  const handleSignatureSubmit = () => {
    if (!signatureState.signaturePassword.trim()) {
      showMessage('请输入电子签名密码', 'error');
      return;
    }
    if (!signatureState.loginPassword.trim()) {
      showMessage('请输入当前系统登录密码', 'error');
      return;
    }
    if (!signatureState.hasHandwrittenSignature) {
      showMessage('请完成手写签名', 'error');
      return;
    }
    if (!signatureState.idCardFrontFile) {
      showMessage('请上传身份证正面', 'error');
      return;
    }
    if (!signatureState.idCardBackFile) {
      showMessage('请上传身份证反面', 'error');
      return;
    }
    if (!allSignatureStatementsConfirmed) {
      showMessage('请逐条确认电子签名声明', 'error');
      return;
    }
    signatureMutation.mutate();
  };

  const handlePreviewSignatureAuthorizationNotice = async () => {
    if (!signatureAuthorizationNoticePreviewUrl) return;
    setSignatureNoticeAction('preview');
    try {
      const blob = await fetchAuthenticatedFileBlob(signatureAuthorizationNoticePreviewUrl);
      const objectUrl = URL.createObjectURL(new Blob([blob], { type: blob.type || 'application/pdf' }));
      setSignatureNoticePreviewUrl((currentUrl) => {
        if (currentUrl) URL.revokeObjectURL(currentUrl);
        return objectUrl;
      });
    } catch (error) {
      showMessage(getErrorMessage(error, '授权通知书预览失败'), 'error');
    } finally {
      setSignatureNoticeAction(null);
    }
  };

  const handleCloseSignatureAuthorizationPreview = () => {
    setSignatureNoticePreviewUrl((currentUrl) => {
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      return '';
    });
  };

  const handleBindingChange = (key: BindingKey, value: string) => {
    setState((current) => ({ ...current, bindings: { ...current.bindings, [key]: value || null } }));
  };

  const avatarUrl = currentUser.avatarUrl || '';
  const organizationValue = currentUser.organizationName || state.organization || '-';
  const certifiedAt = formatSignatureTimestamp(currentUser.signatureCertifiedAt);
  const expiresAt = formatSignatureTimestamp(currentUser.signatureExpiresAt);
  const signatureStatusMeta = getSignatureStatusMeta(currentUser.signatureCertifiedAt, currentUser.signatureExpiresAt);
  const signatureActionLabel = signatureStatusMeta.status === 'UNVERIFIED' ? '认证' : '重新认证';
  const signatureAuthorizationNoticeFileId = currentUser.signatureAuthorizationNoticeFileId ?? null;
  const signatureAuthorizationNoticePreviewUrl = buildFilePreviewUrl(signatureAuthorizationNoticeFileId);
  const emailError = Boolean(state.email.trim() && !EMAIL_PATTERN.test(state.email.trim()));
  const phoneError = Boolean(state.phone.trim() && !CHINA_MOBILE_PATTERN.test(state.phone.trim()));
  const allSignatureStatementsConfirmed = signatureStatements.every((statement) => signatureState.confirmations[statement.key]);
  const canSubmitSignature = Boolean(
    signatureState.signaturePassword.trim()
      && signatureState.loginPassword.trim()
      && signatureState.hasHandwrittenSignature
      && signatureState.idCardFrontFile
      && signatureState.idCardBackFile
      && allSignatureStatementsConfirmed,
  );
  const auditLogs = auditLogsQuery.data?.content ?? [];
  const auditRecords = useMemo(() => getPersonalAuditRecords(auditLogs), [auditLogs]);
  const resolvedExpandedAuditRecordId = expandedAuditRecordId ?? auditRecords[0]?.id ?? null;
  const loginLogs = loginLogsQuery.data?.content ?? [];

  const renderAccountBindingPanel = () => (
    <Box sx={{ bgcolor: '#fff', border: `1px solid ${COLORS.divider}`, borderRadius: 1, p: 2.5 }}>
      <Stack spacing={1.5}>
        {BINDING_ITEMS.map((bindingKey) => {
          const value = state.bindings[bindingKey];
          return (
            <Box
              key={bindingKey}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                minHeight: 66,
                p: 1.5,
                border: `1px solid ${COLORS.divider}`,
                borderRadius: 1,
              }}
            >
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  bgcolor: COLORS.primaryLight,
                  color: COLORS.primary,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  '& .MuiSvgIcon-root': { fontSize: 24 },
                }}
              >
                {getBindingIcon(bindingKey)}
              </Box>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography sx={{ fontSize: 15, fontWeight: 600, color: COLORS.textPrimary }}>{getBindingTitle(bindingKey)}</Typography>
                <Typography sx={{ mt: 0.5, fontSize: 13, color: COLORS.textSecondary }} noWrap>
                  {getBindingSubtitle(bindingKey, value)}
                </Typography>
              </Box>
              <Button
                variant="text"
                onClick={() => handleBindingChange(bindingKey, value ?? '')}
                sx={{ minWidth: 88, height: 36 }}
              >
                {value ? '更换绑定' : '添加绑定'}
              </Button>
            </Box>
          );
        })}
      </Stack>
    </Box>
  );

  const renderAuditPanel = () => (
    <PersonalLogPanel
      data-personal-settings-audit-panel
      title="个人资料变更记录"
      description="包含当前用户自己在个人设置页的改动以及管理员改动您用户资料的记录。"
      emptyText="暂无个人资料变更记录"
      loading={auditLogsQuery.isLoading || auditLogsQuery.isFetching}
      error={auditLogsQuery.isError}
      page={auditPage}
      pageSize={auditPageSize}
      totalPages={auditLogsQuery.data?.totalPages ?? 0}
      totalElements={auditLogsQuery.data?.totalElements ?? 0}
      onPageChange={setAuditPage}
      onPageSizeChange={(nextSize) => {
        setAuditPageSize(nextSize);
        setAuditPage(1);
      }}
      minWidth={720}
      headers={['操作人', '账号', '操作时间', '操作动作']}
      isEmpty={auditRecords.length === 0}
      colSpan={4}
    >
      {auditRecords.map((record) => (
        <PersonalAuditLogRow
          key={record.id}
          record={record}
          expanded={resolvedExpandedAuditRecordId === record.id}
          onToggle={() => setExpandedAuditRecordId(resolvedExpandedAuditRecordId === record.id ? '' : record.id)}
        />
      ))}
    </PersonalLogPanel>
  );

  const renderLoginPanel = () => (
    <PersonalLogPanel
      data-personal-settings-login-panel
      title="本人登录登出记录"
      description="仅展示当前账号自己的登录、登出历史。"
      emptyText="暂无登录日志"
      loading={loginLogsQuery.isLoading || loginLogsQuery.isFetching}
      error={loginLogsQuery.isError}
      page={loginPage}
      pageSize={loginPageSize}
      totalPages={loginLogsQuery.data?.totalPages ?? 0}
      totalElements={loginLogsQuery.data?.totalElements ?? 0}
      onPageChange={setLoginPage}
      onPageSizeChange={(nextSize) => {
        setLoginPageSize(nextSize);
        setLoginPage(1);
      }}
      minWidth={900}
      headers={['时间', '事件类型', '登录/登出方式', '平台', '客户端', '浏览器', 'IP']}
      isEmpty={loginLogs.length === 0}
      colSpan={7}
      toolbar={(
        <TextField
          select
          size="small"
          label="事件类型"
          value={loginEventType}
          onChange={(event) => {
            setLoginEventType(event.target.value);
            setLoginPage(1);
          }}
          sx={{ minWidth: 140, '& .MuiInputBase-root': { height: 36 } }}
        >
          <MenuItem value="">全部</MenuItem>
          <MenuItem value="LOGIN">登录</MenuItem>
          <MenuItem value="LOGOUT">登出</MenuItem>
        </TextField>
      )}
    >
      {loginLogs.map((item) => (
        <TableRow key={item.id} hover>
          <TableCell sx={personalTableBodyCellSx}>{formatDateTime(item.occurredAt)}</TableCell>
          <TableCell sx={personalTableBodyCellSx}>
            <StatusBadge label={readDisplayValue(item.eventTypeLabel || item.actionLabel || item.eventType)} color={getLoginEventTone(item.eventType)} />
          </TableCell>
          <TableCell sx={personalTableBodyCellSx}>{readDisplayValue(item.authMethodLabel || item.authMethod)}</TableCell>
          <TableCell sx={personalTableBodyCellSx}>{readDisplayValue(item.platformLabel || item.platform)}</TableCell>
          <TableCell sx={personalTableBodyCellSx}>{readDisplayValue(item.clientTypeLabel || item.clientType)}</TableCell>
          <TableCell sx={personalTableBodyCellSx}>{readDisplayValue(item.browser)}</TableCell>
          <TableCell sx={personalTableBodyCellSx}>{readDisplayValue(item.ipAddress)}</TableCell>
        </TableRow>
      ))}
    </PersonalLogPanel>
  );

  return (
    <Box
      data-personal-settings-page
      sx={{
        height: 'calc(100vh - 142px)',
        minHeight: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden', bgcolor: COLORS.pageBg, p: 2 }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: '320px minmax(0, 1fr)' },
            gap: 2,
            height: '100%',
            minHeight: 0,
          }}
        >
          <Box data-profile-summary-card sx={{ bgcolor: '#fff', border: `1px solid ${COLORS.divider}`, borderRadius: 1, overflow: 'hidden', position: 'relative' }}>
            <Button
              variant="text"
              onClick={() => setPasswordDialogOpen(true)}
              sx={{
                position: 'absolute',
                top: 12,
                right: 14,
                minWidth: 0,
                height: 28,
                px: 0.5,
                color: COLORS.primary,
                fontSize: 14,
                zIndex: 1,
              }}
            >
              修改密码
            </Button>
            <Box sx={{ minHeight: 220, p: 2.5, pt: 3.5, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <Box sx={{ position: 'relative', mb: 1.5 }}>
                <Avatar
                  src={avatarUrl || undefined}
                  onClick={handleOpenAvatarEditor}
                  onKeyDown={handleAvatarKeyDown}
                  aria-label="打开头像裁剪"
                  role="button"
                  tabIndex={0}
                  sx={{
                    width: 92,
                    height: 92,
                    bgcolor: COLORS.primaryBlue,
                    color: '#fff',
                    fontSize: 34,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {!avatarUrl && initials(nameValue)}
                </Avatar>
                <IconButton
                  size="small"
                  aria-label="上传头像"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleOpenAvatarEditor();
                  }}
                  disabled={avatarMutation.isPending}
                  sx={{
                    position: 'absolute',
                    right: -2,
                    bottom: -2,
                    width: 30,
                    height: 30,
                    bgcolor: '#fff',
                    border: `1px solid ${COLORS.divider}`,
                    '&:hover': { bgcolor: COLORS.primaryLight },
                  }}
                >
                  <PhotoCameraOutlined sx={{ fontSize: 17, color: COLORS.primary }} />
                </IconButton>
                <Box
                  component="input"
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={handleAvatarFileChange}
                  sx={{ display: 'none' }}
                />
              </Box>
              <Typography sx={{ fontSize: 20, fontWeight: 700, color: COLORS.textPrimary, lineHeight: 1.2 }}>{nameValue}</Typography>
              <Typography aria-label="所属组织" sx={{ mt: 1.25, maxWidth: '100%', fontSize: 15, color: COLORS.textSecondary, lineHeight: 1.5, wordBreak: 'break-all' }}>{organizationValue}</Typography>
            </Box>
            <Divider />
            <Stack spacing={1.25} sx={{ p: 2.25 }}>
              <InfoRow icon={<PersonOutline />} label="姓名" value={nameValue} />
              <InfoRow icon={<KeyOutlined />} label="账号" value={currentUser.username || '-'} />
              <InfoRow icon={<VerifiedUserOutlined />} label="角色" value={(currentUser.roleNames ?? []).join('/') || '-'} />
              <InfoRow icon={<PhoneIphoneOutlined />} label="手机" value={state.phone || '-'} />
              <InfoRow icon={<EmailOutlined />} label="邮箱" value={state.email || '-'} />
            </Stack>
            <Divider />
            <Box sx={{ p: 2.25, minHeight: 124 }}>
              <Stack spacing={1.25}>
                <Stack direction="row" spacing={1.25} alignItems="center" justifyContent="space-between">
                  <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}>
                    <Box sx={{ width: 22, color: COLORS.textDisabled, display: 'flex', justifyContent: 'center', '& .MuiSvgIcon-root': { fontSize: 18 } }}>
                      <VerifiedUserOutlined sx={{ fontSize: 18 }} />
                    </Box>
                    <Typography sx={{ minWidth: 48, fontSize: 14, color: COLORS.textSecondary, lineHeight: 1.5 }}>电子签名</Typography>
                  </Stack>
                  <StatusBadge label={signatureStatusMeta.badgeLabel} color={signatureStatusMeta.color} />
                </Stack>
                <Box
                  sx={{
                    ml: '32px',
                    minHeight: 74,
                    border: '1px solid #c0c4cc',
                    borderStyle: 'dashed',
                    borderRadius: 1,
                    px: 1.5,
                    py: 1.25,
                    bgcolor: '#fafcff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 1,
                  }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: 14, color: COLORS.textPrimary, lineHeight: 1.5 }}>
                      {signatureStatusMeta.summary}
                    </Typography>
                    <Typography sx={{ mt: 0.5, fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.5 }}>
                      认证于 {certifiedAt}
                    </Typography>
                    <Typography sx={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.5 }}>
                      失效于 {expiresAt}
                    </Typography>
                  </Box>
                  <Button
                    variant="text"
                    onClick={handleOpenSignatureDialog}
                    sx={{ flex: '0 0 auto', minWidth: 0, height: 26, px: 0.75, py: 0, color: COLORS.primary, fontSize: 14 }}
                  >
                    {signatureActionLabel}
                  </Button>
                </Box>
                <Box
                  data-signature-authorization-notice
                  sx={{
                    ml: '32px',
                    minHeight: 44,
                    px: 1.25,
                    py: 1,
                    border: `1px solid ${COLORS.divider}`,
                    borderRadius: 1,
                    bgcolor: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 1,
                  }}
                >
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ flex: '0 0 auto', px: 0.75, borderRadius: 0.75, bgcolor: COLORS.primaryLight, color: COLORS.primary, fontSize: 11, lineHeight: '20px' }}>
                      PDF
                    </Typography>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ minWidth: 0, fontSize: 13, color: COLORS.textPrimary, lineHeight: 1.4, whiteSpace: 'normal', wordBreak: 'break-all' }}>
                        授权通知书.pdf
                      </Typography>
                      {!signatureAuthorizationNoticeFileId ? (
                        <Typography sx={{ mt: 0.25, fontSize: 12, color: COLORS.textDisabled, lineHeight: 1.4 }}>
                          认证后生成
                        </Typography>
                      ) : null}
                    </Box>
                  </Stack>
                  <Button
                    onClick={handlePreviewSignatureAuthorizationNotice}
                    disabled={!signatureAuthorizationNoticePreviewUrl || signatureNoticeAction !== null}
                    sx={{ flex: '0 0 auto', minWidth: 0, height: 28, px: 0.75, fontSize: 13 }}
                  >
                    {signatureNoticeAction === 'preview' ? '打开中' : '预览'}
                  </Button>
                </Box>
              </Stack>
            </Box>
          </Box>

          <Box sx={{ bgcolor: '#fff', border: `1px solid ${COLORS.divider}`, borderRadius: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <Tabs
              value={activeTab}
              onChange={(_: SyntheticEvent, value: number) => setActiveTab(value)}
              sx={{
                minHeight: 48,
                px: 2,
                borderBottom: `1px solid ${COLORS.divider}`,
                '& .MuiTab-root': {
                  minHeight: 48,
                  px: 0,
                  minWidth: 84,
                  mr: 4,
                  fontSize: 14,
                  textTransform: 'none',
                },
              }}
            >
              {SETTINGS_TABS.map((tab) => (
                <Tab key={tab} label={tab} />
              ))}
            </Tabs>

            <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden', p: 2.5, bgcolor: COLORS.pageBg, display: 'flex', flexDirection: 'column' }}>
              {activeTab === 0 ? (
                <Stack data-personal-settings-basic-panel spacing={2} sx={{ flex: 1, minHeight: 0, overflow: 'auto', pr: 0.5 }}>
                  <Box sx={{ bgcolor: '#fff', border: `1px solid ${COLORS.divider}`, borderRadius: 1, p: 2.5 }}>
                    <Stack spacing={2.25}>
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                        <Field
                          label="姓名"
                          value={state.displayName}
                          onChange={(value) => setState((current) => ({ ...current, displayName: value }))}
                        />
                        <Field
                          label="性别"
                          value={state.gender}
                          onChange={(value) => setState((current) => ({ ...current, gender: value }))}
                        />
                      </Stack>
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                        <Field
                          label="邮箱"
                          value={state.email}
                          error={emailError}
                          helperText={emailError ? '请输入正确的邮箱地址' : ''}
                          onChange={(value) => setState((current) => ({ ...current, email: value }))}
                        />
                        <Field
                          label="手机"
                          value={state.phone}
                          error={phoneError}
                          helperText={phoneError ? '请输入正确的手机' : ''}
                          onChange={(value) => setState((current) => ({ ...current, phone: value }))}
                        />
                      </Stack>
                      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <Button variant="contained" startIcon={<Save />} onClick={handleSave} disabled={profileMutation.isPending} sx={{ height: 40, minWidth: 104 }}>
                          保存
                        </Button>
                      </Box>
                    </Stack>
                  </Box>
                </Stack>
              ) : activeTab === 1 ? (
                renderAccountBindingPanel()
              ) : activeTab === 2 ? (
                renderAuditPanel()
              ) : (
                renderLoginPanel()
              )}
            </Box>
          </Box>
        </Box>
      </Box>

      <AppDialog
        data-avatar-crop-dialog
        open={avatarCropDialogOpen}
        onClose={() => setAvatarCropDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 1 } }}
      >
        <DialogTitle sx={{ px: 2.5, py: 1.75, fontSize: 16, fontWeight: 700 }}>头像裁剪</DialogTitle>
        <DialogContent sx={{ px: 2.5, pb: 1, overflowX: 'hidden' }}>
          <Stack spacing={2}>
            <Box
              data-avatar-crop-frame
              onMouseDown={handleCropMouseDown}
              sx={{
                width: AVATAR_CROP_SIZE,
                height: AVATAR_CROP_SIZE,
                mx: 'auto',
                position: 'relative',
                overflow: 'hidden',
                border: `1px solid ${COLORS.divider}`,
                borderRadius: 1,
                bgcolor: '#fff',
                cursor: cropImageSource ? 'grab' : 'default',
                userSelect: 'none',
              }}
            >
              {cropImageSource && !cropImageLoadFailed ? (
                <Box
                  component="img"
                  data-avatar-crop-image
                  src={cropImageSource}
                  alt="头像裁剪预览"
                  draggable={false}
                  onLoad={handleCropImageLoad}
                  onError={handleCropImageError}
                  sx={{
                    position: 'absolute',
                    left: `calc(50% + ${cropOffset.x}px)`,
                    top: `calc(50% + ${cropOffset.y}px)`,
                    width: cropDisplaySize.width,
                    height: cropDisplaySize.height,
                    display: 'block',
                    transform: 'translate(-50%, -50%)',
                    pointerEvents: 'none',
                    maxWidth: 'none',
                  }}
                />
              ) : (
                <Stack alignItems="center" justifyContent="center" spacing={1} sx={{ height: '100%', px: 2, color: COLORS.textDisabled, textAlign: 'center' }}>
                  <PhotoCameraOutlined />
                  <Typography sx={{ fontSize: 14 }}>
                    {cropImageLoadFailed ? '头像图片加载失败，请重新上传' : '请上传头像图片'}
                  </Typography>
                </Stack>
              )}
            </Box>
            <Stack data-avatar-scale-row direction="row" spacing={1.5} alignItems="center" sx={{ overflow: 'hidden' }}>
              <Typography sx={{ width: 36, fontSize: 13, color: COLORS.textSecondary }}>缩放</Typography>
              <Slider
                value={cropScale}
                min={0.5}
                max={3}
                step={0.01}
                disabled={!cropImageSource || cropImageLoadFailed}
                onChange={(_, value) => setCropScale(Array.isArray(value) ? value[0] : value)}
                sx={{ flex: 1, minWidth: 0, mx: 1.5 }}
              />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2, justifyContent: 'space-between' }}>
          <Button variant="outlined" onClick={handleAvatarUploadClick} sx={{ minWidth: 72, height: 32 }}>
            上传
          </Button>
          <Stack direction="row" spacing={1}>
            <Button onClick={() => setAvatarCropDialogOpen(false)} sx={{ minWidth: 72, height: 32 }}>
              取消
            </Button>
            <Button
              variant="contained"
              onClick={handleAvatarCropSave}
              disabled={!cropImageSource || cropImageLoadFailed || avatarMutation.isPending || cropSaving}
              sx={{ minWidth: 72, height: 32 }}
            >
              保存
            </Button>
          </Stack>
        </DialogActions>
      </AppDialog>

      <AppDialog
        hideCloseButton
        data-signature-authorization-preview-dialog
        open={Boolean(signatureNoticePreviewUrl)}
        onClose={handleCloseSignatureAuthorizationPreview}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 1, height: '82vh' } }}
      >
        <DialogTitle
          sx={{
            px: 2.5,
            py: 1.25,
            minHeight: 52,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
          }}
        >
          <Typography sx={{ fontSize: 16, fontWeight: 700, color: COLORS.textPrimary }}>
            授权通知书预览
          </Typography>
          <IconButton
            aria-label="关闭授权通知书预览"
            onClick={handleCloseSignatureAuthorizationPreview}
            size="small"
            sx={{ width: 30, height: 30, color: COLORS.textSecondary }}
          >
            <CloseOutlined fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 0, height: '100%', overflow: 'hidden', bgcolor: '#f5f7fa' }}>
          {signatureNoticePreviewUrl ? (
            <Box
              component="iframe"
              title="授权通知书 PDF 预览"
              src={signatureNoticePreviewUrl}
              sx={{ width: '100%', height: '100%', border: 0, display: 'block', bgcolor: '#fff' }}
            />
          ) : null}
        </DialogContent>
      </AppDialog>

      <AppDialog
        data-password-change-dialog
        open={passwordDialogOpen}
        onClose={handleClosePasswordDialog}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 1 } }}
      >
        <DialogTitle sx={{ px: 2.5, py: 1.75, fontSize: 16, fontWeight: 700 }}>修改密码</DialogTitle>
        <DialogContent sx={{ px: 2.5, pb: 1.5 }}>
          <Stack spacing={2}>
            {forcePasswordChangeRequired ? (
              <Alert severity="warning">
                当前安全策略要求先完成登录密码修改，完成后才能继续使用系统。
              </Alert>
            ) : null}
            <Field
              label="当前密码"
              type="password"
              value={passwordState.currentPassword}
              onChange={(value) => setPasswordState((current) => ({ ...current, currentPassword: value }))}
            />
            <Field
              label="新密码"
              type="password"
              value={passwordState.newPassword}
              onChange={(value) => setPasswordState((current) => ({ ...current, newPassword: value }))}
            />
            <Field
              label="确认密码"
              type="password"
              value={passwordState.confirmPassword}
              onChange={(value) => setPasswordState((current) => ({ ...current, confirmPassword: value }))}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2 }}>
          <Button onClick={handleClosePasswordDialog} disabled={passwordMutation.isPending || forcePasswordChangeRequired} sx={{ minWidth: 72, height: 32 }}>
            取消
          </Button>
          <Button
            variant="contained"
            startIcon={<KeyOutlined />}
            onClick={handlePasswordSubmit}
            disabled={passwordMutation.isPending}
            sx={{ minWidth: 96, height: 32 }}
          >
            修改密码
          </Button>
        </DialogActions>
      </AppDialog>

      <AppDialog
        data-signature-certification-dialog
        open={signatureDialogOpen}
        onClose={handleCloseSignatureDialog}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 1 } }}
      >
        <DialogTitle sx={{ px: 2.5, py: 1.75, fontSize: 16, fontWeight: 700 }}>电子签名认证</DialogTitle>
        <DialogContent sx={{ px: 2.5, pb: 1.5 }}>
          <Stack spacing={2}>
            {forceSignatureVerificationRequired ? (
              <Alert severity="warning">
                当前安全策略要求完成电子签名认证，完成后才能继续使用系统。
              </Alert>
            ) : null}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.3fr) minmax(260px, 0.7fr)' }, gap: 2 }}>
              <Box data-signature-pad sx={{ minWidth: 0 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                  <Typography sx={{ fontSize: 14, color: COLORS.textPrimary }}>手写签名板</Typography>
                  <Button variant="text" onClick={handleClearSignaturePad} sx={{ minWidth: 44, height: 28 }}>
                    清空
                  </Button>
                </Stack>
                <Box
                  sx={{
                    position: 'relative',
                    height: 180,
                    border: `1px dashed ${COLORS.divider}`,
                    borderRadius: 1,
                    bgcolor: '#fff',
                    overflow: 'hidden',
                  }}
                >
                  <Typography
                    data-signature-name-guide
                    aria-hidden="true"
                    sx={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#c6c8cc',
                      fontSize: { xs: 88, sm: 116, md: 136 },
                      fontWeight: 700,
                      letterSpacing: 0,
                      lineHeight: 1,
                      userSelect: 'none',
                      pointerEvents: 'none',
                      whiteSpace: 'nowrap',
                      opacity: 0.55,
                    }}
                  >
                    {signatureGuideText}
                  </Typography>
                  <Box
                    component="canvas"
                    data-signature-canvas
                    ref={signatureCanvasRef}
                    width={SIGNATURE_PAD_WIDTH}
                    height={SIGNATURE_PAD_HEIGHT}
                    onPointerDown={handleSignaturePointerDown}
                    onPointerMove={handleSignaturePointerMove}
                    onPointerUp={handleSignaturePointerEnd}
                    onPointerCancel={handleSignaturePointerEnd}
                    sx={{
                      position: 'relative',
                      zIndex: 1,
                      width: '100%',
                      height: '100%',
                      display: 'block',
                      touchAction: 'none',
                      cursor: 'crosshair',
                    }}
                  />
                </Box>
              </Box>
              <Stack spacing={2}>
                <EvidenceUploadBox
                  label="身份证正面"
                  file={signatureState.idCardFrontFile}
                  placeholder="请上传身份证正面"
                  onChange={(event) => handleSignatureEvidenceChange('front', event)}
                />
                <EvidenceUploadBox
                  label="身份证反面"
                  file={signatureState.idCardBackFile}
                  placeholder="请上传身份证反面"
                  onChange={(event) => handleSignatureEvidenceChange('back', event)}
                />
              </Stack>
            </Box>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ mb: 1, fontSize: 14, color: COLORS.textPrimary }}>电子签名密码</Typography>
                <TextField
                  value={signatureState.signaturePassword}
                  onChange={(event) => setSignatureState((current) => ({ ...current, signaturePassword: event.target.value }))}
                  type={signaturePasswordVisible ? 'text' : 'password'}
                  fullWidth
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          aria-label={signaturePasswordVisible ? '隐藏电子签名密码' : '显示电子签名密码'}
                          edge="end"
                          onClick={() => setSignaturePasswordVisible((visible) => !visible)}
                          onMouseDown={(event) => event.preventDefault()}
                          size="small"
                        >
                          {signaturePasswordVisible ? <VisibilityOffOutlined /> : <VisibilityOutlined />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                  sx={{ '& .MuiInputBase-root': { minHeight: 40 } }}
                />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ mb: 1, fontSize: 14, color: COLORS.textPrimary }}>当前系统登录密码</Typography>
                <TextField
                  value={signatureState.loginPassword}
                  onChange={(event) => setSignatureState((current) => ({ ...current, loginPassword: event.target.value }))}
                  type={loginPasswordVisible ? 'text' : 'password'}
                  fullWidth
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          aria-label={loginPasswordVisible ? '隐藏当前系统登录密码' : '显示当前系统登录密码'}
                          edge="end"
                          onClick={() => setLoginPasswordVisible((visible) => !visible)}
                          onMouseDown={(event) => event.preventDefault()}
                          size="small"
                        >
                          {loginPasswordVisible ? <VisibilityOffOutlined /> : <VisibilityOutlined />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                  sx={{ '& .MuiInputBase-root': { minHeight: 40 } }}
                />
              </Box>
            </Stack>

            <Stack spacing={1}>
              {signatureStatements.map((statement, index) => (
                <Box
                  key={statement.key}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSignatureConfirmationChange(statement.key, !signatureState.confirmations[statement.key])}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleSignatureConfirmationChange(statement.key, !signatureState.confirmations[statement.key]);
                    }
                  }}
                  sx={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 1,
                    p: 1.25,
                    border: `1px solid ${COLORS.divider}`,
                    borderRadius: 1,
                    bgcolor: signatureState.confirmations[statement.key] ? COLORS.primaryLight : '#fff',
                  }}
                >
                  <Checkbox
                    checked={signatureState.confirmations[statement.key]}
                    onChange={(event) => handleSignatureConfirmationChange(statement.key, event.target.checked)}
                    onClick={(event) => event.stopPropagation()}
                    sx={{ p: 0.25 }}
                  />
                  <Typography sx={{ fontSize: 14, color: COLORS.textPrimary, lineHeight: 1.7 }}>
                    {index + 1}、{statement.text}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2 }}>
          <Button onClick={handleCloseSignatureDialog} disabled={signatureMutation.isPending || forceSignatureVerificationRequired} sx={{ minWidth: 72, height: 32 }}>
            取消
          </Button>
          <Button
            variant="contained"
            startIcon={<KeyOutlined />}
            onClick={handleSignatureSubmit}
            disabled={!canSubmitSignature || signatureMutation.isPending}
            sx={{ minWidth: 96, height: 32 }}
          >
            {signatureMutation.isPending ? '认证中' : '认证'}
          </Button>
        </DialogActions>
      </AppDialog>

      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={handleSnackbarClose} anchorOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <Alert severity={snackbar.severity} onClose={handleSnackbarClose} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

function InfoRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <Stack direction="row" alignItems="center" spacing={1.25}>
      <Box sx={{ width: 22, color: COLORS.textDisabled, display: 'flex', justifyContent: 'center', '& .MuiSvgIcon-root': { fontSize: 18 } }}>{icon}</Box>
      <Typography sx={{ minWidth: 48, fontSize: 14, color: COLORS.textSecondary, lineHeight: 1.5 }}>{label}</Typography>
      <Typography sx={{ minWidth: 0, flex: 1, fontSize: 14, color: COLORS.textPrimary, lineHeight: 1.5, wordBreak: 'break-all' }}>{value}</Typography>
    </Stack>
  );
}

function EvidenceUploadBox({
  label,
  file,
  placeholder,
  onChange,
}: {
  label: string;
  file: File | null;
  placeholder: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <Box>
      <Typography sx={{ mb: 1, fontSize: 14, color: COLORS.textPrimary }}>{label}</Typography>
      <Button
        component="label"
        variant="outlined"
        startIcon={<FileUploadOutlined />}
        sx={{
          width: '100%',
          minHeight: 64,
          justifyContent: 'flex-start',
          borderStyle: 'dashed',
          color: file ? COLORS.textPrimary : COLORS.textSecondary,
          textAlign: 'left',
          '& .MuiButton-startIcon': { color: COLORS.primary },
        }}
      >
        <Typography component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14 }}>
          {file?.name || placeholder}
        </Typography>
        <Box component="input" hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={onChange} />
      </Button>
    </Box>
  );
}

function PersonalLogPanel({
  title,
  description,
  emptyText,
  loading,
  error,
  page,
  pageSize,
  totalPages,
  totalElements,
  onPageChange,
  onPageSizeChange,
  minWidth,
  headers,
  isEmpty,
  colSpan,
  toolbar,
  children,
  ...boxProps
}: {
  title: string;
  description: string;
  emptyText: string;
  loading: boolean;
  error: boolean;
  page: number;
  pageSize: number;
  totalPages: number;
  totalElements: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  minWidth: number;
  headers: string[];
  isEmpty: boolean;
  colSpan: number;
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  const showEmptyState = loading || error || isEmpty;
  return (
    <Box
      {...boxProps}
      sx={{
        flex: 1,
        minHeight: 0,
        bgcolor: '#fff',
        border: `1px solid ${COLORS.divider}`,
        borderRadius: 1,
        p: 2,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between" gap={1.5} sx={{ mb: 1.5 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 16, fontWeight: 700, color: COLORS.textPrimary }}>{title}</Typography>
          <Typography sx={{ mt: 0.5, fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.5 }}>{description}</Typography>
        </Box>
        {toolbar}
      </Stack>

      <TableContainer sx={{ flex: 1, minHeight: 0, overflow: 'auto', border: `1px solid ${COLORS.divider}`, borderRadius: 1 }}>
        <Table stickyHeader size="small" sx={{ tableLayout: 'fixed', width: '100%', minWidth, height: showEmptyState ? '100%' : 'auto' }}>
          <TableHead>
            <TableRow>
              {headers.map((header) => (
                <TableCell key={header} sx={personalTableHeaderCellSx}>{header}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody sx={{ height: showEmptyState ? '100%' : 'auto' }}>
            {loading ? (
              <TableRow sx={{ height: '100%' }}>
                <TableStateCell colSpan={colSpan} align="center" sx={personalEmptyTableCellSx}>
                  <CircularProgress size={24} />
                </TableStateCell>
              </TableRow>
            ) : error ? (
              <TableRow sx={{ height: '100%' }}>
                <TableStateCell colSpan={colSpan} align="center" sx={personalEmptyTableCellSx}>加载失败</TableStateCell>
              </TableRow>
            ) : isEmpty ? (
              <TableRow sx={{ height: '100%' }}>
                <TableStateCell colSpan={colSpan} align="center" sx={personalEmptyTableCellSx}>{emptyText}</TableStateCell>
              </TableRow>
            ) : (
              children
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between" gap={1.5} sx={{ pt: 1.5 }}>
        <Typography sx={{ fontSize: 13, color: COLORS.textSecondary }}>共 {totalElements} 条</Typography>
        <Stack direction="row" alignItems="center" justifyContent="flex-end" spacing={1.5}>
          <Pagination page={page} count={Math.max(totalPages, 1)} color="primary" size="small" onChange={(_, value) => onPageChange(value)} />
          <TextField
            select
            size="small"
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            sx={{ width: 108, '& .MuiInputBase-root': { height: 32 }, '& .MuiSelect-select': { py: 0 } }}
          >
            {PERSONAL_LOG_PAGE_SIZE_OPTIONS.map((option) => (
              <MenuItem key={option} value={option}>{option} 条/页</MenuItem>
            ))}
          </TextField>
        </Stack>
      </Stack>
    </Box>
  );
}

function PersonalAuditLogRow({
  record,
  expanded,
  onToggle,
}: {
  record: PersonalAuditRecord;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <TableRow data-personal-audit-change-row hover sx={{ '& .MuiTableCell-root': personalTableBodyCellSx }}>
        <TableCell>{record.operatorName}</TableCell>
        <TableCell>{record.operatorAccount}</TableCell>
        <TableCell>{formatDateTime(record.operatedAt)}</TableCell>
        <TableCell>
          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
            <StatusBadge label={record.actionLabel} color={getAuditActionTone(record.action)} />
            <IconButton
              size="small"
              aria-label={expanded ? '收起变更详情' : '展开变更详情'}
              onClick={onToggle}
              sx={{
                width: 28,
                height: 28,
                color: COLORS.textSecondary,
                transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 160ms ease',
              }}
            >
              <ExpandMore fontSize="small" />
            </IconButton>
          </Stack>
        </TableCell>
      </TableRow>
      {expanded ? (
        <TableRow data-personal-audit-change-panel>
          <TableCell colSpan={4} sx={{ p: 1.5, borderBottom: 'none', boxShadow: 'inset 0 -1px 0 #ebeef5', bgcolor: '#fff' }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5 }}>
              <PersonalAuditFieldBlock title="变更前" fields={record.beforeFields} />
              <PersonalAuditFieldBlock title="变更后" fields={record.afterFields} />
            </Box>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

function PersonalAuditFieldBlock({
  title,
  fields,
}: {
  title: string;
  fields: PersonalAuditFieldRow[];
}) {
  return (
    <Box
      sx={{
        minHeight: 176,
        p: 1.5,
        bgcolor: '#f5f7fa',
        border: '1px solid #dcdfe6',
        borderRadius: 1,
        overflow: 'hidden',
      }}
    >
      <Typography variant="body2" sx={{ color: COLORS.textSecondary, mb: 1 }}>
        {title}
      </Typography>
      <Stack spacing={0.5} sx={{ maxHeight: 240, overflow: 'auto', color: COLORS.textPrimary, lineHeight: 1.65, wordBreak: 'break-word' }}>
        {fields.length === 0 ? (
          <Typography variant="caption" sx={{ color: COLORS.textPrimary, lineHeight: 1.65 }}>
            -
          </Typography>
        ) : fields.map((field, index) => (
          <Box key={`${field.label}-${index}`} sx={{ display: 'flex', gap: 0.5, alignItems: 'baseline', minWidth: 0 }}>
            <Typography component="span" variant="caption" sx={{ flex: '0 0 auto', color: COLORS.textSecondary, lineHeight: 1.65 }}>
              {field.label}:
            </Typography>
            <Typography component="span" variant="caption" sx={{ minWidth: 0, color: COLORS.textPrimary, lineHeight: 1.65, wordBreak: 'break-word' }}>
              {field.value}
            </Typography>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  multiline = false,
  disabled = false,
  error = false,
  helperText = '',
  placeholder = '',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  multiline?: boolean;
  disabled?: boolean;
  error?: boolean;
  helperText?: string;
  placeholder?: string;
}) {
  return (
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography sx={{ mb: 1, fontSize: 14, color: COLORS.textPrimary }}>{label}</Typography>
      <TextField
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        placeholder={placeholder}
        fullWidth
        multiline={multiline}
        minRows={multiline ? 3 : undefined}
        disabled={disabled}
        error={error}
        helperText={helperText}
        InputLabelProps={type === 'date' ? { shrink: true } : undefined}
        sx={{
          '& .MuiInputBase-root': {
            minHeight: multiline ? 92 : 40,
            alignItems: multiline ? 'flex-start' : 'center',
          },
        }}
      />
    </Box>
  );
}
