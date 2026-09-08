package com.zencas.edhr.system.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;

@Entity
@Table(name = "system_menu_configuration")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SystemMenuConfiguration {
    @Id private Long id;
    @Column(name = "modules_json", columnDefinition = "jsonb")
    @JdbcTypeCode(SqlTypes.JSON)
    private String modulesJson;
    @Column(name = "created_by") private String createdBy;
    @Column(name = "created_at") private LocalDateTime createdAt;
    @Column(name = "updated_by") private String updatedBy;
    @Column(name = "updated_at") private LocalDateTime updatedAt;

    @PrePersist
    void prePersist() {
        if (createdAt == null) createdAt = LocalDateTime.now();
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
