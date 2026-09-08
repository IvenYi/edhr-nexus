--liquibase formatted sql
--changeset edhr:0072-work-form-process-references

CREATE SEQUENCE IF NOT EXISTS work_form_process_reference_backfill_seq START 1;

CREATE TABLE IF NOT EXISTS work_form_process_reference (
    id BIGINT PRIMARY KEY,
    work_definition_id BIGINT NOT NULL,
    work_version_id BIGINT NOT NULL,
    work_node_id VARCHAR(128) NOT NULL,
    work_node_label VARCHAR(256),
    form_process_definition_id BIGINT NOT NULL,
    form_process_version_id BIGINT NOT NULL,
    form_template_version_id BIGINT,
    form_template_name VARCHAR(512),
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_work_form_process_reference_node
    ON work_form_process_reference (work_version_id, work_node_id);
CREATE INDEX IF NOT EXISTS idx_work_form_process_reference_process_version
    ON work_form_process_reference (form_process_version_id);
CREATE INDEX IF NOT EXISTS idx_work_form_process_reference_process_definition
    ON work_form_process_reference (form_process_definition_id);
CREATE INDEX IF NOT EXISTS idx_work_form_process_reference_work_version
    ON work_form_process_reference (work_version_id);

WITH form_nodes AS (
    SELECT
        work_version.definition_id AS work_definition_id,
        work_version.id AS work_version_id,
        node.value ->> 'id' AS work_node_id,
        node.value -> 'data' ->> 'label' AS work_node_label,
        process_version.definition_id AS form_process_definition_id,
        process_version.id AS form_process_version_id,
        CASE
            WHEN COALESCE(node.value -> 'data' -> 'config' ->> 'formTemplateVersionId', '') ~ '^[0-9]+$'
            THEN (node.value -> 'data' -> 'config' ->> 'formTemplateVersionId')::BIGINT
        END AS form_template_version_id,
        node.value -> 'data' -> 'config' ->> 'formTemplateName' AS form_template_name
    FROM workflow_definition_version work_version
    JOIN workflow_definition work_definition
        ON work_definition.id = work_version.definition_id
       AND work_definition.type = 'WORK'
    CROSS JOIN LATERAL jsonb_array_elements(work_version.nodes_json) AS node(value)
    JOIN workflow_definition_version process_version
        ON COALESCE(node.value -> 'data' -> 'config' ->> 'formProcessVersionId', '') ~ '^[0-9]+$'
       AND process_version.id = (node.value -> 'data' -> 'config' ->> 'formProcessVersionId')::BIGINT
    WHERE node.value -> 'data' ->> 'kind' = 'FORM'
      AND NULLIF(node.value -> 'data' -> 'config' ->> 'formProcessVersionId', '') IS NOT NULL
)
INSERT INTO work_form_process_reference (
    id,
    work_definition_id,
    work_version_id,
    work_node_id,
    work_node_label,
    form_process_definition_id,
    form_process_version_id,
    form_template_version_id,
    form_template_name,
    created_at,
    updated_at
)
SELECT
    -1 * nextval('work_form_process_reference_backfill_seq'),
    work_definition_id,
    work_version_id,
    work_node_id,
    work_node_label,
    form_process_definition_id,
    form_process_version_id,
    form_template_version_id,
    form_template_name,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM form_nodes
ON CONFLICT (work_version_id, work_node_id) DO NOTHING;
