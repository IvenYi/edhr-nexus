import client from './client';
import type { PageResult } from '@/types/common';
import type { SidebarModule } from '@/utils/constants';

export interface MenuConfiguration {
  modules: SidebarModule[];
  configured: boolean;
}

export const getManagedSidebarModules = async (): Promise<MenuConfiguration> => {
  const response = await client.get('/system/menu-configuration');
  return unwrap<MenuConfiguration>(response);
};

export const updateManagedSidebarModules = async (modules: SidebarModule[]): Promise<MenuConfiguration> => {
  const response = await client.put('/system/menu-configuration', { modules });
  return unwrap<MenuConfiguration>(response);
};

export interface IconGroup {
  id: string | number;
  name: string;
  sortOrder?: number;
  builtin?: boolean;
  iconCount?: number;
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
}

export interface IconAsset {
  id: string | number;
  groupId?: string | number | null;
  fileId?: string | number | null;
  name: string;
  tags?: string[] | string;
  source?: string;
  builtinKey?: string | null;
  sortOrder?: number;
  previewUrl?: string;
  fileUrl?: string;
  uploadedBy?: string;
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
}

export interface IconQuery {
  groupId?: string | number | 'ALL';
  keyword?: string;
  page?: number;
  size?: number;
}

export interface SystemSettings {
  systemName: string;
  browserTitle: string;
  logoFileId?: string | number | null;
  logoUrl?: string;
  logoWidth?: number;
  logoHeight?: number;
  loginSubtitle?: string;
  loginDescription?: string;
  loginComplianceItems?: string;
  faviconFileId?: string | number | null;
  faviconUrl?: string;
  forcePasswordChangeOnFirstLogin?: boolean;
  passwordChangeCycleEnabled?: boolean;
  passwordChangeCycleDays?: number;
  passwordComplexity?: 'LOW' | 'MEDIUM' | 'HIGH' | string;
  passwordFailureLockThreshold?: number;
  passwordFailureLockMinutes?: number;
  idleLogoutMinutes?: number;
  tokenValidityMinutes?: number;
  forceSignatureOnFirstLogin?: boolean;
  signatureChangeCycleEnabled?: boolean;
  signatureChangeCycleDays?: number;
  emailEnabled?: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpSslEnabled?: boolean;
  smtpUsername?: string;
  smtpPasswordConfigured?: boolean;
  mailFromName?: string;
}

export interface SystemSettingsUpdate {
  systemName: string;
  browserTitle: string;
  logoWidth: number;
  logoHeight: number;
  loginSubtitle: string;
  loginDescription: string;
  loginComplianceItems: string;
  forcePasswordChangeOnFirstLogin: boolean;
  passwordChangeCycleEnabled: boolean;
  passwordChangeCycleDays: number;
  passwordComplexity: string;
  passwordFailureLockThreshold: number;
  passwordFailureLockMinutes: number;
  idleLogoutMinutes: number;
  tokenValidityMinutes: number;
  forceSignatureOnFirstLogin: boolean;
  signatureChangeCycleEnabled: boolean;
  signatureChangeCycleDays: number;
  emailEnabled: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSslEnabled: boolean;
  smtpUsername: string;
  smtpPassword: string;
  mailFromName: string;
}

export interface MailTestRecipient {
  id: string;
  username: string;
  displayName?: string;
  email: string;
}

export interface TestMailResponse {
  recipientUserId: string;
  username: string;
  recipientEmail: string;
  sentAt: string;
}

export interface BusinessDictionaryRecord {
  id: string | number;
  tenantId?: string;
  code: string;
  name: string;
  description?: string;
  status: string;
  sortOrder?: number;
  builtin?: boolean;
  itemCount?: number;
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
}

export interface BusinessDictionaryItemRecord {
  id: string | number;
  dictionaryId: string | number;
  dictionaryCode: string;
  dictionaryName: string;
  value: string;
  label: string;
  sortOrder?: number;
  status: string;
  remark?: string;
  builtin?: boolean;
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
}

