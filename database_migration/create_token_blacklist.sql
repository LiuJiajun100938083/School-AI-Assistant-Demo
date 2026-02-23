-- Token 黑名单表
-- 用于持久化已撤销的 JWT Token，防止服务重启后已注销 Token 重新生效
-- 2026-02-23

CREATE TABLE IF NOT EXISTS token_blacklist (
    id INT AUTO_INCREMENT PRIMARY KEY,
    jti VARCHAR(36) NOT NULL UNIQUE COMMENT 'JWT Token ID (唯一标识)',
    username VARCHAR(100) DEFAULT '' COMMENT '关联的用户名 (审计用途)',
    revoked_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '撤销时间',
    expires_at DATETIME NOT NULL COMMENT 'Token 原始过期时间 (用于定期清理)',
    INDEX idx_jti (jti),
    INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='JWT Token 撤销黑名单';
