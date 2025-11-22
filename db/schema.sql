CREATE TABLE IF NOT EXISTS links (
  id bigserial PRIMARY KEY,
  code varchar(100) UNIQUE NOT NULL,
  url text NOT NULL,
  created_at timestamptz DEFAULT now(),
  visits bigint DEFAULT 0
);

CREATE TABLE IF NOT EXISTS clicks (
  id bigserial PRIMARY KEY,
  link_id bigint REFERENCES links(id) ON DELETE CASCADE,
  occurred_at timestamptz DEFAULT now(),
  ip varchar(100),
  user_agent text,
  referrer text
);
