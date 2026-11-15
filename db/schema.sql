CREATE TABLE IF NOT EXISTS quotes (
  id         SERIAL PRIMARY KEY,
  text       TEXT NOT NULL,
  author     TEXT NOT NULL,
  note       TEXT NOT NULL DEFAULT '',
  text_key   TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
