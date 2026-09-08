export type FieldPermission = "EDIT" | "READ_ONLY";

export type FormFieldPermissionState = {
  fieldId: string;
  permission: FieldPermission;
};

export type SubjectFieldPermissionRule = {
  defaultPermission?: FieldPermission;
  editableFieldIds?: string[];
  readOnlyFieldIds?: string[];
};

export type FieldPermissionResolution = {
  states: FormFieldPermissionState[];
  unknownFieldIds: string[];
};

/** Resolve one subject's effective permission without mutating configuration. */
export function resolveFieldPermissions(
  fields: Array<{ id: string }>,
  rule?: SubjectFieldPermissionRule,
): FieldPermissionResolution {
  const fieldIds = fields
    .map((field) => String(field.id).trim())
    .filter(Boolean);
  const knownIds = new Set(fieldIds);
  const defaultPermission: FieldPermission =
    rule?.defaultPermission === "READ_ONLY" ? "READ_ONLY" : "EDIT";
  const exceptionIds = new Set(
    (defaultPermission === "EDIT"
      ? rule?.readOnlyFieldIds
      : rule?.editableFieldIds
    )
      ?.map((id) => String(id).trim())
      .filter(Boolean) ?? [],
  );
  const configuredIds = [
    ...(rule?.editableFieldIds ?? []),
    ...(rule?.readOnlyFieldIds ?? []),
  ]
    .map((id) => String(id).trim())
    .filter(Boolean);

  return {
    states: fieldIds.map((fieldId) => ({
      fieldId,
      permission: exceptionIds.has(fieldId)
        ? defaultPermission === "EDIT"
          ? "READ_ONLY"
          : "EDIT"
        : defaultPermission,
    })),
    unknownFieldIds: [...new Set(configuredIds.filter((id) => !knownIds.has(id)))],
  };
}

/** Convenience shape for renderers and transport DTO builders. */
export function toFieldPermissionMap(
  resolution: FieldPermissionResolution,
): Record<string, FieldPermission> {
  return Object.fromEntries(
    resolution.states.map(({ fieldId, permission }) => [fieldId, permission]),
  );
}
