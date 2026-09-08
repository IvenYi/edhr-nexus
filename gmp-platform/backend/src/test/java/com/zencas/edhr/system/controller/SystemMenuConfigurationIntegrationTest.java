package com.zencas.edhr.system.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.zencas.edhr.common.config.SecurityConfig;
import com.zencas.edhr.common.exception.GlobalExceptionHandler;
import com.zencas.edhr.common.util.SnowflakeIdGenerator;
import com.zencas.edhr.compliance.entity.AuditEvent;
import com.zencas.edhr.compliance.repository.AuditEventRepository;
import com.zencas.edhr.identity.security.JwtAuthenticationFilter;
import com.zencas.edhr.identity.security.JwtTokenProvider;
import com.zencas.edhr.system.entity.SystemMenuConfiguration;
import com.zencas.edhr.system.repository.SystemMenuConfigurationRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import liquibase.Contexts;
import liquibase.LabelExpression;
import liquibase.Liquibase;
import liquibase.database.DatabaseFactory;
import liquibase.database.jvm.JdbcConnection;
import liquibase.resource.ClassLoaderResourceAccessor;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.data.jpa.JpaRepositoriesAutoConfiguration;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.jpa.repository.support.JpaRepositoryFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.orm.jpa.persistenceunit.PersistenceManagedTypes;
import org.springframework.orm.jpa.SharedEntityManagerCreator;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import javax.sql.DataSource;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(classes = SystemMenuConfigurationIntegrationTest.TestConfig.class, properties = {
        "spring.liquibase.enabled=false",
        "spring.datasource.url=${menu.test.url:jdbc:h2:mem:menu-configuration;MODE=PostgreSQL;DB_CLOSE_DELAY=-1}",
        "spring.datasource.driver-class-name=${menu.test.driver:org.h2.Driver}",
        "spring.datasource.username=${menu.test.user:sa}",
        "spring.datasource.password=",
        "spring.jpa.database-platform=${menu.test.dialect:org.hibernate.dialect.H2Dialect}",
        "spring.jpa.properties.hibernate.dialect=${menu.test.dialect:org.hibernate.dialect.H2Dialect}",
        "spring.jpa.hibernate.ddl-auto=update",
        "spring.sql.init.mode=always",
        "spring.sql.init.schema-locations=classpath:db/changelog/0072-global-menu-configuration.sql"
})
@AutoConfigureMockMvc
class SystemMenuConfigurationIntegrationTest {
    private static final String URL = "/api/v1/system/menu-configuration";
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired JwtTokenProvider tokens;
    @Autowired ObjectMapper mapper;
    @Autowired DataSource dataSource;
    @SpyBean AuditEventRepository audits;

    @BeforeEach
    void resetConfiguration() {
        jdbc.update("UPDATE system_menu_configuration SET modules_json = NULL, created_by = NULL, updated_by = NULL WHERE id = 1");
        jdbc.update("DELETE FROM audit_event");
    }

