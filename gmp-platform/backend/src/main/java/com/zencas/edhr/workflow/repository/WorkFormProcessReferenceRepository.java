package com.zencas.edhr.workflow.repository;

import com.zencas.edhr.workflow.entity.WorkFormProcessReference;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface WorkFormProcessReferenceRepository extends JpaRepository<WorkFormProcessReference, Long> {
    List<WorkFormProcessReference> findByWorkVersionId(Long workVersionId);

    List<WorkFormProcessReference> findByFormProcessDefinitionIdOrderByUpdatedAtDesc(Long formProcessDefinitionId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from WorkFormProcessReference reference where reference.workVersionId = :workVersionId")
    int deleteByWorkVersionId(@Param("workVersionId") Long workVersionId);
}
