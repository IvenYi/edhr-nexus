import client from "./client";

export type FormProcessId = string | number;

export type FormProcessUsageItem = {
  referenceId: string;
  formProcessVersionId: string;
  formProcessVersionNumber?: number | null;
  formProcessVersionIsCurrent?: boolean | null;
  workDefinitionId: string;
  workDefinitionName?: string | null;
  workDefinitionCode?: string | null;
  workVersionId: string;
  workVersionNumber?: number | null;
  workVersionStatus?: string | null;
  workVersionIsCurrent?: boolean | null;
  workNodeId?: string | null;
  workNodeLabel?: string | null;
  formTemplateVersionId?: string | null;
  formTemplateName?: string | null;
  updatedAt?: string | null;
};

export const listFormProcesses = (params?: Record<string, unknown>) =>
  client.get("/workflow/form-processes", { params });
export const getFormProcess = (id: FormProcessId) =>
  client.get(`/workflow/form-processes/${id}`);
export const createFormProcess = (body: Record<string, unknown>) =>
  client.post("/workflow/form-processes", body);
export const updateFormProcess = (
  id: FormProcessId,
  body: Record<string, unknown>,
) => client.put(`/workflow/form-processes/${id}`, body);
export const deleteFormProcess = (id: FormProcessId) =>
  client.delete(`/workflow/form-processes/${id}`);
export const getFormProcessVersions = (id: FormProcessId) =>
  client.get(`/workflow/form-processes/${id}/versions`);
export const getFormProcessUsage = (id: FormProcessId) =>
  client.get(`/workflow/form-processes/${id}/usage`);
export const getFormProcessVersion = (
  id: FormProcessId,
  versionId: FormProcessId,
) => client.get(`/workflow/form-processes/${id}/versions/${versionId}`);
export const createFormProcessVersion = (id: FormProcessId) =>
  client.post(`/workflow/form-processes/${id}/versions`);
export const saveFormProcessGraph = (
  id: FormProcessId,
  versionId: FormProcessId,
  body: { nodes: unknown[]; edges: unknown[] },
) =>
  client.put(
    `/workflow/form-processes/${id}/versions/${versionId}/graph`,
    body,
  );
export const publishFormProcessVersion = (
  id: FormProcessId,
  versionId: FormProcessId,
) =>
  client.post(`/workflow/form-processes/${id}/versions/${versionId}/publish`);
