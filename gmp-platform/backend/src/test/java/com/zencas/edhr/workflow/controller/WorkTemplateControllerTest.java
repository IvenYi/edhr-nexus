package com.zencas.edhr.workflow.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.zencas.edhr.compliance.entity.AuditEvent;
import com.zencas.edhr.compliance.repository.AuditEventRepository;
import com.zencas.edhr.template.entity.FormTemplateVersion;
import com.zencas.edhr.template.repository.FormTemplateVersionRepository;
import com.zencas.edhr.workflow.entity.WorkflowDefinition;
import com.zencas.edhr.workflow.entity.WorkflowDefinitionVersion;
import com.zencas.edhr.workflow.entity.WorkflowBindingRule;
import com.zencas.edhr.workflow.repository.WorkflowBindingRuleRepository;
import com.zencas.edhr.workflow.repository.WorkflowDefinitionRepository;
import com.zencas.edhr.workflow.repository.WorkflowDefinitionVersionRepository;
import com.zencas.edhr.workflow.service.FormProcessReferenceService;
import com.zencas.edhr.common.util.SnowflakeIdGenerator;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.transaction.annotation.Transactional;
import org.mockito.InjectMocks;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.lenient;

@ExtendWith(MockitoExtension.class)
class WorkTemplateControllerTest {

    private static final long SNOWFLAKE_ID = 365398785847742464L;
    private final ObjectMapper jsonObjectMapper = new ObjectMapper();

    @Mock private WorkflowDefinitionRepository workflowDefinitionRepository;
    @Mock private WorkflowDefinitionVersionRepository versionRepository;
    @Mock private WorkflowBindingRuleRepository bindingRuleRepository;
    @Mock private AuditEventRepository auditEventRepository;
    @Mock private FormTemplateVersionRepository formTemplateVersionRepository;
    @Mock private FormProcessReferenceService formProcessReferenceService;
    @Mock private SnowflakeIdGenerator idGenerator;
    @Mock private ObjectMapper objectMapper;
    @InjectMocks private WorkTemplateController controller;

    @BeforeEach
    void stubsAnEffectiveFormVersionForPublishableFlowFixtures() {
        lenient().when(formTemplateVersionRepository.findById(702L)).thenReturn(Optional.of(
                FormTemplateVersion.builder().id(702L).status("DRAFT").build()));
        lenient().when(versionRepository.findById(901L)).thenReturn(Optional.of(
                WorkflowDefinitionVersion.builder().id(901L).definitionId(902L).status("PUBLISHED").isCurrent(true)
                        .nodesJson("[{\"data\":{\"kind\":\"START\"}},{\"data\":{\"kind\":\"END\"}}]").build()));
        lenient().when(workflowDefinitionRepository.findById(902L)).thenReturn(Optional.of(
                WorkflowDefinition.builder().id(902L).type("FORM_PROCESS").name("表单流程").build()));
    }

    @Test
    void listsOnlyProductionWorkDefinitions() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("清场作业").type("WORK").build();
        when(workflowDefinitionRepository.findWorkTemplates(org.mockito.ArgumentMatchers.eq("WORK"), org.mockito.ArgumentMatchers.eq(""), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(work)));

        var response = controller.list(1, 20, null, "createdAt", "desc");

