package com.zencas.edhr.workflow.service;

import com.zencas.edhr.common.util.SnowflakeIdGenerator;
import com.zencas.edhr.workflow.entity.WorkFormProcessReference;
import com.zencas.edhr.workflow.entity.WorkflowDefinitionVersion;
import com.zencas.edhr.workflow.repository.WorkFormProcessReferenceRepository;
import com.zencas.edhr.workflow.repository.WorkflowDefinitionVersionRepository;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class FormProcessReferenceServiceTest {
    @Mock private WorkFormProcessReferenceRepository referenceRepository;
    @Mock private WorkflowDefinitionVersionRepository versionRepository;
    @Mock private SnowflakeIdGenerator idGenerator;
    @InjectMocks private FormProcessReferenceService service;

    @Test
    void rebuildsProjectionFromCurrentWorkGraph() {
        WorkflowDefinitionVersion workVersion = WorkflowDefinitionVersion.builder()
                .id(201L)
                .definitionId(101L)
                .nodesJson("["
                        + "{\"id\":\"form-1\",\"data\":{\"kind\":\"FORM\",\"label\":\"首件填报\",\"config\":{\"formProcessVersionId\":\"901\",\"formTemplateVersionId\":\"702\",\"formTemplateName\":\"首件表 · V2\"}}},"
                        + "{\"id\":\"notice\",\"data\":{\"kind\":\"NOTIFICATION\",\"label\":\"通知\",\"config\":{}}}"
                        + "]")
                .build();
        WorkflowDefinitionVersion processVersion = WorkflowDefinitionVersion.builder()
                .id(901L)
                .definitionId(902L)
                .build();
        when(versionRepository.findById(901L)).thenReturn(Optional.of(processVersion));
        when(idGenerator.nextId()).thenReturn(301L);
        when(referenceRepository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));

        service.rebuildForWorkVersion(workVersion);

        verify(referenceRepository).deleteByWorkVersionId(201L);
        ArgumentCaptor<List<WorkFormProcessReference>> captor = ArgumentCaptor.forClass(List.class);
        verify(referenceRepository).saveAll(captor.capture());
        assertThat(captor.getValue()).singleElement().satisfies(reference -> {
            assertThat(reference.getId()).isEqualTo(301L);
            assertThat(reference.getWorkDefinitionId()).isEqualTo(101L);
            assertThat(reference.getWorkVersionId()).isEqualTo(201L);
            assertThat(reference.getWorkNodeId()).isEqualTo("form-1");
            assertThat(reference.getWorkNodeLabel()).isEqualTo("首件填报");
            assertThat(reference.getFormProcessDefinitionId()).isEqualTo(902L);
            assertThat(reference.getFormProcessVersionId()).isEqualTo(901L);
            assertThat(reference.getFormTemplateVersionId()).isEqualTo(702L);
            assertThat(reference.getFormTemplateName()).isEqualTo("首件表 · V2");
        });
    }

    @Test
    void removesStaleProjectionBeforeSkippingInvalidDraftReferences() {
        WorkflowDefinitionVersion workVersion = WorkflowDefinitionVersion.builder()
                .id(201L)
                .definitionId(101L)
                .nodesJson("[{\"id\":\"form-1\",\"data\":{\"kind\":\"FORM\",\"config\":{\"formProcessVersionId\":\"missing\"}}}]")
                .build();

        service.rebuildForWorkVersion(workVersion);

        verify(referenceRepository).deleteByWorkVersionId(201L);
        verify(referenceRepository).saveAll(List.of());
    }
}
