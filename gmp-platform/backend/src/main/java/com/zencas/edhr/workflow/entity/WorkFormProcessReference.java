package com.zencas.edhr.workflow.entity;

import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.LocalDateTime;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(
        name = "work_form_process_reference",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_work_form_process_reference_node",
                columnNames = {"work_version_id", "work_node_id"}))
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class WorkFormProcessReference {
    @Id
    @JsonSerialize(using = ToStringSerializer.class)
    private Long id;

    @Column(name = "work_definition_id", nullable = false)
    @JsonSerialize(using = ToStringSerializer.class)
    private Long workDefinitionId;

    @Column(name = "work_version_id", nullable = false)
    @JsonSerialize(using = ToStringSerializer.class)
    private Long workVersionId;

    @Column(name = "work_node_id", nullable = false, length = 128)
    private String workNodeId;

    @Column(name = "work_node_label", length = 256)
    private String workNodeLabel;

    @Column(name = "form_process_definition_id", nullable = false)
    @JsonSerialize(using = ToStringSerializer.class)
    private Long formProcessDefinitionId;

    @Column(name = "form_process_version_id", nullable = false)
    @JsonSerialize(using = ToStringSerializer.class)
    private Long formProcessVersionId;

    @Column(name = "form_template_version_id")
    @JsonSerialize(using = ToStringSerializer.class)
    private Long formTemplateVersionId;

    @Column(name = "form_template_name", length = 512)
    private String formTemplateName;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