        assertThat(response.getData().getContent()).singleElement().satisfies(summary -> {
            assertThat(summary.id()).isEqualTo(work.getId());
            assertThat(summary.name()).isEqualTo("清场作业");
            assertThat(summary.currentFlowVersionNumber()).isNull();
        });
        verify(workflowDefinitionRepository).findWorkTemplates(org.mockito.ArgumentMatchers.eq("WORK"), org.mockito.ArgumentMatchers.eq(""), any(Pageable.class));
    }

    @Test
    void exposesCurrentPublishedFlowInWorkTemplateSummary() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("清场作业").code("WORK-001").type("WORK").build();
        WorkflowDefinitionVersion current = WorkflowDefinitionVersion.builder().id(201L).definitionId(101L).versionNumber(3).isCurrent(true).status("PUBLISHED").build();
        when(workflowDefinitionRepository.findWorkTemplates(org.mockito.ArgumentMatchers.eq("WORK"), org.mockito.ArgumentMatchers.eq(""), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(work)));
        when(versionRepository.findByDefinitionIdAndIsCurrentTrue(101L)).thenReturn(Optional.of(current));

        var response = controller.list(1, 20, null, "createdAt", "desc");

        assertThat(response.getData().getContent()).singleElement().satisfies(summary ->
                assertThat(summary.currentFlowVersionNumber()).isEqualTo(3));
    }

    @Test
    void serializesWorkIdsAsStringsToPreserveSnowflakePrecisionInBrowsers() {
        WorkflowDefinition definition = WorkflowDefinition.builder().id(SNOWFLAKE_ID).name("清场作业").type("WORK").build();
        WorkflowDefinitionVersion version = WorkflowDefinitionVersion.builder().id(SNOWFLAKE_ID + 1).definitionId(SNOWFLAKE_ID).build();
        WorkflowBindingRule rule = WorkflowBindingRule.builder().id(SNOWFLAKE_ID + 2).definitionId(SNOWFLAKE_ID)
                .versionId(SNOWFLAKE_ID + 1).productFamilyId(SNOWFLAKE_ID + 3).productId(SNOWFLAKE_ID + 4)
                .operationId(SNOWFLAKE_ID + 5).build();
        WorkTemplateController.WorkTemplateSummary summary = new WorkTemplateController.WorkTemplateSummary(
                SNOWFLAKE_ID, "清场作业", "WORK-001", "ACTIVE", null, null, null);
        WorkTemplateController.WorkApplicabilityRuleSummary ruleSummary = new WorkTemplateController.WorkApplicabilityRuleSummary(
                SNOWFLAKE_ID + 2, SNOWFLAKE_ID, "清场作业", "WORK-001", "SCOPED", SNOWFLAKE_ID + 3,
                SNOWFLAKE_ID + 4, SNOWFLAKE_ID + 5, 20, null, null);

        JsonNode definitionJson = jsonObjectMapper.valueToTree(definition);
        JsonNode versionJson = jsonObjectMapper.valueToTree(version);
        JsonNode ruleJson = jsonObjectMapper.valueToTree(rule);
        JsonNode summaryJson = jsonObjectMapper.valueToTree(summary);
        JsonNode ruleSummaryJson = jsonObjectMapper.valueToTree(ruleSummary);

        assertThat(definitionJson.get("id").isTextual()).isTrue();
        assertThat(versionJson.get("id").isTextual()).isTrue();
        assertThat(versionJson.get("definitionId").isTextual()).isTrue();
        assertThat(ruleJson.get("id").isTextual()).isTrue();
        assertThat(ruleJson.get("definitionId").isTextual()).isTrue();
        assertThat(ruleJson.get("versionId").isTextual()).isTrue();
        assertThat(ruleJson.get("productFamilyId").isTextual()).isTrue();
        assertThat(ruleJson.get("productId").isTextual()).isTrue();
        assertThat(ruleJson.get("operationId").isTextual()).isTrue();
        assertThat(summaryJson.get("id").isTextual()).isTrue();
        assertThat(ruleSummaryJson.get("id").isTextual()).isTrue();
        assertThat(ruleSummaryJson.get("definitionId").isTextual()).isTrue();
        assertThat(ruleSummaryJson.get("productFamilyId").isTextual()).isTrue();
        assertThat(ruleSummaryJson.get("productId").isTextual()).isTrue();
        assertThat(ruleSummaryJson.get("operationId").isTextual()).isTrue();
        assertThat(summaryJson.get("id").asText()).isEqualTo(String.valueOf(SNOWFLAKE_ID));
    }

    @Test
    void forwardsTrimmedKeywordToWorkTemplateQuery() {
        when(workflowDefinitionRepository.findWorkTemplates(org.mockito.ArgumentMatchers.eq("WORK"), org.mockito.ArgumentMatchers.eq("清场"), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of()));

        controller.list(2, 20, " 清场 ", "createdAt", "desc");

        verify(workflowDefinitionRepository).findWorkTemplates(org.mockito.ArgumentMatchers.eq("WORK"), org.mockito.ArgumentMatchers.eq("清场"), any(Pageable.class));
    }

    @Test
    void listsOnlyRulesAttachedToProductionWorkDefinitions() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("清场作业").code("WORK-001").type("WORK").build();
        WorkflowBindingRule rule = WorkflowBindingRule.builder().id(301L).definitionId(101L).businessType("WORK").ruleType("GLOBAL").priority(0).build();
        when(workflowDefinitionRepository.findByType("WORK")).thenReturn(List.of(work));
        when(bindingRuleRepository.findByBusinessTypeOrderByPriorityDescCreatedAtDesc("WORK")).thenReturn(List.of(rule));

        var response = controller.listAllRules();

        assertThat(response.getData()).singleElement().satisfies(summary -> {
            assertThat(summary.definitionId()).isEqualTo(101L);
            assertThat(summary.definitionName()).isEqualTo("清场作业");
            assertThat(summary.definitionCode()).isEqualTo("WORK-001");
        });
    }

    @Test
    void derivesPriorityFromRuleTypeWhenCreatingRule() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("清场作业").type("WORK").build();
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(versionRepository.findByDefinitionIdAndIsCurrentTrue(101L)).thenReturn(Optional.of(
                WorkflowDefinitionVersion.builder().id(201L).definitionId(101L).status("PUBLISHED").isCurrent(true).build()));
        when(idGenerator.nextId()).thenReturn(401L);
        when(bindingRuleRepository.save(any(WorkflowBindingRule.class))).thenAnswer(invocation -> invocation.getArgument(0));

        WorkflowBindingRule request = WorkflowBindingRule.builder().ruleType("EXCEPTION").priority(999).productId(501L).isActive(false).build();
        var response = controller.createRule(101L, request);

        assertThat(response.getData().getPriority()).isEqualTo(30);
        assertThat(response.getData().getDefinitionId()).isEqualTo(101L);
        assertThat(response.getData().getIsActive()).isTrue();
        verify(bindingRuleRepository).save(request);
    }

    @Test
    void assignsGlobalRuleItsFixedPriority() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("清场作业").type("WORK").build();
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(versionRepository.findByDefinitionIdAndIsCurrentTrue(101L)).thenReturn(Optional.of(
                WorkflowDefinitionVersion.builder().id(201L).definitionId(101L).status("PUBLISHED").isCurrent(true).build()));
        when(idGenerator.nextId()).thenReturn(402L);
        when(bindingRuleRepository.save(any(WorkflowBindingRule.class))).thenAnswer(invocation -> invocation.getArgument(0));

        WorkflowBindingRule request = WorkflowBindingRule.builder().ruleType("GLOBAL").priority(-1).build();
        var response = controller.createRule(101L, request);

        assertThat(response.getData().getPriority()).isEqualTo(10);
    }

    @Test
    void rejectsScopeFieldsOnGlobalRule() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("清场作业").type("WORK").build();
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(versionRepository.findByDefinitionIdAndIsCurrentTrue(101L)).thenReturn(Optional.of(
                WorkflowDefinitionVersion.builder().id(201L).definitionId(101L).status("PUBLISHED").isCurrent(true).build()));

        WorkflowBindingRule request = WorkflowBindingRule.builder().ruleType("GLOBAL").productId(501L).build();

        assertThatThrownBy(() -> controller.createRule(101L, request))
                .hasMessageContaining("全局适用规则不能配置范围");
    }

    @Test
    void ignoresClientIdWhenCreatingWorkTemplate() {
        when(idGenerator.nextId()).thenReturn(701L, 702L, 703L, 704L);
        when(workflowDefinitionRepository.save(any(WorkflowDefinition.class))).thenAnswer(invocation -> invocation.getArgument(0));

        WorkflowDefinition request = WorkflowDefinition.builder().id(999L).name("上料作业").code("WORK-002").build();
        var response = controller.create(request);

        assertThat(response.getData().getId()).isEqualTo(701L);
        assertThat(response.getData().getType()).isEqualTo("WORK");
    }

    @Test
    void doesNotPersistAFlowDraftWhenCreatingWorkTemplate() {
        when(idGenerator.nextId()).thenReturn(701L, 702L, 703L, 704L);
        when(workflowDefinitionRepository.save(any(WorkflowDefinition.class))).thenAnswer(invocation -> invocation.getArgument(0));

        controller.create(WorkflowDefinition.builder().name("上料作业").code("WORK-002").build());

        verify(versionRepository, times(0)).save(any(WorkflowDefinitionVersion.class));
        verify(auditEventRepository, times(1)).save(any(AuditEvent.class));
    }

    @Test
    void returnsNoPersistedVersionsWhenAWorkTemplateHasNoVersions() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("历史清场作业").type("WORK").build();
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(versionRepository.findByDefinitionIdOrderByVersionNumberDesc(101L)).thenReturn(List.of());
        var response = controller.listVersions(101L);

        assertThat(response.getData()).isEmpty();
        verify(versionRepository, times(0)).save(any(WorkflowDefinitionVersion.class));
        verify(auditEventRepository, times(0)).save(argThat(event -> "PRODUCTION_WORK_FLOW_VERSION".equals(event.getEntityType())));
    }

    @Test
    void rejectsCreatingAnotherDraftWhileOneIsAlreadyEditable() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("清场作业").type("WORK").build();
        WorkflowDefinitionVersion draft = WorkflowDefinitionVersion.builder().id(201L).definitionId(101L).versionNumber(2).status("DRAFT").build();
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(versionRepository.findByDefinitionIdAndStatus(101L, "DRAFT")).thenReturn(Optional.of(draft));

        assertThatThrownBy(() -> controller.createDraftVersion(101L))
                .hasMessageContaining("当前已有编辑中的草稿流程");
        verify(versionRepository, times(0)).save(any(WorkflowDefinitionVersion.class));
    }

    @Test
    void createsAnEmptyDraftWithoutAnInitialConnection() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("清场作业").type("WORK").build();
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(versionRepository.findByDefinitionIdAndStatus(101L, "DRAFT")).thenReturn(Optional.empty());
        when(versionRepository.findByDefinitionIdOrderByVersionNumberDesc(101L)).thenReturn(List.of());
        when(idGenerator.nextId()).thenReturn(201L);
        when(versionRepository.save(any(WorkflowDefinitionVersion.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var response = controller.createDraftVersion(101L);

        assertThat(response.getData().getVersionNumber()).isEqualTo(1);
        assertThat(response.getData().getNodesJson()).contains("\"kind\":\"START\"").contains("\"kind\":\"END\"");
        assertThat(response.getData().getEdgesJson()).isEqualTo("[]");
    }

    @Test
    void publishesDraftAndCreatesTheNextInheritedDraft() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("清场作业").type("WORK").build();
        WorkflowDefinitionVersion draft = WorkflowDefinitionVersion.builder().id(201L).definitionId(101L).versionNumber(1)
                .status("DRAFT").isCurrent(false).nodesJson("[{\"id\":\"start\",\"data\":{\"kind\":\"START\"}},{\"id\":\"step-1\",\"data\":{\"kind\":\"FORM\",\"config\":{\"formTemplateVersionId\":\"702\",\"formProcessVersionId\":\"901\"}}},{\"id\":\"end\",\"data\":{\"kind\":\"END\"}}]")
                .edgesJson("[{\"id\":\"start-step-1\",\"source\":\"start\",\"target\":\"step-1\"},{\"id\":\"step-1-end\",\"source\":\"step-1\",\"target\":\"end\"}]").build();
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(versionRepository.findById(201L)).thenReturn(Optional.of(draft));
        when(versionRepository.findByDefinitionIdOrderByVersionNumberDesc(101L)).thenReturn(List.of(draft));
        when(versionRepository.save(any(WorkflowDefinitionVersion.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(idGenerator.nextId()).thenReturn(801L, 802L, 803L);

        var response = controller.publishVersion(101L, 201L);

        assertThat(response.getData()).satisfies(published -> {
            assertThat(published.getStatus()).isEqualTo("PUBLISHED");
            assertThat(published.getIsCurrent()).isTrue();
        });
        ArgumentCaptor<WorkflowDefinitionVersion> versions = ArgumentCaptor.forClass(WorkflowDefinitionVersion.class);
        verify(versionRepository, times(2)).save(versions.capture());
        verify(versionRepository).flush();
        assertThat(versions.getAllValues()).anySatisfy(nextDraft -> {
            assertThat(nextDraft.getVersionNumber()).isEqualTo(2);
            assertThat(nextDraft.getStatus()).isEqualTo("DRAFT");
            assertThat(nextDraft.getNodesJson()).contains("\"kind\":\"START\"").contains("\"id\":\"step-1\"").contains("\"kind\":\"END\"");
            assertThat(nextDraft.getEdgesJson()).contains("start-step-1").contains("step-1-end");
            assertThat(nextDraft.getIsCurrent()).isFalse();
        });
    }

    @Test
    void allowsPublishingAFlowWithoutConditionNodes() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("表单作业").type("WORK").build();
        WorkflowDefinitionVersion draft = draftVersion(201L,
                "[{\"id\":\"start\",\"data\":{\"kind\":\"START\"}},"
                        + "{\"id\":\"form\",\"data\":{\"kind\":\"FORM\",\"config\":{\"formTemplateVersionId\":\"702\",\"formProcessVersionId\":\"901\"}}},"
                        + "{\"id\":\"end\",\"data\":{\"kind\":\"END\"}}]");
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(versionRepository.findById(201L)).thenReturn(Optional.of(draft));
        when(versionRepository.findByDefinitionIdOrderByVersionNumberDesc(101L)).thenReturn(List.of(draft));
        when(versionRepository.save(any(WorkflowDefinitionVersion.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(idGenerator.nextId()).thenReturn(801L, 802L, 803L);

        assertThat(controller.publishVersion(101L, 201L).getData().getStatus()).isEqualTo("PUBLISHED");
    }

    @Test
    void allowsPublishingAFormNodeWithoutAFormProcess() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("无流程表单作业").type("WORK").build();
        WorkflowDefinitionVersion draft = draftVersion(201L,
                "[{\"id\":\"start\",\"data\":{\"kind\":\"START\"}},"
                        + "{\"id\":\"form\",\"data\":{\"kind\":\"FORM\",\"config\":{\"formTemplateVersionId\":\"702\"}}},"
                        + "{\"id\":\"end\",\"data\":{\"kind\":\"END\"}}]");
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(versionRepository.findById(201L)).thenReturn(Optional.of(draft));
        when(versionRepository.findByDefinitionIdOrderByVersionNumberDesc(101L)).thenReturn(List.of(draft));
        when(versionRepository.save(any(WorkflowDefinitionVersion.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(idGenerator.nextId()).thenReturn(801L, 802L, 803L);

        assertThat(controller.publishVersion(101L, 201L).getData().getStatus()).isEqualTo("PUBLISHED");
    }

    @Test
    void allowsSignatureEventWithoutFieldFillToRemainUnbound() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("签名字段作业").type("WORK").build();
        WorkflowDefinitionVersion draft = draftVersion(201L,
                "[{\"id\":\"start\",\"data\":{\"kind\":\"START\"}},"
                        + "{\"id\":\"form\",\"data\":{\"kind\":\"FORM\",\"config\":{\"formTemplateVersionId\":\"702\",\"formProcessVersionId\":\"901\"}}},"
                        + "{\"id\":\"end\",\"data\":{\"kind\":\"END\"}}]");
        WorkflowDefinitionVersion process = WorkflowDefinitionVersion.builder().id(901L).definitionId(902L)
                .status("PUBLISHED").isCurrent(true)
                .nodesJson("[{\"id\":\"start\",\"data\":{\"kind\":\"START\",\"config\":{"
                        + "\"buttonEvents\":[{\"id\":\"event-1\",\"event\":\"BEFORE\",\"action\":\"SUBMIT\",\"builtin\":\"NONE\",\"signatureMethod\":\"ACCOUNT_PASSWORD\"}]}}},"
                        + "{\"id\":\"end\",\"data\":{\"kind\":\"END\"}}]")
                .build();
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(versionRepository.findById(201L)).thenReturn(Optional.of(draft));
        when(versionRepository.findById(901L)).thenReturn(Optional.of(process));
        when(workflowDefinitionRepository.findById(902L)).thenReturn(Optional.of(
                WorkflowDefinition.builder().id(902L).type("FORM_PROCESS").name("表单流程").build()));
        when(versionRepository.findByDefinitionIdOrderByVersionNumberDesc(101L)).thenReturn(List.of(draft));
        when(versionRepository.save(any(WorkflowDefinitionVersion.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(idGenerator.nextId()).thenReturn(801L, 802L, 803L);

        assertThat(controller.publishVersion(101L, 201L).getData().getStatus()).isEqualTo("PUBLISHED");
    }

    @Test
    void allowsPublishingLegacyFlowFieldConfigurationWithoutMapping() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("历史流程字段作业").type("WORK").build();
        WorkflowDefinitionVersion draft = draftVersion(201L,
                "[{\"id\":\"start\",\"data\":{\"kind\":\"START\"}},"
                        + "{\"id\":\"form\",\"data\":{\"kind\":\"FORM\",\"config\":{\"formTemplateVersionId\":\"702\",\"formProcessVersionId\":\"901\"}}},"
                        + "{\"id\":\"end\",\"data\":{\"kind\":\"END\"}}]");
        WorkflowDefinitionVersion process = WorkflowDefinitionVersion.builder().id(901L).definitionId(902L)
                .status("PUBLISHED").isCurrent(true)
                .nodesJson("[{\"data\":{\"kind\":\"START\",\"config\":{\"fieldSlots\":[\"生产数量\"]}}},{\"data\":{\"kind\":\"END\"}}]")
                .build();
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(versionRepository.findById(201L)).thenReturn(Optional.of(draft));
        when(versionRepository.findById(901L)).thenReturn(Optional.of(process));
        when(formTemplateVersionRepository.findById(702L)).thenReturn(Optional.of(
                FormTemplateVersion.builder().id(702L).status("DRAFT")
                        .modelDesignJson("{\"fields\":[{\"id\":\"actual-quantity\"}]}").build()));
        when(versionRepository.findByDefinitionIdOrderByVersionNumberDesc(101L)).thenReturn(List.of(draft));
        when(versionRepository.save(any(WorkflowDefinitionVersion.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(idGenerator.nextId()).thenReturn(801L, 802L, 803L);

        assertThat(controller.publishVersion(101L, 201L).getData().getStatus()).isEqualTo("PUBLISHED");
    }

    @Test
    void rejectsPublishingWhenBindingPermissionReferencesUnknownFormField() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("字段权限作业").type("WORK").build();
        WorkflowDefinitionVersion draft = draftVersion(201L,
                "[{\"id\":\"start\",\"data\":{\"kind\":\"START\"}},"
                        + "{\"id\":\"form\",\"data\":{\"kind\":\"FORM\",\"config\":{"
                        + "\"formTemplateVersionId\":\"702\",\"formProcessVersionId\":\"901\","
                        + "\"fieldPermissions\":{\"approval:node-1:user-1\":{\"defaultPermission\":\"EDIT\",\"readOnlyFieldIds\":[\"missing-field\"]}}}}},"
                        + "{\"id\":\"end\",\"data\":{\"kind\":\"END\"}}]");
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(versionRepository.findById(201L)).thenReturn(Optional.of(draft));
        when(formTemplateVersionRepository.findById(702L)).thenReturn(Optional.of(
                FormTemplateVersion.builder().id(702L).status("DRAFT")
                        .modelDesignJson("{\"fields\":[{\"id\":\"actual-quantity\"}]}").build()));

        assertThatThrownBy(() -> controller.publishVersion(101L, 201L))
                .hasMessageContaining("引用不存在的字段：missing-field");
        verify(versionRepository, times(0)).save(any(WorkflowDefinitionVersion.class));
    }

    @Test
    void allowsBindingAnEventFromLegacyFormProcessWithoutExplicitBuiltin() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("历史事件作业").type("WORK").build();
        WorkflowDefinitionVersion draft = draftVersion(201L,
                "[{\"id\":\"start\",\"data\":{\"kind\":\"START\"}},"
                        + "{\"id\":\"form\",\"data\":{\"kind\":\"FORM\",\"config\":{"
                        + "\"formTemplateVersionId\":\"702\",\"formProcessVersionId\":\"901\","
                        + "\"eventBindings\":{\"start:event-1\":{\"fieldId\":\"signature\"}}}}},"
                        + "{\"id\":\"end\",\"data\":{\"kind\":\"END\"}}]");
        WorkflowDefinitionVersion process = WorkflowDefinitionVersion.builder().id(901L).definitionId(902L)
                .status("PUBLISHED").isCurrent(true)
                .nodesJson("[{\"id\":\"start\",\"data\":{\"kind\":\"START\",\"config\":{"
                        + "\"buttonEvents\":[{\"id\":\"event-1\",\"event\":\"BEFORE\",\"action\":\"SUBMIT\",\"enabled\":true}]}}},"
                        + "{\"id\":\"end\",\"data\":{\"kind\":\"END\"}}]")
                .build();
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(versionRepository.findById(201L)).thenReturn(Optional.of(draft));
        when(versionRepository.findById(901L)).thenReturn(Optional.of(process));
        when(formTemplateVersionRepository.findById(702L)).thenReturn(Optional.of(
                FormTemplateVersion.builder().id(702L).status("DRAFT")
                        .modelDesignJson("{\"fields\":[{\"id\":\"signature\"}]}").build()));
        when(versionRepository.findByDefinitionIdOrderByVersionNumberDesc(101L)).thenReturn(List.of(draft));
        when(versionRepository.save(any(WorkflowDefinitionVersion.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(idGenerator.nextId()).thenReturn(801L, 802L, 803L);

        assertThat(controller.publishVersion(101L, 201L).getData().getStatus()).isEqualTo("PUBLISHED");
    }

    @Test
    void allowsPublishingMultipleConditionsUsingTheConfirmedWorkRuntimeFields() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("条件作业").type("WORK").build();
        WorkflowDefinitionVersion draft = draftVersion(201L,
                "[{\"id\":\"start\",\"data\":{\"kind\":\"START\"}},"
                        + "{\"id\":\"condition\",\"data\":{\"kind\":\"CONDITION\",\"config\":{"
                        + "\"conditionBranches\":[{\"id\":\"condition-1\",\"name\":\"条件 1\",\"conditionRule\":{\"all\":["
                        + "{\"fact\":\"workType\",\"operator\":\"equals\",\"value\":\"清场\"},"
                        + "{\"fact\":\"executionStatus\",\"operator\":\"not-equals\",\"value\":\"CLOSED\"}]},"
                        + "\"fieldCatalogVersion\":\"work-runtime-fields-v1\","
                        + "\"fieldSnapshot\":{\"workType\":\"string\",\"executionStatus\":\"string\"}}],"
                        + "\"conditionDefaultBranch\":{\"id\":\"condition-default\",\"name\":\"否则\"}}}},"
                        + "{\"id\":\"end\",\"data\":{\"kind\":\"END\"}}]");
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(versionRepository.findById(201L)).thenReturn(Optional.of(draft));
        draft.setEdgesJson("[{\"id\":\"start-condition\",\"source\":\"start\",\"target\":\"condition\",\"targetHandle\":\"condition-input\"},"
                + "{\"id\":\"condition-1-end\",\"source\":\"condition\",\"sourceHandle\":\"condition-1\",\"target\":\"end\"},"
                + "{\"id\":\"condition-default-end\",\"source\":\"condition\",\"sourceHandle\":\"condition-default\",\"target\":\"end\"}]");
        when(versionRepository.findByDefinitionIdOrderByVersionNumberDesc(101L)).thenReturn(List.of(draft));
        when(versionRepository.save(any(WorkflowDefinitionVersion.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(idGenerator.nextId()).thenReturn(801L, 802L, 803L);

        assertThat(controller.publishVersion(101L, 201L).getData().getStatus()).isEqualTo("PUBLISHED");
    }

    @Test
    void publishesOrderedDynamicConditionBranchesAndTheirDefaultBranch() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("多条件作业").type("WORK").build();
        String nodes = "[{\"id\":\"start\",\"data\":{\"kind\":\"START\"}},"
                + "{\"id\":\"condition\",\"data\":{\"kind\":\"CONDITION\",\"config\":{"
                + "\"conditionBranches\":["
                + "{\"id\":\"condition-1\",\"name\":\"条件 1\",\"conditionRule\":{\"all\":[{\"fact\":\"workType\",\"operator\":\"equals\",\"value\":\"清场\"}]},\"fieldCatalogVersion\":\"work-runtime-fields-v1\",\"fieldSnapshot\":{\"workType\":\"string\"}},"
                + "{\"id\":\"condition-2\",\"name\":\"条件 2\",\"conditionRule\":{\"all\":[{\"fact\":\"executionStatus\",\"operator\":\"equals\",\"value\":\"READY\"}]},\"fieldCatalogVersion\":\"work-runtime-fields-v1\",\"fieldSnapshot\":{\"executionStatus\":\"string\"}}],\"conditionDefaultBranch\":{\"id\":\"condition-default\",\"name\":\"否则\"}}}},"
                + "{\"id\":\"end\",\"data\":{\"kind\":\"END\"}}]";
        WorkflowDefinitionVersion draft = draftVersion(201L, nodes);
        draft.setEdgesJson("[{\"id\":\"start-condition\",\"source\":\"start\",\"target\":\"condition\",\"targetHandle\":\"condition-input\"},"
                + "{\"id\":\"condition-1-end\",\"source\":\"condition\",\"sourceHandle\":\"condition-1\",\"target\":\"end\"},"
                + "{\"id\":\"condition-2-end\",\"source\":\"condition\",\"sourceHandle\":\"condition-2\",\"target\":\"end\"},"
                + "{\"id\":\"condition-default-end\",\"source\":\"condition\",\"sourceHandle\":\"condition-default\",\"target\":\"end\"}]");
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(versionRepository.findById(201L)).thenReturn(Optional.of(draft));
        when(versionRepository.findByDefinitionIdOrderByVersionNumberDesc(101L)).thenReturn(List.of(draft));
        when(versionRepository.save(any(WorkflowDefinitionVersion.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(idGenerator.nextId()).thenReturn(801L, 802L, 803L);

        assertThat(controller.publishVersion(101L, 201L).getData().getStatus()).isEqualTo("PUBLISHED");
    }

    @Test
    void rejectsPublishingDynamicConditionBranchesWhenOneBranchIsMissing() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("缺少分支作业").type("WORK").build();
        String nodes = "[{\"id\":\"start\",\"data\":{\"kind\":\"START\"}},"
                + "{\"id\":\"condition\",\"data\":{\"kind\":\"CONDITION\",\"config\":{"
                + "\"conditionBranches\":[{\"id\":\"condition-1\",\"conditionRule\":{\"all\":[{\"fact\":\"workType\",\"operator\":\"equals\",\"value\":\"清场\"}]},\"fieldCatalogVersion\":\"work-runtime-fields-v1\",\"fieldSnapshot\":{\"workType\":\"string\"}},"
                + "{\"id\":\"condition-2\",\"conditionRule\":{\"all\":[{\"fact\":\"executionStatus\",\"operator\":\"equals\",\"value\":\"READY\"}]},\"fieldCatalogVersion\":\"work-runtime-fields-v1\",\"fieldSnapshot\":{\"executionStatus\":\"string\"}}],\"conditionDefaultBranch\":{\"id\":\"condition-default\",\"name\":\"否则\"}}}},"
                + "{\"id\":\"end\",\"data\":{\"kind\":\"END\"}}]";
        WorkflowDefinitionVersion draft = draftVersion(201L, nodes);
        draft.setEdgesJson("[{\"id\":\"start-condition\",\"source\":\"start\",\"target\":\"condition\",\"targetHandle\":\"condition-input\"},"
                + "{\"id\":\"condition-1-end\",\"source\":\"condition\",\"sourceHandle\":\"condition-1\",\"target\":\"end\"},"
                + "{\"id\":\"condition-default-end\",\"source\":\"condition\",\"sourceHandle\":\"condition-default\",\"target\":\"end\"}]");
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(versionRepository.findById(201L)).thenReturn(Optional.of(draft));

        assertThatThrownBy(() -> controller.publishVersion(101L, 201L))
                .hasMessageContaining("每个出口都需要连接");
        verify(versionRepository, times(0)).save(any(WorkflowDefinitionVersion.class));
    }

    @Test
    void rejectsMalformedConditionBranchesInsteadOfFallingBackToLegacyRule() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("畸形条件作业").type("WORK").build();
        String nodes = "[{\"id\":\"start\",\"data\":{\"kind\":\"START\"}},"
                + "{\"id\":\"condition\",\"data\":{\"kind\":\"CONDITION\",\"config\":{"
                + "\"conditionBranches\":{\"id\":\"not-an-array\"},"
                + "\"conditionRule\":{\"all\":[{\"fact\":\"workType\",\"operator\":\"equals\",\"value\":\"清场\"}]},"
                + "\"conditionFieldCatalogVersion\":\"work-runtime-fields-v1\",\"conditionFieldSnapshot\":{\"workType\":\"string\"}}}},"
                + "{\"id\":\"end\",\"data\":{\"kind\":\"END\"}}]";
        WorkflowDefinitionVersion draft = draftVersion(201L, nodes);
        draft.setEdgesJson("[{\"id\":\"start-condition\",\"source\":\"start\",\"target\":\"condition\",\"targetHandle\":\"condition-input\"},"
                + "{\"id\":\"condition-end\",\"source\":\"condition\",\"sourceHandle\":\"condition-true\",\"target\":\"end\"}]");
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(versionRepository.findById(201L)).thenReturn(Optional.of(draft));

        assertThatThrownBy(() -> controller.publishVersion(101L, 201L))
                .hasMessageContaining("流程连线数据格式不正确");
        verify(versionRepository, times(0)).save(any(WorkflowDefinitionVersion.class));
    }

    @Test
    void rejectsConditionBranchHandleCollisionsAtPublish() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("重复出口作业").type("WORK").build();
        String branchRule = "{\"all\":[{\"fact\":\"workType\",\"operator\":\"equals\",\"value\":\"清场\"}]}";
        String nodes = "[{\"id\":\"start\",\"data\":{\"kind\":\"START\"}},"
                + "{\"id\":\"condition\",\"data\":{\"kind\":\"CONDITION\",\"config\":{"
                + "\"conditionBranches\":["
                + "{\"id\":\"branch-a\",\"conditionRule\":" + branchRule + ",\"fieldCatalogVersion\":\"work-runtime-fields-v1\",\"fieldSnapshot\":{\"workType\":\"string\"}},"
                + "{\"id\":\"condition-branch-a\",\"conditionRule\":" + branchRule + ",\"fieldCatalogVersion\":\"work-runtime-fields-v1\",\"fieldSnapshot\":{\"workType\":\"string\"}}],"
                + "\"conditionDefaultBranch\":{\"id\":\"condition-default\",\"name\":\"否则\"}}}},"
                + "{\"id\":\"end\",\"data\":{\"kind\":\"END\"}}]";
        WorkflowDefinitionVersion draft = draftVersion(201L, nodes);
        draft.setEdgesJson("[{\"id\":\"start-condition\",\"source\":\"start\",\"target\":\"condition\",\"targetHandle\":\"condition-input\"},"
                + "{\"id\":\"condition-a-end\",\"source\":\"condition\",\"sourceHandle\":\"condition-branch-a\",\"target\":\"end\"},"
                + "{\"id\":\"condition-default-end\",\"source\":\"condition\",\"sourceHandle\":\"condition-default\",\"target\":\"end\"}]");
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(versionRepository.findById(201L)).thenReturn(Optional.of(draft));

        assertThatThrownBy(() -> controller.publishVersion(101L, 201L))
                .hasMessageContaining("流程连线数据格式不正确");
        verify(versionRepository, times(0)).save(any(WorkflowDefinitionVersion.class));
    }

    @Test
    void keepsAnUnconfiguredConditionNodeInDraftButRejectsPublishingIt() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("条件作业").type("WORK").build();
        WorkflowDefinitionVersion draft = draftVersion(201L,
                "[{\"id\":\"start\",\"data\":{\"kind\":\"START\"}},"
                        + "{\"id\":\"condition\",\"data\":{\"kind\":\"CONDITION\",\"config\":{"
                        + "\"conditionBranches\":[{\"id\":\"condition-1\",\"name\":\"条件 1\",\"conditionRule\":null}],"
                        + "\"conditionDefaultBranch\":{\"id\":\"condition-default\",\"name\":\"否则\"}}}},"
                        + "{\"id\":\"end\",\"data\":{\"kind\":\"END\"}}]");
        draft.setEdgesJson("[{\"id\":\"start-condition\",\"source\":\"start\",\"target\":\"condition\",\"targetHandle\":\"condition-input\"},"
                + "{\"id\":\"condition-branch-end\",\"source\":\"condition\",\"sourceHandle\":\"condition-1\",\"target\":\"end\"},"
                + "{\"id\":\"condition-default-end\",\"source\":\"condition\",\"sourceHandle\":\"condition-default\",\"target\":\"end\"}]");
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(versionRepository.findById(201L)).thenReturn(Optional.of(draft));

        assertThatThrownBy(() -> controller.publishVersion(101L, 201L))
                .hasMessageContaining("尚未配置结构化条件规则");
        verify(versionRepository, times(0)).save(any(WorkflowDefinitionVersion.class));
    }

    @Test
    void rejectsConditionAstWithEmptyGroupsAtPublish() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("条件作业").type("WORK").build();
        WorkflowDefinitionVersion draft = draftVersion(201L,
                "[{\"id\":\"start\",\"data\":{\"kind\":\"START\"}},"
                        + "{\"id\":\"condition\",\"data\":{\"kind\":\"CONDITION\",\"config\":{"
                        + "\"conditionBranches\":[{\"id\":\"condition-1\",\"name\":\"条件 1\",\"conditionRule\":{\"all\":[]},\"fieldCatalogVersion\":\"work-runtime-fields-v1\",\"fieldSnapshot\":{}}],\"conditionDefaultBranch\":{\"id\":\"condition-default\",\"name\":\"否则\"}}}},"
                        + "{\"id\":\"end\",\"data\":{\"kind\":\"END\"}}]");
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(versionRepository.findById(201L)).thenReturn(Optional.of(draft));

        assertThatThrownBy(() -> controller.publishVersion(101L, 201L))
                .hasMessageContaining("合法的结构化条件表达式");
    }

    @Test
    void rejectsConditionAstWithAnUnknownOperatorAtPublish() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("条件作业").type("WORK").build();
        WorkflowDefinitionVersion draft = draftVersion(201L,
                "[{\"id\":\"start\",\"data\":{\"kind\":\"START\"}},"
                        + "{\"id\":\"condition\",\"data\":{\"kind\":\"CONDITION\",\"config\":{"
                        + "\"conditionBranches\":[{\"id\":\"condition-1\",\"name\":\"条件 1\",\"conditionRule\":{\"all\":[{\"fact\":\"executionStatus\",\"operator\":\"unknown-op\",\"value\":\"READY\"}]},"
                        + "\"fieldCatalogVersion\":\"work-runtime-fields-v1\",\"fieldSnapshot\":{\"executionStatus\":\"string\"}}],\"conditionDefaultBranch\":{\"id\":\"condition-default\",\"name\":\"否则\"}}}},"
                        + "{\"id\":\"end\",\"data\":{\"kind\":\"END\"}}]");
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(versionRepository.findById(201L)).thenReturn(Optional.of(draft));

        assertThatThrownBy(() -> controller.publishVersion(101L, 201L))
                .hasMessageContaining("合法的结构化条件表达式");
    }

    @Test
    void rejectsConditionOperatorsOutsideTheFirstReleaseContract() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("条件作业").type("WORK").build();
        WorkflowDefinitionVersion draft = draftVersion(201L,
                "[{\"id\":\"start\",\"data\":{\"kind\":\"START\"}},"
                        + "{\"id\":\"condition\",\"data\":{\"kind\":\"CONDITION\",\"config\":{"
                        + "\"conditionBranches\":[{\"id\":\"condition-1\",\"name\":\"条件 1\",\"conditionRule\":{\"all\":[{\"fact\":\"executionStatus\",\"operator\":\"equals-ignore-case\",\"value\":\"READY\"}]},"
                        + "\"fieldCatalogVersion\":\"work-runtime-fields-v1\",\"fieldSnapshot\":{\"executionStatus\":\"string\"}}],\"conditionDefaultBranch\":{\"id\":\"condition-default\",\"name\":\"否则\"}}}},"
                        + "{\"id\":\"end\",\"data\":{\"kind\":\"END\"}}]");
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(versionRepository.findById(201L)).thenReturn(Optional.of(draft));

        assertThatThrownBy(() -> controller.publishVersion(101L, 201L))
                .hasMessageContaining("合法的结构化条件表达式");
        verify(versionRepository, times(0)).save(any(WorkflowDefinitionVersion.class));
    }

    @Test
    void rejectsConditionAstWhenFirstReleaseFieldCatalogIsUnavailable() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("条件作业").type("WORK").build();
        WorkflowDefinitionVersion draft = draftVersion(201L,
                "[{\"id\":\"start\",\"data\":{\"kind\":\"START\"}},"
                        + "{\"id\":\"condition\",\"data\":{\"kind\":\"CONDITION\",\"config\":{"
                        + "\"conditionBranches\":[{\"id\":\"condition-1\",\"name\":\"条件 1\",\"conditionRule\":{\"all\":[{\"fact\":\"status\",\"operator\":\"equals\",\"value\":\"READY\"}]},"
                        + "\"fieldCatalogVersion\":\"work-runtime-fields-unavailable\",\"fieldSnapshot\":{}}],\"conditionDefaultBranch\":{\"id\":\"condition-default\",\"name\":\"否则\"}}}},"
                        + "{\"id\":\"end\",\"data\":{\"kind\":\"END\"}}]");
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(versionRepository.findById(201L)).thenReturn(Optional.of(draft));

        assertThatThrownBy(() -> controller.publishVersion(101L, 201L))
                .hasMessageContaining("尚未开放作业条件字段");
    }

    @Test
    void rejectsAnUnregisteredConditionFieldCatalogVersionAtPublish() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("条件作业").type("WORK").build();
        WorkflowDefinitionVersion draft = draftVersion(201L,
                "[{\"id\":\"start\",\"data\":{\"kind\":\"START\"}},"
                        + "{\"id\":\"condition\",\"data\":{\"kind\":\"CONDITION\",\"config\":{"
                        + "\"conditionBranches\":[{\"id\":\"condition-1\",\"name\":\"条件 1\",\"conditionRule\":{\"all\":[{\"fact\":\"status\",\"operator\":\"equals\",\"value\":\"READY\"}]},"
                        + "\"fieldCatalogVersion\":\"work-runtime-fields-v0\",\"fieldSnapshot\":{\"executionStatus\":\"string\"}}],\"conditionDefaultBranch\":{\"id\":\"condition-default\",\"name\":\"否则\"}}}},"
                        + "{\"id\":\"end\",\"data\":{\"kind\":\"END\"}}]");
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(versionRepository.findById(201L)).thenReturn(Optional.of(draft));

        assertThatThrownBy(() -> controller.publishVersion(101L, 201L))
                .hasMessageContaining("尚未开放作业条件字段");
        verify(versionRepository, times(0)).save(any(WorkflowDefinitionVersion.class));
    }

    @Test
    void rejectsLegacyFreeTextConditionAsTheOnlyPublishFact() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("条件作业").type("WORK").build();
        WorkflowDefinitionVersion draft = draftVersion(201L,
                "[{\"id\":\"start\",\"data\":{\"kind\":\"START\"}},"
                        + "{\"id\":\"condition\",\"data\":{\"kind\":\"CONDITION\",\"config\":{"
                        + "\"conditionExpression\":\"status = READY\",\"conditionBranches\":[{\"id\":\"condition-1\",\"name\":\"条件 1\"}],\"conditionDefaultBranch\":{\"id\":\"condition-default\",\"name\":\"否则\"}}}},"
                        + "{\"id\":\"end\",\"data\":{\"kind\":\"END\"}}]");
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(versionRepository.findById(201L)).thenReturn(Optional.of(draft));

        assertThatThrownBy(() -> controller.publishVersion(101L, 201L))
                .hasMessageContaining("不支持的旧配置字段");
    }

    @Test
    void saveGraphRebuildsFormProcessReferenceProjection() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("表单作业").type("WORK").build();
        WorkflowDefinitionVersion draft = draftVersion(201L,
                "[{\"id\":\"start\",\"data\":{\"kind\":\"START\"}},{\"id\":\"end\",\"data\":{\"kind\":\"END\"}}]");
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(versionRepository.findById(201L)).thenReturn(Optional.of(draft));
        when(versionRepository.save(any(WorkflowDefinitionVersion.class))).thenAnswer(invocation -> invocation.getArgument(0));

        controller.saveGraph(101L, 201L, Map.of(
                "nodes", List.of(
                        Map.of("id", "start", "data", Map.of("kind", "START")),
                        Map.of("id", "end", "data", Map.of("kind", "END"))),
                "edges", List.of()));

        verify(formProcessReferenceService).rebuildForWorkVersion(draft);
    }

    @Test
    void exposesOutdatedFormProcessReferenceForDraft() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("表单作业").type("WORK").build();
        WorkflowDefinitionVersion draft = draftVersion(201L,
                "[{\"id\":\"start\",\"data\":{\"kind\":\"START\"}},"
                        + "{\"id\":\"form\",\"data\":{\"kind\":\"FORM\",\"label\":\"表单填写\",\"config\":{\"formTemplateVersionId\":\"702\",\"formProcessVersionId\":\"901\"}}},"
                        + "{\"id\":\"end\",\"data\":{\"kind\":\"END\"}}]");
        WorkflowDefinition processDefinition = WorkflowDefinition.builder().id(902L).type("FORM_PROCESS").name("现场填报审批").build();
        WorkflowDefinitionVersion oldProcess = WorkflowDefinitionVersion.builder().id(901L).definitionId(902L)
                .versionNumber(3).status("PUBLISHED").isCurrent(false).nodesJson("[]").build();
        WorkflowDefinitionVersion latestProcess = WorkflowDefinitionVersion.builder().id(903L).definitionId(902L)
                .versionNumber(4).status("PUBLISHED").isCurrent(true).nodesJson("[]").build();
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(workflowDefinitionRepository.findById(902L)).thenReturn(Optional.of(processDefinition));
        when(versionRepository.findById(201L)).thenReturn(Optional.of(draft));
        when(versionRepository.findById(901L)).thenReturn(Optional.of(oldProcess));
        when(versionRepository.findByDefinitionIdAndIsCurrentTrue(902L)).thenReturn(Optional.of(latestProcess));

        var response = controller.listFormProcessReferences(101L, 201L);

        assertThat(response.getData()).singleElement().satisfies(status -> {
            assertThat(status.nodeId()).isEqualTo("form");
            assertThat(status.formProcessName()).isEqualTo("现场填报审批");
            assertThat(status.formProcessVersionNumber()).isEqualTo(3);
            assertThat(status.latestFormProcessVersionNumber()).isEqualTo(4);
            assertThat(status.outdated()).isTrue();
            assertThat(status.upgradeAvailable()).isTrue();
            assertThat(status.upgradeBlockers()).isEmpty();
        });
    }

    @Test
    void exposesUpgradeBlockerWhenLatestProcessBreaksEventBinding() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("表单作业").type("WORK").build();
        WorkflowDefinitionVersion draft = draftVersion(201L,
                "[{\"id\":\"start\",\"data\":{\"kind\":\"START\"}},"
                        + "{\"id\":\"form\",\"data\":{\"kind\":\"FORM\",\"config\":{\"formTemplateVersionId\":\"702\",\"formProcessVersionId\":\"901\",\"eventBindings\":{\"start:event-1\":{\"fieldId\":\"signature\"}}}}},"
                        + "{\"id\":\"end\",\"data\":{\"kind\":\"END\"}}]");
        WorkflowDefinition processDefinition = WorkflowDefinition.builder().id(902L).type("FORM_PROCESS").name("现场填报审批").build();
        WorkflowDefinitionVersion oldProcess = WorkflowDefinitionVersion.builder().id(901L).definitionId(902L)
                .versionNumber(3).status("PUBLISHED").isCurrent(false).nodesJson("[]").build();
        WorkflowDefinitionVersion latestProcess = WorkflowDefinitionVersion.builder().id(903L).definitionId(902L)
                .versionNumber(4).status("PUBLISHED").isCurrent(true).nodesJson("[]").build();
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(workflowDefinitionRepository.findById(902L)).thenReturn(Optional.of(processDefinition));
        when(versionRepository.findById(201L)).thenReturn(Optional.of(draft));
        when(versionRepository.findById(901L)).thenReturn(Optional.of(oldProcess));
        when(versionRepository.findByDefinitionIdAndIsCurrentTrue(902L)).thenReturn(Optional.of(latestProcess));

        var response = controller.listFormProcessReferences(101L, 201L);

        assertThat(response.getData()).singleElement().satisfies(status -> {
            assertThat(status.outdated()).isTrue();
            assertThat(status.upgradeAvailable()).isFalse();
            assertThat(status.upgradeBlockers()).anySatisfy(message ->
                    assertThat(message).contains("引用了不存在的内置事件"));
        });
    }

    private WorkflowDefinitionVersion draftVersion(Long id, String nodesJson) {
        return WorkflowDefinitionVersion.builder().id(id).definitionId(101L).versionNumber(1)
                .status("DRAFT").isCurrent(false).nodesJson(nodesJson).edgesJson(defaultLinearEdges(nodesJson)).build();
    }

    private String defaultLinearEdges(String nodesJson) {
        try {
            JsonNode nodes = jsonObjectMapper.readTree(nodesJson);
            List<String> ids = new java.util.ArrayList<>();
            String start = null;
            String end = null;
            for (JsonNode node : nodes) {
                String id = node.path("id").asText();
                String kind = node.path("data").path("kind").asText();
                if ("START".equals(kind)) start = id;
                else if ("END".equals(kind)) end = id;
                else ids.add(id);
            }
            List<String> path = new java.util.ArrayList<>();
            if (start != null) path.add(start);
            path.addAll(ids);
            if (end != null) path.add(end);
            Map<String, JsonNode> nodesById = new java.util.HashMap<>();
            for (JsonNode node : nodes) {
                nodesById.put(node.path("id").asText(), node);
            }
            List<Map<String, Object>> edges = new java.util.ArrayList<>();
            for (int index = 0; index + 1 < path.size(); index++) {
                String sourceId = path.get(index);
                String targetId = path.get(index + 1);
                JsonNode sourceNode = nodesById.get(sourceId);
                JsonNode branches = sourceNode == null ? null : sourceNode.path("data").path("config").get("conditionBranches");
                if (sourceNode != null && "CONDITION".equals(sourceNode.path("data").path("kind").asText())
                        && branches != null && branches.isArray() && !branches.isEmpty()) {
                    for (JsonNode branch : branches) {
                        String branchId = branch.path("id").asText();
                        String handle = branchId.startsWith("condition-") ? branchId : "condition-" + branchId;
                        edges.add(Map.of("id", sourceId + "-" + handle + "-" + targetId,
                                "source", sourceId, "sourceHandle", handle, "target", targetId));
                    }
                    edges.add(Map.of("id", sourceId + "-condition-default-" + targetId,
                            "source", sourceId, "sourceHandle", "condition-default", "target", targetId));
                    continue;
                }
                Map<String, Object> edge = new java.util.LinkedHashMap<>();
                edge.put("id", sourceId + "-" + targetId);
                edge.put("source", sourceId);
                edge.put("target", targetId);
                JsonNode targetNode = nodesById.get(targetId);
                if (targetNode != null && "CONDITION".equals(targetNode.path("data").path("kind").asText())) {
                    edge.put("targetHandle", "condition-input");
                }
                edges.add(edge);
            }
            return jsonObjectMapper.writeValueAsString(edges);
        } catch (Exception exception) {
            throw new IllegalArgumentException("测试流程节点数据不正确", exception);
        }
    }

    @Test
    void copiesPublishedHistoryOverTheCurrentDraft() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("清场作业").type("WORK").build();
        WorkflowDefinitionVersion source = WorkflowDefinitionVersion.builder().id(201L).definitionId(101L).versionNumber(1)
                .status("PUBLISHED").nodesJson("[{\"id\":\"published\"}]").edgesJson("[{\"id\":\"edge\"}]").build();
        WorkflowDefinitionVersion draft = WorkflowDefinitionVersion.builder().id(202L).definitionId(101L).versionNumber(3)
                .status("DRAFT").nodesJson("[{\"id\":\"draft\"}]").edgesJson("[]").build();
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(versionRepository.findById(201L)).thenReturn(Optional.of(source));
        when(versionRepository.findByDefinitionIdAndStatus(101L, "DRAFT")).thenReturn(Optional.of(draft));
        when(versionRepository.save(any(WorkflowDefinitionVersion.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(idGenerator.nextId()).thenReturn(801L);

        var response = controller.copyPublishedVersionToDraft(101L, 201L, false);

        assertThat(response.getData()).satisfies(saved -> {
            assertThat(saved.getId()).isEqualTo(202L);
            assertThat(saved.getVersionNumber()).isEqualTo(3);
            assertThat(saved.getNodesJson()).isEqualTo("[{\"id\":\"published\"}]");
            assertThat(saved.getEdgesJson()).isEqualTo("[{\"id\":\"edge\"}]");
        });
        verify(auditEventRepository).save(argThat(event -> "UPDATE".equals(event.getAction())
                && "PRODUCTION_WORK_FLOW_VERSION".equals(event.getEntityType())));
    }

    @Test
    void createsTheNextDraftWhenCopyingPublishedFlowWithoutAnEditableDraft() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("清场作业").type("WORK").build();
        WorkflowDefinitionVersion source = WorkflowDefinitionVersion.builder().id(201L).definitionId(101L).versionNumber(2)
                .status("PUBLISHED").nodesJson("[{\"id\":\"published\"}]").edgesJson("[]").build();
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(versionRepository.findById(201L)).thenReturn(Optional.of(source));
        when(versionRepository.findByDefinitionIdAndStatus(101L, "DRAFT")).thenReturn(Optional.empty());
        when(versionRepository.findByDefinitionIdOrderByVersionNumberDesc(101L)).thenReturn(List.of(source));
        when(versionRepository.save(any(WorkflowDefinitionVersion.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(idGenerator.nextId()).thenReturn(301L, 302L);

        var response = controller.copyPublishedVersionToDraft(101L, 201L, true);

        assertThat(response.getData()).satisfies(draft -> {
            assertThat(draft.getVersionNumber()).isEqualTo(3);
            assertThat(draft.getStatus()).isEqualTo("DRAFT");
            assertThat(draft.getNodesJson()).isEqualTo("[{\"id\":\"published\"}]");
        });
        verify(auditEventRepository).save(argThat(event -> "CREATE".equals(event.getAction())
                && "PRODUCTION_WORK_FLOW_VERSION".equals(event.getEntityType())));
    }

    @Test
    void rejectsDeletingAPublishedFlowVersion() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("清场作业").type("WORK").build();
        WorkflowDefinitionVersion published = WorkflowDefinitionVersion.builder().id(201L).definitionId(101L).versionNumber(1)
                .status("PUBLISHED").isCurrent(true).build();
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(versionRepository.findById(201L)).thenReturn(Optional.of(published));

        assertThatThrownBy(() -> controller.deleteVersion(101L, 201L))
                .hasMessageContaining("流程版本不能单独删除");
        verify(versionRepository, times(0)).delete(any(WorkflowDefinitionVersion.class));
    }

    @Test
    void rejectsDeletingADraftFlowVersion() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("清场作业").type("WORK").build();
        WorkflowDefinitionVersion draft = WorkflowDefinitionVersion.builder().id(201L).definitionId(101L).versionNumber(2)
                .status("DRAFT").isCurrent(false).build();
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(versionRepository.findById(201L)).thenReturn(Optional.of(draft));

        assertThatThrownBy(() -> controller.deleteVersion(101L, 201L))
                .hasMessageContaining("流程版本不能单独删除");
        verify(versionRepository, times(0)).delete(any(WorkflowDefinitionVersion.class));
    }

    @Test
    void rejectsSavingAGraphWithoutExactlyOneStartAndEndBoundary() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("清场作业").type("WORK").build();
        WorkflowDefinitionVersion draft = WorkflowDefinitionVersion.builder().id(201L).definitionId(101L).status("DRAFT").build();
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(versionRepository.findById(201L)).thenReturn(Optional.of(draft));

        assertThatThrownBy(() -> controller.saveGraph(101L, 201L, java.util.Map.of("nodes", List.of(), "edges", List.of())))
                .hasMessageContaining("流程必须且只能包含一个开始节点和一个结束节点");
        verify(versionRepository, times(0)).save(any(WorkflowDefinitionVersion.class));
    }

    @Test
    void savesDraftGraphAndRecordsTheUpdatedSnapshot() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("清场作业").type("WORK").build();
        WorkflowDefinitionVersion draft = WorkflowDefinitionVersion.builder().id(201L).definitionId(101L)
                .versionNumber(1).status("DRAFT").nodesJson("[]").edgesJson("[]").build();
        List<Map<String, Object>> nodes = List.of(
                Map.of("id", "start", "data", Map.of("kind", "START")),
                Map.of("id", "form", "data", Map.of("kind", "FORM")),
                Map.of("id", "other", "data", Map.of("kind", "FORM")),
                Map.of("id", "end", "data", Map.of("kind", "END")));
        List<Map<String, Object>> edges = List.of(
                Map.of("id", "start-form", "source", "start", "target", "form"),
                Map.of("id", "form-other", "source", "form", "target", "other"),
                Map.of("id", "other-end", "source", "other", "target", "end"));
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(versionRepository.findById(201L)).thenReturn(Optional.of(draft));
        when(versionRepository.save(any(WorkflowDefinitionVersion.class))).thenAnswer(invocation -> invocation.getArgument(0));

        controller.saveGraph(101L, 201L, Map.of("nodes", nodes, "edges", edges));

        assertThat(draft.getNodesJson()).contains("\"id\":\"form\"");
        assertThat(draft.getEdgesJson()).contains("\"source\":\"form\"");
        verify(versionRepository).save(draft);
        verify(auditEventRepository).save(argThat(event -> "UPDATE".equals(event.getAction())
                && "PRODUCTION_WORK_FLOW_VERSION".equals(event.getEntityType())));
    }

    @Test
    void savesAnIncompleteDraftWithoutPublishValidation() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("未完成作业").type("WORK").build();
        WorkflowDefinitionVersion draft = WorkflowDefinitionVersion.builder().id(201L).definitionId(101L)
                .versionNumber(1).status("DRAFT").nodesJson("[]").edgesJson("[]").build();
        List<Map<String, Object>> nodes = List.of(
                Map.of("id", "start", "data", Map.of("kind", "START")),
                Map.of("id", "form", "data", Map.of("kind", "FORM")),
                Map.of("id", "end", "data", Map.of("kind", "END")));
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(versionRepository.findById(201L)).thenReturn(Optional.of(draft));
        when(versionRepository.save(any(WorkflowDefinitionVersion.class))).thenAnswer(invocation -> invocation.getArgument(0));

        controller.saveGraph(101L, 201L, Map.of("nodes", nodes, "edges", List.of()));

        assertThat(draft.getNodesJson()).contains("\"kind\":\"FORM\"");
        assertThat(draft.getEdgesJson()).isEqualTo("[]");
        verify(versionRepository).save(draft);
    }

    @Test
    void rejectsPublishingAFlowWhenAFormVersionIsMissing() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("未配置表单作业").type("WORK").build();
        WorkflowDefinitionVersion draft = draftVersion(201L,
                "[{\"id\":\"start\",\"data\":{\"kind\":\"START\"}},"
                        + "{\"id\":\"form\",\"data\":{\"kind\":\"FORM\"}},"
                        + "{\"id\":\"end\",\"data\":{\"kind\":\"END\"}}]");
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(versionRepository.findById(201L)).thenReturn(Optional.of(draft));

        assertThatThrownBy(() -> controller.publishVersion(101L, 201L))
                .hasMessageContaining("尚未选择生效表单版本");
        verify(versionRepository, times(0)).save(any(WorkflowDefinitionVersion.class));
    }

    @Test
    void rejectsPublishingAFlowWhenTheReferencedFormVersionDoesNotExist() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("不存在表单版本的作业").type("WORK").build();
        WorkflowDefinitionVersion draft = draftVersion(201L,
                "[{\"id\":\"start\",\"data\":{\"kind\":\"START\"}},"
                        + "{\"id\":\"form\",\"data\":{\"kind\":\"FORM\",\"config\":{\"formTemplateVersionId\":\"999\"}}},"
                        + "{\"id\":\"end\",\"data\":{\"kind\":\"END\"}}]");
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(versionRepository.findById(201L)).thenReturn(Optional.of(draft));
        when(formTemplateVersionRepository.findById(999L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> controller.publishVersion(101L, 201L))
                .hasMessageContaining("表单版本不存在");
        verify(versionRepository, times(0)).save(any(WorkflowDefinitionVersion.class));
    }

    @Test
    void rejectsPublishingAFlowWhenTheReferencedFormVersionIsNotYetEffective() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("未生效表单版本的作业").type("WORK").build();
        WorkflowDefinitionVersion draft = draftVersion(201L,
                "[{\"id\":\"start\",\"data\":{\"kind\":\"START\"}},"
                        + "{\"id\":\"form\",\"data\":{\"kind\":\"FORM\",\"config\":{\"formTemplateVersionId\":\"703\"}}},"
                        + "{\"id\":\"end\",\"data\":{\"kind\":\"END\"}}]");
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(versionRepository.findById(201L)).thenReturn(Optional.of(draft));
        when(formTemplateVersionRepository.findById(703L)).thenReturn(Optional.of(
                FormTemplateVersion.builder().id(703L).status("DRAFT")
                        .effectiveFrom(LocalDateTime.now().plusDays(1)).build()));

        assertThatThrownBy(() -> controller.publishVersion(101L, 201L))
                .hasMessageContaining("当前生效的表单版本");
        verify(versionRepository, times(0)).save(any(WorkflowDefinitionVersion.class));
    }

    @Test
    void rejectsPublishingAFlowWhenTheReferencedFormVersionIsOutsideItsEffectiveWindow() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("失效表单版本的作业").type("WORK").build();
        WorkflowDefinitionVersion draft = draftVersion(201L,
                "[{\"id\":\"start\",\"data\":{\"kind\":\"START\"}},"
                        + "{\"id\":\"form\",\"data\":{\"kind\":\"FORM\",\"config\":{\"formTemplateVersionId\":\"704\"}}},"
                        + "{\"id\":\"end\",\"data\":{\"kind\":\"END\"}}]");
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(versionRepository.findById(201L)).thenReturn(Optional.of(draft));
        when(formTemplateVersionRepository.findById(704L)).thenReturn(Optional.of(
                FormTemplateVersion.builder().id(704L).status("ACTIVE")
                        .effectiveTo(LocalDateTime.now().minusDays(1)).build()));

        assertThatThrownBy(() -> controller.publishVersion(101L, 201L))
                .hasMessageContaining("当前生效的表单版本");
        verify(versionRepository, times(0)).save(any(WorkflowDefinitionVersion.class));
    }

    @Test
    void rejectsPublishingAFlowWithDisconnectedNodes() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("未连通作业").type("WORK").build();
        WorkflowDefinitionVersion draft = draftVersion(201L,
                "[{\"id\":\"start\",\"data\":{\"kind\":\"START\"}},"
                        + "{\"id\":\"form\",\"data\":{\"kind\":\"FORM\",\"config\":{\"formTemplateVersionId\":\"702\",\"formProcessVersionId\":\"901\"}}},"
                        + "{\"id\":\"end\",\"data\":{\"kind\":\"END\"}}]");
        draft.setEdgesJson("[]");
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(versionRepository.findById(201L)).thenReturn(Optional.of(draft));

        assertThatThrownBy(() -> controller.publishVersion(101L, 201L))
                .hasMessageContaining("缺少进入连线");
        verify(versionRepository, times(0)).save(any(WorkflowDefinitionVersion.class));
    }

    @Test
    void rejectsTwoOutgoingEdgesFromAnOrdinaryNode() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("单出口作业").type("WORK").build();
        WorkflowDefinitionVersion draft = WorkflowDefinitionVersion.builder().id(201L).definitionId(101L).status("DRAFT").build();
        List<Map<String, Object>> nodes = List.of(
                Map.of("id", "start", "data", Map.of("kind", "START")),
                Map.of("id", "form", "data", Map.of("kind", "FORM")),
                Map.of("id", "other", "data", Map.of("kind", "FORM")),
                Map.of("id", "end", "data", Map.of("kind", "END")));
        List<Map<String, Object>> edges = List.of(
                Map.of("id", "start-form", "source", "start", "target", "form"),
                Map.of("id", "form-end", "source", "form", "target", "end"),
                Map.of("id", "form-other", "source", "form", "target", "other"));
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(versionRepository.findById(201L)).thenReturn(Optional.of(draft));

        assertThatThrownBy(() -> controller.saveGraph(101L, 201L, Map.of("nodes", nodes, "edges", edges)))
                .hasMessageContaining("只能有一条出口连线");
        verify(versionRepository, times(0)).save(any(WorkflowDefinitionVersion.class));
    }

    @Test
    void allowsConditionNodeToHaveMultipleConfiguredBranchEdges() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("条件分支作业").type("WORK").build();
        WorkflowDefinitionVersion draft = WorkflowDefinitionVersion.builder().id(201L).definitionId(101L).status("DRAFT").build();
        List<Map<String, Object>> nodes = List.of(
                Map.of("id", "start", "data", Map.of("kind", "START")),
                Map.of("id", "condition", "data", Map.of("kind", "CONDITION", "config", Map.of(
                        "conditionBranches", List.of(
                                Map.of("id", "condition-1", "name", "条件 1"),
                                Map.of("id", "condition-2", "name", "条件 2")),
                        "conditionDefaultBranch", Map.of("id", "condition-default", "name", "否则")))),
                Map.of("id", "yes", "data", Map.of("kind", "FORM")),
                Map.of("id", "no", "data", Map.of("kind", "FORM")),
                Map.of("id", "end", "data", Map.of("kind", "END")));
        List<Map<String, Object>> edges = List.of(
                Map.of("id", "start-condition", "source", "start", "target", "condition", "targetHandle", "condition-input"),
                Map.of("id", "condition-yes", "source", "condition", "sourceHandle", "condition-1", "target", "yes"),
                Map.of("id", "condition-no", "source", "condition", "sourceHandle", "condition-2", "target", "no"),
                Map.of("id", "condition-default", "source", "condition", "sourceHandle", "condition-default", "target", "end"));
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(versionRepository.findById(201L)).thenReturn(Optional.of(draft));
        when(versionRepository.save(any(WorkflowDefinitionVersion.class))).thenAnswer(invocation -> invocation.getArgument(0));

        controller.saveGraph(101L, 201L, Map.of("nodes", nodes, "edges", edges));

        verify(versionRepository).save(draft);
    }

    @Test
    void rejectsConnectingToAConditionBranchOutlet() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("条件出口不可进入").type("WORK").build();
        WorkflowDefinitionVersion draft = WorkflowDefinitionVersion.builder().id(201L).definitionId(101L).status("DRAFT").build();
        List<Map<String, Object>> nodes = List.of(
                Map.of("id", "start", "data", Map.of("kind", "START")),
                Map.of("id", "condition", "data", Map.of("kind", "CONDITION", "config", Map.of(
                        "conditionBranches", List.of(Map.of("id", "condition-1", "name", "条件 1")),
                        "conditionDefaultBranch", Map.of("id", "condition-default", "name", "否则")))),
                Map.of("id", "end", "data", Map.of("kind", "END")));
        List<Map<String, Object>> edges = List.of(
                Map.of("id", "start-condition", "source", "start", "target", "condition", "targetHandle", "condition-1"));
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(versionRepository.findById(201L)).thenReturn(Optional.of(draft));

        assertThatThrownBy(() -> controller.saveGraph(101L, 201L, Map.of("nodes", nodes, "edges", edges)))
                .hasMessageContaining("条件出口不能作为进入点");
        verify(versionRepository, times(0)).save(any(WorkflowDefinitionVersion.class));
    }

    @Test
    void rejectsConnectingToAConditionWithoutItsUnifiedInputHandle() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("条件入口必须明确").type("WORK").build();
        WorkflowDefinitionVersion draft = WorkflowDefinitionVersion.builder().id(201L).definitionId(101L).status("DRAFT").build();
        List<Map<String, Object>> nodes = List.of(
                Map.of("id", "start", "data", Map.of("kind", "START")),
                Map.of("id", "condition", "data", Map.of("kind", "CONDITION", "config", Map.of(
                        "conditionBranches", List.of(Map.of("id", "condition-1", "name", "条件 1")),
                        "conditionDefaultBranch", Map.of("id", "condition-default", "name", "否则")))),
                Map.of("id", "end", "data", Map.of("kind", "END")));
        List<Map<String, Object>> edges = List.of(
                Map.of("id", "start-condition", "source", "start", "target", "condition"));
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(versionRepository.findById(201L)).thenReturn(Optional.of(draft));

        assertThatThrownBy(() -> controller.saveGraph(101L, 201L, Map.of("nodes", nodes, "edges", edges)))
                .hasMessageContaining("条件节点只能从顶部入口进入");
        verify(versionRepository, times(0)).save(any(WorkflowDefinitionVersion.class));
    }

    @Test
    void allowsConnectingToAConditionInput() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("条件入口可进入").type("WORK").build();
        WorkflowDefinitionVersion draft = WorkflowDefinitionVersion.builder().id(201L).definitionId(101L).status("DRAFT").build();
        List<Map<String, Object>> nodes = List.of(
                Map.of("id", "start", "data", Map.of("kind", "START")),
                Map.of("id", "condition", "data", Map.of("kind", "CONDITION", "config", Map.of(
                        "conditionBranches", List.of(Map.of("id", "condition-1", "name", "条件 1")),
                        "conditionDefaultBranch", Map.of("id", "condition-default", "name", "否则")))),
                Map.of("id", "end", "data", Map.of("kind", "END")));
        List<Map<String, Object>> edges = List.of(
                Map.of("id", "start-condition", "source", "start", "target", "condition", "targetHandle", "condition-input"));
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(versionRepository.findById(201L)).thenReturn(Optional.of(draft));
        when(versionRepository.save(any(WorkflowDefinitionVersion.class))).thenAnswer(invocation -> invocation.getArgument(0));

        controller.saveGraph(101L, 201L, Map.of("nodes", nodes, "edges", edges));

        verify(versionRepository).save(draft);
    }

    @Test
    void allowsDeletingAWorkTemplateThatHasPublishedFlowHistoryWithoutRules() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("清场作业").type("WORK").build();
        WorkflowDefinitionVersion published = WorkflowDefinitionVersion.builder().id(201L).definitionId(101L)
                .status("PUBLISHED").isCurrent(true).build();
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(versionRepository.findByDefinitionIdOrderByVersionNumberDesc(101L)).thenReturn(List.of(published));

        controller.delete(101L);

        verify(versionRepository).delete(published);
        verify(workflowDefinitionRepository).delete(work);
    }

    @Test
    void rejectsDeletingAWorkTemplateThatHasApplicabilityRules() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("清场作业").type("WORK").build();
        WorkflowDefinitionVersion draft = WorkflowDefinitionVersion.builder().id(201L).definitionId(101L)
                .status("DRAFT").versionNumber(1).build();
        WorkflowBindingRule rule = WorkflowBindingRule.builder().id(301L).definitionId(101L)
                .businessType("WORK").ruleType("GLOBAL").build();
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(versionRepository.findByDefinitionIdOrderByVersionNumberDesc(101L)).thenReturn(List.of(draft));
        when(bindingRuleRepository.findByDefinitionId(101L)).thenReturn(List.of(rule));

        assertThatThrownBy(() -> controller.delete(101L))
                .hasMessageContaining("存在作业适用规则的作业不能删除");
        verify(versionRepository, times(0)).delete(any(WorkflowDefinitionVersion.class));
        verify(workflowDefinitionRepository, times(0)).delete(any(WorkflowDefinition.class));
    }

    @Test
    void rejectsCreatingAnApplicabilityRuleWithoutCurrentPublishedFlow() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("待配置作业").type("WORK").build();
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(versionRepository.findByDefinitionIdAndIsCurrentTrue(101L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> controller.createRule(101L,
                WorkflowBindingRule.builder().ruleType("GLOBAL").build()))
                .hasMessageContaining("尚未发布作业流程版本");
        verify(bindingRuleRepository, times(0)).save(any(WorkflowBindingRule.class));
    }

    @Test
    void rejectsUpdatingAnApplicabilityRuleWhenCurrentPublishedFlowIsMissing() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("已失效作业").type("WORK").build();
        WorkflowBindingRule rule = WorkflowBindingRule.builder().id(301L).definitionId(101L)
                .businessType("WORK").ruleType("GLOBAL").build();
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(versionRepository.findByDefinitionIdAndIsCurrentTrue(101L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> controller.updateRule(101L, 301L,
                WorkflowBindingRule.builder().ruleType("GLOBAL").build()))
                .hasMessageContaining("尚未发布作业流程版本");
        verify(bindingRuleRepository, times(0)).findById(301L);
        verify(bindingRuleRepository, times(0)).save(any(WorkflowBindingRule.class));
    }

    @Test
    void atomicallyDeletesUnpublishedDraftBeforeDeletingItsWorkTemplate() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("临时清场作业").type("WORK").build();
        WorkflowDefinitionVersion draft = WorkflowDefinitionVersion.builder().id(201L).definitionId(101L)
                .status("DRAFT").versionNumber(1).build();
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(versionRepository.findByDefinitionIdOrderByVersionNumberDesc(101L)).thenReturn(List.of(draft));

        controller.delete(101L);

        verify(versionRepository).delete(draft);
        verify(workflowDefinitionRepository).delete(work);
        verify(auditEventRepository, times(2)).save(argThat(event -> "DELETE".equals(event.getAction())));
    }

    @Test
    void rejectsCopyingAsNewDraftWhenAnotherRequestCreatedTheDraftFirst() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("清场作业").type("WORK").build();
        WorkflowDefinitionVersion source = WorkflowDefinitionVersion.builder().id(201L).definitionId(101L)
                .status("PUBLISHED").build();
        WorkflowDefinitionVersion existingDraft = WorkflowDefinitionVersion.builder().id(202L).definitionId(101L)
                .status("DRAFT").build();
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(versionRepository.findById(201L)).thenReturn(Optional.of(source));
        when(versionRepository.findByDefinitionIdAndStatus(101L, "DRAFT")).thenReturn(Optional.of(existingDraft));

        assertThatThrownBy(() -> controller.copyPublishedVersionToDraft(101L, 201L, true))
                .hasMessageContaining("当前已有编辑中的草稿流程");
        verify(versionRepository, times(0)).save(any(WorkflowDefinitionVersion.class));
    }

    @Test
    void recomputesPriorityWhenEditingRuleType() {
        WorkflowDefinition work = WorkflowDefinition.builder().id(101L).name("清场作业").type("WORK").build();
        WorkflowBindingRule existing = WorkflowBindingRule.builder().id(301L).definitionId(101L).businessType("WORK").ruleType("GLOBAL").priority(10).build();
        when(workflowDefinitionRepository.findById(101L)).thenReturn(Optional.of(work));
        when(versionRepository.findByDefinitionIdAndIsCurrentTrue(101L)).thenReturn(Optional.of(
                WorkflowDefinitionVersion.builder().id(201L).definitionId(101L).status("PUBLISHED").isCurrent(true).build()));
        when(bindingRuleRepository.findById(301L)).thenReturn(Optional.of(existing));
        when(bindingRuleRepository.save(any(WorkflowBindingRule.class))).thenAnswer(invocation -> invocation.getArgument(0));

        WorkflowBindingRule request = WorkflowBindingRule.builder().ruleType("SCOPED").priority(1).operationId(601L).isActive(false).build();
        var response = controller.updateRule(101L, 301L, request);

        assertThat(response.getData().getPriority()).isEqualTo(20);
        assertThat(existing.getPriority()).isEqualTo(20);
        assertThat(existing.getIsActive()).isTrue();
        verify(bindingRuleRepository).save(existing);
    }

    @Test
    void writesAnAuditEventWhenCreatingAWorkTemplate() {
        when(idGenerator.nextId()).thenReturn(701L, 702L, 703L, 704L);
        when(workflowDefinitionRepository.save(any(WorkflowDefinition.class))).thenAnswer(invocation -> invocation.getArgument(0));

        controller.create(WorkflowDefinition.builder().name("上料作业").code("WORK-002").build());

        verify(auditEventRepository).save(argThat((AuditEvent event) ->
                "PRODUCTION_WORK_TEMPLATE".equals(event.getEntityType())
                        && "701".equals(event.getEntityId())
                        && "CREATE".equals(event.getAction())
                        && "生产配置 · 作业模板".equals(event.getMenuName())));
    }

    @Test
    void keepsWorkTemplateAndRuleAuditWritesInTheSameTransaction() throws NoSuchMethodException {
        assertThat(WorkTemplateController.class.getMethod("create", WorkflowDefinition.class)
                .isAnnotationPresent(Transactional.class)).isTrue();
        assertThat(WorkTemplateController.class.getMethod("update", Long.class, WorkflowDefinition.class)
                .isAnnotationPresent(Transactional.class)).isTrue();
        assertThat(WorkTemplateController.class.getMethod("createRule", Long.class, WorkflowBindingRule.class)
                .isAnnotationPresent(Transactional.class)).isTrue();
        assertThat(WorkTemplateController.class.getMethod("updateRule", Long.class, Long.class, WorkflowBindingRule.class)
                .isAnnotationPresent(Transactional.class)).isTrue();
    }
}
