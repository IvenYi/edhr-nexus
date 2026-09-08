package com.zencas.edhr.workflow.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zencas.edhr.common.util.SnowflakeIdGenerator;
import com.zencas.edhr.workflow.entity.WorkFormProcessReference;
import com.zencas.edhr.workflow.entity.WorkflowDefinitionVersion;
import com.zencas.edhr.workflow.repository.WorkFormProcessReferenceRepository;
import com.zencas.edhr.workflow.repository.WorkflowDefinitionVersionRepository;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class FormProcessReferenceService {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final WorkFormProcessReferenceRepository referenceRepository;
    private final WorkflowDefinitionVersionRepository versionRepository;
    private final SnowflakeIdGenerator idGenerator;

    @Transactional
    public void rebuildForWorkVersion(WorkflowDefinitionVersion workVersion) {
        referenceRepository.deleteByWorkVersionId(workVersion.getId());
        List<WorkFormProcessReference> references = new ArrayList<>();
        try {
            JsonNode nodes = MAPPER.readTree(workVersion.getNodesJson() == null ? "[]" : workVersion.getNodesJson());
            if (!nodes.isArray()) return;
            LocalDateTime now = LocalDateTime.now();
            for (JsonNode node : nodes) {
                if (!"FORM".equals(node.path("data").path("kind").asText(""))) continue;
                JsonNode config = node.path("data").path("config");
                String processVersionId = config.path("formProcessVersionId").asText("").trim();
                if (processVersionId.isBlank()) continue;
                Long processVersionIdValue = parseLong(processVersionId);
                if (processVersionIdValue == null) continue;
                WorkflowDefinitionVersion processVersion = versionRepository.findById(processVersionIdValue).orElse(null);
                if (processVersion == null || processVersion.getDefinitionId() == null) continue;
                String nodeId = node.path("id").asText("").trim();
                if (nodeId.isBlank()) continue;
                references.add(WorkFormProcessReference.builder()
                        .id(idGenerator.nextId())
                        .workDefinitionId(workVersion.getDefinitionId())
                        .workVersionId(workVersion.getId())
                        .workNodeId(nodeId)
                        .workNodeLabel(node.path("data").path("label").asText(""))
                        .formProcessDefinitionId(processVersion.getDefinitionId())
                        .formProcessVersionId(processVersion.getId())
                        .formTemplateVersionId(parseLong(config.path("formTemplateVersionId").asText("")))
                        .formTemplateName(config.path("formTemplateName").asText(""))
                        .createdAt(now)
                        .updatedAt(now)
                        .build());
            }
        } catch (Exception ignored) {
            // Draft graphs are allowed to be temporarily incomplete. Publish
            // validation remains responsible for rejecting invalid references.
            return;
        }
        referenceRepository.saveAll(references);
    }

    @Transactional
    public void deleteForWorkVersion(Long workVersionId) {
        referenceRepository.deleteByWorkVersionId(workVersionId);
    }

    @Transactional(readOnly = true)
    public List<WorkFormProcessReference> listUsage(Long formProcessDefinitionId) {
        return referenceRepository.findByFormProcessDefinitionIdOrderByUpdatedAtDesc(formProcessDefinitionId);
    }

    private Long parseLong(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            return Long.valueOf(value.trim());
        } catch (NumberFormatException exception) {
            return null;
        }
    }
}
