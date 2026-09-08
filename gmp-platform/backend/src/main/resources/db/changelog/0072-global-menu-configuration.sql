--liquibase formatted sql

--changeset edhr:0072-global-menu-configuration
CREATE TABLE system_menu_configuration (
    id BIGINT PRIMARY KEY CHECK (id = 1),
    modules_json JSONB,
    created_by VARCHAR(64),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(64),
    updated_at TIMESTAMP
);

-- The singleton exists before the first save so concurrent saves share the same row lock.
-- NULL means no server configuration yet; existing browser menus remain an unsaved draft.
INSERT INTO system_menu_configuration (id) VALUES (1);

--rollback DROP TABLE system_menu_configuration;
