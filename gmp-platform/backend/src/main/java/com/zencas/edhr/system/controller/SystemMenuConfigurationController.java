package com.zencas.edhr.system.controller;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zencas.edhr.common.audit.AuditContext;
import com.zencas.edhr.common.dto.ApiResponse;
import com.zencas.edhr.common.exception.BusinessException;
import com.zencas.edhr.common.exception.ErrorCode;
import com.zencas.edhr.common.util.SnowflakeIdGenerator;
import com.zencas.edhr.compliance.entity.AuditEvent;
import com.zencas.edhr.compliance.repository.AuditEventRepository;
import com.zencas.edhr.system.entity.SystemMenuConfiguration;
import com.zencas.edhr.system.repository.SystemMenuConfigurationRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/system/menu-configuration")
@RequiredArgsConstructor
public class SystemMenuConfigurationController {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private final SystemMenuConfigurationRepository repository;
    private final AuditEventRepository auditEventRepository;
    private final SnowflakeIdGenerator idGenerator;

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public ApiResponse<MenuConfigurationResponse> get() {
        var storedConfiguration = repository.findById(1L);
        List<MenuModule> modules = storedConfiguration
                .filter(configuration -> configuration.getModulesJson() != null)
                .map(configuration -> readModules(configuration.getModulesJson()))
                .orElseGet(List::of);
        return ApiResponse.success(new MenuConfigurationResponse(modules, !modules.isEmpty()));
    }

    @PutMapping
    @PreAuthorize("hasAuthority('system.edit')")
    @Transactional
    public ApiResponse<MenuConfigurationResponse> save(@RequestBody MenuConfigurationRequest request) {
        List<MenuModule> modules = normalizeModules(request == null ? null : request.modules());
        SystemMenuConfiguration configuration = repository.findSingletonForUpdate()
                .orElseThrow(() -> new BusinessException(ErrorCode.GENERAL_001, "菜单配置尚未初始化"));
        if (configuration.getModulesJson() == null) configuration.setCreatedBy(AuditContext.getOperatorId());
        List<MenuModule> beforeModules = configuration.getModulesJson() == null ? List.of() : readModules(configuration.getModulesJson());
        configuration.setModulesJson(writeModules(modules));
        configuration.setUpdatedBy(AuditContext.getOperatorId());
        SystemMenuConfiguration saved = repository.save(configuration);
        writeAudit(saved.getId(), beforeModules, modules);
        return ApiResponse.success(new MenuConfigurationResponse(modules, true));
    }

    private List<MenuModule> normalizeModules(List<MenuModule> modules) {
        if (modules == null || modules.isEmpty()) {
            throw new BusinessException(ErrorCode.GENERAL_001, "至少保留一个系统模块");
        }
        var ids = new HashSet<String>();
        for (MenuModule module : modules) {
            String id = requireText(module == null ? null : module.id(), "模块编码不能为空");
            if (!ids.add(id)) throw new BusinessException(ErrorCode.GENERAL_001, "模块编码重复");
        }
        return modules.stream().map(module -> new MenuModule(
                requireText(module == null ? null : module.id(), "模块编码不能为空"),
                requireText(module == null ? null : module.label(), "模块名称不能为空"),
                requireText(module == null ? null : module.icon(), "模块图标不能为空"),
                normalizeMenus(module == null ? null : module.menus())
        )).toList();
    }

    private List<MenuItem> normalizeMenus(List<MenuItem> menus) {
        if (menus == null || menus.isEmpty()) throw new BusinessException(ErrorCode.GENERAL_001, "模块至少保留一个菜单");
        return menus.stream().map(menu -> {
            String label = requireText(menu == null ? null : menu.label(), "一级菜单名称不能为空");
            String icon = trimToNull(menu == null ? null : menu.icon());
            List<MenuChild> children = normalizeChildren(menu == null ? null : menu.children());
            return new MenuItem(label, icon, children.isEmpty() ? requirePath(menu.path()) : null, children);
        }).toList();
    }

    private List<MenuChild> normalizeChildren(List<MenuChild> children) {
        if (children == null) return List.of();
        return children.stream().map(child -> new MenuChild(
                requireText(child == null ? null : child.label(), "二级菜单名称不能为空"),
                requirePath(child == null ? null : child.path())
        )).toList();
    }

    private List<MenuModule> readModules(String modulesJson) {
        try {
            return normalizeModules(OBJECT_MAPPER.readValue(modulesJson, new TypeReference<>() { }));
        } catch (JsonProcessingException e) {
            throw new BusinessException(ErrorCode.GENERAL_001, "菜单配置解析失败");
        }
    }

    private String writeModules(List<MenuModule> modules) {
        try {
            return OBJECT_MAPPER.writeValueAsString(modules);
        } catch (JsonProcessingException e) {
            throw new BusinessException(ErrorCode.GENERAL_001, "菜单配置序列化失败");
        }
    }

    private String writeAuditJson(Map<String, Object> snapshot) {
        try {
            return OBJECT_MAPPER.writeValueAsString(snapshot);
        } catch (JsonProcessingException e) {
            throw new BusinessException(ErrorCode.GENERAL_001, "审计内容序列化失败");
        }
    }

    private void writeAudit(Long configurationId, List<MenuModule> beforeModules, List<MenuModule> afterModules) {
        Map<String, Object> before = new LinkedHashMap<>();
        before.put("modules", beforeModules);
        Map<String, Object> after = new LinkedHashMap<>();
        after.put("modules", afterModules);
        auditEventRepository.save(AuditEvent.builder()
                .id(idGenerator.nextId())
                .tenantId("default")
                .entityType("SYSTEM_MENU_CONFIGURATION")
                .entityId(String.valueOf(configurationId))
                .action(beforeModules.isEmpty() ? "CREATE" : "UPDATE")
                .contentBefore(writeAuditJson(before))
                .contentAfter(writeAuditJson(after))
                .operatorId(AuditContext.getOperatorId())
                .operatorName(AuditContext.getOperatorName())
                .operatorAccount(AuditContext.getOperatorAccount())
                .source(AuditContext.getSource())
                .moduleName("系统")
                .menuName("系统管理")
                .functionName("保存菜单配置")
                .dataSummary("全局菜单配置")
                .ipAddress(AuditContext.getIpAddress())
                .createdAt(LocalDateTime.now())
                .build());
    }

    private String requireText(String value, String message) {
        if (!StringUtils.hasText(value)) throw new BusinessException(ErrorCode.GENERAL_001, message);
        return value.trim();
    }

    private String trimToNull(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    private String requirePath(String value) {
        String path = requireText(value, "菜单路由地址不能为空");
        if (!path.startsWith("/") || path.startsWith("//") || path.contains("\\")) {
            throw new BusinessException(ErrorCode.GENERAL_001, "菜单路由必须是系统内路径");
        }
        return path;
    }

    public record MenuConfigurationRequest(List<MenuModule> modules) { }

    @lombok.Value
    public static class MenuConfigurationResponse {
        List<MenuModule> modules;
        boolean configured;
    }

    public record MenuModule(String id, String label, String icon, List<MenuItem> menus) { }
    public record MenuItem(String label, String icon, String path, List<MenuChild> children) { }
    public record MenuChild(String label, String path) { }
}
