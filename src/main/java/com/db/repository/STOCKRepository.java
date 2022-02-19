package com.db.repository;

import com.db.entity.Stock;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

public interface STOCKRepository extends JpaRepository<Stock, String>, JpaSpecificationExecutor<Stock> {

}