function unwrap<T>(response: { data: { data: T } }): T {
  return response.data.data;
}

export const getBusinessDictionaries = async (params: Record<string, unknown> = {}): Promise<PageResult<BusinessDictionaryRecord>> => {
  const response = await client.get('/system/business-dictionaries', { params });
  return unwrap<PageResult<BusinessDictionaryRecord>>(response);
};

export const createBusinessDictionary = async (payload: Record<string, unknown>): Promise<BusinessDictionaryRecord> => {
  const response = await client.post('/system/business-dictionaries', payload);
  return unwrap<BusinessDictionaryRecord>(response);
};

export const updateBusinessDictionary = async (id: string | number, payload: Record<string, unknown>): Promise<BusinessDictionaryRecord> => {
  const response = await client.put(`/system/business-dictionaries/${id}`, payload);
  return unwrap<BusinessDictionaryRecord>(response);
};

export const deleteBusinessDictionary = async (id: string | number, options?: { cascade?: boolean }): Promise<void> => {
  await client.delete(`/system/business-dictionaries/${id}`, { params: { cascade: options?.cascade ?? false } });
};

export const getBusinessDictionaryItems = async (dictionaryId: string | number, params: Record<string, unknown> = {}): Promise<PageResult<BusinessDictionaryItemRecord>> => {
  const response = await client.get(`/system/business-dictionaries/${dictionaryId}/items`, { params });
  return unwrap<PageResult<BusinessDictionaryItemRecord>>(response);
};

export const createBusinessDictionaryItem = async (dictionaryId: string | number, payload: Record<string, unknown>): Promise<BusinessDictionaryItemRecord> => {
  const response = await client.post(`/system/business-dictionaries/${dictionaryId}/items`, payload);
  return unwrap<BusinessDictionaryItemRecord>(response);
};

export const updateBusinessDictionaryItem = async (id: string | number, payload: Record<string, unknown>): Promise<BusinessDictionaryItemRecord> => {
  const response = await client.put(`/system/business-dictionary-items/${id}`, payload);
  return unwrap<BusinessDictionaryItemRecord>(response);
};

export const deleteBusinessDictionaryItem = async (id: string | number): Promise<void> => {
  await client.delete(`/system/business-dictionary-items/${id}`);
};

export const reorderBusinessDictionaryItems = async (payload: { dictionaryId: string | number; ids: Array<string | number> }): Promise<BusinessDictionaryItemRecord[]> => {
  const response = await client.put('/system/business-dictionary-items/order', payload);
  return unwrap<BusinessDictionaryItemRecord[]>(response);
};

export const getBusinessDictionaryOptions = async (code: string): Promise<Array<{ dictionaryCode: string; value: string; label: string; sortOrder?: number; remark?: string }>> => {
  const response = await client.get(`/system/business-dictionaries/${code}/options`);
  return unwrap<Array<{ dictionaryCode: string; value: string; label: string; sortOrder?: number; remark?: string }>>(response);
};

export const getIconGroups = async (): Promise<IconGroup[]> => {
  const response = await client.get('/system/icon-groups');
  return unwrap<IconGroup[]>(response);
};

export const createIconGroup = async (payload: { name: string }): Promise<IconGroup> => {
  const response = await client.post('/system/icon-groups', payload);
  return unwrap<IconGroup>(response);
};

export const updateIconGroup = async (id: string | number, payload: { name: string }): Promise<IconGroup> => {
  const response = await client.put(`/system/icon-groups/${id}`, payload);
  return unwrap<IconGroup>(response);
};

export const deleteIconGroup = async (id: string | number, options?: { cascade?: boolean }): Promise<void> => {
  await client.delete(`/system/icon-groups/${id}`, { params: { cascade: options?.cascade ?? false } });
};

export const reorderIconGroups = async (groupIds: Array<string | number>): Promise<void> => {
  await client.put('/system/icon-groups/order', { ids: groupIds });
};

