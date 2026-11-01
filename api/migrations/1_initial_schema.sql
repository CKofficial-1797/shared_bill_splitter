CREATE TABLE homes (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  CONSTRAINT homes_name_not_empty CHECK (length(trim(name)) > 0) 
);


CREATE TABLE members (
  id TEXT PRIMARY KEY NOT NULL,
  home_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT members_home_fk
    FOREIGN KEY (home_id) REFERENCES homes(id) ON DELETE CASCADE,
  CONSTRAINT members_name_not_empty CHECK (length(trim(name)) > 0)
);
-- one bill corresponds to one home
CREATE TABLE bills (
  id TEXT PRIMARY KEY NOT NULL,
  home_id TEXT NOT NULL,
  title TEXT NOT NULL,
  total_cents INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT bills_home_fk
    FOREIGN KEY (home_id) REFERENCES homes(id) ON DELETE CASCADE,
  CONSTRAINT bills_title_not_empty CHECK (length(trim(title)) > 0),
  CONSTRAINT bills_total_positive CHECK (total_cents > 0)
);

-- one share corresponds to one member and one bill

CREATE TABLE shares (
  id TEXT PRIMARY KEY NOT NULL,
  bill_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  paid_at TEXT,
  CONSTRAINT shares_bill_fk
    FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE,
  CONSTRAINT shares_member_fk
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  CONSTRAINT shares_amount_nonnegative CHECK (amount_cents >= 0),
  CONSTRAINT shares_bill_member_unique UNIQUE (bill_id, member_id)
);

-- to prevent duplicate payment request , idempotency is needed 
CREATE TABLE payment_idempotency (
  idempotency_key TEXT PRIMARY KEY NOT NULL,
  share_id TEXT NOT NULL,
  paid_at TEXT NOT NULL,
  CONSTRAINT payment_share_fk
    FOREIGN KEY (share_id) REFERENCES shares(id) ON DELETE CASCADE
);

CREATE INDEX members_home_order_idx ON members(home_id, created_at, id);
CREATE INDEX bills_home_idx ON bills(home_id);
CREATE INDEX shares_bill_idx ON shares(bill_id);
CREATE INDEX shares_member_paid_idx ON shares(member_id, paid_at);