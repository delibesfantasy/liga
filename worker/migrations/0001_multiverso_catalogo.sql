-- MULTIVERSO 4.0 FASE 1: catálogo independiente. No modifica tablas actuales.
CREATE TABLE IF NOT EXISTS mv_universes (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL UNIQUE COLLATE NOCASE
);
CREATE TABLE IF NOT EXISTS mv_characters (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 code TEXT UNIQUE,
 name TEXT NOT NULL COLLATE NOCASE,
 universe_id INTEGER NOT NULL REFERENCES mv_universes(id),
 origin TEXT NOT NULL CHECK(origin IN ('known','original')),
 description TEXT NOT NULL DEFAULT '',
 price INTEGER NOT NULL CHECK(price BETWEEN 5 AND 25),
 image_url TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','archived')),
 created_at TEXT NOT NULL DEFAULT (datetime('now')),
 updated_at TEXT NOT NULL DEFAULT (datetime('now')),
 UNIQUE(universe_id,name)
);
CREATE INDEX IF NOT EXISTS idx_mv_characters_status ON mv_characters(status);
CREATE INDEX IF NOT EXISTS idx_mv_characters_universe ON mv_characters(universe_id);
INSERT INTO mv_universes(name) VALUES
 ('Marvel'),('DC Comics'),('Cómic europeo'),('Cómic español y latinoamericano'),('Manga y otros'),
 ('Guardianes del Cosmos'),('Crónicas de Arcadia'),('Ciudad Neón'),('Villa Carcajada'),('Exploradores del Tiempo'),('Defensores de Gaia')
ON CONFLICT(name) DO NOTHING;
