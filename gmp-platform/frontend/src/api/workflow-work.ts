import client from "./client";

export type WorkflowId = string | number;

export type WorkFormProcessReferenceStatus = {
  nodeId: string;
  nodeLabel?: string;
  formProcessDefinitionId?: string | null;
  formProcessName?: string | null;
  formProcessVersionId?: string | null;
  formProcessVersionNumber?: number | null;
  formProcessVersionStatus?: string | null;
  formProcessVersionIsCurrent?: boolean | null;
  latestFormProcessVersionId?: string | null;
  latestFormProcessVersionNumber?: number | null;
  outdated?: boolean;
  upgradeAvailable?: boolean;
  upgradeBlockers?: string[];
};

export const listWorkTemplates = (params?: Record<string, unknown>) =>
  client.get("/workflow/work-templates", { params });
export const getWorkTemplate = (id: WorkflowId) =>
  client.get(`/workflow/work-templates/${id}`);
export const createWorkTemplate = (body: Record<string, unknown>) =>
  client.post("/workflow/work-templates", body);
export const updateWorkTemplate = (
  id: WorkflowId,
  body: Record<string, unknown>,
) => client.put(`/workflow/work-templates/${id}`, body);
export const deleteWorkTemplate = (id: WorkflowId) =>
  client.delete(`/workflow/work-templates/${id}`);
export const getWorkTemplateVersions = (id: WorkflowId) =>
  client.get(`/workflow/work-templates/${id}/versions`);
export const getWorkTemplateVersion = (id: WorkflowId, versionId: WorkflowId) =>
  client.get(`/workflow/work-templates/${id}/versions/${versionId}`);
export const createWorkTemplateVersion = (id: WorkflowId) =>
  client.post(`/workflow/work-templates/${id}/versions`);
export const deleteWorkTemplateVersion = (
  id: WorkflowId,
  versionId: WorkflowId,
) => client.delete(`/workflow/work-templates/${id}/versions/${versionId}`);
export const saveWorkTemplateVersionGraph = (
  id: WorkflowId,
  versionId: WorkflowId,
  body: { nodes: unknown[]; edges: unknown[] },
) =>
  client.put(
    `/workflow/work-templates/${id}/versions/${versionId}/graph`,
    body,
  );
export const publishWorkTemplateVersion = (
  id: WorkflowId,
  versionId: WorkflowId,
) =>
  client.post(`/workflow/work-templates/${id}/versions/${versionId}/publish`);
export const copyWorkTemplateVersionToDraft = (
  id: WorkflowId,
  sourceVersionId: WorkflowId,
  createIfMissing: boolean,
) =>
  client.post(
    `/workflow/work-templates/${id}/versions/${sourceVersionId}/copy-to-draft`,
    undefined,
    { params: { createIfMissing } },
  );
export const getWorkFormProcessReferences = (
  id: WorkflowId,
  versionId: WorkflowId,
) =>
  client.get(
    `/workflow/work-templates/${id}/versions/${versionId}/form-process-references`,
  );
export const getWorkApplicabilityRules = (id: WorkflowId) =>
  client.get(`/workflow/work-templates/${id}/applicability-rules`);
export const listWorkApplicabilityRules = () =>
  client.get("/workflow/work-templates/applicability-rules");
export const createWorkApplicabilityRule = (
  id: WorkflowId,
  body: Record<string, unknown>,
) => client.post(`/workflow/work-templates/${id}/applicability-rules`, body);
export const updateWorkApplicabilityRule = (
  id: WorkflowId,
  ruleId: WorkflowId,
  body: Record<string, unknown>,
) =>
  client.put(
    `/workflow/work-templates/${id}/applicability-rules/${ruleId}`,
    body,
  );
export const deleteWorkApplicabilityRule = (
  id: WorkflowId,
  ruleId: WorkflowId,
) =>
  client.delete(`/workflow/work-templates/${id}/applicability-rules/${ruleId}`);