    @Test
    void unconfiguredReadDoesNotInstallSourceProjectMenus() throws Exception {
        mvc.perform(get(URL).header("Authorization", reader()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.configured").value(false))
                .andExpect(jsonPath("$.data.modules").isEmpty());
    }

    @Test
    void savesAndReadsInAnotherAuthenticatedSessionWithImmutableAuditSnapshots() throws Exception {
        save("Storage");
        var initialAudit = audits.findAll().getFirst();
        mvc.perform(get(URL).header("Authorization", reader()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.configured").value(true))
                .andExpect(jsonPath("$.data.modules[0].menus[0].icon").value("Storage"));
        save("asset:123");
        mvc.perform(get(URL).header("Authorization", reader()))
                .andExpect(jsonPath("$.data.modules[0].menus[0].icon").value("asset:123"));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM system_menu_configuration", Integer.class)).isEqualTo(1);
        var records = audits.findAll().stream().sorted(java.util.Comparator.comparing(AuditEvent::getId)).toList();
        assertThat(records).extracting(AuditEvent::getAction).containsExactly("CREATE", "UPDATE");
        assertThat(records).allSatisfy(event -> {
            assertThat(event.getOperatorId()).isEqualTo("admin");
            assertThat(event.getSnapshotHash()).matches("[0-9a-f]{64}");
        });
        assertThat(records.getFirst().getSnapshotHash()).isEqualTo(initialAudit.getSnapshotHash());
        assertThat(records.getFirst().getContentAfter()).isEqualTo(initialAudit.getContentAfter());
        assertThat(mapper.readTree(records.get(1).getContentBefore()).at("/modules/0/menus/0/icon").asText()).isEqualTo("Storage");
        assertThat(mapper.readTree(records.get(1).getContentAfter()).at("/modules/0/menus/0/icon").asText()).isEqualTo("asset:123");
    }

    @Test
    void anonymousCannotReadAndOrdinaryUsersCannotSave() throws Exception {
        mvc.perform(get(URL)).andExpect(status().isUnauthorized());
        mvc.perform(put(URL).contentType("application/json").content(payload("Home")))
                .andExpect(status().isUnauthorized());
        mvc.perform(put(URL).header("Authorization", reader()).contentType("application/json").content(payload("Home")))
                .andExpect(status().isForbidden());
        assertThat(audits.count()).isZero();
    }

    @Test
    void invalidOrDuplicateModulesCannotReplaceStoredConfiguration() throws Exception {
        save("Storage");
        var module = mapper.readTree(payload("Home")).path("modules").get(0);
        var duplicates = mapper.createObjectNode();
        duplicates.putArray("modules").add(module).add(module);
        for (String invalid : List.of("{}", "{\"modules\":[]}", duplicates.toString(), payload("Home").replace("/system/settings", "//outside.example"))) {
            mvc.perform(put(URL).header("Authorization", admin()).contentType("application/json").content(invalid))
                    .andExpect(status().isBadRequest());
        }
        mvc.perform(get(URL).header("Authorization", reader()))
                .andExpect(jsonPath("$.data.modules[0].menus[0].icon").value("Storage"));
        assertThat(audits.count()).isEqualTo(1);
    }

    @Test
    void auditFailureRollsBackConfigurationWrite() throws Exception {
        save("Storage");
        doThrow(new IllegalStateException("test audit failure")).when(audits).save(any(AuditEvent.class));
        mvc.perform(put(URL).header("Authorization", admin()).contentType("application/json").content(payload("Home")))
                .andExpect(status().isInternalServerError());
        mvc.perform(get(URL).header("Authorization", reader()))
                .andExpect(jsonPath("$.data.modules[0].menus[0].icon").value("Storage"));
        assertThat(audits.count()).isEqualTo(1);
    }

    @Test
    void migrationPreventsAdditionalGlobalConfigurationRows() {
        assertThatThrownBy(() -> jdbc.update("INSERT INTO system_menu_configuration (id) VALUES (2)"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void liquibaseMigrationAppliesOnceAndRollsBackInAnIsolatedSchema() throws Exception {
        String schema = "menu_migration_" + java.util.UUID.randomUUID().toString().replace("-", "");
        jdbc.execute("CREATE SCHEMA " + schema);
        try (var connection = dataSource.getConnection()) {
            String originalSchema = connection.getSchema();
            connection.setSchema(connection.getMetaData().getDatabaseProductName().equals("H2") ? schema.toUpperCase(java.util.Locale.ROOT) : schema);
            var database = DatabaseFactory.getInstance().findCorrectDatabaseImplementation(new JdbcConnection(connection));
            database.setDefaultSchemaName(schema);
            database.setLiquibaseSchemaName(schema);
            try (var liquibase = new Liquibase("db/changelog/0072-global-menu-configuration.sql", new ClassLoaderResourceAccessor(), database)) {
                liquibase.update(new Contexts(), new LabelExpression());
                liquibase.update(new Contexts(), new LabelExpression());
                assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM " + schema + ".system_menu_configuration", Integer.class)).isEqualTo(1);
                assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM " + schema + ".databasechangelog", Integer.class)).isEqualTo(1);
                liquibase.rollback(1, new Contexts(), new LabelExpression());
                assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM " + schema + ".databasechangelog", Integer.class)).isZero();
                connection.setSchema(originalSchema);
            }
        } finally {
            jdbc.execute("DROP SCHEMA " + schema + " CASCADE");
        }
    }

    @Test
    void concurrentFirstSavesUseOneRowAndAuditTheActualPreviousValue() throws Exception {
        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> { save("Home"); return true; });
            var second = executor.submit(() -> { save("Storage"); return true; });
            assertThat(first.get(15, TimeUnit.SECONDS)).isTrue();
            assertThat(second.get(15, TimeUnit.SECONDS)).isTrue();
        }
        var records = audits.findAll().stream().sorted(java.util.Comparator.comparing(AuditEvent::getId)).toList();
        assertThat(records).extracting(AuditEvent::getAction).containsExactly("CREATE", "UPDATE");
        assertThat(mapper.readTree(records.get(1).getContentBefore())).isEqualTo(mapper.readTree(records.get(0).getContentAfter()));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM system_menu_configuration", Integer.class)).isEqualTo(1);
    }

    private void save(String icon) throws Exception {
        mvc.perform(put(URL).header("Authorization", admin()).contentType("application/json").content(payload(icon)))
                .andExpect(status().isOk());
    }

    private String payload(String icon) {
        return """
                {"modules":[{"id":"system","label":"系统","icon":"Settings","menus":[
                  {"label":"系统管理","icon":"%s","children":[{"label":"系统设置","path":"/system/settings"}]}]}]}
                """.formatted(icon);
    }

    private String admin() { return "Bearer " + tokens.generateToken("admin", "admin", "管理员", 5, List.of("system.edit")); }
    private String reader() { return "Bearer " + tokens.generateToken("reader", "reader", "普通用户", 5, List.of()); }

    @Configuration(proxyBeanMethods = false)
    @EnableAutoConfiguration(exclude = JpaRepositoriesAutoConfiguration.class)
    @Import({SystemMenuConfigurationController.class, GlobalExceptionHandler.class, SecurityConfig.class, JwtAuthenticationFilter.class})
    static class TestConfig {
        @Bean EntityManager entityManager(EntityManagerFactory factory) {
            return SharedEntityManagerCreator.createSharedEntityManager(factory);
        }
        @Bean PersistenceManagedTypes managedTypes() {
            return PersistenceManagedTypes.of(SystemMenuConfiguration.class.getName(), AuditEvent.class.getName());
        }
        @Bean SystemMenuConfigurationRepository menus(EntityManager em) {
            return new JpaRepositoryFactory(em).getRepository(SystemMenuConfigurationRepository.class);
        }
        @Bean AuditEventRepository audits(EntityManager em) {
            return new JpaRepositoryFactory(em).getRepository(AuditEventRepository.class);
        }
        @Bean SnowflakeIdGenerator ids() { return new SnowflakeIdGenerator(1); }
        @Bean JwtTokenProvider tokens() { return new JwtTokenProvider("menu-integration-test-key-with-at-least-32-characters", 300000); }
    }
}
