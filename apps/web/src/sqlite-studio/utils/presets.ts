export const PRESETS = {
	vector: {
		name: 'Vector Search',
		sql: `SELECT vec_version();
DROP TABLE IF EXISTS embeddings;
CREATE VIRTUAL TABLE embeddings USING vec0(vector float[4]);
INSERT INTO embeddings(rowid, vector) VALUES 
  (1, '[1.0, 0.0, 0.0, 0.0]'),
  (2, '[0.0, 1.0, 0.0, 0.0]'),
  (3, '[0.9, 0.1, 0.0, 0.0]');
SELECT rowid, distance FROM embeddings 
WHERE vector MATCH '[1.0, 0.0, 0.0, 0.0]' 
ORDER BY distance LIMIT 3;`,
	},
	soundex: {
		name: 'Soundex',
		sql: `SELECT soundex('Robert'), soundex('Rupert');
DROP TABLE IF EXISTS names;
CREATE TABLE names (id INTEGER PRIMARY KEY, name TEXT);
INSERT INTO names VALUES (1,'Robert'),(2,'Rupert'),(3,'Robin');
SELECT a.name, b.name as sounds_like
FROM names a, names b 
WHERE a.id < b.id AND soundex(a.name) = soundex(b.name);`,
	},
	fts: {
		name: 'Full Text Search',
		sql: `-- Snippet example
SELECT 
  d.title,
  snippet(documents_fts, 1, '<b>', '</b>', '...', 10) as snippet,
  rank
FROM documents_fts f
JOIN documents d ON d.id = f.rowid
WHERE documents_fts MATCH 'sqlite'
ORDER BY rank;`,
	},
}
