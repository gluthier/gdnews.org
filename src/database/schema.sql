CREATE TABLE IF NOT EXISTS posts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    url VARCHAR(2048) NOT NULL,
    source_name VARCHAR(255),
    published_at DATETIME NULL,
    score INT NOT NULL DEFAULT 0,
    reasoning TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_post_url (url),
    INDEX idx_posts_created_at (created_at),
    INDEX idx_posts_published_at (published_at)
);