export const getIcons = async (params: IconQuery = {}): Promise<IconAsset[]> => {
  const page = await getIconPage(params);
  return page.content;
};

export const getIconPage = async (params: IconQuery = {}): Promise<PageResult<IconAsset>> => {
  const query = {
    ...params,
    page: params.page ?? 1,
    size: params.size ?? 20,
    groupId: params.groupId === 'ALL' ? undefined : params.groupId,
  };
  const response = await client.get('/system/icons', { params: query });
  return unwrap<PageResult<IconAsset>>(response);
};

export const uploadIcon = async (payload: { file: File; groupId?: string | number | null; name?: string; tags?: string[] }): Promise<IconAsset> => {
  const formData = new FormData();
  formData.append('file', payload.file);
  if (payload.groupId) formData.append('groupId', String(payload.groupId));
  if (payload.name) formData.append('name', payload.name);
  if (payload.tags?.length) formData.append('tags', payload.tags.join(','));
  const response = await client.post('/system/icons/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return unwrap<IconAsset>(response);
};

export const importIcons = async (payload: { files: File[]; groupId?: string | number | null }): Promise<IconAsset[]> => {
  const formData = new FormData();
  payload.files.forEach((file) => formData.append('files', file));
  if (payload.groupId) formData.append('groupId', String(payload.groupId));
  const response = await client.post('/system/icons/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return unwrap<IconAsset[]>(response);
};

export const updateIcon = async (id: string | number, payload: Partial<Pick<IconAsset, 'name' | 'tags' | 'groupId' | 'sortOrder'>>): Promise<IconAsset> => {
  const response = await client.put(`/system/icons/${id}`, payload);
  return unwrap<IconAsset>(response);
};

export const deleteIcon = async (id: string | number): Promise<void> => {
  await client.delete(`/system/icons/${id}`);
};

export const batchDeleteIcons = async (iconIds: Array<string | number>): Promise<void> => {
  await client.post('/system/icons/batch-delete', { ids: iconIds });
};

export const reorderIcons = async (payload: { groupId?: string | number | null; iconIds: Array<string | number> }): Promise<void> => {
  await client.put('/system/icons/order', { groupId: payload.groupId, ids: payload.iconIds });
};

export const getPublicSystemSettings = async (): Promise<SystemSettings> => {
  const response = await client.get('/system/settings/public', { skipAuthRedirect: true });
  return unwrap<SystemSettings>(response);
};

export const getSystemSettings = async (): Promise<SystemSettings> => {
  const response = await client.get('/system/settings');
  return unwrap<SystemSettings>(response);
};

export const updateSystemSettings = async (payload: SystemSettingsUpdate): Promise<SystemSettings> => {
  const response = await client.put('/system/settings', payload);
  return unwrap<SystemSettings>(response);
};

export const getMailTestRecipients = async (): Promise<MailTestRecipient[]> => {
  const response = await client.get('/system/settings/mail/test-recipients');
  return unwrap<MailTestRecipient[]>(response);
};

export const sendTestMail = async (userId: string | number): Promise<TestMailResponse> => {
  const response = await client.post('/system/settings/mail/test', { userId: Number(userId) }, { timeout: 60000 });
  return unwrap<TestMailResponse>(response);
};

export const uploadSystemLogo = async (file: File): Promise<SystemSettings> => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await client.post('/system/settings/logo', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return unwrap<SystemSettings>(response);
};

export const uploadSystemFavicon = async (file: File): Promise<SystemSettings> => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await client.post('/system/settings/favicon', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return unwrap<SystemSettings>(response);
};

export const deleteSystemLogo = async (): Promise<SystemSettings> => {
  const response = await client.delete('/system/settings/logo');
  return unwrap<SystemSettings>(response);
};

export const deleteSystemFavicon = async (): Promise<SystemSettings> => {
  const response = await client.delete('/system/settings/favicon');
  return unwrap<SystemSettings>(response);
};
