package com.zencas.edhr.system.repository;

import com.zencas.edhr.system.entity.SystemMenuConfiguration;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import java.util.Optional;

public interface SystemMenuConfigurationRepository extends JpaRepository<SystemMenuConfiguration, Long> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select configuration from SystemMenuConfiguration configuration where configuration.id = 1")
    Optional<SystemMenuConfiguration> findSingletonForUpdate();
}
