package com.zencas.edhr.workflow.controller;

import com.zencas.edhr.common.exception.BusinessException;
import com.zencas.edhr.common.util.SnowflakeIdGenerator;
import com.zencas.edhr.compliance.repository.AuditEventRepository;
import com.zencas.edhr.workflow.entity.WorkFormProcessReference;
import com.zencas.edhr.workflow.entity.WorkflowDefinition;
import com.zencas.edhr.workflow.entity.WorkflowDefinitionVersion;
import com.zencas.edhr.workflow.repository.WorkflowDefinitionRepository;
import com.zencas.edhr.workflow.repository.WorkflowDefinitionVersionRepository;
import com.zencas.edhr.workflow.service.FormProcessReferenceService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.times;

@ExtendWith(MockitoExtension.class)
class FormProcessControllerTest {
    @Mock private WorkflowDefinitionRepository definitionRepository;
    @Mock private WorkflowDefinitionVersionRepository versionRepository;
    @Mock private FormProcessReferenceService formProcessReferenceService;
    @Mock private SnowflakeIdGenerator idGenerator;
    @Mock private AuditEventRepository auditEventRepository;
    @InjectMocks private FormProcessController controller;

    @Test
    void createsFormProcessDefinitionWithDedicatedType() {
        when(idGenerator.nextId()).thenReturn(101L, 102L);
        when(definitionRepository.save(any(WorkflowDefinition.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var response = controller.create(WorkflowDefinition.builder().id(999L).name("车间填报").code("FORM-001").build());

        assertThat(response.getData().getId()).isEqualTo(101L);
        assertThat(response.getData().getType()).isEqualTo("FORM_PROCESS");
        assertThat(response.getData().getName()).isEqualTo("车间填报");
    }

    @Test
    void createsDraftFromInitialBoundaryGraph() {
        when(definitionRepository.findById(11L)).thenReturn(Optional.of(
                WorkflowDefinition.builder().id(11L).type("FORM_PROCESS").name("车间填报").build()));
        when(versionRepository.findByDefinitionIdAndStatus(11L, "DRAFT")).thenReturn(Optional.empty());
        when(versionRepository.findByDefinitionIdOrderByVersionNumberDesc(11L)).thenReturn(List.of());
        when(idGenerator.nextId()).thenReturn(201L, 202L);
        when(versionRepository.save(any(WorkflowDefinitionVersion.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var response = controller.createDraft(11L);

        assertThat(response.getData().getVersionNumber()).isEqualTo(1);
        assertThat(response.getData().getNodesJson()).contains("START").contains("END");
    }

    @Test
    void rejectsPublishingGraphWithoutBothBoundaries() {
        WorkflowDefinition definition = WorkflowDefinition.builder().id(11L).type("FORM_PROCESS").name("车间填报").build();
        WorkflowDefinitionVersion draft = WorkflowDefinitionVersion.builder().id(21L).definitionId(11L).versionNumber(1)
                .status("DRAFT").nodesJson("[{\"data\":{\"kind\":\"START\"}}]").edgesJson("[]").build();
        when(definitionRepository.findById(11L)).thenReturn(Optional.of(definition));
        when(versionRepository.findById(21L)).thenReturn(Optional.of(draft));

        assertThatThrownBy(() -> controller.publish(11L, 21L))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("开始和结束节点");
    }

    @Test
    void rejectsPublishingAnUnconnectedApprovalGraph() {
        WorkflowDefinition definition = WorkflowDefinition.builder().id(11L).type("FORM_PROCESS").name("车间填报").build();
        WorkflowDefinitionVersion draft = WorkflowDefinitionVersion.builder().id(21L).definitionId(11L).versionNumber(1)
                .status("DRAFT")
                .nodesJson("[{\"id\":\"start\",\"data\":{\"kind\":\"START\"}},{\"id\":\"approval\",\"data\":{\"kind\":\"APPROVAL\",\"config\":{\"approvers\":\"u1\"}}},{\"id\":\"end\",\"data\":{\"kind\":\"END\"}}]")
                .edgesJson("[]").build();
        when(definitionRepository.findById(11L)).thenReturn(Optional.of(definition));
        when(versionRepository.findById(21L)).thenReturn(Optional.of(draft));

        assertThatThrownBy(() -> controller.publish(11L, 21L))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("未连通");
    }

    @Test
    void allowsPublishingApprovalWithoutApproverSource() {
        WorkflowDefinition definition = WorkflowDefinition.builder().id(11L).type("FORM_PROCESS").name("车间填报").build();
        WorkflowDefinitionVersion draft = WorkflowDefinitionVersion.builder().id(21L).definitionId(11L).versionNumber(1)
                .status("DRAFT")
                .nodesJson("[{\"id\":\"start\",\"data\":{\"kind\":\"START\"}},{\"id\":\"approval\",\"data\":{\"kind\":\"APPROVAL\",\"config\":{\"approvers\":\"\"}}},{\"id\":\"end\",\"data\":{\"kind\":\"END\"}}]")
                .edgesJson("[{\"source\":\"start\",\"target\":\"approval\"},{\"source\":\"approval\",\"target\":\"end\"}]").build();
        when(definitionRepository.findById(11L)).thenReturn(Optional.of(definition));
        when(versionRepository.findById(21L)).thenReturn(Optional.of(draft));
        when(versionRepository.findByDefinitionIdOrderByVersionNumberDesc(11L)).thenReturn(List.of(draft));
        when(versionRepository.save(any(WorkflowDefinitionVersion.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(idGenerator.nextId()).thenReturn(22L);

        assertThat(controller.publish(11L, 21L).getData().getStatus()).isEqualTo("PUBLISHED");
    }

    @Test
    void allowsPublishingApprovalWithoutApprovalConfig() {
        WorkflowDefinition definition = WorkflowDefinition.builder().id(11L).type("FORM_PROCESS").name("开放审批").build();
        WorkflowDefinitionVersion draft = WorkflowDefinitionVersion.builder().id(21L).definitionId(11L).versionNumber(1)
                .status("DRAFT")
                .nodesJson("[{\"id\":\"start\",\"data\":{\"kind\":\"START\"}},{\"id\":\"approval\",\"data\":{\"kind\":\"APPROVAL\"}},{\"id\":\"end\",\"data\":{\"kind\":\"END\"}}]")
                .edgesJson("[{\"source\":\"start\",\"target\":\"approval\"},{\"source\":\"approval\",\"target\":\"end\"}]").build();
        when(definitionRepository.findById(11L)).thenReturn(Optional.of(definition));
        when(versionRepository.findById(21L)).thenReturn(Optional.of(draft));
        when(versionRepository.findByDefinitionIdOrderByVersionNumberDesc(11L)).thenReturn(List.of(draft));
        when(versionRepository.save(any(WorkflowDefinitionVersion.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(idGenerator.nextId()).thenReturn(22L);

        assertThat(controller.publish(11L, 21L).getData().getStatus()).isEqualTo("PUBLISHED");
    }

    @Test
    void allowsPublishingApprovalWithEmptyApprovalSubjects() {
        WorkflowDefinition definition = WorkflowDefinition.builder().id(11L).type("FORM_PROCESS").name("开放审批").build();
        WorkflowDefinitionVersion draft = WorkflowDefinitionVersion.builder().id(21L).definitionId(11L).versionNumber(1)
                .status("DRAFT")
                .nodesJson("[{\"id\":\"start\",\"data\":{\"kind\":\"START\"}},{\"id\":\"approval\",\"data\":{\"kind\":\"APPROVAL\",\"config\":{\"approverSubjects\":[]}}},{\"id\":\"end\",\"data\":{\"kind\":\"END\"}}]")
                .edgesJson("[{\"source\":\"start\",\"target\":\"approval\"},{\"source\":\"approval\",\"target\":\"end\"}]").build();
        when(definitionRepository.findById(11L)).thenReturn(Optional.of(definition));
        when(versionRepository.findById(21L)).thenReturn(Optional.of(draft));
        when(versionRepository.findByDefinitionIdOrderByVersionNumberDesc(11L)).thenReturn(List.of(draft));
        when(versionRepository.save(any(WorkflowDefinitionVersion.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(idGenerator.nextId()).thenReturn(22L);

        assertThat(controller.publish(11L, 21L).getData().getStatus()).isEqualTo("PUBLISHED");
    }

    @Test
    void allowsPublishingEntryWithoutFillingSubjectOrPermissionGroup() {
        WorkflowDefinition definition = WorkflowDefinition.builder().id(11L).type("FORM_PROCESS").name("开放填报").build();
        WorkflowDefinitionVersion draft = WorkflowDefinitionVersion.builder().id(21L).definitionId(11L).versionNumber(1)
                .status("DRAFT")
                .nodesJson("[{\"id\":\"start\",\"data\":{\"kind\":\"START\",\"config\":{\"permissionGroupRules\":[]}}},{\"id\":\"end\",\"data\":{\"kind\":\"END\"}}]")
                .edgesJson("[{\"source\":\"start\",\"target\":\"end\"}]").build();
        when(definitionRepository.findById(11L)).thenReturn(Optional.of(definition));
        when(versionRepository.findById(21L)).thenReturn(Optional.of(draft));
        when(versionRepository.findByDefinitionIdOrderByVersionNumberDesc(11L)).thenReturn(List.of(draft));
        when(versionRepository.save(any(WorkflowDefinitionVersion.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(idGenerator.nextId()).thenReturn(22L);

        assertThat(controller.publish(11L, 21L).getData().getStatus()).isEqualTo("PUBLISHED");
    }

    @Test
    void rejectsPublishingGraphWithDuplicateNodeIds() {
        WorkflowDefinition definition = WorkflowDefinition.builder().id(11L).type("FORM_PROCESS").name("车间填报").build();
        WorkflowDefinitionVersion draft = WorkflowDefinitionVersion.builder().id(21L).definitionId(11L).versionNumber(1)
                .status("DRAFT")
                .nodesJson("[{\"id\":\"start\",\"data\":{\"kind\":\"START\"}},{\"id\":\"start\",\"data\":{\"kind\":\"END\"}}]")
                .edgesJson("[]").build();
        when(definitionRepository.findById(11L)).thenReturn(Optional.of(definition));
        when(versionRepository.findById(21L)).thenReturn(Optional.of(draft));

        assertThatThrownBy(() -> controller.publish(11L, 21L))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("不能重复");
    }

    @Test
    void rejectsUnsupportedButtonStyleConfiguration() {
        WorkflowDefinition definition = WorkflowDefinition.builder().id(11L).type("FORM_PROCESS").name("按钮配置").build();
        WorkflowDefinitionVersion draft = WorkflowDefinitionVersion.builder().id(21L).definitionId(11L).versionNumber(1)
                .status("DRAFT")
                .nodesJson("[{\"id\":\"start\",\"data\":{\"kind\":\"START\",\"config\":{\"buttons\":[{\"id\":\"submit\",\"label\":\"提交\",\"action\":\"SUBMIT\",\"style\":\"NEON\"}]} }},{\"id\":\"end\",\"data\":{\"kind\":\"END\"}}]")
                .edgesJson("[{\"source\":\"start\",\"target\":\"end\"}]").build();
        when(definitionRepository.findById(11L)).thenReturn(Optional.of(definition));
        when(versionRepository.findById(21L)).thenReturn(Optional.of(draft));

        assertThatThrownBy(() -> controller.publish(11L, 21L))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("按钮样式");
    }

    @Test
    void rejectsLegacyEnabledButtonWhenSavingDraftGraph() {
        WorkflowDefinition definition = WorkflowDefinition.builder().id(11L).type("FORM_PROCESS").name("按钮草稿").build();
        WorkflowDefinitionVersion draft = WorkflowDefinitionVersion.builder().id(21L).definitionId(11L).versionNumber(1)
                .status("DRAFT").nodesJson("[]").edgesJson("[]").build();
        when(definitionRepository.findById(11L)).thenReturn(Optional.of(definition));
        when(versionRepository.findById(21L)).thenReturn(Optional.of(draft));
        var payload = java.util.Map.<String, Object>of("nodes", List.of(
                java.util.Map.of("id", "start", "data", java.util.Map.of("kind", "START", "config", java.util.Map.of("buttons", List.of(java.util.Map.of("id", "save", "label", "保存", "action", "SAVE", "enabled", true))))),
                java.util.Map.of("id", "end", "data", java.util.Map.of("kind", "END"))), "edges", List.of());

        assertThatThrownBy(() -> controller.saveGraph(11L, 21L, payload))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("流程按钮字段格式不正确");
        verify(versionRepository, times(0)).save(any(WorkflowDefinitionVersion.class));
    }

    @Test
    void allowsBuiltinFillSignFieldEventWhenSavingDraftGraph() {
        WorkflowDefinition definition = WorkflowDefinition.builder().id(11L).type("FORM_PROCESS").name("按钮事件").build();
        WorkflowDefinitionVersion draft = WorkflowDefinitionVersion.builder().id(21L).definitionId(11L)
                .versionNumber(1).status("DRAFT").nodesJson("[]").edgesJson("[]").build();
        when(definitionRepository.findById(11L)).thenReturn(Optional.of(definition));
        when(versionRepository.findById(21L)).thenReturn(Optional.of(draft));
        when(versionRepository.save(any(WorkflowDefinitionVersion.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var payload = java.util.Map.<String, Object>of("nodes", List.of(
                java.util.Map.of("id", "start", "data", java.util.Map.of("kind", "START", "config", java.util.Map.of(
                        "buttonEvents", List.of(java.util.Map.of("id", "event-1", "event", "BEFORE", "action", "SUBMIT",
                                "builtin", "FILL_SIGN_FIELD", "enabled", true))))),
                java.util.Map.of("id", "end", "data", java.util.Map.of("kind", "END"))), "edges", List.of());

        assertThat(controller.saveGraph(11L, 21L, payload).getData().getNodesJson())
                .contains("FILL_SIGN_FIELD");
    }

    @Test
    void allowsReturnSignatureEventWhenSavingDraftGraph() {
        WorkflowDefinition definition = WorkflowDefinition.builder().id(11L).type("FORM_PROCESS").name("退回签名").build();
        WorkflowDefinitionVersion draft = WorkflowDefinitionVersion.builder().id(21L).definitionId(11L)
                .versionNumber(1).status("DRAFT").nodesJson("[]").edgesJson("[]").build();
        when(definitionRepository.findById(11L)).thenReturn(Optional.of(definition));
        when(versionRepository.findById(21L)).thenReturn(Optional.of(draft));
        when(versionRepository.save(any(WorkflowDefinitionVersion.class))).thenAnswer(invocation -> invocation.getArgument(0));
        var payload = java.util.Map.<String, Object>of("nodes", List.of(
                java.util.Map.of("id", "start", "data", java.util.Map.of("kind", "START")),
                java.util.Map.of("id", "approval", "data", java.util.Map.of("kind", "APPROVAL", "config", java.util.Map.of(
                        "approvers", "u1", "buttonEvents", List.of(java.util.Map.of("id", "event-1", "event", "BEFORE", "action", "RETURN", "builtin", "FILL_SIGN_FIELD"))))),
                java.util.Map.of("id", "end", "data", java.util.Map.of("kind", "END"))), "edges", List.of());
        assertThat(controller.saveGraph(11L, 21L, payload).getData().getNodesJson())
                .contains("FILL_SIGN_FIELD");
    }

    @Test
    void allowsLegacyReturnButtonEventWhenSavingDraftGraph() {
        WorkflowDefinition definition = WorkflowDefinition.builder().id(11L).type("FORM_PROCESS").name("退回旧事件").build();
        WorkflowDefinitionVersion draft = WorkflowDefinitionVersion.builder().id(21L).definitionId(11L)
                .versionNumber(1).status("DRAFT").nodesJson("[]").edgesJson("[]").build();
        when(definitionRepository.findById(11L)).thenReturn(Optional.of(definition));
        when(versionRepository.findById(21L)).thenReturn(Optional.of(draft));
        when(versionRepository.save(any(WorkflowDefinitionVersion.class))).thenAnswer(invocation -> invocation.getArgument(0));
        var payload = java.util.Map.<String, Object>of("nodes", List.of(
                java.util.Map.of("id", "start", "data", java.util.Map.of("kind", "START")),
                java.util.Map.of("id", "approval", "data", java.util.Map.of("kind", "APPROVAL", "config", java.util.Map.of(
                        "approvers", "u1", "buttonEvents", List.of(java.util.Map.of("id", "event-1", "event", "BEFORE", "action", "RETURN"))))),
                java.util.Map.of("id", "end", "data", java.util.Map.of("kind", "END"))), "edges", List.of());

        assertThat(controller.saveGraph(11L, 21L, payload).getData().getNodesJson())
                .contains("RETURN");
        verify(versionRepository, times(1)).save(any(WorkflowDefinitionVersion.class));
    }

    @Test
    void rejectsAfterBuiltinSignatureEventWhenSavingDraftGraph() {
        WorkflowDefinition definition = WorkflowDefinition.builder().id(11L).type("FORM_PROCESS").name("执行后签署").build();
        WorkflowDefinitionVersion draft = WorkflowDefinitionVersion.builder().id(21L).definitionId(11L)
                .versionNumber(1).status("DRAFT").nodesJson("[]").edgesJson("[]").build();
        when(definitionRepository.findById(11L)).thenReturn(Optional.of(definition));
        when(versionRepository.findById(21L)).thenReturn(Optional.of(draft));
        var payload = java.util.Map.<String, Object>of("nodes", List.of(
                java.util.Map.of("id", "start", "data", java.util.Map.of("kind", "START", "config", java.util.Map.of(
                        "buttonEvents", List.of(java.util.Map.of("id", "event-1", "event", "AFTER", "action", "SUBMIT",
                                "builtin", "FILL_SIGN_FIELD"))))),
                java.util.Map.of("id", "end", "data", java.util.Map.of("kind", "END"))), "edges", List.of());

        assertThatThrownBy(() -> controller.saveGraph(11L, 21L, payload))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("执行前");
        verify(versionRepository, times(0)).save(any(WorkflowDefinitionVersion.class));
    }

    @Test
    void rejectsUnsupportedBuiltinEventWhenSavingDraftGraph() {
        WorkflowDefinition definition = WorkflowDefinition.builder().id(11L).type("FORM_PROCESS").name("非法事件").build();
        WorkflowDefinitionVersion draft = WorkflowDefinitionVersion.builder().id(21L).definitionId(11L)
                .versionNumber(1).status("DRAFT").nodesJson("[]").edgesJson("[]").build();
        when(definitionRepository.findById(11L)).thenReturn(Optional.of(definition));
        when(versionRepository.findById(21L)).thenReturn(Optional.of(draft));
        var payload = java.util.Map.<String, Object>of("nodes", List.of(
                java.util.Map.of("id", "start", "data", java.util.Map.of("kind", "START", "config", java.util.Map.of(
                        "buttonEvents", List.of(java.util.Map.of("id", "event-1", "event", "BEFORE", "action", "SUBMIT",
                                "builtin", "CUSTOM_HANDLER"))))),
                java.util.Map.of("id", "end", "data", java.util.Map.of("kind", "END"))), "edges", List.of());

        assertThatThrownBy(() -> controller.saveGraph(11L, 21L, payload))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("填充签名字段");
        verify(versionRepository, times(0)).save(any(WorkflowDefinitionVersion.class));
    }

    @Test
    void rejectsHandlerIdOnButtonEventWhenSavingDraftGraph() {
        WorkflowDefinition definition = WorkflowDefinition.builder().id(11L).type("FORM_PROCESS").name("技术字段").build();
        WorkflowDefinitionVersion draft = WorkflowDefinitionVersion.builder().id(21L).definitionId(11L)
                .versionNumber(1).status("DRAFT").nodesJson("[]").edgesJson("[]").build();
        when(definitionRepository.findById(11L)).thenReturn(Optional.of(definition));
        when(versionRepository.findById(21L)).thenReturn(Optional.of(draft));
        var payload = java.util.Map.<String, Object>of("nodes", List.of(
                java.util.Map.of("id", "start", "data", java.util.Map.of("kind", "START", "config", java.util.Map.of(
                        "buttonEvents", List.of(java.util.Map.of("id", "event-1", "event", "BEFORE", "action", "SUBMIT",
                                "builtin", "FILL_SIGN_FIELD", "handlerId", "internal-handler"))))),
                java.util.Map.of("id", "end", "data", java.util.Map.of("kind", "END"))), "edges", List.of());

        assertThatThrownBy(() -> controller.saveGraph(11L, 21L, payload))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("按钮事件字段格式不正确");
        verify(versionRepository, times(0)).save(any(WorkflowDefinitionVersion.class));
    }

    @Test
    void listsWorkVersionsUsingAFormProcess() {
        WorkflowDefinition processDefinition = WorkflowDefinition.builder()
                .id(11L).type("FORM_PROCESS").name("现场填报审批").code("FP-001").build();
        WorkflowDefinition workDefinition = WorkflowDefinition.builder()
                .id(101L).type("WORK").name("批生产作业").code("WORK-001").build();
        WorkflowDefinitionVersion processVersion = WorkflowDefinitionVersion.builder()
                .id(901L).definitionId(11L).versionNumber(3).status("PUBLISHED").isCurrent(true).build();
        WorkflowDefinitionVersion workVersion = WorkflowDefinitionVersion.builder()
                .id(201L).definitionId(101L).versionNumber(5).status("DRAFT").isCurrent(false).build();
        WorkFormProcessReference reference = WorkFormProcessReference.builder()
                .id(301L)
                .workDefinitionId(101L)
                .workVersionId(201L)
                .workNodeId("form-1")
                .workNodeLabel("表单填写")
                .formProcessDefinitionId(11L)
                .formProcessVersionId(901L)
                .formTemplateVersionId(702L)
                .formTemplateName("批记录表 · V2")
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build();
        when(definitionRepository.findById(11L)).thenReturn(Optional.of(processDefinition));
        when(formProcessReferenceService.listUsage(11L)).thenReturn(List.of(reference));
        when(versionRepository.findAllById(any())).thenReturn(List.of(processVersion, workVersion));
        when(definitionRepository.findAllById(any())).thenReturn(List.of(processDefinition, workDefinition));

        var response = controller.usage(11L);

        assertThat(response.getData()).singleElement().satisfies(item -> {
            assertThat(item.referenceId()).isEqualTo(301L);
            assertThat(item.formProcessVersionNumber()).isEqualTo(3);
            assertThat(item.workDefinitionName()).isEqualTo("批生产作业");
            assertThat(item.workVersionNumber()).isEqualTo(5);
            assertThat(item.workVersionStatus()).isEqualTo("DRAFT");
            assertThat(item.workNodeLabel()).isEqualTo("表单填写");
            assertThat(item.formTemplateName()).isEqualTo("批记录表 · V2");
        });
    }

    @Test
    void rejectsDeletingAFormProcessReferencedByWorkFlows() {
        WorkflowDefinition processDefinition = WorkflowDefinition.builder()
                .id(11L).type("FORM_PROCESS").name("现场填报审批").build();
        WorkFormProcessReference reference = WorkFormProcessReference.builder()
                .id(301L)
                .workDefinitionId(101L)
                .workVersionId(201L)
                .workNodeId("form-1")
                .formProcessDefinitionId(11L)
                .formProcessVersionId(901L)
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build();
        when(definitionRepository.findById(11L)).thenReturn(Optional.of(processDefinition));
        when(formProcessReferenceService.listUsage(11L)).thenReturn(List.of(reference));

        assertThatThrownBy(() -> controller.delete(11L))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("已被作业流程引用");
        verify(versionRepository, times(0)).deleteAll(any());
        verify(definitionRepository, times(0)).deleteById(any(Long.class));
    }
}
