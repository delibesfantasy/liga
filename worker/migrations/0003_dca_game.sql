-- DCA phase 2: isolated schema, never modifies legacy game or existing catalogue.
CREATE TABLE IF NOT EXISTS dca_character_roles (character_id INTEGER PRIMARY KEY REFERENCES mv_characters(id), role TEXT NOT NULL CHECK(role IN ('DEF','CRE','ATA')));
CREATE TABLE IF NOT EXISTS dca_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT OR IGNORE INTO dca_meta(key,value) VALUES ('season','1'),('week','1'),('locked','0');
CREATE TABLE IF NOT EXISTS dca_teams (student_id INTEGER PRIMARY KEY REFERENCES students(id), club_name TEXT NOT NULL, balance INTEGER NOT NULL CHECK(balance>=0), formation TEXT NOT NULL DEFAULT '2-2-2');
CREATE TABLE IF NOT EXISTS dca_roster (student_id INTEGER NOT NULL REFERENCES dca_teams(student_id), character_id INTEGER NOT NULL REFERENCES mv_characters(id), PRIMARY KEY(student_id,character_id));
CREATE TABLE IF NOT EXISTS dca_identities (season INTEGER NOT NULL, student_id INTEGER NOT NULL REFERENCES students(id), character_id INTEGER NOT NULL REFERENCES mv_characters(id), PRIMARY KEY(season,student_id), UNIQUE(season,character_id));
CREATE TABLE IF NOT EXISTS dca_transfers (id INTEGER PRIMARY KEY AUTOINCREMENT, season INTEGER NOT NULL, week INTEGER NOT NULL, student_id INTEGER NOT NULL, sold_id INTEGER NOT NULL, bought_id INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS dca_transfers_week ON dca_transfers(season,week,student_id);
-- Guarantees at most 2 weekly transfers even for concurrent submissions.
CREATE TRIGGER IF NOT EXISTS dca_transfers_max_two BEFORE INSERT ON dca_transfers
WHEN (SELECT COUNT(*) FROM dca_transfers WHERE student_id=NEW.student_id AND season=NEW.season AND week=NEW.week)>=2
BEGIN SELECT RAISE(ABORT,'Límite de dos fichajes por jornada'); END;
