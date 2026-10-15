CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  subject TEXT NOT NULL DEFAULT 'Atendimento Rynex' CHECK (length(subject) BETWEEN 1 AND 120),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  discord_thread_id TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS support_tickets_user_updated_idx ON support_tickets(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_status_updated_idx ON support_tickets(status, updated_at ASC);

CREATE TABLE IF NOT EXISTS support_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('customer','admin')),
  sender_label TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '' CHECK (length(body) <= 4000),
  discord_message_id TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS support_messages_ticket_idx ON support_messages(ticket_id, id);
CREATE INDEX IF NOT EXISTS support_messages_pending_discord_idx ON support_messages(sender_role, discord_message_id, id);

CREATE TABLE IF NOT EXISTS support_attachments (
  id TEXT PRIMARY KEY,
  message_id INTEGER NOT NULL REFERENCES support_messages(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 8388608),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS support_attachments_message_idx ON support_attachments(message_id);
