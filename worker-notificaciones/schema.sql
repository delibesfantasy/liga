CREATE TABLE IF NOT EXISTS subscriptions (
 endpoint TEXT PRIMARY KEY,
 user_key TEXT NOT NULL,
 payload TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_key ON subscriptions(user_key);
