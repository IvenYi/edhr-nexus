package com.zencas.edhr.workflow.repository;

import com.zencas.edhr.workflow.entity.WorkFormProcessReference;
import java.time.LocalDateTime;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Import;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest(properties = {
        "spring.liquibase.enabled=false",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.database-platform=org.hibernate.dialect.H2Dialect",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.url=jdbc:h2:mem:work-form-process-reference;MODE=PostgreSQL;DB_CLOSE_DELAY=-1"
})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(WorkFormProcessReferenceRepositoryTest.JpaConfiguration.class)
class WorkFormProcessReferenceRepositoryTest {
    @Autowired
    private WorkFormProcessReferenceRepository repository;

    @Test
    void deletesExistingProjectionBeforeInsertingTheSameNodeInOnePersistenceCycle() {
        repository.saveAndFlush(reference(301L, 902L));

        repository.deleteByWorkVersionId(201L);
        WorkFormProcessReference replacement = repository.saveAndFlush(reference(302L, 903L));

        assertThat(replacement.getFormProcessVersionId()).isEqualTo(903L);
        assertThat(repository.findByWorkVersionId(201L))
                .singleElement()
                .satisfies(reference -> {
                    assertThat(reference.getId()).isEqualTo(302L);
                    assertThat(reference.getFormProcessVersionId()).isEqualTo(903L);
                });
    }

    private WorkFormProcessReference reference(Long id, Long processVersionId) {
        LocalDateTime now = LocalDateTime.now();
        return WorkFormProcessReference.builder()
                .id(id)
                .workDefinitionId(101L)
                .workVersionId(201L)
                .workNodeId("form-1")
                .workNodeLabel("表单填写")
                .formProcessDefinitionId(401L)
                .formProcessVersionId(processVersionId)
                .createdAt(now)
                .updatedAt(now)
                .build();
    }

    @TestConfiguration(proxyBeanMethods = false)
    @EntityScan(basePackageClasses = WorkFormProcessReference.class)
    @EnableJpaRepositories(basePackageClasses = WorkFormProcessReferenceRepository.class)
    static class JpaConfiguration {
    }
}
